# A shared Keycloak credential can get genuinely locked by test volume, and GitLab masks its identity out of the CI log

Distinct from [`keycloak-transient-login-401.md`](keycloak-transient-login-401.md): that file covers
a *spurious* 401 (Keycloak briefly glitching under load, credentials are actually fine). This file
covers a *genuine* 401 — the shared credential really is locked/rejected — plus a separate,
unrelated discovery made while triaging it: CI logs cannot show *which* identity failed even when
the code prints it.

## The pattern

Any fixture/helper that falls back to `process.env.KEYCLOAK_USERNAME`/`KEYCLOAK_PASSWORD` when no
explicit username/password is passed (`createAuthenticatedApiContext` in `auth-service.ts`,
`getAuthTokenPair` in `token-service.ts`) shares **one** Keycloak account across every test that
uses it. That account also gets shared manually by the team (e.g. in Bruno, which "works under it
by default"). Keycloak's brute-force-lockout counter doesn't know or care that a failed attempt
came from a human, one CI job, or another CI job running concurrently — it's one counter per
account. A CI run through a module that hasn't been migrated to per-test dynamically-provisioned
users (see the TB-3587/TB-3468 hardcoded-user migration) can generate one login attempt per test —
hundreds in a single `smoke-m2`/`regression-m2` run — all against that same one account. If the
credential is ever even briefly wrong (a rotation, a typo committed to the CI variable, or a
genuine lockout that's already begun), every one of those hundreds of attempts adds another failed
attempt to the same counter, which is enough on its own to keep the account locked long after the
real cause is fixed, and locks it out for every human/tool sharing it, not just CI.

## The incident (2026-09-03, confirmed by team chat, `group-3/TB-3587`)

`product-attribute-classes-modular-building-blocks-smoke.spec.ts` (and effectively the whole
`product_factory` smoke run) failed almost entirely on login, `KeycloakAuthError` /
`AUTH_INVALID_CREDENTIALS`, from `authenticatedApiContext` (`api-fixtures.ts:34`) →
`createAuthenticatedApiContext` (`auth-service.ts`) → the env-fallback path (no explicit
username/password passed by this fixture, so it reads `KEYCLOAK_USERNAME`/`KEYCLOAK_PASSWORD`).

Team chat the same day confirmed, independently of CI: `proj-admin` (the value behind
`KEYCLOAK_USERNAME`) was genuinely locked in Keycloak — visibly re-enableable via a toggle in the
Keycloak admin console, and the account remained "active" both in CBS and in Keycloak's own user
record even while locked (lock state and account-enabled state are different flags). One team
member's own read on the cause: "все кто не попадя юзал" — everyone/everything hitting the same
shared credential is exactly the blast-radius mechanism described above. A parallel, unrelated
symptom in the same incident (`Missing authenticated user` from Bruno) is explained by the same
root cause: Bruno's own default auth also runs under this same shared `proj-admin` credential.

**Separately, while triaging**: the CI job's own log showed `[Keycloak:[MASKED]]` on every one of
these lines instead of the real username, even though `auth-service.ts`'s `fetchKeycloakToken`
prints the real, unredacted `label` (`form.username`) — this repository's own code does no
masking at all. This is GitLab CI/CD's **"Masked variable"** feature: any CI/CD variable flagged
Masked has every literal occurrence of its *value* scrubbed from the entire job log stream,
wherever that string appears — not only where the pipeline references the variable by name. Since
this repo's own convention (see `README.md`, "Mask+protect in GitLab") is to mask credential-shaped
GitLab CI/CD variables, `KEYCLOAK_USERNAME` is masked right alongside `KEYCLOAK_PASSWORD` — so the
2026-09-03 `[Keycloak:<username> (<userId>)]` identity-tagging fix documented in
`keycloak-transient-login-401.md` is silently defeated in CI specifically, which is exactly why
"почти все упало ... и не понятно какой юзер сломался" (this incident) took a live team-chat
cross-check against the Keycloak console to resolve instead of a one-line log read.

**The rule going forward:** a `username`/`userId` is an identifier, not a secret — it's the
password/token/client-secret that must stay masked. Masking a username identically to a password
destroys the ability to triage exactly this class of incident from CI logs alone.

## Fix 1 — process-wide circuit breaker for a confirmed-invalid credential (code)

`token-service.ts` gained a small process-wide cache: `credentialCacheKey(baseUrl, realm,
username)` / `isCredentialKnownInvalid(key)` / `markCredentialInvalid(key)`, plus a
`KeycloakInvalidCredentialsError` class. Both login paths that hit Keycloak's token endpoint now
share it:

- `fetchKeycloakToken` (`auth-service.ts`): checks the cache before attempting a login; on a genuine
  `AUTH_INVALID_CREDENTIALS` classification (`classifyKeycloakAuthError`), marks the credential
  before throwing.
- `getAuthTokenPair` (`token-service.ts`, used by `renewContextToken`'s password-grant fallback and
  by two direct call sites in `audit-fields-integration.spec.ts`): same check-before/mark-after,
  and now classifies a 401/403 as non-retryable (previously it blindly retried **any** failure,
  including a deterministic one, `KEYCLOAK_LOGIN_MAX_ATTEMPTS` times — a second, independent gap
  from the one `keycloak-transient-login-401.md`'s 2026-09-03 entry already fixed in
  `fetchKeycloakToken`).

Net effect: once any call site in a run confirms a credential is genuinely rejected, every later
call for that exact `(baseUrl, realm, username)` in the same process fails immediately with zero
live Keycloak attempt, instead of adding one more failed attempt per test. **Superseded 2026-09-16/17:** `API_TESTS_MAX_WORKERS` no longer exists; the worker count is `API_TESTS_PARALLEL_WORKERS` (default 1, see `docs/frame-specs/parallelization-readiness.md`) and the breaker is per worker process. At the time of writing `API_TESTS_MAX_WORKERS`
was `1` (`api-client.constants.ts`), so one CI job was one process — this caps that job's contribution
to the shared account's failure counter at 1, not ~370. This does **not** by itself prevent a
lockout across *concurrent* CI jobs (each is its own process with its own cache) or from manual
use outside CI — see the structural fix below for that.

**Predict:** any future helper that logs in via a fresh `request.newContext()`/direct token-endpoint
POST outside these two functions won't benefit from this cache automatically — route new Keycloak
login call sites through `fetchKeycloakToken`/`getAuthTokenPair`/`withKeycloakLoginRetry` rather
than hand-rolling a new one, or the breaker has to be re-added there too.

## Fix 2 — un-mask the username CI/CD variables (GitLab project setting, not code)

Not something a commit to this repo can fix. In GitLab: **Project → Settings → CI/CD → Variables**,
uncheck **"Mask variable"** for `KEYCLOAK_USERNAME` and `KEYCLOAK_ADMIN_USERNAME` (leave "Protect
variable" as-is). Keep `KEYCLOAK_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, and `KEYCLOAK_CLIENT_SECRET`
masked — those are the actual secrets. As of this writing this hadn't been actioned yet (no GitLab
API/MCP tool is wired into this framework to do it programmatically) — flag it to whoever has
Maintainer access.

## Fix 3 — run-scoped "super-admin" bootstrap user (code, 2026-09-04, supersedes the "prioritize product_factory" ask below for this specific incident)

The user's own proposal, confirmed explicitly ("наш супер-админ должен заменить исключительно
proj-admin вызовы и действия... а мейкеры, чекеры и т.д должны остаться"): `global-setup.ts` now
creates one disposable "super-admin" Keycloak+CBS user per run (`createSuperAdminTestUser`,
`test-user-service.ts`) with `USER_PROFILE_VALUES.PERMISSIONS.FULL_ACCESS`
(`{TABLE:'ALL', FUNCTION:'ALL'}`) permissions, and `global-teardown.ts` deletes it
(`deleteSuperAdminTestUser`) before the generic tracked-resource sweep. `proj-admin` is now used
for exactly two calls per run — creating and deleting this user — instead of once per
admin-context call throughout the run.

Every other admin-context resolution (`getGlobalAdminContext`, and any bare
`createAuthenticatedApiContext`/`getAuthTokenPair` call with no explicit username/password —
covers `product_factory` and every other not-yet-migrated module too, not just
`test-user-service.ts`'s own internal provisioning) now goes through a single new resolver,
`resolveKeycloakCredentials` (`token-service.ts`): explicit credentials win, else the run-scoped
super-admin (read from a sentinel file) wins, else fall back to `KEYCLOAK_USERNAME`/`PASSWORD` —
so a run with no bootstrapped super-admin (creation failed, or global-setup didn't run) degrades
exactly to today's behavior, not a hard new dependency. Maker/checker/no-permission/restricted
dynamic test users are completely unaffected — they're still created the same way they always
were, this only changes what identity `getGlobalAdminContext`-style calls use.

**Superseded 2026-09-17 (Fix 6 below): the `.proj-runtime/super-admin.json` sentinel file and `readSuperAdminSentinel()` were removed; the super-admin is now an in-memory per-worker value.** Historical text: **Sentinel file, deliberately not process.env**: tried first was overwriting
`process.env.KEYCLOAK_USERNAME`/`PASSWORD` in `global-setup.ts`, matching how it already sets
`process.env.DYNAMIC_GROUP_ID` — but `group-helper.ts`'s own `getDynamicGroupId()` comment
("Resolves ... from env, falling back to test-results/dynamic-group-id.txt") shows this
codebase's own author already found `process.env` set in `globalSetup` isn't reliably visible to
worker processes and solved it with a sentinel file instead — followed that same convention. The
new sentinel (`.proj-runtime/super-admin.json`) is deliberately **not** under `test-results/`
(unlike `dynamic-group-id.txt`) because `test-results/` is uploaded as a CI artifact for 7 days
(`.gitlab-ci.yml`'s `artifacts.paths`) and this file holds a live admin password, not just a group
id — added to `.gitignore` too.

**A subtle correctness trap found and closed while designing this**: since 2026-09-03 (Fix 1
above / `keycloak-transient-login-401.md`), any 401 from Keycloak's token endpoint is classified
`AUTH_INVALID_CREDENTIALS` and is **not retried** — including a brand-new user's well-documented
transient first-login 401 (propagation delay, not a real credentials problem — see that doc's
2026-09-02 entry). `createTestUserSession` already dodges this for regular dynamic users via a
10s `NEW_USER_LOGIN_PROPAGATION_DELAY_MS` wait before its first login. `createSuperAdminTestUser`
does the identical wait before returning — without it, the super-admin's very first real login
(made by whichever test happens to call `getGlobalAdminContext()` next) could hit this transient
401 and get permanently marked invalid by Fix 1's circuit breaker for the rest of the run, which
would make this feature *less* reliable than today, not more.

**2026-09-04 correction — circuit breaker was tripping on a single failure; fixed to require
several consecutive failures, matching the realm's real lockout policy.** The user caught this
directly: Keycloak's own brute-force policy on this realm only locks an account after several
failed attempts in a short window, not after one — and this codebase's own
`keycloak-transient-login-401.md` already has confirmed cases of a one-off transient 401 that
succeeds on retry. Tripping the circuit breaker on the very first failure (the original version of
Fix 1) was both stricter than the real Keycloak policy it exists to protect and liable to
misclassify a routine transient blip as a dead credential — especially costly now that nearly
everything funnels through one heavily-reused super-admin identity (Fix 3 below), where a single
false trip disables admin-context logins for the rest of a run.

**Fix**: `token-service.ts`'s cache is no longer a boolean "seen one failure" set — it's a
per-credential consecutive-failure counter (`recordCredentialFailure`/`recordCredentialSuccess`,
replacing the old `markCredentialInvalid`). The breaker only trips (stops attempting further live
logins for that credential) after `MAX_CONSECUTIVE_FAILURES_BEFORE_CIRCUIT_TRIP` (`3`) consecutive
failures — chosen to stay comfortably under the realm's real threshold while still giving a couple
of legitimate retries — and any successful login resets the count to zero, since a prior failure
that's since succeeded was transient, not a sign the credential is actually broken. Both call
sites (`fetchKeycloakToken` in `auth-service.ts`, `getAuthTokenPair` in `token-service.ts`) record
success on their happy path and failure only on a genuine 401/403.

## Fix 4 — `createTestUser`'s own group-creation path was leaking a `SM.USER.GROUP~MAIN` record per call (2026-09-04)

Flagged as a known-but-out-of-scope gap when Fix 3 first shipped, then fixed the same day on the
user's explicit request ("в чем суть утечки — пофикси"). **The leak, precisely**: whenever
`createTestUser` is called with `options.permissions` (and no explicit `options.groups`) — the
`needsOwnGroup` branch — it creates a fresh `SM.USER.GROUP~MAIN` record to hold those permissions,
but never recorded that record anywhere: not via `trackCreatedGroup` (that function is
table-registry-group-only, keyed by a *numeric* id — passing a `SM.USER.GROUP` id like
`AQA.USER.GROUP_xyz` through it would silently misfire, since `Number('AQA.USER.GROUP_xyz')` is
`NaN`), and not via `TestUser.scaffolding` (only `createTestUserWithoutPermissions` ever set that).
`deleteTestUser` only cleans up a group it finds in `user.scaffolding` — so every call to
`createTestUser({permissions: [...]})` left one orphaned permission-group record behind,
permanently, for every test run that used this path (which is most maker/checker-style dynamic
users under the TB-3468/TB-3587 migration, not just the super-admin).

**Fix**: `createTestUser` now captures the group id it creates in a local (`ownUserGroupId`) and
attaches it to the returned user's `scaffolding: { userGroupId }` — including on its own
error-cleanup path (the `catch` block's `deleteTestUser` call now also carries the scaffolding, so
a failure *after* group creation but *before* the CBS profile POST succeeds still cleans up the
group). `TestUser['scaffolding'].tableGroupId` was widened from required to optional (it was never
applicable to this path — only `createTestUserWithoutPermissions`'s table+group scaffold has one),
and `deleteTestUser` now only calls `cleanupGroupById` when a `tableGroupId` is actually present,
instead of blindly calling `cleanupGroupById(Number(undefined), ...)` (`NaN`) for a
user-group-only scaffold. With this fixed, `createSuperAdminTestUser`/`deleteSuperAdminTestUser`
(Fix 3) were simplified to thin wrappers around `createTestUser`/`deleteTestUser` — the custom
group pre-creation/explicit-deletion code they originally needed to route around this gap is gone.

**Also corrected same session**: the super-admin's permission set was `FULL_ACCESS`
(`{TABLE:'ALL', FUNCTION:'ALL'}`) alone, which the user confirmed is *not* sufficient for a real
super-admin — table-registry operations (group/table creation, which `global-setup.ts` itself
performs through this same admin context) need an explicit `{TABLE:'TABLE_REGISTRY',
FUNCTION:'ALL'}` grant too, since the `ALL` wildcard doesn't cover it. `SUPER_ADMIN_PERMISSIONS`
now carries both entries.

## Fix 5 — circuit breaker gained a 5-minute cooldown instead of tripping for the whole process lifetime (2026-09-04)

Found during an unrelated Q&A pass explaining the login/refresh/retry mechanics end-to-end (not a
live incident): `knownInvalidCredentials` was a `Set<string>` — once Fix 1's breaker tripped for a
`(baseUrl, realm, username)` key, that key stayed short-circuited until the worker process exited,
with zero self-healing path. If the trip itself was caused by a transient Keycloak-side condition
(not a genuinely dead credential — `keycloak-transient-login-401.md`'s known failure mode) rather
than a real bad password, the credential was sidelined for the rest of a potentially multi-hour CI
run on what may have been a one-off blip, no different in kind from the single-failure-trip problem
the 2026-09-04 correction to Fix 3 already fixed for the *trip threshold* — this closes the same gap
for the trip's *duration*.

**Fix**: `knownInvalidCredentials` is now a `Map<string, number>` (key → trip timestamp).
`isCredentialKnownInvalid` checks the age of the trip against `CIRCUIT_BREAKER_COOLDOWN_MS` (`5 *
60 * 1000`, 5 minutes) and, once elapsed, clears both the trip entry and the failure counter for
that key, allowing exactly one fresh live attempt instead of requiring a process restart.
`recordCredentialSuccess` now also clears `knownInvalidCredentials` defensively (a success right
after cooldown expiry should never leave a stale trip entry behind). Statically verified clean
(tsc/eslint/prettier); not yet exercised by a live re-trip-then-wait scenario.

## Fix 6 — the run-scoped super-admin (Fix 3) itself became per-worker instead of per-run (2026-09-17)

`group-3/TB-3911`. Fix 3 above closed the "hundreds of logins against `proj-admin`" problem by
funneling every admin-context call through one disposable super-admin created once in
`global-setup.ts` and shared by every worker for the rest of the run. That itself became the next
bottleneck once the [`playwright-execution/global-workers-pool-vs-per-project-cap.md`](../playwright-execution/global-workers-pool-vs-per-project-cap.md)
config bug was fixed and the user asked how to run genuine `N=2/3/4` workers without flakiness: 2+
worker *processes* still authenticate as that identical one super-admin identity, which is exactly
the concurrent-load-against-one-account shape [`keycloak-transient-login-401.md`](keycloak-transient-login-401.md)'s
2026-09-02 entry already proved reproduces Keycloak's transient `401`.

**Fix**: each worker now bootstraps and tears down its own disposable super-admin instead of
sharing one for the whole run.

- `token-service.ts`: `writeSuperAdminSentinel`/`readSuperAdminSentinel`/`clearSuperAdminSentinel`
  and the `.proj-runtime/super-admin.json` file are gone, replaced by a plain in-memory
  `workerSuperAdmin` module variable + `setWorkerSuperAdmin()` setter. This works with zero
  cross-process plumbing precisely because each Playwright worker is its own OS process — module
  state is automatically worker-isolated, which is *why* the sentinel file existed in the first
  place (per Fix 3's own note above: `process.env` set in `globalSetup` isn't visible to worker
  processes) — that constraint only applied to the global-setup → worker handoff, which no longer
  exists.
- `global-setup.ts` no longer creates a super-admin to hand off; its own internal admin needs
  (SYSTEM parameter bootstrap, orphan/stale cleanup, table group creation) are unchanged — still
  `proj-admin` via the env-var fallback, exactly as before Fix 3, since nothing outside
  `global-setup`'s own process needs to see that identity anymore.
- `global-teardown.ts` no longer deletes a run-wide super-admin; `cleanupTrackedResources()` remains
  as the crash-safety sweep.
- `api-fixtures.ts` gained a `workerSuperAdmin` fixture (`{ scope: 'worker', auto: true }`):
  creates one `createSuperAdminTestUser` per worker on first use, deletes it on worker teardown.
  `auto: true` is load-bearing, not decorative — `getGlobalAdminContext()` (`test-user-service.ts`)
  is a bare function called from deep inside `createTestUser`/`deleteTestUser` with no fixture
  dependency wired to it, so the worker admin must exist before the *first* test in that worker
  runs, not just before whichever test happens to declare a dependency.

**Trade-off, accepted deliberately**: `proj-admin` is now used for `2 × N` calls per run (create +
delete per worker) instead of Fix 3's flat `2`. At the `N=1..4` scale this was designed for, that's
≤8 calls — nowhere near the "hundreds of calls" volume that caused the original 2026-09-03 lockout
incident, so it doesn't reopen that risk. If worker counts ever grow much larger, re-check this
trade-off rather than assuming it still holds.

**Structural fix section below is now partially satisfied for the admin identity specifically** —
`product_factory` (and other not-yet-migrated modules) still share other per-module credentials
per the structural-fix note; only the *admin*-context identity was made per-worker here.

## Fix 8 — `createTestUserSession`'s pre-login propagation wait was dropped in the TB-3874 probe refactor, never migrated (found + fixed 2026-09-18, `group-3/TB-3922`)

Originally (`ccd953b8`/`0edf6f32`, the TB-3468/TB-3587 user-service work) **both**
`createSuperAdminTestUser` and `createTestUserSession` had an unconditional
`await delay(NEW_USER_LOGIN_PROPAGATION_DELAY_MS)` (10s) before the first login attempt on a
freshly created user. `aa8261b7` (`TB-3874`, "Enable 2-4 parallel API test workers") replaced
super-admin's flat delay with the smarter polling probe (`waitUntilLoginSucceeds`, 5×2s, exits
early on success) — a real improvement there — but the matching line in `createTestUserSession`
was simply **deleted**, with nothing put in its place (confirmed via
`git log -S"NEW_USER_LOGIN_PROPAGATION_DELAY_MS"`: the symbol existed in `ccd953b8`/`0edf6f32`,
then vanished from `createTestUserSession` starting at `aa8261b7`, carried forward unchanged into
`8cc635de`/`TB-3911`). Every regular disposable user (`createTestUser`/`createTestUserSession`,
including `label: 'admin'` ones) has gone straight from the Keycloak Admin API "create user" call
into `createUserAuthenticatedApiContextWithRetry()` with zero pre-login wait ever since — an
accidental omission during that refactor, not a deliberate design decision (the super-admin half of
the same diff shows the intended pattern clearly).

A `vm-results-smoke-m2-20260918-143907` run (3 parallel `API-tests` workers) reproduced this as a
real test failure, not just log noise: `basic-customization-smoke.spec.ts` TC-30 failed with
`KeycloakAuthError: Keycloak auth failed with status 401: Invalid user credentials` while
authenticating a freshly created `aqa_admin_...` user during its own `PRECONDITION` step — all 3
retry attempts exhausted, circuit breaker tripped for that username. In the same run, a third
admin-labeled user (`aqa_admin_1789733209767_07b`) failed attempt 1 but **succeeded on attempt 2**,
confirming the transient/propagation-delay nature (not a bad password) — same failure class
`keycloak-transient-login-401.md`'s 2026-09-02 entry already diagnosed for brand-new users in
general.

**Fixed**: `createTestUserSession` now calls the same `waitUntilLoginSucceeds` probe
`createSuperAdminTestUser` already uses, right before `createUserAuthenticatedApiContextWithRetry`
— restores parity between the two paths instead of re-adding a separate flat delay (rule: fix the named function itself, not just one caller). Verified via `tsc --noEmit`/`eslint`/`prettier` only; a live re-run is done by the owner, who runs all tests manually. Increased
worker concurrency (`TB-3911`) is why this gap started producing visible failures now — more
workers means more concurrent Keycloak Admin-API creates + logins in the same window, so the
propagation race that a lower-concurrency run rarely hit became common enough to show up in a
single `smoke-m2` pass.

## Fix 7 — the run-scoped dynamic table group had the identical shared-resource shape as Fix 6's admin user; made per-worker too (2026-09-17, same session)

Same `group-3/TB-3911` session, raised directly by the user: `global-setup.ts` created ONE
`DYNAMIC_GROUP_ID` table group for the whole run (same pattern Fix 6 had just fixed for the
super-admin identity) — every worker's tests create their tables into that one shared group. The
user flagged a real risk this doc hadn't considered: `constants-keeper.ts` defines
`MAX_REUSABLE_GROUP_TABLE_COUNT: 10`, and a shared group under N concurrent workers accumulates
tables far faster than a single worker would. Verified by grep: this constant has **zero**
enforcement anywhere in client code — either a dead/aspirational constant, or a real backend-side
Table Registry constraint the test framework doesn't proactively check. Not resolved either way,
but irrelevant to the fix that follows, since splitting into per-worker groups divides the total
table count across N groups regardless of whether the cap is real.

**Bigger complication than Fix 6's admin case**: unlike `resolveKeycloakCredentials` (the one
chokepoint every admin-context call went through), roughly 10 spec files
(`audit-fields-smoke.spec.ts`, `idempotency-regression/smoke.spec.ts`,
`override-dispo-regression.spec.ts`, `enquiry-smoke/regression.spec.ts`,
`table-registry-smoke.spec.ts`, `validation-engine-fixtures.ts`, `audit-fields-integration.spec.ts`,
`soft-accounting-helper.ts`) call `getDynamicGroupId()`/`requireDynamicGroupId()`
(`group-helper.ts`) **directly**, bypassing the `workerGroupId` fixture entirely. Both are bare
functions that just read `process.env.DYNAMIC_GROUP_ID` (falling back to a
`test-results/dynamic-group-id.txt` file only if the env var is unset). This turned out to make the
fix easier, not harder: since each Playwright worker is its own process, having the worker-scoped
fixture set `process.env.DYNAMIC_GROUP_ID` **from inside that worker's own process** makes every
bare call site in that same process see the worker's own group automatically — zero changes needed
in any of those ~10 files, `group-helper.ts` untouched.

**Fix**: `global-setup.ts` no longer creates any table group (its own internal needs — SYSTEM
parameter bootstrap, orphan/stale-group cleanup — never used one); the `TableRegistryApiClient`
instance it only used for that is removed too. `api-fixtures.ts`'s `workerGroupId` fixture
(previously a passive `requireDynamicGroupId()` reader) now itself creates a dedicated group per
worker — same `createGroup`/`buildCreateGroupPayload` call `global-setup.ts` used to make, but
routed through `workerSuperAdmin` (Fix 6) via an explicit fixture dependency, so no extra Keycloak
identity is needed — sets `process.env.DYNAMIC_GROUP_ID`, and deletes the group
(`cleanupGroupById`) on worker teardown. `{ scope: 'worker', auto: true }`, same reasoning as Fix
6's `workerSuperAdmin`: most consumers reach this through the bare env-var read, not a declared
fixture dependency, so it must exist before the first test in the worker runs regardless. Also
added: `global-setup.ts` now deletes a stale `dynamic-group-id.txt` left by a previous run at
startup (it will never write one again itself) — defensive, since nothing reads that fallback file
in practice once the per-worker env var is always set before any test executes.

**Not touched, deliberately**: `table-registry-helper.ts`'s cross-process group-healing machinery
(`resolveActiveGroupId`/`recordGroupHeal`/`tryAcquireHealLock`, keyed by group id, and
`persistHealedGroupId`'s own redundant write to the same `dynamic-group-id.txt`) needed no changes
— it already keys everything by group id, so it works identically whether N workers share one group
or each owns a distinct one; per-worker groups if anything remove the *need* for its
cross-worker-propagation purpose (each worker now only ever heals its own group), without breaking
the mechanism itself.

## Structural fix (recommended, not yet done) — finish moving shared-credential modules onto per-test users

`product_factory`'s smoke suite (the module in this incident) still authenticates through the
single shared env-fallback credential rather than a per-test dynamically-provisioned Keycloak user
the way the already-migrated modules under the TB-3468/TB-3587 hardcoded-user migration do. A
module on the per-test-user pattern structurally cannot cause this class of incident — a
locked/broken credential there can only ever affect that one throwaway user's own tests, never the
whole shared account every other module and every human also depends on. The agreed TB-3587 rollout
order is alphabetical by `api/` module directory (account → customer → document_management →
fin_accounting → integration_chapter → interest_and_charges → **product_factory** → ...) — this
incident is a concrete data point for whether that module deserves expediting, not a reason to
silently jump the queue; raise it with the user/lead rather than reordering it unilaterally.
