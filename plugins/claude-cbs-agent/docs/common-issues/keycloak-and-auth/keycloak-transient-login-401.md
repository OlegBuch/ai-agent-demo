# Keycloak spuriously rejects a login as `401 Invalid user credentials` under load

Applies to: any test/helper that logs in to Keycloak — `auth-service.ts`'s
`createAuthenticatedApiContext`/`createUserAuthenticatedApiContext` (initial login) and
`token-service.ts`'s `refreshContextToken` (mid-test 401 refresh). First hit on `group-3/TB-2960`
(2026-08-19) via the `authenticatedApiContext` fixture. **2026-09-03 correction below**: the
original design retried this indiscriminately, which is wrong for a deliberately-invalid-login
test — read that section before relying on "it just retries" as a blanket fact.

**This file is about a *spurious* 401 (credentials are actually fine, Keycloak briefly glitched).
For a *genuine* 401 from a shared credential actually getting locked by test volume — plus a
separate discovery that GitLab masks the username out of CI logs even though this repo's own code
doesn't — see [`keycloak-shared-credential-lockout-and-ci-log-masking.md`](keycloak-shared-credential-lockout-and-ci-log-masking.md)
(2026-09-03).**

## The rule

Keycloak can reject a password-grant login with a genuine-looking
`401 Invalid user credentials` (`KeycloakAuthError`, code `AUTH_INVALID_CREDENTIALS`) purely
because it's overloaded by a burst of concurrent requests — not because the credentials are
actually wrong. Treat a single `401`/error from the Keycloak token endpoint as inconclusive **only
when the credentials are meant to be valid** (a real test user's normal login/refresh) — for that
case, `token-service.ts`'s `withKeycloakLoginRetry` still retries transient failures before the
error surfaces. Check `token-service.ts` itself for the current `KEYCLOAK_LOGIN_MAX_ATTEMPTS`/
`KEYCLOAK_LOGIN_RETRY_DELAY_MS` values rather than trusting a number written here — they've drifted
more than once (3→5 attempts, 750ms→5000ms delay) and this doc has gone stale on the exact figures
before.

**This no longer applies when the login is deliberately expected to fail** (wrong password,
disabled/locked account, a test proving a lockout threshold). Since 2026-09-03,
`withKeycloakLoginRetry` takes an `isRetryable(error)` predicate, and `fetchKeycloakToken`
(`auth-service.ts`) passes one that returns `false` for `KeycloakAuthError` with code
`AUTH_INVALID_CREDENTIALS` — that class of failure now surfaces on the very first attempt, with no
retry at all. See the 2026-09-03 section near the end of this file for why (it was silently eating
a test's own "should fail after N attempts" assertion) and for a second, compounding bug it fixed
in the same pass (nested retries via `createAuthenticatedApiContextWithRetry`/
`createUserAuthenticatedApiContextWithRetry` in `test-polling-helper.ts`, which used to re-retry a
`KeycloakAuthError` that had already exhausted its own retry budget one layer down).

If a login still fails after 3 attempts, that's a real signal (bad credentials, Keycloak actually
down, wrong `KEYCLOAK_*` env var) — don't raise `KEYCLOAK_LOGIN_MAX_ATTEMPTS` as a reflex fix for a
new flaky spot without checking whether that spot is even routed through
`withKeycloakLoginRetry` yet.

## The incident (2026-08-19)

`currency-regression.spec.ts`'s "Reject missing mandatory field" test failed in the
`authenticatedApiContext` fixture itself, before the test body ever ran:

```
KeycloakAuthError: Keycloak auth failed with status 401: Invalid user credentials
  at fetchKeycloakToken (auth-service.ts:164)
  at createAuthenticatedApiContext (auth-service.ts:269)
  at Object.authenticatedApiContext (api-fixtures.ts:34)
```

34 other tests in the same run passed using the same credentials immediately before/after — this
was Keycloak glitching under the request volume of a full regression run, not a credentials
problem. `fetchKeycloakToken` (`auth-service.ts`) and `getAuthToken` (`token-service.ts`) both used
to throw straight to the caller on the first non-`ok()` response, so this single blip failed the
whole fixture and therefore the whole test.

**Fix:** added `withKeycloakLoginRetry` in `token-service.ts` and wrapped the actual Keycloak POST
in both `fetchKeycloakToken` and `getAuthToken` with it, so every login path (initial fixture
login, named-identity login, mid-test 401 refresh) gets the same 3-attempt/750ms retry for free
instead of each call site needing to remember to add its own.

## 2026-09-02 update — 3 attempts wasn't enough for a long-lived context's mid-run refresh; bumped to 5/2000ms

Two more data points on `group-3/TB-3468` (hardcoded-user migration), same underlying symptom,
different scale:

1. **Right after `createTestUser` provisions a brand-new Keycloak user**, its very first login
   attempt routinely gets one `invalid_grant`/`Invalid user credentials` 401, then succeeds on
   retry #2 — well within the old 3×750ms budget. This case *cannot* be brute-force lockout (zero
   prior login attempts exist for a user that's milliseconds old), so it's genuine Keycloak-side
   propagation/eventual-consistency, not a credentials problem — confirms this doc's existing
   theory, not a new one.
2. **A `checkerContext` created once in a describe's `beforeAll` and reused for ~19 minutes across
   a full `currency-regression.spec.ts` US-01.13.03 run** hit the exact same error signature on its
   *mid-test 401 refresh* (`refreshContextToken` → `getAuthToken`) — but this time **all 3 of the
   old 3×750ms attempts failed**, surfacing as `Expected the staged order to authorize successfully.
   Got status 401: Jwt is expired` once the retry gave up. Confirmed `bruteForceProtected: true` on
   this realm live (`GET /admin/realms/{realm}` via the service-account token), but ruled it out as
   the cause here — the brand-new-user case above shows the identical transient pattern with zero
   possible prior failures to trigger a lockout, so both are almost certainly the same non-lockout
   Keycloak-side mechanism, just needing a longer window to clear on the mid-run case than the
   fresh-user case.

**Fix:** bumped `KEYCLOAK_LOGIN_MAX_ATTEMPTS`/`KEYCLOAK_LOGIN_RETRY_DELAY_MS` in `token-service.ts`
from `3`/`750` to **`5`/`2000`** (≈8s total retry window instead of ≈1.5s) — live-verified same
session: the exact test that previously failed on this ("Triangulation via
COMPANY.TRIANGULATION_CURRENCY when no explicit transit is given") passed cleanly on rerun with no
retry-warning logs at all. This is a global change to every login path routed through
`withKeycloakLoginRetry`, per this doc's own guidance above (checked it *was* already routed
through the shared retry helper before raising the constant, not a reflex fix for an unrelated new
spot). **Predict:** any describe block whose `checkerContext`/long-lived session survives more than
a few minutes of wall-clock test time is a candidate to hit this same failure mode on its own
mid-run refresh — the fresh-user creation delay (`test-user-service.ts`'s own
`NEW_USER_LOGIN_PROPAGATION_DELAY_MS`, added same session) and this retry-budget bump address two
different points on the same underlying Keycloak behavior, not two different bugs.

## 2026-09-02, later same day — live-confirmed: NOT a credentials/realm/enabled bug, the account stays valid across its whole token lifecycle

User suspected the dynamic user's password might not actually be getting applied at creation (or a
realm/`enabled` mismatch) — a plausible alternative to "Keycloak is just flaky." Ruled out both
statically (read `createUserViaClient` in `auth-service.ts`: `enabled: overrides.enabled ?? true`
already defaults true, `credentials: [{type:'password', value: password, temporary}]` already
correctly nested, and `createTestUser`'s un-set `realm` already defaults through
`resolveKeycloakContext` to the same `process.env.KEYCLOAK_REALM` the login path uses — no
mismatch possible) and live, via a throwaway diagnostic spec (`_diag-keycloak-refresh.spec.ts`,
deleted after use, same pattern as the 2026-08-31 diagnostic mentioned in the TB-3468 hardcoded-user migration):

1. Create a user, login immediately — **339ms, succeeded**.
2. Login again 5s later with the same stored username/password — **392ms, succeeded**.
3. Decode the JWT `exp` claim to get the *real* configured access-token lifespan (no guessing):
   **~301s (5 minutes)** — `azp: proj-app`, standard `default-roles-proj-qa` realm roles, nothing
   unusual in the claims.
4. Wait until exactly 10s past that token's real expiry, then attempt a **fresh** password-grant
   login with the same creds (the literal scenario `refreshContextToken` hits mid-test) — **391ms,
   succeeded on the first attempt, zero retries needed.**

Three-for-three, spanning the account's full real token lifecycle, with no concurrent load in the
diagnostic. This directly refutes "password/realm/enabled never got applied" — a structural
creds bug would fail login #1 too, not just a later one. **Confirms the existing theory in this
doc instead**: the 401s seen in real regression runs almost certainly come from Keycloak being
under genuine concurrent load from the rest of that same test run (many currencies/orders/other
dynamic users hitting Keycloak/CBS around the same moment) — a condition this isolated diagnostic
deliberately didn't reproduce, so it can rule OUT the structural-bug hypothesis but can't by itself
prove the load hypothesis. **If this needs pinning down further**, the next diagnostic would need
deliberate concurrent load (e.g. run the diagnostic user's repeated logins alongside a real
regression file), not another isolated single-user run.

## 2026-09-02, same day — concurrent-load theory now directly confirmed (the exact diagnostic this doc asked for)

User ran 3 full suites at once locally against `currency-regression.spec.ts`'s US-01.13.03 block —
that run hit the full failure chain this doc describes: a `checkerClient`'s refresh_token grant
failed (`Session not active`), the password-grant fallback then failed 5/5 attempts with genuine
`invalid_grant`/`Invalid user credentials`, and every login for the rest of that run needed 1-3
retries before succeeding (including for brand-new, never-before-used Keycloak users created later
in the same run — ruling out a per-account brute-force lockout specifically, since a fresh account
has no prior failed attempts to trigger one). A subsequent single-suite run of the identical file
minutes later completed all 28 tests with **zero** Keycloak retry/failure log lines at all. This is
exactly the deliberate-concurrent-load-vs-isolated-run comparison the entry above called for, and
it lands decisively on the load side: 3 concurrent suites reproduces the failure chain, 1 suite
doesn't, same code, same credentials, same environment, minutes apart. Nothing further to pin down
here — don't re-litigate the credentials-bug hypothesis for this symptom again.

**Practical implication:** don't run multiple `proj-test-automation` suites concurrently against the
same local/QA Keycloak+CBS unless the environment is provisioned for that load. This is also the
root cause of a second, unrelated-looking incident from the same concurrent run — a shared
`COMPANY` record snapshot-restore race, permanently corrupting `COMPANY.TRIANGULATION_CURRENCY` —
see `docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md`'s
2026-09-02 entry.

## 2026-09-02/03 — single-suite (non-concurrent) recurrence, dev-side investigation, root cause still open; logs made identity-traceable

The "concurrent load" conclusion above closed the *3-concurrent-suites* scenario. A **separate**
recurrence surfaced on `group-3/TB-3468` under normal single-suite CI-shaped runs (`workers: 1`, no
parallel suites) — a `checkerContext` refresh mid-run got `refresh_token`/"Session not active",
the password-grant fallback then failed repeatedly with `invalid_grant`/`Invalid user credentials`,
and subsequent tests in the same run showed the same degraded pattern (succeeding only on retry
attempt 2-5). This does **not** fit the confirmed concurrent-load explanation above (no concurrent
suites were running), so it is a distinct data point, not a re-run of the same incident.

Investigated jointly with the Keycloak-side developer via realm event-log
auditing. Ruled out: `temporary` password flag (already `false`), password/realm mismatch at
creation (already checked in the entry above), SSO idle-session timeout (`refresh_expires_in:
1800`s — far longer than the observed ~2-3 min idle gaps), and brute-force lockout (Keycloak's own
failure counter only increments on real failed attempts; the dev's own load script reproduced no
lockout across 200 repeated logins). The dev's only **clean** repro of the exact error signature
(`refresh_token` "Session not active" → password-grant "Invalid user credentials") was logging in
as an **already-deleted** user — Keycloak returns this same generic `invalid_grant` for "no such
user" as for "wrong password", by design (doesn't leak which). Keycloak's own Admin Events for one
specific `aqa_checker_...` user in this incident showed **only one login ever, deleted ~1 minute
after creation** — yet the client's own console log for that same run narrated a full
expire→refresh→successful-relogin sequence for it. Server truth and client-log narrative directly
disagreed for the same identity.

**Root cause not yet confirmed** — leading hypothesis, not proven: at the time of this incident,
*none* of the Keycloak-path log lines (`withKeycloakLoginRetry`, `renewContextToken`,
`refreshUsingRefreshToken` in `token-service.ts`; the 401-handler in `base-api-client.ts`) printed
which user/context triggered them — every line was a bare `[Keycloak] ...`/`[BaseApiClient] ...`
with no identity. With several identities (admin/checker/maker/no-permission) alive and issuing
requests around the same time even within one `workers: 1` process, a human reading the combined
log stream cannot actually prove which line belongs to which user — only guess by proximity. That
guess is very likely how a different (still-live) user's ordinary refresh cycle got narrated as
"user X's story" when X was, per Keycloak's own truth, already gone. This would fully explain every
observed fact without requiring a new theory of Keycloak degradation. **Not ruled out**: a genuine
delete-before-use-completes race is still structurally possible — Playwright doesn't cancel
in-flight promises on a test timeout, and CI's `retries: 2` reruns a test while a `describe`-level
`beforeAll`/`afterAll` runs once per file/worker, so an orphaned retry loop from a timed-out attempt
could in principle still be running against a context whose owning user an `afterAll` has since
deleted.

**Fix applied 2026-09-03 (observability, not a behavior change):** every Keycloak/`BaseApiClient`
auth log line now carries the identity that triggered it — `[Keycloak:<username> (<userId>)]` /
`[BaseApiClient:<username> (<userId>)]` instead of the old bare `[Keycloak]`/`[BaseApiClient]`.
`token-service.ts`'s `withKeycloakLoginRetry`/`renewContextToken`/`refreshUsingRefreshToken`/
`getAuthTokenPair` now thread a `label` parameter through; `LoginCredentials` gained an optional
`userId`; a new exported `getContextCredentialsLabel(context)` resolves it for `BaseApiClient`'s
401-handler. This makes the next occurrence provable from logs alone (confirm or rule out the
misattribution hypothesis) instead of requiring a live Keycloak-event-log cross-check with the dev
every time. **Don't re-close this doc's "load is the only cause" conclusion as fully settled** —
the concurrent-suites finding above stands for that scenario, but this single-suite recurrence is a
separate open thread; next time it recurs, read the now-tagged logs first.

Small related cleanup same session: `api-fixtures.ts`'s `noPermissionUser` worker-scoped fixture
was dead code (added, never consumed — all three no-permission call sites create/delete their own
per-test user via `createTestUserWithoutPermissions` directly, matching the README-documented
pattern) — removed rather than wired up, to avoid two competing patterns for the same need.

## 2026-09-03 — blind retry-on-any-error was wrong for a deliberately-invalid login, and nested with a second retry layer to multiply real Keycloak attempts

Reported by the user on `group-3/TB-3587`: an automated login-lockout-style scenario (N failed
logins should make the test fail) instead never failed — it looked like attempts "reset" and the
whole cycle repeated, faster each time. Root cause was two independent, uncoordinated retry layers
around the same login call, neither aware of the other, both designed for the *transient-noise*
scenario this doc otherwise correctly describes, but with no way to opt out for a *deterministic*
rejection:

1. `withKeycloakLoginRetry` (`token-service.ts`) retried **every** thrown error identically,
   including `KeycloakAuthError` with code `AUTH_INVALID_CREDENTIALS` — a genuinely wrong password
   or a disabled/locked account is not transient and retrying it just re-sends the same doomed
   request `KEYCLOAK_LOGIN_MAX_ATTEMPTS` times before finally letting the test see the failure.
   `auth-service.ts`'s `classifyKeycloakAuthError` already computed this exact classification —
   the retry wrapper simply never consulted it.
2. `createAuthenticatedApiContextWithRetry`/`createUserAuthenticatedApiContextWithRetry`
   (`test-polling-helper.ts`'s `retryContextCreation`, default `maxAttempts: 10`) wraps the *entire*
   `create...ApiContext` call — including the `withKeycloakLoginRetry` call already inside it — in
   its own blind any-error retry. A login failure that had already been retried once therefore got
   retried again a layer up: up to `10 × KEYCLOAK_LOGIN_MAX_ATTEMPTS` real login attempts against
   Keycloak for what should have been one bounded attempt budget. This is the actual source of the
   "resets and repeats, faster" symptom — each outer iteration's own inner retry loop looked like a
   fresh cycle of attempts.

**The rule, going forward:** a retry wrapper around an operation that can fail *deterministically*
must be able to distinguish "this specific failure is worth retrying" from "this failure will
never succeed no matter how many times you resend it" — and only one layer in a call chain should
own retrying the same underlying failure. Don't stack a second blind retry loop around a call that
already retries itself internally; if the inner call can fail for reasons the outer call should
also retry (e.g. context creation failing for a reason unrelated to login), gate the outer retry to
exclude the inner call's own already-retried error type instead of retrying everything.

**Fix:**
- `withKeycloakLoginRetry` gained a 5th, optional `isRetryable: (error: unknown) => boolean`
  parameter (default `() => true`, preserving prior behavior for every other call site) — on a
  non-retryable error it throws immediately instead of waiting/retrying.
- `fetchKeycloakToken` (`auth-service.ts`) now passes
  `(error) => !(error instanceof KeycloakAuthError && error.code === 'AUTH_INVALID_CREDENTIALS')` —
  the only call site that currently needs this, since it's the one with the error classification.
- `retryContextCreation` (`test-polling-helper.ts`) now rethrows immediately on any
  `KeycloakAuthError` without consuming one of its own `maxAttempts` — that error already went
  through `withKeycloakLoginRetry`'s own bounded budget one layer down, so this closes the
  multiplication without touching the 10-attempt budget it still owns for genuinely different
  failures (e.g. `apiRequest.newContext` itself throwing).

Net effect: a deterministic auth rejection (wrong password, locked/disabled account) now fails on
the very first real attempt, through either helper, with zero retry — exactly what a lockout- or
invalid-credentials-style test needs to assert against. A genuinely transient failure (Keycloak
truly down, `SERVER_ERROR`/`INVALID_RESPONSE`/network exceptions) still gets `withKeycloakLoginRetry`'s
single bounded retry budget, but is no longer re-multiplied by the outer context-creation retry.

## 2026-09-04 — reverted the "zero retry for AUTH_INVALID_CREDENTIALS" rule; 3 attempts/8s for every failure class now, tied to the credential circuit breaker

User's explicit correction, `group-3/TB-3587`, in the same session as the shared-credential-lockout
incident (see `keycloak-shared-credential-lockout-and-ci-log-masking.md`): a single 401 is not
reliable proof a credential is actually broken (this doc's own confirmed transient-401 findings
above prove that), so failing an admin-context login on attempt 1 — the 2026-09-03 behavior above —
is too strict for the general case. Grepped the whole `api/**/*.spec.ts` tree for anything that
would actually need "fails on attempt 1, no retry" semantics (a deliberate lockout-style test
asserting on `AUTH_INVALID_CREDENTIALS`) — found none currently live, so the regression risk the
2026-09-03 fix was protecting against does not currently apply to any real test.

**New rule (current values — check `token-service.ts` itself before trusting these, per this doc's
own standing warning)**:
- `KEYCLOAK_LOGIN_MAX_ATTEMPTS = 3`, `KEYCLOAK_LOGIN_RETRY_DELAY_MS = 8000` (was `5`/`5000`).
- `withKeycloakLoginRetry`'s `isRetryable` parameter was removed entirely — every failure class
  (including `AUTH_INVALID_CREDENTIALS`) now gets the same bounded 3-attempt/8s retry budget, at
  both call sites (`fetchKeycloakToken` in `auth-service.ts`, `getAuthTokenPair` in
  `token-service.ts`). `retryContextCreation`'s own "don't re-retry a `KeycloakAuthError`" exemption
  (2026-09-03, above) is unchanged and still correct — it's what keeps the outer context-creation
  retry from re-multiplying on top of the inner layer's now-larger-but-still-bounded budget.
- The credential circuit breaker (`recordCredentialFailure`/`recordCredentialSuccess`,
  `MAX_CONSECUTIVE_FAILURES_BEFORE_CIRCUIT_TRIP`) now derives its threshold directly from
  `KEYCLOAK_LOGIN_MAX_ATTEMPTS` instead of an independent literal — since `recordCredentialFailure`
  fires on every failed attempt *including the inner retries*, one login call's own exhausted
  3-attempt budget is now, by itself, enough to trip the breaker for every other call in the run.
  This was the user's explicit design ask: one test's fully-failed login (all 3 of its own tries)
  should stop every other test from independently re-trying the same broken credential, not just
  contribute one data point toward a separately-counted threshold.
- `NEW_USER_LOGIN_PROPAGATION_DELAY_MS` (10s, `test-user-service.ts`, wait after creating a user
  before its first login) was already correct per the user's spec and needed no change.

**If a genuine deliberate-lockout test is added later**, it will need its own way to opt out of
this now-uniform retry (there is currently no `isRetryable`-style hook left to do that with) —
don't silently reintroduce a per-error-class exemption without re-reading this entry first.

## 2026-09-04 — live incident during this same session: request body confirmed byte-identical to Bruno's, still failed; root cause remains open, not a request-shape bug

Team chat, `group-3/TB-3587`: a manual Keycloak *admin console* login attempt with `proj-admin`
failed — but that's an unrelated, expected failure (the admin console is master-realm; `proj-admin`
is an app-realm account, master-realm administration uses a separate `user-operator` identity).
Separately, and directly relevant: `proj-admin`'s password-grant login against `proj-qa`/`proj-app`
(exactly what `getKeycloakAccessTokenPair` sends) failed live in a local Playwright run in this same
session (`KeycloakAuthError`/`AUTH_INVALID_CREDENTIALS`, `global-setup.ts` line 88) — while, per a
teammate testing at roughly the same time, Bruno succeeded in getting a token with what was assumed
to be the same credentials.

Checked Bruno's actual implementation fresh off `origin/main` (per this doc's own
`bruno-authoritative-over-allure-er-text`-adjacent convention — never trust local `main`) across
every collection (Table Template, Field Registry, Plugin Manager, Table Registry, Tables,
Parametrization, Balance/Charge/Consolidation/Currency/Interest/Posting Engine): all of them use
the identical hardcoded `oauth2`/`resource_owner_password_credentials` block —
`accessTokenUrl: {{keycloak-base-url}}/realms/{{realm}}/protocol/openid-connect/token`,
`clientId: proj-app` (in the body), `username: proj-admin`, `password: <redacted>` — realm
resolved from the active environment (`proj-qa` for QA). This is **byte-for-byte identical** to what
`fetchKeycloakToken`/`getKeycloakAccessTokenPair` already send: same realm, same client, same grant
type, same username/password, same token endpoint shape. No code-level or request-shape difference
exists between the two.

**Conclusion**: this is not a "our code talks to Keycloak wrong" bug — the request our code makes
is provably identical to Bruno's. The differing outcome (Bruno succeeded, our run failed) reflects
that the underlying account/credential state is itself intermittent — the same still-open thread as
the 2026-09-02/03 entry above (root cause not yet confirmed), not a new, separate problem. Don't
re-chase a request-construction bug here again without new evidence — this exact comparison has now
been done and ruled out.

**Bruno-side finding, noted but irrelevant to this incident**: `environments/{qa,dev,bankstg}.yml`
all define `keycloak-client-id: proj-admin-sms` with a matching `keycloak-client-secret`, but no
collection actually references those variables — every collection hardcodes `clientId: proj-app`
directly instead. Dead config in Bruno's own environment files; don't mistake it for the real client
in use if reading those files for an unrelated task later.

## 2026-09-17 — the 2026-09-04 "uniform retry" revert was silently undone by a later merge; restored

Reported by the user on `group-3/TB-3911` after fixing an unrelated `playwright.config.ts` bug (see
[`playwright-execution/global-workers-pool-vs-per-project-cap.md`](../playwright-execution/global-workers-pool-vs-per-project-cap.md))
that had been letting `API-tests` and `API-tests-singleton` run concurrently even at
`API_TESTS_PARALLEL_WORKERS=1`. Once that was fixed for `N=1`, the user asked how to keep the same
auth flakiness from recurring at genuine `N=2/3/4` — investigating that surfaced this file's own
"reverted" claim (2026-09-04 section above: `isRetryable` "removed entirely") no longer matched the
live code: `auth-service.ts`'s `fetchKeycloakToken` was still passing
`(error) => !(error instanceof KeycloakAuthError && error.code === 'AUTH_INVALID_CREDENTIALS')` into
`withKeycloakLoginRetry`, and `token-service.ts`'s `withKeycloakLoginRetry` still had the
`isRetryable` parameter — i.e. a fresh 401 for the shared super-admin was failing the test on
**attempt 1 with zero retry**, exactly the pre-2026-09-04 behavior this doc already documented as
wrong for the general case.

`git log -S isRetryable` on both files found the actual mechanism: commit `6c2b3923` (2026-09-04
11:35) did remove `isRetryable` entirely, matching this doc's existing claim — but merge commit
`1f606b2e` ("Merge branch 'main' ... into group-3/TB-3587", after `6c2b3923`) pulled in `main`'s own
independent, never-reverted copy of the parameter and silently reintroduced it, with no conflict to
flag it and no test covering the absence of the exclusion. The revert was real and correct at the
time; a later merge from a stale branch quietly undid it without anyone noticing, and this doc's own
INDEX.md one-liner kept describing the intended (but no-longer-live) state — don't trust this file's
past tense ("was reverted") over the actual current file content; grep the live code first, same as
this doc's own standing warning about the retry-count constants already says to do.

**Why this directly caused the "more workers = more login failures" symptom**: this run-scoped
`aqa_admin_...` super-admin (Fix 3 in `keycloak-shared-credential-lockout-and-ci-log-masking.md`) is
still the identity behind every bare `authenticatedApiContext`/`getGlobalAdminContext` call across
the whole run — hundreds of logins against one account, same as before that fix, just now funneled
through one *identity* instead of one *env var*. More concurrent workers means more of those logins
land close together in time, which is exactly the load pattern this doc's own 2026-09-02 "concurrent
suites" experiment already proved produces genuine-looking `401 Invalid user credentials` that
clears up on its own with a retry. With the exclusion silently back in place, every one of those
transient blips hard-failed the test on attempt 1 instead of getting the 3-attempt/8s budget the
team had already decided every failure class deserves.

**Fix**: removed the `isRetryable` parameter from `withKeycloakLoginRetry` (`token-service.ts`)
again, and the predicate argument from `fetchKeycloakToken`'s call to it (`auth-service.ts`) —
back to exactly the 2026-09-04 state, re-verified there is still no call site anywhere in `api/**`
that needs deterministic no-retry semantics (same check this doc's 2026-09-04 entry already
describes doing). `tsc`/`eslint` clean; not yet exercised live against `N=2/3/4` on bankstg.

**If this recurs a third time**, suspect the same mechanism first: a merge from a branch that
diverged before a fix landed can silently resurrect old code with no conflict marker to catch it.
Grepping `git log -S <the-removed-symbol>` across the full history (not just recent commits) is what
found it this time.

## 2026-09-17, later same day — live-verified at real N=3+1 on bankstg; added a pre-login readiness probe + login stagger as a complementary reduction (not a replacement) for the retry/circuit-breaker safety net

Ran `smoke-m2` via `run-on-vm.sh` against bankstg with `API-tests=3, API-tests-singleton=1` — the
first live exercise of the reinstated uniform retry (entry above) at genuine `N>1`. Result: several
`[Keycloak:proj-admin]` transient `401`/`invalid_grant` did occur early in the run (multiple workers'
first login landing close together in time — the same mechanism this doc's 2026-08-19/09-02 entries
already diagnosed), each cleared on retry attempt 2 or 3; no test failed and no circuit-breaker
tripped (no single worker hit 3 consecutive failures). This is the live bankstg confirmation the
entry above said was still missing.

Live-confirmed, via a throwaway probe against bankstg using a deliberately nonexistent
username/password (not the real account, so no risk to it), that Keycloak's token endpoint returns
the **identical** `401 {"error":"invalid_grant","error_description":"Invalid user credentials"}`
shape for a genuinely-wrong login as for the real account's transient blips — the response body
cannot distinguish the two, which is exactly why every entry above had to reach for external
evidence (retry succeeding, zero-prior-attempts reasoning, Bruno comparison) instead of the error
text itself.

**Added, as a reduction in *frequency* — the existing 3-attempt/8s retry and circuit breaker stay
as the safety net, this doesn't replace them:**
1. `ensureKeycloakRealmReady(keycloakBaseUrl, realm)` (`token-service.ts`) — probes the realm's
   public `.well-known/openid-configuration` discovery document (new `AUTH_PATHS.
   KEYCLOAK_REALM_DISCOVERY`) before the very first login in a process. This endpoint takes no
   credentials and is not the token endpoint, so it can never itself count toward
   `recordCredentialFailure`/the circuit breaker, unlike retrying the actual grant would. Cached
   per `(keycloakBaseUrl, realm)` per process (a `Set`), so it costs one extra request per worker,
   not per test. Never throws on its own — warns and proceeds to the real login either way, so it
   can't become a new hard-failure mode on top of the existing one.
2. `staggerInitialKeycloakLogin()` (`token-service.ts`) — delays a process's very first Keycloak
   login by `TEST_PARALLEL_INDEX * 400ms` plus up to 250ms jitter, so `N` parallel workers don't all
   send their first password/client-credentials grant in the same instant. Only the first login in
   a process is delayed; every later one in the same process is a no-op.

Both are called from both real entry points into the token endpoint — `fetchKeycloakToken`
(`auth-service.ts`, covers both the `proj-admin`/super-admin password grant and the service-account
client-credentials grant) and `getAuthTokenPair` (`token-service.ts`, covers `getAuthToken`/
`refreshContextToken`'s re-login fallback) — after the existing `isCredentialKnownInvalid` fast-fail
check, so an already-tripped credential still fails immediately with no added delay.

**Open question this doesn't resolve**: the failing label in this run's log was literally
`proj-admin` (the raw `KEYCLOAK_USERNAME` env value), not a generated `aqa_admin_...` super-admin
username — worth checking which call site in the `smoke-m2` suite's specs (`account-maintenance-
smoke.spec.ts`, `balance-management-smoke.spec.ts`, `customer-party-data-smoke.spec.ts`,
`account-restrictions-locked-amounts.spec.ts`) still resolves to the literal env credential instead
of the per-worker `workerSuperAdmin` the earlier 2026-09-17 entry says already covers every bare
`authenticatedApiContext` call — either some call site passes an explicit `username` override, or a
fixture-ordering gap lets a login race ahead of `setWorkerSuperAdmin`. Not investigated further this
session; check `git log -S KEYCLOAK_USERNAME` and grep for explicit `username:` overrides in those
four spec files first if this recurs.

**Verified**: `tsc --noEmit`/`eslint`/`prettier` clean on all three touched files (`auth-service.ts`,
`token-service.ts`, `auth-paths.ts`); the discovery-endpoint URL was live-curled against the real
`http://keycloak.bankstg.local/realms/bankstg/.well-known/openid-configuration` and returned `200` with
a valid OpenID discovery document, confirming the probe's request shape actually works against this
environment. Not yet exercised through an actual Playwright run (only the pre-existing retry
behavior was, per above) — if "more workers = more failures" still recurs after this, the open
question above is the next thing to check, not a reflex increase to the stagger constants.
