# TC-07: Accept Override возвращает 200 для актора без override-прав

- **Модуль:** Idempotency / Functional Duplicate Detection (US-01.12.03)
- **Тикет:** TB-2177 (продолжение открытого вопроса из [[tc03-override-accept-403]], TB-1860 TC-36)
- **Тест:** `idempotency-regression.spec.ts` — allureCaseId(2730), "OVERRIDE confirmation without
  permission is rejected"
- **Статус:** **Подтверждено официально** через TB-3031 "QA Compliance Check" (Confluence
  US-01.12.03, комментарий от 2026-08-20, статус тикета Done) — не гипотеза, а задокументированный
  провал AC7. Обнаружено 2026-08-28 при сверке Allure-инвентаря модуля с этой командой.

## Официальное подтверждение (TB-3031, 2026-08-20)

> AC7 | **Fail** | No permission check exists anywhere in the code for confirming overrides. The
> error code SYSE-001 referenced by the US doesn't appear anywhere in the codebase. **Confirmed
> directly: an ordinary account successfully confirmed an override with no role restriction in
> AC3.**
>
> Business rules section: "'Actor must have permission to confirm override' — **not implemented**
> (same gap as AC7)."

Это ровно тот сценарий, что и в TC-07 ниже (другой актор, `USER_WITHOUT_PERM`, ожидание 403) — теперь
подтверждено дважды независимо (наш тест + официальный QA Compliance Check по тикету).

## Контекст

[[tc03-override-accept-403]] закрыл вопрос про URL-баг в Bruno-контракте (правильный путь —
`.../records/operations/INPUT/accept`, с сегментом `/records/`) и оставил открытым главный вопрос:
что `/accept` реально проверяет — genuine four-eyes (approver ≠ initiator) или permission-check
(нехватка конкретного права/`OVERRIDE_CLASSES`)? Тот репро был про **self-approval** (один и тот же
актор инициирует и подтверждает).

TC-07 — другой сценарий: **два разных актора**. Второй — выделенный тестовый пользователь `NO_perm`
(`test-data/users-data-builder.ts`, `USERS_DATA.USER_WITHOUT_PERM`, credentials `NO_perm`/
`12345678`), задуманный как заведомо не имеющий никаких прав. URL уже с исправленным сегментом
`/records/` (constant `SYS_CORE_API_PATHS.PROJECTION.OPERATION_ACCEPT` в
`api/system_core/sys-core-api-paths.ts` уже содержит фикс).

## Репро

1. Таблица (INT), проекция `<tableId>~FUNCDUP`, `duplicateDetection` config `matchFields:
   [ACCOUNT_NUMBER]`, `enforcementAction: OVERRIDE`.
2. `POST .../records/operations/INPUT`, recordId=A, `ACCOUNT_NUMBER=X` (актор — стандартный
   тестовый пользователь) → `200`, запись сохранена, hash зарегистрирован.
3. `POST` того же эндпоинта, recordId=B, тот же `ACCOUNT_NUMBER=X` (тот же стандартный актор) →
   `422` с override-info — корректно.
4. Новый аутентифицированный контекст **как `NO_perm`** (свой Keycloak-токен, запрошен явно с этими
   credentials — проверено, что `getKeycloakAccessToken` действительно использует переданные
   `username`/`password`, а не откатывается на дефолтного тестового пользователя).
5. `POST .../records/operations/INPUT/accept`, body `{"recordId": "B"}`, от имени `NO_perm` →
   **ожидали `403`, получили `200`** (тело пустое).

Отличия от [[tc03-override-accept-403]]: здесь другой актор (не self-approval), и URL уже
корректный (не старый сломанный путь) — то есть запрос точно доходит до реальной бизнес-логики
Table Template, а не отклоняется на уровне роутинга.

## Что уже исключили (можно не перепроверять)

- **Не баг URL** — константа `OPERATION_ACCEPT` уже содержит `/records/` (фикс из
  [[tc03-override-accept-403]] уже применён и остаётся в коде).
- **Не баг клиента/аутентификации** — `TableRegistryApiClient.acceptOperationOverride`
  (`api/system_core/client/table-registry-api-client.ts:122-134`) корректно шлёт запрос с
  переданными заголовками; `createAuthenticatedApiContext` → `getKeycloakAccessToken`
  (`api/utils/auth-service.ts:172-193`) явно использует `options.username`/`options.password`,
  без фолбэка на дефолтного пользователя, когда они переданы (что и происходит в тесте). Значит
  токен реально принадлежит `NO_perm`, не какому-то другому/дефолтному актору.
- **Не баг теста в остальном** — сам сценарий (два разных актора, второй заведомо без прав) прямо
  соответствует AC7/BR-3.1, ничего не додумано сверх approved test case.

## Что пока НЕ проверено (нужно дополнительно)

- Реальный набор прав/групп у `NO_perm` в текущем окружении — предположение "нет прав" основано
  только на имени константы (`USER_WITHOUT_PERM`) и пароле, не на прямой проверке через
  Keycloak Admin API / `SM.USER.GROUP`. Нужно подтвердить, что у этого юзера действительно нет
  `PERMISSIONS`/`OVERRIDE_CLASSES`, а не просто "давно не проверяли, и права могли измениться" —
  это тот самый паттерн, что уже один раз всплывал с URL-багом: сначала кажется дефектом прав, а
  на деле — дефект самого репро/окружения.
- Если у `NO_perm` подтверждённо нет вообще никаких прав, а `/accept` всё равно вернул `200` —
  это значит эндпоинт **не проверяет права вообще** (ни four-eyes, ни permission-check), что
  сильнее любого прежде предполагавшегося варианта.

## Вопросы к разработчику (продолжение [[tc03-override-accept-403]])

1. Тем же вопросам из [[tc03-override-accept-403]] (four-eyes vs `OVERRIDE_CLASSES`
   permission-check vs что-то ещё) — теперь есть репро без self-approval, с URL уже без бага: какой
   именно контроль должен сработать здесь и почему он не сработал?
2. Стоит ли `/accept` вообще какая-либо авторизационная проверка сегодня (не только для
   override-прав, а в принципе — любой аутентифицированный актор может подтвердить чужой override)?
3. Если контроль должен идти через `OVERRIDE_CLASSES` на `SM.USER.GROUP` — подтверждено ли, что
   `NO_perm` не состоит ни в одной группе с таким классом? Нужен наглядный пример, как это вообще
   проверить/задать.

## Что сделано в автоматизации

- Тест **не изменён** — TC-07 correctly encodes AC7/BR-3.1; менять assert под текущее (возможно
  дефектное) поведение не стали, чтобы не маскировать потенциальный пробел в авторизации.
- Открыт этот вопрос вместо тихой правки теста.

---

**Закрыто и уточнено окончательно (2026-08-28) — 3-пробная живая диагностика (temp-файл
`_diag-override-accept-actor-probe.spec.ts`, прогнан и удалён, не часть постоянного набора):**

| Проба | Инициатор INPUT | Кто делает accept | Результат |
|---|---|---|---|
| 1 | стандартный юзер | **тот же** юзер (self-approval) | `200` — успех |
| 2 | стандартный юзер | `NO_perm` (другой актор, ноль прав) | `403 "User does not have function: <table>.INPUT"` |
| 3 | `MAKER_USER` | `CHECKER_USER` | Неубедительно — оба падают на `403 "no access to table"` ещё до override-сценария: у этих предзаданных юзеров нет доступа к произвольной AQA-таблице (ограничение окружения, не про four-eyes) |

**Точный вывод, важнее прежней формулировки TB-3031** ("no permission check exists anywhere"): проверка
прав **есть**, но это обычное право `INPUT` на таблицу — не отдельный override/four-eyes permission,
и оно **не различает** "тот же актор" от "другого актора". Любой актор с правом `INPUT` на таблицу
может подтвердить **любой** pending override на ней, включая свой собственный. Actual identity-based
four-eyes в коде нет вообще, ни в каком виде.

Из этого следует:
- **Наш тест TC-07 (`allureCaseId(2730)`) сейчас ЗЕЛЁНЫЙ** — и это правильно: `NO_perm` отклоняется
  именно потому, что у него нет обычного права `INPUT` на таблицу, что совпадает с ожиданием теста
  (`403`). Прежняя формулировка в этом файле ("намеренно красный до фикса") была неверной — тест не
  документирует баг, он проверяет реальную (пусть и более простую, чем ожидалось) permission-модель.
- **Кейс 2726** (self-approval → 200, `idempotency-smoke.spec.ts`) тоже соответствует реальному
  поведению — это не баг, замаскированный под норму, а точное описание того, что есть.
- **Кейс 2740** ("OVERRIDE approver vs initiator (4-eyes)") описывал концепцию, которой в системе
  просто нет — не "недоделано", а отсутствует как идея. Удалён пользователем из Allure 2026-08-28
  после подтверждения этой диагностикой. Полная история — [[tc03-override-accept-403]].
