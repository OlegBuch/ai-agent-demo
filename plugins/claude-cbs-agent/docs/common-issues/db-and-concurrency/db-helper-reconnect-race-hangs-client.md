Title: [BUG->FIXED] createDbClient's reconnect() raced under concurrent queries, could hang the shared dbClient forever

Component: proj-test-automation framework - api/utils/helpers/db-helper.ts, createDbClient()
Severity: High while unfixed - not module-specific, hits any spec file whose describe-level
`dbClient` (a single `pg.Client`, not a `Pool`) is queried while a connection blip is in flight.
Status: Fixed 2026-09-04.

Symptom

A live run against `idempotency-regression.spec.ts` (US-01.12.03, adding the new TC-15 test) showed:
- `DeprecationWarning: Calling client.query() when the client is already executing a query is
  deprecated` - the very first line printed.
- `[db-helper] DB client connection error ... ECONNRESET`, then two
  `[db-helper] DB connection was lost - reconnecting transparently...` lines.
- Two `[db-helper] Keepalive ping failed: connect ETIMEDOUT <db-host>:5432` lines.
- Unrelated group-health churn (a dynamic table-group failed readiness and got replaced,
  `[group-health] Group <id> failed to become ready ... provisioning a replacement group`) -
  this part is the framework's existing self-healing working as designed, not the bug.
- After the deferred group cleanup's own log line (`[OK] Delete Table Group (id=...) -> 204`), the
  run produced **no further output and never completed** - user reported "все залагло на последнем
  делите и дальше ничего не происходит."

Root cause

`createDbClient()` wraps a single `pg.Client` in a `Proxy`. Its keepalive `setInterval` fires an
un-awaited `proxy.query('SELECT 1')` on the SAME underlying client as whatever real query a test is
running - hence the `DeprecationWarning`, which is a real signal, not cosmetic. When a genuine
connection blip hits (as it did here - `ECONNRESET`), BOTH the keepalive ping and the real
application query can independently catch a connection error and independently call the unguarded
`reconnect()`:

```ts
const reconnect = async (): Promise<void> => {
  stopKeepalive();
  try { await current.end(); } catch { /* already dead */ }
  current = buildRawClient(configOverrides);
  await current.connect();
  startKeepalive();
};
```

`current` is a single shared `let`. Two overlapping `reconnect()` calls race on it: the second
invocation's `current.end()` can fire *after* the first invocation already reassigned `current` to a
freshly-connected client - ending the client that's supposed to be the live one, or leaving `current`
briefly pointed at a client mid-teardown while another caller's retried `.query()` is issued against
it. A query issued against a client in that state does not throw - it simply never resolves, which
is exactly the observed "hangs after the last log line, then nothing."

The rule (applies beyond this one file)

Any wrapper that transparently reconnects a single shared connection on error MUST serialize
concurrent reconnect attempts behind one in-flight promise that every concurrent caller awaits -
never let each catch-handler independently mutate the shared connection reference. This applies to
any future `db-helper.ts`-style pattern, not just this one instance.

Fix (2026-09-04)

Added an in-flight `reconnecting: Promise<void> | undefined` guard inside `createDbClient()`: the
first caller to hit a connection error performs the actual reconnect and stores the promise; any
concurrent caller that arrives while a reconnect is already in flight just awaits that SAME promise
instead of starting its own. `current` is now only ever mutated by one reconnect at a time.
Statically verified (tsc/eslint/prettier clean). Not yet re-run live against the exact race that
surfaced it (that requires reproducing the same connection blip) - the fix is a straightforward
mutex around a proven race, not a speculative change.

What we did NOT change (scope discipline)

The keepalive timer's own un-awaited `SELECT 1` firing without checking whether a real query is
already in flight is still there - it's what produces the `DeprecationWarning`, and per `pg`, an
overlapping `.query()` call on a single `Client` is deprecated but still queued/functional on its
own (it's the *reconnect* race that actually caused the hang, not the overlap itself). Left as a
known, separate, lower-severity gap rather than bundling an unrelated fix into this one.

2026-09-04 follow-up: second hang, different mechanism, same underlying network instability

A second live run (same session, same DB network instability, `10.0.130.10:5432`) hung again -
total silence for 300+s, then Playwright's own `worker-0 process did not exit within 300000ms after
stop, force-killed it`. This time ZERO db-helper reconnect/keepalive messages appeared at all,
ruling out the race above as the cause of *this* hang. Ruled out via code inspection before
proposing a fix (per systematic-debugging - don't guess twice): confirmed Playwright's
`APIRequestContext` already defaults `timeout` to `30000`ms on every request unless overridden
(`node_modules/playwright-core/types/types.d.ts`, `APIRequest.newContext`'s `timeout` option docs),
and confirmed via grep that no code path in `api/utils/`/`api/system_core/client/` uses a raw
`fetch`/`axios`/`http.request` that would bypass that default - so an HTTP call hanging forever was
not actually possible here, unlike first assumed.

Actual second root cause: `buildRawClient()` (same file) sets `statement_timeout: 15000` (bounds
query *execution* once connected) but never set `connectionTimeoutMillis`, which `pg` defaults to
`0` - no timeout at all. The very first call in the whole spec file's execution
(`dbClient = createDbClient(); await dbClient.connect();`, the file-level `beforeAll`) can hang
forever with zero log output if the TCP handshake to the DB host is silently dropped (no RST, no
ICMP unreachable - consistent with the same flaky network path that produced `ECONNRESET`/`ETIMEDOUT`
in the first incident above). Fixed by adding `connectionTimeoutMillis: 15000` alongside the existing
`statement_timeout: 15000` in `buildRawClient()` - a stuck connection attempt now fails fast with a
clear `pg` timeout error instead of hanging the whole worker until Playwright's external force-kill.
Statically verified clean. Not yet re-run live against the actual network blip that triggers it
(can't force that condition on demand) - the fix closes a confirmed, named gap (default `0` timeout
is a well-documented `pg` footgun), not a speculative change.
