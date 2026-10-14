# Enquiry Regression — Boilerplate Dedup (Report Polling, Seeding, Restricted-User, Download, Simple Enquiry) + Dead-Code TS Fix

**Date/time:** 2026-08-30 19:51 · **Branch:** group_1/refactor/smoke-m2 · **Ticket(s):** None

## Discussed

- Reviewed DB-client lifecycle questions in `enquiry-regression.spec.ts` (whether `beforeAll` needs
  its own DB connection, whether table creation can move to `beforeAll`, whether tables can be
  reused, how many tables the file creates) — answered from direct code reads, no code changes at
  that point.
- Diagnosed a live TC-982 failure (`Test timeout of 300000ms exceeded`): root-caused to
  `TABLE_SCHEMA_POLL_MAX_WAIT_MS` (150s) + `TABLE_API_READY_MAX_WAIT_MS` (150s) landing exactly on
  the file's `test.describe.configure({ timeout: 300_000 })` budget, worsened by a DB
  connection drop/reconnect logged mid-run.
- Confirmed the related-name-table consolidation scope (topic: "консолидация таблиц"): TC-997,
  originally cited in an older open-decision doc, had already been deleted from the file on
  2026-08-26 — narrowing the real candidate set to 3 sites (TC-833, TC-963 ×2) spanning 2
  `describe` blocks.
- Ran a sub-agent audit of all 13 tests in `US-01.07.04 | Report Lifecycle Management`,
  classifying each SAFE vs MUST-STAY-ISOLATED for sharing the block's table (Camp A/Camp B
  reasoning), before consolidating.
- Ran a general duplication/boilerplate audit (sub-agent) across the whole 7600+-line file,
  producing 5 ranked findings: (1) report-generation polling boilerplate, 13 sites; (2)
  FULL.RECORD.INPUT seeding boilerplate, ~24-26 sites; (3) restricted-user
  (assign-group/create-context/run/restore) boilerplate, 3 sites; (4) CSV/PDF download-context
  boilerplate, 8 sites, marginal on its own — only worth bundling with #1; (5) CUSTOMER_ID-only
  Enquiry setup, ~52 raw occurrences, of which only a clean precondition-only subset is worth
  extracting.
- Ran a second, targeted sub-agent audit classifying all 52 `CUSTOMER_ID: plainEnquiryField(...)`
  occurrences into Bucket A (pure precondition boilerplate — schema is only CUSTOMER_ID, no
  drilldowns/selection, test asserts on something else) vs Bucket B (the Enquiry's own naming,
  schema, drilldowns, selection, or computed fields are the actual subject under test) before
  implementing item 5. Found 21 Bucket-A sites (vs. the ~10-15 originally guessed) and 31 Bucket-B.
- Investigated and explained a pre-existing `tsc` TS2559 error in `table-registry-api-client.ts`:
  the `withoutAuditableField<T extends { auditable?: boolean }>` generic's "weak type" constraint
  was structurally unsatisfiable against `CreateTablePayload`, which never declares `auditable` at
  all. Traced `auditable` to `GroupTableConfig` (the group-tables-config *read* response type,
  `table-registry.types.ts:167`) — confirmed via `bruno/collections/Table Registry/**` docs that
  `auditable` is server-derived from the table's `type` (`USR` → `true`, `SYS` → `false`) and was
  never something a client sends on create. Concluded `withoutAuditableField` was dead defensive
  code left over from an earlier payload shape. User chose to remove the helper rather than widen
  its type.

## Implemented

All in `api/system_core/tests/enquiry-regression.spec.ts` unless noted otherwise.

- Removed the file-level `dbClient`/`Client` `beforeAll` declarations; `afterAll` now creates its
  own DB client, uses it for `cleanupTables`, and closes it in `finally` — matching the
  codebase's established open-use-close-immediately pattern.
- Added an outer-level `test.beforeAll` creating `sharedRelatedNameTableId` once; consolidated
  TC-833 and TC-963's `relatedTableIdA` onto it (kept TC-963's `relatedTableIdB` on its own table,
  since the test's point is switching between two distinct tables).
- Consolidated 11 of 13 `US-01.07.04` tests onto the block's shared table/enquiry (TC-1012,
  TC-1014, TC-1015, TC-1016, TC-1803, TC-1797, TC-1010, TC-1011, TC-1023, TC-1024, TC-1018) —
  kept TC-1013 and TC-1029 isolated (four-eyes NAU/LIV/HIS staging; "table must be empty"
  respectively). Gave TC-1011/1012/1023/1024 unique `${tableId}~${enquiryId}.RECORD.INPUT`
  projection ids to avoid seed collisions on the now-shared table. Also consolidated TC-1050.
- `api/system_core/helpers/enquiry-helper.ts`: added
  - `pollReportUntilGenerated(client, recordType, recordId, customHeaders?)` →
    `{status, reportRef, body}` — replaced all 13 report-polling sites in the spec.
  - `ensureFullRecordProjection`, `inputFullRecord`, `seedFullRecordRow` (composing the first two)
    — replaced ~26 `buildFullRecordInputProjectionPayload`/`inputProjectionDefinition`/
    `inputProjectionRecord` seeding sites.
  - `downloadReport(apiRequest, reportRef, run)` — replaced all 8
    `newContext`/`get`/`dispose` download-and-verify sites.
  - `setupSimpleEnquiry(enquiryClient, client, tableId, enquiryId, { name?, waitForRegistry? })`
    — replaced 20 of 21 identified Bucket-A CUSTOMER_ID-only Enquiry precondition sites (TC-1007's
    `PRECONDITION` step, TC-966, TC-971, TC-1045, TC-1046, TC-1049, TC-1149, TC-1050, TC-1048,
    TC-999, TC-1014, TC-1029, TC-1015, TC-1016, TC-1803, TC-1797, TC-1010, TC-1023, TC-1024,
    TC-1018). Left TC-1007's `STEP 1` inline — its response body is reused for a `body.id`
    assertion, so folding it into the helper would either lose that check or complicate the
    signature for one site.
- `api/system_core/helpers/user-group-helper.ts`: added
  `asUserWithGroups(adminContext, apiRequest, groups, run)` — assigns groups to
  `PARTIALLY_ACCESS_USER`, creates the authenticated context, hands the raw context to `run` (so
  callers can build whichever client(s) they need), restores the profile and disposes the context
  in `finally`. Replaced the 3 restricted-user sites (TC-1016, TC-1803, TC-1797); removed the
  now-unused `UserProfileApiClient`, `createUserAuthenticatedApiContext`,
  `restorePartialAccessUserProfile`, `buildInternalUserProfilePayload` imports from the spec file.
- `api/system_core/client/table-registry-api-client.ts`: removed the dead
  `withoutAuditableField` generic helper and its two call sites in `createTable`/
  `createTableNoRetry` — this was the source of the last 2 pre-existing `tsc` errors.
- Verification after every step: `prettier --write`, `eslint --max-warnings=0`,
  `tsc --noEmit -p .`, `playwright test --list` — confirmed all 85 tests intact in
  `enquiry-regression.spec.ts` throughout. Final `tsc --noEmit -p .` run is fully clean (0 errors
  project-wide — the 2 errors flagged all session in `table-registry-api-client.ts` are gone).

## Learned

- `auditable` is a server-derived, read-only field on `GroupTableConfig` (the "list tables in a
  group" read response) — it is never part of `CreateTablePayload` (the create-table request
  body); the registry derives it from the table's `type` (`USR` → `true`, `SYS` → `false`). This
  is a durable project fact, not just session narrative — it should be added to
  `docs/frame-specs/` (or wherever table-registry payload shapes are documented) by a future
  session; this session only removed the dead code that assumed otherwise, it didn't add the fact
  to the authoritative docs.
- TypeScript's "weak type detection" (`TS2559`) fires when a generic constraint is an
  all-optional-properties type and the argument shares no property names with it at all — a useful
  signal for spotting genuinely stale type-narrowing helpers (as `withoutAuditableField` turned out
  to be) rather than something to silence by widening the type.

## Open Items / Follow-ups

- Duplication-audit item 5's ~31 Bucket-B occurrences (sites where the Enquiry's own naming,
  schema, drilldowns, selection, or computed-field logic is the actual subject under test) were
  intentionally left as-is — no further extraction planned there.
- The `auditable`-field fact (see Learned) should be added to the appropriate `docs/frame-specs/`
  doc by a future session — not done this session.
- Otherwise, all 5 items from the duplication audit are now closed out (item 5 closed by design,
  only its clean-boilerplate subset extracted).

## References

None.
