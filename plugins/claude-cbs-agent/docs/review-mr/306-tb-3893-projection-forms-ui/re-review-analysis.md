# Re-review — MR 306 (TB-3893: Projection Forms & UI Framework - UI)

Re-checked 2026-10-05 through the GitLab MCP (read-only). MR head `9d4a66e6` — the same sha `logical_analysis.md` reviewed on 2026-10-02. `list_merge_request_versions` shows one version only; `list_commits` shows nothing after `9d4a66e6` (committed 2026-10-02 09:10). `final_analysis.md` was never produced for this MR, so the Comment list below is taken from the 9 threads actually posted (`mr_discussions`), with evidence from `logical_analysis.md`.

## Summary

Nothing was pushed since the first review. All 9 posted threads were marked resolved by the author (2026-10-02 to 2026-10-04, last one "resolved all threads" 2026-10-04 11:27) with no commit behind them. Result: 0 Fixed, 9 Not Fixed, 0 Partially Fixed, 0 Regressed. Fresh sweep: no new findings, the code is byte-identical to the reviewed state. 9 of ~40 findings were posted; the unposted ones (below) are still open on the same code.

## Fix Verification

Spot-checked directly at head `9d4a66e6` (git grep on the MR ref): items 1, 2, 3, 4, 5, 7, 9. Items 6 and 8 rest on the unchanged-sha argument plus the original line citations, not a fresh line-by-line recount.

- Comment 1 — [Not Fixed] Parallel page-object/path/helper layer. `create-projection-wizard-page.ts:11` still `export class CreateProjectionWizardPage extends BasePage`; `projection-detail-page.ts:12` `ProjectionDetailPage`; `table-projections-page.ts:11` `TableProjectionsPage`.
- Comment 2 — [Not Fixed] `ProjectionRuntimeRecordPage` not a BasePage. `projection-runtime-record-page.ts:7` `export class ProjectionRuntimeRecordPage {` — no `extends`.
- Comment 3 — [Not Fixed] Stale-group healing in setup fixture. `projection-forms-setup.ts:39` `delay(delayMs)`, `:47`/`:51` `console.warn`, `:64` fallback-group `createTableAndWait`.
- Comment 4 — [Not Fixed] Hard-coded global field id. `projection-forms-setup.ts:126` `const linkUserGroupFieldId = 'LINK_USER_GROUP';`.
- Comment 5 — [Not Fixed] Teardown masks failure / leaks context. `projection-forms-setup.ts:~326-340`: `createDbClient()` + `await dbClient.connect()` still sit before the `try`, in both `cleanup` and the `catch` branch.
- Comment 6 — [Not Fixed] Provisioning copy-pasted (see note above on verification depth). No new helper/factory commit exists.
- Comment 7 — [Not Fixed] UI-built state instead of API seeding. `git grep ProjectionRecordApiClient -- ui` returns nothing: still unused anywhere in `ui/`.
- Comment 8 — [Not Fixed] `expect` without message (see note above on verification depth).
- Comment 9 — [Not Fixed] Magic timeouts. `timeout: <n>` still appears 59× in `pf-record-lifecycle.spec.ts`, 5× in `pf-view-projection-details.spec.ts`, 2× in `pf-update-projection.spec.ts`, 2× in `pf-field-customization.spec.ts`; no new named poll config in `ui-timeouts.ts`.

## Findings never posted to the MR (still open at head)

From `logical_analysis.md`: 3 (Operation Day select anchors on placeholder), 9 (`PluginManagerPage` additions — `createPluginModal`, `pluginRow`, etc. still present with no consumer), 11, 14 (TC-4044 red by construction), 15 (TC-4037 reflection + swallowed errors), 16-25 (titles that assert more than the body proves; fake `getCurrentSpaceOptions()` fallback; toast ≠ success), 26 (leaked tables/users on failure paths), 27 (empty catches), 28-31, 32-34, 41; plus `cosmetic_analysis.md` items 10, 12, 13, 35-40. Numbers are the originals; decide which to raise.

## New Findings

No new issues detected.

## Ready-to-paste GitLab follow-up comment

Process
Comment 1
[Confirmed] Threads resolved without a fix
All 9 review threads are resolved, but the branch head is still 9d4a66e6 (pushed 2026-10-02 09:10) — no commit addresses any of them. Fix: reopen the threads, or push the fixes and say in each thread which commit fixes it.

Structure and duplication
Comment 2
[Confirmed] Parallel page-object, path and helper layer duplicates ui/table-registry
ui/projection-forms/pages/create-projection-wizard-page.ts:11 — still a second CreateProjectionWizardPage; projection-detail-page.ts:12 and table-projections-page.ts:11 still duplicate ProjectionDetailsPage and TableDetailsPage from main. Fix: extend or parameterise the table-registry page objects, paths and helpers, or explain why a parallel module is needed and rename the colliding class.

Comment 3
[Confirmed] ProjectionRuntimeRecordPage is not a BasePage
ui/projection-forms/pages/projection-runtime-record-page.ts:7 — the class has no extends and re-implements testids from the existing runtime pages. Fix: extend BasePage and reuse the existing runtime page.

Comment 4
[Confirmed] Provisioning copy-pasted about six times
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:31-120 (and the other ranges in the original comment), pf-update-projection.spec.ts:92-159 — unchanged. Fix: one createLifecycleProjection factory in helpers/ and one LifecycleProjection type.

Comment 5
[Confirmed] State built through the UI although ProjectionRecordApiClient exists
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:308-313 and the other ranges in the original comment — ProjectionRecordApiClient is still not used anywhere in ui/. Fix: extract shared setup helpers and API-seed every version that is not the operation under test.

Fixture
Comment 6
[Confirmed] Setup fixture re-implements stale-group healing
ui/projection-forms/fixtures/projection-forms-setup.ts:39 — delay() sleeps, a fallback group nothing cleans (:51-64) and a bare console.warn remain. Fix: call createTableAndWait directly; fix any needed retry in table-registry-helper.

Comment 7
[Risk] Hard-coded globally unique field id
ui/projection-forms/fixtures/projection-forms-setup.ts:126 — LINK_USER_GROUP is a literal while field ids are global in CBS. Fix: generate it with generateCustomId and expose it on ProjectionFormsPreconditions.

Comment 8
[Risk] Teardown can mask the original failure and leak the API context
ui/projection-forms/fixtures/projection-forms-setup.ts:326 — createDbClient and connect run outside the try. Fix: move connect inside the try, as field-registry-setup.ts does.

Test quality
Comment 9
[Confirmed] expect without a message argument
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:895-908 and the other ranges in the original comment — unchanged. Fix: add a descriptive message to every expect.

Comment 10
[Confirmed] Magic timeouts, company codes and literals where constants exist
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:1725 and the other ranges in the original comment — 59 inline timeout values remain in this file alone. Fix: one named poll config in ui-timeouts.ts with UI_DEFAULT_RETRY_INTERVALS_MS, company codes from TEST_CONSTS.

## Changelog

- 2026-10-05 — re-review round 1 (this file): head unchanged, 9/9 Not Fixed.
- 2026-10-05 — re-review round 2 (below): author pushed 2 versions (v2 `27d0552e` 11:21, v3 `15594204` 11:25) after round 1 was written.

## Round 2 — 2026-10-05, MR head `15594204` (v3)

Baseline: the 9 threads actually posted by the reviewer (`mr_discussions`); `final_analysis.md` still does not exist. Verified read-only against the MR ref, with `git grep`/`git show` plus a TypeScript-AST scan for `expect(` calls with no message. A thread marked resolved was not taken as proof; the 4 resolutions older than the push were checked against the new code. The author left no reply in any thread.

### Summary

9 comments verified: 5 Fixed (3, 4, 5, 7, 8), 4 Partially Fixed (1, 2, 6, 9), 0 Not Fixed, 0 Regressed. Fresh sweep found 4 small new items (1 Risk, 3 Nit), no new Confirmed issue. The big structural debts (setup fixture, global field id, teardown, API seeding, expect messages) were genuinely fixed; what remains is the leftover tail of the duplication and timeout comments.

### Fix Verification

- Comment 1 — [Partially Fixed] Parallel page-object/path/helper layer. Fixed: wizard class renamed `ProjectionFormsWizardPage` (`create-projection-wizard-page.ts:11`, no more name collision); `projection-forms-ui-paths.ts:7-11` now reuses `TABLE_REGISTRY_UI_PATHS` (weak unescaped builders gone; `TABLE_PROJECTIONS.URL` added to `table-registry-paths.ts:18`). Not fixed: `projection-detail-page.ts:12` `ProjectionDetailPage` and `table-projections-page.ts:11` `TableProjectionsPage` are still standalone `BasePage` classes beside main's `ProjectionDetailsPage`/`TableDetailsPage`; `helpers/create-projection-flow.ts:14-129` still parallels `ui/table-registry/helpers/projection-flow.ts`; the wizard page is still a second wizard page object rather than an extension of `ui/table-registry/pages/create-projection-wizard-page.ts`. No explanation for the parallel module was given.
- Comment 2 — [Partially Fixed] `ProjectionRuntimeRecordPage`. Fixed: `projection-runtime-record-page.ts:15` now `extends BasePage`, uses `PROJECTION_RUNTIME_UI_CONSTS` (shared `ui/base/constants/projection-runtime.values.ts`) and `escapeCssAttribute`. Not fixed: it is still a third runtime page next to `ui/basic-customization/pages/projection-runtime-page.ts` and `ui/document-management/pages/projection-runtime-page.ts`; `RuntimeOperation` is re-declared (`:12`, main has it at `basic-customization/.../projection-runtime-page.ts:11`); inline testids remain (`runtime-current-space-select`, `record-status-tag`, `projection-record-view-versions`, `projection-record-input-*`, `sidebar-company-select`).
- Comment 3 — [Fixed] Stale-group healing. `projection-forms-setup.ts` has no `delay(`, no fallback group, no `console.warn`; tables are created with `createTableAndWait` directly (`:90`, `:190`, `:219`).
- Comment 4 — [Fixed] Hard-coded global field id. `projection-forms-setup.ts:230-231` `linkUserGroupFieldTitle` plus `linkUserGroupFieldId = generateCustomId(...).toUpperCase()`, exposed on the preconditions (`:385`). Note: the specs still pass the literal `'LINK_USER_GROUP'` as the canvas block title (`pf-field-customization.spec.ts:675, 1104-1152`), which only works if the generated id keeps that title; not raised, since it is the field title the UI shows.
- Comment 5 — [Fixed] Teardown. `projection-forms-setup.ts:146-153` and `:399-406` — `createDbClient()` then `connect()` sit inside a `try` with `dbClient.end()` in `finally`; the failure branch (`:160-172`, `:413-425`) is wrapped the same way and a `catch (cleanupError)` handles a throwing cleanup.
- Comment 6 — [Partially Fixed] Provisioning copy-paste. Fixed: shared `provisionLifecycleProjection` (`projection-forms-setup.ts:71`) now serves the worker fixtures (`pf-record-lifecycle.spec.ts:56, 1401`), and `pf-update-projection.spec.ts` no longer holds the 65-line orchestration (no `createTableAndWait`/`inputProjectionDefinition` there). Not fixed: `pf-record-lifecycle.spec.ts:1276-1314` still inlines `createTableAndWait` + `updateTableDefinition` + `inputProjectionDefinition` inside a test, and `:3203` inlines another `inputProjectionDefinition`; `LifecycleProjection` (`:49`) and `FinLifecycleProjection` (`:1394`) are still two identical local types that also equal the exported `LifecycleProjectionHandle` (`projection-forms-setup.ts:59`).
- Comment 7 — [Fixed] State built through the UI. New `helpers/record-seeding.ts` wraps `ProjectionRecordApiClient` (`seedRecordVersions`, `seedHoldDraft`, `authoriseAs`, `reverseRecordViaApi`, `readShareCusData`); used 45× / 8× / 27× / 6× / 2× in the specs. `createProjectionThroughUi` is now only in `pf-assemble-projection.spec.ts` (3 uses, the operation under test).
- Comment 8 — [Fixed] `expect` without message. AST scan of all of `ui/projection-forms` (excluding `expect(async () => ...).toPass` wrappers, which carry the messages on the inner expects) finds 0 `expect(` calls with fewer than 2 arguments, including the previously listed `projection-runtime-record-page.ts`, `projection-detail-page.ts`, `projection-hooks-tab.ts` and `pf-update-projection.spec.ts` lines. The vague messages named at the end of the original comment were not individually re-read.
- Comment 9 — [Partially Fixed] Magic timeouts/literals. Fixed: the 59+5+2+2 inline timeouts dropped to 9; `ui-timeouts.ts` gained named constants (`UI_STATE_SYNC_RETRY_TIMEOUT_MS`, `UI_FAST_RETRY_INTERVALS_MS`, `UI_RECENT_WRITE_READ_RETRY_TIMEOUT_MS`); company codes now come from `TEST_CONSTS.OTHER_COMPANY`/`TARGET_COMPANY` (`pf-record-lifecycle.spec.ts:1194, 1205`; remaining `MOCK`/`MOCK_1` are step titles only). Not fixed (9 literals): `projection-runtime-record-page.ts:124, 130, 190, 225, 229, 255`, `pf-field-customization.spec.ts:323`, `pf-record-lifecycle.spec.ts:1688, 2748`.

### New Findings

[Risk] Duplicate-allureCaseId guard relaxed for 35 ids
scripts/verify-allure-ids.ts:15-23 — `PROJECTION_FORMS_API_AND_UI_IDS` adds 35 Allure ids to `ALLOWED_DUPLICATE_IDS`, so the check no longer fails when the same case id is used twice for these cases. Reasonable only if each id really appears exactly once in `api/` and once in `ui/`; the allow-list also hides a mistaken third reuse or a copy-paste id.
Fix: scope the exemption to exactly one `api` and one `ui` occurrence per id instead of a blanket allow-list.

[Nit] Unused deleteRecordViaApi helper and client method
ui/projection-forms/helpers/record-seeding.ts:111 — `deleteRecordViaApi` has no caller anywhere, and its only consumer is the new `ProjectionRecordApiClient.deleteRecord` (api/system_core/client/projection-record-api-client.ts:59), so both are orphaned by this change.
Fix: remove both until a test needs them.

[Nit] Comments that narrate history or session findings
ui/projection-forms/projection-forms-ui-paths.ts:4-6 and api/types/table-definition.types.ts:21-25 — the first explains what "an earlier duplicate" got wrong, the second records how a shape was "confirmed" in another fixture; neither states a constraint a future reader needs.
Fix: delete both comments (the code and type name already say it).

[Nit] Unrelated package.json script
package.json:19 — `pw:ui` (`playwright test --ui`) is a developer convenience unrelated to TB-3893's scope.
Fix: drop it from this MR or move it to its own change.

### Ready-to-paste GitLab follow-up comment

Structure and duplication
Comment 1
[Confirmed] Parallel page objects and flow helper still duplicate ui/table-registry
ui/projection-forms/pages/projection-detail-page.ts:12 and pages/table-projections-page.ts:11 — ProjectionDetailPage and TableProjectionsPage are still standalone classes next to main's ProjectionDetailsPage and TableDetailsPage, and helpers/create-projection-flow.ts:14-129 still parallels ui/table-registry/helpers/projection-flow.ts (the wizard class rename and the shared paths are fine). Fix: extend or reuse the table-registry page objects and projection-flow, or explain why a parallel module is needed.

Comment 2
[Confirmed] ProjectionRuntimeRecordPage is still a third runtime page
ui/projection-forms/pages/projection-runtime-record-page.ts:12 — it now extends BasePage, but it still re-declares RuntimeOperation (main: ui/basic-customization/pages/projection-runtime-page.ts:11) and the runtime testids (runtime-current-space-select, record-status-tag, projection-record-input-save-draft). Fix: reuse or extend the existing runtime page and move the shared testids and the type into projection-runtime.values.ts.

Comment 6
[Confirmed] Provisioning still inlined and the lifecycle type still duplicated
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:1276-1314 and 3203 — createTableAndWait, updateTableDefinition and inputProjectionDefinition are still written inside tests, and LifecycleProjection (:49) and FinLifecycleProjection (:1394) duplicate LifecycleProjectionHandle from projection-forms-setup.ts:59. Fix: route both through provisionLifecycleProjection and reuse the exported type.

Test quality
Comment 9
[Confirmed] A few magic timeouts remain
ui/projection-forms/pages/projection-runtime-record-page.ts:124, 130, 190, 225, 229, 255; pf-field-customization.spec.ts:323; pf-record-lifecycle.spec.ts:1688, 2748 — inline timeout values are still used although ui-timeouts.ts now has named constants. Fix: replace each with a named constant from ui-timeouts.ts.

New items
Comment 10
[Risk] Duplicate-allureCaseId guard relaxed for 35 ids
scripts/verify-allure-ids.ts:15-23 — the allow-list lets any of these 35 ids repeat any number of times, so a mistaken third reuse would pass. Fix: allow exactly one api and one ui occurrence per id.

Comment 11
[Nit] Unused deleteRecordViaApi and ProjectionRecordApiClient.deleteRecord
ui/projection-forms/helpers/record-seeding.ts:111 — no caller. Fix: remove both until needed.

Comment 12
[Nit] Comments that narrate history
ui/projection-forms/projection-forms-ui-paths.ts:4-6 and api/types/table-definition.types.ts:21 — describe past duplicates and how a shape was confirmed, not a current constraint. Fix: delete them.

Comment 13
[Nit] Unrelated pw:ui script
package.json:19 — outside this MR's scope. Fix: drop it or move it to its own change.
