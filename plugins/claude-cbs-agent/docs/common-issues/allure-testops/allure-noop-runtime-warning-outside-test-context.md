# "no test runtime is found" — benign Allure warning when a `BaseApiClient` call runs outside a test

## The pattern/symptom

A log line `no test runtime is found. Please check test framework configuration` appears during
`global-teardown` (or `global-setup`, or any script invoked outside an active `test()` block),
immediately around a call that goes through `BaseApiClient` (any client extending it —
`KeycloakAdminApiClient`, `TableRegistryApiClient`, etc.). The operation itself still completes
successfully right after the warning — no exception, no failed cleanup.

## The rule

`BaseApiClient`'s HTTP verb methods (`post`/`get`/`delete`/`put`/`patch`) are all wrapped in
`withAllureAttachment` (`api/utils/helpers/allure-exchange-reporter.ts`), which calls into
`allure-js-commons`'s runtime to attach the request/response to the currently-running Allure test.
When no Playwright test is actually running (a `global-setup.ts`/`global-teardown.ts` script, or
any other code path invoked outside `test()`), Allure's SDK has no "current test" to attach to and
falls back to `NoopTestRuntime` — which prints this exact warning and then no-ops, by design. It is
not a Keycloak/DB/network error and does not indicate the underlying operation failed.

**Predict**: any *new* code path that calls a `BaseApiClient`-derived client from outside a test
(a teardown sweep, a setup script, a standalone maintenance script) will print this warning the
first time it runs, even though nothing is broken. Don't chase it as a regression — check whether
the actual operation (the line logged immediately after) succeeded before assuming a bug.

If the noise itself is undesirable, the affected client instance can be constructed with
`attachToAllure: false` to suppress Allure attachment entirely for that call site — a cosmetic
choice, not a correctness fix.

**Diagnostic shortcut**: the warning count tells you how many HTTP calls ran unguarded — each call
through `withAllureAttachment` prints it twice (once for the request attach, once for the
response attach) unless the call throws before a response comes back. Seeing exactly 6 warnings
around `createSuperAdminTestUser`/`createTestUser` means 3 unguarded HTTP calls (Keycloak
`createUser`, `UserGroupApiClient` group creation, `UserProfileApiClient` profile INPUT); exactly
4 around `deleteSuperAdminTestUser`/`deleteTestUser` means 2 (`TableRegistryApiClient` group-record
DELETE, Keycloak `deleteUser`). Match the count to the call sites before assuming something new
started calling a client outside a test.

**2026-09-04 fix, branch `group-3/TB-3587`**: `attachToAllure` is now threaded end-to-end —
`CreateTestUserOptions.attachToAllure` → `createTestUser`/`deleteTestUser` → `createKeycloakUser`/
`deleteKeycloakUser` → `KeycloakAdminApiClient`'s 3rd constructor arg, plus the `UserGroupApiClient`/
`UserProfileApiClient`/`TableRegistryApiClient` instances built inside those two functions.
`createSuperAdminTestUser`/`deleteSuperAdminTestUser` now hard-code `attachToAllure: false`.

**Correction, 2026-09-18:** this file previously said these two are called exclusively from
`global-setup.ts`/`global-teardown.ts` — that's now confirmed stale/wrong. Their only actual call
site is `api/utils/fixtures/api-fixtures.ts`'s `workerSuperAdmin` fixture (`{ scope: 'worker', auto:
true }`), not `global-setup.ts`/`global-teardown.ts` directly (grepped project-wide: zero other
call sites). The conclusion ("no test/worker context ever exists there, so Allure attachment was
always going to no-op") still holds — a worker-scoped fixture's setup/teardown has no per-test
TestInfo either — but the *reason* was misattributed to the wrong location. This matters because
`test.step()` (unlike Allure's own attachment, which no-ops here) throws a hard error in this exact
context — see [`unwrapped-requests-outside-test-step.md`](../playwright-execution/unwrapped-requests-outside-test-step.md)'s
cause 6 correction for the incident this caused.
Regular in-test callers (`createTestUserWithoutPermissions`, `createTestUserSession`, etc.) are
untouched and keep attaching by default — the payload's password is already redacted before
attachment (see `allure-exchange-reporter.ts`'s `isPasswordCredential`/`maskSensitiveData`), so
there is no security reason to suppress it there.

**Correction, 2026-09-18 — the "graceful no-op" claim is stale for this exact call path.** Live
`smoke-m2` reports (`group-3/TB-3922`) show the actual current message is not
`no test runtime is found` but `[AllureExchangeReporter] Failed to attach ... request/response:
test.info() can only be called while test is running` — a hard throw from
`attachment()`/`allure-js-commons`, caught by `allure-exchange-reporter.ts`'s **own** try/catch
around `attachRequest`/`attachResponse`/`attachRequestFailure` (confirmed by reading current
source: none of those three functions check `isInsideTest()` before calling `attachment()` — unlike
`fetchKeycloakToken`/`createTestUser`/`deleteTestUser`, which got that guard for their `test.step()`
calls on this same date, per
[`unwrapped-requests-outside-test-step.md`](../playwright-execution/unwrapped-requests-outside-test-step.md)).
Net effect is unchanged (still non-fatal, still cosmetic log noise — confirmed via the same report:
6 occurrences, all inside worker-teardown cleanup after the test itself had already completed and
passed) but the mechanism differs from what this file originally described, and the fix is
different too: extend the same `isInsideTest()` guard into `allure-exchange-reporter.ts`'s three
attach functions (or into the shared `withAllureAttachment` wrapper in `base-api-client.ts`) instead
of relying on `attachToAllure: false` being threaded through every worker-teardown call site by
hand.

**Fixed same day.** `withAllureAttachment` (`allure-exchange-reporter.ts`) now checks
`!enabled || !isInsideTest()` up front and skips straight to `send()` — the three attach functions
are never reached outside a test/worker context, so the "Failed to attach ... test.info() can only
be called while test is running" warning no longer prints at all. `attachToAllure: false` on
`createSuperAdminTestUser`/`deleteSuperAdminTestUser` is now redundant with this guard but left in
place — harmless, and it's still the right explicit signal at that call site. Verified via
`tsc --noEmit`/`eslint`/`prettier` only.

## The incident

2026-09-02, branch `group-3/TB-3468`. The new `cleanupTrackedUsers()` sweep in
`resource-tracker.ts` (part of the TB-3468 test-user-service migration away from hardcoded users) calls `deleteKeycloakUser` →
`KeycloakAdminApiClient` (extends `BaseApiClient`) from `global-teardown` for the first time — no
prior teardown code path went through a `BaseApiClient`-derived client from outside a test. User
saw the warning in a live run and asked what happened, worried it indicated a hidden bug from that
session's changes. Confirmed benign: the orphaned Keycloak user was deleted successfully
immediately after the warning line.
