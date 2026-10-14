# Enquiry Regression — TB-2437/TB-2440 inputFieldIds contract, pagination boundary fix, TC-1010 infra investigation

**Date/time:** 2026-08-26 13:34 · **Branch:** (not tracked this session) (proj-test-automation) · **Ticket(s):** TB-2437, TB-2440

## Discussed

- **TC-1010 live verification** — the `waitForEnquiryInRegistry` fix added last session (for the
  `400 "ENQUIRY_ID - target table='ENQUIRY_REGISTRY' does not contain record..."` gap) passed
  static verification (prettier/eslint/tsc/playwright --list), but two separate live re-runs both
  failed earlier in the shared `beforeAll`/precondition chain on an **infra** issue, not our code:
  table-group health-heal (`createTableAndWait`) replaced a dead group, then Postgres schema
  provisioning for the table still timed out (`Timeout waiting for Postgres schemas/spaces to be
  created for table: ...`). Traced the `409 "Table already registered"` seen in the logs to
  `registerTableIdempotently`'s own expected idempotent-retry path (not the actual failure) — the
  real failure is `pollDatabaseForTableSpaces` timing out a second time post-heal, at which point
  `createTableAndWait` does **not** retry-heal again (only does so on `attempt === 1`) and instead
  writes a `reconciler_is_down_<worker>.flag` (auto-cleared at the start of every run by
  `global-setup.ts`).
- **Whether to raise `TABLE_SCHEMA_POLL_MAX_WAIT_MS`** (currently 150s, applied per attempt, so up
  to ~5 min total across the heal cycle) — discussed and explicitly decided **against** raising it:
  it's a cross-cutting constant in `constants-waiter.ts` (outside this session's `.spec.ts`-only
  scope), has a documented downstream dependency (`orphan-cleanup` grace period assumes it as an
  upper bound), and this session already has one precedent (raising
  `ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS` from 60s→150s last session) where more patience
  did not fix a mechanism that was genuinely broken rather than slow. Decision: wait and retry
  TC-1010 later rather than touch global config; **still not live-confirmed passing** as of this
  write-up. **Update: later the same day, a full-block run confirmed TC-1010 now passes — the
  infra issue was transient, not a persistent regression.**
- **TC-1145's persistent `waitForEnquirySelectionFieldReady` timeout** — re-examined given new
  manual-QA evidence (TB-2437's dev comment) suggesting the probe (via `REPORT.CONTROL~BASIC`'s own
  `CONDITION` array field) may not be a valid proxy for "is the Enquiry's own `/execute` endpoint
  ready to filter by an `inputFieldIds`-listed field" — the two are different API surfaces with
  different payload shapes. Ran as an explicit **experiment**: removed the wait from TC-1145 only,
  left TC-1146 as a control. TC-1145 passed immediately without it.
- **TC-1146 cross-referenced against its manual QA ticket + TB-2440** — the ticket's own expectation
  ("filtering by a non-listed field is not applied", i.e. silently ignored, 200) is contradicted by
  a QA-confirmed Bruno screenshot showing 400 (`must be in selection.inputFieldIds, or equal to
  ID`) against a stable, pre-existing Enquiry — ruling out propagation lag as an explanation.
- **TC-1144 cross-referenced against TB-2437** — same root cause as TC-1145's original wrapper bug,
  but the dev's own fix note explicitly covers this exact scenario: "the check that a filtered
  field must be listed in selection.inputFieldIds (or be ID) only runs when condition is present
  ... with the correct shape it returns 400 as expected." Manual QA confirmed this as correct.
  TC-1144's original "any field filterable when inputFieldIds is empty" expectation was based on
  the pre-fix buggy behavior (wrapped body → condition silently null → unfiltered 200).
- **TC-1050** (pagination boundary: `page=-1`, `size=-5`) — manual QA ticket + Bruno screenshot
  (against long-lived `DUP_C27`) show 200/"ignored, first page returned"; our live run and this
  session's own automated test both got 400. Unlike TC-1144/1145/1146, **no bug ticket is linked**.
  Agreed to independently verify via a hand-built Bruno request sequence against a **freshly
  created** table/Enquiry (see Implemented) before touching the test, to rule out Playwright/this
  framework as the cause.

## Implemented

- **`api/system_core/tests/enquiry-regression.spec.ts`**:
  - **TC-1010**: added `await waitForEnquiryInRegistry(client, ownTableId, enquiryId);` right
    after Enquiry creation in PRECONDITION 2. **Later confirmed passing live** (see Discussed).
  - **TC-1145**: removed the `waitForEnquirySelectionFieldReady(client, enquiryId, 'CUSTOMER_ID')`
    call from PRECONDITION 1 (experiment). **Confirmed passing live.**
  - **TC-1146**: same wait removed; STEP 1 rewritten from expecting `200` + "record still present"
    (filter silently ignored) to expecting `400` with the
    `must be in selection.inputFieldIds` error, per TB-2440. Title changed from "...is not applied"
    to "...is rejected". **Confirmed passing live.**
  - **TC-1144**: `test.skip` removed; STEP 1 and STEP 2 rewritten from expecting `200` +
    record-presence checks to expecting `400` with the `must be in selection.inputFieldIds` error,
    per TB-2437. Title changed from "...any field is filterable via condition" to "...filtering by
    any field other than ID is rejected". **Confirmed passing live.**
  - **TC-1050**: `test.skip` removed; STEP 2 (`page=-1`) and STEP 3 (`size=-5`) rewritten from
    expecting `200` + "first page returned" (negative value tolerated/ignored) to expecting `400`
    with `Page index must not be negative`/`Page size must be at least 1` respectively. STEP 1
    (`size=0` → 400) was already correct, left unchanged. **Confirmed passing live.**
  - Removed the now-fully-unused `waitForEnquirySelectionFieldReady` import (no remaining call
    sites in this file after the TC-1145/1146 fixes).
  - **TC-1018** (later the same day, full-block run): PRECONDITION was found to have the identical
    `ENQUIRY_REGISTRY` propagation gap as TC-1010 — added the same
    `waitForEnquiryInRegistry(client, ownTableId, enquiryId)` call. **Confirmed passing live.**
- **Ad-hoc Bruno verification** (not committed to any repo, run directly by the user): created a
  throwaway group/table/Enquiry (`manual_probe_table_1050` / `...~ENQ_1050`) via raw
  `table-registry`/`table-template` requests, then hit
  `POST .../enquiries/.../execute?page=-1&size=5` and `?page=1&size=-5` directly — reproduced the
  exact same `400`s our automated test saw (`Page index must not be negative: -1`,
  `Requested page size -5 is invalid. Page size must be at least 1`), independent of Playwright.
- Verification pipeline for every edit above: `prettier --write` → `eslint --max-warnings=0` →
  `tsc --noEmit -p .` → `playwright test --list --grep "<TC>"`, all clean before requesting a live
  run.
- **Comment stripping**: at explicit user request, later the same day all `//` and JSDoc-style
  comments were removed from `enquiry-regression.spec.ts` via the TypeScript compiler's own AST
  printer (`ts.createPrinter({removeComments: true})`) rather than regex, to avoid corrupting
  string literals containing `//` (e.g. `http://...` inside JSON request bodies). This had the
  unintended side effect of also collapsing all blank lines between statements (blank lines are
  AST trivia, same as comments) — fixed in a follow-up pass by inserting a blank line before every
  `test(`/`test.describe(`/`test.step(`/`test.beforeAll(`/`test.beforeEach(`/`test.afterAll(`/
  `test.afterEach(` call (including `await`-prefixed ones) that wasn't already preceded by a blank
  line or an opening `{`.

## Learned

- **`waitForEnquirySelectionFieldReady`'s `REPORT.CONTROL~BASIC` probe is not a valid readiness
  proxy for the Enquiry `/execute` endpoint.** They're different API surfaces with different
  payload shapes (`REPORT.CONTROL~BASIC`'s own `CONDITION: [{FIELD, OPERAND, VALUE}]` array field
  vs. `/execute`'s top-level `condition: {type, nodes/key/operator/values}`). Tests that only ever
  call `/execute` (TC-1145, TC-1146) don't need this wait at all — `waitForEnquiryInRegistry` alone
  is sufficient, and `/execute`'s own `selection.inputFieldIds` validation shows no propagation lag
  once probed directly. The helper itself is left in place in `enquiry-helper.ts` (still legitimately
  needed for `REPORT.CONTROL~BASIC`/`REPORT.SPOOL~ADHOC` CONDITION-array use cases, per TC-1012's
  `FIELD: 'ID'` bypass from last session) — just no longer imported/called from this file, since no
  remaining test in it exercises that code path.
- **Confirmed platform contract (TB-2437 + TB-2440, both manual-QA-confirmed as correct):**
  filtering an Enquiry `/execute` call by any field not literally present in a (possibly empty)
  `selection.inputFieldIds` — or equal to `ID` — is **rejected with 400**
  (`"must be in selection.inputFieldIds, or equal to ID"`, reported at `filter.condition.fieldId`),
  never silently ignored/passed through. This applies uniformly whether `inputFieldIds` is a
  non-empty allowlist (TC-1146) or empty/absent (TC-1144, meaning "only `ID` is filterable"). Both
  tickets' original "silently ignored" expectations were based on a pre-fix bug where a wrongly
  wrapped request body (`filter: {condition: ...}}` instead of top-level `condition`) caused
  `condition` to deserialize as `null`, so the `inputFieldIds` check never even ran and the full,
  unfiltered result set came back with 200 — this suite's `executeEnquiry` client already sends the
  correct unwrapped shape, so it was never affected by the wrapper bug itself, just by tests
  written to assert the old (buggy) behavior.
- **Negative pagination params are now strictly rejected.** `page=-1` → 400
  `"Page index must not be negative: -1"`; `size=-5` → 400
  `"Requested page size -5 is invalid. Page size must be at least 1"`. Reproduced identically via
  Playwright and via a hand-built Bruno request against a freshly-created table/Enquiry, ruling out
  the test framework as the cause. TC-1050's manual QA ticket/screenshot (200, tolerated) was run
  against a long-lived Enquiry (`DUP_C27`) and has **no linked bug ticket** — most likely predates a
  platform-side tightening of pagination validation that was never back-documented. Worth flagging
  to BA/platform team as a stale ticket, even though the automated test itself is now fixed.
- **Infra: `createTableAndWait`'s group-health self-heal only gets one retry.** On a Postgres
  schema-provisioning timeout, it heals the group and retries **once** (`attempt 1 → 2`); if the
  *second* attempt's schema poll also times out, there's no further heal — it writes a
  `reconciler_is_down_<worker>.flag` and throws. That flag is auto-cleared at the start of every
  `npx playwright test` invocation (`global-setup.ts`), so it doesn't persist across separate runs,
  but two independent runs in a row both hit this same second-attempt timeout — suggests the
  Postgres/reconciler side was genuinely degraded during this window, not a one-off blip (later
  confirmed transient — a subsequent run passed cleanly). The `409 "Table already registered"`
  visible in these logs is `registerTableIdempotently`'s own expected idempotent-retry step
  (delete stale metadata, recreate to trigger the reconciler) — not itself an error signal.
- **`ts.createPrinter({removeComments: true})` strips blank lines along with comments** — both are
  AST trivia to the TypeScript printer, so a comment-removal pass needs a deliberate follow-up to
  reintroduce blank-line separation between logical blocks if readability matters.

## Open Items / Follow-ups

- **TC-1010** — confirmed passing live later the same day (see Discussed/Implemented); no longer an
  open item.
- **TC-997** — was still skipped as of this write-up; later the same day (2026-08-26) it was
  deleted from the suite entirely after a second independent confirmation (standalone Bruno probe)
  found the same execute-time gap. See
  `2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md` for the full removed test
  code and resumption instructions.
- **TC-1050's stale ticket** — the manual QA ticket/screenshot for TC-1050 has no linked bug and
  appears to predate a real platform-side pagination-validation tightening; worth flagging to
  BA/platform team to update the ticket's documented expected behavior, even though our test-side
  fix is complete.
- Not audited this session: whether any **other** Enquiry `/execute`-related tests in this file
  (beyond TC-1144/1145/1146) carry the same outdated "non-listed field filter is silently ignored"
  assumption from before TB-2437/TB-2440 were understood. Worth a pass if time allows.
- Table consolidation, ticket #1151, TC-1015/1016 — unchanged, still open from prior sessions.

## References

- Jira **TB-2437** — execute endpoint's `condition`/`filter` wrapper contract; also explains why the
  `inputFieldIds` check "never fired" for the old wrapped-body bug —
  https://bank-proj.atlassian.net/browse/TB-2437
- Jira **TB-2440** — linked to TC-1146; manual QA confirmed 400-on-non-listed-field as correct
  platform behavior — https://bank-proj.atlassian.net/browse/TB-2440
- `docs/chat-history/2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md` (prior
  session — LINK/defaultJoin shape, `auditable` fix, original US-01.07.03/04 batch implementation)
- `docs/chat-history/2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md` (later
  the same day — TC-997 removal, full code + Bruno reproduction reference)
