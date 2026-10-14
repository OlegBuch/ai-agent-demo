# MR 68 Review — TB-1757: System Tables (Static Dictionaries)

## Summary

This MR implements TB-1757 ("Integration test impl: System Tables (Static Dictionaries)"): new
integration (`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts`) and smoke
(`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts`) specs covering
CM.CUSTOMER.DEFAULT reference data validation (US-01.11.03), a new enquiry-execute read path
(US-01.11.04), and LEGAL.DOC.TYPE validation (US-01.11.05). It adds a new
`api/system_core/helpers/system-tables-helper.ts` (DB tracking/cleanup/polling for reference data),
a `api/utils/reference-data.values.ts` constants file, corresponding types
(`api/types/system-tables.types.ts`, additions to `api/types/table-registry.types.ts`), a new
`executeEnquiry` client method + `ENQUIRY.EXECUTE` path, and new payload-builder factories in
`test-data/payload-builder.ts`. The diff is exactly 9 files, scoped tightly to this ticket — no
shared-infrastructure files (`table-registry-helper.ts`, `db-helper.ts`, `base-api-client.ts`,
`global-setup.ts`, `group-cleanup-helper.ts`, etc.) are actually touched by this MR.

## Confirmed Issues

**1. Copy-paste bug: TC-23's own error message references a different test case ("TC-43")**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:172` and `:176`:
```ts
test(
  'TC-23: Verify that an unauthorized module is rejected with an access denied response',
  ...
    if (!baseURL) throw new Error('BASE_URL is required for TC-43');
```
The test is named `TC-23` but its own guard-clause error string says `TC-43` — a leftover from
copying another test case. Anyone debugging a `BASE_URL` misconfiguration from CI logs will be
pointed at the wrong test case. Fix: change the string to `TC-23`.

**2. Duplication: the entire fixture/helper scaffolding is copy-pasted between the two new spec files, despite a shared helper file existing in this same diff**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:27-35` (`responseDetail`),
`:41-56` (`beforeAll`/`beforeEach`/`afterAll`), `:58-66` (`createRecord`), and the entire
`CM.CUSTOMER.DEFAULT Reference Data - US-01.11.03` nested `describe` block (`createSector`,
`createIndustry`, `createTarget`, `inputCustomerDefault`) are duplicated verbatim in
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:28-36`, `:42-57`, `:59-67`,
and its own `CM.CUSTOMER.DEFAULT Reference Data - US-01.11.03` block. This MR *already* introduces
`api/system_core/helpers/system-tables-helper.ts` as the shared home for this suite's DB
logic — `responseDetail`, `createRecord`, and the CM.CUSTOMER.DEFAULT builder helpers belong there
too, not copy-pasted into both spec files. This is exactly the kind of duplication
`docs/frame-specs/coding-standards.md`'s "Module boundary" section asks to avoid, and it doubles
the maintenance cost of any future change to this fixture shape.

## Possible Risks

**1. New `ENQUIRY.EXECUTE` endpoint/client method has no citable contract source in this repo**
`api/system_core/sys-core-api-paths.ts:23-26` (new `ENQUIRY.EXECUTE` path) and
`api/system_core/client/table-registry-api-client.ts:264-279` (new `executeEnquiry` method). This
repo keeps no `.bru` Bruno collection anywhere (`find ... -iname "*.bru"` returns nothing), so this
addition can't be verified here against a Bruno file per this project's own endpoint-justification
convention. `docs/frame-specs/infrastructure.md` does confirm a `table_registry.enquiries` table
exists, which supports the endpoint being real, but the exact request/response shape
(`EnquiryPredicateNode`/`EnquiryConditionGroup` in `api/types/table-registry.types.ts:600-614`)
should be confirmed against whatever source (product OpenAPI spec, Bruno collection in another
repo, Confluence) the author actually used, since it can't be independently verified from this
checkout.

**2. TC-19's positive assertion is a fragile substring check on the raw serialized body**
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:172-180`:
```ts
const bodyText = JSON.stringify(await res.json());
expect(bodyText, `...should surface the newly created COUNTRY "${countryId}"`).toContain(countryId);
expect(bodyText, 'HIGH_RISK=true filter must not return any HIGH_RISK=false record').not.toContain(
  '"HIGH_RISK":false',
);
```
Asserting on a `JSON.stringify`'d blob is sensitive to key ordering/whitespace and doesn't actually
verify the negative assertion is scoped to *this* record — a coincidental substring match elsewhere
in the response (or the enquiry API changing its key order/formatting) would pass or fail this test
for the wrong reason. Parsing the response and asserting on structured fields
(e.g. `records.every(r => r.data.HIGH_RISK !== false)`, or filtering to the record matching
`countryId`) would be a more specific and resilient check, per this repo's own "Assertions"
convention (`docs/frame-specs/testing-standards.md`).

## Nice-to-Have Improvements

**1. Numeric literal style inconsistency**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:48` and
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:49` both write
`test.setTimeout(120000)`, while the rest of the codebase consistently uses the `_` numeric
separator for timeouts of this size (e.g. `api/product_factory/tests/pf-core-smoke.spec.ts:164`'s
`test.setTimeout(120_000)`).

## Ready-to-paste GitLab comment

Пункт 1
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:176`, тест `TC-23` — сообщение об ошибке ссылается на несуществующий в этом файле `TC-43` вместо `TC-23`.
Это собьёт с толку при разборе падения в CI, указывая не на тот тест-кейс.
Варианты решения:
1. Заменить `TC-43` на `TC-23` в строке ошибки.
2. Вынести номер тест-кейса в константу рядом с `test(...)`, чтобы название и сообщение об ошибке не могли разойтись.
3. Убрать номер тест-кейса из текста ошибки вовсе и оставить только смысловое сообщение (`BASE_URL is required for this check`).

Пункт 2
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:27-66`, `responseDetail`/`createRecord`/блок `CM.CUSTOMER.DEFAULT Reference Data - US-01.11.03` — дублируются один в один в `api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:28-67`, при том что в этом же MR уже создан `api/system_core/helpers/system-tables-helper.ts` как общее место для такой логики.
Дублирование удваивает стоимость поддержки при любом будущем изменении этой связки хелперов.
Варианты решения:
1. Перенести `responseDetail`, `createRecord` и билдеры для `CM.CUSTOMER.DEFAULT` в `system-tables-helper.ts` и импортировать из обоих спеков.
2. Оставить дублирование как есть, но добавить комментарий с явной ссылкой между файлами, чтобы оба менялись синхронно.
3. Объединить оба спек-файла в один с общим `describe.configure`, если разделение integration/smoke не даёт реальной изоляции запуска.

Пункт 3
`api/system_core/sys-core-api-paths.ts:23-26`, `api/system_core/client/table-registry-api-client.ts:264-279`, `executeEnquiry` — новый эндпоинт добавлен без Bruno-файла или иного проверяемого источника контракта в этом репозитории (`.bru`-файлов в нём нет вовсе).
Без ссылки на контракт нельзя независимо подтвердить соответствие пути/тела запроса реальному API.
Варианты решения:
1. Приложить ссылку на Bruno-коллекцию/OpenAPI-спеку из другого репозитория или Confluence прямо в MR-описании.
2. Добавить `.bru`-файл с этим запросом в `proj-test-automation`, если коллекция должна жить здесь.
3. Оставить как есть, но явно зафиксировать в описании тикета, что контракт проверен вручную against реальное окружение.

Пункт 4
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:172-180`, тест `TC-19` — проверка `not.toContain('"HIGH_RISK":false')` на сериализованном через `JSON.stringify` теле ответа, а не на разобранных полях.
Такая проверка чувствительна к порядку ключей/форматированию и не гарантирует, что негативное условие относится именно к нужной записи.
Варианты решения:
1. Распарсить тело ответа и проверять `HIGH_RISK` по конкретной записи с `id === countryId`.
2. Проверять, что среди всех записей ответа нет ни одной с `HIGH_RISK === false`, через `.every(...)` по массиву объектов.
3. Оставить проверку по подстроке, но сузить её до подстроки, включающей `countryId`, чтобы исключить совпадения по другим записям.

## Changelog

- **2026-07-28 (correction)**: the initial pass of this review diffed the MR branch against a
  *stale local* `main` ref instead of `origin/main`. Local `main` was several commits behind
  `origin/main` (missing the already-merged `group-3/TB-2225-FixTableHelper` fix, commit `83bd909`
  and its merge `38392a4`), so `git diff main..._mr-68-review` incorrectly included that fix's
  files (`api/system_core/helpers/table-registry-helper.ts`, `api/utils/base-api-client.ts`,
  `api/utils/db-helper.ts`, `api/utils/constants-waiter.ts`, `api/utils/global-setup.ts`,
  `api/utils/group-cleanup-helper.ts`, `api/utils/group-helper.ts`,
  `scripts/cleanup-test-schemas.ts`, `.env.example`) as if they were part of MR 68. They are not —
  confirmed by re-diffing against `origin/main` fresh, which reproduces exactly the 9-file changed
  list GitLab shows for this MR. All findings that depended on those files (comment-hygiene in
  `constants-waiter.ts`/`db-helper.ts`/`group-cleanup-helper.ts`/`table-registry-helper.ts`, the
  `waitForTableApiReady` deadline-extension risk, the bundled-infra-scope risk, the
  `global-setup.ts` sentinel duplication, and the `.env.example` `GROUP_ID` naming collision) have
  been removed as out of scope for this MR. The findings above (TC-23/TC-43, the duplicated fixture
  scaffolding, the `executeEnquiry` contract-justification risk, the TC-19 assertion, and the
  numeric-literal style nit) all reference files confirmed to be in MR 68's actual diff and stand
  unchanged.
