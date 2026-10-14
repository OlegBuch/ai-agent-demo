Status: Draft
Related Ticket: TB-1867
Related Epic: TB-26
Source Project: TB (TEFO Bank) / bank-proj.atlassian.net — matches this repo's own documented PKF-CBS engagement
Owner: Manual QA

# Requirement Analysis: Test design: 04.02 | Negotiation Rules and Tracking Engine

TB-1867 is a `Spike` ticket ("Test design") with no Jira-native Acceptance Criteria. It links to
two Confluence container pages:

- Specification: [04.02 | Negotiation Rules and Tracking Engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1459781662) — container; real content lives in its children `EP-04.02` (Epic specification) and `TI-04.02` (Technical Implementation, currently an empty page with no children — not yet authored).
- Stories: [US-04.02 | Negotiation Rules and Tracking Engine](https://bank-proj.atlassian.net/wiki/spaces/TB/pages/1459781670) — container; three independent user-story children, each treated as its own module below:
  - `US-04.02.01 | Comparison Rules Configuration` (Jira: TB-1571)
  - `US-04.02.02 | Condition-Level Negotiation Governance` (Jira: TB-1572)
  - `US-04.02.03 | Contract-Product Linking and Mass Maintenance` (Jira: TB-1573)

## Modules Touched

1. `US-04.02.01 | Comparison Rules Configuration`
2. `US-04.02.02 | Condition-Level Negotiation Governance`
3. `US-04.02.03 | Contract-Product Linking and Mass Maintenance`

All three modules belong to the **Negotiation Rules and Tracking Engine** capability within
**Product Factory (Core)** (per `EP-04.02`'s Component field), which extends the existing Product
Builder/Attribute Class engine (`docs/project-spec/project-scope.md` confirms Product Factory
`PF.CLASS/TYPE/PRODUCT/BUILDER/MANAGER/CATALOG` already has substantial existing test coverage in
this repo).

---

## Per-Module Analysis

### US-04.02.01 | Comparison Rules Configuration (source: Confluence page 1501265944, Jira TB-1571)

#### Business Flows

1. Actor initiates the "Create Comparison Rule" action within the Comparison Rules registry.
2. System renders the Comparison Rule entry form and prompts the User to populate ID, Comparison Handler, and Valid Data Type.
3. Actor populates the fields.
4. Actor triggers the "Save" action.
5. System runs the field validations and logic checks.
6. System commits the record to the `PF.COMPARISON.TYPE` database table.

#### Business Rules (BR)

| ID | Rule | Negative outcome |
|---|---|---|
| BR-1 | ID must be specified | Block write; `"ID is required."` |
| BR-2 | At least one Valid Data Type must be populated | Block write; `"Valid Data Type is required."` |
| BR-3 | Comparison Handler must be specified | Block write; `"Comparison Handler is required."` |
| BR-4 | If Comparison Handler = `DIFFERENCE`, Valid Data Types must not contain `DATE`/`TIME`/`DATE_TIME` | Block write; `"Invalid Data Type for DIFFERENCE handler. Value cannot contain temporal values."` |
| BR-5 | If Comparison Handler = `TOLERANCE`, Valid Data Types must not contain `DATE`/`TIME`/`DATE_TIME`/`PERIOD` | Block write; `"Invalid Data Type for TOLERANCE handler. Value cannot contain temporal or period values."` |
| BR-6 | A Comparison Rule is immutable after creation | Block write; `"Comparison Rule is immutable after creation"` |

#### Alternative Flows (ALT)

- **ALT-1 (Validation Failure):** submitting a record that fails validation is blocked with the corresponding error message.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | Initiating Comparison Rule creation prompts ID, Comparison Handler, Valid Data Types |
| AC2 | User can specify multiple Valid Data Types |
| AC3 | Handler = `MINIMUM` or `MAXIMUM` → allows `NUMERIC, AMOUNT, RATE, DATE, TIME, DATE_TIME, PERIOD` |
| AC4 | Handler = `DIFFERENCE` → allows `NUMERIC, AMOUNT, RATE, PERIOD` |
| AC5 | Handler = `TOLERANCE` → allows `NUMERIC, AMOUNT, RATE` |
| AC6 | Save runs field-level, projection-level, and logical validations |
| AC7 | All validations pass → commits to `PF.COMPARISON.TYPE` + success message |
| AC8 | Any validation fails → blocks write + error message |

---

### US-04.02.02 | Condition-Level Negotiation Governance (source: Confluence page 1501134857, Jira TB-1572)

#### Business Flows

1. Actor initiates the "Create Condition" action within the Product Attribute Class registry.
2. System determines the corresponding Attribute Class, renders the Condition entry form, prompts for the Condition's own business fields.
3. System prompts for Default Negotiable flag and Default Reset flag.
4. System allows field-level negotiation configuration: Field Name, Negotiability, Mandatory, Override, Reset Option flags, plus Comparison Type, Threshold Value, Breach Action.
5. Actor populates the Default values and field-level negotiation rules.
6. Actor triggers "Save".
7. System runs field validations and logic checks.
8. System commits the record to the corresponding `PF.PRODUCT.<ATTRIBUTE_CLASS_ID>.CONDITION` table.

#### Business Rules (BR)

| ID | Rule | Negative outcome |
|---|---|---|
| BR-1 | Default Negotiable flag and Default Reset flag must both be specified | Block write; `"Default flag is required."` |
| BR-2 | If Field Name is specified, the field must exist in the target Condition | Block write; `"Specified field does not exist in the target Condition."` |
| BR-3 | If Field Name is specified, it must refer to a business field, not a negotiation field | Block write; `"Field-level negotiation rules can only be applied to condition business fields."` |
| BR-4 | If Field Name is specified, Negotiability/Mandatory/Override/Reset Option flags must all be specified | Block write; `"Specifying a Field Name requires explicit definitions for its Negotiability, Mandatory, Override, and Reset Option flags."` |
| BR-5 | If Negotiability = `FALSE`, Mandatory must be `FALSE` | Block write; `"Mutually exclusive negotiation options: MANDATORY value is not permitted on a NON_NEGOTIABLE field."` |
| BR-6 | If Negotiability = `FALSE`, Override must be `FALSE` | Block write; `"Mutually exclusive negotiation options: OVERRIDE value is not permitted on a NON_NEGOTIABLE field."` |
| BR-7 | If Negotiability = `FALSE`, Comparison Type/Threshold Value/Breach Action must not be specified | Block write; `"Comparison information cannot be defined for a NON-NEGOTIABLE field."` |
| BR-8 | If Comparison Type is specified for a field, the field's Data Type must match that Comparison Rule's Valid Data Types | Block write; `"The data type of the specified field is incompatible with the selected Comparison Type."` |
| BR-9 | If Comparison Type is specified, Threshold Value and Breach Action must both be specified | Block write; `"Both Threshold Value and Breach Action must be specified alongside a Comparison Type."` |
| BR-10 | If either Threshold Value or Breach Action is specified, Comparison Type must be specified | Block write; `"Comparison Type must be defined when a Threshold Value or Breach Action is present."` |
| BR-11 | Threshold Value's format must correspond to the target field's own format | Block write; `"Data type mismatch: Threshold Value format does not correspond to the target field type."` |
| BR-12 | Each Comparison Type configured for a specific field must be unique | Block write; `"The selected Comparison Type has already been configured for this field."` |

#### Alternative Flows (ALT)

- **ALT-1 (Validation Failure):** submitting a record that fails validation is blocked with the corresponding error message.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | Business fields specified for the Condition → system prompts Negotiation fields |
| AC2 | Default Negotiable/Reset flags defined → system permits not specifying field-level negotiation info |
| AC3 | Field Name (a business field) specified → system requires Negotiability, Mandatory, Override, Reset Option flags |
| AC4 | Negotiability = `TRUE` → system permits Mandatory = `TRUE` |
| AC5 | Negotiability = `TRUE` → system permits Override = `TRUE` |
| AC6 | Negotiability = `TRUE` → system permits specifying Comparison info (Type, Threshold, Breach Action) |
| AC7 | Negotiability = `TRUE` and a Comparison Rule already defined for the field → system permits an additional, different Comparison Type/Threshold/Breach Action for the same field |
| AC8 | Negotiability = `FALSE` → system restricts any field-level negotiation configuration |
| AC9 | Save → runs field-level, projection-level, logical validations for both business and negotiation fields |
| AC10 | All validations pass → commits the Condition + success message |
| AC11 | Any validation fails → blocks write + error message |

---

### US-04.02.03 | Contract-Product Linking and Mass Maintenance (source: Confluence page 1500971055, Jira TB-1573)

#### Business Flows

**Flow A — Initial Synchronization Link Establishment**

1. Actor initiates "Define New Product" within `PF.BUILDER`.
2. Actor specifies master product info, including the list of Conditions.
3. Actor configures the Contract Link Type per Condition: `TRACKING` / `NON_TRACKING` / `CUSTOM_TRACKING`.
4. System runs field validations and sandbox logic checks.
5. System creates a `PF.BUILDER` sandbox record and a `PF.PRODUCT` record, status `"Draft"`.
6. Actor initiates "Validate" in `PF.MANAGER`.
7. System validates the Product against the Core engine and Attribute Classes engine, resolves the structural hierarchy.
8. System updates status to `"Validated"`, updates `PF.PRODUCT`.
9. Actor (or System, if `COMBINE.ACTIONS = Yes`) triggers "Catalog".
10. System calculates the incremented Release version, updates `PF.MANAGER`/`PF.PRODUCT`/`PF.CATALOG`.
11. System commits the final immutable configuration to `PF.CATALOG`.

**Flow B — Master Condition Modification and Queue Population**

1. Actor updates a Condition linked to an existing catalogued Product with Contract Link Type `TRACKING` or `CUSTOM_TRACKING`.
2. Actor initiates "Validate" in `PF.MANAGER`.
3. System validates the Product.
4. System updates status to `"Validated"`, updates `PF.PRODUCT`.
5. Actor (or System) triggers "Catalog".
6. System increments Release version (N+1), registers the updated Condition in `PF.CATALOG`.
7. System analyzes the Contract Link Type for the changed Condition.
8. System auto-generates a tracking record in `PF.PRODUCT.TRACKER` (`PRODUCT_ID`, `ATTRIBUTES_UPDATED`, `STATUS = PENDING`).

#### Business Rules (BR)

| ID | Rule | Negative outcome |
|---|---|---|
| BR-1 | A Condition marked `NON_TRACKING` within a Product must not have its changes appended to `PF.PRODUCT.TRACKER` upon a new Product Release | Restrict tracking database updates inside `PF.PRODUCT.TRACKER` |

#### Alternative Flows (ALT)

- **ALT-1 (Validation Failure):** submitting a record that fails validation is blocked with the corresponding error message.
- **ALT-2 (Update of a `NON_TRACKING` Condition):** after the Catalog action, the system evaluates Contract Link Type; for `NON_TRACKING` it bypasses generating a `PF.PRODUCT.TRACKER` entry, leaving existing contract conditions unchanged.
- **ALT-3 (Direct Modifications in `PF.BUILDER`):** modifying the Product directly in the `PF.BUILDER` sandbox still goes through the standard three-stage lifecycle and tracking evaluation once the new Release is published.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | Condition selected for an Attribute in `PF.BUILDER` → system prompts Contract Link Type, restricted to `TRACKING`, `NON.TRACKING`, `CUSTOM.TRACKING` |
| AC2 | Condition (linked to an already-Cataloged Product) modified and saved **with** a new Effective Date → system prevents automatic update of linked Products' Resolved Conditions; requires manual Validate + Catalog per linked product |
| AC3 | Condition (linked to an already-Cataloged Product) modified and saved **without** Effective Date modification → same as AC2 (prevents auto-update; requires manual Validate + Catalog) |
| AC4 | Product already in `PF.CATALOG`, modified directly in `PF.BUILDER` → system prevents automatic update of `PF.CATALOG`; requires manual Validate + Catalog |
| AC5 | Changes validated and catalogued, Product's Release version updated → system evaluates tracking configurations to register updates |
| AC6 | New Release cataloged, changed Condition's Contract Link Type = `TRACKING` or `CUSTOM_TRACKING` → creates a single `PF.PRODUCT.TRACKER` record, `STATUS = PENDING`, recording `PRODUCT_ID` and `UPDATED_ATTRIBUTES` |
| AC7 | New Release cataloged, changed Condition's Contract Link Type = `NON_TRACKING` → bypasses generating a `PF.PRODUCT.TRACKER` record |

---

## Gaps & Conflicts Found

1. **AC3 (US-04.02.01) merges two dimensions into one AC.** It states "Handler = `MINIMUM` or `MAXIMUM`" as a single Acceptance Criterion covering two distinct Comparison Handler values with identical expected behavior. Per this framework's Decomposition rule, test design below splits this into two dedicated cases (one per handler), both citing AC3 — not a document conflict, just a decomposition note.
2. **TB-1867's own Jira description reads `"Link to TC: in Allure TestOps ?"`** (literal trailing `?`). This is ambiguous about whether this ticket's test suite is expected to live in Allure TestOps rather than (or in addition to) a local suite. This local-only run was explicitly requested by the user for TB-1867, so proceeding — but this is flagged as an open question below rather than silently resolved.
3. **`PF.COMPARISON.TYPE` and `PF.PRODUCT.INTEREST.CONDITION`'s underlying schemas are already real and implemented** (confirmed live in the `proj-bruno-api` collection: `Contract Lifecycle/00 - Seeding/05 - Update Schemas/Negotiation and Tracking/Update PF.COMPARISON.TYPE schema.yml` — fields `ID`, `VALID_DATA_TYPES`, `COMPARISON_HANDLER_ID`; and `.../05 - Update Schemas/Conditions/Product/09 Update PF.PRODUCT.INTEREST.CONDITION schema.yml` — fields `DEFAULT_NEGOTIABLE`, `DEFAULT_RESET`, and a `NEGOTIATION_RULES[]` array of `{FIELD_NAME, NEGOTIABLE, MANDATORY, OVERRIDE, RESET_OPTION, COMPARISON_TYPE, THRESHOLD_VALUE, BREACH_ACTION}` — matching US-04.02.02's BR/AC almost field-for-field). However, **no live record-operation (`records/operations/INPUT`/`SEE`) example, and no `06 - Create Projections` entry, exists yet for either resource** — only the schema/table/field-registry *seeding* calls are documented. Test cases below infer the projection id (`PF.COMPARISON.TYPE~MAIN`, `PF.PRODUCT.INTEREST.CONDITION~MAIN`) from the documented Table Template convention (`POST {base}/tables/api/v1/projections/{projectionId}/records/operations/{OPERATION}`, per `docs/frame-specs/api-conventions.md`) plus the confirmed `PF.<X>.CONDITION~MAIN` naming pattern used elsewhere in the collection (`Contract Operations Engine`'s `PF.ACTION.*.CONDITION~MAIN` projections) — each flagged inline as inferred.
4. **`PF.PRODUCT.TRACKER`'s real schema field is `TRACKER_STATUS`, not `STATUS`** as the Confluence User Story text loosely calls it (`Contract Lifecycle/00 - Seeding/05 - Update Schemas/Negotiation and Tracking/Update PF.PRODUCT.TRACKER schema.yml`: fields `ID`, `PRODUCT_ID` (linked to `PF.CATALOG`), `UPDATED_ATTRIBUTES`, `TRACKER_STATUS` with enum `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`). Test cases below use `TRACKER_STATUS`. `PF.PRODUCT.TRACKER`'s own record-operation projection (inferred `PF.PRODUCT.TRACKER~MAIN`) is likewise undocumented yet — flagged per case.
5. **US-04.02.02's BR-8 example** ("if Comparison Rule is configured strictly for the Numeric field type...") references a field's data type informally; the actual governing value is the Module-1 Comparison Rule record's own `VALID_DATA_TYPES` field, not a hardcoded "Numeric" pairing. Test cases below reference a concrete Module-1 `PF.COMPARISON.TYPE` record instead of the word "Numeric" literally.
6. **US-04.02.02 depends on Module 1's output records** (`PF.COMPARISON.TYPE` "must exist, be active, and contain active records") as a stated Precondition — a confirmed, expected cross-Story dependency (Module 2's Condition negotiation config consumes Module 1's Comparison Rules), not a conflict.
7. **`EP-04.02`'s Requirements section (PFC-01) names a `NR_OPTIONS` field with values `NEGOTIABLE`/`NON-NEGOTIABLE`/`MANDATORY`/`FIX-VALUE`/`OVERRIDE`**, while `US-04.02.02` (and the real, implemented `PF.PRODUCT.INTEREST.CONDITION` schema) instead model the same capability as four separate boolean flags (`NEGOTIABLE`, `MANDATORY`, `OVERRIDE`, `RESET_OPTION`). The implemented schema confirms the User Story's flag-based shape is what actually shipped — `EP-04.02`'s `NR_OPTIONS` reads as an earlier/superseded design note. Flagged for Business Analyst confirmation regardless (see Q3), since `EP-04.02` itself is still marked `Status: In progress`.

## Open Questions (addressed to Business Analyst / Solution Architect)

- ~~**Q1 (assignee: Viktoryia Knysh, or the Solution Architect):** Confirm whether TB-1867's test suite is meant to live in Allure TestOps (per the ticket's own `"Link to TC: in Allure TestOps ?"` description line) rather than — or in addition to — this local `.xlsx`/`.csv` suite.~~ **Resolved 2026-07-21:** confirmed via `allure-list-test-cases` — this block already has **44 existing Allure TestOps cases** under Feature `Product Factory Core` > Component `Negotiation Rules and Tracking Engine` (16 / 22 / 6 across the three Stories, statuses `Active`/`Review`). See `allure-existing-test-cases.md` in this folder for the full read-only snapshot, and the Changelog entry below about the resulting overlap with the local `v1` suite.
- **Q2 (AQA Lead / implementing dev team):** Confirm the real record-operation endpoint/projection id for `PF.COMPARISON.TYPE` and for negotiation fields on `PF.PRODUCT.<ATTRIBUTE_CLASS_ID>.CONDITION` once TB-1571/TB-1572 land — no Bruno collection example exists for either yet; cases below use an inferred Table Template convention.
- **Q3 (Business Analyst / Solution Architect):** Clarify whether `EP-04.02`'s `NR_OPTIONS` field (`NEGOTIABLE`/`NON-NEGOTIABLE`/`MANDATORY`/`FIX-VALUE`/`OVERRIDE`) and `US-04.02.02`'s four discrete flags (`Negotiability`/`Mandatory`/`Override`/`Reset Option`) describe the same mechanism in two different shapes, and which is the current source of truth for test design.

## Required Test Types (with triggering signal per type)

Computed against the full Test Type Selection Matrix (`manual-qa-agent.md`), before the explicit override applied for this run:

| Test Type | Modules | Triggering signal |
|---|---|---|
| API | All 3 | New/changed record-configuration operation (Table Template) |
| Positive | All 3 | Every Story, no exception |
| Negative | All 3 | Every Story, no exception; every BR/ALT-1 is an explicit negative-outcome rule |
| Edge/Boundary | US-04.02.01, US-04.02.02 | Domain invariants with per-dimension boundaries (Comparison Handler × Valid Data Type combinations; mutually-exclusive flag combinations) |
| Smoke | All 3 | Core/critical business journey — Product Factory's principal configuration workflow |
| Regression | US-04.02.02, US-04.02.03 | Modifies behavior an existing, already-covered flow relies on (`PF.PRODUCT.<X>.CONDITION` creation; `PF.BUILDER`/`PF.MANAGER`/`PF.CATALOG` lifecycle — see `docs/project-spec/project-scope.md`'s "Current coverage boundary") |
| Integration | US-04.02.02 (↔ US-04.02.01), US-04.02.03 (↔ PF.BUILDER/PF.MANAGER/PF.CATALOG/PF.PRODUCT.TRACKER) | Cross-entity/persistence side effect spanning real other tables |
| E2E | US-04.02.03 | Multi-step, critical user-facing journey (Draft → Validate → Catalog → Track) |
| Unit | All 3 (tracked, not authored) | Business rules/permission checks per module's Definition of Done |

**Explicit override applied for this run (`mqa-create-local-test-case TB-1867 types:smoke,regression`):** only **Smoke** and **Regression** cases were authored in the local suite below. Per this framework's override rule, every other required type above (`API` as a standalone type-tag, `Positive`/`Negative` as standalone type-tags, `Edge/Boundary`, `Integration`, `E2E`, `Unit`) is **flagged as intentionally out of scope for this revision**, not silently dropped — see `## Coverage Matrix (local suite v1)` below. In practice the Regression suite still exercises both positive and negative paths (the verb in each case's Short Description signals which), but no case in this revision is tagged `Integration`-level, `E2E`, or `Edge/Boundary` on its own.

## Coverage Matrix (local suite v1)

Local suite: `TB-1867-test-cases-v1.xlsx` / `.csv` (46 cases total — 13 for US-04.02.01, 21 for
US-04.02.02, 12 for US-04.02.03). All cases are `Test level = Component`, `Test type` includes
`API` plus `Smoke` and/or `Regression` per the explicit `types:smoke,regression` override — no
`Integration`/`E2E`/`Edge`/standalone-`Positive`/`Negative` tags were authored this revision (see
`## Required Test Types` above for what that excludes).

### US-04.02.01 | Comparison Rules Configuration

| Requirement | Case(s) | Test level / type |
|---|---|---|
| AC1 | TC-01, TC-02 | Component / API, Smoke+Regression / Regression |
| AC2 | TC-03 | Component / API, Regression |
| AC3 (MINIMUM) | TC-04 | Component / API, Regression |
| AC3 (MAXIMUM) | TC-05 | Component / API, Regression |
| AC4 | TC-06, TC-11 | Component / API, Regression |
| AC5 | TC-07, TC-12 | Component / API, Regression |
| AC6 | TC-01, TC-08–TC-13 (structural — every case's Save action exercises field/projection/logical validation) | Component / API, Smoke+Regression / Regression |
| AC7 | TC-01 | Component / API, Smoke, Regression |
| AC8 | TC-08–TC-13 (cited alongside each BR) | Component / API, Regression |
| BR-1 | TC-08 | Component / API, Regression |
| BR-2 | TC-09 | Component / API, Regression |
| BR-3 | TC-10 | Component / API, Regression |
| BR-4 | TC-11 | Component / API, Regression |
| BR-5 | TC-12 | Component / API, Regression |
| BR-6 | TC-13 | Component / API, Regression |
| ALT-1 | TC-08–TC-13 (every validation-failure case) | Component / API, Regression |

### US-04.02.02 | Condition-Level Negotiation Governance

| Requirement | Case(s) | Test level / type |
|---|---|---|
| AC1 | TC-14, TC-15 | Component / API, Smoke+Regression / Regression |
| AC2 | TC-16 | Component / API, Regression |
| AC3 | TC-17 | Component / API, Regression |
| AC4 | TC-18 | Component / API, Regression |
| AC5 | TC-19 | Component / API, Regression |
| AC6 | TC-20 | Component / API, Regression |
| AC7 | TC-21 | Component / API, Regression |
| AC8 | TC-22, TC-27, TC-28 | Component / API, Regression |
| AC9 | TC-34 (+ structural on every case) | Component / API, Regression |
| AC10 | TC-14 | Component / API, Smoke, Regression |
| AC11 | TC-23–TC-33, TC-34 | Component / API, Regression |
| BR-1 | TC-23 | Component / API, Regression |
| BR-2 | TC-24 | Component / API, Regression |
| BR-3 | TC-25 | Component / API, Regression |
| BR-4 | TC-26 | Component / API, Regression |
| BR-5 | TC-22 | Component / API, Regression |
| BR-6 | TC-27 | Component / API, Regression |
| BR-7 | TC-28 | Component / API, Regression |
| BR-8 | TC-29 | Component / API, Regression |
| BR-9 | TC-30 | Component / API, Regression |
| BR-10 | TC-31 | Component / API, Regression |
| BR-11 | TC-32 | Component / API, Regression |
| BR-12 | TC-33 | Component / API, Regression |
| ALT-1 | TC-22–TC-33 (every validation-failure case) | Component / API, Regression |

### US-04.02.03 | Contract-Product Linking and Mass Maintenance

| Requirement | Case(s) | Test level / type |
|---|---|---|
| AC1 | TC-35, TC-36 | Component / API, Smoke+Regression / Regression |
| AC2 | TC-37 | Component / API, Regression |
| AC3 | TC-38 | Component / API, Regression |
| AC4 | TC-39, TC-46 | Component / API, Regression |
| AC5 | TC-40, TC-46 | Component / API, Regression |
| AC6 (TRACKING) | TC-35, TC-41 | Component / API, Smoke+Regression / Regression |
| AC6 (CUSTOM_TRACKING) | TC-42 | Component / API, Regression |
| AC7 | TC-43, TC-44 | Component / API, Regression |
| BR-1 | TC-44 | Component / API, Regression |
| ALT-1 | (generic — covered by every BR/negative case across all three modules) | — |
| ALT-2 | TC-45 | Component / API, Regression |
| ALT-3 | TC-46 | Component / API, Regression |

### Presence checks

- No requirement item (`AC-*`/`BR-*`/`ALT-*`) maps to zero cases.
- No case names more than one Story.
- No case cites more than two `AC-*` IDs (the widest, TC-01/TC-14/TC-35, each cite exactly two).
- Every Integration-only-exception clause is moot this revision — no case is `Integration`-level.
- Unit coverage: **not evaluated this revision** — tracked separately per the framework's "Unit Tests Are Different" rule; flagged as an open item, not silently skipped, since the `types:` override excluded it (see `## Required Test Types` above).

## Changelog

- **v1 (2026-07-21):** Initial analysis authored from TB-1867's linked Confluence container pages (`EP-04.02`, `US-04.02.01/.02/.03`), cross-checked against `proj-bruno-api`'s real `PF.COMPARISON.TYPE`/`PF.PRODUCT.INTEREST.CONDITION`/`PF.PRODUCT.TRACKER`/`PF.BUILDER`/`PF.MANAGER`/`PF.CATALOG` schemas and record-operation conventions. No prior revision existed. Local test-case suite `TB-1867-test-cases-v1.xlsx`/`.csv` (46 cases: Smoke + Regression, per explicit `types:smoke,regression` override) authored in the same pass — see `## Coverage Matrix (local suite v1)` above.
- **2026-07-21 (same day, follow-up):** Ran `allure-list-test-cases` against Allure TestOps and confirmed **44 pre-existing Allure-native test cases already cover this exact block** (Feature `Product Factory Core` > Component `Negotiation Rules and Tracking Engine`, Stories matching 1:1 with this analysis's three modules). Snapshotted with full descriptions/steps into `allure-existing-test-cases.md` in this same folder (read-only fetch, nothing written to Allure). **This resolves Open Question Q1** and means the local `v1` suite above and the existing Allure suite are two independent, overlapping test-case sets for the same requirement — they were not reconciled or deduplicated against each other in this pass. Flagging plainly: per `rules/allure.md`'s note ("never run both `allure-create-test-case` and `mqa-create-local-test-case` for the same `<TICKET-KEY>`") and this command's own precondition ("if you already know a ticket has Allure test cases, confirm a local suite is intentional before proceeding"), this ticket now has both — worth a decision from the user on whether the local `v1` suite should be kept, retired, or merged into the Allure suite instead.
