# Domain Model

Generic CBS platform concepts (Table, Projection, the four core services, Field/Table/Plugin
Manager, hooks, multi-marker fields) are owned by the `proj-context` plugin — load it rather than
re-deriving that model here. This file records the **concrete module/entity map this repository's
tests actually exercise**, as observed in `api/**` — evidence, not platform theory.

## Services reached by this test suite

| Service | Reached via path prefix | Role |
|---|---|---|
| **Table Registry** | `table-registry/api/v1/...` | Control plane: creates/deletes **Groups** (which drive Kubernetes `table-template` deployments) and **Tables** (logical entities hosted inside a Group's pods); owns Company records; owns Table Definitions (schema) |
| **Table Template** | `tables/api/v1/...` | Runtime engine: hosts **Projections** for each Table, executes record operations (`INPUT`/`SEE`/`AUTH`/`HOLD`/`REVERSE`/`HISTORY_RESTORE`/`DELETE`), owns projection Rules and Hooks |
| **Field Registry** | `field-registry/api/v1/fields` | Global field-definition catalogue; a field must exist here (with `origin: LOCAL`/`CORE`) before it can be injected into a Table's schema |

## Business modules (as mapped by this repo's `api/` folders)

| Module folder | Real entities/tables observed | What it tests |
|---|---|---|
| `system_core` | Table Registry Groups/Tables/Companies; `SYSTEM.PARAMETER~MASTER`; `COMPANY~MASTER`; `SM.USER.GROUP~MAIN` (via `UserGroupApiClient`); `SM.USER~INTERNAL`/`SM.USER~EXTERNAL`/system users (via `UserProfileApiClient`); Projection Rules/Hooks; Audit Cluster fields (`ST_COMPANY`, `ST_INPUTTER`, `ST_DATE_TIME`, `ST_AUTHORISER`, `ST_PROJECTION`, `ST_RECORD_STATUS`) | Table/group lifecycle, multi-company isolation, four-eyes (maker-checker), the rule engine (`ERROR`/`OVERRIDE` results), Auto-ID generation policies, system-wide parameters, RBAC via user groups |
| `product_factory` | `PF.CLASS`, `PF.TYPE`, `PF.PRODUCT`, `PF.BUILDER`, `PF.MANAGER`, `PF.CATALOG` | Product-catalogue lifecycle: product classes → types → builder/draft products → catalog/production promotion, attribute-class validation |
| `field-definition` | Field Registry's `fields` collection | Field creation, consumed as a precondition by other modules' tests (a field must exist here before a Table Definition can reference it) |
| `integration_chapter` | No entities of its own — cross-module scenarios composing System Core + Security Management concepts + Field Registry (`sms-system-core.spec.ts`), Product Factory + System Core + SMS (`pf-sc-sms.spec.ts`), audit fields, system parameters | Seams between modules — the only place these interactions are asserted end-to-end in one flow |
| `security_management` | `SM.USER~INTERNAL`, `SM.USER.GROUP~MAIN` (referenced, exercised through `system_core`'s clients); `ERROR`/`OVERRIDE`/`OVERRIDE.CLASS`/`OVERRIDE.CLASS.DETAILS`/`DISPO.OFFICER`/`DISPO.ITEM` (Override and Dispo Processing, module 02.05 — see below; also exercised through `system_core`'s `TableRegistryApiClient`/`FieldDefinitionApiClient`, not `SMApiClient` — see `testing-standards.md`) | `tests/health-check.spec.ts` is still a placeholder, but `tests/override-dispo-smoke.spec.ts` (MR !138, TB-2083) is a real 53-case suite: hard-block/negotiable-override/dispo-routing exception management |
| `account`, `customer`, `fin_accounting`, `action_processing`, `consolidation_engine`, `soft_accounting`, `teller`, `transfer`, `document_management`, `interest_and_charges`, `limit` | Implemented modules, entities defined by their own helpers/payload builders (see `docs/frame-specs/testing-standards.md`'s maturity table; `limit` = Limit Hierarchy / Group Limits, EP-09.01) | Module-specific smoke/regression suites |
| `cob` | Not yet modeled in this repo (empty client stub, 0-byte paths file) | Placeholder only |

## Table classification (`classification` on a Table Registry Table)

| Value | Meaning (as exercised by tests) |
|---|---|
| `INT` | Global/shared table — a single physical schema, records visible and editable across **all** companies (no per-company isolation) |
| `FIN` | Company-isolated financial table — one base schema plus one schema **per company** (`{tableId}_{companyCode}`, lower-cased); a record created under one company is invisible (404) to another |
| `CUS` | Customer-scoped classification (seen in `integration_chapter` tests creating a `(CUSTOMER)` table) — treated similarly to `INT`/`FIN` isolation rules by the platform; this repo's evidence for `CUS`'s exact isolation semantics is thinner than for `INT`/`FIN` — confirm against `proj-context`/the live platform before asserting a new `CUS`-specific rule from inference alone |

See `docs/project-spec/business-rules.md` for the record-lifecycle and governance rules built on
top of this classification.

## Override and Dispo Processing entity map (module 02.05 / EP-02.05)

Six `USR`-type Tables realize the module (Jira `TB-22`, component Security Management), with full
`US-02.05.01`–`.07` live test coverage as of MR !138/TB-2083
(`api/security_management/tests/override-dispo-smoke.spec.ts`) — see `business-rules.md`'s
dedicated section for the specific `TC-NNN` mapping:

| Table | Group | Classification | Role |
|---|---|---|---|
| `ERROR` | `OVERRIDE_GROUP` | `INT` | Hard-stop diagnostic dictionary — `id` + translatable `MESSAGE` with `{1}..{N}` placeholders |
| `OVERRIDE` | `OVERRIDE_GROUP` | `INT` | Negotiable-warning dictionary + dispo config (`DISPO_ALLOWED`, `PRECEDENCE`, `DEFAULT_DISPO_OFFICER`); three projections `~BASIC`/`~DISPO`/`~DISPLAY` |
| `OVERRIDE.CLASS` | `OVERRIDE_GROUP` | `INT` | Security classes eligible to approve standard (non-dispo) overrides |
| `OVERRIDE.CLASS.DETAILS` | `OVERRIDE_GROUP` | `INT` | Conditional class requirements (`RULES` → multi-value `REQUIRED_CLASS`, ANY semantics); dispo overrides forbidden here |
| `DISPO.OFFICER` | `DISPO_GROUP` | `INT` | Financial competence/escalation hierarchy; record id **is** the `SM.USER` id (no separate link field) |
| `DISPO.ITEM` | `DISPO_GROUP` | `FIN` | Exception ticket, own `PENDING`→`APPROVED`/`REJECTED` lifecycle; `~SYSTEM` (core-only spawn) and `~REVIEW` (officer action) projections |

All six publish straight to `LIV` (`RECORD_STATUS = LIVE`, no 4-eyes) — the four-eyes/NAU gating in
this module applies to the *parent* record the override/error was raised on, not to these registry
tables themselves.

Diagnostics travel as `OverrideRef`/`ErrorRef`/`DispoContext` (`proj-plugin-api`, additive to the
existing `Succeed`/`Warning`/`Failed` `HookOutcome`s) — see `business-rules.md` for the resulting
HTTP contract.

## Services in the Bruno contract and their automation status

The `proj-bruno-api` Bruno workspace (a separate git repo — see
`docs/frame-specs/api-conventions.md`) documents a wider CBS service surface than this repo
currently automates:

| Service (Bruno collection) | What it does | Automated in `proj-test-automation`? |
|---|---|---|
| Field Registry, Table Registry, Table Template, Tables | Covered above | Yes — `field-definition`, `system_core`, `product_factory` |
| **Charge Engine** | `POST {charge-engine-url}/api/v1/calculations/charge` — calculates a charge from a basis amount + tariff group + customer context | Yes — `api/interest_and_charges/charges_calculation_engine/` (`CceApiClient`, smoke + regression) |
| **Interest Engine** | `POST {interest-engine-url}/api/v1/interest/accruals` — calculates accrual interest from a basis amount + global calc rule + date range, returning a tiered-rate resolution log | Yes — `api/interest_and_charges/interest_calculation_engine/` (smoke + regression) |
| **Plugin Manager** | Plugin (Java JAR, stored in S3/Ceph) lifecycle: list/get/upload/update/resolve plugins bound to Table hooks | Partly — `PluginManagerApiClient` and `plugin-manager-api-paths.ts` under `api/system_core/`, plus a UI page object (`ui/system_core/pages/plugin-manager-page.ts`) |

The Bruno workspace's **Tables** collection is further split into per-domain request folders that
prefigure this repo's `api/` modules: `Account Maintenance`, `Charges Calculation`,
`Customer Management`, `Date and Holiday Management`, `DDD`, `Document management`, `Entry
Generation`, `Interest and Charges`, `Payment Order`, `Product Factory`, `SMS`, `System Core`,
`Teller`, `Transfer Execution`. When asked to automate a case for a module with no client yet
(`cob` — see `docs/frame-specs/testing-standards.md` for the current, up to
date per-module maturity table before assuming any module, including `security_management`/
`fin_accounting`, is still stub-only), check the matching Bruno folder first for the real
endpoint/request/response shape rather than guessing one from the case's prose description.

## Table types (`type` on a Table Registry Table)

Observed values: `USR` (user-defined business table), `SYS` (system table — `INPUT` operations are
structurally forbidden, `403`, regardless of permissions). `TEST_CONSTS.NEW_TABLE_TYPE`/
`NEW_SYS_TABLE_TYPE` in `api/utils/constants/constants-keeper.ts` are the canonical constants used in tests.

## Table origin (`origin` on a Table/Field)

| Value | Meaning |
|---|---|
| `CORE` | Platform-shipped, out-of-the-box artifact. Immutable in nearly every respect — see the origin-governance rules in `business-rules.md` |
| `LOCAL` | Client/tenant-authored customization. Deletable under strict conditions; the only origin a new Field can be injected as |

`ORIGIN` itself is immutable on any table regardless of its current value (`docs/test-cases/TB-1306/analysis.md`,
US-01.04.03) — this is a standing governance rule, not a one-ticket detail, and is restated in
`business-rules.md`.
