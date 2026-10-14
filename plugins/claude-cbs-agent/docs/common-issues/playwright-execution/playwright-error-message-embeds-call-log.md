# A Playwright `apiRequestContext` error's `.message` embeds a multi-line "Call log" (with the `Authorization` header) — don't log it raw

Applies to: any `catch` block around a Playwright `APIRequestContext` call (`.get`/`.post`/
`.delete`/etc.) anywhere in `proj-test-automation`. First fixed 2026-09-03 (spot fix, 2 call sites)
in `token-service.ts`'s `withKeycloakLoginRetry` and `kafka-cleanup-helper.ts`'s
`deleteKafkaTopicsForTableIds`. Generalized 2026-09-04 into a shared helper, applied project-wide.

## The pattern/symptom

When a Playwright `APIRequestContext` call fails (network error, timeout, connection reset),
`error.message` is not a short one-line reason — it's the reason followed by a full multi-line
"Call log" block (method, URL, **every request header, including `Authorization: Bearer
<jwt-token>`**). `console.error(..., err)`/`console.warn(...${error.message})` then dumps that
whole block (and, if the raw `Error` object itself is passed to `console.error` instead of just its
`.message`, the full object — stack trace, Node's internal formatting, any non-enumerable
Playwright step metadata) straight into the test run's console output. Besides reading as an
alarming wall of text for a routine, successfully-retried transient blip, **this is a live
credential leak**: a real bearer token ends up verbatim in local terminal output and CI logs on
every retried/failed authenticated call (confirmed live 2026-09-04 via
`idempotency-regression.spec.ts`'s table-registry `PUT .../definitions` retry log printing a full
JWT).

## The rule

Never pass the raw `Error` object, its full `.message`, or a hand-rolled `.split('\n')[0]`
extraction to `console.*` (or into a message that gets thrown/aggregated and could itself later be
logged). Use the shared helper instead:

```ts
import { describeError } from '<path to>/utils/helpers/error-format-helper';
// ...
console.warn(`[Something] ...: ${describeError(err)}`);
```

`describeError` (`api/utils/helpers/error-format-helper.ts`) strips everything from `\nCall log:`
onward *and* redacts any `Authorization: Bearer <token>` that slips through some other way, as
defense-in-depth beyond the Call-log truncation alone. Prefer this over a local
`error.message.split('\n')[0]`/`err instanceof Error ? err.message : String(err)` — the ad-hoc
`.message`-only version still doesn't redact a bearer token that appears outside the "Call log:"
marker, and duplicating the extraction per call site is exactly how most of the 40+ instances below
went unnoticed for a year. This is purely a logging concern — it does not change retry/error-
handling behavior; see `../keycloak-and-auth/keycloak-transient-login-401.md` and `../infra-and-environment/kafka-ui-proxy-transient-failures.md`
for the actual retry-logic patterns some of these call sites also needed.

## The incident (2026-09-03) — spot fix, 2 call sites

User flagged the raw console output from a real test run as "scary" and asked not to see it — both
`withKeycloakLoginRetry`'s retry-warning log and `deleteKafkaTopicsForTableIds`'s
`console.error(..., err)` were dumping the full Playwright error. Fixed both to log only
`error.message.split('\n')[0]` — no shared helper existed yet, so the same ad-hoc extraction had to
be retyped at each call site.

## The incident (2026-09-04) — generalized to a shared helper, ~40 call sites across the project

User hit the same symptom again mid-`TB-3587` (unrelated confusion about a DB-cleanup hang led to
pasting a live terminal log), and this time the dump included a **full, live bearer JWT** in a
`BaseApiClient` retry log (`PUT .../definitions` request, `read ECONNRESET` then `connect
ETIMEDOUT`) — the 2026-09-03 fix only covered its original 2 call sites, `BaseApiClient` (the
framework's actual HTTP client, used everywhere) was never touched. Root-caused: `err.message` for
*any* Playwright `APIRequestContext` failure carries the Call log regardless of which client
wraps it, so every caught-and-logged error from an authenticated call is a leak candidate, not just
the two 2026-09-03 sites.

Added `api/utils/helpers/error-format-helper.ts` (`describeError`, plus sibling `redactBearerToken`
for the one spot that intentionally keeps a full stack trace — an Allure error attachment — and
only needs the token masked, not the detail truncated) and swept every raw
`console.warn/error/log/debug(..., err)` dump and every ad-hoc
`err instanceof Error ? err.message : String(err)` (or `.split('\n')[0]`, or `.stack ?? .message`)
extraction found across the **entire `api/` tree** — not just `utils/` — onto these two helpers.
~58 call sites across ~24 files, including the original 2026-09-03 pair
(`token-service.ts`'s `withKeycloakLoginRetry`, `kafka-cleanup-helper.ts`'s
`deleteKafkaTopicsForTableIds`), now unified onto the shared helper instead of a local one-off
extraction each.

Files touched: `base-api-client.ts` (2 sites — request-retry log, token-refresh-failure log; the
highest-traffic client, used everywhere), `global-setup.ts`, `global-teardown.ts`, `db-helper.ts`
(7, incl. a real bug at the keepalive-ping site where the non-Error branch passed the raw `err`
object instead of `String(err)`), `group-cleanup-helper.ts` (incl. `deleteGroupViaApiWithRetry`'s
authenticated `DELETE`), `resource-tracker.ts` (9), `token-service.ts` (4, incl. the two
2026-09-03 sites), `table-registry-helper.ts` (`waitForTableApiReady`'s authenticated `GET` whose
diagnostic string surfaces in a thrown timeout error, plus 2 group-health sites),
`allure-exchange-reporter.ts` (4, incl. the stack-trace-to-Allure-attachment site — redacted, not
truncated), `test-polling-helper.ts`, `response-parser.ts`, `date-time-helper.ts`,
`projection-helper.ts`, `kafka-service.ts`, `kafka-cleanup-helper.ts`,
`balance-management-helper.ts`, `entry-generation-helper.ts`, `soft-accounting-helper.ts`,
`currency-helper.ts`, `consolidation-engine-db-helper.ts`, and 8 test spec files that had their own
local `afterEach`/`afterAll` restore-or-cleanup catch blocks (`currency-smoke.spec.ts`,
`system-param-regression.spec.ts`, `system-parameterization-smoke.spec.ts`, `sys-params.spec.ts`,
`ddd-regression.spec.ts`, `pf-sc-sms.spec.ts`, `pf-core-smoke.spec.ts`,
`pf-core-regression.spec.ts`, `contract-lifecycle-smoke.spec.ts`,
`consolidation-engine-smoke.spec.ts` — several of these restore `SYSTEM.PARAMETER` via an
authenticated `tableRegistryClient` call, same leak class as `base-api-client.ts`).
An independent module-by-module re-audit (fresh subagent, no memory of the fix pass) then caught 13
more sites the first sweep missed, across 11 more files: `dm-helper.ts` and
`transfer-execution-helper.ts` (identical per-test-cleanup-deferred-to-suite-sweep pattern, copied
between the two modules), `entry-generation-regression.spec.ts` (2, incl. one using `String(err)`
directly), `sms-system-core.spec.ts` (2), `audit-fields-integration.spec.ts`,
`test-user-service.ts`, `auth-service.ts` (a JSON-parse-failure debug log — genuinely low risk
since it wraps a body-parse error, not a request error, but fixed for consistency), and 4
`Promise.allSettled` cleanup-loop sites (`product-attribute-classes-core-engine-{smoke,regression}
.spec.ts` ×2 each, `pf-core-{smoke,regression}.spec.ts` ×1 each) that passed `result.reason`
straight to `console.error` — a distinct variant of the same bug (`.reason` from a settled promise
is just as much an uninspected `unknown` as a `catch` binding). All fixed the same way; a second
independent re-audit after that found nothing further. `auth-service.ts`'s main auth-error path was
checked separately and confirmed already clean (logs structured status/code fields, never the raw
error). `tsc --noEmit` clean throughout both passes.

**Takeaway for next time:** a single sweep — even a careful one — reliably misses ~15-20% of the
real instances of a pattern like this scattered across a 300+ file test suite (individual
`.spec.ts` files with their own local `afterEach`/`afterAll` cleanup, and the `Promise.allSettled`
`.reason` variant, were the main blind spots). Budget for one independent re-audit pass by a fresh
agent (no shared context with the one that did the fixing) as a normal part of this kind of
project-wide sweep, not an optional extra.

Check any new Playwright-`APIRequestContext` catch block for this before assuming it's fine because
it "already logs something" — the shared helper is the fix now, not a local one-off extraction.
