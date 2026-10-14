# Final Analysis — MR 289 (TB-4035, Audit Fields UI)

## Summary

TB-4035 ("Audit fields UI implementation") carries no description/Acceptance Criteria of its own
in Jira — it only links to Story TB-3395 ("UI testing: Audit Fields"), also description-less. The
real spec traces one hop further, to TB-3395's linked closed bugs: TB-3484 ("Multi-value audit
fields rendered incorrectly", fixed 2026-09-08, links a Figma design) is the authoritative source
for the block layout — Record Status at top; at most one Authorize block (Authorizer/Date-Time/
Projection from the last `ST_AUTHORISER`/`ST_DATE_TIME`/`ST_PROJECTION` entries, empty when UNAU);
one Input block per `ST_INPUTTER` element, index-aligned; Company at the bottom — and TB-3529
("Company not returned on HOLD record"), a related backend fix. Both predate this MR's commits
(2026-09-24/25) and are not open blockers. The MR implements this design as a brand-new UI test
module, `ui/system_core/audit_fields/` (page object, fixtures, helpers, two spec files covering
US-01.03.01/02/03/04/06), plus three small supporting edits: `eslint.config.mjs`'s
`expect-expect` allowlist, one new `ALLOWED_DUPLICATE_IDS` entry, one new shared timeout constant,
and a backward-compatible signature addition on `ProjectionRuntimePage.assertCurrentSpace`.

⸻

## Confirmed Issues

**[Confirmed] Comment added to a non-designated file restates WHAT, not WHY**
`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:5` — the new comment
`// "YYYY-MM-DD HH:MM:SS", e.g. "2026-09-23 11:11:14".` above `AUDIT_DATE_TIME_PATTERN` restates
what the regex matches rather than a hidden constraint/why, and `pages/` is not a designated
comment location.
Fix: delete the comment; the pattern is already self-describing via its name and the regex itself.

**[Confirmed] British "authorise/authoriser" spelling inconsistent with the established American convention**
Every pre-existing identifier in the repo uses American spelling, but this diff's test-facing
prose and one new function name use British spelling instead.
`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:118,174,181,188,199`;
`helpers/audit-fields-setup.ts:86` (function `authoriseRecordAsDifferentUser`) and `:105`;
`tests/audit-fields-regression.spec.ts:254,284,306,317,398,421,501,531,547,561,612,635,660,703,749`;
`tests/audit-fields-smoke.spec.ts:166,203,206,223,260,280,317,320,397,400`.
Fix: standardize on "authorize/authorizer" throughout every new string and identifier.

**[Confirmed] Tag taxonomy: new UI specs use `_m1`, every existing UI spec uses `_m2`**
`ui/system_core/audit_fields/tests/audit-fields-smoke.spec.ts:27,165,341`
(`{ tag: ['@ui', '@smoke_m1'] }`) and `tests/audit-fields-regression.spec.ts:26`
(`{ tag: ['@ui', '@regression_m1'] }`) — a repo-wide check across all 8 existing UI modules found
`_m2` used with zero exceptions.
Fix: change all four tag arrays to `@smoke_m2`/`@regression_m2`, or confirm with the team that
Audit Fields UI genuinely belongs to a different milestone before merging.

**[Confirmed] `test.setTimeout(...)` used in test bodies instead of the established `test.describe.configure({ timeout })` pattern**
`ui/system_core/audit_fields/tests/audit-fields-regression.spec.ts:72,394,534,615,706` each call
`test.setTimeout(N)` as the first line of an individual test, where the repo's established
pattern (used 19 times across existing UI specs) is `test.describe.configure({ timeout: N })` at
the describe level.
Fix: move each call into a `test.describe.configure({ timeout: N })` at the top of that test's
enclosing `describe` block.

**[Confirmed] `assertCurrentSpace`'s new timeout parameter invents an options-object shape when the same class already has a bare-parameter equivalent**
`ui/basic-customization/pages/projection-runtime-page.ts:112-115` changes `assertCurrentSpace` to
accept `options: { timeout?: number } = {}`, but the same class's `assertReached` (line 56)
already takes `timeout?: number` as a plain optional parameter for the identical concept. The
capability itself (a longer wait for the AUTH operation to land) is needed and the change is
backward-compatible against both of its 2 external callers — only the shape is wrong.
Fix: match the established shape — `assertCurrentSpace(space, timeout?: number)`.

**[Confirmed] New `PROJECTION_RUNTIME` URL builder duplicates an existing one for the identical route**
`ui/system_core/audit_fields/audit-fields-ui-paths.ts:4-7` defines
`AUDIT_FIELDS_UI_PATHS.PROJECTION_RUNTIME.URL(tableId, projectionId, query)` building
`/proj-web/en/tableRegistry/${tableId}/projections/${projectionId}/runtime` — the exact same route
`ui/basic-customization/basic-customization-ui-paths.ts:18-23`'s `PROJECTION_RUNTIME.URL_PATTERN`
already owns. This module already imports and drives `ProjectionRuntimePage` from
`ui/basic-customization/pages/` (`helpers/audit-fields-setup.ts:3`), so two files now separately
encode knowledge of the same page's route.
Fix: add a `.URL()` builder to `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME` (alongside its
existing `.URL_PATTERN()`) and import that from `audit-fields-setup.ts`, instead of a second,
parallel path file for the same page.

**[Confirmed] Hardcoded `'x-type': 'ALPHANUMERIC'` instead of the existing `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` constant**
`ui/system_core/audit_fields/audit-fields-record-schema.ts:8,15` —
`api/utils/constants/constants-keeper.ts:272` already exports `FIELD_CONSTS.X_TYPE.ALPHANUMERIC`.
Fix: import `FIELD_CONSTS` and use `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` for both `ID` and `TEST`'s
`x-type` instead of the raw string literal.

**[Confirmed] Split `@playwright/test` imports, inconsistent with every sibling file in this same diff**
`ui/system_core/audit_fields/fixtures/audit-fields-provisioning.ts:1-2` and
`ui/system_core/audit_fields/helpers/audit-fields-setup.ts:1-2` each split their `@playwright/test`
import into two statements, while every other new file in this diff merges everything into one.
Fix: merge each pair into a single `import { ... } from '@playwright/test';`.

**[Confirmed] New UI module breaks the established kebab-case module-naming convention**
`ui/system_core/audit_fields/` (all 6 new files under it) — every existing `ui/` module folder is
kebab-case; this diff introduces `system_core/audit_fields` in snake_case, mirroring `api/`'s
module-naming convention instead of `ui/`'s own.
Fix: rename the folder to `ui/system-core/audit-fields/`, or, following the flat-feature-folder
pattern already used by `basic-customization`/`override-dispo`, simply `ui/audit-fields/`.

**[Confirmed] 15 un-stepped `createUiAdminAuthContext`/`apiContext.dispose()` calls reintroduce a documented anti-pattern**
Every `beforeEach` in both new spec files creates the admin API context and disposes it in a bare
`try { ... } finally { await apiContext.dispose(); }`, with neither call wrapped in `test.step(...)`:
`tests/audit-fields-smoke.spec.ts:51/55, 134/149, 178/182, 235/239, 292/296, 358/362` (6
occurrences); `tests/audit-fields-regression.spec.ts:46/58, 171/175, 217/221, 268/272, 369/379,
515/519, 596/600, 686/690, 787/791` (9 occurrences). This matches Cause 4 of
`docs/common-issues/playwright-execution/unwrapped-requests-outside-test-step.md` verbatim.
Fix: per that doc's own example, hoist `apiContext` to a `let` above `try` and wrap its creation in
a leading `PRECONDITION` step and its disposal in a `CLEANUP` step.

⸻

## Possible Risks

**[Risk] Fixture relies on an implicit default for the load-bearing USR/auditable table type**
`fixtures/audit-fields-provisioning.ts`'s `createTableWithProjection` calls
`buildCreateTablePayload(groupId, { id: tableId, name: tableId, classification: options.classification })`
without ever passing `type`. It inherits `test-data/payload-builder.ts:93`'s default
(`TEST_CONSTS.NEW_TABLE_TYPE` = `'USR'`) — confirmed correct today, since every test in this module
depends on these tables being USR/auditable — but the dependency is invisible at the call site: if
the shared default ever changes for an unrelated reason, this whole module fails for a cause
nothing in `audit_fields/` itself would suggest. *(Debated — see below; concession, not rebutted.)*
Fix: pass `type: TEST_CONSTS.NEW_TABLE_TYPE` explicitly so the auditable precondition is visible
where it's actually load-bearing.

**[Risk] No UI-level test for multiple un-authorized INPUT operations stacking as separate indexed Input blocks**
TB-3484's fix specifies one Input block per `ST_INPUTTER` element, index-aligned, and
`AuditFieldsRecordPage.inputUser/inputDateTime/inputProjection`
(`pages/audit-fields-record-page.ts:73-84`) already expose an index parameter for exactly this —
but no test in this diff ever calls them with `index=1`. TC-3271/TC-3272 exercise the
compare-form path (re-inputting an already-authorised record), a different code path from
re-inputting an UNAU record a second time before it's ever authorised — the scenario that actually
produces two stacked Input blocks, and one the API-level suite already proves at the DB layer
(`api/system_core/tests/audit-fields-regression.spec.ts:452`, TC-18).
Fix: add a case that re-INPUTs an UNAU record before authorisation and asserts
`inputUser(1)`/`inputDateTime(1)`/`inputProjection(1)`, or note explicitly why this is out of
scope.

**[Risk] No in-repo citation found for the new `showAuditFields` layout flag**
`fixtures/audit-fields-provisioning.ts:75` sets `layout: { view: 'form', showAuditFields: true, ... }`.
A repo-wide search found zero other occurrences anywhere in `proj-test-automation` — no prior UI or
API usage, and no Bruno/doc citation was reachable from this review. It's plausible this diff is
simply the first consumer of a real, already-shipped backend flag, but nothing available to this
review confirms the contract. *(Not raised as a Skeptic necessity challenge — see debate note
below; this is a contract-verification question, not a duplication question.)*
Fix: cite the backend contract (Bruno collection or doc) that defines this flag, or confirm with
the backend team it's a real, stable flag before merging.

**[Risk] No citation found for `UI_RECORD_OPERATION_TIMEOUT_MS = 20_000`'s specific value**
`ui/base/constants/ui-timeouts.ts:7` — the same file already has `UI_MODAL_VISIBLE_TIMEOUT_MS =
15_000` and `UI_API_RESPONSE_TIMEOUT_MS = 10_000` for comparable waits; nothing in the diff
explains why AUTH/record-load operations specifically need a longer, dedicated constant rather
than reusing one of those. *(Debated — see below; not justified, no rebuttal offered.)*
Fix: state the reasoning (measured timing or backend contract) in the MR description, or reuse
`UI_MODAL_VISIBLE_TIMEOUT_MS` if 15s already covers the real AUTH latency.

⸻

## Nice-to-Have Improvements

**[Nit] ESLint `assertFunctionNames` allowlist misses 5 of 13 new `AuditFieldsRecordPage` assertion methods**
`eslint.config.mjs:126-134` registers 9 of the page object's new `assert*` methods but omits
`assertCompareDisplayed`, `assertAuthorizerEmpty`, `assertAuthorizeDateTimeEmpty`,
`assertAuthorizeProjectionEmpty`, `assertAuthorizerEqualsInputter`
(`pages/audit-fields-record-page.ts:115,171,178,185,192`). Every current call site happens to
co-occur with an already-listed assertion in the same test body, so nothing fails lint today.
*(Reconciliation note: the cosmetic lens filed this as a blocking Confirmed Issue on mechanical-
convention grounds; downgraded here to Nit since it causes no current lint failure and only
matters for a hypothetical future test — matching `severity-taxonomy.md`'s own Nit definition
more closely than Confirmed's "must fix before merge" bar.)*
Fix: add the remaining 5 method names to the same allowlist for consistency.

**[Nit] Duplicated `{ maxLength: 64 }` object literal within the same file**
`ui/system_core/audit_fields/audit-fields-record-schema.ts:9,16` — `ID` and `TEST` both declare an
identical `'x-config': { maxLength: 64 }` object.
Fix: extract a local `const DEFAULT_FIELD_CONFIG = { maxLength: 64 };` and reuse it for both.

**[Nit] New timeout constant breaks the file's own blank-line concern-grouping**
`ui/base/constants/ui-timeouts.ts:7` — `UI_RECORD_OPERATION_TIMEOUT_MS` is inserted directly after
`UI_API_RESPONSE_TIMEOUT_MS` with no blank line, visually joining an unrelated concern onto the
"API response" group.
Fix: add a blank line before (and after, if this constant is expected to grow its own group).

⸻

## Change Justification Debate

**1. Challenge: `UI_RECORD_OPERATION_TIMEOUT_MS = 20_000` — new dedicated constant vs. reusing `UI_MODAL_VISIBLE_TIMEOUT_MS = 15_000`.**
Skeptic: the file already has two comparable wait constants (10s API response, 15s modal
visibility); nothing in the diff demonstrates 20s specifically is needed rather than the existing
15s value. AQA/AQA Lead response: conceded — no citation was found during the logical review
either; the value is plausible for a backend-heavy AUTH operation but undemonstrated.
**Resolution: Not Justified** (no cited rejection of the existing 15s constant). Carried through as
the Possible Risk above (kept at Risk, not promoted to Confirmed, since the value is functionally
harmless today — only its justification is missing).

**2. Challenge: implicit reliance on `buildCreateTablePayload`'s default `type: 'USR'` for the module's core auditable-table precondition.**
Skeptic: this is Presumptive Trigger 5 (a silent fallback papering over an unclear invariant) — the
one precondition every test in this module depends on is expressed nowhere in `audit_fields/`
itself. AQA/AQA Lead response: conceded — already flagged independently as a Risk during the
logical review for the same reason.
**Resolution: Not Justified** (concession). Carried through as the Possible Risk above.

**3. Challenge: 5 named wrapper functions (`createFinTableSelfAuthorized`, `createCusTableSelfAuthorized`, `createFinTableRequiringAuth`, `createCusTableRequiringAuth`, `createAuditableUsrTable`) vs. one parameterized helper.**
Skeptic: Presumptive Trigger 1 (relocated, not reduced, complexity) — why 5 thin named functions
instead of one call to the in-file `createTableWithProjection` with explicit
`classification`/`authOperationRequired` arguments? AQA/AQA Lead response: each name is a cited,
fixed parameterization of `TableRegistryApiClient.inputProjectionDefinition`'s real payload axes
(classification × authOperationRequired); call sites read as self-documenting preconditions
(`createFinTableSelfAuthorized(...)`) instead of decoding boolean flags — the concept count at each
call site goes down, not sideways.
**Resolution: Justified.** Rebuttal survives; this is proportionate, named-precondition convenience,
not relocated complexity.

**4. Presumptive Trigger check — file-size ceiling (835-line regression spec, 412-line smoke spec).**
Skeptic checked both new files against every existing UI regression/smoke spec's line count:
`override-dispo-smoke.spec.ts` 379, `customization-smoke.spec.ts` 425,
`override-dispo-regression.spec.ts` 462, `document-management-ui-smoke.spec.ts` 760,
`basic-customization-smoke.spec.ts` 964, `basic-customization-regression.spec.ts` 1065,
`document-management-ui-regression.spec.ts` 1251, `customization-regression.spec.ts` 1359. Both new
files sit below the median of the existing range.
**No challenge raised** — no size-ceiling violation.

**No-challenge notes (necessity citations that held up without needing a formal challenge):**
- `AUDIT_FIELDS_RECORD_SCHEMA` — matches an existing inline schema shape from the API-side
  regression spec; no importable shared schema exists to name as an alternative, so there is
  nothing concrete to challenge with.
- `ALLOWED_DUPLICATE_IDS` entry `3266` — mechanically self-justified by the diff's own two
  `allureCaseId(3266)` uses; not a design decision.
- `assertCurrentSpace`'s new timeout *capability* (as opposed to its shape) — genuinely needed for
  the AUTH-wait scenario and backward-compatible; the shape mismatch is already a Confirmed cosmetic
  finding above, so no separate necessity challenge was needed.
- `showAuditFields: true` — zero other occurrences anywhere in the repo (first consumer, not a
  duplicate); the Skeptic lens requires a concrete existing alternative to challenge with, and none
  exists here. This is a contract-verification question for the AQA lens (already the Possible Risk
  above), not a necessity question this lens can adjudicate.
- Module folder naming (`system_core/audit_fields`) and the duplicate `PROJECTION_RUNTIME` URL
  builder — both already stand as Confirmed Issues above; neither lens ever defended them as
  "correct/fits," so there was nothing to cross-examine.
- The 15 un-stepped `apiContext` creation/disposal calls — already a Confirmed Issue (reintroduces a
  documented anti-pattern), never defended as correct.

⸻

## Verdict

**Request Changes** — 10 Confirmed Issues remain (naming convention, duplicated route, hardcoded
constant, comment hygiene, spelling, tag milestone, timeout pattern, API shape, import style, and a
documented anti-pattern reintroduced 15 times), and 2 Change Justification Debate challenges
resolved Not Justified.

⸻

## Ready-to-paste GitLab comment

Пункт 1
[Confirmed] Comment restates WHAT, not WHY
`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:5` — комментарий над
`AUDIT_DATE_TIME_PATTERN` пересказывает, что делает regex, а не объясняет скрытое ограничение;
`pages/` не входит в разрешённые места для комментариев.
Как исправить: удалить комментарий — паттерн самодостаточен по имени и содержимому regex.

Пункт 2
[Confirmed] Британское "authorise/authoriser" вместо принятого американского написания
`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:118,174,181,188,199`,
`helpers/audit-fields-setup.ts:86,105`, `tests/audit-fields-regression.spec.ts` (15 строк),
`tests/audit-fields-smoke.spec.ts` (10 строк) — весь остальной код в репозитории использует
американское написание.
Как исправить: заменить "authorise/authoriser" на "authorize/authorizer" везде в новых строках и
идентификаторах.

Пункт 3
[Confirmed] Тег `_m1` вместо принятого `_m2`
`tests/audit-fields-smoke.spec.ts:27,165,341`, `tests/audit-fields-regression.spec.ts:26` — во всех
8 существующих UI-модулях без исключений используется `_m2`.
Как исправить: заменить на `@smoke_m2`/`@regression_m2`, либо подтвердить с командой, что этот
модуль действительно относится к другому milestone.

Пункт 4
[Confirmed] `test.setTimeout` внутри теста вместо `test.describe.configure({ timeout })`
`tests/audit-fields-regression.spec.ts:72,394,534,615,706` — установленный в репозитории паттерн
(19 применений в существующих UI-спеках) — `test.describe.configure({ timeout })` на уровне
describe-блока.
Как исправить: перенести каждый вызов в `test.describe.configure({ timeout: N })` в начало
соответствующего describe-блока.

Пункт 5
[Confirmed] `assertCurrentSpace` вводит новую форму параметра вместо уже существующей в этом же классе
`ui/basic-customization/pages/projection-runtime-page.ts:112-115` — принимает
`options: { timeout?: number } = {}`, хотя `assertReached` (строка 56) того же класса уже
использует простой опциональный параметр `timeout?: number` для того же самого случая.
Как исправить: привести сигнатуру к `assertCurrentSpace(space, timeout?: number)`.

Пункт 6
[Confirmed] Новый билдер `PROJECTION_RUNTIME` дублирует уже существующий для того же маршрута
`ui/system_core/audit_fields/audit-fields-ui-paths.ts:4-7` — определяет тот же шаблон маршрута
`/proj-web/en/tableRegistry/{tableId}/projections/{projectionId}/runtime`, что уже есть в
`ui/basic-customization/basic-customization-ui-paths.ts:18-23`; модуль и так использует
`ProjectionRuntimePage` из `basic-customization`.
Как исправить: добавить `.URL()` в `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME` рядом с уже
существующим `.URL_PATTERN()` и использовать его вместо отдельного файла путей.

Пункт 7
[Confirmed] Захардкоженный `'ALPHANUMERIC'` вместо `FIELD_CONSTS.X_TYPE.ALPHANUMERIC`
`ui/system_core/audit_fields/audit-fields-record-schema.ts:8,15` — константа уже экспортируется в
`api/utils/constants/constants-keeper.ts:272`.
Как исправить: импортировать `FIELD_CONSTS` и использовать `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` для
`x-type` полей `ID` и `TEST`.

Пункт 8
[Confirmed] Разделённый импорт `@playwright/test`, не соответствующий остальным новым файлам того же MR
`fixtures/audit-fields-provisioning.ts:1-2`, `helpers/audit-fields-setup.ts:1-2` — импорт разбит на
два отдельных statement'а, тогда как остальные новые файлы используют один.
Как исправить: объединить в один `import { ... } from '@playwright/test';`.

Пункт 9
[Confirmed] Новый UI-модуль нарушает принятую конвенцию kebab-case для названий модулей
`ui/system_core/audit_fields/` (все 6 новых файлов) — все существующие модули в `ui/` названы в
kebab-case; этот модуль использует snake_case (`system_core`/`audit_fields`), как в `api/`.
Как исправить: переименовать в `ui/system-core/audit-fields/`, либо, по паттерну
`basic-customization`/`override-dispo`, просто в `ui/audit-fields/`.

Пункт 10
[Confirmed] 15 вызовов `createUiAdminAuthContext`/`apiContext.dispose()` без `test.step`, повторяющие задокументированную анти-паттерн-проблему
`tests/audit-fields-smoke.spec.ts` (6 мест), `tests/audit-fields-regression.spec.ts` (9 мест) —
совпадает с Cause 4 из
`docs/common-issues/playwright-execution/unwrapped-requests-outside-test-step.md`.
Как исправить: вынести `apiContext` в `let` перед `try`, обернуть создание в шаг `PRECONDITION`, а
`dispose()` — в шаг `CLEANUP`, по примеру из документа.

Пункт 11
[Risk] Неявная зависимость от дефолтного `type: 'USR'` в `buildCreateTablePayload`
`fixtures/audit-fields-provisioning.ts` — весь модуль зависит от того, что создаваемые таблицы
имеют тип `USR` (auditable), но это нигде не передаётся явно, а наследуется от дефолта в
`test-data/payload-builder.ts:93`. При обсуждении в дебате скептик поднял это как "тихий fallback,
скрывающий инвариант" — возражений не последовало.
Как исправить: передавать `type: TEST_CONSTS.NEW_TABLE_TYPE` явно в объекте override.

Пункт 12
[Risk] Нет UI-теста на несколько неавторизованных INPUT-операций, формирующих отдельные Input-блоки по индексу
`pages/audit-fields-record-page.ts:73-84` — методы `inputUser/inputDateTime/inputProjection`
принимают индекс, но ни один тест не вызывает их с `index=1`; текущие тесты проверяют другой сценарий
(compare-form после уже авторизованной записи), а не повторный INPUT неавторизованной записи,
который и создаёт два indexed Input-блока (уже покрыт на уровне API в
`api/system_core/tests/audit-fields-regression.spec.ts:452`, TC-18).
Как исправить: добавить кейс с повторным INPUT неавторизованной записи и проверкой
`inputUser(1)`/`inputDateTime(1)`/`inputProjection(1)`, либо явно указать, что это вне scope.

Пункт 13
[Risk] Нет обоснования для нового флага `showAuditFields`
`fixtures/audit-fields-provisioning.ts:75` — флаг `showAuditFields: true` больше нигде в
репозитории не встречается; нет ссылки на Bruno/документацию, подтверждающей контракт с бэкендом.
Как исправить: указать источник контракта (Bruno-коллекция или документ) для этого флага, либо
подтвердить с бэкенд-командой.

Пункт 14
[Risk] Нет обоснования для конкретного значения `UI_RECORD_OPERATION_TIMEOUT_MS = 20_000`
`ui/base/constants/ui-timeouts.ts:7` — рядом уже есть `UI_MODAL_VISIBLE_TIMEOUT_MS = 15_000` и
`UI_API_RESPONSE_TIMEOUT_MS = 10_000` для сравнимых ожиданий; в дебате скептик поднял вопрос,
почему не переиспользовать существующую константу — обоснования от защищающей стороны не
последовало.
Как исправить: указать в описании MR причину (замер времени или контракт с бэкендом), либо
переиспользовать `UI_MODAL_VISIBLE_TIMEOUT_MS`, если 15с достаточно.
