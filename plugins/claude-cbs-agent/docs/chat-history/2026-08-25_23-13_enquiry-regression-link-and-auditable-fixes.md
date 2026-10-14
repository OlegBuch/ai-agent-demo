# Enquiry Regression — auditable regression fix, US-01.07.03/04 batch, LINK/defaultJoin shape

**Date/time:** 2026-08-25 23:13 · **Branch:** (not tracked this session) (proj-test-automation) · **Ticket(s):** TB-2485

## Discussed

- **Related-table consolidation** (`setupRelatedNameTable` called independently by TC-833,
  TC-963 ×2, TC-997) — deliberately deferred, logged separately in
  `docs/chat-history/2026-08-25_10-01_enquiry-regression-table-consolidation.md`. Resume via
  keyword "консолидация таблиц".
- **`auditable` field regression** on `POST table-registry/api/v1/tables` (`400 "unknown field
  'auditable'"`) — root-caused as a backend schema-validation tightening, not a removal of the
  concept itself (`auditable` has always been server-derived from `type` via
  `GroupConfigServiceMapper.resolveAuditable`). Discussed three fix options (broad refactor /
  builder-only / client-layer strip); user explicitly rejected the broad-footprint option
  ("вижу что много кода отрефакторино... особенно много .spec-helper файлов не моих") and chose
  the client-layer strip ("Вариант C") to avoid touching unrelated test/helper files.
- **`waitForEnquirySelectionFieldReady` timeout** — discussed as an empirical question ("можем
  увеличить время ожидания?"). Raised 60s→150s as a diagnostic; three live runs across the day
  (all with the new 150s value included) showed zero successful probes regardless of timeout,
  disproving "just needs more time." Reverted to 60s per user instruction, with the failed
  experiment documented in the code comment so it isn't retried blindly.
- **LINK/join field config shape** — the documented `{operation: {type: 'LINK', config:
  {fieldId, tableId}}}` shape was live-rejected. User surfaced Jira **TB-2485** (closed/fixed
  2026-08-21) with a QA screenshot showing a working `200 OK` request — reverse-engineered from
  that into the real shape (see `## Learned` and the dedicated note below).

## Implemented

- **`api/system_core/tests/enquiry-regression.spec.ts`**:
  - Added US-01.07.03 batch: TC-995, TC-997 (now un-skipped for definition, re-skipped for
    execute — see Learned), TC-999, TC-1144 (`test.skip` — ticket contradicts platform), TC-1145,
    TC-1146.
  - Added US-01.07.04 batch: TC-1010 (`test.skip` — `GENERATED_AT` not exposed), TC-1011,
    TC-1023, TC-1024, TC-1018.
  - **TC-833** (`US-01.07.01.02 | Dynamic Query Engine`): rewritten around the confirmed
    `{LINKED_TABLE field + defaultJoin display field}` shape. **Passes live.**
  - **TC-963** (`US-01.07.02 | Update Enquiry`): same shape, tests updating `defaultJoin` to a
    second related table. **Passes live.**
  - **TC-997** (`US-01.07.03 | Display Enquiry`): same shape for the Enquiry Definition (which
    persists correctly), but EXECUTE doesn't resolve the joined value on this environment — the
    display field is simply absent from the result. Re-skipped with a precise comment; the
    definition-time part of the original skip reason is now resolved.
- **`api/system_core/client/table-registry-api-client.ts`**: added `withoutAuditableField()`,
  applied in `createTable`/`createTableNoRetry` (POST only, `updateTable`/`updateTableNoRetry`
  left untouched) — strips `auditable` before the wire call so `buildCreateTablePayload` and all
  call sites can keep declaring it without editing every file.
- **37 Bruno collection files** (`proj-bruno-api` + local `bruno/`) — removed `"auditable"` from
  POST-create-table request bodies only (GET-response examples and `docs:` prose left intact),
  per the dev team's relayed instruction.
- **`api/system_core/helpers/enquiry-helper.ts`**: added `seedRelatedNameRecord`;
  `ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS` net-unchanged at `60_000` (bumped to 150s
  mid-session, then reverted), with the failed 150s experiment documented in the comment.
- **Verification**: every change this session went through `prettier --write` →
  `eslint --max-warnings=0` → `tsc --noEmit -p .` → `playwright test --list` before any live run
  was requested from the user.
- Dedicated write-up: `docs/chat-history/2026-08-25_20-08_enquiry-link-defaultjoin-shape.md`
  (full LINK/defaultJoin shape reference, both TABLE.DEF-level and Enquiry-level conventions).

## Learned

- **`auditable`** was always server-derived (USR→true, SYS→false via
  `GroupConfigServiceMapper.resolveAuditable`); the backend just started rejecting it as an
  unknown field rather than silently ignoring it. Durable fact — worth a `docs/frame-specs/` (or
  equivalent) note if/when that tree exists in this repo; currently only `docs/chat-history/` and
  `docs/test-cases/` exist under `docs/`.
- **LINK/join field real shape** (TB-2485-derived, full detail in the dedicated note above):
  - NOT `{operation: {type: 'LINK', config: {fieldId, tableId}}}` on one field.
  - IS a pair of fields, both needing real TABLE.DEF-backed columns: a `LINKED_TABLE`-typed
    field (`x-config: {fieldId, tableId}` at the Enquiry level; `x-config: {relatedTable}` at
    the TABLE.DEF level — different keys, both real) plus a separate display field whose
    `x-config.defaultJoin: {linkField, targetField, relatedTable}` carries the actual join (no
    `operation` wrapper at all).
  - A partial-field `PUT .../definitions` is now rejected as a "destructive change" if it omits
    any existing field — always `GET` current schema and merge before `PUT`.
  - **Open gap**: this shape is confirmed for definition **persistence** (TC-833, TC-963 pass),
    but Enquiry **execute** does not resolve/return the joined value on this environment (TC-997)
    — no documented mechanism found for triggering execute-time resolution. Needs dev-team
    input.
- **`waitForEnquirySelectionFieldReady`**: raising the timeout doesn't help (0/3 successful
  live-run probes even at 150s) — this looks like a genuine platform break in
  `selection.inputFieldIds` propagation to `REPORT.CONTROL~BASIC`/`REPORT.SPOOL~ADHOC`'s
  `CONDITION` validator for freshly-created Enquiries, not an ordinary propagation-lag/timing
  issue.

## Open Items / Follow-ups

- **TC-997 execute-time resolution** — still skipped, needs dev-team clarification on how (or
  whether) `defaultJoin` is meant to resolve at execute time on this environment. **Update
  2026-08-26: TC-997 was deleted from the suite entirely — see
  `2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md`.**
- **`waitForEnquirySelectionFieldReady`** — still failing consistently; blocks live confirmation
  of TC-1010/1011/1023/1024/1018 (their shared `beforeAll` never gets past this probe). Needs
  dev-team escalation with this session's multi-run evidence, not a code-side fix. **Update
  2026-08-26: root-caused as a probe testing the wrong API surface for `/execute`-only tests —
  see `2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md`.**
- **Table consolidation** — deferred, keyword "консолидация таблиц" (separate note).
- **Ticket #1151** (US-01.07.03 batch) — unimplemented, blocked on an unresolved system-parameter
  question the ticket itself flags as pending; never raised to the user this session.
- **TC-1015/1016** — task tracker still shows this `in_progress`; not touched this session.
- TC-995/999/1145/1146's own live pass/fail after the `auditable` fix was not explicitly
  re-confirmed via a fresh pasted log this session (only TC-833/TC-963/TC-997 got dedicated live
  reruns around the LINK-shape work).

## References

- Jira **TB-2485** — " [Enquiry Creation] LINK operation validates fieldId against the current
  table's TABLE.DEF instead of the target table" (closed/fixed 2026-08-21) —
  https://bank-proj.atlassian.net/browse/TB-2485
- `docs/chat-history/2026-08-25_10-01_enquiry-regression-table-consolidation.md` (related, still
  open)
- `docs/chat-history/2026-08-25_20-08_enquiry-link-defaultjoin-shape.md` (full LINK shape
  reference, written this session)
