# Final Analysis — MR !87 (TB-1973: Playwright with Allure TestOps)

## Summary

TB-1973 ("[Automation Framework] Integrate Playwright with Allure TestOps") asks to deactivate the
existing Report Portal integration, wire Allure TestOps in its place (adapter, result generation,
CI upload, environment/launch/build metadata, and test-case linking), and document the new
process. The diff does exactly this: `.env.example`/`.gitlab-ci.yml`/`README.md` swap every
`REPORTPORTAL_*` reference for `ALLURE_*`; `README_RP.md` and `api/utils/rp-reporter-guard.ts` are
deleted along with the RP probing logic in `global-setup.ts`; `playwright.config.ts` and
`package.json`/`package-lock.json` swap the RP reporter/dependency for `allure-playwright`,
`allure-js-commons`, `allure-commandline`; a new `.allure_report_and_upload` CI template generates
the HTML report on every run and uploads to TestOps only on a manually-triggered `main` run
(explicitly flagged `TEMPORARY`, with an exit criterion documented in README); and a new
title-based linking mechanism (`test-data/allure-testcase-map.json` + a `beforeEach` hook in
`api/utils/api-fixtures.ts` + a new guard script `scripts/verify-allure-testcase-map.ts`, wired
into both `.husky/pre-commit` and CI) attaches an `ALLURE_ID` label to 304 of the suite's 504
tests. The one test-file change (`api/system_core/tests/audit-fields-regression.spec.ts:619`) is a
mojibake fix to a test title, made necessary because the new linking mechanism matches on the exact
title string. This is pure test-infrastructure/tooling work — no new CBS test cases, no
Bruno-relevant endpoint/client/type additions.

## Confirmed Issues

**[Confirmed - Blocking] Comment hygiene: multiple multi-line and WHAT-restatement comments added
by the diff.** Per the mandatory rule (a comment is acceptable only as a single short WHY-only
sentence — never multi-line, never a WHAT-restatement), the diff introduces several violating
comments:
- `scripts/verify-allure-testcase-map.ts:1-13` — an 11-line JSDoc header restating what the whole
  script does plus a usage line, instead of a single WHY sentence.
- `api/utils/api-fixtures.ts:63` — restates WHAT the following `beforeEach` does rather than a
  hidden WHY.
- `.gitlab-ci.yml:85-86`, `:159-160`, `:167-170`, `:173-174`, `:184-185` — five multi-line comment
  blocks.

Fix: collapse each to a single short WHY-only sentence; move duplicated rationale already covered
by README's "Allure TestOps upload — operational notes" section out of the inline
`.gitlab-ci.yml` comments.

**[Confirmed] Undocumented new env var `ENV_TARGET` referenced in `playwright.config.ts`.** The new
`environmentInfo` object sets `environment: process.env.ENV_TARGET ?? process.env.BASE_URL ??
'local'`, but `ENV_TARGET` is not declared or described anywhere in `.env.example`, README's
environment-variable table, or `.gitlab-ci.yml` — all fully rewritten in this MR to cover every
other new `ALLURE_*` var. As written, this fallback is currently dead code in every documented
environment.

Fix: either add `ENV_TARGET` to `.env.example` and README's variable table with a description of
when it should be set, or drop the fallback and read `BASE_URL` directly.

## Possible Risks

**[Possible Risk] Three duplicate-value collisions in `test-data/allure-testcase-map.json`.** Direct
inspection of the new map's 304 entries found three pairs of different test titles resolving to the
same Allure TestOps case id: `"TC-1: [AUTH] Four-Eyes Principle — Same User INPUT + AUTH
Rejection"` and `"TC-32: ..."` both → `114`; `"TC-3: [HOLD] INPUTTER Array Does Not Grow on
Repeated HOLD"` and `"TC-20: ..."` both → `102`; `"TC-053: HOLD operation successfully overwrites
an existing HOLD draft in NAU space"` and `"TC-073: HOLD operation overwrites an existing HOLD
draft in NAU space"` both → `58`. Neither the new guard script (which only flags orphaned *keys*)
nor README's documented unlinked-test breakdown accounts for this failure mode, so two functionally
distinct tests will silently report into the same TestOps case's execution history.

Fix: extend `scripts/verify-allure-testcase-map.ts` to also fail on duplicate values (unless
explicitly allow-listed), and manually confirm in TestOps whether these three pairs are a
deliberate one-case/two-tests design or map-building mistakes.

**[Possible Risk] `verify-allure-testcase-map.ts`'s title regex silently drops template-literal
titles.** `TITLE_RE` only matches single/double-quoted `test(...)` calls; a title written as a
template literal would never be added to the collected-titles set, so any map entry for such a test
would be misreported as orphaned, with no indication of why. No such titles exist in the current
suite, but nothing prevents one being added later.

Fix: widen the quote-character class to include backticks, or explicitly forbid template-literal
test titles via lint rule.

**[Possible Risk] TB-1973's "correctly linked" AC is ~60% satisfied with no tracked follow-up.**
The ticket's scope states "Ensure test cases are correctly linked between automation and Allure
TestOps," but README's own new "Linking automated tests" section reports only 304 of 504 tests
linked, with 200 unlinked across three documented categories — and no linked sub-task or comment
tracks closure of that gap.

Fix: file a follow-up ticket so the remaining 200 tests don't fall off the radar once this MR
merges.

## Nice-to-Have Improvements

**[Nice-to-Have] npm script naming order inconsistency.** `package.json:28` adds
`"verify:allure-map"`, ordered `<verb>:<domain>`, inverting the `<domain>:<verb>` pattern used by
the sibling custom scripts beside it (`db:cleanup`, `group:cleanup`, `kafka:delete-topic`).
Fix: rename to `allure:verify-map` (update `.gitlab-ci.yml:104` and `.husky/pre-commit:6`
accordingly).

**[Nice-to-Have] Divider-comment width inconsistency introduced by the diff.** `.gitlab-ci.yml:297`
and `:299` widened one `# ===...===` banner from 79 to 80 `=` characters, while the file's two
other identical banners remain at 79.
Fix: revert to the original 79-character width.

**[Nice-to-Have] Inline ad-hoc type instead of a named type.** `api/utils/api-fixtures.ts:10`
declares `const ALLURE_TESTCASE_MAP: Record<string, number> = allureTestCaseMap;` inline rather
than via a named type alias.
Fix: optionally add `type AllureTestCaseMap = Record<string, number>;` if this pattern is reused
elsewhere later.

**[Nice-to-Have] `test-data/allure-testcase-map.json` sits outside the folder's documented
purpose.** `docs/frame-specs/architecture.md` describes `test-data/` as holding payload-builder
factory functions; the new file is static reporting/lookup metadata.
Fix: consider relocating it next to its sole consumer (`api/utils/api-fixtures.ts`) or into a
`config/`-style folder.

**[Nice-to-Have] `.husky/pre-commit`'s new check re-scans every `*.spec.ts` file on every commit**,
even commits touching neither a spec file nor the map itself.
Fix: gate the check on staged files including a `*.spec.ts` file or
`test-data/allure-testcase-map.json` (e.g. via `lint-staged`).

**[Nice-to-Have] `scripts/verify-allure-testcase-map.ts` diverges from sibling scripts'
entry-point convention.** `scripts/cleanup-group.ts`/`cleanup-test-schemas.ts` wrap
`main().catch((err) => { console.error('Fatal error:', err); process.exit(1); })`; the new script
calls bare `main();`.
Fix: wrap it the same way for consistency, even though it's currently a no-op behavior change.

## Change Justification Debate

1. **`ALLURE_*` env vars** (`.env.example`, `.gitlab-ci.yml`, `README.md`) — no challenge raised:
   this is a direct 1:1 implementation of TB-1973's own stated ask, and no existing mechanism in
   the codebase already provides Allure TestOps configuration to make this redundant.

2. **New dependencies `allure-commandline`/`allure-js-commons`/`allure-playwright`** — no challenge
   raised: no prior Allure integration exists in the codebase to reuse, and the ticket explicitly
   names this adapter.

3. **Removal of the ReportPortal integration** (`README_RP.md`, `rp-reporter-guard.ts`,
   `REPORTPORTAL_*`, RP probe in `global-setup.ts`) — no challenge raised: TB-1973 explicitly says
   "deactivate," and full removal (not a feature-flagged keep-both) is what was literally asked for.

4. **New `.allure_report_and_upload` CI template with a manual-trigger-only upload gate on `main`**
   — challenge raised: the ticket's own text only supports "automated upload," not a
   manually-triggered one; the narrower scope's only cited justification is an inline
   `TEMPORARY (lead request...)` code comment, not a Jira/Confluence record.
   Rebuttal: this MR already establishes README's "operational notes" section as this project's
   accepted record for CI/operational exceptions — the same section that fully documents the
   `ALLURE_PROJECT_ID` override — and the manual-trigger gate is documented there too, complete
   with a stated exit criterion for when it becomes automatic.
   **Resolution: Justified.** The decision follows an established, consistently-applied
   documentation pattern within this same diff, not an untracked ad hoc exception.

5. **JRE install step** in `.default_job`'s `before_script` — no challenge raised: `npx allure
   generate` genuinely requires a JVM the Playwright base image lacks; this is a self-evident
   external technical constraint, not an in-repo redundancy question.

6. **`api-fixtures.ts`'s `beforeEach` hook + `ALLURE_TESTCASE_MAP` title-based linking** — challenge
   raised: `allure-js-commons`/`allure-playwright` (added in this same diff) already expose an
   inline `allure.id(...)` call that could annotate each test directly, without a fragile
   external title-matching map (the very fragility flagged above as two Possible Risks).
   Rebuttal: inline `allure.id()` calls would require touching all 504 existing spec files — an
   enormous, invasive diff — versus the chosen approach, which links the entire existing suite by
   editing exactly one shared fixture file plus one data file, consistent with
   `architecture.md`'s documented fixture-hook pattern.
   **Resolution: Justified** on necessity/proportionality grounds — the smaller-footprint approach
   is the correct call for retrofitting 504 existing tests. The title-matching approach's fragility
   is real but is an implementation-quality concern, already carried as the two Possible Risks
   above, not a reason the decision itself was unnecessary.

7. **New `scripts/verify-allure-testcase-map.ts` guard + npm script + husky wiring** — no challenge
   raised: no existing generic drift-check mechanism exists in the repo, and a guard is arguably
   more necessary, not less, given the fragility conceded in item 6.

8. **New `test-data/allure-testcase-map.json`** — no challenge raised: this data file is required
   by the linking mechanism justified in item 6; its folder placement is separately tracked as a
   Nice-to-Have above.

9. **`ALLURE_PROJECT_ID` project-level override** — no challenge raised: already fully and
   explicitly cited in README's operational notes (group-level CI variable precedence explained),
   a clean citation with nothing to contest.

10. **`ENV_TARGET` fallback in `playwright.config.ts`** — challenge raised: no citation exists
    anywhere for this variable. No rebuttal was offered.
    **Resolution: Not Justified** — concurs with, and is not separately promoted beyond, the
    Confirmed Issue already carried above for the same defect.

## Ready-to-paste GitLab comment

```
Пункт 1
[Confirmed - Blocking] Комментарии, добавленные в диффе, нарушают правило "одно WHY-предложение, без пересказа WHAT"
`scripts/verify-allure-testcase-map.ts:1-13`, `api/utils/api-fixtures.ts:63`, `.gitlab-ci.yml:85-86,159-160,167-170,173-174,184-185` — добавлены многострочные комментарии и комментарии, пересказывающие WHAT вместо WHY.
Как исправить: свести каждый комментарий к одному короткому WHY-предложению, убрав пересказ WHAT и перенеся длинные пояснения в README.

Пункт 2
[Confirmed] Недокументированная переменная окружения ENV_TARGET в playwright.config.ts
`playwright.config.ts`, `environmentInfo` — `process.env.ENV_TARGET ?? process.env.BASE_URL ?? 'local'` использует переменную, не описанную ни в .env.example, ни в README, ни в .gitlab-ci.yml, из-за чего фолбэк сейчас мёртвый код во всех задокументированных окружениях.
Как исправить: задокументировать ENV_TARGET в .env.example и README либо убрать фолбэк и читать BASE_URL напрямую.

Пункт 3
[Possible Risk] Дублирующиеся значения ID в test-data/allure-testcase-map.json
`test-data/allure-testcase-map.json` — три пары разных заголовков тестов ссылаются на один и тот же Allure TestOps case id (114, 102, 58), а verify-allure-testcase-map.ts не проверяет дубликаты значений, только orphaned-ключи.
Как исправить: расширить verify-allure-testcase-map.ts проверкой на дублирующиеся значения и вручную сверить с TestOps, дизайн это или ошибка маппинга.

Пункт 4
[Possible Risk] Регулярное выражение в verify-allure-testcase-map.ts не ловит заголовки-template-literal
`scripts/verify-allure-testcase-map.ts`, `TITLE_RE` — регулярка ищет только заголовки в одинарных/двойных кавычках; тест с заголовком через template literal будет ложно считаться orphaned без объяснения причины.
Как исправить: расширить класс кавычек в регулярном выражении на backtick либо запретить template literals в заголовках тестов линтером.

Пункт 5
[Possible Risk] AC тикета "correctly linked" выполнен лишь на ~60%, без отслеживаемого follow-up
README, раздел "Linking automated tests" — из 504 тестов привязано только 304, оставшиеся 200 не имеют связанного тикета для отслеживания закрытия.
Как исправить: завести follow-up тикет на оставшиеся 200 тестов, чтобы не потерять этот объём после мержа.

Пункт 6
[Nice-to-Have] Порядок именования npm-скрипта verify:allure-map не соответствует соседям
`package.json:28` — стоит как verb:domain, тогда как соседние db:cleanup, group:cleanup, kafka:delete-topic используют domain:verb.
Как исправить: переименовать в allure:verify-map (и поправить .gitlab-ci.yml:104 и .husky/pre-commit:6).

Пункт 7
[Nice-to-Have] Несогласованная ширина комментария-разделителя в .gitlab-ci.yml
`.gitlab-ci.yml:297,299` — ширина баннера "===" увеличена с 79 до 80 символов, два других баннера в файле остались на 79.
Как исправить: вернуть баннер к 79 символам.

Пункт 8
[Nice-to-Have] Инлайновый тип вместо именованного алиаса
`api/utils/api-fixtures.ts:10` — `Record<string, number>` задан инлайново вместо именованного типа.
Как исправить: при повторном использовании этой формы вынести `type AllureTestCaseMap = Record<string, number>`.

Пункт 9
[Nice-to-Have] Расположение test-data/allure-testcase-map.json не соответствует назначению папки
`test-data/allure-testcase-map.json` — architecture.md описывает test-data/ как папку для payload-билдеров, а не статических данных отчётности.
Как исправить: перенести файл рядом с единственным потребителем (api/utils/api-fixtures.ts) или в отдельную config/-папку.

Пункт 10
[Nice-to-Have] Безусловное сканирование всего репозитория в pre-commit хуке
`.husky/pre-commit` — verify:allure-map запускается на каждый коммит, даже если он не трогает *.spec.ts или сам маппинг-файл.
Как исправить: ограничить проверку через lint-staged, запуская её только при изменении *.spec.ts или test-data/allure-testcase-map.json.

Пункт 11
[Nice-to-Have] Новый скрипт не следует конвенции точки входа соседних скриптов
`scripts/verify-allure-testcase-map.ts` — вызывает `main();` напрямую, тогда как cleanup-group.ts и cleanup-test-schemas.ts оборачивают вызов в `.catch(...)` с process.exit(1).
Как исправить: обернуть вызов main() так же, как в соседних скриптах, для единообразия.
```
