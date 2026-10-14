# TB-2225/2034 Table-Group Self-Heal Architecture — Orchestrator Review (Full Report)

**Date/time:** 2026-07-24 14:36 · **Branch:** group-3/TB-2225-FixTableHelper · **Ticket(s):** TB-2225 (references TB-2034's prior self-heal work)

This file holds the complete Round 4 ("Final Decision") report from the 4-round adversarial
orchestrator review (`architect`, `aqa-lead`, `manual-qa`, `ai-architect`) run this session via
the `Workflow` tool (run id `wf_1dfb3805-1f6`, 20 agents, all completed) on whether the
group-reuse/self-heal architecture in `proj-test-automation` is fundamentally sound, given the
user's complaint that test runs remain slow and often fail even after four bugs were found and
fixed in the same session (see the companion summary,
`2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md`, for the narrative of those fixes). This
file exists specifically so the full architectural verdict isn't lost inside that narrative log —
kept verbatim so it can be reopened later without re-deriving it.

Full agent transcript: `.../subagents/workflows/wf_1dfb3805-1f6/journal.jsonl` (one Round-1
independent proposal + up to 3 Round-2 peer reviews + one Round-3 final proposal per persona,
except `ai-architect` which was scoped to the framework/process angle only, not the CBS
architecture itself).

---

## Executive Summary

Architect, AQA Lead и Manual QA независимо (Round 1) и после трёх раундов adversarial-проверки
(Round 3) пришли к одному и тому же вердикту: текущая архитектура (одна переиспользуемая группа +
self-heal через форсированные полные рестарты подов, с возможным каскадом во второй рестарт)
структурно не может быть быстрой и надёжной — сегодняшние 4 фикса корректны, но чинят
recovery-механизм, а не убирают его причину. Ни один рецензент не выдвинул альтернативного
вердикта. AI Architect не голосовал по архитектуре (это вне его мандата), но нашёл отдельный, тоже
подтверждённый факт: этот же класс проблем (баги без live-проверки, без явного вердикта о
пригодности) уже повторяется второй раз подряд на этой же подсистеме.

## Consensus

- `NATURAL_TABLE_PROPAGATION_WAIT_MS = 150_000` (`table-registry-helper.ts:104`) — безусловное
  ожидание, не внутри catch/retry; при промахе — полный cold-start пода
  `COLD_START_WAIT_MS = 450_000` (`global-setup.ts:35`); может каскадировать во **второй**
  cold-start через `healGroupIfDead`. Ради этого пришлось поднять таймаут теста до 900с
  (`playwright.config.ts:99`) — сами авторы дизайна признали через этот таймаут, что "медленный
  happy path" задуман, а не побочный эффект.
- `workers: 1` (`playwright.config.ts:94`) сериализует весь набор на одну shared mutable группу
  без owner/lease-модели — гонки между параллельными разработчиками локально архитектурно
  возможны и это не лечится внутрипроцессным self-heal.
- **Новая находка Manual QA, принятая всеми**: `createTablesAndWait` (batch-путь,
  `table-registry-helper.ts:488-641`) используется только в 3 из 14 спек-файлов и **не содержит
  `healGroupIfDead` вообще** — flat throw после 300с. Ни один из сегодняшних 4 фиксов туда не
  попадает: для этих файлов "often fails" не тронут никак.
- Self-heal машина (6 веток: warm reuse / cold-restart reuse / self-heal / >10-table replacement /
  natural-propagation escalation / lock contention) **не имеет собственных тестов** — найдена и
  исправлена 4 раза только через production-breakage, а не тестом, который её реально проверяет.
- Сегодня нет сигнала "self-heal race" vs "реальная регрессия продукта" — оба дают идентичный
  красный Playwright-результат.
- Все три роли согласны: **нельзя презентовать пользователю сегодняшние 4 фикса как решение
  "медленно/часто падает"**.

## Remaining Disagreements

- **Нужно ли live-измерение перед вердиктом?** Architect: нет — вердикт держится на арифметике уже
  смерженных констант; измерение нужно только чтобы оценить масштаб (частоту эскалаций), не чтобы
  принять решение. Manual QA расходится с этим.
- **150с — это баг теста или недокументированный NFR бэкенда?** Manual QA поставила вопрос,
  Architect признал его "самой острой находкой раунда" — это меняет формулировку фикса №1 (просить
  бэкенд ускорить реконсилиатор vs. явно тестировать существующий продуктовый лимит).
- **"Лишние" 30с (`additionalWaitMs`, `table-registry-helper.ts:~484`)** — изначально названы
  "чистой тратой", после ревью смягчено до "непроверенный вопрос" (может быть margin под
  Kafka/projection settling).
- **AI Architect** предлагает не техническое решение, а процессный гейт: любое изменение,
  попадающее под "Shared-Infra Trigger" (global setup/teardown, мутация Table Registry
  группы/пода, `base-api-client.ts`/client-файлы, изменение значения shared timeout/retry-
  константы), должно проходить обязательный `/team:orchestrator` design-pass с записанным
  вердиктом о пригодности, зафиксированной SLO-целью и live-данными — иначе снова "зелёно в
  tsc/eslint" будет выдаваться за "готово", как случилось и сегодня.

## Final Recommendation

**Делать сейчас, без согласований (в зоне AQA):**
1. В `global-setup.ts` поменять порядок: сначала pod-warm probe, потом `refreshGroupEnv` — убирает
   самопричинённый рестарт на обычном пути.
2. Подтвердить/удалить безусловные 30с (`~484`) — с бэкендом, не вслепую.
3. Проверить, нужен ли `waitForTableApiReady` на каждом call site, или части тестов достаточно
   готовности схемы в БД.
4. Написать тесты на саму self-heal машину (6 веток).
5. Добавить счётчики hit-rate (fast-path/escalation/heal/replacement) — превратить догадки в
   измеримые факты.
6. Перенести self-heal-логику в `createTablesAndWait` (сейчас отсутствует для 3 файлов).
7. Добавить в вывод теста явный признак "infra self-heal" vs "реальный дефект".
8. Задокументировать ≤10 таблиц/группу и `{retries:1}`-правило в `docs/frame-specs/` — оба факта
   уже терялись дважды.
9. Ввести Shared-Infra Trigger гейт в `rules/definition-of-done.md` (предложение AI Architect) — с
   обязательным live-прогоном и письменным вердиктом о пригодности.

**Требует согласования (Architect + AQA Lead + бэкенд/DevOps):**
10. Ответ BA/Architect: 150с — принятый NFR или артефакт теста?
11. Эскалация триггера реконсилиатора бэкенду как меню из 3 вариантов (DB-watch / gated rescan
    hook / короче poll interval) — самый высокорычажный фикс.
12. Live-baseline прогон (с сегодняшними 4 фиксами) — для оценки масштаба, не для самого решения.
13. Не коммититься на per-worker/pre-warmed pool групп до capacity-исследования DevOps.
14. Численный SLO на wall-clock и частоту self-heal — решение BA/Architect.

## Risks

Если продолжать только патчить: уже 6 разных failure mode найдено за 2 тикета и 4 сессии на этом
же субстрате — ожидаем 5-й/6-й баг того же класса. Заявить пользователю, что "медленно/часто
падает" решено сегодняшними фиксами — фактически неверное утверждение по мнению всех трёх ролей.

## Open Questions

Является ли 150с продуктовым NFR; нужны ли реально 30с ожидания; выдержит ли K8s-кластер N
параллельных групп; конкретное значение SLO; повторяется ли тот же незафорсированный гейт в
`aqa-automate.md`/`aqa-update-test.md` (не проверено в этом раунде).

## References

None (no Jira/Allure/Confluence fetched via MCP for this review — grounded entirely in direct
code reading by each persona against the actual `proj-test-automation` repo).
