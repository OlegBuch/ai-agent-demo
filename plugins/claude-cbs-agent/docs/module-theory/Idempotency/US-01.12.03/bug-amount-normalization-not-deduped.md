Title: [BUG] AMOUNT values that differ only in scale/notation are not recognized as duplicates

Module: Idempotency / Functional Duplicate Detection (US-01.12.03)
Related tickets: TB-2177 (TC-10 automation)
Related docs: project_tb-1860-br-3.5-no-date-normalization (a *different*, dev-confirmed-as-intentional
  spec/behavior mismatch found the same day — do not conflate the two: that one's spec text was stale
  and got corrected after a developer said so explicitly; this one's spec text is current, unambiguous,
  and confirmed against the live Confluence source below — it is a real defect, not a spec question)
Severity: Medium — the flagship duplicate-detection feature silently fails to catch a duplicate
  when the same monetary amount is submitted in a different (but numerically identical) textual form
Component: System Core (Table Template) — duplicate-check hash computation for `matchFields[]`
  containing a numeric/amount field

Context

Confirmed directly against the live, current spec — not just the TB-1860 mirror — via Confluence
`US-01.12.03 | Functional Duplicate Detection (ERROR + OVERRIDE)`
(https://innowise-group.atlassian.net/wiki/spaces/CBSA/pages/5114003503, current version as of
2026-08-07):

- **AC2 (Duplicate Found – ERROR):** "GIVEN a valid configuration exists with `enforcementAction =
  ERROR` WHEN the System finds a matching hash in `duplicate_registry` THEN the System rejects the
  request with HTTP 422 including the `source_ref` of the existing record, and the target record is
  not persisted."
- **Business Rule:** "Numeric values are normalized via `BigDecimal.toPlainString` before
  concatenation." — *No negative behavior – design constraint.*

These two are unambiguous and uncontested (unlike BR-3.5/dates, there is no developer statement
anywhere reversing or qualifying this rule). Per TC-10 (Allure, US-01.12.03): "POST INPUTs with
AMOUNT=100, then 100.00, then 1E2 (same numeric value). Numbers are normalized via
BigDecimal.toPlainString before hashing -> same hash -> recognized as a duplicate." Given an
`ERROR`-enforcement config, "recognized as a duplicate" per AC2 means the 2nd/3rd POST must return
`422`. This is not a vague case and not something to second-guess against the approved requirement —
it is core to what these Idempotency/Duplicate-Detection stories exist to prove.

Reproduction

1. Table (classification INT), projection `<tableId>~FUNCDUP`, schema field `AMOUNT` (`x-type:
   AMOUNT`, corrected from an earlier mis-typed `x-type: NUMERIC` — see the sibling AMOUNT/NUMERIC
   fix in this same automation pass), duplicate-config `matchFields: ["FIELD_A","FIELD_B","AMOUNT","VALUE_DATE"]`,
   `enforcementAction: ERROR`.
2. `POST .../records/operations/INPUT`, `AMOUNT: "100"` (plus matching FIELD_A/FIELD_B/VALUE_DATE)
   -> `200`, record persisted, hash registered.
3. `POST .../records/operations/INPUT`, same FIELD_A/FIELD_B/VALUE_DATE, `AMOUNT: "100.00"` ->
   **expected `422`** per AC2 — **got `200`**, record persisted as a distinct, non-duplicate record.
   Response body confirms the value is stored verbatim as `"AMOUNT":"100.00"`, not normalized to
   `"100"` before the hash comparison.
4. `AMOUNT: "1E2"` not yet exercised against a real run — the test previously used a `for` loop with
   a single `expect()` per iteration, so the `100.00` failure aborted the test before `1E2` was ever
   attempted. Automation has been changed to `expect.soft()` per iteration so both variants are
   always exercised and reported independently going forward — next run will tell us whether `1E2`
   passes or fails.

Debugging clue for the developer (not a reason to doubt the requirement)

`BigDecimal.toPlainString()` in Java converts scientific/exponential notation into plain decimal
form, but it does **not** strip trailing zeros or otherwise normalize scale:
- `new BigDecimal("1E2").toPlainString()` -> `"100"`.
- `new BigDecimal("100.00").toPlainString()` -> `"100.00"`, **not** `"100"` — scale is preserved.

If the implementation calls bare `toPlainString()` without an additional `.stripTrailingZeros()` (or
compares via numeric value/`compareTo()` instead of the resulting string), that would exactly explain
why `"100.00"` isn't recognized as equal to `"100"` while `"1E2"` might still work correctly. This is
a plausible root cause to check server-side — not a suggestion that the requirement is wrong.

What we need from the developer

1. Server-side logs/trace for the `"100.00"` reproduction above (exact `projectionId`/`recordId`/
   timestamp available) — is the normalization step being skipped, throwing silently, or producing a
   different string than expected?
2. Confirmation that AC2 + the `BigDecimal.toPlainString` business rule stand as currently written
   (they appear unambiguous and unchanged) — if so, this is scheduled as a fix, not a spec
   clarification.

Developer's answer
(to be filled in once received)
