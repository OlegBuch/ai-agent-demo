# Bruno collection `Tables/Limits` - full inventory and what it means for automation

Source: `proj-bruno-api` `origin/main` (fetched 2026-10-01), `collections/Tables/Limits/`, 216 files read one by one by seven Gather passes (per-file digests with bodies, scripts, assertions live in the session scratchpad `bruno-limits-inv-A..G.md`; the facts that matter are kept here). Module overview: [INDEX](INDEX.md).

## TL;DR

- The collection is a **deployment script plus an E2E suite in one**: `00 - Seeding` steps 01-14 deploy the module (table group, tables, fields, schemas, projections, error records, rules, event emission/binding, hooks, pod restart, readiness wait, cleanup) and step `15 - E2E Tests` (83 files) proves behaviour. `proj-field-registry`, `proj-table-registry`, `proj-table-template` (+ `Operations`) repeat steps 02/04/06 with identical bodies as stand-alone requests.
- Everything is **idempotent**: seeding INPUTs accept 200/201/409, AUTHs accept 200/201/202. Our repo asserts exactly one status, so a 201 or a 409 on an already-seeded environment would fail an AQA assertion that Bruno tolerates.
- 4-eyes in Bruno: **INPUT runs as the collection user (`auth: inherit`, header `Cbs-User-Context`), AUTH runs as the static Keycloak user `operation-authorizer` (OAuth2 password grant, client `proj-app`, realm `{{realm}}`, no `Cbs-User-Context` header)**. Our spec uses a dynamically created CHECKER user instead; both are valid 4-eyes patterns, ours is unproven for these tables until a run reaches AUTH.
- To deploy the module on `two.bankuat` / `bankuat` (currently missing, see INDEX "Environment state") the exact order is below. It is a mutating, shared-environment action for developers/DevOps.

## Deployment order the collection encodes (what `two.bankuat` needs)

| Step | Folder | What it does | Notes |
|---|---|---|---|
| 0 | `Tables/System Core/01 - Company & System Parameter Seeding` | registers COMPANY fields `GRP_CREDIT_LIMIT` (BOOLEAN, default false), `NET_OUTSTANDING` (BOOLEAN, default false), `ADM_EXTENSION_DAYS` (NUMERIC, default "0") and updates the COMPANY schema / `COMPANY~MASTER` (TB-3570) | Limits E2E `01-Test Data/06` fails with a pointer to this step if the flag is off |
| 0b | `Tables/System Core/Plugins Setup/Upload Plugins` (15-19) | uploads the limit plugin JARs (`proj-limit-reference-validation`, `-group-validation`, `-validation`, `-hierarchy-auto-creation`, `-account-validation`; plus `proj-ddi-limit-routing`) | `two.bankuat` has only 3 limit plugins |
| 01 | Create Group | creates table group `limits` (CORE origin, deployment properties); name-based fallback on re-run | master company must exist for FIN tables |
| 02 | Create Tables | `LI.LIMIT.REFERENCE`, `LI.LIMIT.SHARING.GROUP`, `LI.LIMIT` - all **FIN**, CORE, spaces NAU/LIV/HIS | old environments hold the previous name `LIMIT.REFERENCE` - needs migration |
| 03 | Wait For Tables | polls `SEE` until the pod answers a business 404 "Record not found" (90 attempts x 10 s) | readiness = 404, not 200 |
| 04 | Create Fields | 17 fields via Field Registry: DESCRIPTION, PARENT_REFERENCE_ID, REDUCING_LIMIT, TIME_BAND, ALLOWED_CUSTOMER, AVAILABLE_MARKER, SINGLE_LIMIT, ALLOW_NETTING, LIMIT_CURRENCY, CUSTOMER_ID, GROUP_ID, LIMIT_REFERENCE_ID, PARENT_LIMIT_ID, INTERNAL_AMOUNT, ADVISED_AMOUNT, TOTAL_OS, ACCOUNTS | field registry is independent of the group |
| 05 | Update Schemas | JSON schemas per table; amount patterns (`INTERNAL_AMOUNT`/`ADVISED_AMOUNT` reject 0, `TOTAL_OS` allows 0); `ALLOWED_CUSTOMER`/`ACCOUNTS` are arrays of LINKED_TABLE; no `required` at table level | required fields are per projection |
| 06 | Create Projections | `LI.LIMIT.REFERENCE~MASTER` (auth required; required DESCRIPTION, REDUCING_LIMIT, TIME_BAND), `LI.LIMIT.SHARING.GROUP~MASTER` (auth required; required ALLOWED_CUSTOMER), `LI.LIMIT~MASTER` (auth required; required LIMIT_CURRENCY, INTERNAL_AMOUNT; defaults AVAILABLE_MARKER true, SINGLE_LIMIT false, ALLOW_NETTING false), `LI.LIMIT~INTERNAL` (no auth; required none) | |
| 07 | Seed Error Records | 33 error ids to `ERROR~BASIC` (table below) | the earlier "28 requests" figure counted only the highest seq values; 33 files, 33 distinct ids, seq gap at 19 |
| 08 | Create Validation Rules | 3 declarative rules on `LI.LIMIT~MASTER` (below) | |
| 09 | Enable Event Emission | `PUT .../tables/LI.LIMIT/definitions/event-emission`: `RECORD_CREATED` only, predicate `space EQ LIV`; UPDATED/DELETED off | |
| 10 | Bind Events | `POST .../tables/LI.LIMIT/event-bindings`: topic `{{env-name}}.LI.LIMIT` -> `proj-limit-hierarchy-auto-creation-plugin` | |
| 11 | Bind Hooks | table below | |
| 12 | Cold Start | creates temp group `limits-coldstart-temp`, moves `LI.LIMIT.REFERENCE` into it (sleep 60 s), moves it back (sleep 60 s) - forces the pod restart that loads plugins/hooks | "Hook binding after bounce never installs; cold start required" (Bruno docs) |
| 13 | Wait After Cold Start | readiness loop over the three tables (business 404 probe, 90 x 10 s each) | |
| 14 | Cleanup | `DELETE .../groups/{{limits-seeding-temp-group-id}}` (accepts 200/204/404) | the only destructive call; deletes the temp group |
| 15 | E2E Tests | 83 files, see below | |

Hook bindings (all `POST .../tables/:tableId/definitions/projections/:projectionId/hooks/batch`):

| Plugin | Projection | Operation / phase / order |
|---|---|---|
| `proj-limit-reference-validation-plugin` | `LI.LIMIT.REFERENCE~MASTER` | INPUT PRE 1 |
| `proj-limit-group-validation-plugin` | `LI.LIMIT.SHARING.GROUP~MASTER` | INPUT PRE 1, **AUTH POST 1** |
| `proj-limit-validation-plugin` | `LI.LIMIT~MASTER` | INPUT PRE 1, AUTH PRE 1 |
| `proj-limit-account-validation-plugin` | `LI.LIMIT~INTERNAL` | INPUT PRE 1 (only INPUT fires; no AUTH on this projection) |
| `proj-limit-hierarchy-auto-creation-plugin` | event `RECORD_CREATED` on `LI.LIMIT` (LIV) | EventExtension, async |

Differences from the dev tickets (to confirm with developers): the ticket names the reference plugin `proj-limit-reference-parent-existence-plugin`, Bruno binds `proj-limit-reference-validation-plugin` (the environment has both names registered); the ticket says the group plugin runs on `AUTH/PRE`, Bruno binds `AUTH POST`.

## Error ids (ERROR~BASIC seed, 33)

Groups: owner - `EXACTLY_ONE_OF_CUSTOMER_OR_GROUP_MUST_BE_SET`, `LIMIT_OWNER_CANNOT_BE_CHANGED_AFTER_CREATION`, `LIMIT_REFERENCES_CANNOT_BE_CHANGED_AFTER_CREATION`; hierarchy - `PARENT_LIMIT_DOES_NOT_EXIST`, `PARENT_LIMIT_BELONGS_TO_ANOTHER_CUSTOMER_OR_GROUP`, `MORE_THAN_ONE_LIMIT_AT_THE_SAME_HIERARCHY_NODE`, `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD`, `PARENT_REFERENCE_CHAIN_MUST_NOT_CONTAIN_A_CYCLE`, `CURRENCY_RATE_FOR_PARENT_LIMIT_IS_NOT_AVAILABLE`, `CURRENCY_RATE_FOR_CUSTOMER_LIMIT_IS_NOT_AVAILABLE`; amounts - `ADVISED_AMOUNT_CANNOT_EXCEED_INTERNAL_SANCTIONED_LIMIT`, `UTILIZATION_CANNOT_EXCEED_INTERNAL_SANCTIONED_LIMIT`, `SANCTIONED_AMOUNTS_CANNOT_BE_CHANGED_BY_THE_ENGINE`, `UTILIZATION_IS_REQUIRED_ON_AN_ENGINE_WRITE`, `ONLY_THE_ACCOUNT_LIST_CAN_CHANGE_HERE`; netting/single - `NETTING_CANNOT_BE_ENABLED_FOR_EXCLUSIVE_SINGLE_LIMITS`, `SINGLE_LIMIT_CAN_CARRY_ONLY_ONE_ACCOUNT`; accounts - `ONLY_ONE_ACCOUNT_CAN_CHANGE_AT_A_TIME`, `ACCOUNTS_CANNOT_BE_REMOVED`, `ACCOUNT_BALANCE_DOES_NOT_EXIST`, `ATTACHED_ACCOUNT_BALANCE_MUST_BE_ZERO`, `ACCOUNT_BELONGS_TO_ANOTHER_CUSTOMER`, `ACCOUNT_DOES_NOT_EXIST`, `LIMIT_CANNOT_BE_CREATED_WITH_ACCOUNTS`, `ACCOUNTS_CANNOT_BE_CHANGED_BY_AN_AMENDMENT`, `ACCOUNTS_CAN_ONLY_BE_ATTACHED_TO_A_CUSTOMER_LIMIT`, `LIMIT_TO_AMEND_DOES_NOT_EXIST`; groups - `GROUP_CREDIT_LIMIT_PROCESSING_IS_DISABLED` ("Group credit limit processing is disabled at the system level for company {1}..."), `CUSTOMER_IS_ALREADY_IN_ANOTHER_SHARING_GROUP`, `SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS`, `SHARING_GROUP_HAS_NO_LIMIT_CONFIGURED`, `TRANSFERRED_UTILIZATION_CANNOT_EXCEED_GROUP_ADVISED_AMOUNT`, `GROUP_LIMIT_TOTAL_OS_CANNOT_BE_NEGATIVE`.

Not in Bruno although named by Stories or the workbook: `SINGLE_LIMIT_EXCLUSIVITY_VIOLATION`, `GROUP_PROCESSING_DISABLED`, `ACTIVE_GROUPS_EXIST`, `INVALID_GROUP_COUNTERPARTY`, `LIMIT_BREACHED`, `GROUP_CAPACITY_EXCEEDED`, an "account already linked" id, the messages for physical delete / immutable taxonomy / AVAILABLE_MARKER.

Validation rules on `LI.LIMIT~MASTER`: `ADVISED_AMOUNT_NOT_GREATER_THAN_INTERNAL_AMOUNT` (ADVISED GT INTERNAL -> ADVISED_AMOUNT_CANNOT_EXCEED_...), `NETTING_NOT_ALLOWED_FOR_SINGLE_LIMIT` (SINGLE_LIMIT=true AND ALLOW_NETTING=true), `TOTAL_OS_NOT_GREATER_THAN_INTERNAL_AMOUNT` (TOTAL_OS GT INTERNAL -> UTILIZATION_CANNOT_EXCEED_...). The E2E check `01-Test Data/05` requires exactly these three, no foreign rules.

## E2E suite (83 files) - flows and what each proves

Rejections assert **400 or 422** and the error id in the body; acceptances assert 200/201 (AUTH also 202).

| Folder | Flow | Scenario -> expected |
|---|---|---|
| 01 Test Data (20) | seeding for the flows | currency check/seed USD (`CURRENCY~MASTER`), 9 customers via `CM.CUSTOMER` batch INPUT (lands LIVE, no AUTH), group `LI.LSG.1` + AUTH (requires `GRP_CREDIT_LIMIT` on), taxonomy `LI.REF.A/B/C` root/mid/leaf + AUTH each, checks that hooks, rules (exactly 3) and the event binding exist (with recovery hints), account customer via `CM.CUSTOMER~RELATIONS.SYNC`, accounts via `AM.ACCOUNT` INPUT with recordId `NEW` (generated id captured), one account of another customer |
| 02 Reference (11) | 1 | root `10000` INPUT (200/201/409) + AUTH |
| | 2 | `1000` under 10000, `1010` under 1000 |
| | 3 | self reference (node 2020) -> `PARENT_REFERENCE_CHAIN_MUST_NOT_CONTAIN_A_CYCLE` |
| | 4 | missing parent 9999999 -> platform FK error "does not contain record" |
| | 5 | making 10000 a child of 1000 -> cycle error |
| 03 Limit (29) | 1 | customer limit INTERNAL 1,000,000 / ADVISED 800,000 -> UNAU, `AVAILABLE_MARKER` materialised true; AUTH -> LIVE |
| | 2 / 3 | neither owner / both owners -> `EXACTLY_ONE_OF_CUSTOMER_OR_GROUP_MUST_BE_SET` |
| | 3a | change owner by amendment -> `LIMIT_OWNER_CANNOT_BE_CHANGED_AFTER_CREATION` |
| | 4 | ADVISED 1.2M > INTERNAL 1M -> `ADVISED_AMOUNT_CANNOT_EXCEED_...` |
| | 5 | SINGLE_LIMIT + ALLOW_NETTING -> `NETTING_CANNOT_BE_ENABLED_...` |
| | 6 | explicit parent 999.9.9 -> FK error |
| | 7 | parent of another customer -> `PARENT_LIMIT_BELONGS_TO_ANOTHER_CUSTOMER_OR_GROUP` |
| | 8 | TOTAL_OS 1.5M > INTERNAL 1M -> `UTILIZATION_CANNOT_EXCEED_...` |
| | 9 | engine write-back on group limit via `~INTERNAL` with TOTAL_OS -> LIVE without 4-eyes |
| | 10 / 11 | ambiguous node (two limits under the same root) -> `MORE_THAN_ONE_LIMIT_AT_THE_SAME_HIERARCHY_NODE`; parent 1K < child 1M -> `PARENT_LIMIT_AMOUNT_CANNOT_BE_LESS_THAN_CHILD` |
| | 13 | change `LIMIT_REFERENCE_ID` -> `LIMIT_REFERENCES_CANNOT_BE_CHANGED_AFTER_CREATION` |
| | 14 | engine changes ADVISED or INTERNAL -> `SANCTIONED_AMOUNTS_CANNOT_BE_CHANGED_BY_THE_ENGINE` |
| | accounts | fixtures; two account changes at once -> `ONLY_ONE_ACCOUNT_CAN_CHANGE_AT_A_TIME`; explicit TOTAL_OS with an account change -> `ONLY_THE_ACCOUNT_LIST_CAN_CHANGE_HERE`; engine write without TOTAL_OS -> `UTILIZATION_IS_REQUIRED_ON_AN_ENGINE_WRITE`; create with accounts via MASTER -> `LIMIT_CANNOT_BE_CREATED_WITH_ACCOUNTS`; amend accounts via MASTER -> `ACCOUNTS_CANNOT_BE_CHANGED_BY_AN_AMENDMENT`; foreign account -> `ACCOUNT_BELONGS_TO_ANOTHER_CUSTOMER`; account on a group limit -> `ACCOUNTS_CAN_ONLY_BE_ATTACHED_TO_A_CUSTOMER_LIMIT` |
| 04 Hierarchy (4) | ambiguity | two sibling limits seeded via `~INTERNAL` batch, child created -> poll `SEE` on `~MASTER` (10 x 2 s) until the plugin sets `AVAILABLE_MARKER=false` (suspension) and leaves `PARENT_LIMIT_ID` empty |
| 05 Sharing Group (18) | happy path | empty group (needs `GRP_CREDIT_LIMIT` on) -> AUTH -> group limits seeded via `~INTERNAL` batch -> add members A+B (UNAU) -> AUTH |
| | rules | customer in one live group only (rejected at INPUT for a live group; draft-to-draft allowed, the race is decided at AUTH); group needs a limit before members; transfer above ADVISED rejected; reversals allowed and free the customer |

## Where this collection and our spec diverge

| Topic | Bruno | `api/limit` spec / workbook | Risk |
|---|---|---|---|
| Statuses | 200/201/409 on INPUT, 200/201/202 on AUTH | exactly 200 | a 201/202 or an existing record fails our assertion; decide per environment after the first successful run |
| Who authorises | static `operation-authorizer`, no `Cbs-User-Context` | dynamic CHECKER with `ALL` on 4 tables | permission sufficiency and propagation unverified |
| Test data | shared ids (`LI.CUS.1`, `LI.REF.A`, `10000`, `LI.LSG.1`), idempotent re-use | unique generated ids, own root per test, DB cleanup | ours is safer on shared UAT; Bruno data persists |
| Group limit creation | via `~INTERNAL` batch (E2E 05/07), and `~MASTER` for the "accepted" flow (03/17-18) | `~MASTER` INPUT + AUTH | both exist in Bruno |
| Group order | empty group -> limit -> members | workbook SM-04: members at creation (will be rejected, `SHARING_GROUP_MUST_BE_CREATED_WITHOUT_CUSTOMERS`) | documented deviation, user decision |
| COMPANY | not written in this collection; flag must be set by System Core seeding | SM-01 toggles `GRP_CREDIT_LIMIT` itself | needs the field to exist (it does not on the UAT environments) |
| Readiness | explicit hook/rule/event-binding checks with recovery hints | none; first failure is the body of a 400 | consider read-only readiness checks as a precondition |
| Customers | batch INPUT with SHORT_NAME, NAME, GENDER, DATE_OF_BIRTH, SECTOR, lands LIVE | single INPUT with the same field set | same fields |
| Currency | checks and seeds USD | only checks USD exists | fine |
| Cold start | required after plugin/hook changes (pod restart) | not our concern; but a recent deploy without it explains missing hooks | note for DevOps |
