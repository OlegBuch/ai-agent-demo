# Batch INPUT record shape is `fields`, not `data`

**Symptom:** A test calling the new split batch INPUT endpoints
(`/api/v1/batch/full/projections/:projectionId/records/operations/INPUT` or the `partial`
sibling, TB-3337) reuses `buildRecordInputPayload(recordId, data)` from
`test-data/payload-builder.ts`, which returns `{ recordId, data }` — the shape a **single**
INPUT operation takes. The batch-only contract instead requires `{ recordId, seqNo, fields }`.

**Rule (predictive):** Any record inside a `records: [...]` array sent to one of the new
`/api/v1/batch/{full|partial}/projections/:projectionId/records/operations/INPUT` endpoints must
use the key `fields`, never `data` — `data` is only correct for a single (non-batch) `INPUT` via
`RECORD_OPERATION`/`performRecordOperation`. Before writing or reviewing any new call to
`performBatchRecordOperation(...)`, check the record shape against the current
`proj-bruno-api` "Batch INPUT Records (Full)" / "(Partial)" `.bru` docs, not against
`buildRecordInputPayload`'s existing single-INPUT shape — they are deliberately different request
DTOs, not one shape reused. The old pre-split endpoint (`.../records/operations/INPUT/batch`) did
use `data` — don't assume the field name survived the split just because the wrapping `records`
array shape looks the same.

Also note the response shape changed alongside the request: the old endpoint returned
`{ results: [...] }` with `{ recordId, seqNo, data, audit }` per entry; the new split endpoints
return `{ items: [...] }` with `{ index, result, errors }` per entry (`result.data` carries
`{ seqNo, fields, audit }` on success, absent when the record only raised an override). A test
that asserts on the old `results`/`data` response keys against the new endpoint will read
`undefined`, not throw — don't assume a silently-missing assertion means "nothing to check."

**Incident (2026-09-11):** MR !225 (`TB-3337: Split batch INPUT client into full/partial modes`)
added `performBatchRecordOperation(mode, projectionId, operation, payload)` and migrated
`currency-regression.spec.ts`'s "Adapter without ESB permission is rejected" (Allure 3104) from
`performRecordOperation(CURRENCY_ORDER_BATCH_PROJECTION_ID, 'INPUT/batch', payload)` to
`performBatchRecordOperation('full', CURRENCY_ORDER_BATCH_PROJECTION_ID, 'INPUT', payload)` — the
URL migration is correct and matches the real contract (confirmed via `proj-bruno-api`'s
`feature/TB-3337` branch, not yet merged to `main`: `Batch INPUT Records.yml` now points at
`/api/v1/batch/full/projections/:projectionId/records/operations/INPUT`). The payload itself,
however, was left built via `buildRecordInputPayload(recordId, buildOrderData())`, still producing
`{ recordId, data }` instead of `{ recordId, fields }`. This specific test only asserts the HTTP
status (`403 Forbidden`, expected before body validation runs) and a follow-up "never staged"
check, so the wrong key most likely does not fail *this* test — but it is a real, confirmed
contract mismatch that will bite the first test that checks the batch response body, or any
environment where request validation happens ahead of the permission check.
