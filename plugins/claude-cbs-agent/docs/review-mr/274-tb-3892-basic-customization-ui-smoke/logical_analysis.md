# Logical Analysis — MR 274 (TB-3892: Basic Customization UI Smoke)

## Summary

TB-3892 ("Test implementation: Basic Customization - smoke - UI") adds a new
`ui/basic-customization/tests/basic-customization-smoke.spec.ts` (14 tests across 4
`@ui @smoke_m2`-tagged `describe` blocks) covering role-based navigation-menu visibility,
leaf/drilldown navigation into Projections and Enquiries, and LinkedTable dropdown lookups —
each test wired to its own Allure TestOps case via `allureCaseId(...)`. The same
`allureCaseId(...)` linking is retro-fitted onto 11 previously-unlinked tests in the existing
`basic-customization-regression.spec.ts` (pure reindentation into the 3-arg `test()` form, no
scenario changes). Eight new API-side setup helpers back the new smoke scenarios, reusing the
module's existing `TableRegistryApiClient`/`WorkspaceMenuApiClient`/`EnquiryApiClient` patterns.
A 4×-duplicated DB-cleanup closure (`cleanupFor`) is extracted out of
`linked-table-field-setup.ts`, `multi-drilldown-setup.ts`, `projection-menu-setup.ts`, and
`workspace-menu-setup.ts` into a new shared `table-cleanup-helper.ts`. Several new
assertion methods are added to existing page/component objects
(`WorkspaceMenuTree`, `ProjectionRuntimePage`, `EnquiryExecutePage`, `DashboardShellPage`) to
back the new scenarios, plus a matching `eslint.config.mjs` `assertFunctionNames` whitelist
update. TB-3892's own Jira description has no populated specification/story/Acceptance-Criteria
links — its only stated source of truth is "Link to TC: in Allure TestOps" (case IDs, not
independently opened during this review).

## Confirmed Issues

No issues detected.

## Possible Risks

**[Risk] Smoke-suite runtime/CI-budget growth**
`ui/basic-customization/tests/basic-customization-smoke.spec.ts:2121` (`TC-02` describe) and each
of the other 3 top-level `describe` blocks call
`test.describe.configure({ timeout: 300_000 })`, and the file's own comment explains this is to
tolerate "AQA_RESTART_EPOCH pod-restart wait" (up to 150s) during each test's own table creation.
14 new `@smoke_m2`-tagged tests, each individually eligible for up to a 5-minute timeout, is a
meaningful addition to the smoke suite's wall-clock budget under the `workers:` pool that
`playwright.config.ts` shares across projects.
Fix: confirm with the team/CI owner that the smoke suite's overall duration and worker budget
were re-checked after this addition, since a 300s-per-test allowance multiplied across 14 new
tests can materially shift smoke-suite runtime even if most tests finish well under that ceiling.

## Nice-to-Have Improvements

No issues detected.

## Necessity Citations

- **Extract `cleanupFor` into `ui/basic-customization/helpers/table-cleanup-helper.ts`** — the
  removed closure was byte-for-byte identical across
  `linked-table-field-setup.ts:66-77`, `multi-drilldown-setup.ts:79-90`,
  `projection-menu-setup.ts:687-698`, and `workspace-menu-setup.ts:88-99` (pre-diff). Justified:
  straightforward DRY extraction, no behavior change.
- **New smoke spec `basic-customization-smoke.spec.ts`, tagged `@ui @smoke_m2`** — cited by
  TB-3892 itself ("Smoke tests... Link to TC: in Allure TestOps"). TB-3892's description has no
  populated specification/story links and no separate Acceptance Criteria field; the only
  concrete source of truth named is the linked Allure TestOps case per test
  (`allureCaseId(3767)`, `(3777)`, `(3783)`, `(3785)`, `(3786)`, `(3794)`, `(3797)`, `(3839)`,
  `(3843)`, `(3846)`, `(3847)`, `(3921)`, `(3922)`, `(3924)`). This review did not independently
  open those Allure cases to verify each test's scenario/expected result matches its case
  definition — noting this as a citation gap rather than treating the ticket as silent on intent.
- **8 new setup helpers** (`setupNestedFolderWorkspace`, `setupMenuVisibilityWorkspace`,
  `setupTwoFolderVisibilityWorkspace` in `menu-visibility-setup.ts`;
  `setupSingleProjectionDrilldownWorkspace`, `setupEnquiryDrilldownWorkspace`,
  `setupNoDrilldownWorkspace`, `setupUnavailableDrilldownTargetWorkspace` in
  `multi-drilldown-setup.ts`; `setupUnresolvedProjectionLeafWorkspace` in
  `projection-menu-setup.ts`) — each mirrors an existing sibling function in the same file
  (`createLeafTable`/pre-existing `setupProjectionLeafWorkspace`, pre-existing
  `setupMultiDrilldownWorkspace`/`createEnquiryLeafMenu`, pre-existing
  `setupEnquiryLeafWorkspace`), reusing the same client/adminContext/dispose lifecycle and
  `requireDynamicGroupId()`/`generateDynamicTable()`/`generateCustomRecordId()` helpers already
  established in this module. Justified by direct reuse-surface match.
- **New page/component assertion methods** (`WorkspaceMenuTree.assertLeafHidden/
  assertFolderHidden/assertEmpty`, `ProjectionRuntimePage.assertUnresolved/
  assertRecordNotFound/assertLinkedTableSearchFindsOption/
  assertLinkedTableSearchHasNoResults/assertLinkedTableAccessDenied`,
  `EnquiryExecutePage.assertDrilldownButtonAbsent/assertNoResults`,
  `DashboardShellPage.assertBackendErrorNotification`) — matches
  `docs/frame-specs/architecture.md`'s Page Object Model convention (assertions live on the
  page/component, not the spec) and each method's `expect(...).toHaveCount/toContainText/
  toBeVisible` style matches its sibling methods already in the same class. Justified.
- **`eslint.config.mjs` `assertFunctionNames` whitelist gains only `assertEmpty`,
  `assertUnresolved`, `assertBackendErrorNotification`, not all 11 new assert methods** —
  verified correct, not an omission: these 3 are the only cases where the new assert method is
  the *sole* recognized assertion call anywhere in its test body (TC-03, TC-15, TC-05). Every
  other new assert method (`assertLeafHidden`, `assertFolderHidden`, `assertRecordNotFound`,
  `assertDrilldownButtonAbsent`, `assertNoResults`, `assertLinkedTableSearchFindsOption`,
  `assertLinkedTableSearchHasNoResults`, `assertLinkedTableAccessDenied`) is always called in a
  test that also calls an already-whitelisted function (`assertReached`, `assertLeafVisible`,
  `assertResultRowVisible`), so `playwright/expect-expect` is already satisfied there without
  adding them. Confirmed correct as-is — cited here as positive supporting evidence, not a gap.
- **`PROJECTION_OPERATION: 'SEE'`/`operation: 'SEE'` hardcoded as raw string literals**
  (`menu-visibility-setup.ts:98,166,173,234,246`; `multi-drilldown-setup.ts:247,443,535`;
  `projection-menu-setup.ts:196`) rather than `TEST_CONSTS.OPERATION.SEE` — verified against the
  reuse surface, not an inconsistency: this exact field shape is already hardcoded the same way
  in pre-existing sibling code in the same files (`linked-table-field-setup.ts:118:
  PROJECTION_OPERATION: 'INPUT'`; `multi-drilldown-setup.ts:165,170` pre-existing `operation:
  'SEE'`). `TEST_CONSTS.OPERATION.*` is used elsewhere in this same module
  (`projection-menu-setup.ts:262,288`) only for direct `performRecordOperation()` API calls — a
  distinct, unrelated usage. No citation gap.
- **`WORKSPACE_MENU_ROOT_ID` set via `provisionDashboardUser(..., { profileOverrides: {
  WORKSPACE_MENU_ROOT_ID } })`** — verified as a real, supported field
  (`api/types/user-profile.types.ts:17`, forwarded by
  `api/system_core/helpers/user-profile-helper.ts:36`), and already proven working 11 times in
  the pre-existing, unmodified `basic-customization-regression.spec.ts`. Known-Issue
  Cross-Check: `docs/common-issues/test-user-service/
  dashboard-user-never-sets-workspace-menu-root-id.md` warns specifically against adding this
  field to the *shared* `dashboardUser` fixture without dev confirmation — this diff does not do
  that; it uses the already-established per-call `profileOverrides` extension point instead, so
  the documented gap is not reintroduced. Cited as positive supporting evidence.

## Orphaned Code

- **`UnavailableDrilldownTargetWorkspace.targetProjectionId`** — returned by
  `setupUnavailableDrilldownTargetWorkspace` (`multi-drilldown-setup.ts`) and part of the new
  interface, but its sole consumer, `TC-22` in `basic-customization-smoke.spec.ts` (~line 2780),
  never reads `ws.targetProjectionId` — the test only uses `ws.rowRecordId`, `ws.sourceTableId`,
  and `ws.sourceEnquiryId`. Safe to remove from the interface/return value, or is it needed for a
  planned follow-up assertion that didn't make it into this test?

## Changelog

- 2026-09-24: Initial review.
