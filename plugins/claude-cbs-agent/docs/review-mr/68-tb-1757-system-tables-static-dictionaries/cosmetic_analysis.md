# Cosmetic / Style Review — MR !68 (TB-1757)

## Summary
Reviewed all 24 changed files / 1672 diff lines (`git diff main..mr-68-review`) line-by-line against `docs/frame-specs/coding-standards.md`, `testing-standards.md`, the tag taxonomy, and the reuse surface bundle; no lines were sampled or skipped.

## Confirmed Issues

[Blocking] Comment added in a location where no comment is ever acceptable
`.env.example:58` rewords (but keeps) a comment: `# Kafka UI (optional — topic cleanup in teardown; set both to enable)`. Per `coding-standards.md`, `.env.example` is an explicitly zero-comment-allowed location regardless of length/content, and this line is touched by the diff.
Fix: delete the comment line; keep only the variable names.

[Blocking] Comments changed in designated helper files restate WHAT instead of a single short WHY
Three separate comments touched by this diff, each inside a designated comment-eligible location (`api/utils/**`), violate the "single short WHY-only sentence, never a WHAT-restatement" rule:
- `api/utils/api-fixtures.ts:16` — new `// Worker-scoped fixture to automatically create and clean up a group per worker.` restates exactly what the fixture code two lines below it already shows (it is named `workerGroupId` and its body creates/cleans up a group).
- `api/utils/kafka-topic-cleanup-helper.ts:10-14` — new 5-line JSDoc block on `deleteKafkaTopicsForTableIds` (`Deletes Kafka topics ... via the Kafka UI REST API. DELETE {..} ... Skips when ...`) exceeds the 1-2 line cap and narrates what the function does rather than stating one non-obvious WHY.
- `api/utils/test-ownership.ts:2-3` — the edited file-header comment (`Shared guards for identifying test-generated resource names ... Used by db-helper, group-cleanup-helper, and maintenance scripts.`) still enumerates what the module contains and who calls it, not a WHY.
Fix: reduce each to at most one short WHY sentence (a hidden constraint/invariant) or remove it entirely.

[Major] Reinvented environment/DB-name resolution instead of reusing the existing named helper
`api/utils/db-helper.ts:89-94` — `getRegistryDbName()` is rewritten to inline `process.env.DB_NAME` suffix matching (`'_dev'`, `'_stg'`) and hardcoded literals `'table_registry_dev'`/`'table_registry_stg'`/`'table_registry_qa'`. This is the same branching logic the diff simultaneously deletes as the named, typed, exported `CbsEnvName`/`getCurrentEnvName()` from `api/utils/test-ownership.ts` — replacing one shared utility with an unnamed inline duplicate of unnamed magic strings at the sole remaining call site, instead of keeping a single reusable named export.
Fix: keep the environment-resolution logic behind one named, exported helper (update `getCurrentEnvName`'s call sites if its signature needs to change) rather than duplicating its branches as raw literals inline.

[Major] Hardcoded lowercase space strings duplicate the existing `TableSpace` enum
- `api/system_core/helpers/system-tables-helper.ts:75` — `cleanup(spaces: string[] = ['liv', 'nau', 'his'])`.
- `api/utils/reference-data.values.ts:21-23` — `SPACE: { LIV: 'liv' }`.
Both reinvent, as raw string literals, values already provided by the exported `TableSpace` enum (`LIV`/`NAU`/`HIS`/...) in `api/utils/constants-keeper.ts` — the same enum that `api/utils/test-polling-helper.ts`'s existing `waitForRecord` (line 148) already consumes as `TableSpace.LIV`/`TableSpace.NAU`.
Fix: import and reference `TableSpace.LIV`/`NAU`/`HIS` instead of introducing new raw-string equivalents.

[Major] New `ReferenceDataDb.waitForRecord()` duplicates the existing `waitForRecord()` helper
`api/system_core/helpers/system-tables-helper.ts:52-73` (the method) together with its `fetch()` at `:44-50` (raw inline SQL `` SELECT id, seq_no, data FROM ${schema}.${space} WHERE id = $1 ``) re-implement the same purpose as the already-exported `waitForRecord()` in `api/utils/test-polling-helper.ts:148` (poll a DB record in a schema/space until a target seq_no or existence condition is met, then time out). The existing implementation builds its query through the centralized `DB_QUERIES.RECORD_SPACE.SEQ_NO` builder and the `TableSpace` enum; the new method bypasses both and hand-rolls the SQL and the polling loop under the identical name `waitForRecord`, just as an instance method of a new class instead.
Fix: extend the existing `waitForRecord` (in `test-polling-helper.ts`) with whatever parameter/return shape this suite needs instead of adding a same-named, same-purpose duplicate in a different module.

[Major] `executeEnquiry`'s no-retry variant breaks from this class's own established naming pattern
`api/system_core/client/table-registry-api-client.ts:116-131` — the new `executeEnquiry(..., options?: { noRetry?: boolean })` introduces an options-flag toggle to skip retry. The same class already established the convention for this exact concern with a separately named method: `performRecordIntent` / `performRecordIntentNoRetry`. The new method's signature/naming doesn't follow the class's own existing precedent for "retry vs. no-retry" variants.
Fix: rename/split to match the established pattern, e.g. `executeEnquiry(...)` plus a distinct `executeEnquiryNoRetry(...)`, mirroring `performRecordIntent`/`performRecordIntentNoRetry`.

[Minor] New spec file doesn't follow the `<module>-regression.spec.ts` sibling-pair naming convention
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts` (new file, 141 lines) is the non-smoke counterpart to `api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts` (new file, 110 lines) — both cover the same "System Tables (Static Dictionaries)" suite and share the same helper (`setupSystemTablesSuite`) — yet the counterpart is not named `system-tables-static-dictionaries-regression.spec.ts`, breaking the established `<module>-smoke.spec.ts` / `<module>-regression.spec.ts` sibling-pair naming used elsewhere (e.g. `table-registry-smoke.spec.ts` + `table-registry-regression.spec.ts`).
Fix: rename to `system-tables-static-dictionaries-regression.spec.ts` if this is in fact the module's regression-tier suite.

## Possible Risks

[Risk] Non-smoke suite placed in a different module directory than its smoke sibling and its own dependencies
`api/integration_chapter/tests/system-tables-static-dictionaries.spec.ts` lives outside `api/system_core/`, while its identically-themed smoke sibling and everything it imports (`TableRegistryApiClient`, `setupSystemTablesSuite`, `responseDetail`) live under `api/system_core/`. The gathered bundle has no evidence confirming whether `api/integration_chapter` is an already-established, separate top-level test module for `@integration`-tagged suites (making the split intentional) or a stray new location — flagging for confirmation rather than asserting misplacement.

[Risk] Milestone-suffix on the new smoke suite's tags is unconfirmed
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:26` and `:67` both tag their tests `['@smoke_m2', '@api']`. The gathered bundle has no sibling-module evidence pinning System Tables/Static Dictionaries to m2 rather than m1 scope; if the feature is actually m1-scoped, both should be `@smoke_m1`.

[Risk] Inline `type` modifier instead of a separate `import type` statement
`api/system_core/tests/system-tables-static-dictionaries-smoke.spec.ts:6` imports `type DbRecord` inline inside a mixed value/type import (`import { setupSystemTablesSuite, responseDetail, type DbRecord } from '../helpers/system-tables-helper';`), whereas every other type-only import touched by this diff (e.g. `RecordInputResponse` two lines later in the same file, `CustomerDefaultInputData`/`RecordInputPayload` in `system-tables-helper.ts`) uses a separate `import type {...}` statement. Whether this actually violates the repo's configured `@typescript-eslint/consistent-type-imports` `fixStyle` is not resolvable from the gathered bundle — flagging for confirmation rather than asserting a lint failure.

[Risk] Kafka-UI REST path is now inlined instead of built through a dedicated paths file
`api/utils/kafka-topic-cleanup-helper.ts:9` constructs the topic-delete URL with a raw template literal instead of a path-builder constant, departing from this repo's established pattern of centralizing endpoint paths in a dedicated `*-api-paths.ts` file (as `sys-core-api-paths.ts`/`api-paths.ts` do). The one dedicated file that previously held this exact path builder (`kafka-paths.ts`) is deleted by this same diff, so there is no longer an equivalent left within this diff's own end-state to point back to — noted as a risk rather than a confirmed violation since the file that would host the reusable constant no longer exists after this change.

## Nice-to-Have Improvements

[Nice-to-have] Identical inline type literal repeated across four new interfaces
`api/types/system-tables.types.ts:3`, `:14`, `:20`, `:26` all repeat `DESCRIPTION: { en: string; [language: string]: string };` verbatim across `RegionInputData`, `SectorInputData`, `IndustryInputData`, `TargetInputData`.
Fix: factor out one shared type (e.g. `LocalizedText`) and reuse it in all four interfaces.

[Nice-to-have] New timing magic numbers not centralized with the repo's existing `*_WAIT_MS`/`*_INTERVAL_MS` constants
`api/system_core/helpers/system-tables-helper.ts:23` (`SYSTEM_TABLES_TEST_TIMEOUT_MS = 120000`, module-local) and `:70` (inline `setTimeout(resolve, 1000)` poll interval, unnamed) both add new timing values outside `api/utils/constants-waiter.ts`, where every other `*_WAIT_MS`/`*_INTERVAL_MS` timing constant in the repo is already centralized.
Fix: move both into `constants-waiter.ts` alongside their sibling timing constants for consistency.
