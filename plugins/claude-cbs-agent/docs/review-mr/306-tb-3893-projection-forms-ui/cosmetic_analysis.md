# Cosmetic Analysis — MR 306 (TB-3893: Test implementation: Projection Forms & UI Framework - UI)

Reviewed 2026-10-02 against `origin/main`, MR head 9d4a66e6. Static review only. Finding numbers match the chat list and `logical_analysis.md`. Commit messages: "TB-3893: Test implementation: ..." (x2), "New tests", "Stabilize Projection Forms record-lifecycle tests, fill CSV coverage gaps, encapsulate locators" — "New tests" is a placeholder-style message (what and why missing).

## Confirmed Issues

### 12. [Confirmed] Unused exports and public members
See Orphaned Code in `logical_analysis.md` (values, scenarios, types, paths, page and component members; plugin-manager additions). Two lists encode the same data twice: CONFIRMATION_OPERATIONS (values.ts:23-30) vs CONFIRMATION_MESSAGE_OPERATIONS (scenarios.ts:22), `FieldBehavior`/`VariableDefaultValue` types vs the `as const` arrays (types.ts:25,38 vs values.ts:39,41).
Fix: delete the unused exports and derive each type from one `as const` array.

### 13. [Confirmed] Duplicate entry in the eslint `assertFunctionNames` list
eslint.config.mjs (list under `playwright/expect-expect`) — `'assertDisplayed'` now appears twice (the original entry plus the one added by the MR). The removal of the second `'assertDispoOfficerInputRejected'` was a harmless duplicate cleanup. The ~28 added names are registered globally, so any method elsewhere with the same name silently counts as an assertion.
Fix: drop the duplicate `'assertDisplayed'` and confirm each added name exists exactly once in ui/projection-forms.

### 35. [Confirmed] `expect(...)` without a message argument
pf-record-lifecycle.spec.ts:895, 903, 906, 907, 908, 986, 993, 1000-1002, 1006, 1011-1014, 1032, 1037, 1038, 1048-1052, 1056-1058, 1061-1063, 1066, 1068, 1134, 1139, 1140, 1149, 1150, 1157-1160, 1163, 1167, 1231, 1247, 1253, 1261, 1267, 1369, 1372-1376 (also the expect-less `toPass` blocks 1241-1248, 1258-1264), 1981, 2787, 2834, 2842-2845, 2863, 2884, 2902, 3492, 3493; pf-update-projection.spec.ts:1026-1028, 1123-1128, 1178-1180; projection-runtime-record-page.ts:83, 107, 115, 124, 176, 179, 184; projection-detail-page.ts:131 and projection-hooks-tab.ts:164-166 (toast waits); vague messages in page objects ('Require toggle', 'Authorization Required toggle', 'Canvas block count', 'Auto-generated Projection ID'); pf-field-customization.spec.ts:1172-1181 message 'LINK_USER_GROUP block'.
Fix: add a descriptive message stating the expectation to every expect.

### 36. [Confirmed] Multi-line and provenance comments; provenance in step names
ui/base/constants/ui-timeouts.ts:12-17 (6-line comment with "confirmed live"), api/types/table-definition.types.ts:21-26 (6-line comment citing a fixture file name, "confirmed via" and UI path text), pf-assemble-projection.spec.ts:375-383 (step "not stripped (defect)"), :598 (title 'TC-4029' used as projection data), pf-field-customization.spec.ts:1143-1158 (long step title/message citing AC4 and CSV) — repo rule: no comment or a single short WHY sentence, no provenance in step names/messages.
Fix: delete the comments or reduce each to one short WHY sentence; use behavioural step names and neutral test data.

### 37. [Confirmed] Magic timeouts, intervals, company codes and field literals where constants exist
Retry window `{ timeout: 20_000, intervals: [2_000, 3_000, 5_000] }` 44 times in pf-record-lifecycle.spec.ts (3105, 3116, 3158, 3508, 3762, 3794, 3808, 4152, 4172, 4279, 4375, 4446, 4469, 1725, 1869, 1940, 1960, 2038, 2173, 2243, 2306, 2319, 2382, 2406, 2446, 2501, 2529, 2569, 2611, 2625, 2644, 2686, 2699, 2716, 2759, 2774, 2860, 2881, 2967, and others) plus 10_000/15_000/40_000/60_000 at 78, 1003, 1014, 1039, 1053, 1092, 1141, 1151, 1161, 1163, 1248, 1264, 1325, 1586, 2903; pf-view-projection-details.spec.ts:101-104, 145-148, 191-194, 263-266; pf-update-projection.spec.ts:1029-1032; pf-field-customization.spec.ts:396; projection-runtime-record-page.ts:83, 88, 108, 137, 175-177, 197; projection-designer-canvas.ts:180, 233; `UI_DEFAULT_RETRY_INTERVALS_MS` already exists (ui-timeouts.ts:4). Company codes 'MOCK'/'MOCK_1' (lifecycle 1224, 1238, 3299, 3314, 3329, 3353, 3434, 3440, 3446, 4190, 4219, 4254, 4270, 4294, 4332, 4347, 4362, 4406, 4421, 4436) where `TEST_CONSTS.OTHER_COMPANY`/`TARGET_COMPANY` exist. Field ids 'INT_FLD1' (41), 'SYS_FLD1' (1280), 'FIN_FLD1' (1400, 3536), 'LINK_USER_GROUP' (pf-field-customization 745, 746, 1174-1258), 'Name Group' (262, 351, 1128, 1149), 'SYS' type (1295), `spaces: ['LIV','HIS']` (1297), maxLength 120 x6, 'en-GB' at ~82 vs `LANGUAGE_ID`. Hook/mask/language/operation literals where constants exist: 'INPUT', 'AUTH', 'Pre-Hook', 'Post-Hook' (update 54-55, 309-310, 356-357, 370-371, 401-407, 435), 'DD/MM/YYYY', 'MM/DD/YYYY' (684, 692, 707), 'French'/'Spanish' display names (972, 1003, 1047), 'FR-FR' vs 'fr-FR' (783), operation lists at pf-assemble 474-478 and pf-view 125-126 (`PROJECTION_FORMS_CONFIRMATION_OPERATIONS` exists); projection-settings-tab.ts:41 default 'INPUT', untyped `operation: string` at :26-68.
Fix: one named poll config in ui-timeouts.ts used with `UI_DEFAULT_RETRY_INTERVALS_MS` (ideally via a `pollUntil` helper), constants-keeper company codes, preconditions-exposed field ids, and the existing projection-forms values.

### 38. [Confirmed] Describe structure and tags do not follow the Story convention
pf-record-lifecycle.spec.ts:135-138, 1502-1505, 3619-3622, 4080-4083; pf-field-customization.spec.ts:49-52 and nested 195, 358, 406, 469, 603, 752, 835, 903, 1061, 1118, 1164, 1262; pf-update-projection.spec.ts:26-27 and 16 inner describes (32, 88, 184, 232, 294, 440, 531, 667, 712, 762, 845, 894, 961, 1075); pf-assemble-projection.spec.ts:26, 140, 245, 275, 388, 532, 584; pf-view-projection-details.spec.ts:12, 45, 110, 154, 227; pf-projection-runtime.spec.ts:8-10 — outer describes are feature names, inner ones read 'US-1.06.01 | <sub-feature>' with an unpadded id (main uses zero-padded 'US-01.15.02 | ...'), one Story is split into up to 16 sibling describes, the lifecycle and runtime specs have none. `@smoke_m2` is applied to the whole lifecycle file including multi-minute multi-user flows. `mode: 'default'` is a no-op (pf-record-lifecycle 139, 1506, 3623, 4084; pf-assemble 24; pf-view 10; pf-field-customization 53).
Fix: one `US-01.06.xx | <Story title>` describe per Story (ids to be confirmed with the BA, as they were not resolvable from Confluence) with topical describes nested inside; keep `@smoke` only on genuinely smoke tests (3965/3966/3974).

### 39. [Confirmed] Duplicate import, dead binding and awkward constructs
pf-record-lifecycle.spec.ts:12-15 (two imports from the same dynamic-name-generator module), pf-field-customization.spec.ts:157-171 (`const detailPage = ...; void detailPage;`), 1374-1384 (id string built then `split('~')[1]`; other tests use `getProjectionIdValue()`), 692 (raw `.locator('input')`), 95-96, 153 (`groupFieldsUnderCollapsibleHeader` only adds and fills a Heading — misleading name), describe-level `let designer/detailPage` reassigned inside tests (199-201, 607-611, 755-759, 839-843, 907-911, 1168-1170, 1266-1271), actions outside `test.step` (993, 1203-1215, 1253-1259); pf-update-projection.spec.ts:196-200, 208-215, 244-247, 306-312, 767-773, 816-818, 856-863, 1087-1095; `toBeChecked` via if/else instead of `toBeChecked({ checked })` (create-projection-wizard-page.ts:132-141, field-properties-panel.ts:197-204, projection-designer-canvas.ts:215-221); redundant aliases `this.tab = this.root` / `panel = root` (projection-associations-tab.ts:13, projection-settings-tab.ts:13, projection-rule-builder.ts:16, field-properties-panel.ts:52), `RuntimeOperation | 'SEE'` (runtime page :57), `title: string = '…'` (canvas :233), `headingByText` is a plain `getByText` (:67); raw `page.reload()` mixed with `runtimePage.page.reload()` (lifecycle 1736, 2154, 2237, 2294, 2312, 2375, 2395, 2415, 2604, 2619, 2631, 2680, 2693, 2705, 2938).
Fix: merge imports, drop the dead binding, wrap phases in steps, use `toBeChecked({ checked })`, add `runtimePage.reload()`, rename the misleading helper.

## Possible Risks

None beyond the logical findings.

## Nice-to-Have Improvements

### 10. [Nit] Out-of-scope shared-file edits
.husky/pre-commit:1-3 removes the shebang and `husky.sh` sourcing; safe on husky ^9 but unrelated to TB-3893, not mentioned in the commits, and `.husky/pre-push` on main still has the old form so the two hooks now disagree (`prepare` is still `husky install`). package.json:19 adds `"pw:ui": "npx playwright test --ui"`, unreferenced and, without `--project`, runs every project including API.
Fix: revert, or move to its own commit/ticket (apply to both hooks); drop `pw:ui` or rename to `test:ui:debug` with `--project=UI-Chromium`.

### 40. [Nit] Titles, wording and ordering inconsistencies
pf-record-lifecycle.spec.ts:3626, 3657, 3692, 3824, 3869, 3222 (no `[CLASS][OP]` prefix; 'Confirmation Message:' style; non-ASCII arrow at 3657), 3679, 3683 (curly apostrophes), 3681-3684 (redundant `not.toContainText` after `toContainText`), 599 and ~1550 ('authorisation' vs 'authorization'), quote style inconsistent in messages, 4460, 4471, 4486 (`enterRecordId` three times in a row), 4488-4490 (`arrayContaining` vs exact `toEqual` at 3136, 4171), 4094-4097, 4194-4197, 149-152, 1517-1520 (repeated "Record should not exist yet" block), 1089-1092 (message describes setup), 1496 and 1163/1092 (10_000 inline), steps wrapped in some tests and not in others (field-customization 1562..2979 pattern, lifecycle 1845-1857); pf-projection-runtime.spec.ts:14-507 (tests ordered 4578..4585, 4589, 4591, 4575, 4576, 4586, 4587, no feature grouping), 169, 204, 218, 312, 326, 460, 491, 505 ('locked_default' casing; values repeated in setter and expect), 252-254, 293-295 (`''` on its own line); table-projections-page.ts:36 (access assumption in a message); pf-update-projection.spec.ts:783 ('FR-FR'), 429-431, blank lines mid statement runs 474, 503, 777, 782, 1091; pf-assemble-projection.spec.ts:93 (step "click/delete/type" vs behaviour); create-projection-wizard-page.ts:98-101.
Fix: align titles with the `TC-N: [CLASS][OP] sentence-case` convention, ASCII quotes, one spelling, and a local const where a value repeats.

## Necessity Citations / Orphaned Code

See `logical_analysis.md`.

## Changelog

- 2026-10-02 — initial analysis (this file).
