Status: Draft
Related Ticket: TB-2034
Related Epic: TB-16
Source Project: TB (Jira project `TB` / "TEFO Bank", bank-proj.atlassian.net) — same Jira project
this suite documents, no domain mismatch. Note for re-runs: the Confluence content for this ticket
lives on a **different** Atlassian site (`innowise-group.atlassian.net`, space `CBSA`) than the
Jira instance (`bank-proj.atlassian.net`) — resolve both cloudIds, don't assume one site hosts both.
Owner: Manual QA

# Requirement Analysis: Test impl: Idempotency & Duplicate Prevention Engine - Smoke

## Ticket Summary

TB-2034 is a **Task** (not a Story), labeled `AQA`, under Epic **TB-16 — "Idempotency (duplicate
prevention)"**, due 2026-07-21, status "In progress". It carries no Jira-native Acceptance
Criteria of its own — its description only says:

> "Implement the API TCs with smoke tag."

...and links out to three sources:

1. Spec: `EP-01.12 | Idempotency & Duplicate Prevention Engine` (Confluence, space `CBSA`,
   `innowise-group.atlassian.net`, page `4988764266`, **V1.0, Status: DONE**).
2. Stories: `US-01.12 | User Stories` (Confluence, same space, page `4988862812`) — a container
   page (empty body) whose 5 real children are the actual per-module specs (see "Modules
   Touched" below).
3. TC link: a Google Sheets URL
   (`docs.google.com/spreadsheets/d/1RB0b5NalABAGyBpnu-5lCbByFmvdcAEoXB7XNntsQo4`) — **not
   accessible** to this analysis (Google Sheets requires interactive auth not available to this
   session). This sheet is presumably the deliverable of sibling ticket **TB-1834 ("Test-design:
   Idempotency & Duplicate Prevention Engine", Spike, QA label, In review)**, which links to the
   same Epic spec/stories but whose own "Link to TC:" field in Jira is empty — the sheet was
   never actually linked back into Jira. **This is an open access gap, not assumed to be
   Clear** — see "Open Questions".

Per this command's own protocol (a Task with no Jira-native AC must treat its linked
Confluence pages as the real units of analysis), the 5 child User Story pages under
`US-01.12` are the modules analyzed below, cross-checked against the Epic-level spec (`EP-01.12`)
and the Epic's own Jira description (`TB-16`).

No local `docs/project-spec/` or `docs/frame-specs/` content was consulted beyond what's already
established in this plugin's own knowledge base — this domain (Idempotency & Duplicate Prevention
Engine) is not yet reflected there; Jira/Confluence are the sole source of truth for this
analysis, per this command's constraints.

## Modules Touched

| # | Module (native title) | Jira Story | Confluence page | Status |
|---|---|---|---|---|
| 1 | `US-01.12.01 \| Technical Idempotency` | TB-1549 (In review) | page `5057970188` | REVIEW, v1.0 |
| 2 | `US-01.12.02 \| Duplicate Detection Configuration` | TB-1550 (In review) | page `5065277479` | REVIEW, v1.0 |
| 3 | `US-01.12.03 \| Functional Duplicate Detection (ERROR + OVERRIDE)` | TB-1551 (In review) | page `5114003503` | REVIEW, v1.0 |
| 4 | `US-01.12.04 \| Automated Expiry & Purging` | TB-1552 (In review) | page `5122195491` | REVIEW, v1.0 |
| 5 | `US-01.12.05 \| Party Merge & Resolution` | TB-1553 (In review) | page `5122195641` | REVIEW, v1.0 |

All 5 Stories are still `In review` in Jira and `REVIEW` on their Confluence pages — none has
been formally approved yet. Treat this as an ambient risk across the whole analysis: any of
these Stories' content can still change before implementation freezes.

Existing dev-side tasks under the same Epic confirm this is a currently-active, partially-built
feature (not yet automatable end-to-end): `TB-1368` "Duplicate-config schema in table metadata
and duplicate_registry table" (Done), `TB-1369` "Read and cache the duplicate configuration"
(Done), `TB-1370` "Hash calculator" (Done), `TB-1371` "Implements DuplicateDetectionService"
(**Done as of 2026-07-21** — was In Code Review at initial analysis), `TB-1372` "Implements Hook
in InputOperationHandler.handleCore" (**Done as of 2026-07-27** — was On hold at initial
analysis), `TB-1373` "Implements enforcementAction for both modes" (**still In Code Review as of
2026-07-27** — `ERROR`→`DuplicateFoundException`/422 and `OVERRIDE`→`OverrideRequiredException`+
`InputSession`+`/accept` continuation are coded but not yet merged/deployed; this is the
remaining blocker for TC-06/TC-13, see 2026-07-27 Changelog entry), `TB-1374` "Business
Idempotency layer tests coverage" (In Code Review — Unit-level, tracked not authored here, see
"Required Test Types"), `TB-870`/`TB-866`/`TB-867`/`TB-869` (Technical/Layer-1 idempotency,
mostly Done).

**Re-verified 2026-07-27:** `TB-2040` "Make the duplicate detection flow transactional" is now
**CANCELLED** — resolved differently than originally scoped: `@Transactional` was applied at the
operation-dispatcher implementation level instead (per its own closing comment), so this is not a
dropped requirement, just a superseded implementation path. `TB-2064` "Create endpoints to manage
the duplicate" is also now **CANCELLED**, with its own comment stating "duplicate field management
will move to table-template (`TB-2106`)". `TB-2106` ("Refactor duplicate config schema to extract
metadata into `duplicate_registry` table[-adjacent `duplicate_config` table]") is **Done** — this
resolves the Module 2 config-management endpoint gap (previously Gap/Q3 below) with a real,
already-implemented REST API: `POST/GET/DELETE /api/v1/tables/:tableId/duplicate-configs[/:configId]`
(confirmed against the `proj-bruno-api` collection, `Table Template/Duplicate Config/*.yml` —
note the canonical up-to-date checkout is `BrunoRepo/proj-bruno-api`, not the stale `BrunoApi/proj-bruno-api`
sibling which lacks this folder entirely). See the updated Gap/Q3 note and the 2026-07-27
Changelog entry for what this unblocks.

A grep of this repository's own `api/` test suite found **zero existing automated coverage**
for idempotency or duplicate detection — this is genuinely greenfield API test-automation work,
not a re-check of existing cases.

---

## Per-Module Analysis

### Module 1 — `US-01.12.01 | Technical Idempotency` (source: Confluence page `5057970188`, Jira `TB-1549`)

**User Story:** AS A API Consumer invoking mutating CBS table operations through a projection, I
WANT TO provide an optional `Idempotency-Key` with each business attempt and have CBS
short-circuit repeated requests with the same cache key, SO THAT network retries, client
timeouts, double-clicks, or repeated submissions do not execute the same business effect more
than once while still allowing a clean retry after a failed transaction.

**Cross-checked against the `proj-bruno-api` collection:** `Table Template/opencollection.yml`
confirms the real header name is `X-Idempotency-Key` (not bare `Idempotency-Key` as this page's
prose uses throughout — cosmetic naming drift, not a contract conflict) and that it is sent
**disabled by default** at the collection level, consistent with this Story's "optional header"
rule. The generic `Execute Accept Override` request (`POST
/api/v1/projections/:projectionId/operations/:operation/accept`, documented as "Allow user to
accept overrides") is the same mechanism this Story's Alt 7 and Module 3's Alt 2/AC10 rely on for
override continuation.

#### Business Flows

1. Actor initiates a mutating CBS operation through a projection (e.g. `INPUT` for a table
   record) and generates an `Idempotency-Key` for this user intent.
2. System reads the `Idempotency-Key` from the inbound HTTP headers and binds it to the request
   context.
3. System constructs the scoped key from company context, raw key, projection, and operation.
4. System queries the two-tier cache (L1 in-memory, then L2 Redis) for an existing marker with
   this scoped key.
5. System finds no marker and writes a new marker into the cache.
6. System executes the requested business operation within a database transaction.
7. System receives a successful commit and keeps the marker in cache with TTL = 1 day.
8. System returns the normal business response to the Actor.

#### Business Rules (BR)

- **BR-1 (Key Format):** "`Idempotency-Key` is a client-generated opaque compact string (NanoID
  recommended, exactly 16 chars)" → "Request rejected with error; no marker created."
- **BR-2 (Optional header):** "absence of `Idempotency-Key` is valid" → "No error; operation
  processed normally without Layer 1."
- **BR-3 (Transaction lifecycle):** "marker kept on commit, removed on rollback/failure" → "On
  failure: marker removed, retry with same key executes again."
- **BR-4 (TTL = 1 day):** "successful markers retained for 1 day" → "After expiry: marker absent,
  request processed as first attempt."
- **BR-5 (Scope of Cache key):** "uniqueness is `(company context, idempotency_key, projection,
  operation)`" → "Same key with different scope does not produce a collision."
- **BR-6 (Scope of applicability):** "Layer 1 applies only to operations through a projection
  pipeline" → "Direct internal writes that bypass the projection pipeline are not covered by
  Layer 1; no marker is created or checked."
- **BR-7 (Best-effort Cache):** "cache is not guaranteed; loss of marker is accepted" → "If both
  cache tiers lose the marker, the request is processed as a first attempt; Layer 2 remains the
  backstop."
- **BR-8 (Degraded Redis write):** "if Redis is unavailable during write, marker is written to L1
  only" → "Cross-pod deduplication is degraded; the operation continues normally with L1-only
  marker."
- **BR-9 (Separate Correlation ID):** "`Idempotency-Key` and `X-Correlation-ID` are independent
  values" — design constraint, no negative behavior.
- **BR-10 (No new operation):** "existing `Operation` enum is not extended for idempotency" —
  design constraint, no negative behavior.

#### Alternative Flows (ALT)

- **Alt 1 (No Idempotency-Key):** bypasses Layer 1, processes normally, no marker created.
- **Alt 2 (Duplicate Request – Cache Hit):** marker found → short-circuit, business effect not
  re-executed, cached response returned.
- **Alt 3 (Business transaction Failure / Rollback):** operation fails/rolls back → marker
  removed; later retry with same key may execute again.
- **Alt 4 (Same Idempotency-Key, different Projection or Operation):** produces a different cache
  key; each combination evaluated independently.
- **Alt 5 (Cache miss, Eviction, Restart etc.):** both tiers lost the marker → processed as first
  attempt; if Redis unavailable on write, marker written to L1 only, cross-pod dedup degraded,
  Layer 2 remains the backstop.
- **Alt 6 (Strictly simultaneous requests):** both may proceed if both read "no marker" before
  either writes — accepted best-effort limitation; Layer 2 and record-level persistence
  constraints provide additional protection where applicable.
- **Alt 7 (OVERRIDE Continuation):** original request results in an override requirement →
  response not cached; the subsequent `POST /{operation}/accept` is a separate continuation
  operation processed as an independent first attempt.

#### Acceptance Criteria (AC)

- **AC1 (Optional Header):** "GIVEN a mutating projection operation is submitted without
  `Idempotency-Key` header, WHEN the request reaches CBS, THEN the system processes it normally
  and does not create, check, or require any Layer 1 idempotency marker."
- **AC2 (Header Binding):** "GIVEN a request contains `Idempotency-Key` header, WHEN CBS
  processes the request, THEN the value is stored in the request context as a separate field
  from `X-Correlation-ID`."
- **AC3 (Scoped Cache Key):** "GIVEN the same raw `Idempotency-Key` is used in different
  projections, operations, or company contexts, WHEN CBS evaluates idempotency, THEN each
  combination `(company context, idempotency_key, projection, operation)` is treated as a
  separate cache key."
- **(AC4 is missing from the source page's own numbering — jumps from AC3 to AC5. See Gap G3.)**
- **AC5 (Successful Commit Retains Marker):** "GIVEN the dispatched operation commits
  successfully, WHEN the controller receives the successful outcome, THEN the marker is retained
  in cache with TTL = 1 day."
- **AC6 (Rollback Removes Marker):** "GIVEN the dispatched operation fails or rolls back, WHEN
  the controller handles the outcome, THEN the marker is removed so a later retry with the same
  key can execute again."
- **AC7 (Repeated Request Short-Circuit):** "GIVEN a marker already exists for `(company context,
  idempotency_key, projection, operation)`, WHEN the same scoped request is received again, THEN
  the business pipeline is not re-executed."
- **AC8 (Two-Tier Cache Lookup):** "GIVEN a marker is not found in cache tier L1 (in-memory) but
  exists in cache tier L2 (Redis), WHEN the idempotency service checks the scoped key, THEN the
  request is treated as a duplicate and short-circuited."
- **AC9 (No Database Writes for Technical Keys):** "GIVEN any Layer 1 idempotency operation, WHEN
  markers are created, confirmed, or discarded, THEN the system does not create or update a
  database table for technical idempotency keys."
- **AC10 (OVERRIDE Continuation):** "GIVEN an original request has resulted in an override
  requirement and the response was not cached, WHEN the client submits `POST /{operation}/accept`,
  THEN the accept operation produces a different cache key (different operation) and is processed
  as an independent first attempt."
- **AC11 (Cache Loss Fall-Through):** "GIVEN both cache tiers have lost the marker due to TTL
  expiry, eviction, or service restart, WHEN the same scoped key is received again, THEN CBS
  processes the request as a first attempt and the business check (Layer 2) remains the
  backstop."

---

### Module 2 — `US-01.12.02 | Duplicate Detection Configuration` (source: Confluence page `5065277479`, Jira `TB-1550`)

**User Story:** AS A System Administrator, I WANT TO have a declarative configuration block in
the target table's template metadata that governs duplicate detection behavior, SO THAT the
platform can apply table-specific duplicate prevention rules without code changes.

#### Business Flows

1. Actor defines a duplicate detection configuration for a target table — specifying
   `targetTable`, `matchFields[]`, `enforcementAction`, and `purgeDays`.
2. System validates the configuration.
3. System generates a unique `configId` and persists the configuration as a JSON block in the
   target table's template metadata.
4. System confirms successful creation to the Actor.

#### Business Rules (BR)

- **BR-1:** "Configuration is stored as a JSON block in the target table's template metadata. One
  configuration block per target table." → "Layer 2 duplicate detection is not applied for that
  table (silent skip)."
- **BR-2:** "Configuration block must contain all required properties: `id`, `targetTable`,
  `matchFields[]`, `enforcementAction`, `purgeDays`." → "System rejects the configuration with an
  error indicating the missing property."
- **BR-3:** "`targetTable` must reference an existing table in the Table Registry that has
  template metadata infrastructure." → "System rejects... error indicating the invalid target
  table."
- **BR-4:** "Each field in `matchFields[]` must exist in the target table's schema." → "System
  rejects... error listing the invalid field name(s)."
- **BR-5:** "`matchFields[]` must contain at least one field." → "System rejects... duplicate
  detection requires at least one match field."
- **BR-6:** "`enforcementAction` accepts only: `ERROR`, `OVERRIDE`." → "System rejects... error
  indicating the permitted values."
- **BR-7:** "`purgeDays` must be a positive integer (> 0)." → "System rejects... an error."
- **BR-8:** "`matchFields` is data, not code – the hash calculator iterates over the current
  array at runtime. No rebuild or redeployment is required when the field set changes." — design
  constraint.
- **BR-9:** "Configuration is read from template metadata and cached for runtime access." —
  design constraint.

#### Alternative Flows (ALT)

- **Alt 1 (Target Table Not Found):** `targetTable` doesn't exist / no template metadata
  infrastructure → rejected, config not created.
- **Alt 2 (Validation Failure):** config fails validation → rejected with rule violation(s), not
  created.
- **Alt 3 (Configuration Already Exists – Update):** config already exists for target table →
  System updates the existing block (partial update). **⚠️ Open question Q-NEW5** (see Open
  Questions): when `matchFields` changes, old registry hashes may not match the new field set —
  pending decision between (a) versioning the field-set into the hash material, or (b) purging
  the registry on config change.
- **Alt 4 (Persistence Failure):** write to template metadata fails → error returned, no partial
  config persisted.

#### Acceptance Criteria (AC)

- **AC1 (Successful Configuration Creation):** "GIVEN a valid configuration payload with
  `targetTable`, `matchFields[]`, `enforcementAction`, and `purgeDays` WHEN the Actor saves the
  configuration THEN the system persists it as a JSON block in the target table's template
  metadata and confirms successful creation."
- **AC2 (Target Table Not Found):** "GIVEN a `targetTable` value that does not exist... WHEN the
  Actor attempts to save... THEN the system rejects the request with an error indicating the
  invalid target table."
- **AC3 (Empty matchFields Rejected):** "GIVEN a configuration payload where `matchFields[]` is
  an empty array WHEN the Actor attempts to save... THEN the system rejects the request with a
  validation error."
- **AC4 (Missing Required Property):** "GIVEN a config payload missing one or more required
  properties..., WHEN Actor attempts to save, THEN system rejects with an error indicating the
  missing property."
- **AC5 (Invalid matchFields – Field Not in Schema):** "GIVEN... one or more fields in
  `matchFields[]` do not exist in the target table's schema WHEN... THEN the system rejects...
  error listing the invalid field name(s)."
- **AC6 (Invalid enforcementAction):** "GIVEN... `enforcementAction` contains a value other than
  `ERROR` or `OVERRIDE` WHEN... THEN the system rejects... validation error indicating the
  permitted values."
- **AC7 (Invalid purgeDays):** "GIVEN... `purgeDays` is not a positive integer WHEN... THEN the
  system rejects... a validation error."
- **AC8 (Configuration Update – Partial Property Update):** "GIVEN a duplicate detection
  configuration already exists... WHEN the Actor submits a configuration with updated property
  values THEN the system updates the existing config block with the new values."
- **AC9 (Configuration Update – matchFields Change):** "GIVEN... already exists... WHEN the Actor
  modifies `matchFields[]`... THEN the system updates the config. **[Q-NEW5]** Handling of
  existing hashes in the registry that no longer correspond to the new field set is pending
  decision."
- **AC10 (Persistence Failure):** "GIVEN a valid configuration payload WHEN the system fails to
  write... THEN the system returns an error to the Actor and no partial configuration is
  persisted."
- **AC11 (matchFields is Data, Not Code):** "GIVEN an existing configuration with `matchFields =
  [fieldA, fieldB]` WHEN the Actor updates `matchFields` to `[fieldA, fieldB, fieldC]` THEN the
  next runtime duplicate check uses the updated field set without rebuild or redeployment."

**Source-flagged open items on this page** (carried forward verbatim, not resolved by this
analysis): **[Q-META]** "The specific management mechanism (API / UI / seeding) for configuration
CRUD is not yet defined. This scenario is described abstractly – without binding to a specific
interface." **[Q-NEW5]** "When the match-field set changes, handle old hashes by (1) putting the
field-set version in the hash material – recommended – or (2) purging the registry on config
change."

**[Q-META] RESOLVED 2026-07-27:** `TB-2064` (the ticket originally expected to answer this) was
cancelled — "duplicate field management will move to table-template (`TB-2106`)" per its own
closing comment. `TB-2106` is now **Done** and delivers the real answer, but it is **not** the
mechanism this page's own Business Rules describe: BR-1 says config is "a JSON block in the
target table's template metadata"; the actual shipped design (`TB-2106`) instead adds a first-class
`duplicate_config` DB table (in the same per-company data schema as `duplicate_registry`), managed
via `POST/GET/DELETE /api/v1/tables/:tableId/duplicate-configs[/:configId]`, with the detector
reading it through an in-memory cache instead of template metadata. This is the same pattern as
Gap G2 (spec describes one storage mechanism, the shipped implementation uses another) — flag for
Business Analyst correction, not silently treated as a match. **[Q-NEW5] still open** — `TB-2106`'s
own description does not state whether it versions old hashes or purges the registry on a
`matchFields` change; this Story's own AC9 remains unverifiable until confirmed.

---

### Module 3 — `US-01.12.03 | Functional Duplicate Detection (ERROR + OVERRIDE)` (source: Confluence page `5114003503`, Jira `TB-1551`)

**User Story:** AS A System processing an INPUT operation through a projection, I WANT TO compute
a business fingerprint (SHA-256 hash) from the configured match fields and check it against the
duplicate registry, SO THAT functionally duplicate business entities are detected and either
blocked (ERROR) or routed through an override flow (OVERRIDE).

**Cross-checked against `proj-bruno-api`:** the generic `POST
/api/v1/projections/:projectionId/operations/:operation/accept` endpoint ("Allow user to accept
overrides") is documented as a generic override-acceptance mechanism (its worked example is a
plugin-warning acknowledgment, returning `pendingOverrideIds`) — consistent with, but not
identical to, this Story's duplicate-specific OVERRIDE flow. See Gap G6 / Open Question Q1 below.

#### Business Flows

1. System receives an INPUT request for a target table with an active duplicate detection
   configuration.
2. System extracts the values of the fields listed in `matchFields[]` from the incoming payload.
3. System computes a SHA-256 hash (business fingerprint) from the extracted field values.
4. System looks up the computed hash in `duplicate_registry` for the target table.
5. System finds no match and continues with the standard processing pipeline.
6. System persists the target record.
7. System inserts a record into `duplicate_registry`: `id` (SHA-256 hash), `config_id`,
   `source_ref` (reference to the created record), `expiry_date` (`CURRENT_DATE + purgeDays`).
8. System returns a success response to the caller.

#### Business Rules (BR)

- **BR-1:** "Actor (Client/Supervisor) must have permission to confirm overrides via `POST
  /{operation}/accept`." → "System rejects the override confirmation" (if not).
- **BR-2:** "Hash is computed as SHA-256 over canonical concatenation of `matchFields[]` values in
  the order defined in the configuration, using `0x1E` (ASCII Record Separator) as delimiter." —
  design constraint (Unit-level, see "Required Test Types").
- **BR-3:** "Null/missing field values are replaced with a sentinel value before concatenation."
  — design constraint.
- **BR-4:** "Numeric values are normalized via `BigDecimal.toPlainString` before concatenation."
  — design constraint.
- **BR-5:** "Date values are normalized to CBS DateTime format before concatenation." — design
  constraint.
- **BR-6:** "`expiry_date` is calculated as `CURRENT_DATE + purgeDays` (from configuration)." —
  design constraint.
- **BR-7:** "`source_ref` in `duplicate_registry` is `TEXT[]` – multiple records can reference the
  same hash." — design constraint. **No AC exercises the multi-reference/upsert case — see Gap
  G7.**
- **BR-8:** "`expiry_date` is fixed at first insert. If the same hash is matched again (upsert),
  `expiry_date` is not recomputed." — design constraint. **Same gap as BR-7.**

#### Alternative Flows (ALT)

- **Alt 1 (Duplicate Found, ERROR):** match found, `enforcementAction = ERROR` → rejects with
  HTTP 422 including `source_ref` of the existing record; target record not persisted.
- **Alt 2 (Duplicate Found, OVERRIDE):** match found, `enforcementAction = OVERRIDE` → System
  creates an `InputSession`, throws `OverrideRequiredException`, rolls back the current
  transaction, returns HTTP 422 with override information; Actor confirms via `POST
  /{operation}/accept`; System persists the record and inserts into `duplicate_registry` (same
  fields as Main Flow step 7); returns success to the Actor.
- **Alt 3 (Override Not Confirmed):** Actor doesn't confirm within session expiry → `InputSession`
  expires/discarded; record not persisted; no registry entry added.
- **Alt 4 (All Match Fields Are Null – Skip Check):** all `matchFields[]` null → duplicate check
  skipped entirely; record persisted via standard pipeline; no registry entry.
- **Alt 5 (Partial Null in matchFields – Hash With Sentinel):** some (not all) fields null →
  nulls replaced with sentinel, hash computed normally, check proceeds per Main Flow.

#### Acceptance Criteria (AC)

- **AC1 (Successful Duplicate Detection – No Match Found):** "GIVEN a valid configuration exists
  for the target table and the incoming request payload contains values for `matchFields[]` WHEN
  the System computes the SHA-256 hash and performs a lookup in `duplicate_registry` THEN no
  match is found, the target record is persisted, and a new entry is inserted into
  `duplicate_registry` with `id`, `config_id`, `source_ref`, and `expiry_date`."
- **AC2 (Duplicate Found – ERROR):** "GIVEN a valid configuration exists with `enforcementAction
  = ERROR` WHEN the System finds a matching hash... THEN the System rejects the request with HTTP
  422 including the `source_ref` of the existing record, and the target record is not
  persisted."
- **AC3 (Duplicate Found – OVERRIDE Accepted):** "GIVEN... `enforcementAction = OVERRIDE` WHEN
  the System finds a matching hash... and the Actor confirms the override via `POST
  /{operation}/accept` THEN the target record is persisted and a new entry is inserted into
  `duplicate_registry`..."
- **AC4 (Duplicate Found – OVERRIDE Not Confirmed):** "GIVEN... `enforcementAction = OVERRIDE`
  WHEN the System finds a matching hash and the Actor does not confirm the override within the
  session expiry time THEN the `InputSession` expires, the target record is not persisted, and no
  entry is added to `duplicate_registry`."
- **AC5 (All matchFields Are Null – Skip Check):** "GIVEN a valid configuration exists... WHEN
  all fields listed in `matchFields[]` are null... THEN the System skips the duplicate detection
  check entirely, the target record is persisted via the standard pipeline, and no entry is added
  to `duplicate_registry`."
- **AC6 (Partial Null in matchFields – Hash With Sentinel):** "GIVEN a valid configuration
  exists... WHEN some (but not all) fields... are null... THEN the System replaces null values
  with a sentinel, computes the hash normally, and proceeds with the duplicate detection check."
- **AC7 (Override Permission Denied):** "GIVEN... `enforcementAction = OVERRIDE` and the Actor
  does not have permission to confirm overrides WHEN the Actor attempts to confirm... THEN the
  System rejects the override confirmation with a permission error, and the target record is not
  persisted."
- **AC8 (Registry Immutability on ERROR):** "GIVEN a duplicate is found and `enforcementAction =
  ERROR` WHEN the System rejects the request THEN the existing entry in `duplicate_registry` is
  not modified."

---

### Module 4 — `US-01.12.04 | Automated Expiry & Purging` (source: Confluence page `5122195491`, Jira `TB-1552`)

**User Story:** AS A System Administrator, I WANT TO have expired entries in `duplicate_registry`
automatically purged, SO THAT the database does not become bloated with obsolete hashes and the
duplicate detection index remains performant.

#### Business Flows

1. COB Engine triggers the purge phase.
2. System identifies all entries in `duplicate_registry` where `expiry_date < CURRENT_DATE`.
3. System physically deletes the identified entries.
4. System completes the purge phase.

#### Business Rules (BR)

- **BR-1:** "Deletion criterion: `expiry_date < CURRENT_DATE`." — design constraint.
- **BR-2:** "Deletion is physical (`DELETE`), not logical (soft-delete)." — design constraint.

#### Alternative Flows (ALT)

- **Alt 1 (No Expired Entries):** no entries satisfy the deletion criterion → no deletions
  performed; phase completes successfully.

#### Acceptance Criteria (AC)

- **AC1 (Expired Entries Purged):** "GIVEN `duplicate_registry` contains entries with
  `expiry_date < CURRENT_DATE` WHEN the COB Engine triggers the purge phase THEN all such entries
  are physically deleted from the registry."
- **AC2 (No Expired Entries):** "GIVEN no entries... satisfy `expiry_date < CURRENT_DATE` WHEN
  the COB Engine triggers the purge phase THEN no deletions are performed and the phase completes
  successfully."
- **AC3 (Non-Expired Entries Unaffected):** "GIVEN `duplicate_registry` contains entries with
  `expiry_date >= CURRENT_DATE` WHEN the purge executes THEN those entries remain intact."

---

### Module 5 — `US-01.12.05 | Party Merge & Resolution` (source: Confluence page `5122195641`, Jira `TB-1553`)

**⚠️ Scope conflict with the Epic itself — see Gap G1.** The Epic's own Jira description (`TB-16`)
states Party Merge (SYS-04) is explicitly **out of this Epic's scope**, yet this Story exists
under this same Epic's own `US-01.12` User Stories index and the Epic's Confluence spec
(`EP-01.12`) documents it as its own Requirement `SYS-04`. Analyzed here as documented, with the
conflict flagged, not silently resolved.

**User Story:** AS A Compliance Officer, I WANT TO resolve a detected Customer/Party duplicate by
either merging it into the existing Master record or keeping both as separate individuals, SO
THAT I can maintain a Single Version of Truth for KYC data and ensure accurate 360-degree exposure
reporting.

**Cross-checked against `proj-bruno-api`:** no `duplicate-resolution` endpoint, `ALT_PARTY_ID`
field, `MERGE`/`KEEP_SEPARATE` action, or Customer-merge request of any kind is documented in the
collection today — consistent with this page's own flagged open question (Q-E, below); this
mechanism is not yet part of the published API contract.

#### Business Flows

1. System presents the Compliance Officer with a Merge Interface showing the existing Master
   record and the new duplicate record.
2. Actor reviews both records and selects MERGE.
3. System enriches the Master record with any new data from the duplicate record.
4. System appends the duplicate record's ID to the Master record's `ALT_PARTY_ID` array.
5. System reroutes all downstream links to the Master record.
6. System physically discards the duplicate record.

#### Business Rules (BR)

- **BR-1:** "Resolution actions are limited to: `MERGE`, `KEEP_SEPARATE`." → "System rejects any
  other action value."
- **BR-2:** "On MERGE: duplicate record's ID is appended to Master's `ALT_PARTY_ID`." — design
  constraint.
- **BR-3:** "On MERGE: Master record is enriched with new data from the duplicate." — design
  constraint.
- **BR-4:** "On MERGE: all downstream links are rerouted to the Master record." — design
  constraint.
- **BR-5:** "On MERGE: duplicate record is physically discarded." — design constraint.
- **BR-6:** "On KEEP_SEPARATE: both records remain intact, no data is modified or deleted." —
  design constraint.
- **BR-7:** "On KEEP_SEPARATE: no changes to `ALT_PARTY_ID` of either record." — design
  constraint.
- **BR-8:** "Party Merge & Resolution is specific to Customer/Party domain." — design constraint
  (and the same fact the Epic's own Jira description uses to argue this Story is out of scope —
  see Gap G1).

#### Alternative Flows (ALT)

- **Alt 1 (KEEP_SEPARATE):** Officer determines the records are distinct individuals and selects
  KEEP_SEPARATE → both records retained independently; no merge, no discard, no `ALT_PARTY_ID`
  change.

#### Acceptance Criteria (AC)

- **AC1 (MERGE – Enrichment):** "GIVEN a Compliance Officer selects MERGE for a detected
  duplicate pair, WHEN the resolution is executed, THEN the System enriches the Master record
  with new data from the duplicate record."
- **AC2 (MERGE – ALT_PARTY_ID Alias):** "GIVEN a MERGE resolution is executed, WHEN the duplicate
  record is processed, THEN the System appends the duplicate record's ID to the Master record's
  `ALT_PARTY_ID` array."
- **AC3 (MERGE – Downstream Rerouting):** "GIVEN a MERGE resolution is executed, WHEN downstream
  links exist pointing to the duplicate record, THEN the System reroutes all downstream links to
  the Master record."
- **AC4 (MERGE – Physical Discard):** "GIVEN a MERGE resolution is executed, WHEN all enrichment
  and rerouting steps are complete, THEN the System physically discards the duplicate record from
  the database."
- **AC5 (KEEP_SEPARATE – No Modification):** "GIVEN a Compliance Officer selects KEEP_SEPARATE
  for a detected duplicate pair, WHEN the resolution is executed, THEN both records remain intact
  as independent entries with no data modified or deleted."
- **AC6 (KEEP_SEPARATE – ALT_PARTY_ID Unchanged):** "GIVEN a KEEP_SEPARATE resolution is executed,
  WHEN the resolution completes, THEN no changes are made to `ALT_PARTY_ID` of either record."
- **AC7 (Invalid Action Rejection):** "GIVEN a resolution request is submitted, WHEN the action
  value is neither `MERGE` nor `KEEP_SEPARATE`, THEN the System rejects the request with a
  validation error."

**Source-flagged open item on this page:** **[Q-E]** "Whether resolution is invoked via a separate
domain endpoint (`POST /customers/duplicate-resolution`) or as part of the generic engine flow
depends on whether `MERGE` is a separate `ENFORCEMENT_ACTION` or `OVERRIDE` + an officer's
choice."

---

## Gaps & Conflicts Found

**G1 — Epic-level scope conflict on Party Merge (Module 5), a real contradiction, not a
paraphrase.** The Epic's own Jira description (`TB-16`) states:

> "Scope ... Out: ... Customer/Party merge resolution (SYS-04, handled in EP-03.01)."

But the same Epic's own Confluence spec (`EP-01.12`, page `4988764266`, V1.0 DONE) documents Party
Merge as one of its own five Requirements:

> "SYS-04 — Party Merge & Resolution Logic ... Specific to the Customer/Party domain (EP-03.01).
> If the engine detects a duplicate identity during onboarding, it halts the creation..."

...and a full Story (`US-01.12.05`/`TB-1553`) sits under this Epic's own `US-01.12` User Stories
index describing exactly this flow in detail. **Three sources under the same Epic disagree on
whether Party Merge is in scope for TB-16 at all.** This is not a cosmetic inconsistency — it
determines whether Module 5's 7 ACs get any test coverage under this ticket or are entirely
someone else's (EP-03.01's) responsibility. See Open Question Q1.

**G2 — Epic-level description contradicts its own implementation history on `DUPLICATE.TYPE`
storage.** `TB-16`'s Jira description says Layer 2 needs "Two new Tables (created via Field/Table
Registry) plus a detector in Core" — implying `DUPLICATE.TYPE` is itself a physical Table. But
Module 2 (`US-01.12.02`, the newer/more detailed spec) states explicitly: "No separate database
records are created. Configuration lives exclusively in template metadata" — i.e., **not** a
separate Table. This is corroborated by Jira history: `TB-999`/`TB-1000` ("Define and set up
DUPLICATE.TYPE Table") and `TB-1001`/`TB-1002` (DUPLICATE.TYPE/REGISTRY table seeding) are all
**CANCELLED**, while `TB-1368` ("Duplicate-config schema in **table metadata** and
duplicate_registry table") is **Done**. The Epic's own top-level Jira description is stale
relative to the approach that was actually implemented — worth a correction, and worth confirming
no test design accidentally targets a `DUPLICATE.TYPE` *table* endpoint that was never built.

**G3 — Module 1 (`US-01.12.01`): AC numbering skips AC4.** The source page's own Acceptance
Criteria table jumps from `AC3` (Scoped Cache Key) directly to `AC5` (Successful Commit Retains
Marker) — `AC4` does not exist anywhere on the page. Flagged as a documentation gap, not silently
renumbered.

**G4 — Module 1: the "Key Format" Business Rule has no corresponding AC.** BR-1 states a malformed
`Idempotency-Key` (not a 16-char NanoID) causes "Request rejected with error; no marker created,"
but none of AC1–AC11 exercises this — every AC assumes a well-formed key. This is plausibly the
content the missing `AC4` (G3) was meant to hold. Cross-checking `proj-bruno-api`'s **Posting
Engine** collection (a different, already-implemented idempotency layer, not this Epic's Table
Template Layer 1) shows the same 16-char NanoID format and a documented `400` for a malformed key
there — corroborating that key-format validation is a real, established CBS convention, just
undocumented as an AC for *this* Layer 1 implementation.

**G5 — Module 1: the "Scope of applicability" Business Rule has no corresponding AC.** BR-6
states Layer 1 only applies to operations through the projection pipeline, and "direct internal
writes that bypass the projection pipeline are not covered by Layer 1; no marker is created or
checked" — but no AC proves this boundary (e.g. that a plugin-internal write does *not* trigger
Layer 1 idempotency).

**G6 — Module 3: the upsert/multi-reference case (BR-7, BR-8) has no corresponding AC.** The
Business Rules state `source_ref` is `TEXT[]` (so a hash matched again appends a new reference)
and that `expiry_date` is "fixed at first insert... not recomputed" on a repeat match — this is
exactly what happens in the OVERRIDE-accepted flow (Alt 2) when the same hash is inserted again,
but no AC verifies that the *existing* registry row's `expiry_date` is left untouched while its
`source_ref` gains the new record reference, as opposed to the row being naively overwritten.

**G7 — TB-2034's own explicit scope ("smoke"-tagged API test cases only) is narrower than what the
Test Type Selection Matrix computes below.** Per this command's protocol, an explicit narrowing
doesn't remove the underlying requirement for other types — it flags them as dropped coverage.
See "Required Test Types."

**G8 — RESOLVED 2026-07-27.** The linked Google Sheets TC document's content was supplied directly
(pasted TC-01…TC-20 table, Module 1 / `US-01.12.01` only, sub-component "EP-01.12 | Idempotency &
Duplicate Prevention Engine"). See "Test Case Inventory" below for the full reconciliation against
the AC/BR/Alt set extracted in this analysis — every TC traces cleanly to an AC/BR/Alt already
documented here; no new undocumented behavior was introduced by the sheet. Two items worth noting:
TC-19 (an internal-write-path case bypassing the projection endpoint, proving BR-6/Scope of
applicability, Gap G5) does not appear in the pasted table at all — either dropped from the sheet
or never transcribed; and the pasted table's automation-status column disagreed with the code
actually committed for TC-16 (see Changelog).

---

## Open Questions (addressed to Business Analyst / Solution Architect by name)

**Q1 (to Andrei Sech, author of the `EP-01.12` spec, and Aliaksandr Symanovich, author of the
`US-01.12.*` Stories):** Is Party Merge & Resolution (Module 5, `US-01.12.05`/`TB-1553`) actually
in scope for Epic `TB-16`, or should it be moved under `EP-03.01` as `TB-16`'s own Jira
description claims? This determines whether Module 5's 7 ACs need coverage under this ticket at
all. (See Gap G1.)

**Q2 (to Andrei Sech):** Should `TB-16`'s own Jira description be corrected to say `DUPLICATE.TYPE`
config lives in table template metadata (not a separate Table), matching the actually-implemented
approach and Module 2's spec? (See Gap G2.)

**Q3 — RESOLVED 2026-07-27 (was: to Aliaksandr Symanovich, `[Q-META]`, Module 2):** The management
interface is now a real REST API (`TB-2106`, Done) — see the `[Q-META] RESOLVED` note under Module
2 above. Remaining ask to Aliaksandr Symanovich: correct this Story's own BR-1 ("JSON block in
template metadata") to match the shipped `duplicate_config` table design, since a test author
relying on the page text alone would target the wrong storage mechanism.

**Q4 (to Aliaksandr Symanovich — the page's own flagged open item, `[Q-NEW5]`, Module 2):** When
`matchFields[]` changes on an existing config, should old `duplicate_registry` hashes be
versioned into the hash material (coexisting with new hashes) or purged on config change? This
directly affects how AC9 (Module 2) and any registry-consistency test can be written — right now
neither behavior is confirmed.

**Q5 (to Aliaksandr Symanovich — the page's own flagged open item, `[Q-E]`, Module 5):** Is the
Party Merge resolution invoked via a dedicated endpoint (e.g. `POST
/customers/duplicate-resolution`) or folded into the generic OVERRIDE + officer-choice flow? No
such endpoint exists yet in the `proj-bruno-api` collection — confirm before any API-level case can
target a real request shape.

**Q6 — RESOLVED 2026-07-27.** The TC Google Sheet content was supplied directly and reconciled
below ("Test Case Inventory"); no further export needed for Module 1. The sheet's coverage of
Modules 2–5 (if any) is still unconfirmed — worth asking the sheet owner whether it exists.

**Q7 (to Aliaksandr Symanovich):** Confirm the missing `AC4` on Module 1 (Gap G3) — was it deleted
deliberately, or should it be re-added (plausibly to cover the Key Format rejection behavior, Gap
G4)?

---

## Test Case Inventory (TB-2034 smoke-tagged API cases, Module 1 only)

Reconciliation of the TC-01…TC-20 table supplied directly on 2026-07-27 (previously Gap G8,
inaccessible) against this analysis's own AC/BR/Alt extraction for Module 1
(`US-01.12.01 | Technical Idempotency`). Automation Status below reflects what is **actually
committed in `proj-test-automation`** as of 2026-07-27 (`api/system_core/tests/
idempotency-{smoke,regression}.spec.ts`), not the sheet's own status column, where the two
disagree.

| TC | Traces to | Automation Status (actual) | Notes |
|---|---|---|---|
| TC-01 | AC1, Alt 1 | Automated | |
| TC-02 | AC2, BR-9 | Automated | |
| TC-03 | AC5, BR-4 | Manual | TTL inspection requires direct cache access; sheet marks Manual, agreed. |
| TC-04 | AC7, Alt 2 | Automated | |
| TC-05 | AC6, Alt 3 | Automated | |
| TC-06 | AC6 (functional side), Alt 3/Alt7 | **Not Automated — re-verified 2026-07-27** | Live-probed against the QA environment. `POST /api/v1/tables/:tableId/duplicate-configs` returns a live `400 {"detail":"Missing required path variable: tableId"}` even with a real, correctly-routed `tableId` — a backend binding defect in the just-shipped `TB-2106` endpoint, not a missing-endpoint gap anymore. With config creation broken, no OVERRIDE/duplicate signal fires on a repeat INPUT (plain 200). `TB-1373` (enforcement mapping) was also still In Code Review at check time, so this may remain blocked even once the 400 is fixed. Recommend filing a Bug against the `duplicate-configs` endpoint. |
| TC-07 | AC3, Alt 4, BR-5 | Automated | |
| TC-08 | AC3, BR-5 | Automated | |
| TC-09 | AC3, BR-5 | Automated | |
| TC-13 | AC10, Alt 7 | **Not Automated — re-verified 2026-07-27** | Same root cause as TC-06 (config creation itself 400s before an OVERRIDE session can ever be created to test the `/accept` continuation). |
| TC-14 | AC11, Alt 5, BR-7 | Not Automated | No admin/test hook to flush L1+L2 in this suite's public-API-only surface; unaffected by `TB-2106`. Still genuinely blocked. |
| TC-16 | Alt 6 | Automated | **Sheet's own status column says "Not Automated," but the committed test already covers this case** (`idempotency-regression.spec.ts`, TC-16 test). Flagging back to Manual QA per this command's own protocol — sheet's Automation Status column is stale relative to actual coverage, not a gap to re-author. |
| TC-17 | BR-1 (Key Format, Gap G4) | Automated | |
| TC-18 | BR-4, Alt 5 | Manual | Real 1-day TTL wait; sheet marks Manual, agreed. |
| TC-20 | BR-4 | Manual | Direct cache/Redis inspection; sheet marks Manual, agreed. |
| (TC-19, missing from sheet) | BR-6 (Gap G5) | Not Automated | This analysis's own Gap G5 (scope-of-applicability boundary — a plugin-internal write bypassing the projection pipeline should not trigger Layer 1) has no AC and, per this reconciliation, no TC in the sheet either. Flag to Manual QA: either the sheet dropped it or it was never authored — BR-6 remains unverified either way. |

No TC in the sheet contradicts or exceeds the AC/BR/Alt set already extracted above — the sheet is
additive detail (concrete headers, exact steps), not a new source of requirements.

---

## Required Test Types (with triggering signal per type)

Computed against the Test Type Selection Matrix in `manual-qa-agent.md`, across all 5 modules:

| Test Type | Triggering Signal |
|---|---|
| **Positive** | Every Story, no exception (matrix default) — e.g. AC1 (M1), AC1 (M3), AC1 (M4). |
| **Negative** | Every Story, no exception — e.g. AC1/Key-Format-rejection gap (M1), AC2–AC7 (M2), AC2/AC7 (M3), AC7 (M5). |
| **Edge / Boundary** | Business rule/domain invariant enforced — cache TTL expiry (M1 BR-4/Alt5), null/partial-null matchFields (M3 Alt4/Alt5), `purgeDays` boundary = 0 vs 1 (M2 BR-7), expiry boundary `expiry_date = CURRENT_DATE` exactly (M4 BR-1). |
| **API** | New/changed REST endpoint — the INPUT/HOLD/AUTH operation pipeline now carries Layer 1/2 behavior (M1, M3); the (not-yet-built, Q3) config-management endpoint (M2); the generic `/accept` override-continuation endpoint (M1 Alt7, M3 Alt2). |
| **Integration** | Cross-entity/persistence side effect — `duplicate_registry` writes (M3), template-metadata config writes + runtime read-back (M2), `ALT_PARTY_ID` cross-module update into the Customer domain (M5, if in scope per Q1), COB-triggered purge (M4). |
| **Regression** | Modifies behavior another Story/flow already relies on — Layer 1 wraps the *existing* INPUT/HOLD/AUTH mutating pipeline (M1); Layer 2 injects into the *existing* Validation Engine hook ahead of persistence (M3) — both require regression passes against pre-existing (non-idempotency) INPUT/AUTH test coverage to prove nothing broke for requests that don't use these headers/configs at all. |
| **Role/Permission-gated** | Override confirmation is permission-gated (M3 BR-1/AC7 — Positive: permitted Actor confirms; Negative: denied Actor is rejected). Compliance Officer role for Party Merge (M5, if in scope). |
| **E2E** | Multi-step critical journey — the full OVERRIDE round-trip (initial 422 → accept → persisted) spans M1 Alt7 and M3 Alt2/AC3 across two requests; the Party Merge flow (M5, if in scope) is a multi-step compliance workflow. |
| **Smoke** | Core/critical business journey — idempotent retry-safety (M1 AC7) and duplicate blocking (M3 AC2) sit directly on CBS's transactional-integrity backstop, matching this ticket's own explicit smoke-tag request. |
| **Unit** (tracked, not authored here) | Hash-computation algorithm (M3 BR-2–BR-5, SHA-256/canonical-concatenation/sentinel/normalization) — **confirmed** via `TB-1370` "Hash calculator" (Done) and tracked via `TB-1374` "Business Idempotency layer tests coverage" (In Code Review) / `TB-870` "Technical Idempotency layer tests coverage" (Done). No further manual/API case should re-prove the exact hash bytes; API-level cases should treat the hash as a black box and assert only on registry/response behavior. |

**Explicit scope override on this ticket:** TB-2034's own description narrows delivery to "API
TCs with smoke tag" only. Per protocol, every type above that this narrows out —
**Negative, Edge/Boundary, Integration, Regression, Role/Permission, E2E** — is a **flagged risk**,
not a silently-dropped requirement: no sibling AQA ticket under Epic `TB-16` currently scopes
that broader coverage (the only other QA-labeled ticket, `TB-1834`, is a Test-*design* Spike, not
an implementation task, and carries no test-type breakdown of its own in Jira). Recommend the AQA
Lead confirm whether follow-up tickets for Negative/Integration/Regression coverage are planned
before this Epic reaches its `CBS.1.2.0.dev` milestone (due 2026-08-21).

---

## Changelog

- **2026-07-20 — Initial analysis (Draft).** First run of `/execution:mqa-commands:mqa-review-story
  TB-2034`. Resolved Epic `TB-16`, all 5 `US-01.12.*` Confluence Stories, cross-checked against the
  `proj-bruno-api` collection and this repo's own `api/` test suite (no existing coverage found).
  Verdict: **Needs clarification** — 2 Epic-level contradictions (G1, G2), 3 undocumented AC gaps
  (G3–G6 minus the source-flagged ones), 3 pre-existing source-flagged open questions (Q3–Q5) not
  yet resolved by the Business Analyst, and 1 inaccessible reference artifact (the TC Google Sheet,
  G8).

- **2026-07-27 — Refresh ahead of `/execution:aqa-commands:aqa-automate`.** Re-checked Jira state
  for every ticket cited in the 2026-07-20 analysis. Changes found: `TB-1371` and `TB-1372` moved
  to Done (were In Code Review / On hold); `TB-1373` (OVERRIDE/ERROR enforcement wiring) remains In
  Code Review — the one still-open blocker on Layer 2 enforcement; `TB-2040` and `TB-2064` were
  both CANCELLED, each superseded by a different completed ticket (`@Transactional` applied
  directly, and `TB-2106` respectively) rather than dropped as requirements. `TB-2106` (Done) ships
  a real `duplicate-configs` REST API, resolving Gap/Q3 — but with a storage design (a
  `duplicate_config` DB table) that contradicts Module 2's own BR-1 ("JSON block in template
  metadata"), a Gap-G2-shaped documentation drift now flagged under Q3. The TC-01…TC-20 Google
  Sheet content (Gap G8) was supplied directly by the user and reconciled in the new "Test Case
  Inventory" section — every case traces cleanly to an already-documented AC/BR/Alt, one case
  (TC-16) had its Automation Status corrected against actually-committed code, and one Gap-G5-
  related case (TC-19) was found missing from the sheet entirely. Live-verified TC-06/TC-13
  against the QA environment: `POST /api/v1/tables/:tableId/duplicate-configs` (the new `TB-2106`
  endpoint) returns `400 "Missing required path variable: tableId"` even with a valid, correctly
  routed `tableId` — a live backend binding defect, not a missing-endpoint gap. TC-06/TC-13 remain
  Not Automated for this new, more specific reason; recommend filing a Bug against the
  `duplicate-configs` endpoint before re-attempting.
