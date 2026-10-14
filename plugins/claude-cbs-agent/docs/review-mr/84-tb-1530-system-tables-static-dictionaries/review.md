# MR 84 Review — System Tables (Static Dictionaries): Smoke + Regression + Integration

## Summary

This MR bundles the automation for three related tickets on one branch: **TB-1757** ("Integration
test impl: System Tables (Static Dictionaries)"), **TB-1530** ("Test implementation: ... - Smoke"),
and **TB-2090** ("Test implementation: ... - Regression"), all currently "In Code Review" against
the spec at `EP-01.11 System Tables (Static Dictionaries)`. It adds three new spec files —
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts` (`@integration`),
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts` (`@smoke_m2`), and
`api/system_core/tests/system-tables-regress.spec.ts` (`@regression_m2`) — covering
CM.CUSTOMER.DEFAULT reference-data validation (US-01.11.03), REVERSE-is-blocked behavior for
classifier/COUNTRY/COUNTRY.GROUP/LEGAL.DOC.TYPE records (US-01.11.01/02/05), a new enquiry-execute
read path (US-01.11.04), and LEGAL.DOC.TYPE validation (US-01.11.05). Supporting the specs: a new
`api/system_core/helpers/system-tables-helper.ts` (DB tracking/cleanup/polling + REVERSE-attempt
helper), a `api/utils/reference-data.values.ts` constants file, new types
(`api/types/system-tables.types.ts`, additions to `table-registry.types.ts`), a new
`executeEnquiry` client method + `ENQUIRY.EXECUTE` path constant, and new payload-builder factories.

This branch was already reviewed once as **MR 68** (`docs/review-mr/68-tb-1757-...`) when it
contained only the integration + smoke specs. That review's findings on the copy-paste `TC-43`
error string and the cross-spec-file helper duplication were never applied — both are still
present in this diff, now joined by a third spec file that deepens the same duplication pattern.
The final commit on this branch (`afa352f`) renumbered test cases and aligned the smoke tag to
`@smoke_m2`; tag taxonomy across all three new files is now correct.

## Confirmed Issues

**1. (carried over from MR 68, still unfixed) `TC-23`'s own error message references a different test case (`TC-43`)**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:164,168`:
```ts
test(
  'TC-23: Verify that an unauthorized module is rejected with an access denied response',
  ...
    if (!baseURL) throw new Error('BASE_URL is required for TC-43');
```
The test is named `TC-23` but its own guard-clause error string says `TC-43`. Anyone debugging a
`BASE_URL` misconfiguration from a CI log is pointed at the wrong test case. This exact defect was
flagged in MR 68's review and shipped unchanged into this MR.

**2. (carried over from MR 68, now spread across a third file) Fixture/helper scaffolding is copy-pasted across all three spec files instead of using the shared helper this MR itself introduces**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:31` (`responseDetail`),
`:55` (`createRecord` wrapper); `api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:32`,
`:56`; `api/system_core/tests/system-tables-regress.spec.ts:59` — the same one-line
`responseDetail = async (res) => summarize(await readBody(res))` composition and the same
`createRecord = (prefix, projection, schema, buildPayload) => createReferenceRecord(client, db, ...)`
thin wrapper are re-declared verbatim in every one of the three new spec files. The integration and
smoke specs additionally duplicate the entire `CM.CUSTOMER.DEFAULT Reference Data - US-01.11.03`
nested `describe` block (`createSector`/`createIndustry`/`createTarget`/`inputCustomerDefault`).
`api/system_core/helpers/system-tables-helper.ts` already exists in this same diff as the shared
home for this suite's DB logic — `responseDetail` and the thin `createRecord` wrapper belong there
too, not copy-pasted three times. Per `docs/frame-specs/coding-standards.md`'s "Module boundary"
section, business/domain logic belongs in `helpers/`, not repeated inline in every spec.

**3. `ReferenceDataDb.waitForRecord` hand-rolls a DB polling loop instead of using the existing generic poller**
`api/system_core/helpers/system-tables-helper.ts:37-53` (`waitForRecord`, looping on
`Date.now() - start < maxWaitMs` with a 1000ms delay and a swallow-and-retry `catch`) reimplements
the same loop-poll-delay-retry shape that `api/utils/test-polling-helper.ts`'s exported `pollDb`
(lines 15-30) already provides generically (query + params + a `condition(res)` callback +
configurable `maxAttempts`/`delayMs`). `docs/frame-specs/coding-standards.md`'s "Retry and timing"
section is explicit that a new test/helper should prefer an existing polling helper over hand-rolling
one. `pollDb` would need only a `condition` closure checking
`res.rows[0] && (expectedSeqNo === undefined || Number(res.rows[0].seq_no) === expectedSeqNo)` to
cover this exact case.

**4. `summarize()` reimplements the repo's existing defensive error-message extraction instead of reusing it**
`api/system_core/helpers/system-tables-helper.ts:101-103`:
```ts
export function summarize(body: ProblemDetail): string {
  return body.detail ?? body.title ?? body.message ?? JSON.stringify(body);
}
```
`api/utils/response-parser.ts:4-6` already exports `extractErrorMessage(body): body.detail ?? body.message ?? body.error ?? body.title` for exactly this purpose, and
`docs/frame-specs/api-conventions.md`'s "Request/response shape" section documents this defensive
fallback chain as the established, repo-wide convention for reading an inconsistent error body —
not something to be redeclared per-module with a slightly different field order.

## Possible Risks

**1. The new `executeEnquiry` never sends the `page`/`size` query params the real endpoint's own contract uses, and enquiry results are paginated**
`api/system_core/client/table-registry-api-client.ts:116-131` (`executeEnquiry`) and
`api/system_core/sys-core-api-paths.ts:23-26` (`ENQUIRY.EXECUTE`) build a bare
`{tableBase}/enquiries/{enquiryId}/execute` path with no query string. The real contract
(`Table Template/Enquries/Execute Enquiry.yml` in the `proj-bruno-api` sibling collection) shows the
canonical request as `POST .../execute?page=0&size=20` and a response shaped
`{ data: [...], pagination: { page, pageSize, total } }` — i.e. this is a paginated endpoint. If the
server applies a default page size when the params are omitted, any test asserting a specific
record is present (TC-19, TC-20 in the smoke/regression specs) risks a false failure once enough
reference-data rows have accumulated in the shared QA environment to push the newly-created record
past page 0's implicit default size — a flake that would appear unrelated to the change that
actually broke it.

**2. Enquiry assertions check the whole response as a stringified blob instead of the two assertion styles this repo documents**
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:164,172` (TC-19) and
`api/system_core/tests/system-tables-regress.spec.ts:391,401,445,447,478` (TC-20/TC-21/TC-22):
```ts
const bodyText = JSON.stringify(await res.json());
...
expect(bodyText, '...').not.toContain('"HIGH_RISK":false');
```
`docs/frame-specs/testing-standards.md`'s "Assertions" section documents exactly two acceptable
styles — field-by-field `expect(body.field, msg).toBe(value)` or `expect(body).toMatchObject({...})`
— neither of which is a substring search over a `JSON.stringify`'d blob. Given Possible Risk #1's
pagination behavior, `data` can contain other records; a substring check across the whole response
doesn't verify the negative assertion is actually scoped to the record under test, and is sensitive
to key ordering/formatting changes in the enquiry response.

## Nice-to-Have Improvements

**1. Numeric literal style inconsistency (now in three files)**
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:51`,
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:49`, and
`api/system_core/tests/system-tables-regress.spec.ts:44` all write `test.setTimeout(120000)`, while
the rest of the codebase consistently uses the `_` numeric separator for timeouts this size (e.g.
`api/product_factory/tests/pf-core-smoke.spec.ts:164`'s `test.setTimeout(120_000)`).

**2. `reference-data.values.ts` mixes flat and nested grouping for equivalent data**
`api/utils/reference-data.values.ts`: `LEGAL_DOC` groups its three defaults under one nested object
(`LEGAL_DOC: { EXTERNAL_STD_REF, REGEX_MASK, EXPIRY_MANDATORY }`), while `DEFAULT` flatly mixes
per-entity keys with entity-name prefixes instead (`SECTOR_RISK_EXPO_TYPE`,
`INDUSTRY_EXTERNAL_STD_REF`, `RATING_AGENCY`, `CUSTOMER_DEFAULT_STREET_MANDATORY`) alongside
genuinely shared defaults (`HIGH_RISK`, `INACTIVE_FLAG`). Nesting `DEFAULT` per entity the same way
`LEGAL_DOC` is nested (e.g. `SECTOR: { RISK_EXPO_TYPE: 'BANK' }`) would make the file's own grouping
convention consistent with itself. Also, `MASTER_SUFFIX: '~MASTER'` sits as a bare top-level key
alongside the six nested category objects rather than inside one of them.

## Ready-to-paste GitLab comment

Пункт 1
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:168`, тест `TC-23` — сообщение об ошибке ссылается на `TC-43`, которого нет в этом файле, вместо `TC-23`.
Это уже отмечалось в прошлом ревью этой ветки (MR 68) и до сих пор не исправлено, сбивая с толку при разборе падения в CI.
Варианты решения:
1. Заменить `TC-43` на `TC-23` в строке ошибки.
2. Вынести номер тест-кейса в константу рядом с `test(...)`, чтобы название и сообщение об ошибке не могли разойтись.
3. Убрать номер тест-кейса из текста ошибки вовсе и оставить только смысловое сообщение (`BASE_URL is required for this check`).

Пункт 2
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts:31,55`, `responseDetail`/`createRecord` — дублируются один в один в `system-tables-static-dictionaries-smoke.spec.ts:32,56` и `system-tables-regress.spec.ts:59`, при том что `system-tables-helper.ts` уже создан в этом же MR как общее место для такой логики.
Дублирование теперь растянуто на три файла и удваивает (утраивает) стоимость поддержки при любом будущем изменении этой связки хелперов.
Варианты решения:
1. Перенести `responseDetail` и `createRecord` в `system-tables-helper.ts` и импортировать из всех трёх спеков.
2. Оставить дублирование как есть, но явно связать файлы комментарием-ссылкой, чтобы они менялись синхронно.
3. Объединить пересекающиеся `describe`-блоки (`CM.CUSTOMER.DEFAULT Reference Data - US-01.11.03`) в общий модуль сценариев, параметризованный по тегу (`@smoke_m2` vs `@integration`).

Пункт 3
`api/system_core/helpers/system-tables-helper.ts:37`, `ReferenceDataDb.waitForRecord` — вручную реализует цикл поллинга БД вместо использования уже существующего `pollDb` из `api/utils/test-polling-helper.ts`.
Дублирование логики поллинга усложняет поддержку и противоречит собственному правилу проекта переиспользовать уже существующие poll-хелперы.
Варианты решения:
1. Переписать метод через `pollDb`, передав условие по `seq_no`/наличию строки.
2. Вынести текущую реализацию как есть в `db-helper.ts`, если её форма (time-bound, а не attempt-bound) оправдана для этого сценария, и задокументировать это отличие.
3. Оставить как есть, но добавить unit-подобный тест на сам хелпер, чтобы дублирующая логика не разошлась незаметно с `pollDb`.

Пункт 4
`api/system_core/helpers/system-tables-helper.ts:101`, `summarize` — повторяет уже существующую защитную логику извлечения сообщения об ошибке из `api/utils/response-parser.ts`, `extractErrorMessage`, с немного другим порядком fallback-полей.
Два почти идентичных хелпера для одной и той же задачи усложняют будущие правки конвенции чтения ошибок.
Варианты решения:
1. Заменить `summarize` на вызов `extractErrorMessage` (при необходимости расширив его fallback на `JSON.stringify(body)`).
2. Расширить сигнатуру `extractErrorMessage`, чтобы она покрывала оба случая, и удалить `summarize`.
3. Оставить `summarize` как специализированный вариант, но явно вызвать `extractErrorMessage` внутри вместо копирования цепочки `??`.

Пункт 5
`api/system_core/client/table-registry-api-client.ts:116`, `executeEnquiry` — не передаёт `page`/`size`, хотя реальный контракт (`Execute Enquiry.yml` в `proj-bruno-api`) — это пагинированный эндпоинт с `page=0&size=20` в каноническом примере.
Без явной пагинации тесты, ищущие конкретную запись, рискуют получить false negative, если в общей QA-среде накопится больше записей, чем помещается на страницу по умолчанию.
Варианты решения:
1. Добавить `page`/`size` как параметры `executeEnquiry` с дефолтами `0`/`20` (или большим значением для тестовых нужд).
2. Пройтись по всем страницам ответа внутри хелпера, если общее количество (`pagination.total`) больше размера одной страницы.
3. Оставить без пагинации, но задокументировать это как осознанное ограничение и завести тикет на дальнейшее расширение клиента.

Пункт 6
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:164,172` (`TC-19`) и `system-tables-regress.spec.ts:391,401,445,447,478` (`TC-20`-`TC-22`) — проверки идут по `JSON.stringify` всего тела ответа вместо предметных проверок по полям.
Это противоречит `testing-standards.md`, где документированы только два стиля assert (по полю или `toMatchObject`), и не гарантирует, что негативное условие относится именно к нужной записи, особенно с учётом пагинации из пункта 5.
Варианты решения:
1. Распарсить `data` и проверять нужную запись по `id`, а негативное условие — через `.every(...)` по массиву записей.
2. Использовать `toMatchObject` для точечной проверки полей найденной записи вместо substring-проверки всей строки.
3. Оставить substring-проверку, но сузить её до подстроки, включающей `id` записи, чтобы исключить совпадения с другими записями на странице.

## Changelog

- **2026-07-28**: Initial review of MR 84, which supersedes/extends the branch previously reviewed
  as MR 68 (`docs/review-mr/68-tb-1757-system-tables-static-dictionaries/review.md`). MR 68's two
  Confirmed Issues (TC-23/TC-43 error string, cross-spec-file helper duplication) were re-verified
  against this MR's current diff and found still present, so they are restated here rather than
  assumed fixed. Two new Confirmed Issues were added (`waitForRecord` vs. `pollDb`, `summarize` vs.
  `extractErrorMessage`) after reading `api/utils/` in full per this command's reuse-check step. The
  `executeEnquiry` contract-justification risk from MR 68 was resolved to a confirmed real endpoint
  (found in the `proj-bruno-api` sibling collection, which is now present on this machine) but
  reframed as a pagination-gap risk instead, since the endpoint contract's own canonical example
  includes `page`/`size` query params this client never sends.
