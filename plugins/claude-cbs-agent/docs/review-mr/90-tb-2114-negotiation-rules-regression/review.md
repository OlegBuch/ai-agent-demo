# Review: MR !90 — TB-2114 Negotiation Rules and Tracking Engine - Regression

## Summary

This MR stands up a brand-new `api/negotiation_rules` module and adds its first regression suite:
`NegotiationRulesApiClient` (client), `negotiation-rules-api-paths.ts` (path registry),
`negotiation-rules.types.ts` (shared types), three helper files (`db-query-helper.ts`,
`preconditions.ts`, `product-setup-helper.ts`), and one 1760-line spec,
`pf-nrte-regression.spec.ts`, containing 24 `TC-*` regression cases across three
`test.describe` blocks — `US-04.02.01 | Comparison Rules Configuration`,
`US-04.02.02 | Condition-Level Negotiation Governance`, `US-04.02.03 | Contract-Product Linking
and Mass Maintenance` — which map 1:1 to the three child user-story pages under Confluence
`US-04.02 | Negotiation Rules and Tracking Engine` linked from Jira TB-2114. The cases cover
Comparison Rule creation/immutability validation (handler×data-type compatibility matrix,
missing-field errors), Account Condition field-level negotiation governance rules, and
cross-module product/tracker behavior (tracker record creation on cataloging, `CONTRACT_LINK_TYPE`
immutability, past/future condition resolution). TB-2114 itself is a thin ticket ("Link to TC: in
Allure TestOps") — the authoritative case definitions live in Allure, not in Jira/Confluence, so
this review evaluates the diff against this repo's own conventions rather than case-by-case Allure
fidelity.

The core problem with this MR: it adds a full helper layer that the spec then almost entirely
ignores, re-implementing the same functions locally instead of importing them — see Confirmed
Issue #1.

---

## Confirmed Issues

**[Blocking] Duplicate helpers & dead code (~330 lines)**
`pf-nrte-regression.spec.ts:15-127` re-declares `queryDbWithFallback`, `assertNotInDb`,
`assertInDb`, `assert400WithError`, and `setupProductForTrackerTest` — functions this same MR just
added to `helpers/db-query-helper.ts` and `helpers/product-setup-helper.ts`. Only
`ensureComparisonRule` is actually imported from the new `helpers/` folder; everything else
exported there (`isRelationNotFoundError`, `pollTrackerRecord`, `waitForCatalogRecord`,
`ensureAccountCondition`, `ensureProductClass`, `ensureProductType`,
`setupCatalogedProductWithConditions`, `insertAttribute`, `updateAccountConditionNegotiable`) is
unused dead code. Violates `coding-standards.md`'s module-boundary rule and doubles the
maintenance surface for a future contract change.
Fix: delete the local declarations in the spec and import from the helpers, then delete whatever
in `helpers/` remains unused afterward.

**[Confirmed] Stale `@regression` tag — these tests won't run in CI**
`pf-nrte-regression.spec.ts:131` tags the suite `@regression` instead of `@regression_m1`/
`@regression_m2`. Every sibling spec (`audit-fields-regression.spec.ts`,
`customization-regression.spec.ts`, `idempotency-regression.spec.ts`, etc.) and root
`README.md`'s tag table use the milestone-suffixed form; `package.json`'s
`test:api:regression-m1`/`-m2` scripts and CI's MR-title-based job selection both filter on the
suffixed tags specifically, so a bare `@regression` never gets picked up.
Fix: change the tag to `@regression_m2` (confirm milestone against a PF-adjacent sibling spec).

**[Confirmed] File-wide `eslint-disable playwright/expect-expect` hides a real safety net**
`pf-nrte-regression.spec.ts:1` disables `playwright/expect-expect` (`'error'` in
`eslint.config.mjs:43`) for the whole file, because most tests assert only via
`assertNotInDb`/`assertInDb`/`assert400WithError` rather than a direct `expect(...)` call — but the
disable removes the check for every test in this file, present and future, not just the ones that
need it.
Fix: remove the disable comment; configure
`assertFunctionNames: ['assertNotInDb', 'assertInDb', 'assert400WithError']` on the rule in
`eslint.config.mjs` instead.

**[Blocking] Non-WHY comment in new file**
`api/types/negotiation-rules.types.ts:1` has `/* Comparison Rules */` — a WHAT-labeling section
header, not a WHY-only sentence, which this framework's comment-hygiene rule treats as blocking
regardless of size.
Fix: delete the comment; the type name already conveys the same grouping.

**[Confirmed] Conditional DB assertions in TC-956/TC-957 can pass without checking anything**
`pf-nrte-regression.spec.ts:1513-1524` (TC-956) and the equivalent block around line 1698
(TC-957) wrap the `RESOLVED_CONDITIONS` content assertions in `if ((dbResult.rowCount ?? 0) > 0)`
— if the `pf_product` row simply isn't found, the assertions are skipped and the test passes
without ever checking the behavior it exists to verify.
Fix: assert `expect(rowCount).toBeGreaterThan(0)` unconditionally before reading the row, or wrap
the read in `expect.poll`/`.toPass(...)` like the `pf_catalog` check a few lines later in the same
tests already does.

---

## Possible Risks

**Endpoint/field names could not be verified against a source-of-truth API spec**
`negotiation-rules-api-paths.ts` and `negotiation-rules.types.ts` introduce new
`PF.COMPARISON.TYPE`/`PF.PRODUCT.ACCOUNT.CONDITION`/`PF.BUILDER`/`PF.MANAGER`/`PF.CATALOG` paths
and field names, but no Bruno collection exists in this repo checkout to cross-check them against,
and the case source-of-truth (Allure TestOps) isn't reachable from this review's tooling.
Fix: have a reviewer cross-check paths/field names against Allure/the API spec before merge.

**Precondition rows are seeded via raw SQL, bypassing the real create/validation path**
`preconditions.ts`'s `ensureLivRecord` and the inline `INSERT INTO pf_attribute.liv` blocks in the
spec write directly into `.liv` rather than going through the client's create/INPUT operations, so
these rows never pass through whatever validation-engine hooks fire on a real creation.
Fix: confirm none of the regression cases implicitly depend on a hook-populated field that only
the real API sets.

---

## Nice-to-Have Improvements

**Helper files duplicate each other's create→validate→catalog pipeline**
`setupCatalogedProductWithConditions` (`preconditions.ts:331-397`) and
`setupProductForTrackerTest` (`product-setup-helper.ts:424-471`) both implement
create-condition(s)→create-product→VALIDATE→CATALOG with only the condition count/contract-link
type varying.
Fix: parameterize one helper (condition count, contract link type) once Confirmed Issue #1 is
fixed.

**`manageProduct`'s payload type is effectively unconstrained**
`negotiation-rules-api-client.ts:66-69` types `data` as `ManagerActionPayload | Record<string,
unknown>` — the `Record<string, unknown>` half defeats the point of the typed half, since every
current call site already fits `ManagerActionPayload`.
Fix: drop the `Record<string, unknown>` union member and type `data` as `ManagerActionPayload`
directly.

**Shared static fixture IDs read across many tests with no explicit serial-mode setting**
`pf-nrte-regression.spec.ts:133-134` creates `CMP_MIN_001`/`CMP_MAX_001` once in `beforeAll`, read
by tests across all three `describe` blocks; none currently mutate them, but nothing pins this
assumption down as the suite grows.
Fix: add `test.describe.configure({ mode: 'serial' })` if any future case starts mutating these
shared IDs, per `testing-standards.md`'s guidance for suites sharing state.

---

## Ready-to-paste GitLab comment

```
Пункт 1
[Blocking] Duplicate helpers & dead code (~330 lines)
`api/negotiation_rules/tests/pf-nrte-regression.spec.ts:15-127` — вручную продублированы функции (queryDbWithFallback, assertNotInDb, assertInDb, assert400WithError, setupProductForTrackerTest), которые в этом же MR уже добавлены в helpers/. Это нарушает coding-standards.md и оставляет большую часть новых helper-файлов неиспользуемой.
Как исправить: удалить локальные объявления в spec-файле и импортировать их из helpers/, затем удалить то, что в helpers/ останется неиспользуемым.

Пункт 2
[Confirmed] Устаревший тег @regression — тесты не попадут в CI
`api/negotiation_rules/tests/pf-nrte-regression.spec.ts:131` — используется тег @regression вместо @regression_m1/@regression_m2. Ни один из npm-скриптов (test:api:regression-m1/-m2) и CI-джоб не подхватит эти 24 теста.
Как исправить: заменить тег на @regression_m2 (сверить milestone с соседними PF-спеками).

Пункт 3
[Confirmed] Блочный eslint-disable playwright/expect-expect
`api/negotiation_rules/tests/pf-nrte-regression.spec.ts:1` — отключает проверку "тест содержит assertion" для всего файла, потому что assertion спрятаны в кастомных хелперах, а не в прямом expect().
Как исправить: убрать disable-комментарий и добавить assertFunctionNames: ['assertNotInDb', 'assertInDb', 'assert400WithError'] в правило в eslint.config.mjs.

Пункт 4
[Blocking] Комментарий-not-WHY в новом файле
`api/types/negotiation-rules.types.ts:1` — комментарий /* Comparison Rules */ описывает ЧТО, а не WHY, что запрещено конвенцией проекта по комментариям.
Как исправить: удалить комментарий.

Пункт 5
[Confirmed] Условные DB-assertions в TC-956/TC-957 могут пройти без проверки
`api/negotiation_rules/tests/pf-nrte-regression.spec.ts:1513-1524` и аналогичный блок в TC-957 (~1698) — assertion на RESOLVED_CONDITIONS выполняется только внутри if (rowCount > 0), иначе тест молча проходит без проверки.
Как исправить: добавить безусловный expect(rowCount).toBeGreaterThan(0) перед чтением строки, либо обернуть в expect.poll/.toPass(...) как это уже сделано для pf_catalog чуть ниже.

Пункт 6
[Possible Risk] Не удалось сверить новые endpoint/поля с источником правды
`api/negotiation_rules/negotiation-rules-api-paths.ts` и `api/types/negotiation-rules.types.ts` — новые пути и поля не с чем свериться (Bruno-коллекции в репозитории нет, Allure TestOps недоступен из этого ревью).
Как исправить: сверить пути и имена полей с Allure/API-спекой вручную перед мерджем.
```

---

## Changelog

- Reformatted all findings into the ultra-short header+paragraph+Fix shape and simplified the
  ready-to-paste block to a single `Как исправить:` line per point (dropped the 3-option
  `Варианты решения:` menu), per updated `aqa-review-pr` output convention. No findings were added,
  removed, or changed in substance — only presentation.
