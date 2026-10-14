# Testing Standards

**TL;DR.** Three Playwright projects (`API-tests`, `API-tests-singleton`, `UI-Chromium`), every test
carries a scope tag and a layer tag, `TC-<allureCaseId>` naming, Story-scoped `describe`, mandatory
assertion messages, dynamic unique ids. Check the per-module maturity table before assuming a module
is implemented (`cob` is the only stub). Tests are run only after the owner names the environment; otherwise the framework only writes and statically verifies them.

## Test levels present in this repo

Three Playwright **projects** exist (`playwright.config.ts`): `API-tests` (`testDir: ./api`,
matches `**/tests/*.spec.ts`, minus `SINGLETON_RECORD_SPECS`), `API-tests-singleton` (the same `testDir`,
matching only `SINGLETON_RECORD_SPECS`, one worker — see `parallelization-readiness.md`) and
`UI-Chromium` (`testDir: ./ui`, matches `**/tests/*.spec.ts`). There is no separate
unit-test runner/project — this repo is exclusively integration/API/UI-level, exercised against a
real deployed CBS environment (QA/STAGE), a real Keycloak instance, and a real Postgres database.
Nothing here is mocked at the HTTP or DB layer.

## Tag taxonomy (mandatory, enforced by convention not by CI lint)

Every test must carry at least one tag from each axis (root `README.md`):

| Axis | Tags |
|---|---|
| Scope | `@smoke_m1`, `@smoke_m2`, `@smoke_m3`, `@regression_m1`, `@regression_m2`, `@regression_m3`, `@integration`, `@e2e` (plus `@health-check`, used for the dummy connectivity checks below) |
| Layer | `@api`, `@ui` |

Tags map directly to `npm run test:api:<tag>` / `test:ui:<tag>` scripts and to which GitLab CI job
picks up a suite — see `docs/frame-specs/infrastructure.md`.

## Current automation maturity by module (read before assuming a module is implemented)

This matters for anyone picking up an automation task: don't assume every module folder under
`api/` is equally built out.

| Module | State | Evidence |
|---|---|---|
| `system_core` | **Fully implemented.** Table Registry, Dynamic Data Dictionary, User Group, User Profile, Validation Engine, System Parametrization, Audit Fields all have real clients, helpers, and smoke+regression specs (dozens of `TC-NNN` cases each) | `api/system_core/**` |
| `product_factory` | **Fully implemented.** `PFApiClient` covers PF.CLASS/TYPE/PRODUCT/BUILDER/MANAGER/CATALOG; smoke + regression specs. Nests the `negotiation_rules` sub-module (see below) | `api/product_factory/**` |
| `product_factory/negotiation_rules` | **Implemented.** `NegotiationRulesApiClient` covers PF.COMPARISON.TYPE/PRODUCT.ACCOUNT.CONDITION/PRODUCT.DORMANCY.CONDITION/TYPE/ATTRIBUTE/BUILDER/MANAGER/CATALOG/QA_DATED_CCY.CONDITION; `pf-nrte-smoke.spec.ts` + `pf-nrte-regression.spec.ts`. Nested under `product_factory` since 2026-08-27 (TB-2960) — was a stray top-level `api/negotiation_rules` before | `api/product_factory/negotiation_rules/**` |
| `system_core/field-definition` | **Implemented** as a thin client wrapping the Field Registry `fields` endpoint; consumed by `system_core`'s DDD/Customization/Projection-Forms suites and reached from `security_management`/`integration_chapter` the same way they reach `system_core` itself. Nested under `system_core` since 2026-08-27 (TB-2960) — was a stray top-level `api/field-definition` before | `api/system_core/field-definition/**` |
| `security_management` | **Partially implemented.** `SMApiClient` itself is still an empty class, and `tests/health-check.spec.ts` is still a generic placeholder `@health-check` ping — but `tests/override-dispo-smoke.spec.ts` (TB-2083) is a real, 53-case (`TC-01`–`TC-53`) smoke suite for Override and Dispo Processing (module 02.05), with its own `helpers/override-dispo-helper.ts`/`payload-builder-override-dispo.ts`. Like other real SM entities, it's tested *through* `system_core`'s `TableRegistryApiClient`/`FieldDefinitionApiClient`, not through `SMApiClient` — same established pattern as `UserProfileApiClient`/`UserGroupApiClient`/`PFApiClient` below | `api/security_management/**` |
| `fin_accounting` | **Implemented.** `FinAccApiClient` covers Entry Generation; own payload builder (`entry-generation-payload-builder.ts`) and helpers (`entry-generation-helper.ts`, `posting-detail-seed-helper.ts`); smoke + regression specs | `api/fin_accounting/**` |
| `account` | **Implemented.** Real `AccountApiClient`, `account-contract-setup-helper.ts`, a `balance_management/` sub-module; maintenance, restrictions/locked-amounts specs (the largest spec set in the repo, ~19k lines), plus a health-check | `api/account/**` |
| `customer` | **Implemented.** Thin `CustomerApiClient` (`performRecordOperation`), `customer-party-helper.ts`, own paths and payload builder; party-data smoke/regression and party-integration specs | `api/customer/**` |
| `cob` | **Stub only.** Empty client class (`export class CobApiClient {}`), 0-byte `cob-api-paths.ts`, no specs | `api/cob/**` |
| `action_processing`, `consolidation_engine`, `soft_accounting`, `teller` | **Implemented**, each with health-check + smoke + regression specs and helpers (`action_processing` and `consolidation_engine` also have a client and paths; `soft_accounting` and `teller` have none, see `api-architecture-debt.md` pattern 6) | `api/action_processing/**`, `api/consolidation_engine/**`, `api/soft_accounting/**`, `api/teller/**` |
| `limit` | **Implemented, smoke only.** Limit Hierarchy / Group Limits (EP-09.01): `LimitApiClient`, `limit-api-paths.ts`, `limit-payload-builder.ts`, `limit-setup-helper.ts`, `limit-linkage-helper.ts`, `limit-scenario.ts` (the whole US-09.01.04 link-customers-to-group scenario, a test scenario rather than a helper); all limit-specific types in `api/types/limit.types.ts`; `limit-hierarchy-smoke.spec.ts` (listed in `SINGLETON_RECORD_SPECS`) with one `describe` per Story | `api/limit/**` |
| `document_management` | **Implemented.** `dm-helper.ts`/`dm-image-helper.ts`/`dm-regression-helper.ts` cover document scoping through `system_core`'s `CM.CUSTOMER*` projections; `document-management-smoke.spec.ts`, `document-management-regression.spec.ts`, `image-capture-smoke.spec.ts` | `api/document_management/**` |
| `interest_and_charges` | **Nests two sub-modules, `charges_calculation_engine` (Charge Engine) and `interest_calculation_engine`** (the original example of the component→sub-module nesting pattern — see `architecture.md`). `CceApiClient` covers `CC.GLOBAL.CHARGE.RULE`/`CC.CHARGE.TARIFF.GROUP` via `tables/api/v1/projections`; each sub-module has health-check, smoke and regression specs (`cce-*`, `ice-*`) | `api/interest_and_charges/**` |
| `transfer` | **Implemented.** Payment Order flow (`TABLE.ORDER`/`TABLE.PRODUCT`/`TABLE.PARAMETER`) built on `system_core`'s `SystemCoreProjectionHelper`/`TableRegistryApiClient`, including SOD/COB release; `payment-order-smoke.spec.ts` + `payment-order-regression.spec.ts` | `api/transfer/**` |
| `integration_chapter` | **Implemented**, cross-module only (no client/paths of its own by design) — end-to-end scenarios spanning System Core + Security Management + Field Registry (`sms-system-core.spec.ts`), Product Factory + SC + SMS (`pf-sc-sms.spec.ts`), audit fields across modules, system parameters | `api/integration_chapter/**` |
| Kafka | **No `api/kafka/` module.** Kafka is driven entirely by the shared `kafkaService` fixture and consumed directly by module specs (`consolidation_engine`, `transfer`, `integration_chapter`) | `api/utils/services/kafka-service.ts`, `api/utils/fixtures/api-fixtures.ts` — see `docs/frame-specs/architecture.md`'s "Kafka layer" |
| UI (`ui/<module>/sub_modules/<name>/tests/`, plus `ui/base/tests/`) | **Implemented**, with a real Page Object + Component Object Model, organized by feature module (see `docs/frame-specs/architecture.md`'s "UI layer" for the full structure; 28 specs). `system_core` sub-modules: basic_customization, customization, dates_holidays, dynamic_data_dictionary, idempotency, projection_forms (incl. the Plugin Manager page object); `security_management`: access_administration, override_dispo, user_profile (login flows, company selection, cross-tab logout, company-timezone enforcement); `document_management`: dm_compliance_engine; plus a wiring-only health-check in `ui/base/tests/` | `ui/**/tests/*.spec.ts` |

**Implication for new work:** if asked to automate a case for `cob`, there is
no existing client/paths/types pattern in that module to extend — either the case actually belongs
against `system_core`/`product_factory`/`fin_accounting` (check which real service owns the entity
under test) or the module genuinely needs its client/paths/types built from scratch following the
pattern in `docs/frame-specs/architecture.md`. For `account`/`customer`/`limit` extend the existing client and helpers. `security_management` now has one real precedent
(`override-dispo-smoke.spec.ts`) to follow for a new SM case — reuse `system_core`'s clients the
same way, don't build a parallel `SMApiClient` implementation for it. If asked to automate a new UI
case for an existing module, extend that module's own `ui/<module>/pages/`+`components/` (add a new
page/component class following the established shape) and put the spec under
`ui/<module>/sub_modules/<name>/tests/`. If asked to automate a new UI **module**
(a new business feature, e.g. Customer/Party Data), create a new `ui/<module>/` folder following the
same `pages/`+`components/`+`helpers/`+`fixtures/`+`constants/`+`<module>-ui-paths.ts`+`sub_modules/<name>/tests/` shape
as `ui/system_core/` — never a flat top-level `ui/pages/`/`ui/utils/` addition, and never a page that
belongs to no single feature (a shared dashboard/shell concern) placed inside a feature module —
see `architecture.md`'s "UI layer" for the `ui/base/shell/` precedent.

## Fixture and test structure pattern

See `docs/frame-specs/architecture.md`'s "Fixtures" section for the mechanics. Structurally, a
typical spec (see `api/system_core/tests/table-registry-smoke.spec.ts`,
`api/integration_chapter/tests/sms-system-core.spec.ts`) follows:

```ts
test.describe('Feature - Smoke Tests', { tag: ['@api', '@smoke_m1'] }, () => {
  test.describe.configure({ timeout: 350000 }); // generous — real infra, not mocked

  test.beforeAll(async () => { /* db client, shared IDs */ });
  test.afterEach(async () => { /* per-test cleanup (e.g. drop just-created table schemas) */ });
  test.afterAll(async () => { /* run-level cleanup (groups, db client teardown) */ });

  test.describe('US-XX.YY.ZZ | <Story title, verbatim from Allure/Confluence>', () => {
    test.beforeEach(async ({ authenticatedApiContext }) => { /* instantiate client(s) */ });

    test(
      'TC-1867: <precise business-behavior description>', // the number after TC- mirrors allureCaseId's own argument
      allureCaseId(1867), // the case's numeric Allure TestOps id — omit entirely for a case with no Allure entry
      async () => {
        await test.step('PRECONDITION: ...', async () => { /* arrange via client calls */ });
        await test.step('STEP N: ...', async () => { /* act */ });
        await test.step('STEP N: verify ...', async () => { /* assert on response AND/OR DB state */ });
      },
    );
  });
});
```

Conventions to preserve:

- **One nested `test.describe` per Story, always** — every test case belongs to exactly one Story
  (the `Story` column of its Allure TestOps case, e.g. `US-01.12.01 | Technical Idempotency`), and
  that case's `test(...)` block must live inside a `test.describe('US-XX.YY.ZZ | <Story title>', ...)`
  nested directly under the file's outer Feature-level `describe`, copying the Story's title
  **verbatim** the same way the `Story` column itself is copied verbatim (see
  `manual-qa-agent.md`'s case-table-format rule) — never left flat at the outer `describe` level.
  This applies from the very first test case added for a Story, not only once a second case forces a
  split. Established precedent: `idempotency-smoke.spec.ts` (`US-01.12.01`/`.02`/`.03`),
  `system-tables-static-dictionaries` specs (`US-01.11.03`), `negotiation-rules-regression.spec.ts`
  (`US-04.02.01`). A Feature spec file may contain several Story-scoped `describe` blocks if it
  automates cases from more than one Story of the same module/Epic — each still gets its own nested
  block, they are never merged into one.
- **Every test case is named `TC-<allureCaseId>: <behavior>`** — the number after `TC-` is always
  the *same* numeric id passed to that same `test(...)` call's `allureCaseId(...)` argument, never
  an independent sequence number (e.g. `'TC-1867: Table creation fails without mandatory LIV
  space', allureCaseId(1867)`) — descriptive, states the expected outcome, not just the action.
  Updated 2026-09-24: previously the `TC-<number>` prefix carried its own independent number (the
  original spec/Excel row), decoupled from `allureCaseId(...)`'s argument — that's superseded; the
  two numbers must now match. For the inline-pasted-case mode (no Allure case, `allureCaseId(...)`
  omitted entirely), there is no id to mirror — keep whatever short local identifier the source
  case carries instead, since there's nothing to synchronize it to.
- **`test.step` narrates PRECONDITION/STEP N** — every assertion has a descriptive message string
  as its second `expect(...)` argument explaining *why* it should hold, not just what's being
  checked (`expect(x, 'Expected Y because Z').toBe(...)`) — this is what makes a CI failure legible
  without re-reading the test body.
- **Never cite provenance inside a `test.step` title or an `expect(...)` message** — no ticket
  number (`TB-1234`), no `allureCaseId(N)`/`per allureCaseId(N)'s own Expected Result: "..."`, no
  Bruno file reference, no bare date or "confirmed (live) with the team/dev on <date>". A CI report
  reader needs the plain behavioral fact only (`'UNIT can be null or missed'`, not `'per TB-3588's
  Expected Result ("UNIT can be null or missed")'`); the research trail belongs in this
  `proj-ai-agentic` doc set (`docs/module-theory/`, `docs/chat-history/`) or a PR description, never
  in code the harness renders to a human triaging a failing run. Test: if removing the citation
  token changes what the string claims, it's a citation — strip it, keep the fact underneath. This
  does not forbid a purely structural cross-reference that helps navigate the test itself (e.g. a
  step labeled `STEP 1 (Allure Step 1, part a): ...` when one Allure Step is split across several
  code steps) — only citations that justify *why* an assertion is what it is. Full pattern and
  incident log: `docs/common-issues/test-data-and-assertions/no-provenance-citations-in-test-code.md`.
- **Cleanup is layered**: per-test (`afterEach`, e.g. `cleanupTables`) for resources created inside
  one test, per-suite (`afterAll`) for resources shared across a `describe` block (e.g. a
  Four-Eyes-enforcement shared table set up once in a nested `describe`'s own `beforeAll`).
- **Serial mode where order matters**: cross-cutting integration suites that build up shared state
  across tests use `test.describe.configure({ mode: 'serial' })` (e.g.
  `sms-system-core.spec.ts`) — don't assume parallel-safe unless a suite is clearly independent
  per-test (most `system_core`/`product_factory` smoke specs generate unique IDs with `Date.now()`
  suffixes specifically so they *can* run unordered).
- **Unique identifiers**: every dynamically-created resource (table ID, record ID, group name) must
  get its unique suffix from `api/utils/helpers/dynamic-name-generator.ts` (`generateCustomId`,
  `generateDynamicGroup`, `generateDynamicTable`, `generateDynamicField`,
  `generateIdempotencyKey` — extend this file with a new helper if none of these fit) rather than a
  hardcoded raw `Date.now()`/ad hoc string assembled inline in the spec. A large share of existing
  specs still inline `` `PREFIX_${Date.now()}` `` directly — that's legacy debt to flag when a
  touched line does it, not a pattern to copy into new or edited tests.
- **Linking a test to its Allure TestOps case is `allureCaseId(<numeric id>)` as the `test(...)`
  call's second argument** (`api/utils/helpers/allure-case-link.ts`; e.g.
  `test('TC-004: ...', allureCaseId(1867), async () => { ... })`), never a comment or any other
  convention. The shared `beforeEach` in `api/utils/fixtures/api-fixtures.ts` reads this
  annotation and calls `allure.allureId(...)` for the actual Allure result — this fully replaced
  the old `test-data/allure-testcase-map.json` title-matched file, which no longer exists in this
  repo. Add the argument only when the test automates a case that actually exists in Allure
  TestOps; a test written from a locally-supplied/pasted case with no Allure entry omits the
  argument entirely (no placeholder, no comment substitute). `npm run allure:verify-ids`
  (`scripts/verify-allure-ids.ts`) statically scans every spec for `allureCaseId(...)` calls and
  fails the build if the same case id is reused by more than one test outside that script's own
  `ALLOWED_DUPLICATE_IDS` allowlist — it does not verify the id actually exists in TestOps, only
  that ids aren't accidentally duplicated locally. The convention is also used by `ui/` specs
  (for example `ui/security_management/sub_modules/access_administration/tests/` and
  `ui/document_management/sub_modules/dm_compliance_engine/tests/`).

## Correlation ID tracing (`X-Correlation-ID`)

Every test gets one `randomUUID()`-generated `X-Correlation-ID`, shared by every HTTP/Kafka call
that test makes (`api/utils/fixtures/api-fixtures.ts`'s `testCorrelationId` fixture) and surfaced as
`allure.parameter('X-Correlation-ID', ...)` at the very top of the Allure result — see
`docs/frame-specs/api-conventions.md`'s "Standard headers" table for the full mechanism and the
override rule. **When filing a bug against a failing/flaky test, copy this parameter's value from
the Allure result into the bug report** — it's the fastest way to pull the exact cross-service log
chain (Kibana/OpenSearch) for that one test run, rather than correlating logs by timestamp.

## Assertions

Plain Playwright `expect` — no zod runtime schema validation in use today (see
`docs/frame-specs/tech-stack.md`) and no custom matcher library. Two assertion styles are used
side by side and are both acceptable:

1. Field-by-field: `expect(body.name, 'message').toBe(value)`.
2. Shape assertions: `expect(body).toMatchObject({ ... })` for verifying a subset of a larger
   response object without over-specifying fields not under test.

**Assertion messages are mandatory, not optional.** An `expect(...)` call with no message is a red
flag on sight — flag it regardless of which of the two styles above is used. For any assertion on
an API response, the message must let a CI failure be diagnosed without re-running the test, so
include the response's status and body, e.g.:

```ts
expect(response.status, `Expected 200 but got ${response.status}: ${await response.text()}`).toBe(200);
```

For a business-value assertion not tied directly to a raw HTTP response, state what was expected
and why, e.g. `expect(body.status, 'Expected record to move to LIV after authorization').toBe('LIV');`.

## Database-level assertions

Where the DB is the only place a fact is actually observable (e.g. `seq_no` incrementing in `liv`
after an update, a record's presence in `nau` vs `liv` before/after authorization), query Postgres
directly via a `Client` from `createDbClient()` rather than trying to infer it from an API response
that doesn't expose it. See `docs/project-spec/business-rules.md` for what `LIV`/`NAU`/`HIS`/`DEL`
mean and when to assert on which.

## Test data

- `test-data/payload-builder.ts` — the single source of request-payload factories across almost
  every module (`buildCreateGroupPayload`, `buildCreateTablePayload`, `buildRecordInputPayload`,
  `buildProjectionRulePayload`, `buildFieldDefinitionPayload`, `buildInternalUserProfilePayload`,
  etc.). Always check here for an existing builder before hand-assembling a payload object inline
  in a spec.
- `test-data/interest-and-charges-payload-builder.ts`, `test-data/parametrisation-payload-builder.ts` — domain-specific payload variants; module-owned builders also live next to their module (for example `api/limit/limit-payload-builder.ts`).
- `api/utils/constants/constants-keeper.ts` (`TEST_CONSTS`, `FIELD_CONSTS`, `PF_CONSTS`,
  `SYSTEM_PARAMETRIZATION_CONSTS`, `TABLE_DEFINITION_PROPERTIES`) — the shared constant pool for
  classification values, operation codes, space names, field types, and known-good/known-bad test
  values. Add new shared constants here rather than inlining magic strings in a spec — this
  includes HTTP status codes: a hardcoded numeric literal like `toBe(200)`/`toBe(404)` inline in a
  spec is a red flag, use (or add) a named constant instead so the expected value is
  self-documenting and consistent across specs.
- `api/utils/helpers/dynamic-name-generator.ts` — the standard mechanism for unique names/IDs; see
  "Unique identifiers" above.

## Known gaps (don't paper over these when picking up related work)

- **`setupFinTableWithFourEyes` (`table-registry-helper.ts`) and its copies call `AUTH` on
  `SM.USER.GROUP~MAIN`/`SM.USER~INTERNAL` right after `INPUT`, without ever asserting that AUTH
  call's response status** — a silently-failing no-op `404` (both projections are
  `authOperationRequired: false`). Don't copy the AUTH call for these two projections into new
  setup helpers. Full incident and the general rule: `docs/common-issues/keycloak-and-auth/auth-operation-required.md`.
- **Older UI specs don't follow the API side's Story-scoped `describe` nesting convention** (see
  "Conventions to preserve" above; newer ones such as `access-administration-smoke.spec.ts` do nest
  by `US-XX.YY.ZZ | ...`) — the older login specs (e.g. `login-invalid-credentials.spec.ts`)
  use a flat `test.describe('<feature description>', ...)` with the Use Case/EP code embedded
  directly in the test name (`TC-198: EP-02.01.06 ...`) instead. This is an observed inconsistency,
  not a documented, intentional UI-specific convention — flag it rather than silently picking
  either shape for new UI work; confirm which convention to follow before adding the next UI spec.
- **`isReportingToConflict` (`api/security_management/helpers/override-dispo-helper.ts`) tells the
  "a top-level DISPO.OFFICER already exists" conflict apart from other `REPORTING_TO` validation
  errors by matching a substring of the platform's error text** (`'only one officer may have an
  empty REPORTING_TO'`), not a stable error code. This isn't a shortcut specific to this helper —
  the platform's field-level validation error shape (`body.properties.errors.<FIELD>`, the same
  pattern used across `product_factory`/`document_management`/`system_core`) is always a bare
  human-readable string per field, with no accompanying machine-readable code to key off instead.
  If the platform's wording ever changes, this silently falls through to a confusing
  `expectStatus(..., OK, ...)` failure instead of a clear "wording changed" signal. Accepted,
  currently-unavoidable fragility — don't try to "fix" it by switching to a code the platform
  doesn't expose; if the platform ever adds one for this error shape, switch to it then.
