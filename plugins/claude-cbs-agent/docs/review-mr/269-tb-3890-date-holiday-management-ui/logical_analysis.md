# MR 269 — TB-3890: Test implementation: Date & Holiday Management - UI — Logical Analysis

## Summary

MR 269 (source `group-9/TB-3890` → `main`, single commit `9ac44681` "add DHM 3 UI tests") adds a
brand-new `ui/table-registry/` UI test module: page objects for the Table List, Table Details, the
5-step Create Projection wizard, and the created Projection's details page, plus supporting
fixtures/helpers/constants/types, and one new spec file
(`ui/table-registry/tests/dates-operation-day-policy.spec.ts`) with three `@smoke_m2 @ui` tests
covering `US-01.10.04 | Operational Day Status Calculation`: creating a projection on the `DATES`
table with each of the three Operation Day policies (`NORMAL`, `RESTRICTED`, `CLOSED`), verified
both through the UI (projection details page shows the chosen policy) and via a follow-up API `SEE`
call (`allowedWorkdayStatuses` on the stored projection definition).

TB-3890 itself (fetched via the `bank` Atlassian connection) carries an entirely placeholder
description — no filled-in specification/story links, no Acceptance Criteria — so this review's
"goal of the MR" comes from the commit message, the three linked Allure TestOps manual cases
(4164/4167/4168, fetched and compared line-by-line against the new spec — steps, tab names, and
wizard step names match exactly), and the Bruno collection (`proj-bruno-api`, `Date and Holiday
Management` table folder + the generic `Execute Projections Operation.yml` doc, which documents
`allowedWorkdayStatuses` and its exact `NORMAL`/`RESTRICTED`/`CLOSED` value set).

**Scope-correction note:** an initial `git diff main..<MR-branch>` (two-dot) comparison showed 87
files touched, including the entire `ui/override-dispo/` module and `api/utils/table-group-provisioning.ts`
apparently "deleted." This was a false signal — `group-9/TB-3890` branched from a commit
(`7cd1205e`) that predates MR 247/TB-3888 (which added `ui/override-dispo/`) landing on `main`. The
user confirmed mid-review that `main` had just been updated (the TB-3888 merge). Recomputed via
merge-base (`git diff $(git merge-base main branch)..branch`, GitLab's own three-dot semantics),
MR 269's actual diff is **11 new files, 741 insertions, 0 deletions, entirely under
`ui/table-registry/`** — no `api/utils/**`, no health-check consolidation, no override-dispo
changes. All findings below are scoped to that corrected diff only.

⸻

## Confirmed Issues

**[Confirmed] `TableDetailsPage.openProjectionsTab()` asserts the post-click URL with no preceding wait — the exact anti-pattern this repo has already hit and documented**
`ui/table-registry/pages/table-details-page.ts:42-45`:
```
async openProjectionsTab(): Promise<void> {
  await this.tab('Projections').click();
  await this.assertUrl(TABLE_REGISTRY_UI_PATHS.TABLE_PROJECTIONS.URL_PATTERN(this.tableId));
}
```
`assertUrl` wraps a bare `expect(page).toHaveURL(...)` with no explicit timeout, so it silently
inherits Playwright's 5000ms default. `docs/common-issues/playwright-execution/
table-registry-redirect-times-out-after-company-select.md` documents exactly this shape of bug
(`TC-210`/`TC-214`, 2026-09-10: an in-suite flake reproduced on 1 of 3 consecutive runs) and its
predictive rule: "before adding any `expect(page).toHaveURL(...)` right after an action that
triggers navigation, check whether the destination page object already exposes a `waitForUrl()`
— if not, that's a gap." This same file demonstrates the author knows the correct pattern —
`openTableView` (`:44-46`) and `CreateProjectionWizardPage.submit`/`openCreateProjection` all call
`waitForUrlPattern(...)` before their own `assertUrl`/`assertDisplayed` — but `openProjectionsTab`
(called directly from the test's `loginAndOpenTableProjections` flow, and again via
`returnToProjectionsTab`, `:47-51`) skips it. A tab switch here is more likely a client-side
route/query-param change than a full backend round-trip, so the practical flake risk is probably
lower than the original company-selection incident — but the gap is real, cited, and inconsistent
with the rest of this same file.
Fix: give `TableDetailsPage` its own `waitForUrl()`/`waitForUrlPattern` call for the projections-tab
URL and call it before `assertUrl` in `openProjectionsTab()`, mirroring `openTableView`'s own
shape.

**[Confirmed] `TABLE_REGISTRY_API_PATHS.PROJECTION_DEFINITION_DELETE` duplicates an existing, directly analogous path builder instead of widening it**
`ui/table-registry/table-registry-paths.ts:29-31` hand-builds
`` `tables/api/v1/tables/${tableId}/definitions/projections/operation/DELETE` `` via a new
`apiTableBase` helper. `api/system_core/paths/sys-core-api-paths.ts:25-26` already defines
`PROJECTION.DEFINITION_OPERATION: (tableId, operation: 'INPUT' | 'SEE') =>
\`${tableBase(tableId)}/definitions/projections/operation/${operation}\`` — byte-identical URL
shape (`tableBase` there is `` `tables/api/v1/tables/${tableId}` ``, the same base this MR's
`apiTableBase` reconstructs). The only reason this MR couldn't call it directly is that its type
union is `'INPUT' | 'SEE'`, not `'DELETE'` — but the sibling `ENQUIRY.DEFINITION_OPERATION`
constant already supports and is called with `'DELETE'`
(`api/system_core/client/enquiry-api-client.ts:51`), so this is a one-token type-widening away from
being directly reusable, not a structurally different endpoint. `deleteProjectionDefinitions`
(`ui/table-registry/helpers/projection-definition-helper.ts:26-51`) then calls `client.post(...)`
on that new path directly rather than adding a matching method to `TableRegistryApiClient` — every
one of that class's other ~30 endpoint calls (`inputProjectionDefinition`, `seeProjectionDefinition`,
etc.) is wrapped in a named method; this is the first call site to reach around that convention for
this specific client.
Fix: widen `PROJECTION.DEFINITION_OPERATION`'s type to `'INPUT' | 'SEE' | 'DELETE'`, add a
`deleteProjectionDefinition(tableId, projectionId)` method to `TableRegistryApiClient` that calls
it, and drop `table-registry-paths.ts`'s own `TABLE_REGISTRY_API_PATHS` object entirely in favor of
the client method.
Example:
```
// sys-core-api-paths.ts
DEFINITION_OPERATION: (tableId: string, operation: 'INPUT' | 'SEE' | 'DELETE') => ...

// table-registry-api-client.ts
async deleteProjectionDefinition(tableId: string, projectionId: string): Promise<APIResponse> {
  const path = SYS_CORE_API_PATHS.PROJECTION.DEFINITION_OPERATION(tableId, 'DELETE');
  return await this.post(path, { id: projectionId });
}
```

⸻

## Possible Risks

**[Risk] The NORMAL-policy test's `toEqual(['NORMAL'])` assertion may not match how the API actually stores an unset/default policy**
`ui/table-registry/tests/dates-operation-day-policy.spec.ts`'s first test expects
`readStoredOperationDayPolicy(...)` to equal exactly `['NORMAL']` after selecting NORMAL in the
wizard. Bruno's own docs for the generic Projections operation
(`collections/Table Template/Operations/Execute Projections Operation.yml:133`) state:
"`allowedWorkdayStatuses` lists the business-day statuses (NORMAL/RESTRICTED/CLOSED) in which
non-SEE operations are permitted — **empty or omitted means NORMAL only**." That phrasing suggests
the backend's own "NORMAL" representation may be an empty/omitted array rather than a literal
`['NORMAL']` — in which case this specific assertion could fail even though the projection's
*effective* policy is correctly NORMAL. This is not confirmed wrong (the UI wizard may well always
submit an explicit `["NORMAL"]` regardless of the API's own omission shorthand for direct callers),
but it's a plausible mismatch between the UI's likely payload shape and the documented API default,
worth a live check before merge rather than assuming the literal-array form is guaranteed.
Fix: confirm on a live run whether `allowedWorkdayStatuses` comes back as `['NORMAL']` or
`undefined`/`[]` for this specific UI-driven creation path; if the latter, relax the first test's
assertion to accept the omitted/empty form instead of asserting a literal array.

⸻

## Nice-to-Have Improvements

No issues detected — no additional nits found beyond the two Confirmed Issues above.

⸻

## Necessity Citations

- **`DATES_TABLE.ID = 'DATES'`, `DATE_FIELD_ID = 'TODAY'`** (`constants/table-registry.values.ts`):
  confirmed against `proj-bruno-api`'s `collections/Tables/Date and Holiday Management/` folder
  (`Create DATES table.yml`, `Create TODAY field.yml`) — the `TODAY` field is a real `DATE`-typed
  field on the real `DATES` table.
- **`OPERATION_DAY_POLICIES = ['NORMAL', 'RESTRICTED', 'CLOSED']`**: confirmed verbatim against
  Bruno's `Execute Projections Operation.yml` doc string (quoted above) — exact three-value set,
  exact spelling/casing.
- **`TABLE_DETAILS_TABS` and `PROJECTION_WIZARD_STEPS`** (5 tabs / 5 wizard steps each): confirmed
  verbatim against Allure TestOps cases 4164/4167/4168's own scenario steps (same tab names, same
  wizard step names, same order) — a legitimate "Allure name/step matches pasted TC" citation.
- **`test.use({ dashboardUserOptions: { profileOverrides: { GROUPS: undefined } } })`**: not a new
  pattern — identical `profileOverrides: { GROUPS: undefined }` already used in
  `ui/field-registry/tests/field-registry.spec.ts:65` and both
  `ui/override-dispo/tests/override-dispo-{regression,smoke}.spec.ts`. Correctly reused, not
  reinvented.
- **`adminApiContext` worker fixture** (`fixtures/table-registry-ui-test.ts`): thin wrapper over the
  already-existing `createUiAdminAuthContext` (re-exported from `ui/auth/helpers/dashboard-user.ts`
  as `getGlobalAdminContext`) — reuse, not a new provisioning mechanism.
- **`TABLE_REGISTRY_API_PATHS.PROJECTION_DEFINITION_DELETE`**: no citation found — see Confirmed
  Issues above; this duplicates rather than reuses an existing, directly analogous path builder.

⸻

## Orphaned Code

None found. This MR only adds new files; it does not modify or delete any existing file, so there
is nothing left behind to orphan.

⸻

## Whole-Repo Blast-Radius / Architect Lens (Step 1.5 / 1.6)

This MR touches **zero** files under `api/utils/**` (the earlier two-dot diff's apparent
`api/utils/**` changes belong to already-merged, unrelated MRs on `main`, not to this MR — see the
Summary's scope-correction note), so the Mandatory Deep-Impact Rule (Step 1.6) does not apply and
the Senior Solution Architect lens was not engaged.

Every symbol this diff adds or exports is brand new (no existing file is modified, renamed, or has
its signature changed), so by construction there are no pre-existing call sites anywhere in the
repo that could be affected — a repo-wide `git grep` for each new export
(`TableListPage`, `TableDetailsPage`, `CreateProjectionWizardPage`, `ProjectionDetailsPage`,
`readProjectionDefinition`, `deleteProjectionDefinitions`, `loginAndOpenTableProjections`,
`createProjectionWithOperationDayPolicy`, `TABLE_REGISTRY_UI_PATHS`, `TABLE_REGISTRY_API_PATHS`,
`DATES_TABLE`, `OPERATION_DAY_POLICIES`) returns matches only inside `ui/table-registry/` itself.
No consumers outside this diff exist yet, and none are broken by it.

⸻

## Changelog

- 2026-09-23 — Initial review at MR HEAD `9ac44681`. Corrected an initial mis-scoped two-dot diff
  (which pulled in unrelated already-merged `main` history) to the actual merge-base diff. Found 2
  Confirmed Issues (missed `waitForUrl` pattern reintroducing a documented flake class; a
  hand-rolled path constant duplicating an existing, directly analogous one) and 1 Risk (a
  possibly-too-strict assertion against the API's documented NORMAL-is-implicit default). No
  Critical findings, no orphaned code, no `api/utils/**` blast radius (this MR doesn't touch it).

- 2026-09-24 — Re-check at MR HEAD `c7611ba3` (3 new commits on top of `9ac44681`: `6e888f99`
  "fixed after code review", plus a merge from `main` and `c7611ba3` "add Allure ID"). Both
  Confirmed Issues verified fixed correctly:
  - `TableDetailsPage.openProjectionsTab()` (`ui/table-registry/pages/table-details-page.ts:36-41`)
    now calls `this.waitForUrlPattern(projectionsTabUrl)` before `assertUrl`, mirroring
    `TableListPage.openTableView`'s own shape exactly.
  - `table-registry-paths.ts`'s own `TABLE_REGISTRY_API_PATHS`/`PROJECTION_DEFINITION_DELETE` and
    its `apiTableBase` helper are gone entirely — the file now holds only UI navigation paths
    (`TABLE_REGISTRY_UI_PATHS`). `SYS_CORE_API_PATHS.PROJECTION.DEFINITION_OPERATION`'s type was
    widened to `'INPUT' | 'SEE' | 'DELETE'`
    (`api/system_core/paths/sys-core-api-paths.ts:25`), `TableRegistryApiClient` gained a named
    `deleteProjectionDefinition(tableId, projectionId)` method built on it
    (`api/system_core/client/table-registry-api-client.ts:266-275`), and
    `projection-definition-helper.ts`'s `deleteProjectionDefinitions` now calls that client method
    instead of `client.post(...)` directly — no more orphaned `table-registry-paths.ts` import in
    that helper.
  - Checked the third commit (`c7611ba3`, re-adding a `TC-4164:`/`TC-4167:`/`TC-4168:` prefix to
    the three test titles alongside their existing `allureCaseId(...)`) against
    `docs/frame-specs/testing-standards.md`'s own canonical template
    (`test('TC-NNN: <description>', allureCaseId(N), ...)`) — this is the documented convention,
    not a regression; no new finding.
  - The 1 Risk (NORMAL-policy `toEqual(['NORMAL'])` vs. the API's documented
    empty/omitted-means-NORMAL default) was **not** addressed — it wasn't one of the two comments
    given to the author, remains open as a Risk, non-blocking per the Approval Standard.
  - No new Confirmed/Critical issues introduced by the fix commits. `git diff` file/insertion count
    (13 files, 746 insertions, 1 deletion) matches exactly the 2 targeted fixes plus the Allure-id
    rename — no unrelated changes crept in.
