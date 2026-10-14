# TB-2034 — Table Group Health, Readiness-Wait, and Test-Timeout Fixes

**Date/time:** 2026-07-23 16:57 (updated 2026-07-23 18:40) · **Branch:** group-3/TB-2034 (continuation ran on `group-3/TB-2225-Fix`) · **Ticket(s):** TB-2034 (referenced TB-2225 as prior context; continuation session worked directly on TB-2225)

## Discussed

- Follow-up to TB-2225 (global-setup group-reuse/self-heal fix, done in an earlier session): an
  AQA engineer reported tests still failing intermittently on the reused local-dev QA group
  (group 2161), with `BaseApiClient` burning through 80 silent retries (~4 min) on `GET
  .../definitions` before failing, and separately hitting `Timeout waiting for Postgres
  schemas/spaces to be created`.
- Root-caused via direct code reading (no fabrication): `createTableAndWait`
  (`api/system_core/helpers/table-registry-helper.ts`) only polls Postgres for schema existence
  after creating a new table, then does a flat delay — it never confirms via the API that the
  table's backing pod actually recognizes the table. Its sibling `createTablesAndWait` (batch
  variant) already does this correctly (bump `AQA_BOOTSTRAP_EPOCH` + poll `getTableDefinitions`
  for 200) because "the reconciler's checksum only covers the K8s deployment spec, so adding
  tables alone will not trigger a pod restart" (existing comment in that function). Single-table
  creation had no equivalent step — a pre-existing gap, not a TB-2225 regression, but the new
  TB-2225 group-reuse fast path increased how often it's hit (reused/aged pods are less likely to
  spontaneously notice a freshly-created table than a cold-started one).
- Also identified — independently confirmed live by backend dev **Ilya Vatsevich** in Slack —
  that the specific reused group (2161) had accumulated 27+ tables from a full day of repeated
  local debugging; his guidance: a group should carry **no more than 5-10 tables** or it stops
  "keeping up" (`не вывозит`). This matches `db-helper.ts`'s `cleanupTables()`, which
  deliberately no-ops outside CI ("preserve tables for group reuse" — see prior session's
  TB-1525 note), so local runs never prune a reused group's tables.
- User pushed back twice on an over-eager first design: (1) gating group replacement on an
  "is the group alive" bootstrap-table probe produced false negatives — the *old* bootstrap
  table can keep responding fine even when the group can no longer provision a *new* table
  (exactly the overloaded-group case); removed the gate, healing is now unconditional once a
  wait budget is exhausted. (2) Flagged that per-attempt retry/log wording was misleading
  ("No attempts left (1/1)" repeating every ~5s for up to 300s reads as spam/contradictory) —
  traced to `BaseApiClient` logging on every attempt of *any* client, including deliberately
  quiet single-attempt (`retries: 1`) probe clients used by outer polling loops.
- User explicitly requested (after confirming with the backend dev): (a) a reactive mid-run
  group self-heal (detect + replace a dead/overloaded group instead of failing the whole test),
  and (b) a proactive guard so an overloaded group is never handed to tests in the first place.
  Also explicitly requested raising test timeouts project-wide once it became clear the heal
  path itself can add several more minutes than the old budgets assumed, then asked to
  consolidate all the resulting duplicate per-file timeout overrides down to one place.

### Continuation (2026-07-23, later same day) — orchestrator review + follow-on fixes

- Ran a 4-round orchestrator review (`/team:orchestrator fullstack-aqa-agent, aqa-lead`)
  evaluating whether the TB-2225 self-heal/pod-readiness design above was the best solution.
  Both agents independently converged on a **block-merge** verdict, citing three concrete,
  code-confirmed bugs: a naming mismatch silently defeating replacement-group reuse; an
  unawaited cleanup racing a concurrent retry's own schema recreation; and per-test hardcoded
  `toPass` timeouts never audited against the new self-heal latency budget.
- Live evidence surfaced mid-review: `TC-03` in `customization-regression.spec.ts` failed with
  `Timeout 350000ms exceeded` inside its `toPass({timeout:350000})` wrapper — direct, real-world
  confirmation of the reviewers' predicted risk, not just a theoretical concern.
- User pushed back on exposing `resolveActiveGroupId(...)` as an explicit call at usage sites
  ("люди могут не понять когда его использовать и зачем") — redesigned so resolution happens
  transparently inside the API client (`TableRegistryApiClient.createTable`/`updateTable`)
  instead, so no spec-file author ever needs to know the mechanism exists.
- User supplied a domain fact that reframed the TC-03 root cause: a newly created table normally
  needs ~150s to become visible via its pod's `/definitions` endpoint **without** any forced pod
  restart (confirmed via `AskUserQuestion`). This meant `waitForTableApiReady` was forcing a
  disruptive restart on essentially every table creation, not just genuine failures.
- A second live failure (pasted by the user) surfaced a separate, second-order bug: `error:
  terminating connection due to idle-session timeout` from `pg-protocol`, crashing TC-03 —
  traced to `pg.Client`'s `'error'` event having no listener anywhere in the codebase, so a
  server-initiated idle-connection teardown (after the self-heal ordeal left a spec file's
  shared `dbClient` idle for ~9 minutes) became an uncaught exception misattributed to whatever
  test happened to be running.
- User asked to strip all explanatory comments added this session down to a single one-line doc
  comment per genuinely new function/method — done as a final pass.
- Final live confirmation: after all fixes, the user ran TC-03 directly and it passed in 2.6
  minutes — log showed the redirect (`Group 2212 was healed earlier this run — redirecting...`)
  firing transparently via the API client, with no re-discovery of the already-known-dead group.

## Implemented

All changes verified after each step with `npx tsc --noEmit` and `npx eslint <files>
--max-warnings=0` (both clean at every checkpoint; final full-repo check also clean).

- **`api/system_core/helpers/table-registry-helper.ts`**
  - Added `waitForTableApiReady()` — after `createTableAndWait`'s existing DB-schema poll
    succeeds, confirms via a single-attempt probe client that the table's pod actually serves
    `GET .../definitions` with 200; if not, bumps `AQA_BOOTSTRAP_EPOCH` for the group and polls
    (default 300s) before giving up. Uses a small `getClientInternals`
    (`client as unknown as {request, authHeader}`) cast to build the probe client — same
    pattern already used in `auto-id-helper.ts`.
  - Added group self-heal: `isGroupAlive` (bootstrap-table probe, diagnostic-only, does **not**
    gate healing), `provisionReplacementGroup` (creates a new group, waits for it via
    `global-setup.ts`'s exported `ensureBootstrapTableReady`/`COLD_START_WAIT_MS`),
    `persistHealedGroupId` (writes `process.env.DYNAMIC_GROUP_ID` +
    `test-results/dynamic-group-id.txt`, mirroring `global-setup.ts`), and `healGroupIfDead`.
- **`api/utils/global-setup.ts`**
  - Exported `ensureBootstrapTableReady` and `COLD_START_WAIT_MS` (previously private) so
    `table-registry-helper.ts` can reuse the proven pod-warmup logic instead of duplicating it.
  - `waitForTableReady` now builds its own single-attempt probe client (same
    `getClientInternals` pattern) instead of trusting the passed-in client's own retry config —
    fixes both log spam and a real latent bug where one internally-retrying inner call could
    silently consume most of the outer loop's `maxWaitMs` budget before it got to iterate again.
  - Added a proactive guard in the local-dev group-reuse fast path: new
    `countTablesInGroup()` (added to `db-helper.ts`) checks the candidate group's table count
    before reuse; if it exceeds `TEST_CONSTS.MAX_REUSABLE_GROUP_TABLE_COUNT` (10, new constant in
    `constants-keeper.ts`, citing the backend team's 5-10 guidance), the group is **not** reused —
    it's cleaned up in the background (`cleanupGroupById`, fire-and-forget) and setup falls
    through to provisioning a brand-new group instead.
- **`api/utils/base-api-client.ts`**
  - Fixed `requestWithRetry`'s log/wait to reflect reality: the "Retrying.../No attempts left"
    warning is now only printed when `retries > 1` (a single-attempt probe client logs nothing —
    the caller's own loop is responsible for any progress logging); the trailing `delay()` after
    the *last* attempt is skipped (previously always ran, wasting `delayMs` before returning/
    throwing regardless of whether another attempt would follow).
- **Heartbeat logging** added to both `waitForTableApiReady`
  (`table-registry-helper.ts`) and `waitForTableReady` (`global-setup.ts`): one `console.log`
  every ~30s with elapsed/total time, replacing what would otherwise be total silence (after the
  `BaseApiClient` log suppression above) during long waits.
- **`api/utils/db-helper.ts`** — added `countTablesInGroup(groupId)`.
- **`api/utils/constants-keeper.ts`** — added `TEST_CONSTS.MAX_REUSABLE_GROUP_TABLE_COUNT: 10`;
  removed `SYSTEM_PARAMETRIZATION_CONSTS.REGRESSION_TIMEOUT_MS` (see timeout consolidation below).
- **Test timeout consolidation** (`playwright.config.ts` + 9 spec files): raised the `API-tests`
  project's default `timeout` from 600000 to **900000** (15 min) — the group-heal path alone can
  add up to another ~450s (replacement group bootstrap wait) on top of the pre-existing ~330-630s
  single-table budget, and the old default no longer left headroom for that recovery to finish
  before Playwright killed the test. Then, per explicit user request, **removed** the now-fully-
  redundant per-file `test.describe.configure({ timeout: ... })` overrides in
  `customization-integration.spec.ts`, `customization-regression.spec.ts`,
  `customization-smoke.spec.ts`, `idempotency-smoke.spec.ts`, `ddd-regression.spec.ts` (two
  occurrences), `table-registry-smoke.spec.ts`, `table-registry-regression.spec.ts`, and the
  `SYSTEM_PARAMETRIZATION.REGRESSION_TIMEOUT_MS`-based override in
  `system-param-regression.spec.ts` (constant removed too, since that was its only use) — the
  project-level `900000` default is now the single source of truth for API-test timeouts.
- **Verification**: live-tested against the real environment across many iterations this
  session (not just lint/type-check) — confirmed the readiness-wait fix triggering and
  succeeding, confirmed the group-heal path triggering (bump epoch → 503s during pod
  teardown/restart → recognized) and successfully replacing an overloaded group, confirmed the
  proactive table-count guard's reasoning against a real 27-table group, and confirmed a final
  clean full-suite-representative run (`TC-06` in `customization-regression.spec.ts`) passing in
  3.5 min with quiet, informative logs (no spam) and no code-path failures — remaining noise in
  that run (`503`/`400`/an "Invalid max page size configuration: 0" `500`) was an unrelated
  transient backend blip that self-resolved via the existing default 80-retry mechanism.

### Continuation — orchestrator review findings fixed + two new live-failure root causes

- **`api/utils/group-helper.ts`** — added a durable, cross-process "dead group → healed
  replacement" redirect registry: `resolveActiveGroupId()` (follows a heal chain via one file
  per dead group ID under `test-results/.group-heal-map/`, atomic `rename()` write),
  `recordGroupHeal()`, `tryAcquireHealLock()`/`releaseHealLock()` (mkdir-based cross-process
  mutex with stale-lock reclaim after `HEAL_LOCK_STALE_MS`), and `claimEpochBump()` (a separate,
  looser per-group throttle under `test-results/.group-epoch-bumps/` so concurrent table
  creations against the same group don't each trigger their own pod redeploy).
- **`api/system_core/helpers/table-registry-helper.ts`**
  - Rewrote `healGroupIfDead` — fixed a bug found during the review: the old cooldown
    (`lastGroupHealCheck`) was a single global slot AND got overwritten with the *new* group ID
    after a successful heal (not the dead one), so it never actually suppressed re-healing the
    same dead group. Replaced with the persisted redirect registry above, keyed per-dead-group-ID
    in an in-flight `Map` (was a single global `inFlightGroupHeal` slot before — a second,
    unrelated dead group could have incorrectly awaited/returned the first group's replacement),
    plus the cross-process lock so only one worker provisions a replacement at a time.
  - Fixed the `AQA_HEAL_GROUP_*` naming bug (didn't match `findExistingQaGroup`'s recognized
    prefixes in `global-setup.ts`, so replacement groups were invisible to local-dev reuse) —
    renamed to `AQA_GROUP_HEAL_*`.
  - Deferred the CI cleanup of a replaced dead group by `GROUP_HEAL_CLEANUP_GRACE_MS` (60s) to
    narrow (not fully eliminate) the race between the unawaited cleanup and a concurrent retry
    recreating the same table's schema.
  - Root-caused and fixed the actual TC-03 crash mechanism: `waitForTableApiReady` previously
    forced an `AQA_BOOTSTRAP_EPOCH` bump on the very first failed readiness check (i.e., on
    essentially every table creation); now waits passively for
    `NATURAL_TABLE_PROPAGATION_WAIT_MS` (150s, per the user-confirmed normal propagation time)
    before escalating, and escalation goes through `claimEpochBump` so two tables created
    concurrently against the same group (e.g. via `Promise.all`) don't race each other with
    overlapping forced restarts — this raced-restart was what caused one of TC-03's two tables to
    never stabilize in the original failure log.
  - `createTableAndWait`/`createTablesAndWait` resolve `payload.group.id` fresh at entry (later
    superseded as the primary mechanism by the client-level fix below, kept as defense in depth
    since these functions also need the resolved value for their own subsequent logic).
- **`api/system_core/client/table-registry-api-client.ts`** — added `withActiveGroupId()`,
  applied inside `createTable()`/`updateTable()`: every group-touching request transparently
  redirects a stale/healed group ID before it goes out. This is now the single chokepoint — no
  spec file or helper needs to call `resolveActiveGroupId` explicitly for the create/update path.
- **`api/utils/db-helper.ts`** — `createDbClient()` now attaches `client.on('error', ...)` to
  every `pg.Client` it creates, logging (not crashing on) a server-initiated disconnect — fixes
  the idle-session-timeout crash misattribution described above.
- Reverted/removed inline `resolveActiveGroupId(...)` calls from
  `customization-regression.spec.ts`/`customization-smoke.spec.ts` test bodies once the
  client-level fix made them unnecessary; kept the (still-needed, since they don't go through the
  client's create/update) explicit resolves inside `validation-engine-helper.ts`'s
  `ensureVeTable` (table name is derived from the group ID, so it must resolve for naming
  consistency, not just for the request) and `projection-helper.ts`'s `createTable` (posts via a
  raw `apiContext.post`, not through `TableRegistryApiClient`).
- Final pass: stripped all explanatory/rationale comments added this continuation per user
  request, down to a single one-line doc comment on each genuinely new function
  (`resolveActiveGroupId`, `recordGroupHeal`, `tryAcquireHealLock`, `releaseHealLock`,
  `claimEpochBump`, `acquireHealLockWithWait`, `withActiveGroupId`); left pre-existing comments in
  modified-but-not-new functions untouched.
- Verification: `npx tsc --noEmit` and `npx eslint` clean after every step; a standalone
  throwaway script (`scripts/_verify-group-heal-tmp.ts`, deleted after use) exercised
  `resolveActiveGroupId`/`recordGroupHeal`/lock-exclusivity logic in isolation (9/9 checks
  passed) since the repo has no unit-test runner. Live-verified via a real user-run test: TC-03
  passed in 2.6 min, log confirmed the transparent redirect firing (`Group 2212 was healed
  earlier this run — redirecting table ... to group 2217`).

## Learned

- **`createTableAndWait` vs `createTablesAndWait` asymmetry is real and pre-existing**: only the
  batch variant ever confirmed API-level pod readiness after registering a table; the singular
  variant (used at ~121 call sites project-wide) trusted "DB schema exists" as sufficient, which
  is false whenever the pod itself hasn't been restarted/informed. Any future helper that
  registers a table should route through (or mirror) `waitForTableApiReady`, not assume DB-schema
  presence implies pod readiness.
- **A working "is it alive" probe is not the same signal as "can it provision something new."**
  An already-warm/cached resource (the group's own long-lived bootstrap table) can keep
  responding fine while the group is nonetheless unable to onboard a *new* table (overloaded with
  accumulated schemas, reconciler/Liquibase backlog). Don't gate a recovery action on a liveness
  check that only exercises the old, already-working path — gate it on whether the *actual failing
  operation*, after its own full wait budget, ever succeeded.
- **Nested-retry is a recurring architectural footgun in this codebase.** Any polling loop that
  calls through a `TableRegistryApiClient`/`BaseApiClient` method without an explicit low-retry
  override inherits that client's own retry loop (default 80×3000ms = up to 240s) *inside* what
  looks like a single "quick check" — this silently blows up both the outer loop's intended
  cadence and its stated timeout budget, and was the direct cause of most of this session's "why
  is this taking so long / spamming so much" confusion. `test-polling-helper.ts`'s
  `waitForTableField` has the same latent shape (default-retries client used inside its own
  10s-budget loop) — **not fixed this session**, flagged as a candidate for the same treatment if
  it ever surfaces similarly.
- **Backend-confirmed operational constraint**: a Table Registry group should carry no more than
  ~5-10 tables to remain reliable (source: Ilya Vatsevich, backend team, verbal/Slack
  confirmation this session — not yet written into any `docs/frame-specs/` or
  `docs/project-spec/` doc). This is a durable fact worth formalizing in
  `docs/frame-specs/infrastructure.md` or similar rather than leaving it only in this log —
  flagged as an open item below.
- **`cleanupTables()` no-ops outside CI by design** (confirmed again, first noted in the TB-1525
  session) — local dev groups only ever grow, never shrink, until manually cleaned or until the
  new proactive table-count guard forces a fresh group. This is *why* group 2161 accumulated 27+
  tables over a single day of iterative debugging.
- **An adversarial multi-agent review caught real bugs the original implementation and its own
  author missed** — the naming mismatch, the cleanup/retry race, and the broken cooldown key were
  all found via a 4-round orchestrator debate (independent proposals → peer review → author
  response → final decision), not via manual re-reading. Worth running this kind of review on any
  future infra-adjacent self-heal/recovery logic before considering it merge-ready.
- **"Not instantly ready" and "needs a forced restart" are different things, and conflating them
  was the actual root cause of the group-churn/race symptoms** — a domain fact from the user
  (pods naturally pick up new tables within ~150s with no restart) reframed what looked like an
  infra reliability problem into a self-inflicted one: the code was forcing disruptive restarts
  on the normal path, not just on genuine failures.
- **`pg.Client` instances must have an `.on('error', ...)` listener** anywhere they're created in
  this codebase (idiomatic node-postgres requirement) — a long-lived client (any spec file's
  shared `dbClient`, opened once in `beforeAll`) can now legitimately sit idle for many minutes
  given self-heal's latency, and a bare `Client` with no error listener converts a server-side
  idle-timeout disconnect into an uncaught exception that crashes an unrelated, currently-running
  test.
- **Group-ID propagation must be resolved at the point of use, not fixed once at setup** — any
  fixture/variable capturing a group ID once (`workerGroupId`, `customizationGroupId`) goes stale
  the moment that group is healed mid-run; the fix belongs behind the lowest common chokepoint
  (the API client), not sprinkled as explicit calls across test files — confirmed by the user's
  own pushback when the first version of this fix required exactly that.

## Open Items / Follow-ups

- ~~Propagate a healed group ID to sibling `createTableAndWait` call sites~~ — **Resolved this
  continuation**: fixed via the cross-process redirect registry (`group-helper.ts`), resolved
  automatically inside `TableRegistryApiClient.createTable`/`updateTable` rather than by touching
  each of the ~16 call sites individually.
- New: the broader pattern of one long-lived `dbClient` per spec file (opened once in
  `beforeAll`, used across every test + `afterEach`) remains structurally fragile against long
  self-heal waits, even with the new `.on('error')` guard (which prevents the crash but doesn't
  make the connection usable again afterward). Flagged, not implemented — would mean moving
  ~15 spec files to short-lived, per-use connections matching the pattern `createTableAndWait`
  already uses internally.
- `test-polling-helper.ts`'s `waitForTableField` nested-retry shape — still not touched.
- Backend's "≤5-10 tables per group" constraint — still not written into
  `docs/frame-specs/infrastructure.md`; still only recorded in chat history.
- `createTablesAndWait` (the pre-existing batch variant) still forces its epoch bump
  unconditionally in "Phase 2" without the same natural-wait/throttle treatment given to
  `waitForTableApiReady` — not in scope this continuation since it wasn't implicated in the
  reported failure, but the same class of fix would apply if it ever is.
- Branch note: this continuation ran on `group-3/TB-2225-Fix` (the actual current repo branch),
  continuing work originally logged under this file's `group-3/TB-2034` header — the two appear
  to be the same underlying feature/ticket lineage; not reconciled here, just noted for whoever
  reads this next.
- Session ended on a clean, passing verification run (`TC-03`, 2.6 min, real user-run log
  confirming the redirect firing); user had not yet run `/create-pr` for this branch's changes as
  of this update.

## References

None (no Jira/Allure/Confluence/PR fetched via MCP either the original session or this
continuation — all diagnosis was done by reading the actual repo code and live terminal output
the user pasted; backend confirmation came from a pasted Slack conversation with Ilya Vatsevich,
not a linked ticket).
