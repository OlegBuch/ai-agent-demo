# Logical Review — TC-005 UI diff (ui/override-dispo/)

No real GitLab MR or Jira ticket exists for this diff — this is an ad-hoc run of
`review-logical-pr`'s protocol against the local diff directly. "The goal" is treated as: write
TC-005, the UI equivalent of the already-existing API case `TC-36` in
`api/security_management/tests/override-dispo-smoke.spec.ts` (DISPO.OFFICER's ABSENT_END must not
be earlier than ABSENT_START, enforced by a PRE-phase hook that rejects the INPUT before persisting
anything).

## Summary

This diff adds `ui/override-dispo/`, automating TC-005 by following `field-registry/`'s established
module shape, reusing the API-side `override-dispo-helper.ts` provisioning instead of inventing new
provisioning, and reproducing TC-36's exact precondition data faithfully. Structural fidelity to
`architecture.md`'s documented UI conventions is strong. The Step 2.0 per-line rationale pass ran
over every changed line of all seven files.

Checklist items with nothing to report: security hygiene (no hardcoded secrets, no sensitive
logging, no disabled TLS, no unvalidated external data in a selector/assertion); in-file duplicate
scenario check (exactly one test in the file); suite-wide duplicate check (no other DISPO.OFFICER
UI coverage exists); CI/CD quality-gate impact (no `.gitlab-ci.yml`/pipeline touch); verification-
claim consistency (net-new test, no prior claim to check against).

## Confirmed Issues

**[Confirmed] Provisioning failure leaks the two Keycloak validation users**
`ui/override-dispo/fixtures/override-dispo-setup.ts:7-24` — no enclosing `try` around
`ensureInternalSmUserForDispoOfficer`; a throw there skips `validationUsers.cleanup()` entirely.
`field-registry-setup.ts:163-179` handles this shape already.
Resolution: **Fixed** — see `cosmetic_analysis.md`, same fix.

**[Confirmed] Bare-timeout assertion right after a fresh navigation reintroduces a documented flake pattern**
`ui/override-dispo/pages/override-dispo-page.ts:79-85` — `assertRecordNotPersisted` navigates then
asserts `getByText(...).toBeVisible()` with no explicit timeout, inheriting Playwright's bare 5000ms
default. `docs/common-issues/playwright-execution/table-registry-redirect-times-out-after-company-select.md`
documents this exact class of failure on this same non-mocked environment (confirmed real via direct
read — a `toHaveURL` incident that generalizes to any bare-default assertion timing a real backend
round-trip here).
Fix: pass an explicit timeout, matching the pattern already used in `assertInputRejectedByHook`.
Resolution: **Fixed** — added `{ timeout: UI_MODAL_VISIBLE_TIMEOUT_MS }`.

## Possible Risks

**[Risk] The default `dashboardUser` login setup was unverified for reaching Table Registry / DISPO.OFFICER**
`ui/override-dispo/tests/override-dispo.spec.ts` called `loginAndSelectCompany(page, dashboardUser)`
with no `dashboardUserOptions` override. Verified: the default `dashboardUser` resolves to
`GROUPS: ['SM-USER-GROUP-USER-MANAGEMENT']` (`api/utils/constants/user-profile.values.ts:15`,
confirmed by direct read). The one existing comparable precedent, `field-registry.spec.ts:62-67`,
explicitly strips this via `profileOverrides: { GROUPS: undefined }` to reach a comparable
Administration-family screen. Company-code compatibility itself was separately confirmed fine
(the officer's default `COMPANY_CODES` includes `MOCK`, matching `dashboardUser`'s default
`COMPANY_CODES.SINGLE`) — only the GROUPS question was open.
Resolution: **Fixed defensively** — added `test.use({ dashboardUserOptions: { profileOverrides: { GROUPS: undefined } } })`,
mirroring `field-registry.spec.ts`. Not empirically re-confirmed with a live run in this session
(the earlier live-browser exploration used the user's own already-authenticated session, not a
freshly-provisioned `dashboardUser`) — flagged to the user as still worth a real CI/local run to
confirm.

**[Risk] A pre-existing, documented `WORKSPACE_MENU_ROOT_ID` gap can non-deterministically bounce this test's session**
`docs/common-issues/test-user-service/dashboard-user-never-sets-workspace-menu-root-id.md`
documents that every `dashboardUser` is missing `WORKSPACE_MENU_ROOT_ID`, which was observed to
bounce at least one Table-Registry-reaching page back to `/selectCompany`. This diff does nothing
wrong that isn't already wrong repo-wide.
Resolution: **Not fixed — out of scope for this diff**, pre-existing and repo-wide. Flagged to the
user as a known exposure this new test inherits, not something to patch here.

**[Risk] The literal notification/error text asserted matches the platform's raw API error text, but no *repo* precedent confirms the UI renders it verbatim**
`HOOK_REJECTION_BODY_TEXT` and `RECORD_NOT_FOUND_TEXT` are well-grounded as the platform's actual
API `detail`/hook-message text, but no existing `ui/` test asserts a raw API error string as
rendered page text — this is the first instance of that pattern in `ui/`.
Resolution: **Not a real open risk in this case** — the author personally drove a live browser
session against the real bankstg environment earlier in this task and observed both strings render
verbatim in the actual antd notification/alert (`"Failed to create record" / "Failed to update
record"` title + `"Hook execution failed for operation INPUT in PRE phase for projection
DISPO.OFFICER~BASIC"` body; `"Record not found"` on SEE). This is direct empirical verification,
not a citation from an existing doc/Bruno file — noted explicitly since the repo's usual "cite an
existing pattern" convention doesn't have one to point to yet for this brand-new UI surface.

**[Risk] This diff builds the first automated coverage of the generic Table Registry runtime UI, an area with prior abandoned/unmerged work**
`architecture.md` records that `shell/TableRegistryPage` was renamed to `DashboardShellPage`
specifically because an in-flight, never-merged branch (`UI-Test-implementation--Table-Registry---Regression`)
was separately building a genuine Table Registry feature module, hand-rolling its own divergent
base classes in the process (confirmed real via direct read).
Resolution: **Not a duplication** — `OverrideDispoPage` extends the current canonical `BasePage`
(no hand-rolled base classes), and that branch was never merged, so there is no current, reusable
alternative to cite. Flagged to the user as historical context worth knowing, not a defect.

## Nice-to-Have Improvements

**[Nit] `TC-005` uses 3-digit zero-padding** — see `cosmetic_analysis.md`; not fixed, by design (assigned case id).

**[Nit] An unused `externalOfficerId` Keycloak identity is created and torn down every worker run for no test benefit**
`ui/override-dispo/fixtures/override-dispo-setup.ts:10-11` — `provisionDispoOfficerValidationUsersForSuite`
provisions both an internal and an external identity; only the internal one is used.
Resolution: **Accepted as intentional** — reusing the shared API-side helper as-is (rather than
adding a narrower one) keeps this module aligned with the API suite's own provisioning shape; the
extra identity's cost is one throwaway Keycloak user per worker run.

**[Nit] `fillAbsence`'s internal fill order doesn't match its own parameter order**
`ui/override-dispo/pages/override-dispo-page.ts` — signature is
`fillAbsence(absentStartIso, absentEndIso)` but the body fills END before START.
Resolution: **Not changed — kept intentionally.** The END-before-START fill order was the one
actually verified working against the live antd DatePicker during this task's manual exploration;
reordering to match the parameter list was attempted and reverted after recognizing it was an
unverified change to working, tested behavior. The parameter order stays as the natural call-site
reading (`fillAbsence(start, end)`), independent of internal fill order.

**[Nit] No `assertUrl`/`URL_PATTERN` check in `OverrideDispoPage`, unlike `FieldRegistryPage`**
Resolution: **Fixed** — added `URL_PATTERN` to `OVERRIDE_DISPO_UI_PATHS` (reusing
`ui/utils/selector-helpers.ts`'s existing `escapeRegExp`) and `assertUrl` calls in `gotoInput`/`gotoSee`.

**[Nit] Story-`describe`-nesting shape picked without recording that the open question was considered**
Resolution: **Noted to the user** — see the same item in `cosmetic_analysis.md`'s Possible Risks.

## Necessity Citations

| Decision | Citation |
|---|---|
| `DISPO.OFFICER`/`DISPO.OFFICER~BASIC` path segments | Verified live against the actual bankstg Table Registry screen (Projection ID shown in-app) — justified. |
| `HOOK_REJECTION_BODY_TEXT` / `RECORD_NOT_FOUND_TEXT` wording | Verified live (see Possible Risks) — justified as both API contract text and actual rendered UI text. |
| `ABSENT_START`/`ABSENT_END`/`DISPO_AMOUNT`/`OVERDRAFT_AMT` test values | `api/security_management/tests/override-dispo-smoke.spec.ts` TC-36 — exact match, justified. |
| Reusing `provisionDispoOfficerValidationUsersForSuite`/`ensureInternalSmUserForDispoOfficer` | Same TC-36 `beforeAll` + `override-dispo-helper.ts` — justified. |
| Worker-scoped precondition fixture shape | `ui/field-registry/fixtures/field-registry-ui-test.ts`'s `fieldRegistryPreconditions` — same shape, justified. |
| `root_ABSENT_END`/`root_ABSENT_START`/`root_DISPO_AMOUNT`/`root_OVERDRAFT_AMT` field ids, and every `runtime-*`/`projection-record-input-*` test-id | No repo doc/Bruno file covers this screen (confirmed — first automated coverage of this surface). Citation is direct live DOM inspection against bankstg during this task, recorded here in place of a doc citation — justified on that basis, but not yet backed by a written `docs/module-theory/` entry (offered to the user, not written unprompted). |
| The `/tableRegistry/<TABLE>/projections/<PROJECTION>/runtime/<recordId>[/<OPERATION>]` URL shape | Same — live-verified, no prior doc. |
| Click + `pressSequentially` + `Escape` date-field interaction | Live-verified during this task: plain value-setting on this antd-masked input doesn't reliably commit (a dash-formatted `YYYY-MM-DD` string was silently misparsed), and `Escape` was confirmed to commit rather than revert a *complete* `DD/MM/YYYY` string — justified as the minimum interaction confirmed to work, not a speculative workaround. |
| Default `dashboardUser` as sufficient RBAC for Table Registry/DISPO.OFFICER | **Not justified as originally written** — see Possible Risks; fixed defensively by adding the `GROUPS: undefined` override `field-registry.spec.ts` already established for this need. |
| Registering `assertInputRejectedByHook`/`assertRecordNotPersisted` in `eslint.config.mjs`'s `assertFunctionNames` | `assertDispoOfficerInputRejected` and ~20 other precedents already in the same array — justified, established extensibility mechanism for exactly this need. |

## Orphaned Code

None remaining — every item originally flagged here (`recordIdSelect`, `inputOpButton`,
`seeOpButton`, `saveDraftButton`, `FIELD_IDS.ROUTE_TO`/`.REPORTING_TO`, `DATE_DISPLAY_FORMAT`,
`SEE_PATH`/`INPUT_PATH`) was removed rather than kept unused — see `cosmetic_analysis.md`.
