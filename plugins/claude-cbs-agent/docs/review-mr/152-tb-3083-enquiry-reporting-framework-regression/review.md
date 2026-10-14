# Review: MR !152 — TB-3083 Test implementation: Enquiry & Reporting Framework - Regression

## Summary

TB-3083 asks for automated regression coverage of the Enquiry & Reporting Framework "according
approved TC," building on the smoke suite delivered earlier for the same module (TB-2220/MR!121).
This MR adds one new file, `api/system_core/tests/enquiry-regression.spec.ts` (8,024 lines, 82
`TC-*` cases across 7 nested `US-01.07.0x` Story `describe` blocks, all correctly tagged
`@api`/`@regression_m2`), plus supporting changes: a `deleteEnquiryDefinition` client method and a
`DELETE` operation literal on `ENQUIRY.DEFINITION_OPERATION`, a `sort` query param on
`executeEnquiry`, two new helpers in `enquiry-helper.ts` (`setupRelatedNameTable`,
`seedRelatedNameRecord`) plus a polling helper (`waitForEnquirySelectionFieldReady`), a
`withoutAuditableField` payload transform in `TableRegistryApiClient`, a new
`buildProjectionDrilldownWithOperations` payload builder, an `ENQUIRY_EXISTS_BY_ID` DB query, and a
`space` field added to `EnquiryExecuteRow`. Net diff: 8 files, +8,229/-7.

The diff is otherwise in strong shape — `npx tsc --noEmit`, `npx eslint --max-warnings=0`, `npx
prettier --check`, and `npm run allure:verify-ids` all pass clean against the MR head, the file has
zero comments (correct for a `*.spec.ts` file), every `expect(...)` carries a message, no hardcoded
HTTP status literals appear, and no duplicate `TC-`/`allureCaseId` values exist either within the
file or against the rest of the repo. The core problem with this MR: roughly 150 lines of new
helper code shipped in `enquiry-helper.ts` are never called by anything, anywhere in the repo — see
Confirmed Issue #1.

---

## Confirmed Issues

**[Confirmed] Two new helper functions ship as dead code (~150 lines)**
`api/system_core/helpers/enquiry-helper.ts:98-146` (`seedRelatedNameRecord`) and `:250-300`
(`waitForEnquirySelectionFieldReady` + its `ENQUIRY_SELECTION_FIELD_PROPAGATION_TIMEOUT_MS`
constant) are both `export`ed but have zero call sites anywhere in the repository — not in this
MR's own `enquiry-regression.spec.ts` (which imports only `setupEnquirySourceTable`,
`setupRelatedNameTable`, and `waitForEnquiryInRegistry` from this file), and not in any other spec.
`setupRelatedNameTable` (the sibling helper added in the same commit) *is* used, at lines 1123,
1581-1582 — so this isn't a case of the whole feature being unused, just these two functions.
Worth flagging separately: if `waitForEnquirySelectionFieldReady` is ever wired up, its polling loop
creates a "probe" record on the shared `REPORT.CONTROL~BASIC` table on every successful poll
iteration (`buildRecordInputPayload(probeId, ...)` at `:216-227`) with no corresponding cleanup call
visible in the helper itself — that's a second issue to fix before it's actually used, not just a
reason to keep it around unused.
Fix: delete both functions (and the constant) if they were leftover from an abandoned approach, or
wire them into the spec (and add cleanup for the probe record) if a case was meant to use them but
got dropped from this MR.

---

## Possible Risks

**`withoutAuditableField` widens this MR's blast radius beyond Enquiry & Reporting, with no stated rationale**
`api/system_core/client/table-registry-api-client.ts:29-35` adds a transform that strips
`auditable` from every payload passed to `createTable` (`:91-96`) and `createTableNoRetry`
(`:98-105`) — both used by dozens of existing specs across `system_core`, `security_management`,
`fin_accounting`, and `integration_chapter`, not just this MR's new Enquiry tests.
`bruno/collections/Table Registry/Internal/folder.yml:30` documents `auditable` as
"Derived by the registry from the Table's `type`" — i.e. server-computed, not client-set — which
makes stripping it a plausible correctness cleanup rather than a functional risk (the field was
likely already ignored server-side). Still, none of the 9 commits in this MR mention `auditable` or
explain why a client-wide behavior change belongs in a ticket scoped to Enquiry & Reporting Framework
regression tests, and nothing in the diff demonstrates *why* it was needed (no failing case in this
spec exercises `createTable` in a way that visibly depends on it).
Fix: confirm in the MR description or a commit message why this was needed for TB-3083 specifically,
and confirm no existing test relies on `auditable` actually reaching the request body.

**New `DELETE` operation on `ENQUIRY.DEFINITION_OPERATION` has no Bruno citation**
`api/system_core/paths/sys-core-api-paths.ts:51` widens `DEFINITION_OPERATION`'s type from
`'INPUT' | 'SEE'` to `'INPUT' | 'SEE' | 'DELETE'`, and
`api/system_core/client/enquiry-api-client.ts:44-56`'s new `deleteEnquiryDefinition` calls it with
`{ id: enquiryId }` — structurally identical to the existing `getEnquiryDefinition`/`SEE` method
right above it, which is a reasonable "existing pattern" justification. However,
`bruno/collections/Table Template/Enquries/Enquiry Operation.yml` — the collection documenting this
exact endpoint — only has worked examples for `INPUT` and `SEE` (lines 305-1016); there's no `DELETE`
example anywhere in the collection. The new spec case (`enquiry-regression.spec.ts` ~line 2412,
verified via `DB_QUERIES.TABLE_REGISTRY.ENQUIRY_EXISTS_BY_ID`) implies this was actually exercised
and worked, but the endpoint itself remains undocumented for the next person who touches this file.
Fix: add a `DELETE` example to `Enquiry Operation.yml` (mirroring the `SEE` example), or cite an
existing doc/case confirming the operation before merge.

**Twelve regression cases carry individually-extended timeouts, one up to ~12 minutes**
`enquiry-regression.spec.ts` overrides `test.setTimeout(...)` in 12 places (lines 5804, 5969, 6098,
6288, 6396, 6554, 6808, 6991, 7417, 7585, 7749, 7902), eleven at 150,000ms and one — TC-1013,
`:6098` — at 700,000ms, on top of the suite's own `test.describe.configure({ timeout: 300_000 })`
(`:46`). This matches `testing-standards.md`'s documented pattern ("generous — real infra, not
mocked") and TC-1013's own steps do use real polling (`pollUntilReady`) rather than a fixed sleep, so
this isn't a correctness issue — but 12 tests with materially extended timeouts landing in one new
`@regression_m2` file is a meaningful addition to that CI job's worst-case wall-clock budget.
Fix: no code change needed; worth a sanity check that the `regression_m2` CI job's own timeout
budget still comfortably covers this file with the rest of the suite.

---

## Nice-to-Have Improvements

**`buildProjectionDrilldownWithOperations` duplicates `buildProjectionDrilldown`'s literal shape**
`api/system_core/payload-builder-enquiry.ts:133-146` (new) returns the same
`{ type: 'PROJECTION', config: { projection, record, operations } }` shape as the existing
`buildProjectionDrilldown` (`:119-131`, unchanged by this MR) — the only difference is that the new
function takes an explicit `operations` array and optional `sourceFieldId` instead of hardcoding a
single `SEE` operation and `sourceFieldId: null`.
Fix: not blocking — but `buildProjectionDrilldown` could now be reimplemented as
`buildProjectionDrilldownWithOperations(projectionId, [{ operation: 'SEE', label }])` to remove the
duplicated object-literal shape.

---

## Ready-to-paste GitLab comments

```
Комментарий 1
[Confirmed] Два новых helper'а — мёртвый код (~150 строк)
api/system_core/helpers/enquiry-helper.ts:98-146 (seedRelatedNameRecord) и :250-300 (waitForEnquirySelectionFieldReady + константа) экспортируются, но нигде не вызываются — ни в этом же MR, ни в остальном репозитории. setupRelatedNameTable из того же коммита используется (строки 1123, 1581-1582), а эти два — нет. Если waitForEnquirySelectionFieldReady когда-нибудь подключат, у него ещё и нет очистки "probe"-записи, которую он создаёт в REPORT.CONTROL~BASIC при каждом успешном опросе.
Как исправить: удалить обе функции (и константу), либо подключить их в спек (и добавить cleanup для probe-записи), если для них был задуман, но выпал из MR тест-кейс.

Комментарий 2
[Possible Risk] withoutAuditableField расширяет область изменений MR без пояснения
table-registry-api-client.ts:29-35 убирает auditable из payload для createTable/createTableNoRetry — это затрагивает десятки существующих тестов за пределами Enquiry & Reporting Framework. Судя по bruno/collections/Table Registry/Internal/folder.yml:30, поле вычисляется сервером, так что риск функциональных поломок невелик, но ни один из 9 коммитов не объясняет, зачем это понадобилось именно для TB-3083.
Как исправить: указать в описании MR или в коммите, почему это изменение нужно для этого тикета, и подтвердить, что ни один существующий тест не полагается на реальную передачу auditable в запросе.

Комментарий 3
[Possible Risk] Новая операция DELETE на ENQUIRY.DEFINITION_OPERATION без ссылки на Bruno
sys-core-api-paths.ts:51 и enquiry-api-client.ts:44-56 добавляют DELETE по образцу существующего SEE, но bruno/collections/Table Template/Enquries/Enquiry Operation.yml документирует только INPUT и SEE — примера DELETE там нет.
Как исправить: добавить пример DELETE в Enquiry Operation.yml (по аналогии с SEE) или сослаться на существующий документ/кейс, подтверждающий эту операцию.

Комментарий 4
[Nice-to-Have] buildProjectionDrilldownWithOperations дублирует buildProjectionDrilldown
payload-builder-enquiry.ts:133-146 повторяет ту же структуру объекта, что и buildProjectionDrilldown (:119-131) — единственное отличие в параметрах operations/sourceFieldId.
Как исправить: не блокирует мердж — можно переопределить buildProjectionDrilldown через buildProjectionDrilldownWithOperations, чтобы убрать дублирование.
```
