# MR 302 — TB-3894 Access Administration UI — Cosmetic Analysis

Reviewed 2026-10-02: 14 changed files, 3696 added / 18 removed lines, 7 commits, every line noted (smoke 1-1934, regression 1-1191, four helpers, eight page-object/script files).

Checked and clean: tag arrays (`['@smoke_m2','@ui']`, `['@regression_m2','@ui']`) match the live taxonomy; nested Story describes present; `TC-N` equals `allureCaseId(N)` for all single-ID tests; quote style consistent; no unused imports.

## Confirmed Issues

[Confirmed] Comments in spec/script files (blocking zero-comment rule)
smoke.spec.ts:199, 333, 472, 635, 840, 1054, 1261, 1430, 1508, 1515, 1621, 1767; regression.spec.ts:393, 553, 676, 810, 946, 1097, 1155 (`// eslint-disable-next-line playwright/no-wait-for-timeout`); ui/customization/components/add-new-field-modal.ts:79 (same directive); scripts/verify-allure-ids.ts:25-26 (two-line group header) — coding-standards.md: no comments, period. The directives exist only to silence the sleeps they sit above.
Fix: Delete the comments together with the `waitForTimeout` calls (replace with condition waits); remove the header lines (rationale belongs in README).

[Confirmed] `expect(...)` without an assertion message
smoke.spec.ts:194, 328, 467, 630, 835, 1049, 1256, 1425, 1616, 1762; regression.spec.ts:388-390, 548-550, 671-673, 805-807, 941-943, 1092-1094; helpers/create-table-group-modal.ts:20, 33-34; helpers/create-table-modal.ts:43, 120, 132, 134 — `toBeEnabled`/visibility/`aria-checked`/closed checks lack a message (testing-standards.md: messages mandatory).
Fix: Add a message stating the expected state and why.
Example:
    await expect(
      tableDetailsPage.addFieldModal.addFieldButton,
      'Add New Field must be enabled once the table is created',
    ).toBeEnabled({ timeout: 120_000 });

[Confirmed] Provenance and unresolved placeholders in step titles
smoke.spec.ts:1839 (`STEP 1 (TC-3066)`), :1871, :1890 (`TC-3070`) cite case ids; `<fin_record_id>` at 221, 230, 496, 509, 658, 667, 712, 863, 872, 926, 1077, 1086, 1135, 1283, 1305, 1325, 1335, 1341, 1452, 1474, 1494, 1519, 1791, 1804, 1839, 1890; `TC-LOCK-01` at 355, 364 (not the record used); regression.spec.ts:415, 457, 466, 575, 584, 591, 1119, 1161 (`<fin_record_id>`/`<record_id>`) — copied from the manual case; read as unfinished sentences.
Fix: Plain behavioral wording ("the record"), no ids in step titles.
Example:
    'STEP 1: As user_a, open the record under INPUT — the intent is created'

[Confirmed] Magic timeouts instead of existing constants
smoke.spec.ts:133, 268, 402, 566, 771, 985, 1194, 1362, 1560, 1696 and regression.spec.ts:326, 492, 614, 748, 884, 1035 (`test.setTimeout(900_000)`); smoke `timeout: 120_000` (195, 329, 468, 631, 836, 1050, 1257, 1426, 1617, 1763), `60_000` (207, 341, 480, 643, 848, 1062, 1269, 1438, 1629, 1775), `waitForURL … 30_000` (217, 351, 491, 653, 858, 1072, 1279, 1448, 1639, 1786); create-table-modal.ts:20, 43, 134 (30_000), :90 (150), :132 (15_000); create-table-group-modal.ts:20, 34; table-details-page.ts:50, 59, 73, 82, 84, 91; deploy-fields-modal.ts:24; projection-runtime-page.ts:60; add-new-field-modal.ts:77, 80, 101, 108; create-projection-wizard.ts:56 — ui/base/constants/ui-timeouts.ts already defines `UI_PRECONDITIONS_TIMEOUT_MS` (900_000), `UI_DROPDOWN_SETTLE_MS` (150), `UI_MODAL_VISIBLE_TIMEOUT_MS` (15_000), `UI_MODAL_OPEN_RETRY_TIMEOUT_MS` (30_000), `UI_DROPDOWN_SEARCH_TIMEOUT_MS` (60_000).
Fix: Import the existing constants; add named ones only where no value fits.

[Confirmed] In-file duplication of blocks and literals
smoke.spec.ts setup 143-219 … 1711-1789, user_b session 509-538 … 1804-1833, intent POST wait (231, 365, 520, 668, 723, 873, 937, 1087, 1146, 1306, 1475, 1644, 1815, 1840, 1891), intent DELETE wait (692, 897, 1111, 1873), `'QA automated value'` (226, 360, 501, 663, 698, 868, 1082, 1288, 1457, 1796); regression.spec.ts setup 363-413 … 1067-1117, intent-wait block 425-438, 708-725, 844-861, 995-1012, 1129-1148, `'QA automated value'`/`existingValue` (420, 580, 621, 755, 891, 1124) — verbatim repeats.
Fix: Extract helpers (detail in the logical review) and one constant for the field value.

[Confirmed] Ad-hoc unique ids instead of dynamic-name generators
smoke.spec.ts:137-139, 272-274, 406-408, 570-572, 775-777, 989-991, 1198-1200, 1366-1368, 1564-1565, 1700-1702; regression.spec.ts:330-331, 496-497, 618-619, 752-753, 888-889, 1039-1040 — `aqa-fin-table-${generateUniqueSuffix()}` and `TEST_FIELD_${…}`.toUpperCase() hand-built although `generateDynamicTable`/`generateDynamicField` exist; record ids use `generateCustomId` where `generateCustomRecordId(prefix)` (dynamic-name-generator.ts:86) exists.
Fix: Use the dedicated generators (adjust if the UI technical-name derivation needs the display form).

[Confirmed] Two Allure ids in one test title
regression.spec.ts:318-324 (`TC-3074, TC-3075`), smoke.spec.ts:125, 1688 (`TC-3057, TC-3064`, `TC-3066, TC-3070`) — TC prefix must equal a single `allureCaseId(N)`; one Allure case = one test.
Fix: Split into one test per case sharing the setup helper.

[Confirmed] Placeholder commit messages
b91f2f80, e411ef80, f39541c2 ("Access administration draft", identical text three times), a640c1b4 ("Access administration UI draft"), 54ec475b ("Access Administration smoke and regression UI"), de6beec6 ("…conflict resolving") — no `TB-3894:` prefix, "draft" states neither what nor why (sibling: "TB-4197: Implemented small fixes").
Fix: Squash/reword into `TB-3894: <what and why>`.

[Confirmed] Repeated `.ant-table-row` + hasText locator
ui/customization/pages/table-details-page.ts:65-67, 94-96, 104-108 repeat pre-existing `assignedFieldRow` at :164-166; table-registry-page.ts:23-25 is the same pattern.
Fix: One private `tableRow(text)` helper.
Example:
    private tableRow(text: string): Locator {
      return this.page.locator('.ant-table-row').filter({ hasText: text });
    }

## Possible Risks

[Risk] Swallowing catches without logging
projection-runtime-page.ts:62, create-projection-wizard.ts:58, create-table-group-modal.ts:36 (`.catch(() => false)`), add-new-field-modal.ts:110-112 (error stored, never logged) — repo rule: every catch logs or rethrows.
Fix: `console.debug` the swallowed reason or rethrow.

## Nice-to-Have Improvements

[Nit] Naming/title drift — smoke.spec.ts:40 describe lacks the `<Feature> - Smoke Tests` suffix; titles mix "Verify …" and fragments (smoke 47, 90, 125, 563, 1557; regression 52, 117, 158, 201, 251, 318, 489, 611, 745, 881, 1032); step labels drift (smoke 1305 lowercase `on tab 1`, 1791/1804 vs 189, 1643 `STEP 1-2:`, 143 `PRECONDITION: SEE …` jargon, 313 "INT-class" vs 1599 "Installation-class", 1341 `CHECK (API)`). Fix: one phrasing and label scheme.
[Nit] Local naming — `WHEEL_STUCK_THRESHOLD` upper-case inside a method (create-table-modal.ts:71, add-new-field-modal.ts:61; module scope per antd-virtualized-dropdown.ts:13-17); `tableDetailsPageEnquiry`/`tableRegistryPageEnquiry` (regression 444, 447); `validationErrors` plural for one locator (keycloak-update-password-page.ts:13, 20); `nextStepButton`/`nextStep` vs sibling `primaryActionButton`/`goToNextStep` (create-projection-wizard.ts:10, 19). Fix: camelCase/singular/sibling vocabulary.
[Nit] `rowSignature` untyped (add-new-field-modal.ts:58). Fix: `(): Promise<string>`.
[Nit] Public surface wider than needed — add-new-field-modal.ts:11, 20; table-details-page.ts:15-18, 34-37. Fix: `private readonly` or delete.
[Nit] Truthy assertion on a boolean — smoke.spec.ts:1664-1667. Fix: `toMatch(/^INPUT\s+\S/)`.
[Nit] Number literal style — password-reset-flow.ts:60-61 (`15000`, raw intervals). Fix: `15_000`, `UI_DEFAULT_RETRY_INTERVALS_MS`.
[Nit] File name wider than content — track-created-resources.ts exports only `trackTableGroupByName`. Fix: rename `track-table-group.ts`.
[Nit] Allure whitelist — verify-allure-ids.ts:27-39 unordered and each comment repeats the id. Fix: sort ascending, drop the `TC-<id> —` prefix.
[Nit] New page object does not extend `BasePage` — create-projection-wizard.ts:3 (resolved by reusing the existing wizard). 
[Nit] Duplicated runtime locators across page classes — projection-runtime-page.ts:41-42, 86-88 vs ui/document-management/pages/projection-runtime-page.ts:69, 87-88 (pre-existing, extended). Fix: shared base page.
[Nit] Near-identical password literals (smoke.spec.ts:63, 103), unchecked `userB` cast (514, 717, 931, 1140, 1809), `test.use` mid-describe (regression 153-155) — see logical review.

## Exhaustiveness

Every line of the 14 changed files received a working note; repeated violations collapsed with every `file:line` enumerated. `table-registry-page.ts` (additive, consistent) and `deploy-fields-modal.ts` (timeout-constant item only) have no further findings after confirmed full coverage. Nothing executed.
