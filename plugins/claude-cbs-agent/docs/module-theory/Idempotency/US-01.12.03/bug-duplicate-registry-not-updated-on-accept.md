Title: [BUG] duplicate_registry is never updated when an OVERRIDE is accepted

Module: Idempotency / Functional Duplicate Detection (US-01.12.03)
Related tickets: TB-2034 (TC-03 automation), TB-1860 (TC-31 - ground truth for the expected behavior; TC-36 - the four-eyes/permission question, still blocked)
Related docs: bug-500-accept-override.md (previous bug in the same chain - wrong URL, then 500 - both now fixed), tc03-override-accept-403.md
Severity: High - the accept-override feature persists the record but silently fails to do the one thing that makes it a "duplicate override" (linking it in duplicate_registry)
Component: Table Template (system_core) - Execute Accept Override endpoint, duplicate_registry write path

Context

After the URL fix (tc03-override-accept-403.md) and the 500 fix (bug-500-accept-override.md), `POST /api/v1/projections/{projectionId}/records/operations/INPUT/accept` now returns 200 and the accepted record is genuinely persisted with a correct `ST_OVERRIDES` audit entry (`status: APPROVED`). However, the `duplicate_registry` row created for the original (triggering) record is never updated to also reference the newly accepted record, and no second row is created either.

Per TC-31 (TB-1860, `docs/test-cases/TB-1860/integration-test-cases-v5.md:131`), the expected result for this exact flow is explicit: "`200`. `source_ref` grows to include both IDs."

What we ruled out before calling this a bug (not a timing/test issue)

1. Async/eventual consistency - checked `outbox`, `processed_event`, `event_binding` in the table's own schema: all three are empty. There is no event-driven mechanism wired up for this table that could update `duplicate_registry` later.
2. Manual re-check ~15 minutes after `accept` (run 1) - `duplicate_registry.updated_at` unchanged, still equal to `created_at` from the original INPUT.
3. Added an explicit poller to the automation (`pollDuplicateRegistryForSourceRef`, `api/system_core/helpers/table-registry-helper.ts`) that retries the exact same query every 2s for up to 15s before asserting - confirmed on a **second, independent run** (different dynamically created table, different generated record IDs) that the row still never appears within that window. Not a one-off.

Reproduction (two independent runs, both reproduced identically)

Run 1 - schema `aqa_int_table_1786026372213_56a`:
- `duplicate_registry`: 1 row, `source_ref: ["aqa_funcdup_tc03_a_1786026541601_957"]` only.
- `liv`: both `..._tc03_a_...` and `..._tc03_b_...` present; the `_b_` record's audit has `ST_OVERRIDES: [{status: "APPROVED", overrideId: "DUPLICATE:aqa_funcdup_ovr_cfg_...", approvedAt: ..., approvedBy: ...}]`.
- `input_session`: empty (correctly cleared after accept).

Run 2 - schema `aqa_int_table_1786027827245_d82`:
```json
{
  "id": "HVfRcB6WRzyiXZ4i1KumZQ",
  "config_id": "aqa_funcdup_ovr_cfg_1786027976679_b2e",
  "source_ref": ["aqa_funcdup_tc03_a_1786027977297_bdb"],
  "expiry_date": "2026-08-11",
  "created_at": "2026-08-06T14:52:58.461Z",
  "updated_at": "2026-08-06T14:52:58.461Z"
}
```
Automation's 15s poller for a row referencing `aqa_funcdup_tc03_b_1786027977297_3e4` timed out - no such row ever appeared, in this or any other row in the table's `duplicate_registry`.

Steps to reproduce (same preconditions/steps as bug-500-accept-override.md)

1. `POST /api/v1/tables` - create a Table (classification INT).
2. Create Projection `<tableId>~FUNCDUP` (ID + ACCOUNT_NUMBER) and a duplicate-config with `matchFields: ["ACCOUNT_NUMBER"]`, `enforcementAction: "OVERRIDE"`, `purgeDays: 5`.
3. `POST .../records/operations/INPUT` with record A -> `200`, `duplicate_registry` gets one row, `source_ref: [A]`.
4. `POST .../records/operations/INPUT` with record B, same `ACCOUNT_NUMBER` -> `422` + override info, InputSession created (correct).
5. `POST .../records/operations/INPUT/accept` with `{"recordId": "B"}` -> `200`. Record B persists with `ST_OVERRIDES.status = APPROVED` (correct). InputSession is cleared (correct).
6. Re-query `duplicate_registry` for the schema, filtering on `source_ref @> jsonb_build_array('B')` - zero rows, immediately and after waiting.

Expected result

Per TC-31 (TB-1860): the existing `duplicate_registry` row's `source_ref` grows to include both A and B (or, at minimum, some row ends up referencing B) - `200`, and record B is registered as a duplicate/override the same way record A was on Layer 2 duplicate detection.

Actual result

`200` on `accept`, record B persists correctly with override audit trail, but `duplicate_registry` is completely untouched - still only references A, `updated_at` never changes.

What we need from the developer

1. Confirmation: is writing/merging into `duplicate_registry` on `accept` supposed to happen at all in the current implementation, or does TC-31's expectation not match the actual intended design (e.g. is B expected to get its own hash/config bound at a later stage, such as COB purge/expiry, rather than at accept time)?
2. If it is supposed to happen now - server-side logs/stack trace for the `accept` request (we can supply exact `projectionId`/`recordId`/timestamps per run above) to see whether the merge step is throwing silently, being skipped, or was simply never implemented for this endpoint.
3. If this is intended behavior and TC-31 is wrong - we need the corrected expected result so we can fix the ground-truth test case (TB-1860) and the automation assertion together, rather than assuming.

Developer's answer
(to be filled in once received)

2026-09-04 update: added a new automated reproduction matching the manual QA sheet's TC-15
("OVERRIDE approver vs initiator (4-eyes)") — `idempotency-regression.spec.ts`, test
`'TC-15: OVERRIDE approver vs initiator (4-eyes)'`, right after the existing case 2736 in
`US-01.12.03`'s describe block. Asserts the TC's own literal Expected Result (200 OK for the SAME
initiator + `source_ref` becomes a 2-element array + `expiry_date` unchanged) rather than the
already-confirmed actual behavior — written this way deliberately, at the user's request, so they
can see the mismatch fail live rather than have the test silently encode the known-broken behavior.
Not yet linked to an Allure case (TC-15 doesn't exist in Allure TestOps yet — closest is case 2726,
which also doesn't specify same-vs-different-approver semantics).

2026-09-04, live-confirmed: user ran the test twice. First two runs hung on unrelated DB-connection
issues in `db-helper.ts` (see `docs/common-issues/db-and-concurrency/db-helper-reconnect-race-hangs-client.md` — both
fixed same session). Third run completed cleanly in 9.4s and failed exactly as predicted, on the
`source_ref` step: `Expected ["...tc15_a...", "...tc15_b..."]`, `Received ["...tc15_a...."]` — the
second record's ref is never added. Confirms case 2736's finding still holds for this exact scenario
(same-initiator accept). The test never reached its third step (`expiry_date` immutability check) -
Playwright stops the test body on the first failed `expect`.

2026-09-04, same day, user's own call: the user reviewed this result and explicitly decided the
1-record behavior IS the confirmed correct expectation ("так это подтвержденное... что будет 1
запись") - not waiting for a separate developer reply on this specific case, since the same
behavior was already independently confirmed by case 2736's own live-verified assertion. Per that
call: (1) `idempotency-regression.spec.ts`'s TC-15 test's `source_ref` assertion updated to expect
`[firstRecordId]` only (was `[firstRecordId, secondRecordId]`) - now green, matching case 2736;
(2) created Allure case **3634** ("OVERRIDE approver vs initiator (4-eyes)", US-01.12.03) with the
corrected Expected Result baked in (source_ref stays single-record, expiry_date unchanged) rather
than the original TC-15 sheet's 2-record wording; (3) test now carries `allureCaseId(3634)`.
Note: case 2736 itself still carries its OLD, uncorrected Expected Result in Allure ("source_ref...
holds references to multiple records") even though its own automation has asserted the opposite,
live-confirmed, since it was written - that mismatch was not in scope of this session's fix and is
flagged here for whoever picks it up next. The original TC-31 (TB-1860)/TB-2034 developer-facing
question above (is server-side merge into `duplicate_registry` on `accept` supposed to happen at
all) is still open in principle, but is no longer blocking this specific case's automation status.
