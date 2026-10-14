markdown_content = """# Анализ видео: Daemon Currency Sync

**Файл:** `Daemon Currency Sync - 2026_08_19 10_59 CEST - Recording.mp4`

Этот документ представляет собой технический синк (созвон) команды разработки, на котором ведущий разработчик (Артур Фоничкин) объясняет коллегам (Вадиму Удальцову и QA-инженеру Виктории Бурак) архитектуру, флоу работы и бизнес-логику микросервиса (или модуля) для работы с валютными ордерами (`Currency Engine`) и транзитными валютами.

---

## 📝 Полный текстовый анализ видео (что обсуждалось)

### 00:00 – 06:20: Обзор архитектуры и флоу работы (схема на app.diagrams.net)
Артур объясняет общую схему обработки запросов на курсы валют.
*   **Currency ORDER**: Сущность, в которую поступают запросы (`request`) на получение курсов валют.
*   **Два пути создания ордера (Batch и Master)**: 
    *   *Batch (Пакетный)*: Записи создаются автоматическими системами. Они не требуют ручной авторизации и сразу попадают в «боевую» схему базы данных (`LIV` / `Live`).
    *   *Master (Ручной)*: Ордер создается вручную (через UI). Сначала он попадает в схему `NOW` (черновик) и требует авторизации пользователем с соответствующими правами. Только после аппрува запись переходит в `LIV`.
*   **Kafka и Schedule Task**: Как только запись авторизована и попадает в `LIV`, генерируется событие в Kafka. На основе этого события создается отложенная задача (`schedule_task`), например, на 15:00 UTC.
*   **Плагин (Plugin)**: В назначенное время (15:00) срабатывает джоба. Плагин идет в таблицу `Currency ORDER`, забирает все записи со статусом `NEW` (новые) на это время и запрашивает актуальные курсы. После успешного получения курсов статус ордера меняется на `PROCESSED` (обработан), а сами курсы сохраняются в таблицу `Currency RATES` (курсы валют). Записи со статусами `ERROR` или `CANCELLED` плагин игнорирует.

### 06:20 – 16:00: Практическая демонстрация (Live Demo через Bruno и БД)
*   Артур показывает структуру базы данных в IntelliJ IDEA (таблицы `currency_order`, `schedule_task`, `currency_rates_mock`).
*   Он использует API-клиент **Bruno** для отправки POST-запросов (создание тестовых ордеров на валютные пары, например, USD/EUR).
*   **Демонстрация проблемы без авторизации**: Артур отправляет Master-запрос. В таблице `schedule_task` задача появляется, но не выполняется (остается `null`), так как ордер находится в неавторизованной схеме (`NOW`).
*   **Успешный кейс**: Артур переключает запрос на проекцию Batch (сразу в `LIV`), отправляет запрос. Отложенная задача создается, срабатывает в нужное время, статус ордера меняется на `PROCESSED`, а в моковой таблице `currency_rates_mock` для конкретной компании (Company Mock) появляются сгенерированные курсы валют.

### 16:00 – 20:00: Бизнес-цели и ответы на вопросы Вадима
*   Вадим спрашивает, в чем смысл разделения на Master и Batch с точки зрения бизнеса.
*   Артур поясняет, что Batch нужен для интеграции с другими микросервисами, которые запрашивают курсы в фоновом режиме. Master нужен для того, чтобы ответственный сотрудник компании мог зайти, создать заявку руками, а другой сотрудник с правами (чекер) — проверить её и нажать "Authorize".

### 20:00 – 31:07: Кросс-курсы и транзитные валюты (Triangulation / Transit Currency)
*   Артур переходит к коду Spring Boot приложения (`CurrencyRateCalculationService`, `CompanyService`).
*   Обсуждается логика **Triangulation (Триангуляции)** — поиска кросс-курсов.
*   *Пример*: Нужно перевести белорусские рубли (BYN) в российские (RUB). Прямого курса в системе нет. 
*   Система смотрит настройки компании в таблице `Company`. Там есть поля:
    *   `MANDATORY_TRIANGULATION` (boolean) — обязательна ли транзитная валюта.
    *   `TRIANGULATION_CURRENCY` (string) — какая валюта используется как транзитная (например, USD или EUR).
*   Если прямого курса нет, система сначала конвертирует базовую валюту (BYN) в транзитную (USD), а затем транзитную (USD) в целевую (RUB), вычисляя итоговый рейт.
*   Если у компании не задана транзитная валюта (поле пустое), система должна падать с ошибкой, либо использовать глобальную системную транзитную валюту (System Parameter: `DEFAULT_GLOBAL_CURRENCY`), если это разрешено настройками.
*   Заканчивается созвон обсуждением задач для QA (Виктории): ей необходимо написать тест-кейсы на проверку прямой конвертации, конвертации через транзитную валюту, обработку ошибок при отсутствии курсов и проверку статусов. Артур прощается, так как ему нужно бежать на следующий митинг.

---

## 🤖 Детальное Summary для агента Claude (Prompt Context)

Вы можете скопировать следующий блок текста и передать его Claude. Он структурирован так, чтобы LLM мгновенно поняла архитектуру, терминологию и бизнес-правила системы для дальнейшего написания кода, тестов или документации.

```text
System Overview:
You are acting as a Senior Backend Developer / QA Automation Engineer working on a "Currency Engine" microservice (built with Java, Spring Boot, Kafka, and an SQL database). The system manages currency exchange rate requests, schedules them, fetches rates, and calculates cross-rates using triangulation.

Core Entities & Database Tables:
1. currency_order: Stores requests for currency exchange rates.
   - Key fields: amount, baseCurrency, quoteCurrency, rateDate, status.
   - Statuses: NEW (pending), PROCESSED (successfully fetched), ERROR (failed), CANCELLED (aborted).
2. schedule_task: Stores background jobs. Triggered by Kafka events. Uses UTC time.
3. currency_rates (and currency_rates_mock): Stores the actual fetched or calculated exchange rates associated with a specific company.
4. company: Contains company-specific configurations.
   - MANDATORY_TRIANGULATION (boolean): Flag dictating if cross-rates must strictly use a transit currency.
   - TRIANGULATION_CURRENCY (string): The ISO code of the transit currency (e.g., "USD", "EUR").

Architectural Flows:
* Batch Flow (Automated): Request -> Saved to LIV (Live) schema -> Kafka Event -> schedule_task created -> At scheduled time, a Plugin fetches records with status NEW -> Fetches rates -> Saves to currency_rates -> Updates order status to PROCESSED.
* Master Flow (Manual/UI): Request -> Saved to NOW (Draft) schema -> Requires manual Authorize action by a user with permissions -> Moved to LIV schema -> Follows the rest of the Batch flow. If not authorized, the scheduled task will yield null and do nothing.

Business Logic: Triangulation (Transit Currency Calculation):
* Used when a direct exchange rate between baseCurrency and quoteCurrency (e.g., BYN to RUB) does not exist.
* Rule 1: The system checks the company settings for TRIANGULATION_CURRENCY (e.g., USD).
* Rule 2: The system calculates: (Rate: BYN -> USD) * (Rate: USD -> RUB) = Target Rate.
* Rule 3: If the required transit currency rate is missing, or if the company has MANDATORY_TRIANGULATION = true but no transit currency is specified, an error must be thrown (Rate Not Found / missing transit currency).
* Rule 4: As a fallback (if no company transit currency is specified and it's not strictly mandatory), the system might fall back to a global System Parameter for default local/global currency.

Goal for Claude:
Using this context, be prepared to write Java Spring Boot code (Controllers, Services), Kafka consumers/producers, database migration scripts, or detailed QA Test Cases (covering authorization flows, cron-job scheduling, and complex triangulation math logic).