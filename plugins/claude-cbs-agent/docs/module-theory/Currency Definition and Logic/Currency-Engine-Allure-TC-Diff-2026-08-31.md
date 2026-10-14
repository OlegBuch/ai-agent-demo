# Allure TC diff — Currency Engine contract update (2026-08-31)

Точный `as-is` / `as-needed` разбор шести Allure-кейсов, которые исходный keyword-скан агентов
пометил как потенциально устаревшие после апдейта `POST currency-engine/api/v1/currencies/rates`
(см. [Currency-Engine-QA-Verification-2026-08-31.md](Currency-Engine-QA-Verification-2026-08-31.md)
§4 для контекста). Текст "как сейчас" — дословно вытянут напрямую из Allure (`GET
/api/testcase/{id}` + `GET /api/testcase/{id}/step`, 2026-08-31), не пересказ. После точной сверки
**5 из 6 реально устарели, 1 — ложное срабатывание** (см. строку 3145).

**Правки в Allure ещё не внесены** — таблица подготовлена для вашего решения по каждой строке
отдельно, запись через `testops_update_testcase` только после явного ОК.

---

## Сводка

| Allure ID | Название | Story | Статус | Что не так |
|---|---|---|---|---|
| [3094](#3094) | Direct Cross-Rate Resolution via Explicit Currency Pair | US-01.13.03 | 🔴 Нужно обновить | ER описывает плоский `{baseCurrency, quoteCurrency, rateType,}` |
| [3145](#3145) | Base vs Quote Resolution L1 | US-01.13.03 | ⚪ Не трогать | ER — только `"HTTP 404 Rate Not Found"`, про форму ответа речи нет; флаг был по телу **запроса**, а не ответа |
| [3153](#3153) | Triangulation via explicit API transitCurrency | US-01.13.03 | 🔴 Нужно обновить | ER: `rateValue ~= 0.010478` как плоское поле |
| [3160](#3160) | Validate rateValue is rounded/scaled to NO_OF_DECIMALS | US-01.13.03 | 🔴 Нужно обновить | Название + 3 ER + действие шага 3 — везде `rateValue` как плоское поле |
| [3208](#3208) | Triangulated cross-rate rounds ONCE at the end | US-01.13.03 | 🔴 Нужно обновить + доп. блокер | ER: `rateValue = 0.21`; запрос шага 3 использует `market:1` — сейчас 404 (см. QA-Verification §3a) |
| [3209](#3209) | Triangulated cross-rate preserves ≥18 decimal digits | US-01.13.03 | 🔵 Blocked, не трогать | TB-3277 (Code Review, 0 комментариев в Jira) — **живьём перепроверено 2026-08-31: бэкенд всё ещё принимает максимум 9 знаков после запятой, тот же текст ошибки**, что и в тикете; решение "9 или 18" не финализировано |

**2026-08-31, повторная сверка после вопроса про TB-3277**: перечитал все 67 кейсов ещё раз на
предмет decimal-cap темы (не только response-shape) — единственный кейс во всём модуле, чья
прекондишн упирается в 9-decimal лимит `RATE_VALUE`, это 3209. Остальные ER/precondition-упоминания
`NO_OF_DECIMALS` (1868, 1893, 2246, 3160, 3208) используют 2-4 знака — далеко ниже лимита, не
затронуты.

---

## 3094 — Direct Cross-Rate Resolution via Explicit Currency Pair

**Тэги:** API, Smoke, smoke_m2 · **Автор:** Viktoryia.burak

Шаг 2, Expected Result:

**Как сейчас:**
```
HTTP 200; returns response body { baseCurrency, quoteCurrency, rateType, } for the exact key & RATE_TYPE (no auto-spread); read-only, high-TPS
```

**Как нужно:**
```
HTTP 200; returns response body { baseCurrency: {currency, quotationCode, numberOfDecimals}, quoteCurrency: {currency, quotationCode, numberOfDecimals}, rate: {type, value: {units, nanos}} } for the exact key & RATE_TYPE (no auto-spread); read-only, high-TPS
```

Это тот же самый кейс, чей автотест (`allureCaseId(3094)`, `currency-smoke.spec.ts`) уже упал сегодня
живьём именно на этом: `body.baseCurrency` ожидался как строка, пришёл объект.

---

## 3145 — Base vs Quote Resolution L1 — Explicit API Override Strict Lookup

**Тэги:** API, Regression, regression_m2 · **Автор:** Viktoryia.burak

Единственный шаг в хранимом сценарии (root содержит только один узел — похоже, в Allure записан
только STEP 2 автотеста, "reversed pair", STEP 1 "explicit pair wins" туда не попал):

**Как сейчас** (action):
```
1. POST (INPUT) {{currency-engine-url}}/api/v1/currencies/rates
{ "market": 3, "businessUnit": "TESY", "baseCurrency": "AUD", "quoteCurrency": "USD", "rateType": "BID", "amount": {"units": 120, "nanos": 0} }
```
**Как сейчас** (ER):
```
HTTP 404 Rate Not Found;
```

**Правка не нужна.** `baseCurrency`/`quoteCurrency` здесь — это тело **запроса** (не изменилось,
по-прежнему плоские строки), а ER не упоминает форму ответа вообще. Автоматический keyword-скан
пометил этот кейс ложно, сработав на слово `baseCurrency` в JSON запроса, а не в описании ответа.

*Отдельно, вне контракта:* сам сценарий здесь неполный (нет шага "explicit pair resolves directly")
— если хотите, можно дозаполнить вторым шагом, но это не связано с сегодняшним апдейтом.

---

## 3153 — Triangulation via explicit API transitCurrency

**Тэги:** API, Regression, regression_m2 · **Автор:** Viktoryia.burak / vadym.udaltsov

Шаг 2, Expected Result:

**Как сейчас:**
```
HTTP 200; cross-rate divides by the TRANSIT currency's own 10^QUOTATION_CODE (10^3 = 1000 here), not a fixed 10^1 — rateValue ~= 0.010478, not ~=1.0478
```

**Как нужно:**
```
HTTP 200; cross-rate divides by the TRANSIT currency's own 10^QUOTATION_CODE (10^3 = 1000 here), not a fixed 10^1 — rate.value ~= {units:0, nanos:10478000} (≈0.010478), not ~= {units:1, nanos:47800000} (≈1.0478)
```

---

## 3160 — Validate rateValue is rounded/scaled to the currency NO_OF_DECIMALS

**Тэги:** API, Regression, regression_m2 · **Автор:** Viktoryia.burak

**Название кейса — как сейчас:**
```
Validate rateValue is rounded/scaled to the currency NO_OF_DECIMALS
```
**Название — как нужно:**
```
Validate rate.value is rounded/scaled to the currency NO_OF_DECIMALS
```

Шаги 1–3, Expected Result (текст идентичен во всех трёх, включая опечатку "rrateValue" в шаге 2 —
она уже была в оригинале):

**Как сейчас** (шаг 1 ER):
```
1. HTTP 200; rateValue is scaled to the QUOTE currency (3 decimals). Precision tracks the quote currency's NO_OF_DECIMALS and is unaffected by the base currency.
```
**Как сейчас** (шаг 2 ER, с опечаткой в оригинале):
```
2. HTTP 200; rrateValue is scaled to the QUOTE currency (3 decimals). Precision tracks the quote currency's NO_OF_DECIMALS and is unaffected by the base currency.
```
**Как сейчас** (шаг 3, действие + ER):
```
3. POST (INPUT) {{currency-engine-url}}/api/v1/currencies/rates RateValue=0.12 (2 characters after comma)
4. Inspect rateValue in the response.
```
```
3. HTTP 200; rateValue is scaled to the QUOTE currency (3 decimals). Precision tracks the quote currency's NO_OF_DECIMALS and is unaffected by the base currency.
```

**Как нужно** (одинаково для всех трёх ER, опечатка заодно исправляется):
```
HTTP 200; rate.value is scaled to the QUOTE currency (3 decimals). Precision tracks the quote currency's NO_OF_DECIMALS and is unaffected by the base currency.
```
**Как нужно** (действие шага 3):
```
3. POST (INPUT) {{currency-engine-url}}/api/v1/currencies/rates RateValue=0.12 (2 characters after comma)
4. Inspect rate.value in the response.
```

---

## 3208 — Triangulated cross-rate rounds ONCE at the end to quote NO_OF_DECIMALS (not per leg)

**Тэги:** нет · **Автор:** Viktoryia.burak

Единственный шаг, действие + Expected Result:

**Как сейчас** (action, шаг 3 внутри):
```
3. POST {{currency-engine-url}}/api/v1/currencies/rates
   { "market":1, "businessUnit":"<base currency>", "baseCurrency":"<base currency>", "quoteCurrency":"<quote currency>", "rateType":"MID", "amount":{"units":1000,"nanos":0} }
```
**Как сейчас** (ER):
```
HTTP 200; rateValue = 0.21 - i.e. (1.003 x 2.044) / 10 computed at full internal precision and rounded ONCE, at the final step, to the quote currency NO_OF_DECIMALS (2). If the engine instead rounds each leg to its own display precision before combining, the result would be 0.20 - that value must NOT be returned.
```

**Как нужно** (ER):
```
HTTP 200; rate.value = {units:0, nanos:210000000} (i.e. 0.21) - i.e. (1.003 x 2.044) / 10 computed at full internal precision and rounded ONCE, at the final step, to the quote currency NO_OF_DECIMALS (2). If the engine instead rounds each leg to its own display precision before combining, the result would be {units:0, nanos:200000000} (0.20) - that value must NOT be returned.
```

**Дополнительно, не про текст ER:** запрос в шаге 3 использует `"market":1` — тот самый маркет,
который сейчас (см. QA-Verification §3a) **не резолвится через основной `/rates` endpoint вообще**,
независимо от `businessUnit`. Даже после правки текста этот кейс физически не пройдёт live, пока
не решится вопрос с market=1 у разработчика. Рекомендация: держать правку текста отдельно от
вопроса "можно ли гонять этот кейс на market=1 прямо сейчас".

---

## 3209 — Triangulated cross-rate preserves at least 18 decimal digits of internal precision

**Тэги:** нет · **Автор:** Viktoryia.burak

Единственный шаг, Expected Result:

**Как сейчас:**
```
HTTP 200; rateValue, read from the raw response body, must start with 0.11263526798643499 (first 17 decimal digits - computed via arbitrary-precision decimal arithmetic, independently cross-verified). If any step of the calculation silently drops to IEEE double precision, the result instead starts with 0.11263526798643497 - diverging at the 17th decimal digit. That value must NOT be returned.
```

**Это не просто переименование поля — структурная проблема, заблокирована дважды, независимо
друг от друга.**

**Блокер №1 — TB-3277, живьём перепроверено 2026-08-31.** Тикет сейчас `Code Review`, обновлён
2026-08-28 (в день созвона по апдейту), **0 комментариев в самой Jira** — реальное обсуждение
шло только в переписке (та, что вы прислали). Ключевое из неё:
- Изначально команда решила чинить бэкенд на приём 18 знаков (Mikalai + Artur, "Ок, тогда на беке
  делаем 18 и все... Определились").
- Позже (Artur, тот же день вечером, правка сообщения): *"тут пока чуток стопаемся, завтра будет
  точная инфа, мб оставим 9 знаков после запятой для валют и тогда валидация будет на 9 знаков для
  NO_OF_DECIMALS"* — то есть решение **отменили обратно на "может быть 9"**, причём в этом варианте
  под вопросом уже не только `RATE_VALUE`, а сам `NO_OF_DECIMALS`.
- Тред обрывается на "держи вкурсе процесса" — то самое "завтра" в Jira/чате не задокументировано.

**Прогнал сегодняшний автотест (`allureCaseId(3209)`, `currency-regression.spec.ts:3736`) вживую
2026-08-31, после сегодняшнего апдейта движка:** результат **не изменился** — то же самое `400
"RATE_BANDS[0].RATE_VALUE - value must be a number with up to 9 decimal places (e.g. 3.14)"`,
дословно совпадает с текстом из тикета. Значит фикс (в любую сторону — хоть 18, хоть формальное
закрепление 9) **ещё не выкатили**, несмотря на то что остальной Currency Engine сегодня обновили.

**Блокер №2 — новый, найден только сейчас, не связан с TB-3277 напрямую.** Даже если фикс на 18
знаков когда-нибудь выкатят на стороне `INPUT`, у нового контракта ответа `rate.value` —
это `{units, nanos}`, а `nanos` (`int32`) физически вмещает максимум 9 знаков после запятой
(до `999999999`). Различие на **17-м** знаке, которое проверяет этот кейс, невозможно выразить
через `rate.value` в его нынешнем виде — то есть даже разблокированный TB-3277 не спасает этот
конкретный тест, если он продолжит проверять точность через сырое тело ответа `/currencies/rates`.

**Итог — что делаем: ничего не трогаем прямо сейчас, оба блокера открыты и не в нашей власти.**
- Не пытаться починить текст ER точечным переименованием поля — при любом из двух возможных
  исходов TB-3277 (9 или 18) кейс всё равно придётся переписывать по существу, а не косметически.
- Держать статус `Blocked`, как и было.
- Стоит явно спросить у Mikalai/Artur, состоялся ли тот разговор "завтра" (сообщение отправлено в
  четверг, сегодня уже понедельник) и чем кончилось — в Jira и в доступной переписке ответа нет.
- Если/когда решение реально примут: при исходе "18" — параллельно поднять вопрос про `nanos`
  (Блокер №2) отдельным тикетом/уточнением, иначе тест всё равно не заработает; при исходе "9,
  формально" — прекондишн кейса (`NO_OF_DECIMALS=18`) нужно менять на 9 и переписывать сам смысл
  теста (там уже физически негде взять 18 значащих цифр для сравнения double-vs-decimal).

---

## Полный аудит кода тестов, не только текста Allure (2026-08-31, повторный проход)

Всё выше — про то, устарел ли **текст** Allure-кейса. Отдельный вопрос: у скольких тестов сломан
**код**, даже если сам Allure ER написан на уровне поведения и текстово не устарел. Прогнал
`grep` на `body\.(baseCurrency|quoteCurrency|rateValue|quoteCode)` по обоим спек-файлам и сопоставил
каждое вхождение с ближайшим предшествующим `allureCaseId(...)`.

### Важная находка: TC 3146 — не просто сломан, возможно, стал непроверяемым в принципе

`allureCaseId(3146)` ("Base Resolution L3: Automatic base currency designation via lowest
BASE_CCY_RANK", AC2 стори "лучший BASE_CCY_RANK побеждает, когда явная база не указана") — **сам
Allure-текст в порядке** (ER написан поведенчески: "engine picks the currency with the lowest
BASE_CCY_RANK as base"), править не нужно. Но код теста:
```ts
currencies: [currencyA.recordId, currencyB.recordId],   // строка 2359
...
currencies: [currencyB.recordId, currencyA.recordId],   // строка 2382 (шаг 2, реверс)
```
использует **именно то поле, которое убрали** — плюс market=1 (заблокирован, §3a), плюс
`body.baseCurrency`/`body.quoteCurrency` как плоские строки (строки 2370/2373). Тройной слом.

**Более серьёзный вопрос, не про починку кода:** `currencies[]` был **единственным** способом
отправить запрос без явной базовой валюты — с `baseCurrency`/`quoteCurrency` всегда нужно явно
указывать, кто база. Если `currencies[]` действительно убран навсегда (подтверждено дословно на
звонке и живьём), то **весь сценарий AC2 (fallback по BASE_CCY_RANK, когда база не указана) может
быть больше не проверяем через основной endpoint вообще** — не только у этого теста сломан код, а
у самого требования может не остаться механизма его продемонстрировать через API.

**РЕШЕНО 2026-09-02.** Спросили у dev/BA прямо этот вопрос — ответ Артура Фоничкина: сценарий не
переехал никуда, его убрали осознанно, потому что сам АС2 больше не валиден (по жёсткому правилу
Андрея Петкевича курсы теперь всегда есть в обе стороны, т.е. "база не указана" — недостижимое
состояние). AC2 удаляется из стори (Микалай Юдзилевич обновит Confluence). Тест удалён из
`currency-regression.spec.ts`, кейс 3146 удалён из Allure TestOps. См.
[[project_currency-engine-contract-findings]] и `US-01.13.03/README.md`.

### Полная таблица — что сломано в коде и почему

| allureCaseId | Тест (файл:строка) | Allure-текст устарел? | Код сломан | Причина |
|---|---|---|---|---|
| 3094 | `currency-smoke.spec.ts:359` | 🔴 Да (см. выше) | 🔴 Да | `body.baseCurrency`/`quoteCurrency`/`rateValue` плоские |
| 3229 | `currency-smoke.spec.ts:503` | ⚪ Нет | 🔴 Да | market=1 (404) **+** `body.rateValue` плоский — двойная причина |
| 3145 | `currency-regression.spec.ts:2247` | ⚪ Нет (ER не про форму ответа) | 🔴 Да | STEP 1 (не вошедший в Allure-текст) использует `body.baseCurrency`/`quoteCurrency` плоские |
| 3146 | `currency-regression.spec.ts:2320` | ⚪ Нет | 🔴 Да, тройной | `currencies[]` убран **+** market=1 **+** плоские поля — см. разбор выше |
| 3147 | `currency-regression.spec.ts:2190` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |
| 3148 | `currency-regression.spec.ts:2217` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |
| 3153 | `currency-regression.spec.ts:2535` | 🔴 Да (см. выше) | 🔴 Да | `body.rateValue` плоский (2 места) |
| 3154 | `currency-regression.spec.ts:2814` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |
| 3160 | `currency-regression.spec.ts:3093` | 🔴 Да (см. выше) | 🟡 Возможно | Прямых `body.rateValue` не найдено — вероятно читает сырой текст ответа; всё равно стоит перепроверить руками при правке |
| 3162 | `currency-regression.spec.ts:3178` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |
| 3208 | `currency-regression.spec.ts:3649` | 🔴 Да (см. выше) | 🔴 Да | `body.rateValue` плоский (2 места) **+** market=1 |
| 3209 | `currency-regression.spec.ts:3736` | — Blocked, не трогаем | — | См. раздел выше про TB-3277 |
| 3210 | `currency-regression.spec.ts:3817` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |
| 3211 | `currency-regression.spec.ts:3392` | ⚪ Нет | 🔴 Да | `body.rateValue` плоский |

**14 тестов из 67-кейсового набора реально сломаны в коде** (не 5-6, как показал только
текстовый Allure-аудит) — большинство из них Allure-текст описывает корректно на уровне
поведения, ломается именно реализация под новый контракт. Это ожидаемо: response-shape апдейт
задевает буквально каждый тест, который парсит JSON-ответ `resolveRate` напрямую.

**Не входит в этот список, но тоже сломано** (уже описано в QA-Verification §5): весь
US-01.13.02-независимый остаток US-01.13.03 использует `CCY_ORDER_TEST_MARKET_ID='1'` по
умолчанию — market-1-регрессия резонирует почти с каждым из этих 14 тестов дополнительно, поверх
проблемы с формой ответа.

---

## Что делать дальше

Три класса действий, разного риска:

1. **Безопасно записать сейчас** (чистое переименование поля, поведение не меняется):
   3094, 3153, 3160.
2. **Записать текст, но пометить как всё равно нерабочий до ответа dev** (market=1): 3208.
3. **Не трогать вообще, статус Blocked остаётся** (два независимых открытых блокера — TB-3277
   не решён, плюс структурная проблема с `nanos`, см. выше): 3209.
4. **Не трогать, ложное срабатывание**: 3145.

Скажите, по какому из первых двух пунктов писать (могу сделать все сразу, могу по одному с
подтверждением каждого) — как только скажете "поехали", запишу через `testops_update_testcase` и
перепроверю после записи (`GET` + diff), как того требует конвенция проекта.
