# Architecture

**TL;DR.** `api/<module>/{client,helpers,tests}` on top of `BaseApiClient`, shared infra in `api/utils/`
(constants, fixtures, helpers, paths, services); `ui/` is organized by module (`base`, `system_core`,
`security_management`, `document_management`, `customer`) with specs under `sub_modules/<name>/tests/`. One
global setup provisions a run-scoped K8s table group; tests also assert directly against Postgres.
Parallelism is defined only in `parallelization-readiness.md`.

How this repository is actually laid out and why, based on the current `api/` and `ui/` trees.
See `docs/frame-specs/testing-standards.md` for per-module test maturity (several modules below
are scaffolded but not yet implemented — this file describes the *pattern*, not a claim that
every module fully uses it yet).

## Top-level layout

```
api/
  <module>/                    # one folder per CBS microservice/domain module, snake_case
    client/
      <module>-api-client.ts   # typed class wrapping APIRequestContext calls for this module
    helpers/                   # multi-call orchestration helpers (create-and-wait, setup flows)
    tests/
      *.spec.ts                # Playwright specs, kebab-case, one per feature/suite
    <module>-api-paths.ts      # endpoint path registry for this module (see api-conventions.md) —
                                # system_core is the one exception: its registry outgrew a single
                                # file and lives in its own paths/ subfolder instead (see below)
  types/
    *.types.ts                 # ALL shared request/response TypeScript types, one file per entity family
  utils/                       # cross-module infrastructure, split by concern (see "Shared infra" below):
    constants/                 # env-derived values, keepers/waiters, HTTP status enums
    fixtures/                  # Playwright test.extend fixtures, global setup/teardown
    helpers/                   # reusable cross-module helpers (DB, polling, cleanup, assertions)
    paths/                     # cross-module path registries (GLOBAL_API_PATHS, auth, keycloak-admin, kafka)
    services/                  # client/service classes (BaseApiClient, auth, kafka, keycloak-admin)
test-data/
  payload-builder.ts           # factory functions building request payloads with sane defaults + overrides
  interest-and-charges-payload-builder.ts, parametrisation-payload-builder.ts   # domain-specific payload factories
  files/                       # static fixture files
scripts/                       # ts-node maintenance scripts (cleanup, allure id checks) + test-scripts/ (run-on-vm, run-suite, find-*), not part of the Playwright run
ui/                            # Playwright UI specs and page objects, organized by module (see "UI layer" below)
```

Module folders present today (`ls api/`): `account`, `action_processing`, `cob`, `consolidation_engine`,
`customer`, `document_management`, `fin_accounting`, `integration_chapter`, `interest_and_charges`,
`limit`, `product_factory`, `security_management`, `soft_accounting`, `system_core`, `teller`,
`transfer` (plus the non-module folders `types/`, `utils/`, `test-results/`). Not every module folder
is fully implemented — `cob` is still an empty stub (see `testing-standards.md`). There is no
`api/kafka/` module: Kafka is driven through a shared fixture in `api/utils/` — see "Kafka layer" below.

A module folder can itself nest a sub-module folder one level down (same `client/`+`helpers/`+
`tests/`+`<name>-api-paths.ts` shape, just under `<module>/<sub-module>/` instead of directly under
`api/`) when that sub-module's client/tests are used exclusively by, or belong domain-wise to, one
parent module — e.g. `system_core/field-definition/` (the Field Registry client, consumed only by
`system_core`'s DDD/Customization/Projection-Forms suites) and `product_factory/negotiation_rules/`
(every projection it drives is `PF.*`-namespaced). `interest_and_charges/charges_calculation_engine/`
is the original example of this nesting. Corrected 2026-08-27 (TB-2960) — `field-definition` and
`negotiation_rules` had drifted to top-level `api/` folders; moved back under their owning module
after a live structure review with the team's tech lead.

## Layered client pattern

```
BaseApiClient (api/utils/services/base-api-client.ts)
  ├─ get/post/put/delete()      — thin wrappers over APIRequestContext, with retry logic
  └─ requestWithRetry()         — private: retries on 5xx and specific transient 400s
        │
        ▼
<Module>ApiClient extends BaseApiClient   (e.g. TableRegistryApiClient, PFApiClient)
  ├─ constructor(request, authHeader?, options?)
  └─ one method per business operation (createGroup, performRecordOperation, seePfClass, ...)
        │  — every method calls this.post/get/put/delete(SOME_API_PATHS.X.Y(...), payload, headers)
        │  — never calls `this.request.<verb>` directly except for explicit noRetry escape hatches
        ▼
*.spec.ts
  └─ instantiates the client from a fixture-provided `authenticatedApiContext`
  └─ never calls `apiContext`/`request` directly for business calls
```

`BaseApiClient` retries indefinitely-ish (default 80 attempts / 3s delay, both overridable via
`API_CLIENT_RETRIES`/`API_CLIENT_RETRY_DELAY` env vars or constructor `options`) on any 5xx and on
a few known-transient 400 bodies (`Unknown projectionId`, `Unknown tableId`, `does not have access
to table`) — this exists because table/projection provisioning is asynchronous (a table's K8s-backed
schema can take real time to reconcile after `createTable`). A handful of client methods expose a
`{ noRetry: true }` option or a `*NoRetry` variant specifically to assert on the *un-reconciled*
state (e.g. testing that an operation correctly 403s before assuming eventual consistency masks it).

## Token lifecycle and 401 handling (`api/utils/services/token-service.ts`)

Every `APIRequestContext` built by `auth-service.ts`'s `createAuthenticatedApiContext` (default
env user or an explicit `username`/`password` override) or `createUserAuthenticatedApiContext`
(always a named user) registers its login credentials in a `WeakMap<APIRequestContext,
{username, password}>` inside `token-service.ts`. Contexts built with no real login — an
unauthenticated/invalid-token probe (`createUnauthenticatedContext`, a raw `newContext()`), or a
raw `accessToken` override — are never registered.

`BaseApiClient.requestWithRetry` reacts to a `401` by calling `refreshContextToken(this.request)`:

- If the context isn't registered (`isRefreshableContext` is `false`), the `401` is returned to the
  caller as-is — this is what keeps unauthenticated/invalid-token negative tests correct instead of
  silently "fixed".
- If it is registered, `token-service.ts` re-authenticates as **that context's own identity**,
  coalescing concurrent 401s on the same context onto one Keycloak call
  (`WeakMap<APIRequestContext, Promise<string>>`), and caches the refreshed token per context
  (`WeakMap<APIRequestContext, string>`) for `getHeaders()` to apply on subsequent requests.

Because the cache and the credentials map are both keyed by the `APIRequestContext` object itself
(not a single process-wide variable), a test using several identities at once (e.g. a MAKER and a
CHECKER context for a 4-eyes flow) refreshes each independently — one identity's expired token
never gets silently swapped onto another identity's requests. This replaced an earlier design
(pre-2026-08-19) that cached one shared `overrideToken` for the "default env user" only, gated by a
manually-passed `respectsGlobalTokenOverride` constructor option that every named-identity client
had to remember to set to `false`.

The actual Keycloak token-endpoint call (both the initial login in `auth-service.ts`'s
`fetchKeycloakToken` and the refresh in `token-service.ts`'s `getAuthToken`) goes through
`withKeycloakLoginRetry` (3 attempts, 750ms apart) — Keycloak occasionally rejects a login under a
burst of concurrent requests, including a spurious `401 Invalid user credentials` even when the
credentials are correct; see `docs/common-issues/keycloak-and-auth/keycloak-transient-login-401.md`.

**Parallelism (see `docs/frame-specs/parallelization-readiness.md`, the single definition):** the
caches described above (all `WeakMap`s keyed by `APIRequestContext`) are safe at any worker count —
each Playwright worker is its own process, so a `WeakMap` is inherently per-worker, never
cross-worker shared state. `playwright.config.ts` splits API specs into `API-tests` (workers from
`API_TESTS_PARALLEL_WORKERS`, env-driven, default 1) and `API-tests-singleton` (the specs listed in
`api/utils/constants/singleton-record-specs.ts` that capture/mutate/restore a system-wide record such
as `SYSTEM.PARAMETER`/`COMPANY`, one worker). The remaining tradeoff at higher worker counts is that
`token-service.ts`'s Keycloak credential-failure breaker and `base-api-client.ts`'s upstream-health
breaker are per-worker-process, so N workers can send up to Nx the retry volume against a bad
credential/unhealthy backend before any one breaker opens.

## Fixtures

`api/utils/fixtures/api-fixtures.ts` extends Playwright's base `test` with:

- `authenticatedApiContext` (test-scoped) — a Keycloak-authenticated `APIRequestContext` against
  `BASE_URL`, created via `createAuthenticatedApiContext` (`auth-service.ts`) and disposed after
  each test.
- `workerGroupId` (worker-scoped) — resolves the shared "table group" ID created once per test run
  by `global-setup.ts` (see below), so tests don't each pay the cost of provisioning a new K8s-backed
  group.

Individual spec files further `test.extend` this base `test` with module-specific client fixtures
(see `api/integration_chapter/tests/sms-system-core.spec.ts` for the fullest example: it wires up
`userProfileClient`, `tableRegistryClient`, `fieldDefinitionApiClient`, `userGroupClient` as
test-scoped fixtures backed by the shared `authenticatedApiContext`).

## Global setup / teardown (`api/utils/fixtures/global-setup.ts`, `global-teardown.ts`)

Registered in `playwright.config.ts` (`globalSetup`/`globalTeardown`), these run **once per whole
Playwright invocation**, not per worker:

1. Probe `BASE_URL` for reachability; write a sentinel file (`test-results/setup.ok`) that other
   consumers check before assuming the environment is usable.
2. Run opportunistic cleanup of orphaned schemas/stale groups from previous failed runs
   (`group-cleanup-helper.ts`).
3. Resolve or create the run's shared **table group** (`DYNAMIC_GROUP_ID`):
   - Local dev (non-CI): reuse an existing `AQA_GROUP_*`/`QA_GROUP_*` group if one exists, to skip
     expensive provisioning on every local run.
   - Otherwise: `POST` a new group via `TableRegistryApiClient.createGroup`, which triggers a
     Kubernetes `table-template` deployment sized by `replicaCount`.
4. Create a bootstrap table inside that group and poll the database directly (`information_schema.tables`)
   for up to 300s, waiting for the pod-provisioned schema to appear — this is a real infra
   dependency (AKS cold starts), not a fixed sleep.
5. Persist `DYNAMIC_GROUP_ID` to `process.env` (inherited by worker processes) and to
   `test-results/dynamic-group-id.txt` as a cross-process fallback (read back by
   `group-helper.ts#getDynamicGroupId`).

Teardown (`cleanupTrackedResources`, `api/utils/helpers/resource-tracker.ts`) deletes only resources
explicitly tracked during the run (`trackCreatedGroup`/`trackCreatedTable`, appended to
`test-results/tracked-resources.jsonl`) — and only runs destructively on CI; local runs skip cleanup
entirely to preserve the reused group/schemas for the next local run.

## Direct database verification

Tests do not only assert on HTTP responses — many assert directly against Postgres
(`api/utils/helpers/db-helper.ts`, `createDbClient()`) to verify the actual physical state of a
table's `liv`/`nau`/`his` schema rows, `seq_no` values, and cross-schema isolation between
companies. This is a deliberate architectural choice specific to this domain: the CBS record
lifecycle (draft → authorized → historical) is only fully observable at the database layer, not
just through the API's `SEE` response. See `docs/project-spec/business-rules.md` for what these
spaces mean.

`db-helper.ts#isTestOwnedSchema` guards every destructive DB operation: a schema is only droppable
if its name contains a 13-digit millisecond timestamp or starts with `qa_`/`pr_` — this prevents
test cleanup from ever touching a real application schema.

## UI layer

`ui/` is organized **by feature module**, mirroring `api/`'s per-module convention. Tree below
verified 2026-10-07 against the working-tree branch `group-3/TB-4295` (not `origin/main`).
`playwright.config.ts`'s `UI-Chromium` project has `testDir: './ui'` + `testMatch:
'**/tests/*.spec.ts'` (`workers: UI_TESTS_PARALLEL_WORKERS`, `fullyParallel: false`, `timeout:
UI_TEST_TIMEOUT_MS`, own `locale`/`trace` config — mirroring `API-tests`'s overrides for the same
"don't let the top-level fullyParallel:true duplicate worker-scoped fixture setup" reason):

```
ui/
  base/                        # shared foundation, not a CBS module
    pages/base-page.ts         # BasePage: defaultUrl/gotoOptions via constructor, goto()/assertUrl()/waitForUrlPattern()
    components/base-component.ts  # BaseComponent (page + root Locator) + DynamicBlock interface
    interactions/antd-virtualized-dropdown.ts # AntD virtualized-select driver — NOT a BaseComponent
                                   # (its trigger Locator differs per call, so there is no single root)
    fixtures/{base-ui-test,worker-preconditions}.ts   # base-ui-test.ts is the SOLE test entry point for every UI spec
    constants/{base-url,ui-timeouts,ui-workers}.ts
    auth/                      # login/company-selection/first-login: pages/, helpers/ (login-flow, first-login-flow,
                               # dashboard-user), fixtures/auth-ui-test.ts, auth-ui-paths.ts
    shell/                     # dashboard shell: pages/dashboard-shell-page.ts, helpers/dashboard-flow.ts, shell-ui-paths.ts
    tests/ui-health-check.spec.ts
  utils/{selector-helpers,assertion-helpers}.ts   # only what every module needs
  system_core/                 # mirrors api/system_core
    pages/ components/ helpers/ fixtures/ constants/ types/ test-data/   # ALL of the module's page objects, modals,
                               # flows, setup fixtures, pure data and scenario closures, shared by every sub-module
    system-core-ui-paths.ts    # the module's single UI path registry
    sub_modules/<name>/tests/  # specs only: basic_customization, customization, dates_holidays,
                               # dynamic_data_dictionary, idempotency, projection_forms
  security_management/         # mirrors api/security_management
    pages/ helpers/ fixtures/ constants/ types/ test-data/, security-management-ui-paths.ts
    sub_modules/{access_administration,override_dispo,user_profile}/tests/
  document_management/         # mirrors api/document_management
    pages/ helpers/ fixtures/ constants/, document-management-ui-paths.ts
    sub_modules/dm_compliance_engine/tests/
  customer/                    # mirrors api/customer (TB-3542, added 2026-10-08)
    pages/ helpers/ fixtures/ constants/   # no own ui-paths file: runtime routes come from SYSTEM_CORE_UI_PATHS.PROJECTION_RUNTIME
    sub_modules/customer_party_data/tests/   # EP-03.01 Customer (Party) Data: regression 62 TCs + smoke 46 TCs
```

Rule encoded by the tree: a `sub_modules/<name>/` folder holds **only `tests/`**; pages, components,
helpers, fixtures, constants, types and test-data sit one level up at the owning module, so no
sub-module depends on another sub-module's folder, and everything imported by more than one module
(login/company-selection pages, dashboard shell, `dashboard-user`, `login-flow`, `auth-ui-test.ts`)
lives in `ui/base/`. Module assignment follows the `api/` twin. 30 specs exist under `ui/` today.

**History, do not reproduce.** The earlier per-feature layout (`ui/auth`, `ui/field-registry`,
`ui/schedule`, `ui/override-dispo`, `ui/health-check/`) and a TB-4377 variant of the
`ui/system_core/sub_modules/<name>/{tests,fixtures}` layout (sub-modules owning their own fixtures)
were introduced and rolled back; the owner reverted that restructuring and another QA owns any
further UI restructuring, so do not re-introduce it. Paths quoted in older docs, in dated entries
of `parallelization-readiness.md` and in `docs/chat-history/` use those superseded folders.

Conventions this structure encodes:

- **One `<module>-ui-paths.ts` per module** (not one shared `ui/ui-paths.ts`), same as each `api/`
  module owns its own `*-api-paths.ts`.
- **Pages are shared across all sub-modules of a module** — `TableRegistryPage` is reached by several
  sub-modules' tests alike; with all pages in `system_core/pages/` no sub-module
  depends on another sub-module's folder.
- **Component Objects (`BaseComponent`) exist for anything scoped to a sub-region of a page, or for
  a whole page/modal that has no URL of its own** — `CreateFieldModal` itself extends
  `BaseComponent` (not `BasePage`) and composes 4 block components, each implementing the shared
  `DynamicBlock` interface so the parent can type its `type → block` map directly instead of
  hand-wrapping each block into an ad-hoc object literal. **Naming rule this enforces: a class named
  `*Page` always extends `BasePage`; a `BaseComponent` subclass is named `*Block` or a plain noun,
  never `*Page`** — the class was originally `CreateFieldModalPage` (renamed 2026-09-09) precisely
  because that name implied a `BasePage` it didn't extend.
- **A driver with no single root Locator (a different trigger per call) is a plain class under
  `ui/base/interactions/`, not a forced-fit `BaseComponent`** — `AntdVirtualizedDropdown` is the
  only current example; document the reason inline if a future one is added.
- **Pure API-orchestration code, even when only a UI fixture currently calls it, lives in `api/`,
  not `ui/`** — the dividing line is "does it touch `Page`/`Locator`", not "who currently calls it".
  `waitForTableDefinitionProperties`/`previewBody` moved into
  `api/system_core/helpers/table-registry-helper.ts`; `previewBody` itself was then further
  consolidated into `api/utils/helpers/error-format-helper.ts` (which already owned `describeError`)
  since `auth-service.ts` had an independent near-duplicate — one shared implementation now, not three.
  Second confirmed instance of the same pattern (2026-09-09): `updateTableDefinitionWhenWritable`
  (the 502/503/504 + "Unknown tableId" + expired-JWT retry loop for `PUT /definitions`) lived in
  `ui/system_core/fixtures/field-registry-setup.ts` with nothing UI-specific about it — moved into
  `table-registry-helper.ts` too, same signature, with its `MIN_PROPERTY_WAIT_MS` constant relocated
  to `api/utils/constants/constants-waiter.ts` as `TABLE_DEFINITION_MIN_PROPERTY_WAIT_MS` next to its
  three sibling `TABLE_DEFINITION_*` budgets. When a UI fixture's setup helper is mostly retry/polling
  logic against an API client, check whether it belongs in the api-side helper for that client instead.
- **`constants/*.values.ts` holds only pure data — business logic (closures that drive a page/modal)
  lives in a sibling `test-data/*.scenarios.ts`.** `field-registry.values.ts` used to hold both, plus
  a `FIELD_TYPE_UI_LABELS` identity-map wrapper around `FIELD_CONSTS.X_TYPE` that had silently gone
  stale (missing the `ARRAY` type) — deleted in favor of using `FIELD_CONSTS.X_TYPE.<X>` directly,
  since the map's keys always equalled its values.
- **A test user is provisioned via one of two `ui/base/fixtures/auth-ui-test.ts` fixtures, never a
  module-level `let testUser` + manual `beforeEach`/`afterEach`** — this is now the pattern in every
  auth/field-registry spec except the company-timezone spec (see its own note below). Which fixture depends on
  whether the spec needs a real CBS profile:
  - **`dashboardUser`/`dashboardUserOptions`** (`test.use({ dashboardUserOptions: {...} })`-configurable)
    — a full CBS-provisioned user. `provisionDashboardUser` (`ui/base/helpers/dashboard-user.ts`) is a
    thin adapter over `api/utils/services/test-user-service.ts`'s `createTestUser` (the same dynamic,
    tracked, non-hardcoded user-provisioning service 46+ files under `api/` already use), not a
    parallel `createKeycloakUser`-based implementation — the previously-duplicated `withMaskedPassword`/
    `getGlobalAdminContext` are gone from `ui/` in favor of importing `test-user-service.ts`'s own
    exports. `CreateTestUserOptions` gained a `profileOverrides` field (merged over its own
    `GROUPS`/`COMPANY_CODES`, with `{ GROUPS: undefined }` specifically opting a user out of any
    owned/joined group) to make this possible without changing behavior for the service's other
    existing callers.
  - **`temporaryKeycloakUser`/`temporaryKeycloakUserOptions`** (2026-09-09) — a bare Keycloak identity
    with **no** CBS profile, for the 3 specs that must never let their user reach one (they test
    rejected/temporary-password Keycloak logins, a state `dashboardUser`'s `createTestUser` always
    provisions past). This is a genuine second precondition shape, not duplication of `dashboardUser`
    to be merged away — don't collapse the two. It replaced those 3 specs' own hand-rolled
    `createKeycloakUser`/`trackCreatedUser`/`deleteKeycloakUser`/`untrackUser` `beforeEach`/`afterEach`
    boilerplate with the same try/finally-cleanup fixture shape `dashboardUser` already uses. Both
    fixtures live in one `auth-ui-test.ts` file (not a 4th fixture file) — Playwright fixtures are
    lazy, so a spec using only one only provisions that one.
- **`eslint.config.mjs`'s `playwright/no-wait-for-timeout` covers `ui/**/*.ts`, not just
  `tests/**`/`**/tests/**`** — a hard wait hidden inside a page object or component is exactly as
  flaky as one inlined in a test body. The handful of legitimate waits with no better observable
  signal (AntD's virtualized-list scroll settle, the search-input debounce) are explicit, justified
  `eslint-disable-next-line` exceptions instead of a silent blanket gap.

### Review findings folded in (2026-09-09, same day as the reorg)

An independent Opus-level review of the reorg (requested explicitly, at full rigor) found 7 issues
in a first automated pass — most seriously, `playwright.config.ts` still pointed `testDir` at the
now-empty `ui/tests`, which would have silently run zero UI tests in CI — plus ~30 further findings
on a second, deeper pass (architecture consistency, per-class/per-test template drift, the
`dashboardUser` migration, browser config completeness, logging/traceability). All were triaged and
fixed the same session; see `docs/chat-history/` for the full finding-by-finding list if a future
session needs the detailed rationale for any specific one. One item was deliberately **not**
changed, on record: two `npm run test:ui:*-m1` scripts / matching CI jobs with zero currently-tagged
UI tests were left in place rather than deleted, since they may be intentional scaffolding for a
not-yet-written milestone-1 UI suite (mirroring `api/`'s own m1/m2 split) rather than dead config —
a call for the project owner, not to be made unilaterally.

**A third, even deeper independent pass (also Opus, also the same day) scored the result (1-10:
architecture 7, transparency 8, best-practice adherence 7.5) and found 2 genuine bugs plus several
smaller findings, all fixed:**
- **Real bug:** `company-timezone-enforcement.spec.ts`'s working-hours window clamped `endHour` to
  23 instead of letting the window extend to `23:59:59`, so any run starting in the 23:00-23:59 UTC
  hour (local midnight in CBS's region) computed a window that had already expired by the time the
  test executed — a deterministic false failure blamed on a timezone regression that didn't exist.
- **Real bug:** `field-registry-setup.ts`'s remaining-budget threading (added in the second review
  round) assumed `TABLE_DEFINITION_WRITE_TIMEOUT_MS` (120s) bounds the time already spent — but the
  client call it wraps internally waits up to `TABLE_API_READY_MAX_WAIT_MS` (150s), which is
  *larger*. On a slow-but-successful attempt, "remaining" could already be negative, collapsing the
  nested property-propagation wait to one second and failing the whole worker's field-registry
  suite with a misleading "timed out" message. Fixed with an independent `MIN_PROPERTY_WAIT_MS`
  floor (30s) instead of a floor derived from the same unreliable clock.
- **`TableRegistryPage` (in `ui/base/shell/`) renamed to `DashboardShellPage`** — git history shows an
  in-flight branch (`UI-Test-implementation--Table-Registry---Regression`) building a genuine Table
  Registry *feature* module; left un-renamed, the tree would gain two unrelated "Table Registry"
  classes on merge. This also confirmed the redesign empirically: that branch, with no base classes
  to inherit, hand-rolled its own `base-modal-page.ts`/`searchable-select.ts` — a duplicate,
  divergent `BaseComponent`/`AntdVirtualizedDropdown`.
- Smaller fixes: `ui-health-check.spec.ts` now checks `UI_BASE_URL` (was `https://innowise.com/`,
  which never verified CBS at all) with no swallowed error; a dead `AUTH_POST_LOGOUT_SETTLE_TIMEOUT_MS`
  constant wired into its intended call site; an asymmetric-dispose bug in
  `provisionFieldRegistryPreconditions`'s error path (a twin of one already fixed on the success
  path) given the same `try/finally` treatment; the `base-ui-test.ts`/README wording corrected from
  "test/expect" to "test" (the real rule — `expect` has no such constraint and is imported straight
  from `@playwright/test` in page/component objects to avoid import cycles); the
  `company-timezone-enforcement.spec.ts` exception to the `dashboardUser`-fixture convention is now
  spelled out in the README instead of being silently different.

Real coverage today (unchanged by the reorg — same tests, same behavior): login flows (invalid
credentials, first-login temp password, cross-tab logout, back-button-after-logout), company
selection, field registry, and company-timezone enforcement — see
`docs/frame-specs/testing-standards.md` for the up-to-date list and for a noted convention gap (UI
specs still do not follow the API side's Story-scoped `describe` nesting — left open, see below).

## Kafka layer

Kafka is not an `api/` module (there is no `api/kafka/` folder) and does not follow the
client/helpers/tests module shape — there is no `KafkaApiClient`, no `<module>-api-paths.ts`. Instead, every test gets a fresh, self-cleaning
`kafkaService` fixture (`api/utils/services/kafka-service.ts`, wired in
`api/utils/fixtures/api-fixtures.ts`) that wraps `kafkajs` for produce/consume/topic lifecycle, with
its own path registry (`api/utils/paths/kafka-paths.ts`) and constants
(`api/utils/constants/kafka-ui.values.ts`) living in the shared `utils/` tree; module specs (for example `consolidation_engine`, `transfer`,
`integration_chapter`) consume the `kafkaService` fixture directly. See the root
`README.md`'s "Kafka Testing" section for the full fixture API and CI wiring — not duplicated here.

## API service map (as reached by module clients)

Endpoint path prefixes actually observed in `*-api-paths.ts` files — this is the current routing,
not a spec:

| Prefix | Service | Reached by |
|---|---|---|
| `table-registry/api/v1/...` | Table Registry (groups/tables control plane) | `system_core` (`TableRegistryApiClient`'s group/table/company endpoints) |
| `tables/api/v1/projections/...`, `tables/api/v1/tables/...` | Table Template (runtime engine: projections, record operations, definitions, hooks, rules) | `system_core`, `product_factory` |
| `field-registry/api/v1/fields` | Field Registry (field catalogue) | `system_core/field-definition` |
| (module-specific) | Customer as a standalone service | `customer` — `CustomerApiClient` is a thin 22-line wrapper (`performRecordOperation` only), but the module holds 4,554 spec lines + a real `customer-party-helper.ts` (375 lines) + its own path registry as of 2026-09-15 |
| (module-specific) | Security Management as a standalone service | `security_management` — the *named* `SMApiClient`/`sm-api-paths.ts` are still empty shells, but the module holds 8,220 spec lines + a real `OverrideDispoApiClient` + `override-dispo-helper.ts` (1,073 lines) + `access-administration-helper.ts` (515 lines) as of 2026-09-15 |
| (module-specific) | Account as a standalone service | `account` — real, and the largest of the three: 14,235 spec lines, `account-contract-setup-helper.ts` (1,178 lines), full `balance_management/` sub-module |
| `tables/api/v1/...` (COB) | COB as a standalone service | `cob` — still a genuine empty stub as of 2026-09-15 (`cob-api-paths.ts` is 0 bytes, `CobApiClient` is an empty class) |
| (module-specific) | Financial Accounting (Entry Generation) | `fin_accounting` (`FinAccApiClient`) — implemented, see `testing-standards.md`'s maturity table |
| (module-specific) | Limit Hierarchy / Group Limits (EP-09.01) | `limit` — `LimitApiClient`, `limit-api-paths.ts`, `limit-setup-helper.ts`, `limit-linkage-helper.ts` (INTERNAL-projection limits, zero-balance accounts, `LI.LIMIT` Kafka event counts), `limit-scenario.ts` (the US-09.01.04 link-customers-to-group scenario), `limit-payload-builder.ts`; one spec, `limit-hierarchy-smoke.spec.ts` (in `SINGLETON_RECORD_SPECS`), with one `describe` per Story (US-09.01.01..04) |
| Kafka broker (topics, not HTTP) | Event/messaging backbone | the `kafkaService` fixture in `api/utils/` (not a `*ApiClient`, no module folder) — see "Kafka layer" above |

`api/utils/paths/api-paths.ts` (`GLOBAL_API_PATHS`) holds the small set of paths shared across
modules (e.g. `TABLE_REGISTRY_GROUPS`, `TABLES`). Module-owned paths live in each module's own
`*-api-paths.ts`, per the "API paths maintenance" convention in the root `README.md` — except
`system_core`, whose registry is split across `api/system_core/paths/sys-core-api-paths.ts`,
`plugin-manager-api-paths.ts` and `currency-engine-api-paths.ts` instead of one file.
