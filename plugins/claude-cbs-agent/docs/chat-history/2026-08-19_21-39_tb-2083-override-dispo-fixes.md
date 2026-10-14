# TB-2083: override-dispo-smoke fixes (setAuthRequired, PERMISSIONS, FIN classification) + CI typecheck fix

**Date/time:** 2026-08-19 21:39 · **Branch:** group-1/TB-2083 · **Ticket(s):** TB-2083

## Discussed

- Diagnosed a cascading series of previously-unreachable failures in `override-dispo-smoke.spec.ts`
  (TC-24, TC-25, TC-31) that only surfaced one-by-one as earlier blockers got fixed this session
  and in prior sessions (infra timeout → 400 on `setAuthRequired` → RBAC 403 → FIN/INT
  classification 500 → accept 500/404). Established a working method: fix the blocking layer,
  re-run, let the next hidden issue surface, discuss before touching code each time.
- Compared our `override-dispo-smoke.spec.ts` against the Google Sheet test-case tracker
  (`US-02.05 | Override and Dispo Processing`) for Smoke-only rows: 37 Smoke TCs listed, 33
  implemented. Missing: **TC-03** (has an explicit `// TC-03 TODO` marker already), **TC-14,
  TC-32, TC-34** (no trace at all in the spec — not previously flagged).
- Investigated a colleague's branch `TB-2912-OverrideAndDispoProcessingRegression`
  (`override-dispo-regression.spec.ts`) for reusable patterns for our failing TCs:
  - Confirmed identical `PERMISSIONS: [{ TABLE: tableId, FUNCTION: 'ALL' }]` pattern for scoping
    RESTRICTED_USER to a dynamic table — validated our own fix independently.
  - Found the root cause for the FIN-vs-INT 500 on `setAuthRequired`: colleague's code has an
    explicit comment `// FIN is required - authOperationRequired=true is rejected on INT tables.`
    and always builds the auth-required table with `classification: FIN`, never `INT`.
  - Confirmed colleague's suite doesn't touch DISPO.OFFICER/DISPO.ITEM (US-02.05.05-07) at all —
    no help available there for TC-52/53's 403.
- Diagnosed why colleague's regression suite (7 tests, 3 table creations) reliably provisions
  tables while our smoke file (32 tests, 9+ direct `createTableAndWait` calls plus more inside
  shared helpers) intermittently hits severe delays/instability: cumulative schema/Kafka-topic
  load on the *same shared K8s worker group* across a long sequential file run degrades the
  underlying pod over time (the previously-diagnosed "group-health heal" mechanism), not the
  per-table `spaces` count itself.
- Root-caused a live 500 on `POST .../records/operations/INPUT/accept` for TC-24, reproduced
  100% (80/80 retries) in an *isolated* single-test run with a fresh dedicated group — ruling out
  flakiness/cumulative load as the cause for that specific error. Hypothesis (unconfirmed,
  needs server logs): the table now has two projections (the bare-tableId default one, used for
  INPUT/accept, and the named `tableId~AUTO.TEST` one created solely to carry
  `authOperationRequired`) and `accept`'s backend logic may not expect more than one, throwing an
  unhandled exception. A follow-up run of the same test reproduced a *different* symptom (404,
  empty body) instead of 500 — reinforcing that this is backend non-determinism, not something
  fixable from the client/test side.
- Diagnosed a full-suite run (33 tests) where, starting right after TC-24, every subsequent test
  needing a *new* table failed identically with `400 "group: Invalid Table Group"` on the *same*
  worker group id. Concluded this is a distinct, more severe failure mode than the known
  "group-health heal" timeout: that heal mechanism only triggers on a *readiness-wait timeout*, not
  on an immediate, non-retried 400 at table-*creation* time — so a group disappearing outright
  mid-run (deleted, not just slow) is a scenario nothing in the current code recovers from,
  because `workerGroupId` is resolved once per worker and never re-resolved via
  `resolveActiveGroupId` outside the heal path. Root cause of the disappearance itself is
  unconfirmed (possible candidate: this shared QA environment's stale-group cleanup sweeping up
  a group belonging to a still-running session). Decision: shelved for now, not investigated
  further this session.
- Explained why GitLab CI's `typecheck` job showed errors in files the user never touched
  (`pf-sc-sms.spec.ts`, `sms-system-core.spec.ts`, `user-groups-api-regression.spec.ts`,
  `user-profile-api-regression.spec.ts`): `tsc --noEmit` type-checks the whole project, so a
  breaking change to a shared type (`UserGroupDescription`) anywhere in the branch surfaces as
  errors in every unrelated file that still uses the old shape. User chose to soften the type
  back to accept both shapes rather than touch the four unrelated files.

- Ran a strict TC-number + Short-Description cross-check (via subagent, then independently
  verified) between the QA Google Sheet (`US-02.05 | Override and Dispo Processing`) and both
  `override-dispo-smoke.spec.ts`/`override-dispo-regression.spec.ts`: 38/40 checked TCs matched
  cleanly. **TC-21** (regression file) has a title-wording drift — out of scope, not touched.
  **TC-31** (smoke file) was a genuine **number/scenario mismatch**: the code test at that number
  actually tested "resolve both overrides at `accept`, then a plain follow-up `AUTH`", not the
  sheet's TC-31 ("AUTH itself evaluates the override-permission chain on still-`PENDING`
  overrides"). User renamed the mismatched test in code to **TC-00** to free the number for a real
  TC-31.
- Investigated (via Confluence, `innowise-group.atlassian.net`, space `CBSA` + a personal space)
  whether AUTH genuinely re-evaluates `OVERRIDE_CLASS` permissions on `PENDING` overrides — the
  premise behind the sheet's TC-31/32/34 — since the former-TC-31 (now TC-00) diagnosis earlier
  this session had concluded AUTH was "purely a state transition" with no such check. Found two
  Done-status specs confirming the mechanism is real, not aspirational:
  - `EP-01.08 | Validation engine`, **AC-SYS-03** ("Override Hierarchy & Authorization Lock"): a
    checker without the override's `REQUIRED_CLASS` is rejected on AUTH and the record stays NAU;
    a checker with the class subsequently succeeds, moving the record to LIV with the override
    captured in the audit trail.
  - `EP-02.02 | User Groups & Roles, Data Access Control`, **AC-SMS-03** ("Override Governance"):
    same mechanism, with the exact error contract — `403 Forbidden: Insufficient Override Class
    Authority`.
  - Resolved the apparent contradiction with the former-TC-31/TC-00 finding: that test's
    RESTRICTED_USER held **both** required classes and resolved them at `accept` before AUTH ever
    ran, so AUTH had nothing left to evaluate — not a contradiction, just a code path nothing had
    exercised yet (no override was ever still PENDING by the time AUTH ran, in any existing test).
  - Also researched `EP-02.05 | Override and Dispo Processing (Exception Management)` for TC-34's
    premise (DISPO.ITEM gating AUTH): confirmed "Authorization Lock" (record blocked in UNAU/NAU
    until every `DISPO.ITEM`'s `STATUS` reaches `APPROVED`) and "Decoupled Commit" (approving a
    `DISPO.ITEM` does not auto-authorise the parent — a normal 4-Eyes AUTH is still required) as
    Done-status, real platform behavior.
  - Discussed TC-32 (partial 2-of-3 class coverage at AUTH) as the hardest case: neither spec
    describes partial-per-override resolution at AUTH explicitly — AC-SYS-03/AC-SMS-03 only
    describe the strict binary (all covered vs. not) case. The closest documented graduated-
    resolution precedent is TC-28's *accept*-time ANY-semantics (already automated), which returns
    `200` even on partial coverage — a different contract than "AUTH blocks with 4xx on any
    uncovered override." Treated as a hypothesis to verify empirically rather than an assumption —
    confirmed correct on the live run (see Learned).

## Implemented

- `api/security_management/helpers/override-dispo-helper.ts`:
  - `assignRestrictedUserFullOverrideClasses(userGroupClient, userProfileClient, classIds,
    testCaseLabel, tableId)` — added a `tableId` parameter; the temporary full-permission group
    now also grants `PERMISSIONS: [...USER_GROUP_VALUES.PERMISSIONS.MINIMAL, { TABLE: tableId,
    FUNCTION: 'ALL' }]` instead of only `MINIMAL` (`SM.USER:SEE`) — fixes the 403 "User does not
    have access to table" that blocked TC-24's STEP 1/2 once earlier blockers were cleared.
  - `setAuthRequired` call sites (in `provisionDualStandardOverrideFixture` and
    `provisionAuthDualStandardOverrideFixture`) now pass `` `${tableId}~AUTO.TEST` `` (a new
    constant `AUTH_PROBE_PROJECTION_SUFFIX`) instead of the bare `tableId`, plus a real schema
    (new helper `buildAuthProbeSchema`, using the actual `overdraftFieldId`/`highRiskFieldId`
    with `required: []`) instead of the generic default fallback schema — fixed the "Projection ID
    must start with table ID prefix" 400 and a follow-up schema-mismatch issue, both confirmed via
    the user's own manual curl walkthrough against QA before implementing.
  - `provisionDualStandardOverrideFixture`'s `spaces` reverted from a conditional
    `authRequired === false ? ['LIV'] : ['LIV','NAU']` (this session's own earlier optimization)
    back to unconditional `['LIV', 'NAU']` — hypothesis that the override-accept flow needs NAU
    internally even when the final destination is LIV. `HIS` stays excluded (still confirmed
    unused by any test in this file).
  - `resolveDualOverrideTableClassification(authRequired)` helper (already present when this
    session picked the file back up — applied by the user directly, not by Claude) makes both
    `provisionDualStandardOverrideFixture` (when `authRequired === true`) and
    `provisionAuthDualStandardOverrideFixture` (always) build the table with `classification: FIN`
    instead of `INT`, per the colleague's-branch finding above.
- `api/security_management/tests/override-dispo-smoke.spec.ts`: updated the three
  `assignRestrictedUserFullOverrideClasses` call sites (TC-24, TC-25, TC-31) to pass their
  fixture's `tableId`/`authTableId` as the new fifth argument.
- `api/types/user-group.types.ts`: `UserGroupDescription` narrowed-then-widened —
  now just `{ [key: string]: string }` (dropped the `'en-GB'`-required variant), restoring
  compatibility with pre-existing `{ en: '...' }` literals elsewhere in the repo
  (`pf-sc-sms.spec.ts`, `user-groups-api-regression.spec.ts`, `user-profile-api-regression.spec.ts`)
  without touching those files.
- Verification after each change: `npx tsc --noEmit -p .`, `npx eslint --max-warnings=0` (touched
  files), `npx prettier --check` (touched files), `npx playwright test --list -g "TC-24|TC-25|TC-31"`
  — all clean each time. The 4 `UserGroupDescription` typecheck errors are confirmed gone after the
  type-widening fix; one pre-existing, unrelated error remains
  (`api/integration_chapter/tests/sms-system-core.spec.ts:318`, `TS18048`, introduced by a
  colleague's unrelated commit `9e6b86fd` / `TB-2798`, not touched).
- Drafted (not sent — text handed to the user) two developer-facing bug reports, in the same
  format used earlier this session for the TC-19/20 400-vs-422 question:
  1. `setAuthRequired`'s "Projection ID must start with table ID prefix" 400 (later superseded —
     turned out to be our own bug, not a platform regression; see Learned).
  2. The reproducible `accept` 500 on TC-24 with the two-projections hypothesis, full repro table
     and exact request/response bodies.

- `api/security_management/tests/override-dispo-smoke.spec.ts`:
  - Renamed the mismatched test from `TC-31` to `TC-00` (title + the `testCaseLabel` string passed
    into `assignRestrictedUserFullOverrideClasses`) — no behavior change, purely freeing the
    number. Fixed one leftover stray `'TC-31'` string the manual rename missed.
  - Added **TC-03** ("Create new OVERRIDE record with dispo enabled and full precedence/default-
    officer chain") — replaced the pre-existing `// TC-03 TODO` marker. Reuses
    `ensureTopLevelDispoOfficersProvisioned`/`DISPO_OFFICER_MAJOR_ID` for a real `DEFAULT_DISPO_OFFICER`
    plus `PRECEDENCE: [{TABLE: DISPO.OFFICER, FIELD: REPORTING_TO}]`. Asserts `DISPO_ALLOWED` is
    platform-stamped `true` (never supplied explicitly — see Learned).
  - Added **TC-14** ("Dispo-enabled OVERRIDE INPUT blocked when mandatory DEFAULT_DISPO_OFFICER is
    missing") — mirrors the existing TC-13 pattern (PRECEDENCE present, `DEFAULT_DISPO_OFFICER`
    omitted → 400).
  - Added **TC-31** (the real one) — dual-override auth-required fixture
    (`provisionAuthDualStandardOverrideFixture`); maker (plain admin client) INPUTs+accepts with no
    override-class coverage (confirmed live: the admin client does **not** bypass the
    `OVERRIDE_CLASS` check — both overrides genuinely stayed PENDING); checker (`RESTRICTED_USER`,
    granted both classes via `assignRestrictedUserFullOverrideClasses`) performs a single bare
    `AUTH` call. Confirmed live: one call is sufficient — no separate `AUTH/accept` step — it
    resolves both PENDING overrides to APPROVED and moves the record straight to LIV.
  - Added **TC-32** ("partial coverage → partial authorisation, workflow stops, record stays
    NAU") — own local 3-override fixture (not the shared 2-override-hardcoded helper), built inline
    from `registerOverrideTriggerField` + `buildTriggerFieldsTableDefinition` (variadic, 3 fields) +
    `setAuthRequired` + three individual `OVERRIDE`/`OVERRIDE.CLASS`/`OVERRIDE.CLASS.DETAILS`/rule
    INPUT chains. Checker granted exactly 2 of the 3 `REQUIRED_CLASS` values. Confirmed live: AUTH
    is rejected with a 4xx and the record stays NAU when even one required class is missing
    (asserted generically as "any 4xx" — the exact error contract wasn't pinned down further).
  - Added **TC-34** ("all Disposition Items already APPROVED → AUTH proceeds straight through") —
    own local fixture reusing `provisionAuthDualStandardOverrideFixture` for table/projection only;
    two dispo-enabled `OVERRIDE~DISPO` records; two `DISPO.ITEM~SYSTEM` tickets created directly via
    INPUT (same routing-chain shortcut TC-52 already used); both approved via `DISPO.ITEM~REVIEW`
    with `DISPO_ACTION=APPROVE` (first time this action was exercised in the suite — see Learned).
    One bug found and fixed live: an erroneous explicit `dispoAllowed: true` in the
    `buildOverrideDispoInputPayload` calls caused a 400 (HIDDEN field) — removed, matching the
    already-correct TC-03/TC-18 pattern.
  - All five additions verified clean (`tsc --noEmit`, `eslint --max-warnings=0`, `prettier
    --check`, `playwright test --list`) and confirmed passing on live QA runs. File now at 38 tests.

## Learned

- **Platform rule, confirmed via a colleague's already-passing regression suite (durable fact —
  should be captured in `docs/frame-specs/` or `docs/project-spec/` if those existed in this repo
  checkout; they don't, per this repo's own CLAUDE.md, likely live in the `proj-ai-agentic` plugin
  repo instead):** `authOperationRequired: true` on a projection is rejected (500, not a clean
  4xx) unless the owning table's `classification` is `FIN`; INT tables can only be
  `authOperationRequired: false`.
- **Confirmed via the user's own manual curl walkthrough against QA (durable fact, same caveat as
  above):** creating/updating a projection via
  `POST .../tables/{tableId}/definitions/projections/operation/INPUT` requires `id` to be
  `{tableId}~SUFFIX` (never the bare `tableId` — that's rejected with 400), *and* the payload's
  `schema.properties` must mirror fields actually bound to the table's own definition — a generic
  placeholder schema is not sufficient for the call to have any real effect.
- Correcting an earlier mid-session misdiagnosis: the project's own test-case doc
  (`docs/test-cases/override-dispo/US-02.05.03-standard-override.md`, PRECONDITION 7) documents
  `id: "{{TABLE_ID}}"` literally, which looks like it endorses the bare-tableId form — but the
  user confirmed via manual testing that this is wrong/outdated, and the real, working contract is
  the `tableId~SUFFIX` form above. The doc itself is stale and should eventually be corrected
  (not done this session — out of scope, flagged here only).
- Reducing a dynamic table's `spaces` to the visibly-minimal set for the current test's asserted
  outcome is not safe to reason about in isolation — the override INPUT/accept confirmation
  workflow appears to need `NAU` as internal scratch space even on a table whose final,
  documented destination is `LIV` (i.e. "final space" and "spaces needed by the mechanism along
  the way" are different things). This reverses part of this session's own earlier "spaces
  right-sizing" change (task done under a different chat-history entry, before this file existed).
- Total per-file test/table-creation volume, not per-table `spaces` count, appears to be the
  dominant factor behind this shared QA environment's "group-health heal" degradation — a lighter
  regression file (7 tests) stays healthy for its whole run while this repo's 32-test smoke file
  does not, independent of any of this session's `spaces` changes.
- `tsc --noEmit` (and this repo's `npm run typecheck` used by CI) type-checks the entire project
  unconditionally — a shared-type change anywhere in a branch can surface as CI failures in files
  completely unrelated to that MR's actual diff. Worth remembering before narrowing/widening any
  shared type in `api/types/`.

- **Confirmed, real platform mechanism (previously an open question this session):** `AUTH`
  **does** evaluate `OVERRIDE_CLASS` permission against any still-`PENDING` overrides on the
  record — matching `EP-01.08` AC-SYS-03 / `EP-02.02` AC-SMS-03. It had looked like a no-op in
  earlier tests (TC-00/former-TC-31) purely because those tests' overrides were already fully
  resolved via `accept` before AUTH ever ran, not because the check doesn't exist.
- A single bare `AUTH` call (no separate `AUTH/accept` step) is sufficient both to evaluate
  override permissions and — if satisfied — move the record to LIV. AUTH does not need an
  `/accept` companion call the way `INPUT` sometimes does.
- The default/admin service-account client used throughout this suite
  (`authenticatedApiContext`) does **not** hold a blanket bypass of `OVERRIDE_CLASS` checks —
  confirmed by it genuinely leaving overrides `PENDING` when it doesn't hold the relevant classes.
  Safe to reuse as a "zero relevant permission" maker/inputter actor going forward, without
  needing a dedicated zero-permission RESTRICTED_USER scoping just for that role.
- `DISPO.ITEM` tickets can be created directly via `INPUT` on `DISPO.ITEM~SYSTEM`
  (`SOURCE_RECORD_ID`/`DISPO_SOURCE_TABLE`/`OVERRIDE_ID`/`VIOLATION_AMOUNT`), bypassing the full
  validation-engine → PRECEDENCE-routing chain entirely (the shortcut TC-52 already relied on, now
  reused for TC-34). `DISPO_ACTION=APPROVE` on `DISPO.ITEM~REVIEW` works and sets
  `DISPO_STATUS=APPROVED`, confirmed live — previously only `REJECT` (TC-52) and `FORWARD` (TC-53)
  had ever been exercised.
- `DISPO_ALLOWED` on `OVERRIDE~DISPO` is a platform-computed **HIDDEN** field: supplying it
  explicitly in the INPUT body (even `true`) is rejected with `400 Bad Request: "Field
  'DISPO_ALLOWED' with behavior HIDDEN must not be supplied by the caller"`. It must be omitted and
  left for the platform to derive from the presence of `PRECEDENCE`/`DEFAULT_DISPO_OFFICER`.
- The QA Google Sheet's exact wording for AUTH's partial-coverage rejection message doesn't match
  either found Confluence spec's contract (`"Insufficient Override Class Authority"`) — the sheet
  appears to paraphrase rather than quote the real platform message. Don't treat its exact strings
  as a literal API contract without independent confirmation (already the working assumption
  behind TC-32's looser "any 4xx" assertion).

## Open Items / Follow-ups

- **TC-52, TC-53 — RESOLVED 2026-08-20.** Was blocked on `403 User does not have access to table:
  DISPO.ITEM` for the real `.env`-defined DISPO_OFFICER_SECOND/THIRD Keycloak identities. Root
  cause confirmed by inspecting QA's DB directly: `DISPO_OFFICER_SECOND_ID`
  (`9c2ee823-6962-4e71-a6d8-4f22066b43c3`) belongs to a single group, `GROUPS:
  ["SM-USER-GROUP-USER-MANAGEMENT"]` (per its `SM.USER~INTERNAL` record in the `sm_user` schema).
  `SM.USER.GROUP` is its own Table (own DB schema, `sm_user_group` — not a projection living
  inside `sm_user` as first assumed) — its `liv` table holds a `SM.USER.GROUP~MAIN` record with
  `recordId = "SM-USER-GROUP-USER-MANAGEMENT"`, whose `PERMISSIONS` array (`SM.USER`,
  `SM.USER.GROUP`, `SM.DATA.ACCESS`, `AM.ACCOUNT`, `TF.FUNDS.TRANSFER`,
  `PF.CONTRACT.OPERATION` — all `FUNCTION: "ALL"`) had no `DISPO.ITEM` entry at all: the group is
  scoped to user-administration, not dispo processing, so the 403 was expected/correct behavior
  given the group's permissions, not a platform bug.
  - **Solution options considered:**
    1. Add `{ "TABLE": "DISPO.ITEM", "FUNCTION": "ALL" }` to the existing
       `SM-USER-GROUP-USER-MANAGEMENT` group's `PERMISSIONS` (via a `SM.USER.GROUP~MAIN` INPUT on
       that `recordId`) — the quick, minimal-diff fix.
    2. Create/use a dedicated group for DISPO officers (scoped only to `DISPO.ITEM`/`DISPO.OFFICER`
       permissions) and repoint `DISPO_OFFICER_SECOND`/`_THIRD`'s `GROUPS` to it — cleaner
       separation of concerns (a user-management group granting dispo-processing rights is a
       modeling smell), but a bigger change (new group, membership reassignment) and was not the
       one applied.
  - **Applied:** option 1, done manually against QA (not via test code — this is a real, shared,
    pre-provisioned QA account; the established snapshot/restore idiom used for `RESTRICTED_USER`
    was deliberately not extended to it, per this session's own earlier reasoning). Confirmed
    fixed: both TC-52 and TC-53 pass now.
  - Option 2 remains open as a possible follow-up if the team wants the permission model cleaned up
    (not urgent — tests pass either way).
- **TC-24 `accept` 500/404** — reported to the dev team (draft question prepared, see
  Implemented) with the two-projections hypothesis; needs server-side log correlation to confirm
  or refute. Symptom changed between runs (500 → 404), reinforcing it's not a client-side
  determinism issue.
- **Mid-run `"group: Invalid Table Group"` cascade** (full-suite run, 11 failures after TC-24,
  all identical "group: Invalid Table Group" 400s on the same worker group id) — explicitly
  shelved by the user this session ("отложим"). Root cause of the group's disappearance mid-run is
  unconfirmed. The existing "group-health heal" recovery path does not cover this failure mode
  (it only triggers on a readiness-wait *timeout*, not an immediate, non-retried 400 at
  table-*create* time) — worth a dedicated investigation or infra-side question later.
- **TC-03, TC-14, TC-32, TC-34 — RESOLVED 2026-08-20.** All four implemented in
  `override-dispo-smoke.spec.ts` and confirmed passing on live QA runs (see Implemented/Learned
  above for details). Along the way, TC-31 was also split into TC-00 (the old, mismatched test,
  renumbered) + a new, correctly-scoped TC-31 — closing the one true TC-number/content mismatch
  found during the strict sheet-vs-code audit. File is at 38 tests, all Smoke-sheet TCs now
  accounted for.
- **TC-21 (regression file)** — minor title-wording drift against the sheet noticed during the
  same strict audit pass; out of scope this session, not investigated further.
- **TC-35** — currently skipped; reason wasn't captured in this log when it was first observed
  ("35 скипнут" — reported by user, cause not diagnosed this session). Worth root-causing in a
  future session if it isn't already tracked elsewhere.
- `docs/test-cases/override-dispo/US-02.05.03-standard-override.md` PRECONDITION 7's documented
  request body (bare `{{TABLE_ID}}` as projection `id`) is stale/incorrect per this session's
  findings — not corrected this session, flagged for whoever next touches that doc.
- Session ended with the user moving on to a different module — no further override-dispo work
  planned for the immediate next session unless the shelved items above are picked back up.

## References

None.
