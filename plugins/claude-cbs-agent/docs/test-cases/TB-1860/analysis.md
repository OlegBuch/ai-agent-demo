Status: Draft
Related Ticket: TB-1860
Related Epic: TB-791 (QA-prep container) / TB-16 (feature Epic — "Idempotency (duplicate prevention)")
Source Project: TB (bank-proj.atlassian.net) for the ticket itself; the actual specification and User
Stories live on **innowise-group.atlassian.net**, space **CBSA** (a different Atlassian site from
where the ticket is filed — see `atlassian:routing`). This repository's own `docs/project-spec/`
describes the same overall CBS domain (Table/Projection/INT-FIN-CUS/NAU-LIV-HIS), so platform
terminology below is used consistently with it, but none of the Idempotency-specific business rules
below come from this repo's docs — all are sourced fresh from Jira/Confluence per this command's
protocol.
Owner: Manual QA

# Requirement Analysis: Test design of integration: Idempotency (duplicate prevention)

## Ticket Summary

TB-1860 (Spike, "In progress", due 2026-07-17, sprint **TB-Team-3 Sprint-4**, goal "Idempotency,
Customization, Currency Definition") asks for **integration** test-case design for the Idempotency
(duplicate prevention) capability. Its own description contains a placeholder that this analysis
exists to fill:

> **Scope & Components in integration:** (fill out the points of integration after analysis)

Its description links only the Epic-level spec page (`EP-01.12 | Idempotency & Duplicate Prevention
Engine`) and an external Google Sheet ("Link to TC's") that this analysis did not open — it is not a
Confluence/Jira resource and is not the primary source of requirements per this command's protocol;
if it contains additional design detail, the Business Analyst should confirm whether it needs to be
folded in.

TB-1860 has a sibling Spike, **TB-1834** ("Test-design: Idempotency & Duplicate Prevention Engine",
status **To Do**, no "integration" in its title), which links the *same* Epic spec page plus the
**US-01.12 | User Stories** index page (which TB-1860's own description does not link directly —
found only by following TB-1834's link). TB-1834 appears to be the component/API-level test-design
counterpart to TB-1860's integration-level one; see **Open Questions** for the scoping question this
raises.

## Modules Touched

This ticket does not map to a single CBS module — the Idempotency & Duplicate Prevention Engine
(Epic TB-16 / Confluence `EP-01.12`) is an explicitly **cross-cutting** capability with five
independent User Story units, each pulled from the `US-01.12 | User Stories` Confluence index
(`4988862812`), analyzed separately below per this command's protocol:

| # | User Story unit | Confluence page |
|---|---|---|
| 1 | US-01.12.01 \| Technical Idempotency | `5057970188` |
| 2 | US-01.12.02 \| Duplicate Detection Configuration | `5065277479` |
| 3 | US-01.12.03 \| Functional Duplicate Detection (ERROR + OVERRIDE) | `5114003503` |
| 4 | US-01.12.04 \| Automated Expiry & Purging | `5122195491` |
| 5 | US-01.12.05 \| Party Merge & Resolution | `5122195641` |

## Integration Scope & Components (fills the ticket's own placeholder)

Per the Epic (TB-16) description: *"Lives inside CBS Core (`proj-table-template`) ... Cross-Module
Enforcement: Ensure duplicate detection logic is a universally available, abstract service invoked
by the core Validation Engine (EP-01.08), protecting everything from Funds Transfers to Letters of
Credit and Customer Onboarding."* — this capability's entire value proposition is that it intercepts
operations belonging to *other* modules, so every unit below is integration-relevant by design.
Concrete cross-module touchpoints identified from Jira + Confluence + this repo's own domain docs:

| Unit | Integrates with | Evidence |
|---|---|---|
| **US-01.12.01** (Technical Idempotency, Layer 1) | Every mutating operation on every Table/Projection across **all** business modules — "Target Operations: ... mutating operations that pass through the projection-based operation pipeline" (no module restriction) | US-01.12.01 Pre-Conditions; Epic TB-16 "In: operations going through a projection" |
| **US-01.12.02** (Duplicate Detection Configuration) | **Table Registry** / a target table's **template metadata** infrastructure — "Target table exists and has template metadata infrastructure available"; validates `targetTable` against the Table Registry and `matchFields[]` against that table's schema | US-01.12.02 Pre-Conditions, Alt 1, BR table |
| **US-01.12.03** (Functional Duplicate Detection, Layer 2) | The core **Validation Engine (EP-01.08)** — "duplicate detection logic is a universally available, abstract service invoked by the core Validation Engine" (Confluence spec, SYS-03); the **INPUT operation pipeline** for any target table with a config; the **Override/Accept continuation** mechanism (`InputSession`, `POST /{operation}/accept`) | Confluence spec SYS-03; US-01.12.03 flow steps 8-11 |
| **US-01.12.04** (Automated Expiry & Purging) | The **COB (Close of Business) Engine** — "COB Engine triggers the purge phase" | US-01.12.04 Main Success Scenario step 1 |
| **US-01.12.05** (Party Merge & Resolution) | The **Customer/Party (CUSTOMER) domain** — `ALT_PARTY_ID`, downstream-link rerouting | US-01.12.05 User Story; Confluence spec SYS-04 — **see Gaps & Conflicts, this is also disputed as in/out of this Epic's scope** |

Further cross-module evidence from Jira Tasks under Epic TB-16 (none of which carry their own AC —
they are implementation Tasks, listed here only to corroborate which modules actually receive this
integration, not as a requirements source):

- **TB-1439** "Idempotency reservation inside the transaction boundary" — parented under Epic
  **TB-28 "Action Processing"**, not TB-16.
- **TB-1445** "Add idempotancy configuration request to bruno requests collection and seeding on
  Payment Order" — parented under Epic **TB-51 "Payment Order"**.
- **TB-1836** "Implement idempotency cleanup" — parented under Epic **TB-44 "Entry Generation
  (posting)"**.
- **TB-1589** (Bug) "[Table Registry][Groups] Idempotency check - same POST sent twice - validation
  failure" — not linked to Epic TB-16 at all (parent is `TB-1500`, a Milestone-1 bug-tracking
  container); see Gaps & Conflicts for why this is flagged rather than assumed in-scope.

This confirms the concrete "other modules/sub-modules" this integration suite must exercise against
are at minimum: **Table Registry** (Groups/Tables/template metadata), **Validation Engine**, **Action
Processing**, **Payment Order**, **Entry Generation (posting)**, and — disputed — **Customer/Party**.

## Per-Module Analysis

### US-01.12.01 | Technical Idempotency (Confluence `5057970188`)

**User Story:** AS A API Consumer invoking mutating CBS table operations through a projection, I
WANT TO provide an optional `Idempotency-Key` with each business attempt and have CBS short-circuit
repeated requests with the same cache key, SO THAT network retries, client timeouts, double-clicks,
or repeated submissions do not execute the same business effect more than once while still allowing
a clean retry after a failed transaction.

#### Business Flows

1. Actor initiates a mutating CBS operation through a projection (e.g. `INPUT` for a table record)
   and generates an `Idempotency-Key` for this user intent.
2. System reads the `Idempotency-Key` from the inbound HTTP headers and binds it to the request
   context.
3. System constructs the scoped key from company context, raw key, projection, and operation.
4. System queries the two-tier cache (L1, then L2) for an existing marker with this scoped key.
5. System finds no marker and writes a new marker with status `IN_PROGRESS` into the cache.
6. System executes the requested business operation within a database transaction.
7. System receives a successful commit, transitions the marker from `IN_PROGRESS` to `DONE`, and
   keeps it in cache with TTL = 1 day.
8. System returns the normal business response to the Actor.

#### Business Rules (BR)

- **BR-1.1** Key Format — `Idempotency-Key` is a client-generated opaque compact string (NanoID
  recommended). *Negative outcome:* Request rejected with error; no marker created.
- **BR-1.2** Optional header — absence of `Idempotency-Key` is valid. *Negative outcome:* none — no
  error; operation processed normally without Layer 1.
- **BR-1.3** Transaction lifecycle — marker kept on commit, removed on rollback/failure. *Negative
  outcome:* on failure, marker removed, retry with same key executes again.
- **BR-1.4** TTL = 1 day — successful markers retained for 1 day. *Negative outcome:* after expiry,
  marker absent, request processed as first attempt.
- **BR-1.5** Scope of cache key — uniqueness is `(company context, idempotency_key, projection,
  operation)`. *Negative outcome:* same key with different scope does not produce a collision.
- **BR-1.6** Scope of applicability — Layer 1 applies only to operations through a projection
  pipeline. *Negative outcome:* direct internal writes that bypass the projection pipeline are not
  covered; no marker created or checked.
- **BR-1.7** Best-effort cache — cache is not guaranteed; loss of marker is accepted. *Negative
  outcome:* if both cache tiers lose the marker, request processed as first attempt; Layer 2 remains
  the backstop.
- **BR-1.8** Degraded Redis write — if Redis is unavailable during write, marker is written to L1
  only. *Negative outcome:* cross-pod deduplication is degraded; operation continues normally with
  L1-only marker.
- **BR-1.9** Separate correlation ID — `Idempotency-Key` and `X-Correlation-ID` are independent
  values. *Design constraint, no negative behavior.*
- **BR-1.10** Marker-only cache — cache entry stores deduplication marker only (no body, response,
  or fingerprint). *Design constraint, no negative behavior.*
- **BR-1.11** No new operation — existing `Operation` enum is not extended for idempotency. *Design
  constraint, no negative behavior.*

#### Alternative Flows (ALT)

- **ALT-1.1** No Idempotency-Key: request bypasses Layer 1 and is processed normally; no marker
  created.
- **ALT-1.2** Retry while first attempt is In Progress: marker found in cache → request
  short-circuited, business effect not re-executed; exact response contract open (**Q-L1RESP**).
- **ALT-1.3** Business transaction failure/rollback (including `OverrideRequiredException`): marker
  removed from cache; later retry with same key may execute again.
- **ALT-1.4** Same Idempotency-Key, different projection or operation: produces a different cache
  key; each combination evaluated independently.
- **ALT-1.5** Cache miss/eviction/restart: both tiers lost marker → processed as first attempt. If
  Redis unavailable on write, marker written to L1 only; cross-pod dedup degraded, functional (Layer
  2) remains the backstop.
- **ALT-1.6** Strictly simultaneous requests: both may read "no marker" before either writes it and
  both may proceed — accepted best-effort limitation of Layer 1.
- **ALT-1.7** Same key, different body: Layer 1 does not compare request fingerprints — deferred to
  backlog.
- **ALT-1.8** OVERRIDE continuation: original request triggers `OverrideRequiredException` → marker
  removed (transaction rolled back); the subsequent `POST /{operation}/accept` is a separate
  continuation operation, not blocked by the original request's key.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | **Optional Header:** GIVEN a mutating projection operation is submitted without `Idempotency-Key` header, WHEN the request reaches CBS, THEN the system processes it normally and does not create, check, or require any Layer 1 idempotency marker. |
| AC2 | **Header Binding:** GIVEN a request contains `Idempotency-Key` header, WHEN CBS processes the request, THEN the value is stored in the request context as a separate field from `X-Correlation-ID`. |
| AC3 | **Scoped Cache Key:** GIVEN the same raw `Idempotency-Key` is used in different projections, operations, or company contexts, WHEN CBS evaluates idempotency, THEN each combination `(company context, idempotency_key, projection, operation)` is treated as a separate cache key. |
| AC4 | **First Attempt Marker:** GIVEN a request with a key has no existing marker in cache, WHEN the operation starts, THEN the system writes an `IN_PROGRESS` marker to the idempotency cache before dispatching the business transaction. |
| AC5 | **Successful Commit Retains Marker:** GIVEN the dispatched operation commits successfully, WHEN the controller receives the successful outcome, THEN the marker transitions from `IN_PROGRESS` to `DONE` and is retained in cache with TTL = 1 day. |
| AC6 | **Rollback Removes Marker:** GIVEN the dispatched operation fails, rolls back, or throws `OverrideRequiredException`, WHEN the controller handles the outcome, THEN the marker is removed so a later retry with the same key can execute again. |
| AC7 | **Repeated Request Short-Circuit:** GIVEN a marker already exists for `(company context, idempotency_key, projection, operation)`, WHEN the same scoped request is received again, THEN the business pipeline is not re-executed. |
| AC8 | **No Fingerprint Validation:** GIVEN the same key is reused with a different request body, WHEN Layer 1 processes the request, THEN it does not perform request fingerprint comparison (deferred to backlog). |
| AC9 | **Two-Tier Cache Lookup:** GIVEN a marker is not found in cache tier L1 (in-memory) but exists in cache tier L2 (Redis), WHEN the idempotency service checks the scoped key, THEN the request is treated as a duplicate and short-circuited. |
| AC10 | **No Database Writes for Technical Keys:** GIVEN any Layer 1 idempotency operation, WHEN markers are created, confirmed, or discarded, THEN the system does not create or update a database table for technical idempotency keys. |
| AC11 | **OVERRIDE Continuation:** GIVEN an original request has triggered `OverrideRequiredException` and the marker has been removed, WHEN the client submits `POST /{operation}/accept`, THEN the accept operation produces a different cache key (different operation) and is processed as an independent first attempt. |
| AC12 | **Cache Loss Fall-Through:** GIVEN both cache tiers have lost the marker due to TTL expiry, eviction, or service restart, WHEN the same scoped key is received again, THEN CBS processes the request as a first attempt and the business check (Layer 2) remains the backstop. |

---

### US-01.12.02 | Duplicate Detection Configuration (Confluence `5065277479`)

**User Story:** AS A System Administrator, I WANT TO have a declarative configuration block in the
target table's template metadata that governs duplicate detection behavior, SO THAT the platform can
apply table-specific duplicate prevention rules without code changes.

#### Business Flows

1. Actor defines a duplicate detection configuration for a target table — specifying `targetTable`,
   `matchFields[]`, `enforcementAction`, and `purgeDays`.
2. System validates the configuration.
3. System generates a unique `configId` and persists the configuration as a JSON block in the target
   table's template metadata.
4. System confirms successful creation to the Actor.

#### Business Rules (BR)

- **BR-2.1** Configuration is stored as a JSON block in the target table's template metadata — one
  configuration block per target table. *Negative outcome:* Layer 2 duplicate detection is not
  applied for that table (silent skip).
- **BR-2.2** Configuration block must contain all required properties: `id`, `targetTable`,
  `matchFields[]`, `enforcementAction`, `purgeDays`. *Negative outcome:* rejected with error naming
  the missing property.
- **BR-2.3** `targetTable` must reference an existing table in the Table Registry that has template
  metadata infrastructure. *Negative outcome:* rejected, invalid target table (Alt 1).
- **BR-2.4** Each field in `matchFields[]` must exist in the target table's schema. *Negative
  outcome:* rejected, listing the invalid field name(s).
- **BR-2.5** `matchFields[]` must contain at least one field. *Negative outcome:* rejected —
  duplicate detection requires at least one match field.
- **BR-2.6** `enforcementAction` accepts only `ERROR`, `OVERRIDE`. *Negative outcome:* rejected,
  indicating permitted values.
- **BR-2.7** `purgeDays` must be a positive integer (> 0). *Negative outcome:* rejected.
- **BR-2.8** `matchFields` is data, not code — the hash calculator iterates over the current array at
  runtime; no rebuild/redeploy needed on change. *Design constraint.*
- **BR-2.9** Configuration is read from template metadata and cached for runtime access. *Design
  constraint.*

#### Alternative Flows (ALT)

- **ALT-2.1** Target Table Not Found: `targetTable` doesn't exist in Table Registry or lacks template
  metadata infra → rejected, config not created.
- **ALT-2.2** Validation Failure: config fails validation → rejected with rule violation, config not
  created.
- **ALT-2.3** Configuration Already Exists (Update): a config already exists for the target table →
  System updates existing block (partial update). **Open (Q-NEW5):** when `matchFields` changes, old
  registry hashes may not match the new field set — pending decision between (1) versioning the hash
  material, or (2) purging the registry on config change.
- **ALT-2.4** Persistence Failure: write to template metadata fails (infra unavailable) → error
  returned, no partial configuration persisted.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | **Successful Configuration Creation:** GIVEN a valid configuration payload with `targetTable`, `matchFields[]`, `enforcementAction`, and `purgeDays`, WHEN the Actor saves the configuration, THEN the system persists it as a JSON block in the target table's template metadata and confirms successful creation. |
| AC2 | **Target Table Not Found:** GIVEN a `targetTable` value that does not exist in the Table Registry or has no template metadata infrastructure, WHEN the Actor attempts to save the configuration, THEN the system rejects the request with an error indicating the invalid target table. |
| AC3 | **Empty matchFields Rejected:** GIVEN a configuration payload where `matchFields[]` is an empty array, WHEN the Actor attempts to save the configuration, THEN the system rejects the request with a validation error. |
| AC4 | **Missing Required Property:** GIVEN a config payload missing one or more required properties (`targetTable`, `matchFields[]`, `enforcementAction`, `purgeDays`), WHEN Actor attempts to save, THEN system rejects with an error indicating the missing property. |
| AC5 | **Invalid matchFields – Field Not in Schema:** GIVEN a configuration payload where one or more fields in `matchFields[]` do not exist in the target table's schema, WHEN the Actor attempts to save the configuration, THEN the system rejects the request with an error listing the invalid field name(s). |
| AC6 | **Invalid enforcementAction:** GIVEN a configuration payload where `enforcementAction` contains a value other than `ERROR` or `OVERRIDE`, WHEN the Actor attempts to save the configuration, THEN the system rejects the request with a validation error indicating the permitted values. |
| AC7 | **Invalid purgeDays:** GIVEN a configuration payload where `purgeDays` is not a positive integer, WHEN the Actor attempts to save the configuration, THEN the system rejects the request with a validation error. |
| AC8 | **Configuration Update – Partial Property Update:** GIVEN a duplicate detection configuration already exists for the specified target table, WHEN the Actor submits a configuration with updated property values, THEN the system updates the existing config block with the new values. |
| AC9 | **Configuration Update – matchFields Change:** GIVEN a duplicate detection configuration already exists for the target table, WHEN the Actor modifies `matchFields[]` in the configuration, THEN the system updates the config. **[Q-NEW5]** Handling of existing hashes in the registry that no longer correspond to the new field set is pending decision. |
| AC10 | **Persistence Failure:** GIVEN a valid configuration payload, WHEN the system fails to write the configuration to template metadata, THEN the system returns an error to the Actor and no partial configuration is persisted. |
| AC11 | **matchFields is Data, Not Code:** GIVEN an existing configuration with `matchFields = [fieldA, fieldB]`, WHEN the Actor updates `matchFields` to `[fieldA, fieldB, fieldC]`, THEN the next runtime duplicate check uses the updated field set without rebuild or redeployment. |

---

### US-01.12.03 | Functional Duplicate Detection — ERROR + OVERRIDE (Confluence `5114003503`)

**User Story:** AS A System processing an INPUT operation through a projection, I WANT TO compute a
business fingerprint (SHA-256 hash) from the configured match fields and check it against the
duplicate registry, SO THAT functionally duplicate business entities are detected and either blocked
(ERROR) or routed through an override flow (OVERRIDE).

#### Business Flows

1. System receives an INPUT request for a target table that has an active duplicate detection
   configuration.
2. System extracts the values of the fields listed in `matchFields[]` from the incoming request
   payload.
3. System computes a SHA-256 hash (business fingerprint) from the extracted field values.
4. System looks up the computed hash in the `duplicate_registry` for the target table.
5. System finds no match and continues with the standard processing pipeline.
6. System persists the target record.
7. System inserts a record into `duplicate_registry` containing: `id` (SHA-256 hash), `config_id`,
   `source_ref` (reference to the created record), and `expiry_date` (`CURRENT_DATE + purgeDays`).
8. System returns a success response to the caller.

#### Business Rules (BR)

- **BR-3.1** Actor (Client/Supervisor) must have permission to confirm overrides via
  `POST /{operation}/accept`. *Negative outcome:* System rejects the override confirmation.
- **BR-3.2** Hash is SHA-256 over canonical concatenation of `matchFields[]` values in configured
  order, using `0x1E` (ASCII Record Separator) as delimiter. *Design constraint.*
- **BR-3.3** Null/missing field values are replaced with a sentinel before concatenation. *Design
  constraint.*
- **BR-3.4** Numeric values normalized via `BigDecimal.toPlainString` before concatenation. *Design
  constraint.*
- **BR-3.5** Date values must be supplied directly in the specific CBS DateTime format (`YYYY-MM-DD`
  per the `DATE` `x-type` field validator); any other input format is rejected at the field-validation
  layer with a `400`, before duplicate-check hashing ever runs — there is no backend normalization of
  alternate date formats. *Design constraint.* Corrected 2026-08-07 — the prior "normalized to ISO
  format before concatenation" wording described a design that was reversed but never updated in the
  spec: dev team (Ryhor Kisly, confirmed by Dmitry Kirzhanov) stated the decision was "we should
  require one specific datetime format," not accept-and-convert arbitrary formats. Confirmed
  empirically: `VALUE_DATE="04-04-2026"` (`DD-MM-YYYY`) returns `400` ("wrong date format"), not a
  normalized `422` duplicate match. TC-11 in `idempotency-regression.spec.ts` still asserts the old
  "alternate format normalizes" premise and needs its Allure test case revised by Manual QA before
  automation can be corrected to match.
- **BR-3.6** `expiry_date` = `CURRENT_DATE + purgeDays` (from configuration). *Design constraint.*
- **BR-3.7** `source_ref` in `duplicate_registry` is a **JSON array** (`jsonb`, not a native Postgres
  `TEXT[]`) — multiple records can reference the same hash, merged into the array on conflict.
  *Design constraint.* Corrected 2026-08-06 per Bruno's `Table Template/Duplicate Registry/folder.yml`
  ("JSON array of record references contributing to the hash (merged on conflict)"); the prior
  `TEXT[]` claim was never re-verified against Bruno and caused a real automation defect (queries
  written with `= ANY(source_ref)` against a `jsonb` column) — see `[[project_tb-1860-source-ref-jsonb-not-array]]`.
- **BR-3.8** `expiry_date` is fixed at first insert; not recomputed if the same hash matches again
  (upsert). *Design constraint.*

#### Alternative Flows (ALT)

- **ALT-3.1 (Duplicate Found, ERROR):** match found; `enforcementAction = ERROR` → request rejected
  HTTP 422 including `source_ref` of the existing record.
- **ALT-3.2 (Duplicate Found, OVERRIDE):** match found; `enforcementAction = OVERRIDE` → System
  creates an `InputSession`, throws `OverrideRequiredException`, rolls back the current transaction,
  returns HTTP 422 with override information; Actor confirms via `POST /{operation}/accept`; System
  then persists the record and inserts the `duplicate_registry` entry; returns success.
- **ALT-3.3 (Override Not Confirmed):** Actor doesn't confirm within session expiry → `InputSession`
  expires/discarded; target record not persisted; no registry entry added.
- **ALT-3.4 (All Match Fields Null – Skip Check):** all `matchFields[]` values null → duplicate check
  skipped entirely; record persisted via standard pipeline; no registry entry.
- **ALT-3.5 (Partial Null in matchFields – Sentinel):** some (not all) fields null → nulls replaced
  with sentinel, hash computed normally, check proceeds as Main Success Scenario.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | **Successful Duplicate Detection – No Match Found.** GIVEN a valid configuration exists for the target table and the incoming request payload contains values for `matchFields[]`, WHEN the System computes the SHA-256 hash and performs a lookup in `duplicate_registry`, THEN no match is found, the target record is persisted, and a new entry is inserted into `duplicate_registry` with `id`, `config_id`, `source_ref`, and `expiry_date`. |
| AC2 | **Duplicate Found – ERROR.** GIVEN a valid configuration exists with `enforcementAction = ERROR`, WHEN the System finds a matching hash in `duplicate_registry`, THEN the System rejects the request with HTTP 422 including the `source_ref` of the existing record, and the target record is not persisted. |
| AC3 | **Duplicate Found – OVERRIDE Accepted.** GIVEN a valid configuration exists with `enforcementAction = OVERRIDE`, WHEN the System finds a matching hash in `duplicate_registry` and the Actor confirms the override via `POST /{operation}/accept`, THEN the target record is persisted and a new entry is inserted into `duplicate_registry` with `id`, `config_id`, `source_ref`, and `expiry_date`. |
| AC4 | **Duplicate Found – OVERRIDE Not Confirmed.** GIVEN a valid configuration exists with `enforcementAction = OVERRIDE`, WHEN the System finds a matching hash and the Actor does not confirm the override within the session expiry time, THEN the `InputSession` expires, the target record is not persisted, and no entry is added to `duplicate_registry`. |
| AC5 | **All matchFields Are Null – Skip Check.** GIVEN a valid configuration exists for the target table, WHEN all fields listed in `matchFields[]` are null in the incoming request payload, THEN the System skips the duplicate detection check entirely, the target record is persisted via the standard pipeline, and no entry is added to `duplicate_registry`. |
| AC6 | **Partial Null in matchFields – Hash With Sentinel.** GIVEN a valid configuration exists for the target table, WHEN some (but not all) fields in `matchFields[]` are null in the incoming request payload, THEN the System replaces null values with a sentinel, computes the hash normally, and proceeds with the duplicate detection check. |
| AC7 | **Override Permission Denied.** GIVEN a valid configuration exists with `enforcementAction = OVERRIDE` and the Actor does not have permission to confirm overrides, WHEN the Actor attempts to confirm the override via `POST /{operation}/accept`, THEN the System rejects the override confirmation with a permission error, and the target record is not persisted. |
| AC8 | **Registry Immutability on ERROR.** GIVEN a duplicate is found and `enforcementAction = ERROR`, WHEN the System rejects the request, THEN the existing entry in `duplicate_registry` is not modified. |

---

### US-01.12.04 | Automated Expiry & Purging (Confluence `5122195491`)

**User Story:** AS A System Administrator, I WANT TO have expired entries in the `duplicate_registry`
automatically purged, SO THAT the database does not become bloated with obsolete hashes and the
duplicate detection index remains performant.

#### Business Flows

1. COB Engine triggers the purge phase.
2. System identifies all entries in `duplicate_registry` where `expiry_date < CURRENT_DATE`.
3. System physically deletes the identified entries.
4. System completes the purge phase.

#### Business Rules (BR)

- **BR-4.1** Deletion criterion: `expiry_date < CURRENT_DATE`. *Design constraint.*
- **BR-4.2** Deletion is physical (`DELETE`), not logical (soft-delete). *Design constraint.*

#### Alternative Flows (ALT)

- **ALT-4.1 (No Expired Entries):** no entries satisfy `expiry_date < CURRENT_DATE` → no deletions;
  phase completes successfully.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | **Expired Entries Purged.** GIVEN `duplicate_registry` contains entries with `expiry_date < CURRENT_DATE`, WHEN the COB Engine triggers the purge phase, THEN all such entries are physically deleted from the registry. |
| AC2 | **No Expired Entries.** GIVEN no entries in `duplicate_registry` satisfy `expiry_date < CURRENT_DATE`, WHEN the COB Engine triggers the purge phase, THEN no deletions are performed and the phase completes successfully. |
| AC3 | **Non-Expired Entries Unaffected.** GIVEN `duplicate_registry` contains entries with `expiry_date >= CURRENT_DATE`, WHEN the purge executes, THEN those entries remain intact. |

---

### US-01.12.05 | Party Merge & Resolution (Confluence `5122195641`)

**User Story:** AS A Compliance Officer, I WANT TO resolve a detected Customer/Party duplicate by
either merging it into the existing Master record or keeping both as separate individuals, SO THAT I
can maintain a Single Version of Truth for KYC data and ensure accurate 360-degree exposure
reporting.

> **This unit is flagged as a scope conflict — see Gaps & Conflicts before treating it as in-scope
> for TB-1860.**

#### Business Flows

1. System presents the Compliance Officer with a Merge Interface showing the existing Master record
   and the new duplicate record.
2. Actor reviews both records and selects **MERGE**.
3. System enriches the Master record with any new data from the duplicate record.
4. System appends the duplicate record's ID to the Master record's `ALT_PARTY_ID` array.
5. System reroutes all downstream links to the Master record.
6. System physically discards the duplicate record.

#### Business Rules (BR)

- **BR-5.1** Resolution actions are limited to `MERGE`, `KEEP_SEPARATE`. *Negative outcome:* System
  rejects any other action value.
- **BR-5.2** On MERGE: duplicate record's ID is appended to Master's `ALT_PARTY_ID`. *Design
  constraint.*
- **BR-5.3** On MERGE: Master record is enriched with new data from the duplicate. *Design
  constraint.*
- **BR-5.4** On MERGE: all downstream links are rerouted to the Master record. *Design constraint.*
- **BR-5.5** On MERGE: duplicate record is physically discarded. *Design constraint.*
- **BR-5.6** On KEEP_SEPARATE: both records remain intact, no data modified or deleted. *Design
  constraint.*
- **BR-5.7** On KEEP_SEPARATE: no changes to `ALT_PARTY_ID` of either record. *Design constraint.*
- **BR-5.8** Party Merge & Resolution is specific to the Customer/Party domain. *Design constraint —
  see Gaps & Conflicts.*

#### Alternative Flows (ALT)

- **ALT-5.1 (KEEP_SEPARATE):** at step 2, Actor determines the records are distinct individuals and
  selects KEEP_SEPARATE → both records retained independently; no merge, no discard, no
  `ALT_PARTY_ID` change.

#### Acceptance Criteria (AC)

| AC | Description |
|---|---|
| AC1 | **MERGE – Enrichment:** GIVEN a Compliance Officer selects MERGE for a detected duplicate pair, WHEN the resolution is executed, THEN the System enriches the Master record with new data from the duplicate record. |
| AC2 | **MERGE – ALT_PARTY_ID Alias:** GIVEN a MERGE resolution is executed, WHEN the duplicate record is processed, THEN the System appends the duplicate record's ID to the Master record's `ALT_PARTY_ID` array. |
| AC3 | **MERGE – Downstream Rerouting:** GIVEN a MERGE resolution is executed, WHEN downstream links exist pointing to the duplicate record, THEN the System reroutes all downstream links to the Master record. |
| AC4 | **MERGE – Physical Discard:** GIVEN a MERGE resolution is executed, WHEN all enrichment and rerouting steps are complete, THEN the System physically discards the duplicate record from the database. |
| AC5 | **KEEP_SEPARATE – No Modification:** GIVEN a Compliance Officer selects KEEP_SEPARATE for a detected duplicate pair, WHEN the resolution is executed, THEN both records remain intact as independent entries with no data modified or deleted. |
| AC6 | **KEEP_SEPARATE – ALT_PARTY_ID Unchanged:** GIVEN a KEEP_SEPARATE resolution is executed, WHEN the resolution completes, THEN no changes are made to `ALT_PARTY_ID` of either record. |
| AC7 | **Invalid Action Rejection:** GIVEN a resolution request is submitted, WHEN the action value is neither `MERGE` nor `KEEP_SEPARATE`, THEN the System rejects the request with a validation error. |

## Gaps & Conflicts Found

1. **CONFLICT — is Party Merge & Resolution even in this Epic's scope?** Epic TB-16's own
   description states: *"Out: direct internal writes that skip the pipeline; **Customer/Party merge
   resolution (SYS-04, handled in EP-03.01)**."* The Confluence specification page (`EP-01.12`)
   itself states under **SYS-04 — Party Merge & Resolution Logic**: *"Specific to the Customer/Party
   domain **(EP-03.01)**"* — both sources place this capability under a *different* Epic (EP-03.01).
   Yet a fully-authored user story, **US-01.12.05 | Party Merge & Resolution**, exists as a direct
   child of *this* Epic's own `US-01.12 | User Stories` index page, with its own AC/BR/Alt. Either
   the Epic's own scope statement is stale, or US-01.12.05 was drafted under the wrong Epic index.
   **This must be resolved with the Business Analyst before deciding whether to design integration
   cases for it under TB-1860 at all** — see Open Questions.

2. **GAP — no AC anywhere states the cross-module manifestation the ticket asks for.** Every AC
   quoted above describes the generic Layer 1/Layer 2/COB/Merge mechanism in isolation. None of the
   five User Story units, nor any linked Jira Task, states an Acceptance Criterion for how the
   mechanism behaves *inside* a specific consuming module — e.g. no AC says "an `Idempotency-Key`
   replay on a Payment Order INPUT returns the original response" or "a duplicate `FUNDS.TRANSFER`
   blocked by `DUPLICATE.TYPE` does not leave a partial Entry Generation posting behind." This is
   precisely the integration-level requirement TB-1860 was opened to cover, and it does not exist yet
   as a testable, BA-approved statement anywhere — flagged as an **open, untested-by-design gap**
   requiring Business Analyst input per module before integration cases naming a specific other
   module's endpoint/table can be written with a concrete, falsifiable Expected Result.

3. **GAP — automation-maturity blocker for the modules this ticket actually needs to integrate
   against.** Per `docs/frame-specs/testing-standards.md`'s maturity table, this repository's `api/`
   folder has **no client/paths/types at all** — not even a stub — for **Payment Order**, **Entry
   Generation**, or **Action Processing** (the three modules Jira Tasks TB-1445, TB-1836, and TB-1439
   respectively wire Idempotency into). `account`, `cob`, `customer`, `fin_accounting`, and
   `security_management` are stub-only (empty client class, generic health-check spec). Only
   `system_core`, `product_factory`, `field-definition`, and `integration_chapter` are fully
   implemented. Practical consequence: integration cases against Payment Order/Entry
   Generation/Action Processing/Customer **cannot be automated in this repository today** without
   first building that module's client from scratch — this is a sequencing risk for the AQA Lead, not
   something to silently substitute with a `system_core`/`product_factory` table and call equivalent
   coverage.

4. **GAP/OPEN QUESTION — does the OVERRIDE continuation reuse an already-documented endpoint, or need
   a new one?** The `proj-bruno-api` collection already documents
   `POST {{table-template-url}}/api/v1/projections/:projectionId/operations/:operation/accept`
   (`Execute Accept Override.yml`), but its documented purpose is *"Acknowledge a plugin **WARNING**
   on a pending operation ... Returns **pendingOverrideIds** listing any remaining unacknowledged
   warnings"* — a plugin-hook-warning concept, not the duplicate-registry `OverrideRequiredException`
   flow US-01.12.01/03 describe. A full search of the current `proj-bruno-api` checkout found **no**
   request anywhere defining an `X-Idempotency-Key` (or `Idempotency-Key`) header — the Bruno contract
   has not yet been updated for this Epic at all. Confirmed also by Jira Task **TB-1445** ("Add
   idempotancy configuration request to bruno requests collection and seeding on Payment Order"),
   which is itself still open/in-progress work, not done.

5. **RELATED (not conflated) — TB-1589.** Bug **TB-1589** "[Table Registry][Groups] Idempotency check
   - same POST sent twice - validation failure" reports that sending the identical
   `POST {{table-registry-url}}/api/v1/groups` request twice returns `400 Bad Request` ("Table group
   already exists") instead of the expected `409 Conflict`/`201 Created`. A comment from Volha
   Yahorava (2026-07-08) says *"The correct status should be 409. Will be fixed in M2."* This ticket's
   own sprint (`TB-Team-3 Sprint-4`, ending 2026-07-20) has the stated goal *"Idempotency,
   Customization, Currency Definition"* — suggestive but **not confirmed** to be the same fix. TB-1589
   is **not** linked to Epic TB-16 or to any Idempotency Task in Jira. Do not assume this bug's fix is
   delivered by this Epic without BA confirmation — see Open Questions.

## Open Questions (addressed to Business Analyst / Solution Architect)

1. **To the Business Analyst:** Is **US-01.12.05 (Party Merge & Resolution)** actually in scope for
   Epic TB-16 / TB-1860, given the Epic's own description and the Confluence spec's SYS-04 both state
   it is "handled in EP-03.01"? If it belongs to EP-03.01, should TB-1860's integration coverage
   exclude it entirely (leaving only 4 units in scope), or is the Epic-level scope text simply stale
   and US-01.12.05 is correctly placed?
2. **To the Business Analyst:** For each of Payment Order (TB-1445), Entry Generation (TB-1836), and
   Action Processing (TB-1439) — what is the specific Acceptance Criterion for how Layer 1 (technical
   replay short-circuit) and/or Layer 2 (functional duplicate block/override) behaves *for that
   module's own operations*? None currently exists in Jira or Confluence; without it, an
   integration-level test case naming that module's endpoint cannot state a concrete, falsifiable
   Expected Result.
3. **To the Business Analyst / Solution Architect:** Is bug **TB-1589**'s planned "M2" fix (Table
   Registry Groups should return `409`, not `400`, on an identical repeat `POST`) delivered as part of
   Epic TB-16, or is it an unrelated Table-Registry-only fix? This determines whether a Table
   Registry-Groups replay case belongs in this integration suite at all.
4. **To the Solution Architect:** Does the Layer-2 OVERRIDE continuation (`POST
   /{operation}/accept`) reuse the already-documented `Execute Accept Override` Bruno request (whose
   documented contract is about plugin-hook warnings/`pendingOverrideIds`), or does Duplicate
   Detection need its own distinct accept contract? The `proj-bruno-api` collection currently has no
   `Idempotency-Key` header on any request and no duplicate-detection-specific accept endpoint.
5. **Carried forward from the source pages themselves (already flagged by their own author, not
   invented here) — need resolution before Expected Results can be made concrete:**
   - **Q-L1RESP** (US-01.12.01): the exact HTTP status/body returned for a short-circuited Layer-1
     retry is undecided.
   - **Q-META** (US-01.12.02): the actual CRUD interface (API/UI/seeding) for the `DUPLICATE.TYPE`
     configuration block is undefined.
   - **Q-NEW5** (US-01.12.02): when `matchFields[]` changes, whether old registry hashes are
     versioned-and-kept or the registry is purged is undecided — two competing designs proposed.
   - **Q-E** (US-01.12.05): whether Party Merge resolution is invoked via a dedicated endpoint
     (`POST /customers/duplicate-resolution`) or as part of the generic engine's OVERRIDE flow is
     undecided (moot if Open Question #1 above removes this unit from scope).
6. **To the AQA Lead:** Does sibling Spike **TB-1834** ("Test-design: Idempotency & Duplicate
   Prevention Engine", still To Do) own the component/API-level Smoke, Regression, Positive, and
   Negative coverage for all five units, leaving TB-1860 to own only Integration-level cases? Nothing
   in Jira currently states this split explicitly beyond the title difference, and TB-1834 hasn't
   started — if TB-1834 is deprioritized, the non-integration coverage this Epic still needs (per the
   Test Type Selection Matrix below) would have no owner.

## Required Test Types

Per the Senior Manual QA's Test Type Selection Matrix, applied to each unit (excluding the disputed
US-01.12.05 pending Open Question #1):

| Signal present | Required test types | Units it applies to |
|---|---|---|
| New/changed REST endpoint/header (`Idempotency-Key` on every mutating op; `DUPLICATE.TYPE` config CRUD; INPUT hash-check; accept-continuation; COB purge trigger) | API, **Integration**, Positive, Negative, Smoke | All 5 |
| Business rule/domain invariant enforced (TTL=1day, scoped cache key, hash canonicalization/sentinel rules, purge criterion, `ALT_PARTY_ID` append-only) | Positive, Negative, Edge/Boundary | All 5 |
| Cross-entity/persistence side effect (`duplicate_registry` rows, cache markers, template-metadata config block, `ALT_PARTY_ID` rerouting) | **Integration** (this ticket's own stated scope) | US-01.12.01, .02, .03, .04, (.05) |
| Role/permission-gated action | Positive (permitted actor), Negative (denied actor) | US-01.12.03 (override confirmation permission, AC7) |
| Modifies behavior another Story/module already relies on | **Regression** — add cases to the *existing* affected flow, don't just test the new behavior in isolation | Table Registry Groups create (TB-1589's endpoint — already regression-tested in `api/system_core/tests/table-registry-regression.spec.ts`); Validation Engine rule evaluation (already regression-tested in `api/system_core/tests/validation-engine-regression.spec.ts`, per Confluence SYS-03's statement that duplicate detection is invoked *by* the Validation Engine); any existing `system_core`/`product_factory` INPUT-operation smoke/regression suite, once Layer 1/Layer 2 sit in front of it |
| Part of a core/critical business journey | Smoke | The single most critical path per layer: a basic Layer-1 replay short-circuit on a `system_core` table's INPUT, and a basic Layer-2 ERROR block on a `product_factory` table's INPUT — this Engine is explicitly the platform's "absolute fail-safe mechanism for data integrity" per the Confluence spec's Purpose section |
| Every Story, no exception | Positive and Negative, at minimum | All 5 |

**This ticket's own scope (per its title, "integration"):** the Integration-level cases above are
TB-1860's primary deliverable. Per Open Question #6, the Positive/Negative/Smoke/Regression
component-level cases are presumed owned by sibling Spike TB-1834 — flagged, not assumed silently.

## Changelog

- 2026-07-15 — Initial analysis authored for TB-1860. Resolved Epic TB-791 (QA-prep container) and
  Epic TB-16 (feature Epic), Confluence `EP-01.12` spec page and all 5 child `US-01.12.0x` User Story
  pages, sibling Spike TB-1834, and cross-referenced Jira Tasks TB-1439/TB-1445/TB-1836 and Bug
  TB-1589. Cross-checked the `proj-bruno-api` collection for existing endpoint contracts
  (`Execute Accept Override`, `Create Record Intent`) and confirmed no `Idempotency-Key` header exists
  in the Bruno contract yet. Verdict: **Needs clarification** (6 open questions, 1 scope conflict, 3
  gaps — see above).
