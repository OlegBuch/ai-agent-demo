Status: Draft
Related Ticket: TB-2102
Related Epic: TB-5 (Customization (local fields & tables) — the feature Epic; distinct from TB-791,
the "Integration test design" container Epic that TB-1306/TB-1525 sit under for this same module)
Source Project: TB (bank-proj.atlassian.net) — spec/stories on innowise-group.atlassian.net (CBSA
space)
Owner: Manual QA

# Requirement Analysis: Test impl: Customization (local fields & tables) - Regression

## Ticket Summary

TB-2102 is a **Task** (label `AQA`, status **Done**), parented directly under Epic **TB-5 —
"Customization (local fields & tables)"**. Its description reads: "Make the regression TC set
implementation," and links out to three sources:

1. Spec: `EP-01.04 | Customization (Local Fields & Tables)` (Confluence, space `CBSA`,
   `innowise-group.atlassian.net`, page `4449927169`).
2. Stories: `US-01.04 | User Stories` (Confluence, same space, page `4969660423`) — a container
   whose current children are analyzed per module below.
3. TC link: a Google Sheets URL
   (`docs.google.com/spreadsheets/d/14m5ZYqjeslEGd7cGENF499r9ejy11VPUxTPhHgztLj4`) — **not
   accessible** to this analysis (Google Sheets requires interactive auth not available to this
   session). Its content (`TC-01`…`TC-23`) was supplied directly by the user in chat on
   2026-07-30 and is reconciled in "Test Case Inventory" below, per the same resolution pattern
   used for TB-2034's own Gap G8.

## Scope note

TB-2102 itself is **Done** — its own `TC-01`…`TC-23` (Smoke + Positive/Negative Regression, API
level) are already designed, tracked in the linked Google Sheet, and already automated in
`proj-test-automation` (`api/system_core/tests/customization-smoke.spec.ts` and the sibling
regression spec covering the same Story set). This document does **not** re-author that existing
suite — doing so would duplicate already-approved coverage with no new proof value (the same
principle TB-1306 applied when it declared Smoke/Regression "out of scope, already exists").

What changed: on **2026-07-30**, `US-01.04.02 | Core & Local Artifact Governance` was updated to
**v1.1** (see "Per-Module Analysis" below), adding a new permitted exception — updating a table's
`policies` attribute is no longer blocked for CORE or LOCAL tables. This document is scoped to the
**delta** this update requires: the new Regression cases proving that exception, continuing the
existing suite's own numbering (`TC-24`–`TC-27`) rather than restarting at `TC-01`, so this suite
stays cross-referenceable against the team's existing Google Sheet and the already-automated
spec files. The pre-existing `TC-01`–`TC-23` are reconciled for traceability only, not re-designed.

## Modules Touched

| # | Module (native title) | Jira Story | Confluence page | Status |
|---|---|---|---|---|
| 1 | `US-01.04.01 \| Delete Local Table` | not yet mirrored to a dedicated TB story | page `5001150591` | REVIEW, v1.0, unchanged since 2026-07-03 |
| 2 | `US-01.04.02 \| Core & Local Artifact Governance` | not yet mirrored to a dedicated TB story | page `5001314398` | REVIEW, **v1.1 as of 2026-07-30** |

**Renumbering note (verified live on Confluence 2026-07-30):** at the time TB-1306's analysis was
written (2026-07-07), this same page (`5001314398`) was numbered `US-01.04.03`, and a separate
page (`4999807163`) held `US-01.04.02 | Dynamic Schema Injection & Dictionary Rebuild Management`.
As of today, page `5001314398` has been **renumbered to `US-01.04.02`** and retitled
`Core & Local Artifact Governance`; the old `US-01.04.02` page (`4999807163`) is now **archived**
(status `archived`, tinyUI `/x/uwADKgE`), and its "Dynamic Schema Injection" functionality has
moved to a different Epic's story, `US-01.02.03 | Configure Table Definition` (page `4926669001`,
under `EP-01.02` Dynamic Data Dictionary). This analysis uses the **current** numbering
(`US-01.04.02 | Core & Local Artifact Governance`) throughout — matching what the user's own
request already used — not TB-1306's now-stale `US-01.04.03`.

## Per-Module Analysis

### US-01.04.01 | Delete Local Table (page `5001150591`) — unchanged

Re-verified live on 2026-07-30: last modified 2026-07-03, identical content to what TB-1306's
analysis already documented (BR-1..3, ALT-1..3, AC-1..5 on safe LOCAL-table deletion). No delta
here; not re-authored. See TB-1306's `analysis.md` for the full extraction if needed.

### US-01.04.02 | Core & Local Artifact Governance (page `5001314398`) — **v1.1, 2026-07-30**

**User Story:** AS A System administrator, I WANT TO have governance rules that distinguish
between CORE tables (delivered by the vendor) and LOCAL tables (created by the bank), SO THAT the
system enforces origin-based restrictions, preventing modifications to CORE artifacts and limiting
operations on LOCAL artifacts to ensure platform integrity during upgrades.

**Change History (verbatim, v1.1 row):** "Alt Flows – Added Alt 4: permitted operation for table
`policies` update. Business Rules (CORE) – Added Exception 3: updating table `policies` is
permitted. Business Rules (LOCAL) – Added Exception 4: updating table `policies` is permitted.
AC 2 – Added table `policies` update to the list of permitted exceptions. AC 3 – Added table
`policies` update to the list of permitted exceptions. AC 8 – Added new acceptance criterion:
system permits `policies` update for CORE and LOCAL tables." — dated 7/30/2026, Aliaksandr
Symanovich.

#### Business Flow

Actor initiates a modification operation on a table → System retrieves `ORIGIN` → System
evaluates the operation against origin-based governance rules → System either blocks it (state
left fully unchanged) or permits it as one of the documented exceptions.

#### Business Rules (BR) — quoted verbatim

- **BR (Immutable ORIGIN):** "ORIGIN attribute is immutable" → System blocks the operation, error
  returned.
- **BR (CORE tables blocked by default):** "All modification operations are blocked for CORE
  tables." → System blocks, error returned. **Exception 1:** adding a LOCAL or CORE field via
  Configure Table Definition is permitted. **Exception 2:** changing the `GROUP` attribute is
  permitted. **Exception 3 (NEW, v1.1):** "updating table `policies` is permitted."
- **BR (LOCAL tables blocked by default):** "All modification operations are blocked for LOCAL
  tables." → System blocks, error returned. **Exception 1:** deleting a LOCAL table is permitted
  subject to safe-deletion conditions. **Exception 2:** adding a LOCAL or CORE field via Configure
  Table Definition is permitted. **Exception 3:** changing the `GROUP` attribute is permitted.
  **Exception 4 (NEW, v1.1):** "updating table `policies` is permitted."

#### Alternative Flows (ALT)

- **Alt 1 (Permitted LOCAL deletion):** defers to US-01.04.01.
- **Alt 2 (Permitted field injection):** defers to US-01.02.03 | Configure Table Definition, for
  either origin.
- **Alt 3 (Permitted Table Group reassignment):** either origin, System permits and updates
  `GROUP` in the Table Registry.
- **Alt 4 (Permitted policy update, NEW v1.1):** "At step 4 in both scenarios A and B, if the
  operation is updating table `policies` – system proceeds with execution," deferring to
  `US-01.09.04 | Configure Auto-ID Rules` (page `4897571262`, linked via tiny-link `/wiki/x/vgHrIwE`
  directly from this page's own Alt 4 and AC 8 rows).

#### Acceptance Criteria (AC) — quoted verbatim, delta only

- **AC 2 (CORE, updated v1.1):** "GIVEN a table with ORIGIN = CORE, WHEN a user attempts any
  modification operation other than field (LOCAL or CORE) injection, GROUP attribute change, or
  table `policies` update, THEN the system blocks the operation and returns an error."
- **AC 3 (LOCAL, updated v1.1):** "GIVEN a table with ORIGIN = LOCAL, WHEN a user attempts any
  modification operation other than deletion, field (LOCAL or CORE) injection, GROUP attribute
  change, or table `policies` update THEN the system blocks the operation and returns an error."
- **AC 8 (NEW, v1.1):** "GIVEN a table with ORIGIN = CORE or ORIGIN = LOCAL, WHEN a user updates
  table `policies`, THEN the system permits the operation and proceeds with policy update logic"
  (deferring to `US-01.09.04`).
- (AC 1, 4, 5, 6, 7 are unchanged from TB-1306's prior extraction — immutable ORIGIN, permitted
  safe deletion, permitted field injection, state-unchanged-on-block, permitted GROUP change.)

### US-01.09.04 | Configure Auto-ID Rules (page `4897571262`) — cross-referenced, v3.0, last
modified 2026-06-22 (not itself changed today; linked from `US-01.04.02`'s own Alt 4 / AC 8 as the
"policy update logic" AC 8 defers to)

**User Story:** AS A System Administrator, I WANT TO define table-specific Auto-ID Generation
rules using sequential or lock-free randomization strategies, SO THAT I can tailor identifier
creation to specific tables, eliminate database write bottlenecks, and enforce company-specific
syntax formats.

**Relevant Business Rules & AC (quoted verbatim, the two rows this delta's cases trace to):**

- **BR:** "Validate that if this rule is linked to a table classified as `INT`, the **Company** is
  not specified (the rule applies to all Companies)." → "Block database write... error:
  `Company ID must not be specified for global INT classification tables.`"
- **BR:** "Validate that if this rule is linked to a table classified as `FIN`, the **Company**
  list is populated with at least one valid Lead Company reference." → "Block database write...
  error: `Company ID must be specified for FIN classification tables.`"
- **AC 5:** "When the rule is linked in the table registry to an `INT` classification table, the
  system must reject the association if any company identifier is specified in the **Company**
  list."
- **AC 6:** "When the rule is linked in the table registry to a `FIN` classification table, the
  system must reject the association if the **Company** list is left completely unpopulated."

**This page documents the classification gate (INT = no companies allowed; FIN = at least one
required) but does not itself state an "immutable once set" update rule** — that specific
update-time behavior (an INT table's policy, once non-empty, rejects *any* further change; a FIN
table's policy accepts a rule for a *new*, not-yet-covered company but rejects modifying an
*already-covered* company's existing rule) is not written on either Confluence page. It is,
however, **already implemented and already regression-tested** in `proj-test-automation` —
`api/system_core/tests/system-param-regression.spec.ts`, `TC-110`–`TC-122` (System Parametrization
suite, `@regression_m1` tag), exercised there only against `origin: LOCAL` Auto-ID tables:

| Existing automated case | Behavior it proves |
|---|---|
| TC-110 | FIN table, add a rule for a new, not-yet-covered lead company → 200 OK |
| TC-111 | INT table, attempt to add a second rule alongside the existing one → 400, policies unchanged |
| TC-112 | INT table, attempt to modify the existing rule's values → 400, policies unchanged |
| TC-113–120 | FIN table, attempt to modify an already-covered company's rule (company/prefix/strategy/isEnforced/maxLength/strategy-type/allowedCharacters/startValue) → 400, policies unchanged |
| TC-121 | FIN table, attempt to delete an existing rule while editing → 400 |
| TC-122 | FIN table, attempt to add a duplicate rule for an already-covered company → 400 |

None of `TC-110`–`122` assert a specific error-message string — only HTTP status (200/400) and
that `policies` is byte-for-byte unchanged on a rejected attempt. This document's own new cases
(below) follow the same evidence bar — no error-message text is asserted that isn't actually
verified somewhere in this codebase.

**Gap carried forward:** this existing coverage is `origin: LOCAL` only (`SYSTEM_PARAMETRIZATION.
AUTO_ID.ORIGIN = 'LOCAL'` in `api/utils/constants-keeper.ts`). Before 2026-07-30, this was moot —
CORE tables couldn't reach this code path at all (blocked by `US-01.04.02`'s own governance layer).
Now that `US-01.04.02` v1.1 permits `policies` updates for CORE tables too, the same INT/FIN
semantics have never been proven to hold when entered through a CORE-origin table. That is exactly
the gap this document's 4 new cases close.

## Gaps & Conflicts Found

- **G1 (Confirmed resolved by this analysis, not a new gap):** the user's own initial framing
  paired ID `US-01.04.02` with title `Core & Local Artifact Governance` — this looked like a
  mismatch against TB-1306's 2026-07-07 analysis (which had `US-01.04.03` for that title), but is
  in fact correct against the *current* live page: the story was renumbered on Confluence between
  2026-07-07 and today. TB-1306's `analysis.md` is stale on this point and should be corrected
  separately (out of scope for this document, which does not own TB-1306).
- **G2:** `US-01.04.02`'s own AC 8 / Alt 4 defer entirely to `US-01.09.04` for "policy update
  logic" but do not themselves restate the INT-immutable / FIN-additive semantics — a reader of
  `US-01.04.02` alone, without also reading `US-01.09.04` and this codebase's existing
  `system-param-regression.spec.ts`, would not know that a second PUT is ever blocked. Worth
  flagging to the Business Analyst (Aliaksandr Symanovich) that `US-01.09.04`'s own Business
  Rules/AC table documents only the classification gate at *creation/first-set* time, not the
  update-immutability behavior that the already-shipped code (and TC-110–122) actually enforces.
- **G3:** no test in this repository proves the INT/FIN policy-update semantics for a **CORE**
  origin table — every existing automated case uses `origin: LOCAL`. This is the specific gap the
  4 new cases below close.

## Open Questions

**Q1 (to Aliaksandr Symanovich):** Should `US-01.09.04`'s own Business Rules/AC table be updated
to explicitly state the update-time immutability behavior (INT frozen once non-empty; FIN additive
per new company, frozen per already-covered company), since that behavior is already shipped and
regression-tested but not written on either source page? (See Gap G2.)

## Test Case Inventory (TB-2102, `TC-01`–`TC-23`, supplied directly by the user 2026-07-30)

Reconciliation of the existing Google-Sheet-tracked suite against `US-01.04.01`/`US-01.04.02`'s
own AC/BR/Alt (using the corrected, current `US-01.04.02` numbering). Not re-authored here — this
table exists only to keep this document's own Coverage Matrix complete and to anchor the new
`TC-24`–`27` to the same numbering space.

| TC | Story | Traces to | Automation Status |
|---|---|---|---|
| TC-01 | US-01.04.01 | AC1, Main Success Scenario | Automated |
| TC-02 | US-01.04.01 | AC2, Alt 1 | Automated |
| TC-03 | US-01.04.01 | AC3, Alt 2 | Automated |
| TC-04 | US-01.04.01 | AC4, Alt 3 (DEL space) | Automated |
| TC-05 | US-01.04.01 | AC5 | Automated |
| TC-06 | US-01.04.01 | AC4, Alt 3 (LIV space) | Automated |
| TC-07 | US-01.04.01 | AC4, Alt 3 (NAU space) | Blocked (per user-supplied sheet status) |
| TC-08 | US-01.04.01 | AC4, Alt 3 (HIS space) | Automated |
| TC-09 | US-01.04.01 | AC4, Alt 3 (DEL space, alt scenario) | Blocked (per user-supplied sheet status) |
| TC-10 | US-01.04.02 | AC5, Alt 2 (field injection, defers to US-01.02.03) | Automated |
| TC-12 | US-01.04.02 | AC2/AC3 exception (CORE field injection) | Automated |
| TC-13 | US-01.04.02 | AC5 (duplicate injection, defers to US-01.02.03) | Automated |
| TC-14 | US-01.04.02 | Alt/permission-gated injection | Automated |
| TC-15 | US-01.04.02 | AC1 (ORIGIN immutable) | Pass (per sheet; automation status column not restated by user) |
| TC-16 | US-01.04.02 | AC2 (CORE metadata blocked) | Pass |
| TC-17 | US-01.04.02 | AC1 (case-insensitive ORIGIN attempt) | Automated |
| TC-18 | US-01.04.02 | AC7, Exception 2/3 (CORE GROUP change) | Automated |
| TC-19 | US-01.04.02 | AC7, Exception 3/4 (LOCAL GROUP change) | Automated |
| TC-20 | US-01.04.02 | AC2, AC6 (CORE multi-property atomic rejection) | Automated |
| TC-21 | US-01.04.02 | AC7 context (invalid GROUP payload shape) | Automated |
| TC-22 | US-01.04.02 | AC3, Main Success Scenario B (LOCAL arbitrary modification) | Automated |
| TC-23 | US-01.04.02 | AC5, Alt 2 exception (CORE + LOCAL field injection) | Automated |

No item in `TC-01`–`23` contradicts this analysis's own extraction of `US-01.04.01`/`.02` — the
sheet is additive detail (concrete table IDs, exact steps), not a new source of requirements. None
of these 23 cases exercises `policies`/`IDENTIFIER_GENERATION` at all — confirming Gap G3 is real:
before today, `policies` update was not a reachable path for this Story's own suite because it was
blocked for every origin.

## Required Test Types (this document's own scope: the `policies`-update delta only)

| Test Type | Triggering Signal |
|---|---|
| **Regression** | `US-01.04.02` v1.1 modifies behavior the existing `TC-01`–`23` suite already relies on (CORE/LOCAL tables were previously blocked from any `policies` change) — per the Test Type Selection Matrix's "Modifies behavior another Story already relies on" signal. |
| **API** | Every case is REST-driven against the Bruno-confirmed `PUT /api/v1/tables/:tableId` / `GET /api/v1/tables/:tableId` contract (`Table Registry/Tables/Update table.yml`, `Get table by id.yml`). |
| **Positive** | First-time `policies` set on an empty-policy table, for both classifications, is a documented Main-Success path (AC 8). |
| **Negative** | The blocked second update (INT) / blocked already-covered-company update (FIN) proves the same AC 8 does not silently become "policies always mutable." |

**Explicit scope override on this document:** Smoke, Edge/Boundary, Integration, E2E, and
Role/Permission-gated coverage for `US-01.04.01`/`.02` as a whole already exist in the `TC-01`–`23`
suite (reconciled above) and are not re-designed here — this document adds only the 4 cases the
2026-07-30 update requires, continuing that suite's own numbering. Full Integration-level coverage
for `US-01.04.02` (cross-module, Table Registry ↔ Table Template) is separately owned by TB-1306 —
out of scope here, and not duplicated.

## Coverage Matrix (local suite v1)

Only the 4 new cases this revision adds — TC-01 to TC-23 are reconciled in "Test Case Inventory"
above and are not repeated here (their coverage matrix already lives in the external Google Sheet
this ticket links to).

| Requirement (US-01.04.02, current numbering) | Test Case(s) | Test level / Test type | Automation Status |
|---|---|---|---|
| AC 8, Alt 4, Exception 3 (policies update permitted, CORE origin) | TC-24, TC-25 | Component / API | Not Automated |
| AC 8, Alt 4, Exception 4 (policies update permitted, LOCAL origin) | TC-26, TC-27 | Component / API | Not Automated |
| INT classification: policy immutable once non-empty (dimension: CORE origin) | TC-24 | Component / API | Not Automated |
| FIN classification: additive for new company, frozen for already-covered company (dimension: CORE origin) | TC-25 | Component / API | Not Automated |
| INT classification: policy immutable once non-empty (dimension: LOCAL origin) | TC-26 | Component / API | Not Automated |
| FIN classification: additive for new company, frozen for already-covered company (dimension: LOCAL origin) | TC-27 | Component / API | Not Automated |

Presence checks: no requirement item in this delta maps to zero cases; every case cites at most
two requirement items (AC 8 plus its own Alt/Exception, both from the same Story) and names
exactly one Story (`US-01.04.02 | Core & Local Artifact Governance`); the rule spans two
dimensions (CORE vs LOCAL origin) and each dimension has its own dedicated case pair, per the
Decomposition rule. Unit coverage: not applicable — this is a governance/validation rule enforced
at the API boundary, not a unit-testable algorithm; no Unit gap is flagged.

## Changelog

- **2026-07-30 — v1 created.** First run of `/execution:mqa-commands:mqa-create-local-test-case
  TB-2102` (this document's own analysis had no prior revision — no `mqa-review-story` had been
  run for TB-2102 before today). Triggered by a live edit to `US-01.04.02 | Core & Local Artifact
  Governance` (Confluence page `5001314398`, v1.0 → v1.1) adding a permitted `policies`-update
  exception for both CORE and LOCAL tables. Resolved the story's own renumbering since TB-1306's
  2026-07-07 analysis (this page was `US-01.04.03` then; the old `US-01.04.02` page is now
  archived and its content moved to `US-01.02.03 | Configure Table Definition`). Cross-referenced
  `US-01.09.04 | Configure Auto-ID Rules` for the INT/FIN classification semantics AC 8 defers to,
  and confirmed that exact INT-immutable/FIN-additive update behavior is already implemented and
  regression-tested in `proj-test-automation` (`system-param-regression.spec.ts`, TC-110–122) —
  but only against `origin: LOCAL` tables, never `origin: CORE` (Gap G3). Reconciled the
  pre-existing `TC-01`–`23` (supplied directly by the user, matching this ticket's own linked
  Google Sheet) without re-authoring them. Designed 4 new cases (`TC-24`–`27`) closing Gap G3,
  continuing the existing suite's numbering — see `TB-2102-test-cases-v1.xlsx`/`.csv`.
