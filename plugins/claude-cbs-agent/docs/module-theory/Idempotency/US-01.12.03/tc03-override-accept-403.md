# TC-03: 403 на Execute Accept Override — нужна модель авторизации

- **Модуль:** Idempotency / Functional Duplicate Detection (US-01.12.03)
- **Тикет:** TB-2034 (ссылается на открытый вопрос TC-36 в TB-1860)
- **Тест:** `idempotency-smoke.spec.ts` — `allureCaseId(2726)`, "Duplicate found with OVERRIDE, then
  accepted -> record saved"
- **Статус:** **Закрыто окончательно (2026-08-28).** URL-баг был первой причиной; после его фикса
  TC-36/four-eyes-вопрос решён живой диагностикой — self-approval разрешён, никакой identity-based
  four-eyes проверки в коде нет вообще. См. "Финальный ответ" в конце файла.

## Контекст

Автоматизирую TC-03 (US-01.12.03, duplicate detection, enforcementAction=OVERRIDE). После 422 +
override-info на шаге INPUT, вызов `.../operations/INPUT/accept` должен вернуть 200, но стабильно
возвращает 403.

Тот же вопрос уже был поднят в TB-1860 (TC-36 "OVERRIDE self-approval vs. genuine four-eyes") и
явно оставлен нерешённым: *"Do not assert one outcome — record the actual result, escalate
whether this is genuine four-eyes (approver ≠ initiator) or a simple permission check."* Теперь
есть конкретное репро, поэтому вопрос поднимается снова, с фактами.

## Репро (шаги и данные)

1. Создана Table (classification: INT), Projection `<tableId>~FUNCDUP` со схемой ID + ACCOUNT_NUMBER.
2. Создан duplicate-config: `matchFields=[ACCOUNT_NUMBER]`, `enforcementAction=OVERRIDE`, `purgeDays=5`.
3. `POST /api/v1/projections/{projectionId}/records/operations/INPUT`, recordId=A, ACCOUNT_NUMBER=X
   → 200 (запись сохранена, зарегистрирован hash в `duplicate_registry`).
4. `POST` того же эндпоинта, recordId=B, тот же ACCOUNT_NUMBER=X (совпадающий hash)
   → 422, ожидается override info / InputSession — получаем корректно.
5. `POST /api/v1/projections/{projectionId}/operations/INPUT/accept`, body `{"recordId": "B"}`
   → ожидаем 200, получаем **403**.

Важно: шаги 3-5 выполняются **одним и тем же** аутентифицированным контекстом (один Keycloak-юзер,
один Bearer-токен, один `proj-user-context`). Это тот самый self-approval сценарий из TC-36: один и
тот же actor и инициирует override, и пытается его принять.

Окружение: `proj-user-context = MOCK_USER_CONTEXT` (мок-профиль из CI), `X-Company-Code = MOCK`,
дефолтный тестовый Keycloak-юзер (используется во всех тестах пакета, не специфичен для этого
кейса).

## Что уже проверили (можно не перепроверять)

- Путь и payload запроса accept совпадают с задокументированным в Bruno-коллекции контрактом
  (`Table Template/Operations/Execute Accept Override.yml`): `POST .../operations/:operation/accept`,
  body `{recordId}`. Ошибки клиента/пути нет.
- Тестовая таблица — INT, не FIN. Platform-wide four-eyes (maker-checker) в документации привязан
  только к FIN-таблицам и операции AUTH (`business-rules.md`), не к accept-override — то есть
  неясно, применяется ли тот же принцип "approver ≠ initiator" здесь.
- В SMS нашли поле `OVERRIDE_CLASSES` (`LINKED_TABLE` → `OVERRIDE.CLASS`) на `SM.USER.GROUP` — то
  есть Override-права в принципе выдаются на уровне группы через отдельную сущность Override Class,
  отдельно от обычных `PERMISSIONS[{TABLE, FUNCTION}]`. Но ни в одном существующем seed-скрипте
  (Bruno) `OVERRIDE_CLASSES` не заполняется — нет рабочего примера, как это выдаётся на практике.
- `access-control.md` отдельно фиксирует, что даже AUTH не подтверждён как отдельный grantable
  `FUNCTION` в текущих тестах — то есть модель прав для accept-override, скорее всего, вообще не
  задокументирована.

## Вопросы

1. Что на самом деле проверяет `/operations/:operation/accept` при 403 — genuine four-eyes
   (approver обязан отличаться от initiator, независимо от прав) или permission-check (не хватает
   конкретного права/класса у actor'а)? Нужен однозначный ответ, не предположение.

2. Если это four-eyes:
   - Применяется ли это только к FIN-таблицам (по аналогии с AUTH), или и к INT тоже? Наш
     тестовый кейс — INT-таблица, у которой в остальном нет шага AUTH/4-eyes вовсе.
   - Это будет постоянным поведением платформы (то есть TC-03 нужно переписывать на двух разных
     Keycloak-пользователей), или это баг/недоделка, которую планируется исправить?

3. Если это permission-check через `OVERRIDE_CLASSES` (или что-то ещё):
   - Какое конкретное значение/id Override Class ожидается для accept-override на обычной
     кастомной таблице (не системной)?
   - На каком уровне это должно быть привязано: к `SM.USER.GROUP` (через какое поле/структуру
     запроса — пример payload, пожалуйста), к конкретной Table/Projection, или глобально?
   - Есть ли готовый пример (Bruno-запрос, curl, seed-скрипт), где кому-либо реально выдавался
     Override Class для accept-override — на любой таблице, не обязательно нашей?
   - Нужно ли это делать через `SM.USER.GROUP~MAIN` INPUT (как в существующих seed-примерах для
     `PERMISSIONS`), и если да — какое имя/id таблицы `OVERRIDE.CLASS` и какие в ней поля?

4. Если можете посмотреть логи сервиса по этому запросу — что конкретно возвращается в теле
   403-ответа (у нас тело не залогировано в этом прогоне, можем приложить raw body отдельно после
   повторного прогона, если это удобнее)? Какой internal error code/reason там фигурирует?

5. TC-36 (TB-1860) ставит тот же вопрос на другой сущности (`PF.BUILDER`). Подтверждаете, что ответ
   на этот вопрос общий для всех Table/Projection (т.е. один и тот же accept-override эндпоинт с
   одной моделью авторизации), или поведение может отличаться по таблице/домену?

## Какие данные/ответы нужны в итоге

- Явный вердикт: four-eyes vs permission-check (или комбинация обоих).
- Если four-eyes — распространяется ли на INT-таблицы, и это intended-поведение или дефект.
- Если permission-check — конкретное имя/id Override Class, структура payload для его выдачи, и
  рабочий пример (curl/Bruno) хотя бы на одной таблице.
- Точный код/причина ошибки из тела 403-ответа или логов сервиса.

## Ответ разработчика

По п.5 репро — URL в Bruno-контракте (`Table Template/Operations/Execute Accept Override.yml`)
задокументирован неверно. Правильный запрос:

```
POST /api/v1/projections/{projectionId}/records/operations/INPUT/accept
```

(с сегментом `/records/`, как у обычного `Execute Records Operation`), а не
`.../operations/INPUT/accept`, как было в Bruno и в нашем клиенте.

### Что это меняет в исходном анализе

- Наблюдаемый 403 в этом конкретном репро объясняется вызовом **несуществующего** пути — запрос,
  скорее всего, не долетал до бизнес-логики Table Template вообще (согласуется с находкой, что
  тело 403-ответа было пустым — типичный паттерн coarse-grained deny на несуществующий route, а не
  прикладная ошибка с телом).
- Вопросы 1-3 и 5 (four-eyes vs permission-check через `OVERRIDE_CLASSES`, применимость к
  INT-таблицам) **пока не получили ответа** и остаются актуальными — этот 403 мог полностью
  маскировать любой из этих сценариев. Нужно повторить прогон с исправленным URL и посмотреть на
  реальный результат:
  - если теперь 200 — вопрос TC-36 для этого эндпоинта закрывается в пользу "не four-eyes,
    self-approval разрешён";
  - если снова 403 (уже с телом, не пустым) — тогда это репро наконец бьёт в настоящую
    авторизационную проверку, и вопросы 1-3 нужно адресовать снова, уже с точным телом ответа.

### Что сделано в автоматизации

- Исправлен `SYS_CORE_API_PATHS.PROJECTION.OPERATION_ACCEPT` в
  `api/system_core/sys-core-api-paths.ts` — добавлен сегмент `/records/`.
- Единственный потребитель константы (`TableRegistryApiClient.acceptOperationOverride`) правится
  автоматически, отдельно трогать не пришлось.
- Bruno-коллекция (`proj-bruno-api`, `Execute Accept Override.yml`) **не исправлена** — это отдельный
  репозиторий вне мандата этой роли; нужно поднять отдельно с владельцем коллекции.

---

## Финальный ответ (2026-08-28)

Перепрогон с исправленным URL: **200**, self-approval разрешён — по критерию, который сам этот файл
установил заранее ("если теперь 200 — вопрос TC-36 закрывается в пользу 'не four-eyes, self-approval
разрешён'"), вопрос закрыт.

Дополнительно подтверждено отдельной живой диагностикой (3 пробы: тот же актор / другой актор без
прав / maker-checker пара — см. [[tc07-override-accept-no-permission-200]] для полного протокола):
`/accept` вообще **не смотрит на идентичность** актора — ни self-approval, ни genuine four-eyes не
реализованы как концепция. Единственная реальная проверка — наличие у актора обычного права `INPUT`
на целевую таблицу (`403 "User does not have function: <table>.INPUT"` для актора без этого права,
`200` для любого актора с этим правом, включая инициатора). Вопросы 1-3/5 выше сняты этим фактом —
это не "four-eyes с недоделанной проверкой", а полное отсутствие identity-проверки, компенсируемое
только обычной permission-моделью.

Автоматизация: тест `allureCaseId(2726)` усилен 2026-08-28 — добавлена проверка тела 422-ответа
(`overrides` в `RecordInputResponse`), которую требует Allure-кейс, но которой раньше не было
(проверялся только статус-код). Кейс 2740 ("OVERRIDE approver vs initiator (4-eyes)") удалён из
Allure пользователем 2026-08-28 как нереализованная концепция — see
[[missing-allure-case-overriderequiredexception-not-cached]]-adjacent judgment, только в обратную
сторону: кейс существовал, но описывал то, чего в системе нет.
