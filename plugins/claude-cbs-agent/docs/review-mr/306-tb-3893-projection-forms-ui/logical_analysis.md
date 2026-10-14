# Logical Analysis — MR 306 (TB-3893: Test implementation: Projection Forms & UI Framework - UI)

Reviewed 2026-10-02 against `origin/main` (merge-base 44b99bdf), MR head 9d4a66e6. Static review only, nothing run. Finding numbers match the chat list and `cosmetic_analysis.md` (numbers 10, 12, 13, 35-40 live in the cosmetic file).

## Summary

The MR adds the UI test layer for the Projection Forms & UI Framework epic (TB-9; EP-01.06 / TI-01.06 TRC-01..TRC-08): 6 spec files (about 8,550 lines, about 190 tests incl. a 4,507-line `pf-record-lifecycle.spec.ts`), 10 page objects/components, fixtures, helpers, constants and types under `ui/projection-forms/`, plus small edits to shared files (`eslint.config.mjs`, `package.json`, `.husky/pre-commit`, `api/types/table-definition.types.ts`, `ui/base/constants/ui-timeouts.ts`, `ui/plugin-manager/pages/plugin-manager-page.ts`). Coverage breadth is good and TC-N prefixes equal their `allureCaseId(N)` everywhere. The main defects: a parallel copy of the table-registry page-object/path/helper layer (same class name `CreateProjectionWizardPage`), many tests whose assertions cannot fail for the reason their title claims (statuses never read, persistence never re-opened, vacuous negatives), one test that is red by construction, silent catches that make negative assertions pass vacuously, non-exception-safe cleanup, and heavy copy-pasted UI setup where an API client already exists. No secrets, no sensitive-data logging, no disabled TLS found. No `api/utils/**` file is touched, so the Step 1.6 mandatory rule did not trigger; the blast radius of every changed shared symbol was still checked (below).

Known-Issue Cross-Check: reintroduced from MR 302 — duplicate `CreateProjectionWizardPage`, setup copy-pasted into many tests, unused public page-object members, side-effecting polls, non-nested cleanup in finally, preconditions never verified, UI-built state instead of API seeding, title/body mismatches. Reintroduced from MR 269 — `openOperation` asserts `toHaveURL` right after a click with no `waitForURL`. Reintroduced from common-issues — cleanup failure swallowed by caller, `expect.poll`-style retries re-doing actions. Correctly followed — no `networkidle`, no `waitForTimeout`, no new AntdVirtualizedDropdown copy (all comboboxes use `ui/base/interactions/antd-virtualized-dropdown.ts`), dynamic IDs via `generateCustomId`.

## Blast radius of changed shared symbols (Step 1.5)

| Symbol | Consumers outside the MR's own new files | Behavior change? |
|---|---|---|
| `SchemaProperty` (`api/types/table-definition.types.ts:21`) | `api/security_management/payload-builder-override-dispo.ts`, `override-dispo-regression.spec.ts:40,64`, `api/system_core/helpers/projection-helper.ts:817` | No — optional field added |
| `UI_RECENT_WRITE_READ_RETRY_TIMEOUT_MS` (new) | none outside `create-projection-flow.ts` | No |
| `PluginManagerPage` | `basic-customization-regression.spec.ts:38,236` (existing members only) | No |
| eslint `assertFunctionNames` | whole lint scope (`ui/**/*.ts`, tests) | Only widens accepted names; every added name becomes a global "this is an assertion" marker |
| `.husky/pre-commit` | every contributor's pre-commit | None on husky ^9; `pre-push` on main still has old form |
| `package.json` `pw:ui` | none | Additive |

## Confirmed Issues

### 1. [Confirmed] Parallel page-object / path / helper layer duplicates `ui/table-registry`
ui/projection-forms/pages/create-projection-wizard-page.ts:11, pages/projection-detail-page.ts:12, pages/table-projections-page.ts:11, projection-forms-ui-paths.ts:3-31, helpers/create-projection-flow.ts:14-26, 73-84, 103-129 — second `class CreateProjectionWizardPage` (main: ui/table-registry/pages/create-projection-wizard-page.ts:9), `ProjectionDetailPage` vs main `ProjectionDetailsPage` (projection-details-page.ts:7), `TableProjectionsPage` vs main `TableDetailsPage` (table-details-page.ts:7, already has createProjectionButton/projectionRow/openProjectionsTab), URL builders re-declaring `TABLE_REGISTRY_UI_PATHS` (weaker: unescaped patterns, `tab=projections` must be first query param), `loginAndOpenTableProjections` and wizard flow overlapping `ui/table-registry/helpers/projection-flow.ts:28`.
Fix: extend/parameterise the table-registry page objects, paths and helpers; if a parallel module is unavoidable, say why in the MR and rename the colliding class.

### 2. [Confirmed] `ProjectionRuntimeRecordPage` is a third runtime page and is not a `BasePage`
ui/projection-forms/pages/projection-runtime-record-page.ts:4, 7, 49, 147 — owns a URL and its own `goto` without extending `BasePage`; re-implements testids already on main (`runtime-record-id-select`, `runtime-op-*`, `runtime-current-space`, `projection-record-see-confirm`, `app-breadcrumb`, `sidebar-company-select`) from ui/basic-customization/pages/projection-runtime-page.ts and ui/document-management/pages/projection-runtime-page.ts; `RuntimeOperation` duplicates main's type; `fieldRoot` drops `escapeCssAttribute`.
Fix: extend `BasePage` and reuse/extend the existing runtime page and `projection-runtime.values.ts`.

### 3. [Confirmed] Operation Day policy select anchors on placeholder text that disappears after the first selection
ui/projection-forms/pages/create-projection-wizard-page.ts:41-44 — a second `selectOperationDayPolicy` cannot find the control. Main uses the stable testid `basic-step-operation-day-policy` (main create-projection-wizard-page.ts:42).
Fix: use that testid.

### 4. [Confirmed] Setup fixture re-implements stale-group healing instead of `createTableAndWait`
ui/projection-forms/fixtures/projection-forms-setup.ts:30-65 (magic delays :30, `delay()` sleeps :39, fallback group :51-64) — `createTableAndWait` on main already redirects via `resolveActiveGroupId` (api/system_core/helpers/table-registry-helper.ts:696-702); sibling fixtures (ui/field-registry/fixtures/field-registry-setup.ts, ui/override-dispo/fixtures/*) call it directly. The fallback creates a dedicated group nothing cleans (`cleanupTables` is tables-only) and a bare console.warn hides that the shared group is unusable.
Fix: call `createTableAndWait` directly; if a retry is truly needed fix it in table-registry-helper, not per fixture.

### 7. [Confirmed] Table/projection provisioning copy-pasted about six times, some inside UI test bodies (layer)
ui/projection-forms/tests/pf-record-lifecycle.spec.ts:31-120, 1279-1385 (TC-4103), 1394-1480 (FIN fixture), 3378-3428 (TC-3983 inline INT projection), 3524-3617 (confirmation helper), 3909-3992 (CUS shared), 3994-4077 (CUS not shared); pf-update-projection.spec.ts:92-159 (TC-4244, about 65 lines of API orchestration) — same createTableAndWait -> updateTableDefinition -> waitForTableField -> inputProjectionDefinition body; only classification/type/authOperationRequired/field id differ. `FinLifecycleProjection` type equals `LifecycleProjection`; `CusLifecycleProjection` too. API orchestration belongs in `api/` or fixtures per architecture.md.
Fix: one `createLifecycleProjection({ classification, type, sharedRules, authOperationRequired, confirmations })` factory in ui/projection-forms/helpers/ used by all fixtures and inline cases; one `LifecycleProjection` type.

### 8. [Confirmed] State built through the UI where `ProjectionRecordApiClient` already exists; setup chains copy-pasted
pf-record-lifecycle.spec.ts:308-313, 348-353, 417-422, 463-472, 505-510, 556-565, 611-620, 655-660, 703-712, 752-763, 810-819, 846-851, 919-928, 981-994, 1025-1041, 1079-1084, 1127-1143, 1178-1189, 1226-1232 (INT) and the authoriser setup at 1691-1706, 1785-1799, 1850-1897, 1907-1997, 2014-2028, 2129-2178, 2189-2262, 2272-2342, 2352-2452, 2462-2532, 2579-2647, 2657-2718, 2729-2790, 2800-2913, 3046-3064; pf-projection-runtime.spec.ts:18-34, 55-73, 86-105, 128-146, 159-178, 195-213, 231-249, 262-285, 303-321, 334-362, 391-409, 422-438, 451-469, 482-500 (14 tests x about 20 identical lines); pf-assemble-projection.spec.ts:278-286, 391-399 (11 per-test provisions for read-only checks); pf-field-customization.spec.ts:61-77, 135-155, 332-345, 570-583, 803-816, 1376-1393 (wizard; TC-4040/4086/4064 only inspect designer behaviour already covered by `openLayoutTab`); pf-update-projection.spec.ts:51-57, 306-312, 353-359, 398-409 (hook setup). `ProjectionRecordApiClient` (main api/system_core/client/projection-record-api-client.ts: inputRecord, authoriseRecord, seeRecord) is unused anywhere in ui/; TC-4103 already seeds via raw INSERT, so the pattern is known. Each authoriser logs in again in a fresh context per test (and per loop iteration).
Fix: extract shared helpers (`seedRecordVersions`, `authoriseAs`, `configureFieldAndOpenRuntimeInput`, `createProjectionViaWizard`, `configureHookRow`), API/DB-seed every version that is not the operation under test, and use a worker-scoped read-only projection for read-only cases.

### 9. [Confirmed] `PluginManagerPage` additions are unused by this MR
ui/plugin-manager/pages/plugin-manager-page.ts:8-12, 18-25, 36-48 — locators `createPluginModal`, `pluginNameInput`, `pluginFileInput`, `createPluginSubmitButton`, `notification` and methods `pluginRow`, `viewButton`, `createPlugin` have zero consumers in the MR tree (plugin upload on main is API-side: api/system_core/client/plugin-manager-api-client.ts:32 `uploadPlugin`). A shared page object changed by a ticket that does not use the change; selectors are CSS-class/name based (`.ant-table-row[data-row-key=...]`, `.ant-notification-notice`, `input[name="name"]`).
Fix: drop the additions from this MR or add their consumer in the same MR.

### 14. [Confirmed] TC-4044 is red by construction and ships a known product defect with provenance in step name and message
ui/projection-forms/tests/pf-field-customization.spec.ts:1143-1158 (and 1136-1141 asserts on the live canvas without reopen) — asserts `behaviorGroupMemberToggle(FLD2)` is visible while the step title and message themselves state this control does not exist ("confirmed product defect ... contradicting AC4").
Fix: remove that step, mark the case Not Automatable, escalate to BA/Dev; keep only the passing Require-per-member assertions with behavioural step names.

### 15. [Confirmed] TC-4037 builds the field list by reflection and swallows every error
ui/projection-forms/tests/pf-field-customization.spec.ts:366-393 (casts 367-370, key filter 372-376, empty catches 379/388/390, always-true typeof 387) — keys containing "title" include string fields, so `Object.values('Related Key')` yields single characters and `addStandaloneFieldToCanvas('R')` runs, fails after the full modal-retry timeout and is swallowed; no key contains both "group" and "title", so the group loop never runs; "Name Group" and LINK_USER_GROUP are never added; the outcome depends on swallowed failures.
Fix: add the fields explicitly from `fieldTitles`, `maskFieldTitles`, 'LINK_USER_GROUP', 'Name Group' with no catch, then assert the empty placeholder.

### 16. [Confirmed] Titles/steps claim "save and reopen" but the body never reopens
pf-field-customization.spec.ts:505-511 (TC-4050), 661-666 (TC-4058, fill then toHaveValue on the same input), 975-976 (TC-4076, nothing asserted), 1188-1197 (TC-4095), 1257-1258 (TC-4110), 1172-1181 (TC-4092), 1363-1366 (TC-4158, group deletion never asserted), 1136-1141 (TC-4044); pf-update-projection.spec.ts:689 (TC-4256), 734 (TC-4259), 1011 (TC-4265) — assertions hold on live-page state that was true before any save.
Fix: reopen with `reopenLayoutTab` / `reopenProjectionDetailUntil` after each save and assert there.

### 17. [Confirmed] pf-field-customization.spec.ts: title/body mismatches and assertions that cannot fail for the claimed reason
Mismatch: 283-289 (TC-4085 adds no field, canvas never checked), 617-624 (TC-4054 "exactly 5 sections" iterates 4, collapse state unasserted), 629-636 (TC-4055 `assertSelectedFieldReadOnly` only checks a link href), 88-125 (TC-4035 "Currency" vs field title Country, nothing verified between open and close), 766 (TC-4065..4067 "Preview Mode" never touched), 888-898 (TC-4071 "City is already required" — it is not; OFF asserted after OFF), 913-929 (TC-4073 runtime override never exercised), 1088-1114 (TC-4081 "each field type" covers DATE_TIME only), 732 (TC-4063 says First Name, edits City), 1277 (TC-4084 no Then-action), 1010 (TC-4077 no retrieval step). Cannot fail: 944-949 (TC-4074 radio already checked), 968-973 (TC-4076 `not.toContainText('Last Name')` true regardless), 705-708 (TC-4061), 559-562 (TC-4053), 588-598 (TC-4086 no fullscreen locator), 434-447 (TC-4046/4047 Heading vs Divider indistinguishable), 456-465 (TC-4048), 478-483 (TC-4049), 207-221 (TC-4038), 229-235 (TC-4041), 349-354 (TC-4040).
Near-duplicates: 292-309 (TC-4087) vs 311-325 (TC-4150, asserts only length > 0); 639-652 (TC-4056) vs 728-741 (TC-4063); 1172-1182 (TC-4092) vs 1253-1259 (TC-4110); 1020-1038 (TC-4090) vs 1040-1058 (TC-4091, differ by NOINPUT/HIDDEN); 1200-1216 (TC-4098) is a subset of 1218-1239 (TC-4101).
Fix: assert the discriminating state per test (reopen, option-set equality, type-specific canvas locator, entered-fullscreen locator, linked-default field values); loop parametrisable pairs like `BEHAVIOR_TOGGLE_CASES`; make the siblings distinct.

### 18. [Confirmed] pf-assemble-projection.spec.ts: titles claim more than the body proves
TC-4031 640-663 (claims backend flag, only toggle state, same as TC-4030 617-638), TC-4029 585-615 (fullscreen never asserted), TC-4015 441-467 (only `toContainText('Input')`, a prefilled default; chips never asserted), TC-4016 469-501 (four operations set, two asserted), TC-4017 503-529 (EN text not re-asserted), TC-4014 434-437 (`every` true on empty list; allowed set wider than the empty `properties: {}` fixture can offer), TC-4007 301-314 and TC-4009 316-325 (selection never asserted), TC-4026 561-581 (asserts full dropdown incl. SEE/VALIDATE, duplicate of TC-4007 305-310, sits in Associations describe), TC-4012 375-383 (step "not stripped (defect)" asserts digits-only i.e. stripped; known defect left unmarked; exact value not asserted at 361-372), TC-3984/TC-4024 56-57, 66-67, 550-557 (conditional `if (firstOption)` can pass with zero assertions; `[firstPlugin]` unverified; `associationTargetProjectionId` exists), TC-3984 27-80 (dead `authorizationRequired` input at 42 never read by `fillBasicStep`; label step is a no-op equal to the existing title; only FLD1 block visible asserted), TC-3999 170-191 (subset of TC-3984; FR never verified), TC-4000 193-221 (step says "submit", only clicks Next).
Fix: assert persisted state after reopen, loop assertions over the same operation list, drop conditionals, escalate/annotate the TC-4012 defect.

### 19. [Confirmed] pf-view-projection-details.spec.ts: "View" tests are save round-trips built through the UI; steps do not wrap their actions
pf-view-projection-details.spec.ts:57-74, 124-128, 167-171, 241-249 (hooks, custom messages, association, scheme rule created via UI then re-read; `associations` could be API-seeded: projection-forms-ui-test.ts:39-49, projection-forms-setup.ts:285-298), step "link an association" wraps only the open (159 vs 167-171), step "add a Scheme Rule condition" wraps only the open (233 vs 241-249), TC-4297 242-244 unrelated field/Require steps and `getConditionFieldValue` textContent `toBe` (projection-rule-builder.ts:82-84), TC-4294 59-72 (no non-empty plugin precondition, both hooks use the same plugin).
Fix: seed via API where supported or wrap setup in a matching step; assert plugins exist and use two different plugins; compare with `toContain`.

### 20. [Confirmed] pf-update-projection.spec.ts: weak, wrong or vacuous scenarios
TC-4265 1002-1032 (adds French which the fixture already has; fills ru-RU never added; persistence covers fr-FR only), TC-4254 619-664 and TC-4253 584-615 (radio already checked after first save; linked field / variable value never asserted), TC-4248 322-338 (`plugins[1] ?? plugins[0]` silently falls back), TC-4244 164-179 (post-state `toContainText('Required')` only, no initial value, expect outside a step), TC-4260 760-804, TC-4261 806-842, TC-4259 714-734, TC-4253 584 (title says update, body adds/switches; Divider never identified or moved), TC-4263 906-921 (message claims variable check; `assertChipPresent` unused), TC-4263/TC-4270 894-958 (4270 is a superset of 4263), TC-4270 936, 953-956 (unverified AUTH default; vacuous `toHaveText('')`), TC-4247 255-288 (condition field never asserted), TC-4242 45-62, 73-82 (layout saved implicitly by a tab click; hook values unchecked), 1090 and 1147 (`toggleRequire` without selecting the block, toggle unverified), TC-4249 383 (count only; both hooks share order 1), TC-4264/TC-4266 984-987, 1067-1070 (negative without positive control), `beforeEach` 441-459, 532-545 (no-op label write, runs outside a step, describe-level `let`).
Fix: assert initial and changed state, use a language the fixture lacks (es-ES), assert `plugins.length >= 2`, rename titles to what the body does, differentiate or merge 4263/4270.

### 21. [Confirmed] pf-projection-runtime.spec.ts: behaviour tests that pass without proving the behaviour
TC-4581 145-151 (HIDDEN: `toBeHidden` on a single-field form, no positive control, toggle never verified), TC-4591 330-385 (mask: typed text echoes; unambiguous 31/12/2026; maskSelect never verified), TC-4584 251-254 (non-retrying `inputValue`, `not.toBe('')` accepts any text), TC-4585 286-295 (reads FLD3 once after save has left /INPUT), TC-4580 83, 115-120 (title "after authorization" but `authOperationRequired:false`), TC-4578 44-47 (message claims editability; no reopen), 64, 95, 137, 168, 240, 312, 344, 400, 460, 491 (setBehavior/toggleRequire never verified though `assertOnlyBehaviorChecked`/`assertRequireState` exist), TC-4576 440-443 (negated class check with no positive control), 75-78, 117-120, 184-187 ("read-only" asserted via `toBeDisabled`).
Fix: add a positive control (visible sibling/Save button) and verify the toggle took effect; use auto-retrying `toHaveValue` with the expected value on the INPUT form; use an ambiguous date; rename TC-4580.

### 22. [Confirmed] pf-record-lifecycle.spec.ts: statuses named in titles are never asserted; AUTH-disabled proves nothing about HOLD
Spec lines 1509 (TC-3974 UNAU), 499 (TC-3971 REVE), 1610-1631 (TC-4594), 2266-2344 (TC-4107 RNAU), 2536-2571 (TC-4111 HOLD), 2573-2649 (TC-4112 HNAU), 2651-2721 (TC-4113 RNAU), 2723-2792 (TC-4115), 2794-2915 (TC-4116), 2917-2970 (TC-4118), 2972-3008 (TC-4119), 2001-2074 (TC-3981); messages at 1601, 1668, 1750, 1823, 2054 claim a discrimination the assertion does not make. `recordStatusTags` exists in the page object and is used only for the CUS tests (3209, 3264); nowhere in 1-3050. AUTH-disabled for a HOLD draft (2069-2072, 2963-2966) is true for the inputter in every status (TC-3980 1578-1581); a second user is the real discriminator (as TC-4120 3057-3060).
Fix: assert `recordStatusTags` wherever a title/step names a status; prove HOLD/UNAU AUTH availability in a second-user session or drop the claim.

### 23. [Confirmed] pf-record-lifecycle.spec.ts: title/body mismatches and near-duplicate scenarios
Mismatch: 697-743 (TC-4097 v2 value never read), 456-496 (TC-3970 "HIS should be manual" tautology), 1171-1211 (TC-4593 no diff asserted), 1120-1169 (TC-4169 "every version"/"same layout" not checked; toast tail irrelevant), 1275-1386 (TC-4103 table is hand-built SYS, not auto-generated), 3167-3277 (TC-4136 and TC-4592 identical; also 4471-4484 TC-4130; neither compares a1/a2 values), 3658-3689 (TC-4608 subset of TC-4607 3694-3821), 3627-3654 (TC-4597 = TC-4612 3870-3897), 3824-3866 (TC-4609 `{status}` never asserted; projectionName equals projectionId; regex ignores digits/underscores; literal `{FIN_FLD1}`), 2651-2721 (TC-4113 no "removed from NAU" check), 2905-2909 (TC-4116 content not asserted), 4313-4314 (TC-4129 "all companies" checks MOCK only), 3376-3377 (TC-3983 one direction), 1770-1836 and 2123-2180 (titled SEE, SEE never invoked), 1583-1592 (TC-3980 `toHaveCount(0)` passes instantly). Duplicates: 235-252 (TC-4595) vs 141-194 (TC-3965); 196-233 (TC-3964); 1610-1631 (TC-4594) vs 1508-1552 (TC-3974); 4087-4119 (TC-4124) vs 1509-1555 (TC-3974); 4123-4174 (TC-4125) vs 1839-1900 (TC-3978); toolbar matrix repeated in TC-3964/3966/3971/3974.
Fix: assert what each title says (or narrow it), make duplicates assert something distinct or merge, centralise the toolbar matrix in one helper.

### 24. [Confirmed] `getCurrentSpaceOptions()` returns a fake one-item list when the select cannot open
ui/projection-forms/pages/projection-runtime-record-page.ts:195-204 (silent catch, fallback `[currentText]`) — consumed by pf-record-lifecycle.spec.ts:374-377, 489-490, 525-526, 593-600, 740-741, 779-780, 872-873, 999-1002, 1109-1110, 1672-1674, 1880, 1981, 2424, 2634, 2902, 2952, 3006: `toEqual(['NAU'|'HIS'])` pass by construction and `not.toContain(...)` pass vacuously when the dropdown is unavailable.
Fix: throw or log in the page object; in tests asserting absence first assert the dropdown opened.

### 25. [Confirmed] Notification assertions prove "some toast", not success
projection-runtime-record-page.ts:32, 38, 124 (`.ant-notification-notice.last()` includes error toasts) — asserted with message "A success toast should appear" at pf-record-lifecycle.spec.ts:163, 271, 324, 364, 433; duplicate toast checks repeat what `openOperation` already enforces (1702, 1872, 2309, 2504, 2556, 2628, 2702, 2834, 2884).
Fix: assert success text/class or the resulting status/space change, and drop the duplicates.

### 26. [Confirmed] Leaked tables, users and contexts on failure paths
pf-update-projection.spec.ts:92-179 (TC-4244 creates a FIN table, field and projection, nothing tracked/deleted/disposed — leaks one table per run into the shared environment); pf-record-lifecycle.spec.ts:1223-1271 (user provisioned before try; close() and deleteDashboardUser share one finally), 1282-1287 (apiContext/dbClient before try), 1694-1706, 1788-1799, 1853-1858, 2014-2028, 2804-2805 (provision/login outside try), 1920-1927, 2141-2148, 2200-2207, 2283-2290, 2365-2372, 2475-2482, 2593-2600, 2670-2677, 2741-2748, 3185-3192, 3240-3247 (close() not in finally), 3284-3289, 3381-3386, 4241-4246, 4317-4322, 4391-4396, 3076-3080, 3709, 3430-3447, 3325-3330 (users/contexts outside try), sequential teardown 3369-3370, 3516-3517, 4306-4307, 4380-4381, 4501-4502, 3817-3818, 3160-3161, 3511-3513, `createConfirmationMessageProjection` 3524-3617 (cleanup handed back only at 3602). `auth-ui-test.ts` already offers a `dashboardUser` fixture with try/finally teardown and `dashboardUserOptions`.
Fix: move provisioning into fixtures (authoriser user, company-scoped user via `dashboardUserOptions`, FIN projection) with teardown, give each disposal its own finally layer.

### 27. [Confirmed] Empty or silent catches
pf-field-customization.spec.ts:379, 388, 390 (`.catch(() => {})`); pf-record-lifecycle.spec.ts:1496 (`page.goto('about:blank').catch(() => {})`); projection-detail-page.ts:84 (`.catch(() => false)`); projection-runtime-record-page.ts:98 (`.catch(() => null)`), 103 (`.catch(() => false)`), 195-204 (`catch {}`) — repo rule: every catch logs or rethrows. If `spaceBeforeAuth` is null, `expect(spaceNow).not.toBe(null)` passes vacuously (:98, :136).
Fix: console.debug/warn or rethrow in every catch.

### 28. [Risk] Side-effecting polls, a hidden save inside "open tab", and an overloaded `openOperation`
Spec lines 996-1003, 1034-1039, 1043-1053, 1136-1141, 1145-1161, 1241-1248, 1258-1264, 1710-1726, 2603-2611, 2752-2759, 2821-2860, 3098-3158, 4146-4152, 4273-4279, 4439-4446 (`goto`/`reload`/`enterRecordId`/`openOperation('INPUT'|'RESTORE')` inside `toPass`; 1010-1014 wraps three unrelated assertions); page objects: projection-runtime-record-page.ts:96-140 (`openOperation` does four behaviours; reloads in a poll; nests `toPass` via `enterRecordId` :78; `toHaveURL` right after the click :115, the MR 269 flake pattern), :170-177 (`save()` refills and re-clicks per retry, hidden `lastFilledField` state), projection-detail-page.ts:79-90 (every `openXTab` waits up to 5 s for an unsaved-changes prompt, and on the prompt saves and re-clicks, so opening a tab mutates persisted state; the guard is never exercised by a spec), projection-designer-canvas.ts:93-104 (`addStandaloneFieldToCanvas` re-clicks Add inside `toPass`, may add a field twice).
Fix: poll only the read-side condition, perform the action once, split `openOperation` per operation, wait for the URL, replace the 5 s probe with a deterministic signal or an explicit `saveIfPrompted`.

### 29. [Confirmed] Preconditions not verified before the next step
pf-record-lifecycle.spec.ts:308-313, 348-353, 417-422, 463-472, 505-510, 556-565, 611-620, 655-660, 703-712, 752-763, 810-819, 846-851, 919-928, 1079-1084, 1178-1189 (INPUT/save/REVERSE with no outcome assertion; the same file does it right at 895, 986, 993, 1032-1039, 1134-1141, 1231), 1795, 1926, 2147, 2206, 2289, 2371, 2481, 2599, 2676, 2747 (AUTH not confirmed; TC-3977 re-opens INPUT before asserting LIV=a1), 2543-2548, 2979-2984, 3017-3022 ("HOLD draft" never checked); pf-field-customization.spec.ts:1203-1215, 1222-1237, 1288-1289, 1293-1299, 1305, 1131; pf-update-projection.spec.ts:1090, 1147, 213-214, 369, 418; pf-projection-runtime.spec.ts (toggles, see 21).
Fix: assert the precondition state (status tag, LIV value, toggle checked) inside the precondition step.

### 30. [Risk] Read-after-write lag is documented in this MR but only some tests retry; the new constant is barely used
ui/base/constants/ui-timeouts.ts:12-18 documents that a save can lag a reopen and that only a fresh navigation helps; `reopenProjectionDetailUntil` (create-projection-flow.ts:55-71) is used only at pf-update-projection.spec.ts:511 — pf-assemble-projection.spec.ts:72-78, 411-419, 454-465, 484-499, 515-528 and most of pf-update-projection.spec.ts use single-shot reopen; pf-view-projection-details.spec.ts:101-104, 145-148, 191-194, 263-266 and pf-update-projection.spec.ts:1029-1032 hard-code `15000` (smaller than the 60 s the constant promises); pf-record-lifecycle.spec.ts uses `20_000` 44 times; `UI_RECENT_WRITE_READ_RETRY_TIMEOUT_MS` has one consumer. The justification ("backend hadn't committed") means a data-visibility race is masked by a 60 s retry-with-reload rather than an awaited signal.
Fix: route every persistence check through one retry-capable helper using the named constant and `UI_DEFAULT_RETRY_INTERVALS_MS`; confirm the race with the backend team or poll an API-level readiness signal.

### 31. [Risk] Raw toolbar clicks bypass `openOperation`; one unretried post-AUTH assertion
pf-record-lifecycle.spec.ts:3764-3765, 3795-3796 (AUTH click + confirm), 3810 (REVERSE click, no confirm or space check) vs `openOperation` elsewhere (3107); 4280-4285 (TC-4128 asserts LIV straight after the toast, unlike 4163-4172).
Fix: use `openOperation` for AUTH/REVERSE and match TC-4125's poll.

## Possible Risks

### 5. [Risk] Setup fixture hard-codes a globally-unique field id, duplicates payloads and literals
projection-forms-setup.ts:126 (`LINK_USER_GROUP`, field ids are global in CBS while every other id uses `generateCustomId`; referenced from pf-field-customization.spec.ts:745, 1174-1258), :99, :109, :111, :271 (titles), :273 (raw URL via `client.post`), :244-263, :286-293 and projection-forms-ui-test.ts:39-49 (three near-identical blank projection payloads), projection-forms-ui-test.ts:43 (`'en-GB'/'fr-FR'` vs `LANGUAGE_ID`), fixture name `projectionWithLayout` (ui-test.ts:33-60) implies a layout but the schema is empty, per-test projections are never tracked and rely on worker teardown. 'Name Group' and 'LINK_USER_GROUP' are also not exposed on `ProjectionFormsPreconditions`.
Fix: generate the id via `generateCustomId`, extract `buildBlankProjectionPayload`, use `LANGUAGE_ID`, expose the seeded ids, rename the fixture.

### 6. [Risk] Setup teardown can mask the original failure and leak the API context
projection-forms-setup.ts:326-340 (`createDbClient()`/`connect()` outside try), :315-324 (a throwing `cleanupTables` surfaces from worker teardown, projection-forms-ui-test.ts:27).
Fix: wrap connect in the try as ui/field-registry/fixtures/field-registry-setup.ts does.

### 11. [Risk] `SchemaProperty.items.properties` addition is dead and overlaps an existing type
api/types/table-definition.types.ts:21-26 — the only builder of a group field (projection-forms-setup.ts:179-202) passes an untyped literal to `updateTableDefinitionAndWaitForFields` (accepts `Record<string, unknown> | TableDefinitionRequest`), so the type change is never checked; `PropertyXType` still lacks 'TIME' used at setup:162; main's `TableFieldSchema` (api/types/table-registry.types.ts:139-155) already models nested `properties`/`items`.
Fix: type the setup literal as `TableDefinitionRequest` (add 'TIME') so the addition earns its place, or drop it and reuse `TableFieldSchema`.

### 32. [Risk] Selectors depend on CSS-module classes, DOM position, wording, and non-exact substrings
create-projection-wizard-page.ts:40, 43, 81; projection-designer-canvas.ts:39, 44, 46-48, 64, 76, 78, 82, 86, 90, 111, 119, 123, 128-133, 203, 236; field-properties-panel.ts:83, 207; projection-hooks-tab.ts:23-24, 28, 32-37, 40, 50, 83-85, 93, 137, 165; projection-rule-builder.ts:20-24, 83; projection-detail-page.ts:52, 60-63, 131; projection-settings-tab.ts:21; table-projections-page.ts:25-26; projection-runtime-record-page.ts:34-35, 58 (`getByText('SEE REC1')` also matches REC10), 72, 74, 147, 151, 156-159, 176, 188, 209, 227 — CSS-module class fragments, `..`/`../..` hops, heading level, `.first()`/`nth`, UI wording, unescaped values (main has `escapeCssAttribute`, ui/utils/selector-helpers.ts:5), `getByRole('button', {name: 'Add X'})` substring matches (main anchors with `^Add id\b`). `restoreVersionButton` (runtime page :216-222) XPath predicate `@type="button" or ...` matches almost any button. `ProjectionHooksTab` roots at the whole body (:23-24) and has duplicate singular/row-indexed `select*` methods; `ProjectionDesignerCanvas` roots at `page.locator('body')` (:34-36; instantiated at create-projection-wizard-page.ts:52 and projection-detail-page.ts:69).
Fix: use data-testids or role + accessible name, anchor regexes, apply `escapeCssAttribute`, scope each component to a testid root, delete the duplicate selectors.

### 33. [Risk] Vacuous or fragile page-object assertions and a fragile drag
field-properties-panel.ts:246-251, 266-271 (pass if the panel never rendered), :262 (`toBeVisible` for "editable"), :111-116 (`assertSelectedFieldReadOnly` only checks an unescaped link href); create-projection-wizard-page.ts:109-122 (`assertPrefixNotEditable` clicks a span and presses Backspace), 92-96, 103-107 (placeholder as "generated id", `toPass()` with no timeout), 98-101 (`textContent()` throws, fallback dead); projection-detail-page.ts:75-77 (`assertDisplayed` checks a tab only), 131, projection-hooks-tab.ts:164-166 (wait on a toast string a stale toast satisfies); projection-designer-canvas.ts:161-188 (`reorderCanvasBlockAbove`: raw mouse coordinates, no scrollIntoView, drops on the exact top edge, result unasserted); helpers/create-projection-flow.ts:119-124 (reads wizard DOM while navigating away, no `waitForUrlPattern` as main's `submit` does).
Fix: add real preconditions, state-based assertions (`not.toBeEditable`, `toBeEditable`), offset the drop point and assert the order.

### 34. [Risk] Contradictory DATE_TIME mask definitions
constants/projection-forms.values.ts:46 (`'DD/MM/YYYY HH:MM:SS'`) vs test-data/projection-forms.scenarios.ts:19 (`['DD/MM/YYYY HH:MM']`) vs pf-field-customization.spec.ts:1103, 1113 (`HH:MM`) vs pf-projection-runtime.spec.ts:352 (`HH:MM:SS`). Which is correct against the live UI was not verified.
Fix: keep one `MASK_OPTIONS` used by both specs and the scenarios.

### 41. [Risk] A single 4,507-line spec holding four independent concerns
pf-record-lifecycle.spec.ts (3 `extend` chains, 4 top-level describes, about six copy-pasted fixture bodies, 40+ tests; `openRuntimeAsNewUser`, `openRuntime` and local `test.extend` objects are defined inside the spec, breaking the "fixtures per module in fixtures/" convention).
Fix: split into pf-record-lifecycle-{int,fin,cus,confirmation}.spec.ts and move `openRuntimeAsNewUser`, the lifecycle factory and the badge-column helper into helpers/ and fixtures/.

## Nice-to-Have Improvements

See `cosmetic_analysis.md` (items 10, 12, 13, 35-40).

## Necessity Citations

| Decision | Citation |
|---|---|
| `ui/projection-forms/` module layout (pages/components/helpers/fixtures/constants/test-data/types/tests/paths) | docs/frame-specs/architecture.md UI module shape — justified |
| Components extend `BaseComponent`, named Tab/Panel/Canvas/Builder | architecture.md BaseComponent rule — justified |
| Comboboxes via `selectComboboxOption` / `readComboboxOptionLabels` | main ui/base/interactions/antd-virtualized-dropdown.ts:162,181 — correctly followed |
| `generateCustomId` for record ids | api/utils/helpers/dynamic-name-generator — correctly followed |
| `allureCaseId` second argument | api/utils/helpers/allure-case-link — correctly followed |
| `reopenProjectionDetailUntil` | create-projection-flow.ts:55-71 + ui-timeouts.ts:11-17 — justified by documented lag, but under-used |
| Parallel table-registry page layer (item 1) | none found — duplicate of main ui/table-registry/** |
| Runtime page object (item 2) | none found — duplicates basic-customization/document-management pages |
| Group-heal retry in setup (item 4) | none found — `createTableAndWait`/`resolveActiveGroupId` already covers it |
| PluginManagerPage additions (item 9) | none found — no consumer |
| `pw:ui` script | none found |
| `.husky/pre-commit` edit | none found — not mentioned in ticket/commits; `.husky/pre-push` on main keeps old form |
| `SchemaProperty.items.properties` (item 11) | none found — setup does not type against it |
| `UI_RECENT_WRITE_READ_RETRY_TIMEOUT_MS` | documented in ui-timeouts.ts:11-17; overlaps UI_DROPDOWN_SEARCH_TIMEOUT_MS (60_000); single consumer |

## Orphaned Code (safe to remove?)

- constants/projection-forms.values.ts: PROJECTION_FORMS_ERROR_IDS (:1-9), PROJECTION_FORMS_CONFIRMATION_OPERATIONS (:23-30), PROJECTION_FORMS_VARIABLE_DEFAULTS (:39), PROJECTION_FORMS_FIELD_BEHAVIORS (:41), PROJECTION_FORMS_MASK_OPTIONS (:43-47), UI_CONSTS members DEFAULT/SECONDARY/TERTIARY_LANGUAGE_ID (:56,59,60), the four placeholder strings (:61-64), FORM_COMPONENTS (:65), FIELD_SETTINGS_SECTIONS (:66-72), DETAIL_TABS (:73-80) — no consumer in ui/ or api/. Safe to remove?
- test-data/projection-forms.scenarios.ts: CONFIRMATION_MESSAGE_OPERATIONS (:22; also a different list than PROJECTION_FORMS_CONFIRMATION_OPERATIONS), INVALID_PROJECTION_ID_SUFFIXES (:24-26). Safe to remove?
- types/projection-forms.types.ts: HookStage (:27), HookFormValues (:29-34), DefaultKind (:36); `FieldBehavior`/`VariableDefaultValue` duplicate the `as const` arrays; `BasicInfoFormValues.authorizationRequired` (:46) is never read by `fillBasicStep`. Safe to remove?
- projection-forms-ui-paths.ts: TABLE_DETAIL.* (:4-8), CREATE_PROJECTION.URL_PATTERN (:12,18-19), PROJECTION_DETAIL.URL_PATTERN (:24-25). Safe to remove?
- pages: create-projection-wizard-page.ts `assertAuthorizationRequiredDisabled`, `assertNextStepEnabled`, `clickPreviousStep`, `languageChip`, `stepIndicator`, `WizardStep`; projection-detail-page.ts `assertSaveProjectionDisabled`, locator `validationRulesTabButton`; projection-runtime-record-page.ts `switchCompany`, locator `currentSpaceBadges`; table-projections-page.ts `openCreateProjectionModal`, `createProjectionModalContent`, `openProjection`, locators `emptyStatePlaceholder`, `projectionsTab`. Safe to remove?
- components: field-properties-panel.ts `assertMaskOptionsForFieldType` (TC-4080 inlines the same check at pf-field-customization.spec.ts:1073-1076), `selectedFieldHeader`; projection-designer-canvas.ts `togglePreviewMode`, `formComponentsSection`, `groupFieldsButton`; projection-hooks-tab.ts `assertSaveHooksDisabled`, `assertSaveHooksEnabled`, `operationValueDisplay`, `stageValueDisplay`; projection-settings-tab.ts `assertDefaultMessagePrefilled`, `localeSwitcher`. Safe to remove?
- plugin-manager-page.ts additions (item 9). Safe to remove?
- helpers: `reopenProjectionDetail` (create-projection-flow.ts:43-53) unused by pf-field-customization.spec.ts which re-implements `reopenLayoutTab`.

## Per-line pass confirmation

Every changed line of every changed file was covered by a Judge pass in 150-420 line windows (shared/infra and support files; 10 pages/components; pf-assemble 1-666 and pf-view 1-272; pf-field-customization 1-1409; pf-update-projection 1-1186; pf-projection-runtime 1-509; pf-record-lifecycle 1-1550, 1550-3050, 3050-4507). No changed file was left with zero findings. Four claims were re-verified by me against the refs: duplicate class names on main, the four empty-catch sites, the TC-4044 step text, the duplicate `assertDisplayed`, and the `.husky/pre-push` content on main.

## Changelog

- 2026-10-02 — initial analysis (this file).
