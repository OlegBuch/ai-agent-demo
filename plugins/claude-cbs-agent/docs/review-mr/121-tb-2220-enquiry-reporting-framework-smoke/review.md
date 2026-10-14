# Review: MR !121 — TB-2220 Test impl: Enquiry & Reporting Framework - Smoke

## Summary

TB-2220 asks for smoke automation of the new Enquiry & Reporting Framework, linked from Jira to
Allure TestOps case #636 and Confluence `US-01.07.01 | Assemble Enquiry`. This MR delivers that as
one new file, `api/system_core/tests/enquiry-smoke.spec.ts` (658 lines, 7 test cases across four
`test.describe` blocks covering Assemble/`US-01.07.01.01`–`.03`, Update/`US-01.07.02`, and
Display/`US-01.07.03`), backed by a new `EnquiryApiClient`, `enquiry-helper.ts`,
`api/types/enquiry.types.ts`, and `test-data/payload-builder-enquiry.ts`, plus a `listEnquiries`
method on `TableRegistryApiClient` and supporting path/constant additions in
`sys-core-api-paths.ts`, `api-paths.ts`, and `constants-keeper.ts`. Net diff (isolated to this
branch's own commits via the actual merge-base, not the raw branch tip — see note below) is 9
files, +1456/-5.

**Note on diff scope:** `group-1/TB-2220` is currently 6 commits behind `main` (three unrelated
merges: `TB-2113` Entry Generation Regression, `TB-1862`/`TB-1415` Product Attribute Classes). A
raw `git diff main..branch` shows ~12,000 deleted lines from that staleness alone — none of that is
this MR's doing, and this review is scoped to the branch's actual own commits (merge-base diff)
only.

The core problem with this MR: it hand-rolls Allure TestOps IDs directly into test titles instead
of using this repo's own, already-working ID-linking mechanism — see Confirmed Issue #1.

---

## Confirmed Issues

**[Blocking] Test titles bypass the existing Allure-linking mechanism and break this repo's naming convention — one is also corrupted**
All 7 tests in `enquiry-smoke.spec.ts` are named `'Allure TestOps-<id>: <behavior> (API)'`
(lines 57, 170, 293, 379, 496, 611) instead of this repo's own `TC-<number>: <behavior>` convention
(`testing-standards.md`, confirmed by every sibling spec: `table-registry-smoke.spec.ts`'s
`TC-XXX: ...` and `projection-forms-smoke.spec.ts`'s `TC-XX - US-X.XX.XX | Feature | behavior
(API)`). Worse, this repo already has a dedicated, working mechanism for linking a test to its
Allure TestOps case — `test-data/allure-testcase-map.json` (a `{"<exact test title>": <case id>}`
map, consumed by `api-fixtures.ts:63-70`'s `beforeEach` hook via `allure.allureId(...)`) — fully
documented in root `README.md`'s "Linking automated tests to existing TestOps test cases" section:
*"New test, case already exists in TestOps: find the case id ... and add `"<title>": <id>` to the
map. No test-file changes needed."* This MR never touches `allure-testcase-map.json` at all, so
none of these 7 tests will actually link to cases 636/754/786/866/900/976/977 in Allure TestOps —
they'll upload unlinked and TestOps will create a fresh Draft case for each, defeating the entire
point of baking the ID into the title. On top of that, line 220's title is literally corrupted:
`'Move…-786: Dynamic Query Engine happy path...'` — not even a valid "Allure TestOps-" prefix.
Fix: rename all 7 tests to `TC-<number>: <behavior> (API)` per convention, then add their 7 entries
to `test-data/allure-testcase-map.json` mapping the new titles to case ids 636/754/786/866/900/976/977.

**[Blocking] `EnquiryExecuteResponse.page` doesn't match the documented Execute Enquiry response envelope**
`api/types/enquiry.types.ts:101-110` types the Execute Enquiry response as
`{ data: EnquiryExecuteRow[]; page: EnquiryPageInfo }` where `EnquiryPageInfo` is
`{ size, number, totalElements, totalPages }`. The actual documented contract
(`proj-bruno-api/collections/Table Template/Enquries/Execute Enquiry.yml`, response example) returns
`{ "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 2 } }` — different key name
(`pagination`, not `page`) and different sub-fields entirely. At runtime, `body.page` is
`undefined`, so `enquiry-smoke.spec.ts:564`'s `expect(body.page, ...).toBeTruthy()` fails outright,
and `:604-606`'s `secondBody.page.totalElements` throws a `TypeError` reading a property off
`undefined` — this breaks TC "Allure TestOps-976"'s second step entirely.
Fix: rename the field to `pagination` and correct `EnquiryPageInfo`'s shape to
`{ page: number; pageSize: number; total: number }` to match the Bruno-documented contract, then
fix the two assertions to read `body.pagination`/`secondBody.pagination.total`.

**[Confirmed] New `ENQUIRY_REGISTRY.ALL` endpoint has no cited API-contract source**
`api/utils/paths/api-paths.ts:6` (`TABLE_REGISTRY_ENQUIRIES: 'table-registry/api/v1/enquiries'`),
consumed by `table-registry-api-client.ts`'s new `listEnquiries()` and
`enquiry-helper.ts`'s `listAllEnquiryRegistryEntries`/`waitForEnquiryInRegistry` (used by TC
"Allure TestOps-866" and "-977"). No Bruno request for this path exists anywhere in
`proj-bruno-api` — the "Table Registry" collection only has `Groups`/`Tables`/`Internal` folders, no
`Enquiries` folder. The only related reference is an incidental doc comment (TB-2009, in
`Tables/Reports/REPORT.SPOOL/proj-field-registry/01 create ENQUIRY_ID field.yml`) about a
get-by-id store, not a documented list endpoint. This violates the standing rule that a new
endpoint/path constant must be justified by a cited Bruno file, doc section, or existing pattern —
`EnquiryRegistryListResponse`'s `data`/`page.totalPages` shape (assumed by analogy to
`Table Registry\Tables\Get all tables.yml`) is unverified for this specific endpoint.
Fix: either cite the actual Bruno request/doc for this endpoint, or add one to the collection and
link it here before merge, and confirm the response envelope really is `data`+`page.totalPages`
and not e.g. `content`+something else.

---

## Possible Risks

**Source-table `CHARGES` multifield may be missing the `x-type` the Enquiry engine expects**
`test-data/payload-builder-enquiry.ts:77-92`'s `CHARGES` field in
`buildEnquirySourceTableDefinitionPayload` sets `type: 'array'` + `'x-group-type': 'multi'` but no
`x-type`. The Bruno-documented Table Definition schema required by the Enquiry engine
(`Table Template/Enquries/Enquiry Operation.yml`'s `docs:` section, "Prerequisites: table_def for
CUSTOMER") shows `CHARGES` needing `"type": "array", "x-type": "ARRAY"` — no `x-group-type` at all.
`x-group-type: 'multi'` is a real, separately-used convention elsewhere in this repo
(`Table Template/Table definition/Update.yml`, `ddd-regression.spec.ts`) for a different kind of
multifield, so it's plausible but unconfirmed that these two are interchangeable for the Enquiry
engine's own AGGREGATE-over-multifield behavior (exercised by TC "Allure TestOps-786"'s
`TOTAL_CHARGES` aggregate over `CHARGES.CHARGE_AMOUNT`). This is circumstantially reinforced by
Nice-to-Have #2 below — a `FIELD_CONSTS.X_TYPE.ARRAY` constant was added but never used anywhere,
suggesting it was meant to be wired onto this exact field and wasn't finished.
Fix: confirm against Allure TestOps case #786 or a live run whether `CHARGES` also needs
`'x-type': FIELD_CONSTS.X_TYPE.ARRAY` for the AGGREGATE to resolve correctly.

**`@smoke_m1` tag may be the wrong milestone bucket**
`enquiry-smoke.spec.ts:22` tags the suite `@smoke_m1`. Sibling `system_core` specs split between
`_m1` (`audit-fields-smoke.spec.ts`, `dynamic-data-dictionary-smoke.spec.ts`) and `_m2`
(`customization-smoke.spec.ts`, `idempotency-smoke.spec.ts`) with no documented rule for which new
features belong where; more recently-added modules skew `_m2`. Can't be confirmed from local docs
alone which milestone Enquiry belongs to. MR-pipeline test auto-run is currently globally disabled
(`.gitlab-ci.yml`, `TEMPORARY (TB-2632)`), so this doesn't block this MR's own CI, but it does
determine whether a manual `TEST_TYPE=smoke-m1` vs `smoke-m2` run ever picks these tests up.
Fix: confirm the correct milestone tag with whoever owns the M1/M2 split before merge.

---

## Nice-to-Have Improvements

**Multi-paragraph JSDoc comment exceeds this repo's WHY-only/1-2-line comment cap**
`test-data/payload-builder-enquiry.ts:15-21` — a 6-line `/** ... */` block above
`buildEnquiryDefinitionPayload`. `coding-standards.md`'s Comments rule caps any acceptable comment
at 1-2 lines stating a single WHY; shorter section-header/WHY comments already exist in sibling
`test-data/` files (`payload-builder.ts`, `payload-builder-projection-forms.ts`) as precedent, but
none run this long.
Fix: trim to one line (the TI-01.07 §2.3 cross-reference is the only genuinely non-obvious part;
the rest restates what the function signature already shows).

**Unused `FIELD_CONSTS.X_TYPE.ARRAY` constant**
`api/utils/constants/constants-keeper.ts:272` adds `ARRAY: 'ARRAY'` to `FIELD_CONSTS.X_TYPE`, but
nothing in this diff (or the rest of the repo) references `X_TYPE.ARRAY`.
Fix: either wire it onto the `CHARGES` field (see Possible Risk #1) or drop the unused constant.

**Table cleanup only runs once for the whole file, not per test**
`enquiry-smoke.spec.ts` has a single top-level `test.afterAll` cleaning up every table created
across all 7 tests; there's no `test.afterEach` resetting `createdTableIds` between tests.
`testing-standards.md` documents per-test cleanup (`afterEach`) for resources created inside one
test, and `table-registry-smoke.spec.ts` follows that; `projection-forms-smoke.spec.ts` uses the
same afterAll-only pattern this MR follows, so this isn't a new deviation, but it does mean a
mid-run failure leaves every table created by earlier tests in this file live until the run ends
(or forever, if the run is killed).
Fix: not required to match precedent, but consider `afterEach` cleanup if this suite grows.

**Commit hygiene: duplicate/typo'd cleanup commits**
`f6fd372 refactor remove comments` and `f36e32a refactor rmove comments` (typo) are two consecutive,
near-identical cleanup commits.
Fix: none needed post-merge; worth squashing on the next similar cleanup pass.

---

## Ready-to-paste GitLab comments

```
Комментарий 1
[Blocking] Названия тестов не связаны с Allure TestOps через существующий механизм
Все 7 тестов в enquiry-smoke.spec.ts названы 'Allure TestOps-<id>: ...' вместо TC-<number>: ... по конвенции репо. В проекте уже есть готовый механизм связки с Allure TestOps — test-data/allure-testcase-map.json + api-fixtures.ts (см. README «Linking automated tests»), но этот MR его не использует, поэтому тесты 636/754/786/866/900/976/977 уйдут в Allure как несвязанные, и для каждого создастся новый Draft-кейс. Плюс название на строке 220 буквально сломано: 'Move…-786: ...'.
Как исправить: переименовать все 7 тестов в TC-<number>: <behavior> (API) и добавить 7 записей в allure-testcase-map.json.

Комментарий 2
[Blocking] EnquiryExecuteResponse.page не совпадает с реальным контрактом Execute Enquiry
Bruno-спека (Execute Enquiry.yml) возвращает {"data": [...], "pagination": {"page","pageSize","total"}}, а не {"page": {"size","number","totalElements","totalPages"}}. body.page будет undefined в рантайме — secondBody.page.totalElements на строке 604 упадёт с TypeError.
Как исправить: переименовать поле в pagination и привести EnquiryPageInfo к {page, pageSize, total}.

Комментарий 3
[Confirmed] Новый endpoint ENQUIRY_REGISTRY.ALL без ссылки на API-контракт
table-registry/api/v1/enquiries не задокументирован ни в одном Bruno-запросе (только косвенное упоминание в докой-комментарии TB-2009). Использует его listAllEnquiryRegistryEntries/waitForEnquiryInRegistry в TC-866 и TC-977.
Как исправить: указать реальный Bruno-запрос/документ для этого эндпоинта или добавить его в коллекцию перед мерджем.

Комментарий 4
[Possible Risk] Поле CHARGES в source-table может не иметь нужного x-type
payload-builder-enquiry.ts:77-92 задаёт CHARGES как type: array + x-group-type: multi, без x-type. Bruno-докой к Enquiry Operation.yml показывает CHARGES с "x-type": "ARRAY" (без x-group-type). Добавленная в этом же MR константа FIELD_CONSTS.X_TYPE.ARRAY при этом нигде не используется — похоже, это недоделанная правка.
Как исправить: проверить на кейсе #786, нужен ли CHARGES 'x-type': FIELD_CONSTS.X_TYPE.ARRAY для корректной работы AGGREGATE.
```