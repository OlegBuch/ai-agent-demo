# Final Analysis — MR !61 (TB-1533: Projection Forms & UI Framework - Smoke)

## Summary

TB-1533 ("Test implementation: Projection Forms & UI Framework - Smoke", Highest priority, status
"In Code Review") asks for the smoke TC set for EP-01.06 ("Projection Forms & UI Framework") per
the linked Confluence spec and the Google Sheet TC list. The spec's smoke-relevant scope is
TRC-01..09 (Projection Definition Engine, field overrides, auto-defaulting, layout/grouping,
validation hooks, transaction governance, operations hooks, resolution waterfall, transaction
confirmation) with four Acceptance Criteria (AC-SCR-01..04: schema-on-read, override enforcement,
auto-defaulting, audit trail). The diff adds one large new spec,
`api/system_core/tests/projection-forms-smoke.spec.ts` (1225 lines, 10 `TC-<n>` cases tagged
`@smoke_m2`/`@api`), a brand-new `PluginManagerApiClient` + paths/values files (Plugin Manager was
previously unautomated), a new `inputProjectionDefinition` client method reusing an existing path
constant, `postMultipart`/`putMultipart` additions to `BaseApiClient` for JAR upload, a widened
envelope-unwrap/list-extraction helper set in `projection-helper.ts`, minor type-gap fixes, and a
committed binary plugin JAR fixture. MR !61's actual diff against `main` is 17 changed files, 1977
insertions / 16 deletions (`.gitlab-ci.yml`, Kafka files, `table-registry-helper.ts`,
`group-cleanup-helper.ts` already exist on `main` from the separately-merged TB-1354 Kafka CI/CD
work and are not part of this MR).

## Confirmed Issues

**[Blocking] `afterAll` deletes the shared worker-scoped table group, breaking isolation for every other suite sharing it.** `projection-forms-smoke.spec.ts:201-202` assigns `testGroupId = workerGroupId` and pushes it into `createdGroupIds`; `:236`/`:254-256` then unconditionally loops `createdGroupIds` and calls `cleanupClient.deleteGroup(groupId)` on it in `afterAll`. `workerGroupId` (`api/utils/api-fixtures.ts:14-26`) is a worker-scoped fixture meant to persist across every spec file in the run — the sibling `system-parameterization-smoke.spec.ts:48-51,82-85` reads the same fixture and never deletes it. Any other `@smoke_m2`/`@regression` spec sharing this group in the same CI worker will start failing with 404s once this spec's `afterAll` runs. **Fix:** never push `workerGroupId`-derived ids into `createdGroupIds`; only track/clean up a group this spec actually creates itself (currently none).

**[Blocking] Five smoke test cases carry unresolved "Failed"/"Blocked" defect markers with no quarantine, inside the exact tag this MR's own CI job runs on every merge request.** `projection-forms-smoke.spec.ts:282` (TC-48), `:386` (TC-106), `:505` (TC-141), `:744` (TC-179), `:861` (TC-193) are tagged `@smoke_m2`/`@api`, and `.gitlab-ci.yml`'s existing `api:smoke-m2:mr` job (unchanged by this diff) runs `--grep @smoke_m2` on every merge request whose title doesn't mention health-check/regression/integration/e2e — which this MR's title doesn't. None of the five use `test.skip`/`test.fixme`. Shipping known-failing/blocked cases (linked to TB-1794) into the merge-blocking smoke gate without quarantine either breaks the gate or trains reviewers to ignore red smoke runs. **Fix:** `test.fixme('TC-...', ...)` (preserving the TB-1794 reference) for the blocked cases until the platform gap closes, or move them out of `@smoke_m2` into a separately tracked suite.

**[Blocking] Comments inside `*.spec.ts` files (zero-tolerance rule).** `coding-standards.md`: "A comment anywhere inside a `*.spec.ts` file is never acceptable either, regardless of length or content." `projection-forms-smoke.spec.ts` adds 9 such comments: `:189`, `:243`, `:271`, `:282`, `:386`, `:505`, `:576`, `:744`, `:861` (including the `// Failed - no Rules...` / `// Blocked - ...` annotations before 6 of the 10 new tests). **Fix:** delete all 9 comments; move the Jira-ticket/blocked-reason context into the test name or drop it.

**[Blocking] Comments in an allowed location exceeding the 1-2 line cap or restating WHAT.** A comment inside `api/utils/**`/`api/system_core/helpers/**` is capped at 1-2 lines stating a non-obvious WHY. Violations: `api/utils/json-helper.ts:9-12` (4-line comment on `unwrapEnvelope`), `api/utils/db-helper.ts:41-46` (4-line JSDoc on `createDbClient`'s reconnect wrapper), `:413-415` and `:439-441` (JSDoc that purely restates the function name it sits on). **Fix:** delete each comment (or shrink to a single short WHY-sentence where a genuine hidden constraint exists — none of the above state one).

**[Major] Hand-rolled group/context cleanup duplicates the existing `cleanupGroupById` helper.** `projection-forms-smoke.spec.ts:236-279` builds its own `APIRequestContext`, instantiates a throwaway `TableRegistryApiClient`, and loops `.deleteGroup()` per group with manual try/catch logging — reimplementing, less completely, what `api/utils/group-cleanup-helper.ts:109-183`'s `cleanupGroupById()` already does (DB metadata delete + schema drop + retried API delete + Kafka-topic cleanup). **Fix:** if a group genuinely needs deleting here (see the Blocking issue above — currently none should), call `cleanupGroupById` instead of reimplementing it inline.

**[Major] TC-193's SEE-runtime hook/layout assertions only fire when the field happens to be present, so the test can pass without proving the AC it claims to cover.** `:971-973` and `:976-989` gate every check behind `if (Array.isArray(executedHooks))`/similar, never asserting `executedHooks`/`layout`/`fields` exist at all. If the backend omits them entirely (plausible given the adjacent "Failed - no Rules" annotation on this same test), the test still passes having verified nothing about hook execution (TRC-07) or runtime layout (TRC-04). **Fix:** assert existence first (`expect(executedHooks).toBeDefined()`) before the conditional type checks, or split the optional checks into their own tracked case.

**[Major] Artificially widened `space` accepted-values list papers over a precondition this same test already resolved.** `:960-968` accepts `['LIV', 'NAU']` for the runtime SEE response's `space`, citing possible "FIN maker-checker" behavior — but the suite's only table is created with `classification: INT` (`:228`), and TC-02's own earlier assertion already established an INT table's first INPUT creates a `'LIVE'` record without AUTH. The FIN branch can never apply here. **Fix:** assert `space` equals `'LIV'` directly, matching the classification this test itself fixes at setup.

**[Major] Test names don't match the repo's `TC-<number>: <behavior>` convention.** Every one of the 10 new tests uses `'TC-<n> - US-<story> | <feature> | <action>'` instead of `'TC-<number>: <behavior>'`: `:283, 387, 506, 577, 745, 862, 1010, 1078, 1128, 1166`. **Fix:** rename each to `'TC-<n>: <precise business-behavior description>'`, moving the US-story reference into a comment-free location (e.g. the Allure test-case link) if it must be kept.

**[Major] `test.step` narration doesn't match the documented PRECONDITION/STEP N convention.** Every `test.step` call uses lower-case `'Step N: ...'` instead of `'STEP N: ...'`/`'PRECONDITION: ...'`, 29 occurrences: `:303, 307, 347, 369, 403, 452, 509, 527, 556, 582, 596, 683, 713, 748, 755, 868, 876, 899, 926, 1013, 1032, 1059, 1081, 1086, 1115, 1131, 1136, 1169, 1177`. **Fix:** relabel to `'STEP N: ...'` / `'PRECONDITION: ...'` per the documented pattern.

**[Major] Hardcoded HTTP status literals instead of the existing `TEST_CONSTS.HTTP_STATUS` constants.** `constants-keeper.ts`'s `TEST_CONSTS.HTTP_STATUS` already exports `.OK`/`.CREATED`/`.BAD_REQUEST`/`.NOT_FOUND`. The new spec inlines raw literals 16 times instead: `:81, 325, 340, 352, 414, 424, 440, 459, 601, 891, 936, 1028, 1044, 1110, 1143, 1186`. **Fix:** replace each with the matching `TEST_CONSTS.HTTP_STATUS.*` constant (add a `.CONFLICT = 409` entry for the two `409` usages, which have no existing equivalent).

**[Minor] `getFieldById` duplicates an existing client method under the same name and has zero consumers in this diff.** `api/field-definition/client/field-definition-api-client.ts:15-17` adds `FieldDefinitionApiClient.getFieldById(fieldId)` against the same `field-registry`/`FIELD.BY_ID` endpoint `FieldRegistryClient.getFieldById(id)` already covers (pre-existing, unchanged by this diff) — and a repo-wide search of this diff finds zero call sites for the new method. **Fix:** either consolidate onto one client (or confirm `FieldRegistryClient` is being phased out) and use the new method somewhere in this MR, or defer adding it until a consuming case exists.

## Possible Risks

**[Possible Risk] New DB-polling functions bypass the existing `constants-waiter.ts` centralization.** `constants-waiter.ts` (pre-existing on `main`) exists specifically so timing tuning only touches one file — yet `api/utils/db-helper.ts:417` (`maxWaitMs = 120_000`), `:443` (`maxWaitMs = 60_000`), and `:427`/`:452` (`delay(3000)`), all added by this diff, introduce new local wait literals instead of extending it. **Fix:** add named constants to `constants-waiter.ts` for these four values and import them into `db-helper.ts`.

**[Possible Risk] Duplicated URL-construction expression instead of the existing helper.** `projection-forms-smoke.spec.ts:1704-1706` re-assembles `` `${SYS_CORE_API_PATHS.PROJECTION.DEFINITIONS(TABLE_ID)}/${encodeURIComponent(TC02_PROJECTION_ID)}` `` by hand — the identical expression already lives inside `fetchProjectionDefinition` (`api/system_core/helpers/projection-helper.ts`). Verifying the raw direct-GET contract is a plausible reason to bypass the helper here, so this is a risk rather than a confirmed duplicate. **Fix:** confirm the bypass is intentional, or reuse `fetchProjectionDefinition`.

**[Possible Risk] Plugin-lifecycle test cases degrade to read-only checks after their first successful run against a persistent environment.** `pluginState.pluginId` is the fixed id `PLUGIN_MANAGER_VALUES.expectedId` (`api/utils/plugin-manager.values.ts:15`), never suffixed per-run; TC-251's upload step returns early without uploading if the plugin already exists, and no test ever deletes it (Plugin Manager's Bruno collection exposes no delete endpoint). Once the plugin exists in a shared QA environment, later CI runs only exercise the GET/existence branch, never the POST/upload path the test's own title claims to cover. **Fix:** document this as an intentional "ensure exists" check, or add an environment-gated cleanup/reset step.

**[Possible Risk] Upload-status assertion is wider than the documented Bruno contract.** TC-251's Step 2 asserts `[200, 201]` for a successful plugin upload, but `Plugin Manager/Plugins/Upload Plugin.yml` documents and exemplifies exactly `200`, never `201`. Accepting an undocumented alternate status could mask an actual contract/version drift. **Fix:** assert `200` only, per the Bruno contract, or update the Bruno doc first if `201` is genuinely also valid.

**[Possible Risk] New top-level `resources/` directory + committed binary JAR fixture is an undocumented structural addition.** `architecture.md`'s documented folder layout lists `test-data/` for payload factories only; this MR introduces `resources/proj-identity-confinement-validation-plugin-1.0.1.jar` (first-ever use of this folder) with no corresponding update to `architecture.md` or a decision doc. **Fix:** add a short note to `architecture.md` documenting `resources/`'s purpose and update policy for binary test fixtures, or confirm whether this should live outside git entirely.

## Nice-to-Have Improvements

**[Nice-to-Have] `TC02_PROJECTION_ID`/`TC02_FIELD_IDS` are declared and named for "TC-02" but first populated inside the "TC-48" test.** `:174-175` declares both as top-level `let`s; `TC02_PROJECTION_ID` is first assigned at `:392`, inside `test('TC-48 - ...')`, then consumed by TC-106/141/179/193. Likely a leftover from case renumbering against the linked Google Sheet. **Fix:** rename to something ownership-neutral (e.g. `SHARED_PROJECTION_ID`).

**[Nice-to-Have] Two parallel "create/ensure projection definition" code paths now exist across two different client classes.** `SysCoreApiClient.ensureProjectionExists` (pre-existing) and the new `TableRegistryApiClient.inputProjectionDefinition` both POST to the same path constant, for different reasons (idempotent precondition setup vs. asserting on the INPUT response contract) — a justified distinction today, worth a one-line doc comment on `inputProjectionDefinition` clarifying when to reach for it over `ensureProjectionExists`.

**[Nice-to-Have] `api/utils/dynamic-name-generator.ts:41`'s new comment is borderline WHAT vs. WHY.** "Zero-padded 3-digit suffix (000–999) for compact AQA resource ids." is acceptable as-is, but could be tightened to just the non-obvious part (why 3 digits / why numeric-only) if revisited.

## Change Justification Debate

**Skipped for this run, per explicit instruction from the requester** — the Skeptic-vs-AQA/AQA-Lead adversarial debate stage was not executed. `logical_analysis.md`'s first-pass Necessity Citations were recorded but not cross-examined; the two citations that already came back as "no citation found" (`getFieldById`'s missing consumer, the undocumented `resources/` directory) are carried into Confirmed Issues/Possible Risks above as-is, unchallenged. No Change Justification Debate log exists in this report.

## Ready-to-paste GitLab comment

```
Пункт 1
[Blocking] afterAll удаляет общую worker-scoped группу таблиц
`api/system_core/tests/projection-forms-smoke.spec.ts:201-202,236,254-256` — тест кладёт `workerGroupId` в `createdGroupIds` и удаляет её в `afterAll`, хотя это общий ресурс на весь воркер, используемый другими спеками (см. `system-parameterization-smoke.spec.ts`, который тот же фикстур никогда не удаляет). После прогона этого файла любой другой смоук/регрешн в том же воркере начнёт падать с 404.
Как исправить: не добавлять `workerGroupId`-производные id в `createdGroupIds`, чистить только группы, которые тест сам создал.

Пункт 2
[Blocking] Пять кейсов помечены как Failed/Blocked без карантина внутри блокирующего merge-gate
`api/system_core/tests/projection-forms-smoke.spec.ts:282,386,505,744,861` — все пять тегированы `@smoke_m2`, который гоняется на каждый MR через `api:smoke-m2:mr`, но не обёрнуты в `test.skip`/`test.fixme` (дефекты по TB-1794).
Как исправить: обернуть в `test.fixme('TC-...', ...)` с ссылкой на TB-1794 либо вынести из `@smoke_m2` до закрытия дефекта.

Пункт 3
[Blocking] Комментарии внутри *.spec.ts файла (запрещены полностью)
`api/system_core/tests/projection-forms-smoke.spec.ts:189,243,271,282,386,505,576,744,861` — добавлено 9 комментариев, что прямо запрещено конвенцией для spec-файлов независимо от длины.
Как исправить: удалить все 9 комментариев, контекст по Jira-тикету перенести в название теста или убрать.

Пункт 4
[Blocking] Комментарии в разрешённой локации превышают лимит 1-2 строки или пересказывают WHAT
`api/utils/json-helper.ts:9-12`, `api/utils/db-helper.ts:41-46,413-415,439-441` — комментарии длиннее лимита и/или пересказывают то, что уже понятно из имени функции.
Как исправить: удалить или сократить до одной короткой WHY-фразы там, где реально есть скрытое ограничение.

Пункт 5
[Major] Ручная очистка group/context дублирует существующий cleanupGroupById
`api/system_core/tests/projection-forms-smoke.spec.ts:236-279` — тест создаёт свой `APIRequestContext` и вручную удаляет группы, хотя `api/utils/group-cleanup-helper.ts:109-183` (`cleanupGroupById`) уже делает то же самое полнее (DB + schema + retry + Kafka topics).
Как исправить: использовать `cleanupGroupById`, если очистка группы вообще нужна (см. Пункт 1 — по факту не должна).

Пункт 6
[Major] Условные ассерты в TC-193 не проверяют заявленный AC
`api/system_core/tests/projection-forms-smoke.spec.ts:971-989` — проверки `executedHooks`/`layout`/`fields` срабатывают только если поле присутствует (`if (Array.isArray(...))`), само наличие никогда не проверяется, тест может пройти, не проверив TRC-04/TRC-07.
Как исправить: сначала assert-ить наличие (`toBeDefined()`), затем — условные детали, либо выделить опциональную проверку в отдельный кейс.

Пункт 7
[Major] Искусственно расширенный список допустимых значений `space` маскирует детерминированный результат
`api/system_core/tests/projection-forms-smoke.spec.ts:960-968` — допускается `['LIV', 'NAU']`, хотя таблица создана с `classification: INT` и по TC-02 первый INPUT для INT гарантированно даёт `'LIVE'`, FIN-ветка невозможна.
Как исправить: assert-ить `space === 'LIV'` напрямую.

Пункт 8
[Major] Названия тестов не соответствуют конвенции `TC-<number>: <behavior>`
`api/system_core/tests/projection-forms-smoke.spec.ts:283,387,506,577,745,862,1010,1078,1128,1166` — используется формат `'TC-<n> - US-<story> | ...'` вместо `'TC-<number>: <behavior>'`.
Как исправить: переименовать в `'TC-<n>: <бизнес-поведение>'`, ссылку на US-историю перенести в описание Allure-кейса.

Пункт 9
[Major] Нарушен формат нарратива test.step (PRECONDITION/STEP N)
`api/system_core/tests/projection-forms-smoke.spec.ts:303,307,347,369,403,452,509,527,556,582,596,683,713,748,755,868,876,899,926,1013,1032,1059,1081,1086,1115,1131,1136,1169,1177` — используется `'Step N: ...'` вместо документированного `'STEP N: ...'`/`'PRECONDITION: ...'`.
Как исправить: переименовать метки по документированному паттерну.

Пункт 10
[Major] Хардкод HTTP-статусов вместо существующих TEST_CONSTS.HTTP_STATUS
`api/system_core/tests/projection-forms-smoke.spec.ts:81,325,340,352,414,424,440,459,601,891,936,1028,1044,1110,1143,1186` — 16 инлайновых числовых литералов вместо готовых констант.
Как исправить: заменить на `TEST_CONSTS.HTTP_STATUS.*`, добавить `.CONFLICT = 409` для двух случаев с 409.

Пункт 11
[Minor] getFieldById дублирует существующий метод и не используется в этом MR
`api/field-definition/client/field-definition-api-client.ts:15-17` — новый метод бьёт в тот же эндпоинт, что и уже существующий `FieldRegistryClient.getFieldById`, и не имеет ни одного вызова в этом диффе.
Как исправить: консолидировать на одном клиенте либо использовать метод в этом MR, либо отложить его добавление.

Пункт 12
[Possible Risk] Новые функции поллинга в db-helper.ts не используют существующую централизацию constants-waiter.ts
`api/utils/db-helper.ts:417,443,427,452` — новые литералы `maxWaitMs`/`delay` вместо констант из уже существующего `constants-waiter.ts`.
Как исправить: добавить именованные константы в `constants-waiter.ts` и использовать их здесь.

Пункт 13
[Possible Risk] Дублирование сборки URL вместо существующего хелпера
`api/system_core/tests/projection-forms-smoke.spec.ts:1704-1706` — URL собирается вручную, хотя идентичное выражение уже есть в `fetchProjectionDefinition` (`api/system_core/helpers/projection-helper.ts`).
Как исправить: подтвердить, что обход хелпера намеренный, либо использовать `fetchProjectionDefinition`.

Пункт 14
[Possible Risk] Плагин-кейсы деградируют до read-only проверок после первого успешного прогона
`api/utils/plugin-manager.values.ts:15` (`expectedId`, не суффиксируется по прогону) — плагин никогда не удаляется (в Bruno-коллекции нет delete-эндпоинта), поэтому после первого зелёного прогона TC-251 перестаёт проверять сам upload.
Как исправить: явно задокументировать как "ensure exists"-проверку либо добавить cleanup/reset для окружения.

Пункт 15
[Possible Risk] Ассерт статуса загрузки шире, чем документированный контракт Bruno
TC-251, Step 2 — допускается `[200, 201]`, хотя `Plugin Manager/Plugins/Upload Plugin.yml` документирует только `200`.
Как исправить: assert-ить только `200` либо сначала обновить документацию Bruno, если `201` действительно валиден.

Пункт 16
[Possible Risk] Новая директория `resources/` с бинарным JAR не задокументирована
`resources/proj-identity-confinement-validation-plugin-1.0.1.jar` — первое использование этой директории, `architecture.md` не обновлён.
Как исправить: добавить в `architecture.md` описание назначения `resources/` и политику хранения бинарных фикстур.
```
