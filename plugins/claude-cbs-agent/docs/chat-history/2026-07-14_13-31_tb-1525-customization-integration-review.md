# TB-1525 — Customization Integration Suite: Review, Bug Fixes, and Fidelity Check

**Date/time:** 2026-07-14 13:31 · **Branch:** group-3/TB-1525 · **Ticket(s):** TB-1525

## Discussed

- **`.gitignore` question (resolved as no-op):** User asked to "uncomment" `.gitignore` entries
  for `docs`/`.claude`/`mcp.json` from a prior session's `Sync .gitignore with main` commit
  (`8525e0f`). Investigation showed `.gitignore` only ever changed `bruno` → `docs` (already
  matches `origin/main` exactly) — `.claude`/`mcp.json`/`rules`/`CLAUDE.md` are ignored via
  `.git/info/exclude` instead, which is a local-only file never pushed regardless of content.
  User confirmed via `AskUserQuestion`: nothing needed to change.
- **Is `customization-integration.spec.ts` really Integration-level?** User pasted the actual
  Manual QA Allure case table (TC-01 through TC-08, all `Test level: Integration`, `Test type:
  API`). Confirmed 7/8 cases genuinely cross ≥2 real services (Table Registry ↔ Table Template,
  plus Postgres LIV verification for TC-03) — proving cross-service propagation, not mocked.
  `TC-06` is the one exception: it only touches Field Registry, no second service — its
  "integration" framing is conceptual (proving the same origin-immutability governance rule
  extends from Table Registry to Field Registry), not technical service-chaining.
- **Resource footprint check:** confirmed the suite creates exactly 2 Table Registry Groups
  (`G1`, `G3`) once in `beforeAll`, shared across all 8 tests as needed (`G3` only for the two
  relocation tests, TC-05/TC-08) — matches `customization-smoke.spec.ts`'s pattern, scaled up by
  exactly the amount TC-05/TC-08 require. Tables/fields are intentionally *not* shared across
  tests, since each test's precondition mutates or destroys its own resource (sharing would break
  test independence). Concluded: no unnecessary resource creation, current footprint is
  right-sized.
- **`errorMessage` extraction style** (`errorBody.detail ?? errorBody.message ?? errorBody.error
  ?? errorBody.title ?? ''`) — user found it confusing. Surveyed 3 variants across the codebase
  (identical in `customization-smoke.spec.ts`; a shorter 3-fallback variant in
  `table-registry-smoke.spec.ts`/`validation-engine-regression.spec.ts`; a defensive
  try/catch-wrapped IIFE in `sms-system-core.spec.ts` that also survives non-JSON bodies). User
  chose to leave the current form as-is (it already matches the direct smoke sibling exactly).

## Implemented

All changes in `api/integration_chapter/tests/customization-integration.spec.ts`:

- Removed raw `import { request } from '@playwright/test'`; `beforeAll`/`afterAll` now use
  `playwright.request` (destructured from the hook), matching `customization-smoke.spec.ts`.
- Moved field cleanup (`createdFieldIds`) from a one-shot loop in `afterAll` into `afterEach`
  (`Promise.allSettled` + array reset), mirroring the existing table-cleanup pattern right above
  it — fixes a field-array leak across tests.
- `TC-02` (target+source table creation) and `TC-04` (sibling A/B creation): parallelized via
  `Promise.all`, with `createdTableIds.push(...)` called *before* the parallel call so both IDs
  stay tracked for cleanup even if one creation fails — addresses a latent risk of the suite's
  350s/550s `test.describe.configure({ timeout })` being exceeded by two sequential
  up-to-330s-each `createTableAndWait` calls in one test.
- `TC-03`/`TC-05`: replaced manual `text()` + `JSON.parse()` with `.text().catch(() => '')` (for
  the assert message) + a separate `.json()` call, matching the rest of the file's style.
- `TC-01`: added a new `PRECONDITION` step directly querying Postgres
  (`information_schema.tables` + `COUNT(*)` per existing space table) to confirm
  `COUNT(LIV)+COUNT(NAU)+COUNT(HIS)+COUNT(DEL) == 0` before deletion, per the case's own
  Precondition #4 and `docs/project-spec/business-rules.md`'s Safe Deletion Policy formula. Only
  sums counts for space-tables that actually exist (this table only declares `spaces: [LIV,
  HIS]`, so `nau`/`del` tables aren't provisioned and querying them would error).
- `TC-02`: updated the hardcoded error-message assertion to the real string observed from a live
  run: `` `Table ${targetTableId} cannot be deleted because it is referenced by a LINKED_TABLE
  field on table ${sourceTableId}` `` (previous guess was wrong; user supplied the actual 400
  response body).
- `TC-03`: fixed a real bug the user hit live — a 404 `Projection not found`. Root cause: the
  test invented a `${tableId}~SIMPLE` projection ID that was never created anywhere. First
  attempted fix (wrong): added a `SystemCoreProjectionHelper.createProjection(...)` call,
  borrowed from `audit-fields-integration.spec.ts`'s pattern for *custom-named* projections. User
  redirected to check `table-registry-regression.spec.ts`/`table-registry-smoke.spec.ts` instead,
  which showed the real default-projection convention: no suffix, no separate creation call — the
  projection ID is simply the table ID itself once `createTableAndWait` +
  `updateDefinitionAndWait` have run. Reverted the `SystemCoreProjectionHelper` addition entirely
  and changed `performRecordOperation` to pass `tableId` directly.
- Verification: `npx tsc --noEmit` and `npx eslint --max-warnings=0` both ran clean after each
  round of fixes (the user later interrupted several of these verification calls mid-session —
  see Learned).

Not changed (explicitly deferred/declined this session):
- `TC-06`'s missing error-message assertion and `TC-02`'s original loose regex — both later
  confirmed *not* actual gaps once the real case text was available (see Discussed).
- `TableRegistryApiClient.updateTable`'s signature (`CreateTablePayload` instead of
  `Partial<CreateTablePayload>`), which forces the `as unknown as CreateTablePayload` double-cast
  in `TC-05`/`TC-07`/`TC-08` — flagged as a pre-existing, shared pattern (also in
  `customization-smoke.spec.ts`, `table-registry-regression.spec.ts`), not fixed since it would
  require a cross-file client-signature change; left pending a explicit user decision.
- `errorMessage` extraction style — user chose to leave as-is (see Discussed).

## Learned

- **`docs/api-bruno-spec/` does not exist; the real Bruno collection lives at
  `C:\Users\user\BrunoApi\proj-bruno-api`** (confirmed present and usable this session). It
  documents endpoint *behavior* (e.g. Delete-table's 3 ordered guards) but generally does **not**
  include literal error-message text/examples for negative paths — don't expect bruno to supply
  exact assertion strings; those need either a live-run observation or the manual QA case's own
  quoted (vs. paraphrased) Expected Results text.
- **A case's Expected Results field distinguishes intent by quoting style**: an exact string in
  quotes (e.g. TC-07/08's `"Operation not permitted: Core table configurations are locked"`) means
  assert that exact text; an unquoted paraphrase (e.g. TC-02's "states the table cannot be deleted
  because it is referenced...") means assert semantically, a loose match is correct, not a gap.
  Worth checking this distinction before assuming a loose assertion is a shortcut.
- **Default Table Template projection ID = the table ID itself, no suffix, no separate creation
  call** — `createTableAndWait` + `updateDefinitionAndWait` (table-level schema PUT) is
  sufficient for simple INT-table record operations (confirmed in
  `table-registry-regression.spec.ts:301-345`, `table-registry-smoke.spec.ts:883-910`). A
  *named/custom* projection (e.g. `~TC1`) only appears where a test explicitly needs one distinct
  from the default and calls `SystemCoreProjectionHelper.createProjection(tableId, projectionId,
  schema)` for it (e.g. `audit-fields-integration.spec.ts:163-187`) — don't assume the custom
  pattern applies to a simple single-projection scenario without checking the plainer sibling
  tests first.
- **Playwright parallelism is not a risk here**: `fullyParallel: true` is set globally in
  `playwright.config.ts`, but the `API-tests` project pins `workers: 1` — so tests in this file
  are always fully serial regardless, and the shared `let client`/`fieldClient`/`groupG1Id`
  module-scoped variables are safe.
- **`cleanupTables()` (`api/utils/db-helper.ts:99-110`) no-ops entirely outside CI** (`if
  (!process.env.CI) return`) — by design, "to preserve tables for group reuse" locally. Table/
  schema cleanup for this suite only actually runs in CI.

## Open Items / Follow-ups

- `TableRegistryApiClient.updateTable`'s signature is stricter (`CreateTablePayload`, all fields
  required) than the real endpoint (accepts partial bodies per `Update table.yml`'s own example),
  forcing `as unknown as CreateTablePayload` casts in 3 spec files. Loosening it to
  `Partial<CreateTablePayload>` would remove the cast everywhere but is a shared-client change
  beyond just this file — needs an explicit decision, not done yet.
- User was mid-way through running the actual suite against a live environment this session
  (reported two real failures — TC-02's error string, TC-03's 404) — worth re-running the full
  suite once more after this session's fixes to confirm no further live-environment surprises
  remain (e.g. TC-01's new DB precondition check, TC-04's parallelized creation, TC-07/08 unchanged).

## References

None (no Jira/Allure/PR fetched via MCP this session — the Allure case content for TC-01–TC-08
was pasted directly into chat by the user, not fetched live).
