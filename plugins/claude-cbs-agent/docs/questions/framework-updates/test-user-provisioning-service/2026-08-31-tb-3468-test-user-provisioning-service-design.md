# TB-3468: Test user provisioning service — design

**Ticket:** TB-3468 (sub-task of TB-2798 "Current code condition refactoring", Epic TB-791)
**Ticket description:** none — TB-3468 has no description/AC and no linked Confluence page
(confirmed 2026-08-31, via Jira). This document is the actual spec for that ticket.
**Status:** Approved (brainstorming), pending implementation plan
**Date:** 2026-08-31
**Owner:** Vadym Udaltsov (AQA)

## Scope

`proj-test-automation` only — new `api/utils/services/test-user-service.ts`, extending
`api/utils/helpers/resource-tracker.ts` + `api/utils/fixtures/global-teardown.ts`, a new
worker-scoped fixture in `api/utils/fixtures/api-fixtures.ts`, and a pilot migration of
`api/system_core/tests/enquiry-regression.spec.ts`'s three `asUserWithGroups` call sites. Full
migration of the remaining ~65 API specs still on the static `USERS_DATA` roster, the
`DISPO_OFFICER` hierarchy, and refactoring UI's `provisionDashboardUser` are explicitly out of
scope — see §7.

## 1. Problem

Two incompatible test-user provisioning patterns coexist in `proj-test-automation` today:

- **Pattern A — dynamic Keycloak creation.** Used by all 8/8 UI specs (via
  `ui/utils/helpers/dashboard-user.ts`'s `provisionDashboardUser()`) plus one API spec
  (`api/customer/tests/customer-party-integration.spec.ts`). Always per-test
  (`beforeEach`/`afterEach`); never suite-scoped. `provisionDashboardUser` is the only place in the
  repo that already composes both layers a real test user needs — a Keycloak identity
  (`createKeycloakUser`) *and* CBS-domain permissions (`SM.USER~INTERNAL` profile via
  `UserProfileApiClient`) — but it's UI-only and not parameterized for reuse from `api/`.
- **Pattern B — static, pre-seeded, env-sourced users.** Used by ~69/70 API specs via
  `api/utils/constants/user-credentials.values.ts`'s `USERS_DATA` roster (`SUCCESSFUL_USER`,
  `RESTRICTED_USER`, `PARTIALLY_ACCESS_USER`, `MAKER_USER`/`CHECKER_USER`,
  `TR_MAKER_USER`/`TR_CHECKER_USER`, `DM_CHECKER_USER`, `CM_CHECKER_USER`,
  `PAYMENT_ORDER_MAKER_USER`/`PAYMENT_ORDER_CHECKER_USER`, `USER_WITHOUT_PERM`, three
  `DISPO_OFFICER_*`, plus `INTERNAL_USER`/`EXTERNAL_USER`/`SYSTEM_USER`), all seeded out-of-band by
  a human, referenced purely by `process.env.*` id/username/password.

Neither pattern is a real "provisioning service": Pattern A is UI-only and unparameterized; Pattern
B requires manual environment seeding for every new role and offers no cleanup at all. The one
place Pattern B tries to behave dynamically —
`api/system_core/helpers/user-group-helper.ts`'s `asUserWithPermissions`/`asUserWithGroups` —
mutates a **single shared static user** (`PARTIALLY_ACCESS_USER`)'s CBS profile in place, with no
locking, relying entirely on the suite running single-worker/non-parallel
(`playwright.config.ts`'s `API-tests` project: `workers: API_TESTS_MAX_WORKERS` = `1`,
`fullyParallel: false`). This is a latent correctness risk (no mutex; any future parallelism change
would corrupt concurrently-running tests' profile state) that this design also fixes for its pilot
call sites.

Separately, `api/utils/helpers/resource-tracker.ts` (the mechanism `global-teardown.ts` uses for
safety-net cleanup) tracks only tables and table-registry groups — it has no concept of Keycloak
users at all, so a crashed test's dynamically-created Keycloak user (Pattern A) is never cleaned up
by anything but that test's own `finally`/`afterEach`.

## 2. Verified facts

- `.env.example` (tracked; `C:\Users\user\proj-test-automation\.env.example`) is the authoritative
  superset of every user/credential env var used across the framework — an individual engineer's
  local `.env` is expected to carry only the subset their own modules need (confirmed by Vadym
  2026-08-31), so absence of a var in one local `.env` is not evidence it's unused repo-wide.
- `api/utils/services/auth-service.ts` (626 lines, HEAD == `origin/main`, no drift):
  `CreateKeycloakUserOptions` (`api/types/keycloak-user.types.ts`) has **no group or
  CBS-permission field** — only `realmRoles?: string[]`, which is accepted by the shared private
  `createUserViaClient` helper but is not called by any spec in the repo today.
  `KeycloakAdminApiClient` (`api/utils/services/keycloak-admin-api-client.ts`) exposes only
  `createUser`/`findUsersByUsername`/`resetPassword`/`getRealmRoles`/`assignRealmRoles`/
  `deleteUser` — no group-membership or client-role endpoints exist. CBS-domain permissions
  (`SM.USER.GROUP~MAIN`'s `PERMISSIONS: {TABLE, FUNCTION}`) are a structurally separate API layer
  (`UserProfileApiClient`/`UserGroupApiClient` + `test-data/payload-builder.ts`'s
  `buildInternalUserProfilePayload`/`buildUserGroupMinimalPayload`), applied on top of a Keycloak
  identity, never inside it.
- Two working Keycloak-user creation paths exist: `createKeycloakUser`
  (service-account/`client_credentials`, via `resolveKeycloakContext`) and
  `createMasterAdminKeycloakUser` (master-realm password grant, via
  `resolveMasterAdminKeycloakContext`, `KEYCLOAK_ADMIN_USERNAME`/`PASSWORD`). `.env.example`'s
  comment claiming the service-account path is "currently unusable on proj-qa" (`proj-app` is a
  public client with no service account) is **confirmed stale** by Vadym (2026-08-31) — the
  service-account path works, consistent with it already being what every UI spec uses today via
  `provisionDashboardUser`.
- Benchmark from Mikhail Karaliou (2026-08-29, via `createMasterAdminKeycloakUser`/
  `deleteMasterAdminKeycloakUser`, 5 runs): create ≈ 0.65–0.9s, delete ≈ 0.5–0.6s. Full
  create+delete cycle ≈ 1.2–1.5s.
- `asUserWithPermissions`/`asUserWithGroups` (`api/system_core/helpers/user-group-helper.ts`) have
  exactly **4 call sites total** — 3 real (`api/system_core/tests/enquiry-regression.spec.ts`
  lines 5615, 5833, 5959, all inside the same `US-01.07.04 | Report Lifecycle Management` describe
  block, each with a distinct throwaway group ID) plus 1 internal wrapper
  (`asUserRestrictedToSmUser`, line 426) — not "30+" as an earlier, less precise pass estimated.
  No mutex exists; correctness depends entirely on `workers: 1`/`fullyParallel: false`
  (`api/utils/constants/api-client.constants.ts`'s `API_TESTS_MAX_WORKERS = 1`).
- Per-role identity-assertion analysis (all 16 named `USERS_DATA`/`USER_PROFILE_VALUES.USERS`
  roles): roles that assert on an exact user ID in a test's expectations (`SUCCESSFUL_USER`,
  `RESTRICTED_USER`, `PARTIALLY_ACCESS_USER`, `MAKER_USER`, `CHECKER_USER`, `INTERNAL_USER`,
  `EXTERNAL_USER`, `SYSTEM_USER`) always compare against a value known **within that same test**
  (e.g. `ST_INPUTTER`/`ST_AUTHORISER` audit fields), never across separate test runs — replacing
  the env-sourced static ID with a freshly-created user's own ID preserves the assertion's meaning.
  Roles used without any ID assertion (`DM_CHECKER_USER`, `CM_CHECKER_USER`,
  `PAYMENT_ORDER_MAKER_USER`/`PAYMENT_ORDER_CHECKER_USER`, `USER_WITHOUT_PERM`,
  `CCE_AUTHORIZER_USERNAME`) are already used as interchangeable archetypes.
  `TR_MAKER_USER`/`TR_CHECKER_USER` are defined but referenced nowhere in `api/` — dead code.
- `DISPO_OFFICER_FIRST/SECOND/THIRD` (`api/security_management/helpers/override-dispo-helper.ts`)
  form a persistent 3-tier `REPORTING_TO` hierarchy (MAJOR/SUPERIOR/UNDER_TEST), reused and mutated
  across the whole `override-dispo-*.spec.ts` suite rather than created fresh per test. Sergei
  Tsarik (team chat, 2026-08-31) recalls at least one override-dispo test needing **more than
  three** distinct officers — the assumed triad may be incomplete. Not re-verified this session
  (out of pilot scope; see §4).
- `global-setup.ts`/`global-teardown.ts` (`api/utils/fixtures/`) do not touch Keycloak users at
  all today — `global-setup.ts` only creates the run's dynamic table-registry group;
  `global-teardown.ts` only calls `cleanupTrackedResources()` (tables/groups).
  `api/utils/fixtures/api-fixtures.ts` already has a precedent for the right lifecycle shape for a
  safely-shared resource: `workerGroupId`, a **worker-scoped** fixture (not a `global-setup`-level
  singleton), created lazily once per worker.
- Sergei Tsarik (team chat, 2026-08-31): confirms the general direction ("by nature" most named
  roles are just an internal user with a group assigned), notes `EXTERNAL` users are needed (1-2)
  for user-profile-focused tests, and explicitly flags the risk this design is built around: users
  "must not get mixed up during parallel execution."
- Maryia Ilkevich (team chat, 2026-08-31, `PARTIALLY_ACCESS_USER`'s original author): confirms it
  was deliberately split out as its own dedicated static user specifically because restricting its
  access could otherwise fail other tests — i.e. the isolation problem D2/D7 fix (fresh per-test
  identity instead of a shared mutated user) was already recognized, just worked around manually
  with a single dedicated static user rather than solved structurally.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | New composable service, `api/utils/services/test-user-service.ts`, built on **both** existing layers — `auth-service.ts` (Keycloak identity) and `UserProfileApiClient`/`UserGroupApiClient` (CBS permissions) — generalizing `provisionDashboardUser`'s pattern for `api/` use. | Fixing only the Keycloak layer would not solve the actual problem (tests need `TABLE`+`FUNCTION` permissions, which live entirely in the CBS layer per §2). `provisionDashboardUser` already proves this composition works; it's UI-only and unparameterized today. |
| D2 | Provisioning granularity is chosen per call site, not fixed globally: **worker-scoped fixture** for archetypes that are stateless and never mutated (e.g. a no-permission user); **suite-scoped** (`beforeAll`/`afterAll`) where a whole `describe` block reuses one identity unchanged; **test-scoped** (`beforeEach`/`afterEach`) only where sibling tests in the same suite need genuinely different permission grants on that role. | Directly addresses the performance constraint: matching granularity to actual reuse avoids unnecessary create/delete churn (≈1.2–1.5s per cycle, §2). Defaulting everything to test-scoped would multiply that cost needlessly across suites that don't need per-test identity changes; defaulting everything to one global shared user reintroduces the exact no-mutex risk already found in `asUserWithPermissions`/`asUserWithGroups` (§1) — independently flagged by Sergei Tsarik. |
| D3 | No user creation is added to `global-setup.ts`. The one archetype safe to share (stateless, never mutated — e.g. `provisionUserWithoutPermissions()`) becomes a **worker-scoped Playwright fixture** in `api-fixtures.ts`, following the existing `workerGroupId` precedent. | `global-setup.ts` runs once, outside Playwright's worker processes — a batch created there and reused by every worker is exactly the cross-worker collision Sergei flagged as a risk of "reducing users." A worker-scoped fixture is parallel-safe by construction, with no new synchronization code needed. |
| D4 | `provisionMakerCheckerPair` creates both identities **concurrently** (`Promise.all`), not sequentially. | Halves the wall-clock cost of the most common pair-provisioning need (~0.9s vs. ~1.8s serial, per the benchmark in §2) — a direct, no-downside performance win. |
| D5 | The service defaults to `createKeycloakUser` (service-account path) — confirmed working (§2), matching existing UI precedent. `createMasterAdminKeycloakUser` remains available as an explicit opt-in for scenarios genuinely needing master-realm-admin Keycloak operations (e.g. the real `SM.USER~EXTERNAL` linking flow from TB-1740/#1840). | Keeps the default path consistent with what's already proven in production UI use; avoids requiring `KEYCLOAK_ADMIN_USERNAME`/`PASSWORD` to be configured for the common case. |
| D6 | `resource-tracker.ts` gains Keycloak-user tracking (`trackCreatedUser`/`untrackUser`, mirroring existing table/group tracking); `global-teardown.ts`'s `cleanupTrackedResources()` sweeps any still-tracked users and `console.log`s each one's userId/username/realm before deleting. | This is a **safety net** for leaked/crashed cleanup, not the primary teardown path (primary path stays each suite/test's own explicit `deprovisionUser` call) — satisfies the transparency ask (visible log of what got swept) without making global-teardown the main cleanup mechanism, which would reintroduce the shared-lifetime problem D2/D3 avoid. |
| D7 | Pilot scope: build the service (D1) + the worker-scoped no-permission fixture (D3) + migrate `enquiry-regression.spec.ts`'s 3 `asUserWithGroups` call sites off `PARTIALLY_ACCESS_USER` onto fresh per-test users. Everything else (§7) is a follow-up ticket. | Small, fully-cataloged blast radius (§2: only 4 call sites total, 1 file) that directly retires a documented latent-risk pattern, proving the architecture end-to-end without the larger risk/effort of migrating all ~69 static-user specs in the same change. |
| D8 | The service's public surface is parameterized, not named-role-shaped: `provisionUser({ permissions?, groups?, companyCodes?, profileType? })`, `provisionUserWithoutPermissions()`, `provisionMakerCheckerPair({ permissions })`, paired `deprovisionUser(user)`. No `SUCCESSFUL_USER`/`MAKER_USER`/etc.-style named exports. | Per-role analysis (§2) found the ~14 still-used named roles differ only in their permission grant, not structurally — parameterizing collapses them into a handful of composable primitives instead of reproducing a new fixed roster under a different mechanism. |

## 4. Open questions / follow-up (not blocking this pilot)

- **DISPO_OFFICER hierarchy size.** Sergei Tsarik recalls a test needing more than the assumed
  3-officer triad. Needs direct verification (read every `override-dispo-*.spec.ts` test, not just
  the ones already sampled) before any future DISPO migration is scoped.
- **`RESTRICTED_USER`** (`security_management`/override-dispo) uses a save/restore-profile pattern
  structurally similar to `PARTIALLY_ACCESS_USER`'s — a good candidate for the fresh-user treatment
  in a later ticket, once DISPO itself is tackled (they're coupled: `RESTRICTED_USER` is used
  inside `override-dispo-regression.spec.ts`).
- **`ui/utils/helpers/dashboard-user.ts`'s `provisionDashboardUser`** could be refactored to
  delegate to the new shared service (dedup of the same two-layer composition). Deferred — not
  required for the pilot, and touches the UI suite which is out of this ticket's scope.
- **Full migration** of the remaining ~65 static-`USERS_DATA` API specs onto the new service is
  its own, larger, separately-scoped follow-up under TB-2798.

## 5. Changes by file

- `api/utils/services/test-user-service.ts` — **new**. `provisionUser`, `provisionUserWithoutPermissions`,
  `provisionMakerCheckerPair`, `deprovisionUser` (D1, D4, D5, D8).
- `api/utils/helpers/resource-tracker.ts` — extend with `trackCreatedUser`/`untrackUser` (D6).
- `api/utils/fixtures/global-teardown.ts` — extend `cleanupTrackedResources()`'s sweep to include
  tracked Keycloak users, with the transparency `console.log` (D6).
- `api/utils/fixtures/api-fixtures.ts` — new worker-scoped `noPermissionUser` fixture, alongside
  the existing `workerGroupId` (D3).
- `api/system_core/tests/enquiry-regression.spec.ts` — migrate the 3 `asUserWithGroups` call sites
  (TC-1016, TC-1803, TC-1797) to `test-user-service.ts` instead of mutating `PARTIALLY_ACCESS_USER`
  (D7).
- `api/system_core/helpers/user-group-helper.ts` — `asUserWithPermissions`/`asUserWithGroups` stay
  in place (still used by `asUserRestrictedToSmUser` and available for any spec not yet migrated),
  but gain a comment pointing future callers at `test-user-service.ts` instead.

## 6. Testing / validation plan (for the implementation plan to schedule; the user runs all tests manually)

1. Before wiring the pilot, empirically re-confirm `createKeycloakUser` (service-account path)
   succeeds against `proj-qa` — D5 relies on Vadym's recollection that the `.env.example` warning is
   stale, not on a fresh empirical check this session.
2. After migrating `enquiry-regression.spec.ts`, confirm all three tests (TC-1016, TC-1803,
   TC-1797) still pass using fresh per-test users instead of the shared `PARTIALLY_ACCESS_USER`
   mutation.
3. Confirm `global-teardown.ts`'s new sweep actually logs deleted users clearly (manual review of
   console output on one full local run, including a deliberately-crashed test to prove the safety
   net fires).
4. Time `enquiry-regression.spec.ts` before/after migration to confirm the added overhead lands in
   the expected ≈1.5s × 3 ballpark (§2's benchmark) rather than something worse (e.g. CBS
   permission-propagation-related retries inflating it further).

## 7. Out of scope

- Migrating the remaining ~65 API specs off the static `USERS_DATA` roster.
- The `DISPO_OFFICER` hierarchy (own persistent mutate-restore semantics; needs its officer-count
  question resolved first — §4).
- Refactoring `provisionDashboardUser` (UI) to delegate to the new service.
- Any change to Keycloak realm roles or groups (unused today; CBS-domain groups remain the only
  permissioning mechanism this design touches).
