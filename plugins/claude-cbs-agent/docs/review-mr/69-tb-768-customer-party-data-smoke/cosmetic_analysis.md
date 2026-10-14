# Cosmetic Analysis — MR 69 (TB-768: Customer (Party) Data — Smoke)

## Summary

Reviewed all 45 changed files across MR 69's full diff (7975 diff lines; 3672 insertions / 1939
deletions) against `docs/frame-specs/coding-standards.md`, `testing-standards.md`, the tag
taxonomy as actually used in live sibling specs, and the full reuse surface (`api/utils/**`,
`constants-keeper.ts`, `api/types/*.types.ts`, `test-data/payload-builder.ts`, each touched
module's own client/helpers/paths files) — no sampling, every added/changed line checked.
`package-lock.json` (831 lines) was excluded as an auto-generated lockfile. Five files are pure
deletions with no added lines and no cosmetic findings possible:
`api/system_core/tests/idempotency-regression.spec.ts`,
`api/system_core/tests/idempotency-smoke.spec.ts`, `api/utils/constants/db-query-keeper.ts`,
`scripts/verify-allure-testcase-map.ts`, `test-data/allure-testcase-map.json`.

⸻

## Confirmed Issues

**[Confirmed Issue] Magic HTTP status-code literals replacing `TEST_CONSTS.HTTP_STATUS.*`**
`TEST_CONSTS.HTTP_STATUS` (`api/utils/constants-keeper.ts`) already names `OK`(200)/`CREATED`(201)/
`NO_CONTENT`(204)/`BAD_REQUEST`(400)/`FORBIDDEN`(403)/`NOT_FOUND`(404)/`CONFLICT`(409), but bare
numeric literals were used throughout the diff instead, including two values (`423`) with no
constant at all yet. Occurrences: `api/customer/tests/customer-party-data-smoke.spec.ts:63,71,89,
97,123,131,141,190,232,262,282,283,310,336,351,372,380,392,422,465,466,495,496,513,536,549,574,
603,623,643,656,693,716,725,746,781,816,830,843,877,888,907,920,959,982,991,1012,1042,1086,1115,
1128,1151,1164,1194,1204,1234,1258,1282,1317,1327,1343,1366,1400,1409,1425,1457,1465,1513,1521,
1543,1581,1611,1619,1655,1667,1697,1710,1747,1755,1799,1807,1839,1847,1884,1892,1920,1928,1963,
1981,2016,2029,2049,2059`; `api/integration_chapter/tests/customization-integration.spec.ts:71,87,
158,187,189,198,213,272,274,283,298,316,353,369,371,418,420,429,438,445,482,493,508,523,556,598,
616,649,662,678,693,707`; `api/system_core/tests/customization-regression.spec.ts:80,184,189,200,
214,245,251,263,297,303,341,351,357,387,399,447,471,531,540,561,585,632,641,680,764,771,806,836,
846,880,890,924,956,968,978,1016,1062,1137,1149,1159,1160`; `api/system_core/tests/
audit-fields-smoke.spec.ts:883`. Two of the `customer-party-data-smoke.spec.ts` sites (`:1327`,
`:1425`, plus `:380`/`:816` in the first half) assert `423`, which has no `HTTP_STATUS` member at
all yet.
Fix: replace every literal with the matching `TEST_CONSTS.HTTP_STATUS.*` member (arrays become
`[TEST_CONSTS.HTTP_STATUS.X, TEST_CONSTS.HTTP_STATUS.Y]`), and add a new `LOCKED: 423` member to
`HTTP_STATUS` for the four `423` sites.

**[Confirmed Issue] Magic status-string literals replacing `TEST_CONSTS.STATUS.*`**
`TEST_CONSTS.STATUS` already exports `HOLD_STATUS`('HOLD')/`UNAU_STATUS`('UNAU')/`HNAU_STATUS`
('HNAU')/`ST_RECORD_STATUS`('RNAU'), and this same MR adds `LIVE_STATUS`('LIVE') to the same
object — yet raw string literals are used instead at: `api/customer/tests/
customer-party-data-smoke.spec.ts:320,342,356,526,540,554,584,608,628,698,730,751,848,893,996,
1015` (`'HOLD'`/`'UNAU'`/`'LIVE'`); `api/system_core/tests/audit-fields-smoke.spec.ts:306,392,486`
(`'UNAU'`), `:828` (`'HOLD'`), `:1266` (`'RNAU'`), `:1484` (`'HNAU'`) — notably the same file
correctly uses `TEST_CONSTS.STATUS.LIVE_STATUS` at lines 561,748,988,1137,1148,1300, so the
inconsistency is introduced by this diff itself, not inherited.
Fix: replace each raw string with the corresponding `TEST_CONSTS.STATUS.*` member to match the
pattern the diff already uses for `LIVE_STATUS`.

**[Confirmed Issue] Raw `Date.now()`/ad hoc uniqueness instead of `api/utils/dynamic-name-generator.ts`**
Unique identifiers must come from `generateCustomId`/`generateDynamicGroup`/`generateDynamicTable`/
`generateDynamicField`/`generateIdempotencyKey`, never a hand-built `Date.now()` string. Violated
at: `api/customer/tests/customer-party-data-smoke.spec.ts:770` (`` `44${Date.now()}`.slice(0,12) ``
for a phone number, while the same file correctly uses `generateCustomId('SUFFIX').slice(-8)` at
lines 645/675/832); `api/system_core/tests/customization-regression.spec.ts:424,439,440,441,464,
465,502,602` (hand-rolled `` `..._${Date.now()}` `` strings, including two sites that pass an
already-`Date.now()`-suffixed string into `generateDynamicGroup`, which appends its own suffix
internally — the file's `generateCustomId` import was deliberately removed to make room for this);
`api/system_core/tests/audit-fields-regression.spec.ts:621` (`` `CUST_${Date.now()}` `` replacing a
removed `generateCustomId('CUST')` call and its import).
Fix: restore/use `generateCustomId(prefix)` (or the matching generator) at every cited line instead
of the inline `Date.now()` construction.

**[Confirmed Issue] Hand-rolled SQL / API-path literals duplicating `DB_QUERIES` / `GLOBAL_API_PATHS` / `SYS_CORE_API_PATHS`**
Query and path factories already exist under established names, but the diff removes the imports
and inlines byte-for-byte equivalents instead: `api/system_core/tests/
customization-regression.spec.ts:405` (`DB_QUERIES.RECORD_SPACE.COUNT`, with `DB_QUERIES`/
`TableSpace` imports removed at diff line 3953-3954); `api/utils/group-cleanup-helper.ts:65`
(`GLOBAL_API_PATHS.TABLE_REGISTRY_GROUPS`), `:119` (`DB_QUERIES.TABLE_REGISTRY.
TABLE_IDS_BY_GROUP_ID`), `:144-150` (`DB_QUERIES.SCHEMA.MATCHING_BASE_NAME`), `:162` and `:256`
(`DB_QUERIES.SCHEMA.DROP`), `:197-201` (`DB_QUERIES.TABLE_REGISTRY.ORPHANED_TABLE_IDS`), `:217`
(`DB_QUERIES.TABLE_REGISTRY.ALL_TABLE_IDS`), `:230-234` (`DB_QUERIES.SCHEMA.ALL_NON_SYSTEM`),
`:289` (`DB_QUERIES.TABLE_REGISTRY.ALL_TABLE_GROUPS`); `api/utils/test-polling-helper.ts:43`
(`DB_QUERIES.PROJECTION.DEF_EXISTS`), `:48` (`DB_QUERIES.PROJECTION.SET_AUTH_REQUIRED`),
`:126-127,132,137,142-143,148,153` (`DB_QUERIES.RECORD_SPACE.EXISTS`, six occurrences across
LIV/NAU/mock/mock_1), `:158,163` (`DB_QUERIES.RECORD_SPACE.SEQ_NO`), `:169,176,184`
(`DB_QUERIES.RECORD_SPACE.EXISTS_IN_LIV_OR_NAU`); `api/customer/helpers.ts:42,60` (hand-built
`` `/tables/api/v1/projections/${projectionId}/records/operations/${operation}` `` duplicating
`SYS_CORE_API_PATHS.PROJECTION.RECORD_OPERATION(projectionId, operation)`, `api/system_core/
sys-core-api-paths.ts:17-18`).
Fix: re-import and call the existing `DB_QUERIES.*`/`GLOBAL_API_PATHS.*`/`SYS_CORE_API_PATHS.*`
factory at every cited line instead of the inlined literal.

**[Confirmed Issue] Reuse-surface duplication of existing `api/utils` cleanup/helper functions**
`api/integration_chapter/tests/sms-system-core.spec.ts:125-126` calls
`deleteTableRegistryMetadata(createdTableIds)` then `dropTestSchemas(dbClient, createdTableIds)`
directly instead of the existing `cleanupTables(dbClient, tableIds)` (`api/utils/db-helper.ts:
269-287`), which already composes both plus the `shouldRunCleanup()` gate, Kafka-topic cleanup, and
`untrackTables` bookkeeping that the inline replacement silently drops. `api/system_core/helpers/
table-registry-helper.ts:328` replaces `if (shouldRunCleanup())` with `if (process.env.CI)`,
dropping the `isLocalCleanupEnabled()` branch `shouldRunCleanup()` also covers. `api/utils/
resource-tracker.ts:78-79` makes the identical substitution (`const isCI = Boolean(process.env.CI)`
in place of `shouldRunCleanup()`).
Fix: call the existing `cleanupTables(...)` / `shouldRunCleanup()` exports from `db-helper.ts` at
all four cited sites instead of reassembling their logic inline.

**[Confirmed Issue] Comment-hygiene violations — WHAT-restatement, over-length, or disallowed location**
Every comment added by this diff must be either absent, or (only inside `api/utils/**` and module
`helpers/`/`client/` folders) a single short WHY-only sentence — never a WHAT-restatement, never
multi-line, and never present at all in a `*.spec.ts` file or a config/doc file. Violations:
`.env.example:23` and `.gitignore:20` (new comments in zero-comment-tolerance config files);
`api/customer/helpers.ts:12,21,47,65,75` (five JSDoc blocks that each just restate their function's
own name/signature); `api/system_core/tests/customization-regression.spec.ts:267,315,436,461`
(`// Not implemented yet: ...` comments added directly in a `.spec.ts` file, where no comment is
ever acceptable); `test-data/payload-builder.ts:525,555,583,604,617` (five new WHAT-restatement
JSDoc comments in a file that is not a designated comment-permitted location); `api/utils/
constants-keeper.ts:539`, `api/utils/db-helper.ts:113`, `api/utils/global-setup.ts:216` (WHAT-
restatement comments inside otherwise comment-permitted `api/utils/**`); `api/utils/db-helper.ts:
435-438` (a genuine WHY comment, but 4 lines, double the 1-2 line cap); `api/utils/
rp-reporter-guard.ts:16-21` (new class-level JSDoc, 4 content lines, partly WHAT-restatement).
Fix: delete every comment in a `.spec.ts` file or config/doc location outright; in `api/utils/**`
and module helper/client files, either delete the comment or condense it to one WHY-only sentence
inside the 1-2 line cap.

**[Confirmed Issue] Hand-assembled payload/constant literals duplicating existing builders/constants**
`api/customer/tests/customer-party-data-smoke.spec.ts:566-571,596-601,615-621` hand-assemble
prospect payload objects (`PARTY_TYPE: 'PERSON'`, `DATE_OF_BIRTH: '1990-01-01'`, `GENDER: 'MALE'`)
that duplicate what `buildPersonProspectPayload()` (`test-data/payload-builder.ts`) — and this same
file's own `newPersonProspect()` helper at line 46 — already produce, without reusing either.
`api/customer/tests/customer-party-data-smoke.spec.ts:1032` hardcodes `RESIDENCE: 'GB'` where
`CUSTOMER_PARTY_CONSTS.PAYLOAD_VALUES.COUNTRY_GB` already exists and is used by
`buildRetailIndividualPayload()` itself. `api/system_core/tests/customization-regression.spec.ts:
375` hardcodes the header key `'X-Company-Code'` where `TEST_CONSTS.HEADERS.COMPANY_CODE` already
equals that same string. `api/customer/client/customer-api-client.ts:30` passes the literal
`'AUTH'` where `TEST_CONSTS.OPERATION.AUTH` already names it, and `api/customer/helpers.ts:42`
hardcodes `'INPUT'` where `TEST_CONSTS.OPERATION.INPUT` already names it.
Fix: replace each hand-rolled literal/object with the existing builder call or named constant
cited above.

**[Confirmed Issue] `api/system_core/tests/audit-fields-regression.spec.ts:619` — corrupted/mojibake test name**
The `TC-53` test name was rewritten with mojibake byte sequences (`â€”`, `â†’`) in place of the
correct `—`/`→` characters, producing an unreadable, encoding-corrupted name in test reports and
Allure output.
Fix: restore the correct UTF-8 characters: `'TC-53: [AUTH] Full Lifecycle — HISTORY_RESTORE →
HNAU → AUTH → LIV (FIN)'`.

**[Confirmed Issue] `api/utils/dynamic-name-generator.ts:19` — `aqa_` prefix dropped from the shared `generate()` helper**
The template literal changes from `` `aqa_${prefix}_${Date.now()}_${secureSuffix}` `` to
`` `${prefix}_${Date.now()}_${secureSuffix}` ``, silently dropping the `aqa_` prefix every one of
this function's five callers (`generateDynamicField`, `generateDynamicTable`,
`generateDynamicGroup`, `generateCustomId`, `generateIdempotencyKey`) relies on for test-owned-name
detection (`isTestOwnedName`'s pattern includes `^aqa`).
Fix: restore the `aqa_` prefix in the template literal.

**[Confirmed Issue] `api/utils/dynamic-name-generator.ts:7` — `DefaultPrefix.GROUP` value inconsistent with sibling enum members**
Changed from `GROUP = 'GROUP'` to `GROUP = 'QA_GROUP'`, while every sibling member keeps the
established `CUSTOM_`-prefixed pattern (`FIELD = 'CUSTOM_FIELD'`, `TABLE = 'CUSTOM_TABLE'`,
`CUSTOM = 'CUSTOM_ID'`).
Fix: rename to `GROUP = 'CUSTOM_GROUP'` to match the sibling naming pattern.

**[Confirmed Issue] `api/utils/db-helper.ts:99` — SQL keyword casing inconsistent with rest of file**
The new inline query uses lowercase `` as count `` while every other SQL keyword the diff adds
elsewhere in this same file (`DELETE FROM`, `WHERE`, `ANY`, `ORDER BY`, `LIMIT`) is uppercase, and
the `DB_QUERIES.TABLE_REGISTRY.COUNT_TABLES_IN_GROUP` query this replaced used uppercase `AS count`.
Fix: capitalize to `AS count`.

**[Confirmed Issue] `api/customer/helpers.ts` — new helpers bypass the `CustomerApiClient`/`BaseApiClient` wrapper added in the same diff**
`postParty` (lines 22-45) and `performPartyOperation` (lines 48-63) take a raw `APIRequestContext`
and call `request.post(...)` directly, bypassing `CustomerApiClient` (`api/customer/client/
customer-api-client.ts`), which this same MR extends from `BaseApiClient` specifically to get its
retry-with-token-refresh logic (`api/utils/base-api-client.ts`) — so the new helpers get none of it.
Fix: route `postParty`/`performPartyOperation` through `CustomerApiClient`'s methods (or add
equivalent methods there) instead of issuing raw `request.post()`.

⸻

## Possible Risks

**[Possible Risk] Two parallel, disconnected reuse surfaces for the Customer Party API added in the same diff**
`api/customer/client/customer-api-client.ts` adds `createParty`/`createPartyDraft`/`getParty`/
`updateParty`/`authoriseParty`/`createRelationship` routed through the also-new `CUSTOMER_API_PATHS`
(`/api/customer-management/party...`), but `api/customer/tests/customer-party-data-smoke.spec.ts`
calls exclusively through `api/customer/helpers.ts`'s `postParty`/`performPartyOperation`, which hit
a differently-shaped path. `CustomerApiClient`/`CUSTOMER_API_PATHS` are imported nowhere in the
spec. This is a naming/pattern-consistency observation about two reuse surfaces added side-by-side,
not a verdict on which is correct.
Fix: confirm which surface is meant to be canonical and route the spec through it consistently, or
document why both coexist.

**[Possible Risk] Raw `authenticatedApiContext.get(...)` calls bypass this file's own `performPartyOperation` pattern**
`api/customer/tests/customer-party-data-smoke.spec.ts:1338-1341` and `:1539-1541` drop to a raw
`authenticatedApiContext.get(...)` call for table-registry/definition reads, while every other test
in the file routes through `performPartyOperation`.
Fix: add a `performPartyOperation`-style wrapper for table-registry/definition reads (in
`../helpers` or `customer-api-client.ts`) and route both calls through it.

**[Possible Risk] `expect()` actual/expected argument order inverted from the file's own established pattern**
Multiple sites write `expect([200, 201], message).toContain(actualStatus)` — literal array as
`expect()`'s subject, real value inside `.toContain()` — inverting the dominant `expect(actual,
message).toBe(expected)` pattern used elsewhere in the same files. Occurrences: `api/system_core/
tests/customization-regression.spec.ts:184,251,303,357,447,471,764,1137,1149`; `api/
integration_chapter/tests/customization-integration.spec.ts:187,189,272,274,369,371,418,420`. The
assertion message is present in all cases (satisfying the mechanical presence check) — this is a
structural-consistency observation only.
Fix: once the underlying magic-number literals are replaced with `TEST_CONSTS.HTTP_STATUS.*`,
restate these in the file's own actual-first ordering convention.

**[Possible Risk] Schema/table name literal duplicated within the same file with no shared constant**
`table_registry.tables` is hand-typed twice with no single source of truth after `DB_QUERIES`/
`TableRegistrySchema` were removed: `api/utils/db-helper.ts:99` (`countTablesInGroup`) and `:329-330`
(`findExistingTableIds`).
Fix: extract the schema/table name to one local `const` in the file if the two occurrences are
meant to stay in sync.

**[Possible Risk] Implicitly-`any` `require()` result cast straight to `Reporter` with no narrowing**
`api/utils/rp-reporter-guard.ts:52-54` — `const RpReporterModule = require('@reportportal/
agent-js-playwright')` types as `any` (no `@types` package declared), then
`new RpReporter(this.options) as Reporter` asserts that `any` value directly, with no shape check
in between.
Fix: add a minimal runtime shape check (or a local type for the required module) before the cast.

**[Possible Risk] Hardcoded local absolute filesystem path in a checked-in doc**
`README_RP.md:32` links to `[package.json](file:///c:/tefo-proj/proj-test-automation/package.json)`
— a machine-specific path (drive letter, personal folder name) that will not resolve for any other
developer or environment.
Fix: replace with a relative link, e.g. `[package.json](./package.json)`.

**[Possible Risk] `authoriseParty` uses British spelling inconsistent with repo's established American-spelling identifiers**
`api/customer/client/customer-api-client.ts:29` — the repo's own identifiers consistently use
American spelling for this term (`TEST_CONSTS.HTTP_STATUS.UNAUTHORIZED`, `'ST-AUTHORIZER'`/
`AUTHORIZER` in `constants-keeper.ts:76,587-590`).
Fix: rename to `authorizeParty`.

⸻

## Nice-to-Have Improvements

**[Nice-to-Have] Redundant empty options argument on a raw GET call**
`api/customer/tests/customer-party-data-smoke.spec.ts:1340` passes an unnecessary empty `{}` second
argument to `authenticatedApiContext.get(...)`, unlike every other call site in the file.
Fix: drop the trailing `{}` argument.

**[Nice-to-Have] Near-duplicate SQL literal instead of one parametrized query**
`api/utils/db-helper.ts:328-330` writes two nearly identical SQL strings differing only in the
`LIKE` clause, where the replaced code used one parametrized string with a computed `params` array.
Fix: collapse back to a single parametrized query.

**[Nice-to-Have] Magic timeout literal where the file already has a named-constant pattern**
`api/utils/global-setup.ts:220` hardcodes `{ timeout: 3000 }` in `isReportPortalReachable`, while
the sibling `assertServiceReachable` in the same file already establishes `const PROBE_DELAY_MS =
5000;`.
Fix: extract `3000` to a named constant following the file's own `PROBE_DELAY_MS` pattern.

**[Nice-to-Have] `eslint-disable` comment missing the reason suffix used by the sibling pattern**
`api/utils/rp-reporter-guard.ts:51` — `// eslint-disable-next-line @typescript-eslint/
no-require-imports` omits the `-- reason` suffix that `api/utils/api-fixtures.ts:64` establishes as
the local convention for this exact comment shape.
Fix: append a `-- reason` clause matching the sibling pattern.

**[Nice-to-Have] Misaligned new table row in `README.md`**
`README.md:41` is missing the space before the column-1 closing pipe that every sibling row has
(e.g. line 40).
Fix: add the missing space to match the table's established padding.

**[Nice-to-Have] Inconsistent abbreviation of "Report Portal"**
`README.md:39` abbreviates to `_(required for RP)_` while every other mention this same diff adds
spells it out as "Report Portal" (`README.md:113,115`, throughout `README_RP.md`).
Fix: change to `_(required for Report Portal)_`.

**[Nice-to-Have] Emoji headers in `README_RP.md` inconsistent with sibling `README.md`**
`README_RP.md` headers use emoji (`## 🚀 Getting Started`, etc.), a style not used anywhere in
`README.md`.
Fix: drop the emoji to match `README.md`'s plain heading style, or confirm this split is
intentional.
