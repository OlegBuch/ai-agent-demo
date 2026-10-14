# Glossary

Entity/field/status names concretely observed in this repo's code (`api/types/*.types.ts`,
`api/utils/constants/constants-keeper.ts`, `docs/test-cases/TB-1306/`). For generic CBS platform terms not
listed here (Table, Projection, hook, multi-marker field, the four core services, Field/Table/Plugin
Manager, `NAU`/`LIV`/`HIS` in the general platform sense) see the `proj-context` plugin — this file
only records this engagement's concrete entity names and this suite's own vocabulary.

## Table Registry / Table Template entities

| Term | Meaning |
|---|---|
| **Group** | A Table Registry-managed collection of Tables that share one Kubernetes `table-template` deployment. Created via `POST table-registry/api/v1/groups`; sized by `replicaCount`. Cannot be deleted while it still has linked Tables |
| **Table** | A logical business entity hosted inside a Group's pods. Has `id`, `name`, `type` (`USR`/`SYS`), `classification` (`INT`/`FIN`/`CUS`), `origin` (`CORE`/`LOCAL`), and a `spaces` array (`LIV`/`NAU`/`HIS`/`DEL`/`SIM`/`ARC`) |
| **Table Definition** | A Table's schema — the set of fields (properties) it exposes, including the always-present Audit Cluster fields |
| **Projection** | The queryable/operable view over a Table that record operations (`INPUT`/`SEE`/`AUTH`/...) act against; in this repo, `projectionId` is usually the same string as the owning `tableId` |
| **Record operation** | One of `INPUT` (create/update), `SEE` (read), `AUTH` (authorize a pending draft), `HOLD` (reopen a live record for edit without incrementing version), `REVERSE`, `HISTORY_RESTORE`, `DELETE` |
| **Hook** | A Plugin bound to a Table's Projection at a given `phase`/`operation`/`executionOrder` — added via `POST .../hooks/batch` |
| **Projection Rule** | A conditional check (`conditionKey`/`operator`/`conditionValues`) evaluated on a record operation; `resultType: ERROR` or `OVERRIDE`, surfaced in the response's `errorIds`/`overrideIds` |
| **Audit Cluster** | The always-appended set of audit fields on every Table Definition: `ST_COMPANY`, `ST_INPUTTER`, `ST_DATE_TIME`, `ST_AUTHORISER` (sic — spelled with an `-ISER` in code, `ST-AUTHORIZER` in one constant — check the live schema rather than assuming one spelling), `ST_PROJECTION`, `ST_RECORD_STATUS` |
| **`ST_RECORD_STATUS` values** | Enum: `UNAU`, `HOLD`, `RNAU`, `REVE`, `LIVE`, `HNAU` (`TEST_CONSTS.AUDIT_STATUSES`) — the record's audit-visible lifecycle state, distinct from which physical space (`liv`/`nau`/`his`) currently holds it |

## Classification / type / origin

| Term | Meaning |
|---|---|
| `INT` | Global/shared table classification — no per-company data isolation |
| `FIN` | Financial, per-company-isolated table classification — maker-checker (four-eyes) applies |
| `CUS` | Customer-scoped table classification |
| `USR` | User-defined business table type |
| `SYS` | System table type — `INPUT` always forbidden |
| `CORE` | Platform-shipped origin — mostly immutable |
| `LOCAL` | Client-authored/customized origin — the only origin eligible for safe deletion or new field injection |

## Product Factory entities

| Term | Meaning |
|---|---|
| `PF.CLASS` | Product Class — top-level grouping (e.g. `LENDING`) |
| `PF.TYPE` | Product Type within a class (e.g. `PERSONAL.LOANS`) |
| `PF.BUILDER` | Draft/builder representation of a product before catalog promotion |
| `PF.PRODUCT` | A cataloged/production product record |
| `PF.MANAGER` | Product lifecycle actions — `VALIDATE`, `CATALOG` |
| `PF.CATALOG` | The catalog projection a validated/cataloged product is read from |
| Product status | `DRAFT` → `VALIDATED`/`VALIDATION_FAILED` → `CATALOGED` (`PF_CONSTS.STATUS`) |
| Attribute class | A category of product attribute — `INTEREST`, `CUSTOMER`, `CHARGE`, `TERM` (`PF_CONSTS.ATTR_CLASSES`) |

## Security Management entities

| Term | Meaning |
|---|---|
| `SM.USER~INTERNAL` | Internal (staff) user profile projection |
| `SM.USER.GROUP~MAIN` | User Group projection — holds a `PERMISSIONS: [{TABLE, FUNCTION}]` array |
| `SYSTEM.PARAMETER~MASTER` | Global system parameter record (single record, `id: "SYSTEM"`) |
| `COMPANY~MASTER` | Company master record (Lead/branch companies, calendar codes, Auto-ID scope) |

## Override and Dispo Processing entities (module 02.05 / EP-02.05)

| Term | Meaning |
|---|---|
| **Hard error** | A record referenced from the `ERROR` dictionary — an absolute block, `4xx` with only `errors` in the body, no data written |
| **Override** | A record referenced from the `OVERRIDE` dictionary — a negotiable warning; `DISPO_ALLOWED` decides whether it goes through standard-override (classes) or dispo (officer limits) processing |
| **Standard override** | An override with `DISPO_ALLOWED = false`, gated by `OVERRIDE.CLASS`/`OVERRIDE.CLASS.DETAILS` security classes |
| **Dispo (disposition)** | An override with `DISPO_ALLOWED = true` and a `DispoContext` present — spawns a `DISPO.ITEM` ticket, gated purely by `DISPO.OFFICER` monetary limits, no classes involved |
| **`DISPO_ALLOWED`** | `OVERRIDE` field deciding standard-override vs. dispo routing for that override |
| **`PRECEDENCE`** | `OVERRIDE` array of `{TABLE, FIELD}` rows — the cascade used to locate the initial `DISPO.OFFICER` for a triggered override |
| **`DEFAULT_DISPO_OFFICER`** | `OVERRIDE` fallback officer when the `PRECEDENCE` cascade yields nothing |
| **`REQUIRED_CLASS`** | `OVERRIDE.CLASS.DETAILS` multi-value field — classes that may approve a standard override under the row's `RULES`; ANY semantics (holding one is enough) |
| **`DISPO_AMOUNT`** | `DISPO.OFFICER` review/routing limit — a ticket whose violation exceeds it is auto-escalated past this officer (ignored for the top officer) |
| **`OVERDRAFT_AMT`** | `DISPO.OFFICER` final approval limit — `APPROVE`/`REJECT` require the violation within it; must be `<= DISPO_AMOUNT` |
| **`REPORTING_TO`** | `DISPO.OFFICER` next officer up the auto-escalation chain; empty only for the single top officer |
| **`ROUTE_TO`** / **`ABSENT_START`/`ABSENT_END`** | `DISPO.OFFICER` absence substitute and window — mandatory pairing enforced at config time |
| **`DISPO.ITEM.STATUS`** values | `PENDING` → `APPROVED` \| `REJECTED` (terminal, never reopened); `FORWARD` keeps `PENDING` and moves `OFFICER` |
| **`LOOKUP_RECORD_ID`** | `DISPO.ITEM` field — resolved record id of the related entity the exception concerns (e.g. an `ACCOUNT` id), used for foreign-table `PRECEDENCE` rows |
| **`targetFieldId`** | Pure frontend "highlight this field" pointer on any diagnostic — distinct from `LOOKUP_RECORD_ID`/dispo routing, never used by dispo mechanics itself |
| **`OverrideRef` / `ErrorRef` / `DispoContext`** | `proj-plugin-api` models a hook returns to report diagnostics (dictionary id + positional `params` + optional `targetFieldId`; `DispoContext` additionally carries the lookup + `violationAmountLcy`) |
| **`HookOutcome.OverrideRequired` / `.Errors`** | Additive hook outcomes (alongside existing `Succeed`/`Warning`/`Failed`) that feed the diagnostics gate — errors from any source suppress all accumulated overrides |
| **`ST_OVERRIDES`** | Parent record's audit-trail array of `{id, status, params, targetFieldId, dispoItemId?}` entries — one per override raised on that record/cycle |

## Test-suite-local vocabulary

| Term | Meaning |
|---|---|
| **Table group reuse (local dev fast path)** | `global-setup.ts` reusing an existing `AQA_GROUP_*`/`QA_GROUP_*` Kubernetes-backed group on non-CI runs, to skip expensive re-provisioning — see `docs/frame-specs/architecture.md` |
| **Tracked resource** | A group/table ID appended to `test-results/tracked-resources.jsonl` during a run, cleaned up by `global-teardown.ts` on CI only |
| **Test-owned schema** | A Postgres schema safe to drop by automation: name contains a 13-digit millisecond timestamp, or starts with `qa_`/`pr_` (`db-helper.ts#isTestOwnedSchema`) |
| **Inputter / Authorizer** | Test-vocabulary names for the two distinct authenticated clients used to exercise four-eyes maker-checker flows in a single spec |
