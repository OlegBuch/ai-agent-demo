# Business Rules

Rules below are restated from what this repo's tests actually assert (`api/system_core/tests/*`,
`api/integration_chapter/tests/*`, `docs/test-cases/TB-1306/analysis.md`) — each is standing
platform behavior this suite treats as a regression contract, not a one-ticket detail. Generic
CBS platform mechanics (what a Table/Projection/hook *is*) are the `proj-context` plugin's job;
this file is the specific rule set this test suite enforces.

## Record lifecycle and physical spaces

Every Table's schema contains a subset of these Postgres tables ("spaces"): `liv`, `nau`, `his`,
`del`, `sim`, `arc`. Tests assert directly on their row contents (see
`docs/frame-specs/architecture.md`'s "Direct database verification").

| Space | Meaning | When populated |
|---|---|---|
| `LIV` | Live/current, authorized record | Directly, on `INPUT` to an `INT` table; via `AUTH` promotion for a `FIN` table |
| `NAU` | "Not yet AUthorized" — a pending draft awaiting maker-checker approval | On `INPUT` to a `FIN` table (never for `INT` — `INT` writes go straight to `LIV`) |
| `HIS` | Historical/superseded version of a record | On overwrite of an existing `LIV` record — the *previous* value is preserved here, keyed with its own `seq_no` |
| `DEL`, `SIM`, `ARC` | Deleted / simulation / archive spaces | Table creation requires at minimum `LIV` to be in the requested `spaces` list — omitting it fails table creation with `400` |

- **BR**: `SEQ.NO` increments by 1 in `LIV` on every successful update to the same record; the
  version being replaced is written to `HIS` retaining its **prior** `seq_no` (not decremented, not
  the new one).
- **BR**: A table cannot be created without `LIV` in its `spaces` array — `400`, and **no** schema
  tables are created at all for that table (verified by querying `information_schema.tables` and
  expecting zero rows).
- **BR**: `INPUT` on a `SYS`-type table is always `403`, unconditionally — this is a structural
  block, not a permission that can be granted.

## Maker-checker (Four-Eyes) on `FIN` tables

- **BR**: `INPUT` on a `FIN` table by any authenticated user writes to `NAU` only — `LIV` and `HIS`
  remain empty until authorization.
- **BR**: `AUTH` (performed by a second call, in tests deliberately issued from a different
  authenticated client — "inputter" vs "authorizer") moves the record from `NAU` to `LIV`, clearing
  `NAU`, and does not populate `HIS` on the *first* authorization (there is no prior version yet).
- **BR**: A subsequent `INPUT`+`AUTH` cycle on the same record does populate `HIS` with the
  previously-`LIV` value once the second `AUTH` promotes the new draft.
- **BR**: `HOLD` copies the current `LIV` record into `NAU` **with the same `SEQ.NO`** (not
  incremented) — this represents "reopen for edit" rather than "new draft," and `LIV` is left
  unchanged until a subsequent authorize/edit cycle completes.
- Four-eyes enforcement is why several `system_core` regression suites explicitly authenticate as
  two distinct Keycloak users (`INTERNAL_USER_USERNAME`/`PASSWORD` twice, or a second
  `EXTERNAL_USER_USERNAME`) rather than reusing the shared service-account context — see
  `docs/project-spec/access-control.md`.

## Multi-company isolation

- **BR**: Records in an `INT`-classified table are **global** — visible and editable identically
  regardless of the requesting `X-Company-Code`; the physical schema is not company-partitioned.
- **BR**: Records in a `FIN`-classified table are **strictly isolated per company** — a record
  created under company `MOCK_1` is `404 Not Found` (not `403`) when queried under `MOCK`. The
  database backs this with one schema per company (`{tableId}_{companyCode-lowercased}`), plus the
  base (unsuffixed) schema, which for `FIN` tables holds **zero** data-space rows itself (it exists
  as the registry-facing/base schema only).
- **BR**: `X-Company-Code` is the sole company-scoping mechanism on every request — there is no
  separate tenant ID field in request bodies.

## Origin-based governance (CORE vs LOCAL)

(See `docs/test-cases/TB-1306/analysis.md`, US-01.04.03 — a standing rule, not ticket-scoped.)

- **BR**: `ORIGIN` (`CORE`/`LOCAL`) is immutable on any table, regardless of its current value —
  never a permitted field in an update payload.
- **BR**: `CORE` tables reject every modification **except**: LOCAL field injection, and `GROUP`
  reassignment.
- **BR**: `LOCAL` tables reject every modification **except**: safe deletion (below), LOCAL field
  injection, and `GROUP` reassignment.
- **BR**: A blocked operation leaves table state **completely unchanged** — atomically, even for a
  multi-property payload that mixes one permitted change with one blocked change (the whole request
  is rejected, not partially applied).
- **Safe deletion of a `LOCAL` table** requires all of: `ORIGIN = LOCAL`; the table is not a Linked
  table for any other table; and `COUNT(LIV) + COUNT(NAU) + COUNT(HIS) + COUNT(DEL) == 0` across
  every space. Violating any condition blocks the delete.

## Field injection (Dynamic Schema Injection)

- **BR**: A field must already exist in the Field Registry, with `origin: LOCAL`, before it can be
  injected into a Table Definition — injecting a `CORE`-origin or nonexistent field is blocked.
- **BR**: A field cannot be injected twice into the same Table Definition.
- **BR**: Injection is **append-only** — once injected, a field can never be removed from the Table
  Definition.
- **BR**: The Audit Cluster (`ST_*` fields) is always logically repositioned so newly injected
  fields sit **before** it in the schema, never after.
- Injection takes effect immediately (available via API with no service restart) — this repo's
  tests assert on this by injecting and reading the field back in the same test.

## Rule engine (Projection Rules)

- **BR**: A Projection Rule with `resultType: ERROR` blocks the triggering record operation
  entirely — the response is `422`, with the rule's `id` present in the response's `errorIds` array.
- **BR**: A Projection Rule with `resultType: OVERRIDE` also yields `422` with the rule's `id` in
  `overrideIds` — the practical distinction between `ERROR` and `OVERRIDE` outcomes for a client
  (e.g. whether `OVERRIDE` can be re-submitted with an explicit override flag) is not yet asserted
  by any test in this repo; don't assume behavior beyond the `422`+`overrideIds` contract without
  checking the live platform/`proj-context`.
- Rules are evaluated against a specific field (`conditionKey`) with an operator (e.g. `EQ`) and a
  set of `conditionValues`.
- **Open reconciliation question**: this section describes the generic Validation Engine's
  (EP-01.08) bare `errorIds`/`overrideIds` string-array contract. The dedicated **Override and Dispo
  Processing** module below (EP-02.05) documents — and this suite's own `TC-19`/`TC-20` (Hard-Block,
  `override-dispo-smoke.spec.ts`) live-assert — a richer, dictionary-object shape instead
  (`errors: [{errorId, params, targetFieldId}]` on a distinct HTTP status, not a flat id array in the
  same `422`). Treat the two as either (a) different endpoints/mechanisms, or (b) the same mechanism
  where this section is stale relative to what EP-02.05 actually shipped — don't assume either
  without checking live evidence/`proj-context`; this is exactly the kind of discrepancy this repo's
  "verify against live evidence" review discipline exists for.

## Override and Dispo Processing (Module 02.05 / EP-02.05)

Source: Confluence `EP-02.05`/`US-02.05.01`–`.07`/`TI-02.05` + the `ERROR`/`OVERRIDE`/
`OVERRIDE.CLASS`/`OVERRIDE.CLASS.DETAILS`/`DISPO.OFFICER`/`DISPO.ITEM` entity pages + the two
`Plugin API Contract`/`HTTP Response Contract` pages (as of 2026-08-12; Jira `TB-22`, component
Security Management). **Test-coverage state, as of this writing (MR !138, TB-2083)**: all of
`US-02.05.01`–`.07` now have live-verified test coverage in
`api/security_management/tests/override-dispo-smoke.spec.ts` (53 cases, `TC-01`–`TC-53`, with a
deliberate numbering gap at `TC-47` — see `docs/frame-specs/testing-standards.md`'s maturity table
and this suite's own MR review notes for why), backed by
`api/security_management/helpers/override-dispo-helper.ts`. Everything below is now asserted by
this suite, not spec-only — still worth spot-checking against the live platform/`proj-context` for
any nuance this suite's own smoke-level assertions don't exercise (e.g. edge cases beyond the
happy/negative paths this suite covers).

### Hard errors vs. negotiable overrides (SMS-01, SMS-02)

- **BR**: An `ERROR` registry record (`ERROR~BASIC` projection, `MESSAGE` field only) is an absolute
  block — the triggering operation is stopped entirely, no data is written, and no override
  suppression logic applies (an operation returning both errors and overrides suppresses the
  overrides — see below).
- **BR**: An `OVERRIDE` registry record (`OVERRIDE~BASIC`/`~DISPO`/`~DISPLAY` projections) is a
  negotiable warning: `DISPO_ALLOWED = false` routes it through the **standard override** workflow
  (gated by `OVERRIDE.CLASS`/`OVERRIDE.CLASS.DETAILS` security classes); `DISPO_ALLOWED = true`
  routes it through the **disposition (dispo)** workflow instead (gated purely by the monetary
  limits of the `DISPO.OFFICER` hierarchy — no override classes involved).
- **BR**: An `OVERRIDE~DISPO` record cannot also have an `OVERRIDE.CLASS.DETAILS` record (mutual
  exclusivity enforced from both sides — `OverrideDispoConfigGuardPlugin` on `OVERRIDE~DISPO` INPUT,
  `OverrideClassDetailsGuardPlugin` on `OVERRIDE.CLASS.DETAILS` INPUT).
- **BR**: Every `PRECEDENCE`/`FIELD` row on a dispo-enabled override must resolve to a
  `LINKED_TABLE → DISPO.OFFICER` field on the referenced table — a row that can't is rejected at
  configuration time (`OverrideDispoConfigGuardPlugin`), though the runtime cascade stays fail-safe
  regardless (an unresolvable row at *routing* time is simply skipped, not fatal).

### HTTP contract (diagnostics gate)

- **BR**: Every INPUT/AUTH/REVERSE/DELETE/HISTORY_RESTORE call answers with exactly one of three
  shapes, discriminated by **HTTP status range**, never a body-level tag: `2xx` success (existing
  `OperationDto` shape unchanged), `4xx` `{errors: [{errorId, params, targetFieldId}]}` (errors from
  any source present → this shape, **all accumulated overrides suppressed**, default `400`), or
  `4xx` `{overrides: [{id/overrideId, params, targetFieldId}]}` (overrides only, no errors, default
  `422`, no `recordId` — the client already has it). `VALIDATE` is always `200` with both lists
  returned together and no write/session (`{errors: [], overrides: []}`).
- **BR**: A hook/rule may override the default status via an explicit `httpCode`, but it is
  constrained to `4xx` (400–499) — a diagnostic can never claim `2xx`/`5xx`, which is exactly what
  makes plain status-range branching a safe discriminant between success and diagnostic.
- **BR**: Not every `4xx` on the same status code is this contract — malformed bodies, bean
  validation, `404`/`409`/`503`, etc. answer as generic RFC 7807 `ProblemDetail`
  (`Content-Type: application/problem+json`); this module's own shapes are always plain
  `application/json`. A new test/client must discriminate on `Content-Type`, not on body shape
  alone, when a `4xx` could plausibly come from either path.
- **BR**: `DispoContext` (lookup record/field + `violationAmountLcy`) is **never** exposed to the
  HTTP client — it stays internal to the accept flow; the client only ever sees `{id, params,
  targetFieldId}` per override/error.

### Standard override authorisation (SMS-02, US-02.05.03)

- **BR**: A standard override (`DISPO_ALLOWED = false`) with **no** related `OVERRIDE.CLASS.DETAILS`
  record is auto-`APPROVED` unconditionally (Alt 7).
- **BR**: `OVERRIDE.CLASS.DETAILS.RULES` empty → the `REQUIRED_CLASS` is demanded
  **unconditionally** (this is stated as a deliberate *change* from prior behavior, where an empty
  rule list used to auto-approve — don't assume the old "empty rules ⇒ approved" behavior without
  checking the live platform).
- **BR**: `REQUIRED_CLASS` is multi-value with **ANY** semantics — holding any one of the listed
  classes is sufficient to authorise; the class-to-user link is
  `SM.USER.GROUP.OVERRIDE_CLASSES` (group) → `SM.USER.GROUPS` (user's groups) →
  `OVERRIDE.CLASS.DETAILS.REQUIRED_CLASS` (what a given override demands).
- **BR**: On a non-auth-required projection (`isAuthRequired = false`), if the current user has
  permission to authorise only *some* of the received overrides, **all** are rejected (not
  partially approved) — the projection form is reverted to its pre-save editable state with all
  data preserved.
- **BR**: On an auth-required projection (`isAuthRequired = true`), a user who can authorise only
  *some* overrides gets those approved and the rest left `PENDING` (partial authorization is
  allowed here, unlike the non-auth-required case above) — the record itself still can't finalize
  until record authorisation (`US-02.05.04`) later clears the rest.

### Record authorisation gating (US-02.05.04)

- **BR**: The parent record's `AUTH` workflow is blocked (before its own step 6) whenever **any**
  associated override is `PENDING`, or any associated `DISPO.ITEM` is `PENDING`/`REJECTED` — the
  record stays locked in `NAU` regardless of the authorising user's own permissions elsewhere.
- **BR**: Approving a `DISPO.ITEM` **never** auto-authorises the parent record — a separate,
  explicit four-eyes `AUTH` action is still required (decoupled commit).

### Dispo (financial exception) routing (US-02.05.05, .06)

- **BR**: A dispo override is only ticketed (`DISPO.ITEM` created) when the diagnostic carries a
  `DispoContext` (i.e. a `dispoViolationAmount`, always already in local currency — FX conversion is
  the plugin's job, never the core's or the dispo mechanics'). A dispo-allowed override *without* a
  `DispoContext` is auto-`APPROVED`, no ticket at all.
- **BR**: Officer resolution walks the override's `PRECEDENCE` array in order — own-table row →
  `SEE` by the parent's own record id; foreign-table row → `SEE` by `LOOKUP_RECORD_ID`
  (row skipped if absent) — falling back to `DEFAULT_DISPO_OFFICER` if the cascade yields nothing.
  A candidate that doesn't resolve to an existing `DISPO.OFFICER` is treated as empty and skipped,
  not fatal.
- **BR**: An absent officer (`today` within `ABSENT_START`..`ABSENT_END`) is replaced by their
  `ROUTE_TO` substitute before any limit check — mandatory whenever an absence window is configured
  (`DispoOfficerGuardPlugin` rejects a window without a substitute at config time).
- **BR**: Escalation loop: while `violationAmount > candidate.DISPO_AMOUNT` and `REPORTING_TO` is
  non-empty, escalate to `REPORTING_TO`. The walk always stops at the single top officer
  (`REPORTING_TO = null`) regardless of their limits — the top is exempt from both `DISPO_AMOUNT`
  and `OVERDRAFT_AMT` and covers any amount.
- **BR**: Cross-officer limit monotonicity is **deliberately not config-validated** — cycles are
  possible. A single configurable hop limit (default 10) covers every absence redirect + escalation
  hop combined; exceeding it bails the ticket straight to the top officer rather than failing the
  routing — dispo routing is designed to never hard-fail on a bad hierarchy config.
- **BR**: `DISPO.OFFICER.OVERDRAFT_AMT` must be `<= DISPO_AMOUNT` — an officer can review (and
  forward) amounts above what they can personally approve, never the reverse.

### Dispo review / decoupled authorization (US-02.05.07)

- **BR**: `APPROVE`/`REJECT` on a `DISPO.ITEM` require the violation amount to be within the
  reviewing officer's `OVERDRAFT_AMT` (the top officer is exempt from this check) — an officer whose
  `DISPO_AMOUNT` covers the violation but whose `OVERDRAFT_AMT` doesn't can only `FORWARD`.
  `REJECT`/`FORWARD` require a mandatory comment; `APPROVE` doesn't.
- **BR**: A `DISPO.ITEM` in a terminal status (`APPROVED`/`REJECTED`) is never reopened — a new
  override/accept cycle spawns a **new** ticket id (`{parentRecordId}-{overrideId}-{attempt}`), so
  prior-cycle tickets remain immutable forensic history and never re-block a later cycle.
- **BR**: Only the ticket's current identity (`SM.USER` id) may act on it — a `DISPO.ITEM~REVIEW`
  INPUT from any other user is `403`.

## RBAC / permission enforcement

See `docs/project-spec/access-control.md` for the actor/permission model. Restated as business
rules here because they're asserted as regression contracts:

- **BR**: A user lacking `SEE` permission on a Table (via their User Group's `PERMISSIONS`) gets
  `403` attempting to read it, with an "access denied"/"permission denied" style message.
- **BR**: A user lacking `INPUT`/table-group-maintenance permission gets `403` attempting to create
  or modify a Table Group.
- **BR**: An unauthenticated request (no/invalid bearer token) gets `401`, distinctly from the
  `403` used for authenticated-but-unauthorized requests.
- **BR**: A Data Access Rule can **grant** a specific user (via their group) visibility into a
  record another user created, even without direct table-level `SEE` — this is the mechanism
  covered by "UserB can see record added by UserA due to rule" style tests.

## System Parameters

- **BR**: Certain system parameters are **immutable post-initialization**: `SHARE_CUS_DATA`,
  `GLOBAL_PROCESS`, `USE_LOCAL_TIME` (see `SYSTEM_PARAMETRIZATION_CONSTS.IMMUTABLE_FIELDS` in
  `api/utils/constants/constants-keeper.ts`) — an update attempt after first initialization is rejected with
  a field-specific validation message.
- **BR**: The `SYSTEM` parameter record's `id` must strictly be `"SYSTEM"` — any other ID is
  rejected.
- **BR**: A `COMPANY` record, once initialized, is structurally immutable from deletion routines.

## Auto-ID generation policies

- **BR**: An Auto-ID policy (`IDENTIFIER_GENERATION` type) can only be configured for **Lead**
  companies, not branch companies — attempting to configure one for a branch is rejected
  ("Only Lead Companies can be specified in the Auto-ID configuration").
- **BR**: Multiple Auto-ID rules can coexist per table, each scoped to a company (or wildcard `*`),
  each with its own prefix/max-length/generation strategy (`SEQUENTIAL` or `HIGH_TPS_UNIQUE`).
- Prefix/length/character-set validation is extensively boundary-tested (see
  `SYSTEM_PARAMETRIZATION_CONSTS.AUTO_ID` in `constants-keeper.ts`) — treat any new Auto-ID test as
  needing to check both a valid case and the relevant boundary/rejection case, matching the existing
  pattern.
