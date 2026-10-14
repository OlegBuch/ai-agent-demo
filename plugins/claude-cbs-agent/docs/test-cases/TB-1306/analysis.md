Status: Reviewed
Related Ticket: TB-1306
Related Epic: TB-791
Source Project: TB (bank-proj.atlassian.net) — spec/stories on innowise-group.atlassian.net (CBSA space)
Owner: Manual QA

# Requirement Analysis: Integration test design: Customization (local fields & tables)

## Scope note

TB-1306 asks specifically for **Integration-level** test design proving how the Customization
module works *across* module/sub-module boundaries — not feature-level correctness (that is
already covered by the existing Smoke/Regression suite referenced in the ticket's "Link to TC"
Google Sheet, and mirrored in this document's Coverage Matrix for traceability only). Every case
in the companion workbook is `Test level: Integration`.

## Modules Touched

- **Customization (Local Fields & Tables)** — EP-01.04, the feature under test
- **Dynamic Data Dictionary (DDD)** — EP1-01.02, `TABLE.DEF`/`FIELD.DEF`; Customization is a
  "Writer" for it
- **Table Registry** — EP1-01.01, control-plane for Table Groups + Tables; the Table Registry
  microservice (real endpoints below)
- **Field Registry** — global Field-definition catalogue microservice
- **Table Template** — the runtime engine every business Table's Group actually runs; owns
  schema definitions, Projections, record operations
- **Audit Fields / Audit Cluster** — EP1-01.03, `ST_*` fields on every Table Definition

## Real cross-module architecture (confirmed via `bruno` plugin, `docs/api-bruno-spec/`)

This is the actual seam the Integration cases below exercise — resolved from the live
`proj-bruno-api` collection, not assumed:

| Seam | Mechanism |
|---|---|
| Table Registry → Table Template (discovery) | `table-template` pods call `GET {{table-registry-url}}/api/v1/groups/:groupId/tables` **at startup** to learn which Tables to host (`Table Registry/Internal/Get Tables' Configs by Group.yml`) |
| Table Registry → K8s | Creating a **Group** (`POST {{table-registry-url}}/api/v1/groups`) drives a `table-template` K8s deployment sized by `deploymentProperties.replicaCount`; a **Table** (`POST .../api/v1/tables`) is a logical entity hosted *inside* a Group's pods, not its own deployment |
| Field Registry → Table Template (schema) | A field must exist in Field Registry (`POST {{field-registry-url}}/api/v1/fields`, `origin: LOCAL`/`CORE`) before it can appear in a Table's schema. Injection itself is `PUT {{table-template-url}}/api/v1/tables/:tableId/definitions` — a **full schema replace** (`schema.properties`), not an incremental single-field append endpoint |
| Table Template → real data | `POST {{table-template-url}}/api/v1/projections/:projectionId/records/operations/:operation` (`INPUT`/`AUTH`/...) — `INPUT` on a `FIN` table lands in **NAU** awaiting `AUTH`; `INPUT` on an `INT` table lands directly in **LIVE**; `AUTH` promotes `NAU → LIVE`. This is the real mechanism behind the `LIV`/`NAU`/`HIS`/`DEL` space counts the Safe Deletion Policy checks |
| Audit Cluster | Every Table Definition's schema carries `ST_COMPANY`/`ST_INPUTTER`/`ST_DATE_TIME`/`ST_AUTHORISER`/`ST_PROJECTION`/`ST_RECORD_STATUS` (enum `UNAU`/`HOLD`/`RNAU`/`REVE`/`LIVE`/`HNAU`) — confirmed via `Table Template/Table definition/Get Table Definition.yml`'s real response body |

**Open flag (not asserted as fact in any case below):** EP-01.04's own OpenAPI draft documents a
separate four-eyes `/authorize/fields/{fieldId}` and `/authorize/tables/{tableId}/fields/{fieldId}`
step ("UNAU state and requires authorization"). The live `Field Registry`/`Table Registry` Bruno
collections do **not** contain a matching `/authorize/...` request — Create/Update/Delete on both
are direct, single-call operations in the collection as it exists today. Every case below is
written against the **Bruno-confirmed** direct-CRUD contract; if a separate authorize step exists
in the real deployed service but isn't yet captured in Bruno, that is a spec/collection
discrepancy for the Business Analyst / AQA Lead to confirm — not something this document guesses
at.

## Per-Module Analysis

### US-01.04.01 | Delete Local Table (`innowise-group.atlassian.net` CBSA `5001150591`)

#### Business Flow
Actor selects a LOCAL table → system validates `ORIGIN = LOCAL` → validates not a Linked table
→ validates `COUNT(LIV)+COUNT(NAU)+COUNT(HIS)+COUNT(DEL) == 0` → deletes → confirms.

#### Business Rules (BR)
- BR-1: Table must have `ORIGIN = LOCAL`
- BR-2: Table must not be a Linked table for any other table
- BR-3: Table must be strictly empty across all physical spaces (`LIV`/`NAU`/`HIS`/`DEL`)

#### Alternative Flows (ALT)
- ALT-1: Table is `ORIGIN = CORE` → blocked
- ALT-2: Table is a Linked table → blocked
- ALT-3: Table is not empty → blocked

#### Acceptance Criteria (AC)
- AC-1: Empty, non-linked, LOCAL table → deletion succeeds, confirmed
- AC-2: `ORIGIN = CORE` → blocked
- AC-3: Referenced as Linked table → blocked
- AC-4: Any space non-empty → blocked
- AC-5: Actor without deletion permission → blocked

### US-01.04.02 | Dynamic Schema Injection & Dictionary Rebuild Management (`4999807163`)

#### Business Flow
Actor selects table + Field ID from `FIELD.DEF` → system validates field exists with
`ORIGIN = LOCAL` → validates not already present in target `TABLE.DEF` → injects, appended to
end of business segment (before Audit Cluster) → confirms, immediately available via API/UI, no
restart.

#### Business Rules (BR)
- BR-1: Field must exist in `FIELD.DEF`
- BR-2: Field must have `ORIGIN = LOCAL`
- BR-3: Field must not already exist in target `TABLE.DEF`
- BR-4: Append-only — an injected field can never be removed from `TABLE.DEF`
- BR-5 (EP TRC-04/AC-CUS-05): Audit Cluster is logically repositioned (`SEQ.NO` shifted) so new
  fields sit *before* it, never after

#### Alternative Flows (ALT)
- ALT-1: Field ID not found in `FIELD.DEF` → blocked
- ALT-2: Field already present in target `TABLE.DEF` → blocked
- ALT-3: Field is `ORIGIN = CORE` → blocked
- ALT-4: Actor lacks injection permission → blocked

#### Acceptance Criteria (AC)
- AC-1: Valid `ORIGIN = LOCAL` field → injected, available via API/UI immediately
- AC-2: Unknown Field ID → blocked
- AC-3: `ORIGIN = CORE` field → blocked
- AC-4: Duplicate field → blocked
- AC-5: Actor without permission → blocked

### US-01.04.03 | Core & Local Artifact Governance (`5001314398`)

#### Business Flow
Actor initiates a modification on a table → system reads `ORIGIN` → evaluates the requested
operation against origin-based governance rules → permits only the documented exceptions,
blocks everything else, with state left fully unchanged on block.

#### Business Rules (BR)
- BR-1: `ORIGIN` attribute is immutable, on any table regardless of current origin
- BR-2: All modification operations blocked for `CORE` tables **except**: LOCAL field injection
  (US-01.04.02), `GROUP` attribute change
- BR-3: All modification operations blocked for `LOCAL` tables **except**: safe deletion
  (US-01.04.01), LOCAL field injection (US-01.04.02), `GROUP` attribute change
- BR-4: A blocked operation leaves the table state completely unchanged (atomic rejection,
  including multi-property payloads that mix a permitted change with a blocked one)

#### Alternative Flows (ALT)
- ALT-1: Permitted LOCAL deletion (defers to US-01.04.01)
- ALT-2: Permitted field injection (defers to US-01.04.02)
- ALT-3: Permitted `GROUP` reassignment, on either origin

#### Acceptance Criteria (AC)
- AC-1: Attempt to change `ORIGIN` → blocked, any current origin
- AC-2: `CORE` table, any operation other than the two exceptions → blocked
- AC-3: `LOCAL` table, any operation other than the three exceptions → blocked
- AC-4: `LOCAL` table, safe-deletion conditions met → permitted
- AC-5: Either origin, LOCAL field injection → permitted, proceeds via Dynamic Schema Injection
- AC-6: Any blocked attempt → table state unchanged
- AC-7: Either origin, `GROUP` change → permitted, `GROUP` updated in Table Registry

## Gaps & Conflicts Found

- The EP-01.04 spec's OpenAPI draft implies a two-step create-then-authorize (four-eyes) flow on
  both Field and Table mutations; the live Bruno collection shows single-call direct CRUD only.
  **Open question to the Business Analyst/AQA Lead:** is four-eyes authorization actually enforced
  in the deployed service today, or is that architecture not yet implemented? This affects
  whether Integration cases should expect an immediate `LIVE`/`ACTIVE` state after one call (as
  written below, matching Bruno) or an intermediate `UNAU` state requiring a second authorize
  call.
- No explicit `DELETE` request exists yet in the `Table Registry/Tables/` Bruno folder (only
  Create/Get all/Get by id/Update). `DELETE {{table-registry-url}}/api/v1/tables/:tableId` is
  used below as the REST-conventional sibling to the three documented operations on the same
  resource, consistent with US-01.04.01's own description — flagged here per the "infer from
  sibling convention, state it explicitly" rule rather than blocking case design on it.
- US-01.04.03 AC-5/Alt-2 note "LOCAL field injection ... proceeds with Dynamic Schema Injection
  logic" for **either** origin (`CORE` or `LOCAL` table) — i.e. a `CORE` table can still receive
  new LOCAL fields. This is a real, easy-to-miss governance nuance the Integration suite tests
  explicitly (IT-12).

## Required Test Types (with triggering signal)

| Type | Signal |
|---|---|
| Integration | Ticket is explicitly an "Integration test design" Spike (TB-1306); every requirement here is proven **across** Table Registry / Field Registry / Table Template / K8s-Group boundaries, with real (not mocked) dependent-service state |
| API | Every case is REST-driven against the real Bruno-documented contracts |

Positive/Negative/Edge/Smoke/Regression coverage for this same functionality already exists
(the ticket's linked "Link to TC" Google Sheet, mirrored by the Smoke examples supplied for
context) — out of scope for this document by the ticket's own request.

## Changelog

- 2026-07-07 — v1 created. Requirement analysis for TB-1306 (Customization Integration test
  design), sourced from Jira TB-1306, Confluence EP-01.04 (`4449927169`) + US-01.04.01/.02/.03
  (`5001150591`/`4999807163`/`5001314398`), and the `proj-bruno-api` Bruno collection (Table
  Registry, Field Registry, Table Template). 14 Integration test cases designed — see
  `TB-1306-test-cases-v1.xlsx`.
