# MR 302 — TB-3894 Access Administration UI (smoke + regression) — Logical Analysis

Reviewed 2026-10-02. Lenses: Senior Full Stack AQA + AQA Lead. Solution Architect lens not mandatory (no `api/utils/**` file in the diff); whole-repo blast-radius still run for changed pre-existing page-object methods.

## Summary

MR adds UI automation for the Access Administration epic (TB-20): `ui/access-administration/tests/access-administration-smoke.spec.ts` (12 tests, 1934 lines), `access-administration-regression.spec.ts` (1191 lines), four helpers (create-table-modal, create-table-group-modal, password-reset-flow, track-created-resources), a new `CreateProjectionWizard`, extensions to Customization/Basic-Customization/Keycloak page objects, and 13 ids added to the `ALLOWED_DUPLICATE_IDS` whitelist in `scripts/verify-allure-ids.ts`. TB-3894 has no description, AC or links, so intent was derived from commits and usage. Commits make no verification claims. Known-issue cross-check: no documented anti-pattern was reintroduced beyond the Definition-of-Done "no arbitrary sleeps" rule; nested Story describes, tag arrays and TC-N/allureCaseId match the documented resolutions.

Main risks: (1) two pre-existing shared methods (`AddNewFieldModal.addDraft`, `DeployFieldsModal.deploy`) changed behavior for Customization specs outside this MR; (2) ~20 minutes of fixed `waitForTimeout` sleeps; (3) wholesale copy-paste setup (10 + 6 tests) and duplicated page objects/dropdown logic instead of reuse; (4) several tests whose assertions cannot fail on the behavior in their title.

## Confirmed Issues

[Confirmed] New CreateProjectionWizard duplicates the existing CreateProjectionWizardPage
ui/customization/pages/create-projection-wizard.ts:1-66 — Re-implements the wizard already in ui/table-registry/pages/create-projection-wizard-page.ts (same test ids `basic-step-title-input`, `basic-step-operation-day-policy`, `create-projection-next-button`; used by ui/table-registry/helpers/projection-flow.ts). Hand-rolls the Operation Day dropdown (24-31) instead of `AntdVirtualizedDropdown.selectComboboxOption`; does not extend `BasePage`.
Fix: Reuse `CreateProjectionWizardPage` and add only the missing pieces (authorization switch, retrying create) to it.

[Confirmed] Add New Field dropdown scrolling re-implements AntdVirtualizedDropdown
ui/customization/components/add-new-field-modal.ts:46-96 — `selectSearchedOption` now has its own wheel/ArrowDown scroller, row-signature stuck detection and a 150 ms `waitForTimeout` behind an eslint-disable. `ui/base/interactions/antd-virtualized-dropdown.ts` already provides option lookup, page-down and scroll-to-top. Replaces a former condition poll with a `Date.now()` loop plus fixed sleep.
Fix: Delegate to `AntdVirtualizedDropdown` (extend it with the wheel fallback if truly needed); keep the modal method a thin call.

[Confirmed] create-table-modal reinvents the same virtualized-dropdown search (third copy)
ui/access-administration/helpers/create-table-modal.ts:54-106 — `selectGroupOption` is another bespoke scroll/match loop with its own sleep (89-90) and magic thresholds; `ChangeGroupModal` already selects groups from the same kind of dropdown.
Fix: Delegate to `AntdVirtualizedDropdown` / the ChangeGroupModal group select.

[Confirmed] Arbitrary sleeps (90 s x 16, 30 s, 3 s) hidden behind eslint-disable
smoke.spec.ts:200, 334, 473, 636, 841, 1055, 1262, 1431, 1622, 1768 (90_000), :1509 (30_000), :1516 (3_000); regression.spec.ts:393-394, 553-554, 676-677, 810-811, 946-947, 1097-1098 (90_000), :1155-1156 (3_000) — fixed sleeps stand in for "draft field ready to deploy"; they violate DoD "no arbitrary sleeps" and were silenced 19 times. ~24 minutes of pure waiting, still no guarantee on a slow environment.
Fix: Poll the real readiness signal (e.g. `deployFieldsButton` enabled via `expect(...).toBeEnabled({ timeout })` / `expect.poll`) inside one shared helper; for TC-3067/3079 poll `listRecordLocks` until `expiresAt` advances.

[Confirmed] Setup block copy-pasted into 10 smoke tests and 6 regression tests
smoke.spec.ts:143-219, 278-353, 416-494, 579-656, 784-861, 998-1075, 1205-1281, 1374-1450, 1569-1641, 1711-1789 (+ user_b session 509-538, 712-744, 926-958, 1135-1167, 1804-1833; intent POST/DELETE waits; `finally` cleanups); regression.spec.ts:363-413, 523-573, 646-696, 780-831, 916-966, 1067-1117 — ~50-75 identical lines (group, table, field, deploy, 12-call wizard, runtime open) per test. A selector change needs 16 edits. TC-3076/3077/3078 (regression 611-1029) are three line-for-line copies differing only in seeding.
Fix: Extract `setupLockProjection({ classification, authRequired, autoId })`, `openIntentAs(page, op, recordId)` and a second-user helper into ui/access-administration/helpers/; drive TC-3076/77/78 from one step helper taking a seed function.

[Confirmed] "record_lock exists for user_a / user_b" never asserts the owner
smoke.spec.ts:254-256, 388-390, 540-542, 687-689, 892-894, 1106-1108, 1835-1837 — step titles name the lock owner but the body only calls `assertActiveRecordLock(...)` and discards the result; TC-3059's check at :541 passes for any holder. Owner is asserted elsewhere in the same file (746-753, 960-967, 1169-1176, 1341-1347, 1862-1869, 1914-1920), so the helper does return it.
Fix: Capture the returned lock and `expect(lock.userId, ...)` equals the expected user, or reword titles to "a record_lock exists".

[Confirmed] TC-3072 claims "browser Back" but clicks the in-app Back button; weak final assertion
smoke.spec.ts:982, 1110, 1117, 1125-1128 — `clickBackButton()` clicks a UI control (projection-runtime-page.ts:45, 94); no `page.goBack()` is performed. The final `page.url()` read is synchronous right after the DELETE response (flaky) and `not.toBe(runtimeUrl)` accepts any navigation.
Fix: Use `page.goBack()` for the browser-Back case or rename the test/step; replace with `await expect(page).not.toHaveURL(runtimeUrl)`.

[Confirmed] TC-1639 never asserts what its title promises
regression.spec.ts:117, 136-146 — Title: "blocks the immediately previous password but allows the one before it"; body only resets back to the original password and checks the dashboard loads. No negative step submits the previous password and expects rejection; the temporary user never set that password, so no history entry exists.
Fix: Add a step submitting the immediately previous password and asserting the Keycloak rejection, or retitle and mark the missing half Not Automatable.

[Confirmed] TC-1638 passes for any history depth
regression.spec.ts:52, 61-109 — P1 is reused only after P2 and an admin-generated T1, i.e. three entries back; per TC-1639's own title it is allowed at depth 1 and 2 too, so `PWD_HISTORY_DEPTH=0` is not what makes the final step pass.
Fix: Reuse the immediately previous password (P2) at depth 0, so depth is the only variable.

[Confirmed] PWD_HISTORY_DEPTH changed on shared SYSTEM.PARAMETER and never restored
regression.spec.ts:62-68, 125-131 — writes depth 0 and 1 to the single SYSTEM record used by every worker (API and UI projects share one `workers:` budget). The API regression spec restores in afterEach (api/security_management/tests/access-administration-regression.spec.ts:77-80); this file does not.
Fix: Capture the state returned by `inputSystemParameterWithState` and restore it in `finally`/`afterEach` (or a shared fixture).

[Confirmed] Regression TC-3079 duplicates smoke TC-3067
regression.spec.ts:1031-1189 vs smoke.spec.ts:1358-1554 — same table/field/projection, INPUT intent, 30 s wait, focus, then one lock / same user / later `expiresAt` (regression 1161-1182 vs smoke 1524-1544); smoke only adds a Record Locks tab reload. Two ~170-line tests with 10+ min setup each.
Fix: Keep one, or differentiate the regression case by a distinct trigger.

[Confirmed] Regression TC-1639 / TC-1638 step 2 duplicate smoke TC-1511 reset-and-change flow
regression.spec.ts:137-144, 91-98 vs smoke.spec.ts:106-113 — each calls `resetPasswordViaUi` and asserts only that the dashboard loads.
Fix: Fold into a real history check (see TC-1639) rather than another reset-success path.

[Confirmed] TC-3074 step claims four columns but checks two
regression.spec.ts:457-459 — step lists RecordID/UserID/CreatedAt/ExpiredAt; `assertRecordLockVisible` (table-details-page.ts:69-78) asserts only row visibility and userId.
Fix: Assert CreatedAt/ExpiredAt cells are non-empty (or equal the API lock's values), or drop them from the title.

[Confirmed] Stale record id in TC-3029 step titles
smoke.spec.ts:355, 364 — titles name `TC-LOCK-01` while the body uses generated `recordId` (:274).
Fix: Reword to "the record".

## Possible Risks

[Risk] DeployFieldsModal.deploy() now waits for the confirm modal to close — affects a negative-path caller outside the MR
ui/customization/components/deploy-fields-modal.ts:24 — added `not.toBeVisible({ timeout: 15_000 })`. External callers: customization-smoke.spec.ts:407 (happy path, likely unchanged) and customization-regression.spec.ts:900 (forced deploy that must be rejected, then asserts `genericErrorNotification`). Nothing shows the modal closes when the backend rejects; if it stays open, `deploy()` throws before the error-toast assertion, breaking an untouched test.
Fix: Confirm the modal closes on the rejected-deploy flow, or leave `deploy()` unchanged and put the wait in an access-administration-specific step.

[Risk] addDraft() behavior changed for the two pre-existing callers
ui/customization/components/add-new-field-modal.ts:119-124 — now retries search+select up to 60 s and clicks `modal.getByText('Field', { exact: true })` before submit. External callers customization-smoke.spec.ts:404 and customization-regression.spec.ts:899 both execute the new click; if the exact label is absent or ambiguous those tests fail on a locator timeout. Purpose of the click is undocumented.
Fix: Verify the label is unique in customization flows, or replace the click with an explicit dropdown-closed check.

[Risk] searchAndSelect spins without back-off and swallows every error
add-new-field-modal.ts:71, 105-113 — `listHolder.count() === 0` throws immediately, the catch loops straight back for up to 60 s with no delay, and every error type (closed page, detached modal) is swallowed.
Fix: Wait for the dropdown, add `UI_DROPDOWN_RETRY_DELAY_MS` between attempts, rethrow non-timeout errors.

[Risk] create() re-clicks Create Projection and swallows the first failure
create-projection-wizard.ts:49-65 — a second click can submit a duplicate projection; two 120 s attempts exceed `UI_TEST_TIMEOUT_MS` (120_000); success check is a hardcoded regex (56) instead of `TABLE_REGISTRY_UI_PATHS.PROJECTION_DETAILS.URL_PATTERN`; `.catch(() => false)` drops the reason.
Fix: Assert a visible error state before retrying, use the shared URL pattern, log or rethrow.

[Risk] Row locators match by substring and are page-wide
table-details-page.ts:65-67 (recordLockRow), :94-96 (projectionRow) — `hasText` matches REC_1 vs REC_10 (strict-mode violation or wrong row for Release/Runtime clicks); the table-registry `TableDetailsPage.projectionRow` uses exact `data-row-key`.
Fix: Match the exact cell/data-row-key value and scope to the visible table.

[Risk] enterRecordId presses Enter unconditionally and hides suggestion failure
ui/basic-customization/pages/projection-runtime-page.ts:53-67 — presses Enter even after clicking the `Use "<id>"` suggestion and even when the suggestion never appeared (8 s swallowed by `.catch(() => false)`).
Fix: Press Enter only in the no-suggestion branch; use a named timeout.

[Risk] Layer choice: lock journeys rebuilt through the UI at 10-15 min each
smoke.spec.ts:264-1685 (8 tests), regression.spec.ts:326, 492, 614, 748, 884, 1035 — `scripts/verify-allure-ids.ts` itself documents these ids as "automated twice, API and UI"; the UI tests verify via `listRecordLocks` and build group/table/field/projection through the browser each time, with `setTimeout(900_000)` under `@smoke_m2`. Setup failures surface as lock failures.
Fix: Seed group/table/field/projection through system_core API helpers or a per-Story fixture; keep only the runtime interaction in the UI; reconsider smoke vs regression placement.

[Risk] Preconditions not verified before the next step
smoke.spec.ts:221-228, 355-362, 496-503, 658-665, 863-870, 1077-1084, 1283-1290, 1452-1459, 1791-1798 — "record exists (LIV)/(pending AUTH), currently unlocked" is `saveRecordButton.click()` with no response wait or "unlocked" check; the next step re-enters the same id and races the save.
Fix: Await the record-input response or `assertCurrentSpace`/`waitUntilSettled`, and assert `listRecordLocks` is empty.

[Risk] AUTOLOG_TIME_MINS precondition asserted truthy and never used
smoke.spec.ts:143-146, 278-281, 416-419, 579-582, 784-787, 998-1001, 1205-1208, 1374-1377, 1711-1714; regression.spec.ts:337-340 — not compared with the ~15 min lock assertion (access-administration-helper.ts:391-396) or the 30 s wait in TC-3067/3079.
Fix: Use the value (assert `expiresAt - createdAt`, bound the wait) or drop the step.

[Risk] TC-1654 title promises enforcement, body proves the happy path
smoke.spec.ts:46-85 — policy values read (55-57) but never related to `newPassword` (63); no rejected non-compliant password.
Fix: Validate the password against the fetched policy and add a rejection step, or retitle.

[Risk] TC-3062 asserts very little for an auto-generated recordID
smoke.spec.ts:1643-1679 — input emptiness never verified; one-shot `textContent()` right after `waitUntilSettled()` (1662-1673), `toBeTruthy()` on a boolean.
Fix: Retrying `toHaveText(/^INPUT \S+/)`, assert id pattern, save and verify the record exists.

[Risk] Two Allure cases bound to one test (and TC-3074/TC-3075)
smoke.spec.ts:124-131 (3057+3064), :1687-1694 (3066+3070); regression.spec.ts:318-324 (3074+3075) — one failure marks two cases; 3066/3070 is a 7-step chain.
Fix: Split into one test per case sharing the setup helper, or confirm with BA they are one scenario.

[Risk] TC-3059 is a strict subset of TC-3066/3070
smoke.spec.ts:398-560 vs :1687-1932 — both create a pending-AUTH record, have user_b open AUTH and authorize to LIV; ~3 minutes of repeated UI flow.
Fix: Share the helper or reduce 3059 to intent creation.

[Risk] Non-nested cleanup in finally
smoke.spec.ts:549-558, 754-763, 968-977, 1177-1186, 1921-1930 — `contextB.close()` / `deleteDashboardUser` precede `cleanupCreatedFields` / `adminContext.dispose()` in one sequence; a throw skips the rest.
Fix: Own try/finally per step or a cleanup helper that runs all and rethrows once.

[Risk] Field cleanup runs before the table that holds the field is dropped
regression.spec.ts:482, 604, 738, 874, 1025, 1185 — deleting an in-use field likely fails; ui/field-registry/fixtures/field-registry-setup.ts:192-198 swallows it with console.error, leaving orphan fields.
Fix: Drop the table first or fail the cleanup loudly.

[Risk] TC-3079 proves prolongation via focus() with the cause unverified
regression.spec.ts:1150-1182 — if prolongation is a heartbeat the focus is irrelevant; "less than AUTOLOG_TIME_MINS" never checked.
Fix: Assert the second intent request actually fired and read AUTOLOG_TIME_MINS to bound the wait.

[Risk] Lockout status read once without polling
regression.spec.ts:273-297 — single `seeInternalSmUserStatus` after the last failed login and after unlock.
Fix: `expect.poll` with `UI_DEFAULT_RETRY_INTERVALS_MS`.

[Risk] test.use applies to the whole describe but sits mid-file
regression.spec.ts:153-155 — TC-1638 (earlier in the file) silently depends on `temporary: true`.
Fix: Move to the top of the describe or a nested describe.

[Risk] Record-space preconditions not verified
regression.spec.ts:415-422, 698-705, 968-992 — TC-3076 never confirms LIV, TC-3078 never confirms HIS; DELETE-intent wait at 975-981 has no status check.
Fix: `assertCurrentSpace('LIV')`/registry query; assert the DELETE status.

[Risk] create-table-group-modal.create() retries submit and swallows the failure
create-table-group-modal.ts:27-41 — second click after 30 s can duplicate the create; `.catch(() => false)` drops the first failure unlogged.
Fix: Submit once and assert the close; if a retry stays, log the first failure.

[Risk] password-reset-flow re-implements the first-login flow
password-reset-flow.ts:67-74, regression.spec.ts:75-81, 175-180 — body of `completeFirstLoginPasswordChange` in ui/auth/helpers/first-login-flow.ts.
Fix: Reuse it for the login-to-company-selection part.

[Risk] Create Table / Create Table Group modals live in helpers/
create-table-modal.ts, create-table-group-modal.ts — locator-owning modal classes, same kind as ui/customization/components/*; architecture.md puts them under components/.
Fix: Move next to the other modal components.

[Risk] TEMP_PASSWORD extraction duplicated
regression.spec.ts:219-232 vs password-reset-flow.ts:45-55.
Fix: One helper returning the temp password.

[Risk] track-created-resources: unchecked response; tracking before create confirmed
track-created-resources.ts:9-11; regression.spec.ts:377, 537, 660, 794, 930, 1081 — no status check before `.find`; table tracked before creation is confirmed.
Fix: Assert status first; track after `create()`.

## Nice-to-Have Improvements

[Nit] Unused public members and parameter — table-details-page.ts:18, 37 (`noActiveRecordLocksMessage`), :98-108 (`openProjectionRuntime`, `openFirstProjectionRuntime`); projection-runtime-page.ts:23, 41 (`saveDraftButton`, duplicates document-management page:69); add-new-field-modal.ts:119 (`searchTerm` never passed). Fix: Remove until a spec needs them.
[Nit] Hardcoded Keycloak wording — keycloak-update-password-page.ts:20 `getByText(/Invalid password/i)`, plural name for one locator, consumer needs `.first()` (regression.spec.ts:186). Fix: Rename `passwordPolicyError`, scope to the Keycloak error container.
[Nit] Side-effecting poll — table-details-page.ts:48-63 clicks inside `expect.poll`. Fix: Click once, poll `aria-selected`.
[Nit] Unchecked cast — smoke.spec.ts:514, 717, 931, 1140, 1809 vs `requireDefined` at 747, 961, 1170, 1857. Fix: `requireDefined(userB, 'userB')` everywhere.
[Nit] Raw response parsing in a spec — smoke.spec.ts:1524-1544 re-implements `assertActiveRecordLock` with an inline type and `?? 0` fallbacks. Fix: Have the helper return typed `ActiveRecordLock`.
[Nit] Near-identical password literals — smoke.spec.ts:63, 103. Fix: One shared constant.
[Nit] Redundant goto — regression.spec.ts:102-108. Fix: Drop `loginPage.goto()`.

## Necessity Citations

- Nested `test.describe('US-02.03.0X | <Story>')` with `['@smoke_m2','@ui']` / `['@regression_m2','@ui']`: testing-standards.md and sibling basic-customization-smoke.spec.ts; closes the documented "UI specs flat" gap.
- `allureCaseId(N)` single-ID tests; multi-ID tests reuse existing `ALLURE_ID_ANNOTATION_TYPE` (api/utils/helpers/allure-case-link.ts).
- Reused existing helpers: `loginAndReachDashboard`, `provisionDashboardUser`/`deleteDashboardUser`, `cleanupCreatedFields`, `trackCreatedTable`, `createAndAssertField`, `requireDefined`, `escapeCssAttribute`, `assertActiveRecordLock` (access-administration-helper.ts:370).
- `ALLOWED_DUPLICATE_IDS` +13 ids (verify-allure-ids.ts:25-39): each id occurs exactly twice (API and UI spec); README.md:444 prescribes whitelisting; script exits 1 on unlisted duplicates (CI .gitlab-ci.yml:118, .husky/pre-commit:10). Justified; semantics unchanged.
- `KeycloakUpdatePasswordPage.validationErrors`, `TableRegistryPage.tableGroupsTab`, `assertCurrentSpace` timeout param: each has a cited consumer in the access-administration specs. Justified.
- `password-reset-flow.reachDashboard` (race with company dialog not covered by `loginAndReachDashboard`) and `resetPasswordViaUi` (composes `inputPasswordReset` + `getKeycloakUserRequiredActions`): justified. `trackTableGroupByName`: justified (UI-created group id only available via `getAllGroups`).
- `CreateTableModal` / `CreateTableGroupModal`: no equivalent on origin/main; needed, but placement and dropdown duplication raised above.
- `CreateProjectionWizard`: **no citation found** for not reusing `ui/table-registry/pages/create-projection-wizard-page.ts` — Not justified.

## Orphaned Code

- table-details-page.ts: `noActiveRecordLocksMessage` (18, 37), `openProjectionRuntime` (98), `openFirstProjectionRuntime` (102) — zero references; safe to remove?
- projection-runtime-page.ts: `saveDraftButton` (23, 41) — zero references; safe to remove?
- add-new-field-modal.ts: `addDraft` `searchTerm` parameter (119) — never passed; safe to remove?

## Per-External-Caller Impact (changed pre-existing symbols)

| Symbol | External caller | Behavior changed? |
|---|---|---|
| `ProjectionRuntimePage.assertCurrentSpace` | basic-customization-regression.spec.ts:543, 562 | No (new optional timeout undefined) |
| `AddNewFieldModal.addDraft` | customization-smoke.spec.ts:404; customization-regression.spec.ts:899 | **Yes** (extra 'Field' click, retry loop, new scroll strategy) |
| `DeployFieldsModal.deploy` | customization-smoke.spec.ts:407 | Yes, likely benign |
| `DeployFieldsModal.deploy` | customization-regression.spec.ts:900 | **Yes, unproven on rejected-deploy path** |
| `KeycloakUpdatePasswordPage`, `TableDetailsPage`, `TableRegistryPage`, basic-customization `ProjectionRuntimePage` (members added) | other specs | No (additive) |
| `ALLOWED_DUPLICATE_IDS` | CI, pre-commit, package.json:30 | No (set only widened) |

Runtime behavior was not executed; findings that depend on it (modal close on rejected deploy, 'Field' label uniqueness) are filed as Risk.

## Exhaustiveness

All changed lines of all 14 files reasoned through under the Step 2.0 pass: smoke spec 1-1934, regression spec 1-1191, four helpers in full, eight page-object/script files in full. Six Sonnet judge passes merged; key claims (deploy() change, existing CreateProjectionWizardPage and AntdVirtualizedDropdown, sleeps at smoke:200/1509/1516) re-verified against the MR head.
