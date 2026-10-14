# Logical Analysis — MR 307 (branch group-6/TB-4317, commit 20eb731d)

## Summary
One commit ("update user mandatory fields - added BUSINESS_UNIT_ID", 5 files, +8/-0) adds the `BUSINESS_UNIT_ID` field, mandatory on the `SM.USER~INTERNAL` projection, to the internal-user payload builders, the `InternalUserProfileInputData` type, a new `USER_PROFILE_VALUES.BUSINESS_UNIT_ID.DEFAULT = 'CBS'` constant and TC-50's hand-rolled payload. The branch's ticket TB-4317 ("Test impl: Financial Reporting (Virtual GL Presentation) - Smoke") does not mention SM.USER, so this is a shared-infrastructure fix riding in a feature MR (ticket key recovered from the source branch, not from the commit).

Verification basis: static only (diff + `git grep` + Bruno `origin/main`). tsc/prettier were not run against the MR head.

## Confirmed Issues

[Confirmed] New mandatory field has no test proving it is sent, persisted or enforced
api/system_core/tests/user-profile-api-regression.spec.ts:267, api/system_core/helpers/user-profile-helper.ts:171-224 — the commit claims to update mandatory fields, but no assertion references BUSINESS_UNIT_ID: TC-50's response checks and `assertInternalUserRecordInDatabase` (which asserts every other mandatory field) never check it, and there is no negative test (missing / non-existent BUSINESS_UNIT_ID -> 4xx) although the Bruno `SM.USER~INTERNAL` projection declares it `required` and a LINKED_TABLE to BUSINESS.UNIT.
Fix: add BUSINESS_UNIT_ID to the DB assertion helper and TC-50's response checks, and cover the missing-field and unknown-unit cases.

## Possible Risks

[Risk] Silent `??` fallback in pickInputableProfileFields masks a missing SEE field and can rewrite a user's real BU
api/system_core/helpers/user-profile-helper.ts:33 — the type declares BUSINESS_UNIT_ID as required `string`, so `?? DEFAULT` is dead per the types, and no sibling field in this function has a fallback. Its only outside caller (user-group-helper.ts:401, SEE then re-INPUT) would silently re-INPUT 'CBS' if SEE ever omitted the field instead of failing loudly.
Fix: copy `data.BUSINESS_UNIT_ID` straight through like the other fields (drop the fallback).
Example:
    BUSINESS_UNIT_ID: data.BUSINESS_UNIT_ID,

[Risk] Shared builder change reaches every internal-user fixture in API and UI suites
test-data/payload-builder.ts:124, api/utils/constants/user-profile.values.ts:24 — buildInternalUserProfilePayload is consumed outside the MR by api/utils/services/test-user-service.ts:308 (used by UI auth fixtures ui/auth/fixtures/auth-ui-test.ts and ui/auth/helpers/dashboard-user.ts), api/security_management/helpers/access-administration-helper.ts:191/261/328, api/integration_chapter/tests/sms-system-core.spec.ts:225/466, user-groups-api-regression.spec.ts:226/273/1123/1579, the user-profile smoke/regression specs and override-dispo-helper.ts via ensureActiveInternalSmUser. Every internal user created by any project now carries BUSINESS_UNIT_ID='CBS'. This is right if the target env's projection requires it (Bruno does), but on an env whose SM.USER~INTERNAL predates the field, or where BU-scoped data access keys off the user's BU, all those contexts change behavior and the diff gives no evidence either way.
Fix: confirm on QA/UAT that the projection has the field and that BU 'CBS' does not change data-access scoping for the UI/security specs, and state it in the MR description.

[Risk] Unrelated shared-infra fix inside a Financial Reporting smoke MR
Commit 20eb731d (branch group-6/TB-4317) — none of the five files relate to Financial Reporting; if the same fix lands via another MR the two will conflict on the same lines, and reverting the feature would also revert this fix.
Fix: move the SM.USER mandatory-field fix to its own ticket/MR, or state in the MR why TB-4317's tests depend on it.

[Risk] Default BU 'CBS' hardcoded without a link to its seed source
api/utils/constants/user-profile.values.ts:24-26 — 'CBS' is justified by Bruno `Organisation Structure/00 - Seeding/11 - Data Setup/07 Seed BUSINESS.UNIT CBS`, but the neighbouring Bruno SM.USER seeds use "CBS" only as a COMPANY_CODE, and other suites use different BU ids ('BR101', 'RETAIL', 'BU01', 'HQ', '1'), so the value is easy to confuse with the company code and nothing ties it to the seed.
Fix: confirm it is the seeded BUSINESS.UNIT id (Bruno says yes) and reuse an existing shared BU constant from constants-keeper.ts if one exists instead of adding a second literal.

## Nice-to-Have Improvements

[Nit] BUSINESS_UNIT_ID default repeated in three payload sites
api/system_core/helpers/user-profile-helper.ts:55, test-data/payload-builder.ts:124, api/system_core/tests/user-profile-api-regression.spec.ts:267 — TC-50 hand-rolls an internal payload field by field instead of using buildInternalUserProfilePayload with overrides, so each new mandatory field must be added in three places (exactly what this MR had to do).
Fix: build TC-50's payload from buildInternalUserProfilePayload (overriding USER_ACCESS/COMPANY_CODES) so the next mandatory field is a one-place change.

## Necessity Citations
- `BUSINESS_UNIT_ID` added to internal payloads/type — Bruno proj-bruno-api origin/main `Tables/SMS/00 - Seeding/05 - Update Schemas/04 Create SM.USER~INTERNAL projection.yml` (~lines 294-312, 389: `required` includes BUSINESS_UNIT_ID; LINKED_TABLE to BUSINESS.UNIT). Justified.
- `BUSINESS_UNIT_ID: 'CBS'` default — Bruno `Organisation Structure/00 - Seeding/11 - Data Setup/07 Seed BUSINESS.UNIT CBS.yml` (recordId "CBS"). Justified as a value; see the provenance Risk.
- `?? DEFAULT` fallback in pickInputableProfileFields — no citation found (sibling fields have none).
- Type field `BUSINESS_UNIT_ID: string` (required) — consistent with Bruno `required`; grep shows no full-object literal of InternalUserProfileInputData outside casts (smoke spec:155), only Partial<> usages, so no compile break is expected (not tsc-verified on the MR head).
- External projection must NOT get the field (Bruno `05 Create SM.USER~EXTERNAL projection.yml:351`); the diff correctly leaves buildExternalUserProfilePayload and the external payloads untouched.

## Known-Issue Cross-Check
No docs/common-issues, module-theory or _pattern-log entry was matched for this narrow constant/payload change (not exhaustively scanned — the diff is 8 lines); nothing reintroduced, nothing to cite as followed.

## Whole-Repo Blast Radius / api/utils Deep-Impact (Step 1.5/1.6)
- USER_PROFILE_VALUES.BUSINESS_UNIT_ID: new key, consumers are only the 3 diff sites.
- buildInternalUserProfilePayload (outside the diff): behavior changes for API system_core / security_management / integration_chapter and UI auth (via test-user-service) — see Risk. External/System/Activate projections use separate builders: unchanged.
- buildInternalUserProfileTableFunctionOnlyPayload: all callers in user-profile-api-regression.spec.ts (225, 659, 1695, 1903, 2369, 2395), all INTERNAL projection, now send the BU; no outside callers.
- pickInputableProfileFields: single outside caller user-group-helper.ts:401 — see the fallback Risk.
- InternalUserProfileInputData: Partial<> consumers in override-dispo-helper.ts:515, ui/auth/*, test-user-service.ts:93 — unaffected at compile time.

## Orphaned Code
None found.

## Per-line rationale
All 8 changed lines across the 5 files were reasoned individually; the two files with only 1-3 added lines (types, values) carry no findings beyond the cited ones.
