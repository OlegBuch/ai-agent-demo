# Framework-wide review — Round 2 (2026-08-12)

**Status:** discovery only — nothing in this document has been changed yet. This is a fresh,
independent pass, not a regression check of Round 1.

**Roles:** Senior Solution Architect + Senior QA Test Automation Lead + Senior Full Stack AQA
Engineer (combined).
**Scope:** entire `proj-test-automation` repo, every module, every file — broader lens than
Round 1 (which focused on duplication/misplacement only). This round explicitly also covers:
unused/dead code, file-placement correctness, base/cleanup-class SOLID/DRY/KISS quality, and
architecture-level opportunities to reduce test-execution load.
**Why now:** Round 1 (`framework-wide-duplication-audit.md`, 62 findings) was fully resolved and
committed (`c0343581`) on this same branch `group-3/TB-2807`. Since then, two features merged
into the branch that Round 1 never saw: TB-2113 "Entry Generation - Regression" and the Allure
request/response-attachment feature (`b37d774a`) — roughly 5,000 new lines across 17 files. The
user asked for a full, independent re-review, not a diff check, to find whatever Round 1's
narrower duplication-only lens missed and to assess the new code.
**Method:** 8 parallel read-only investigation passes (one per module cluster), each briefed with
Round 1's findings to avoid re-flagging resolved items, each instructed to read every file in
scope in full and grep repo-wide before asserting duplication/dead code. No code was modified.

Numbering continues from Round 1 (which ended at #62).

---

## 🔴 Critical — fix before anything else

### ~~#63. Build-breaking regression: `FinAccApiClient.putEntries`/`deleteEntries` reference a nonexistent field~~

**RESOLVED (2026-08-12):** removed `{ ...this.authHeader, ...headers }` in both methods, now pass `headers` directly (matching `postEntries`/`postReversal` in the same file). `tsc --noEmit` confirms both `TS2339` errors are gone; only the pre-existing, unrelated `field-registry.values.ts` error remains.

`api/fin_accounting/client/fin-acc-api-client.ts:36,44` reference `this.authHeader`, but
`FinAccApiClient` never declares that field — its constructor forwards the auth header to
`super()` as `defaultHeaders` only (line 13). Confirmed with `npx tsc --noEmit`:

```
api/fin_accounting/client/fin-acc-api-client.ts(36,46): error TS2339: Property 'authHeader' does not exist on type 'FinAccApiClient'.
api/fin_accounting/client/fin-acc-api-client.ts(44,40): error TS2339: Property 'authHeader' does not exist on type 'FinAccApiClient'.
```

**The whole repo currently fails `tsc --noEmit`.** `putEntries`/`deleteEntries` are called from
`api/fin_accounting/tests/entry-generation-regression.spec.ts:2062,2098`, so that spec cannot
compile. This is a direct reversal of Round 1 finding #8 (`defaultHeaders` consolidation) on the
two newest methods in the file — everywhere else in the file (`postEntries`, `postReversal`)
already does this correctly.
**Confidence: High (compiler-verified).** Fix: delete `{ ...this.authHeader, ...headers }` in
both methods; use `headers` directly, matching the sibling methods immediately above them.

---

## Round 1 open item — now resolved

### #26 (Round 1) — CLOSED: PF dotted-key vs. underscore-key casing

**Verdict: accidental duplication, not two legitimate response shapes.** The underscore-key
convention (`pf-smoke.types.ts`) is the real, Bruno-confirmed PF wire format; the dotted-key
convention (`pf-class.types.ts`/`pf-type.types.ts`/`product.types.ts`) is a dead, unused
abstraction that should be retired.

Evidence (now that the `proj-bruno-api` sibling checkout at `C:\Users\user\BrunoApi\proj-bruno-api`
is reachable):
- Every relevant Bruno request/response body uses underscore keys exclusively —
  `Tables/Product Factory/00 - Seeding/.../16 Seed PF.CLASS - ACCOUNTS.yml` (`ATTRIBUTE_CLASSES`),
  `.../11 Seed PF.TYPE - PERSONAL.LOANS.yml` (`PRODUCT_CLASS`), `.../01 Create PF.BUILDER draft
  CARLOAN.yml` (`PRODUCT_TYPE`, `PRODUCT_CURRENCIES`), `.../05 SEE PF.CATALOG CARLOAN.yml`
  (`PRODUCT_TYPE`, `PRODUCT_STATUS`, `RESOLVED_CONDITIONS`). None match the dotted keys anywhere.
- Repo-wide grep for the dotted literals (`'PRODUCT.TYPE'`, `'ATTRIBUTE.CLASSES'`, etc.) only
  matches inside the type-declaration files and `pf-payload-helper.ts`'s `normalizePayloadKey`
  mapping table — never in an actual payload a spec builds.
- Every real spec builds underscore-key payloads and only touches the dotted types as an
  immediately-defeated type annotation (`... as unknown as RecordInputPayload<PfType>`), possible
  only because `PfType`/`PfClass` carry an escape-hatch `[key: string]: unknown` index signature.
- `toServerPayload`/`normalizePayloadKey` (`api/product_factory/helpers/pf-payload-helper.ts`) —
  built to bridge the two conventions — is a no-op for every real call, since its 8-entry mapping
  table never matches already-underscore-cased keys.

**Recommendation:** treat `pf-smoke.types.ts`'s underscore convention as canonical. Fold
`PfClass`/`PfType`/`Product`/`AttributeClassConfig`'s real fields into the smoke types, repoint
`PFApiClient`'s parameter types, delete the dotted branches of `normalizePayloadKey`, delete the
now-pointless `as unknown as` casts scattered through the specs. **Confidence: High.**

**RESOLVED (2026-08-12):** implemented as recommended. `PfClass`/`AttributeClassConfig`
(`pf-class.types.ts`) and `PfType` (`pf-type.types.ts`, file deleted) retired in favor of the
existing underscore equivalents already in `pf-smoke.types.ts` (`PfClassData`, `PfTypeData`,
`AttributeClassDef`, `TypeAttributeClassDef`) — their fields already matched, no new fields needed.
`pf-class.types.ts` kept as a 1-line `RecordInputPayload` re-export only, since
`api/integration_chapter/tests/pf-sc-sms.spec.ts` (out of this pass's scope) still imports it from
there. `ProductData.'PARENT.PRODUCT'` (dotted) fixed to `PARENT_PRODUCT` — confirmed via Bruno
(`Product Factory/00 - Seeding/04 - Create Fields/28 create PARENT_PRODUCT field.yml` and the
Savings Inheritance demo run's real request bodies) that this was itself a latent bug: real specs
already had to work around it with a manual `PfBuilderData & { PARENT_PRODUCT?: string }`
intersection at every call site. `PFApiClient.updatePfClass`/`createPfType` repointed to
`RecordInputPayload<PfClassData>`/`RecordInputPayload<PfTypeData>`. `pf-payload-helper.ts`'s
`normalizePayloadKey` (an 8-entry dotted-to-underscore mapping table, now provably unreachable)
deleted outright — its call sites in `toServerPayload` now use the key unchanged; the
`'1st product'`/`FIRST_PRODUCT`/`INVALID_PRODUCT_ID` special-casing was deleted with it (traced to
being reachable only from the dead `PFApiClient.createProduct`/`buildProductPayload`, see below).
Also found and removed, as directly-dead fallout of retiring the dotted convention (zero callers
repo-wide, confirmed by grep): `PFApiClient.createProduct` (dotted `Product` param),
`buildProductPayload`, `buildPfTypePayload`, and `buildManagePayload` (`test-data/payload-builder.ts`,
all three built on the dotted types/keys and never called). All now-pointless
`as unknown as RecordInputPayload<PfType>` / `as PfType` casts removed from
`pf-core-smoke.spec.ts`, `pf-core-regression.spec.ts`, and
`product-attribute-classes-core-engine-smoke.spec.ts` (14 sites). `tsc --noEmit` and `eslint` clean
on every touched file.

---

## Tier 1 — Duplication (new instances, not in Round 1)

### `api/utils/`

~~**#64.** `TEST_CONSTS.USER_PROFILE_ALLOWED_DAYS` (`constants-keeper.ts:212-220`) hardcodes the
7-day array verbatim instead of importing the canonical `ALLOWED_DAYS`
(`allowed-days.values.ts:1-9`), which `user-profile.values.ts` already correctly reuses. 9 call
sites. **High.**~~

**RESOLVED (2026-08-12), corrected fix:** the user objected to `allowed-days.values.ts` existing
as its own 10-line file at all (project convention: only split into a dedicated file when there's
real variety/volume for one module, e.g. `user-group.values.ts`'s 77 lines — not for a single
7-item array). Literally merging it into `constants-keeper.ts` would have created a circular
import (`constants-keeper.ts` already imports `DateTimeHelper` from `date-time-helper.ts`, which
needs `ALLOWED_DAYS`). Fixed by moving `ALLOWED_DAYS` into `date-time-helper.ts` itself (which
already owned the `AllowedDay` type and used this exact array internally) — `constants-keeper.ts`
and `user-profile.values.ts` now both import it from there, `allowed-days.values.ts` is deleted.
`TEST_CONSTS.USER_PROFILE_ALLOWED_DAYS` now reads `[...ALLOWED_DAYS]` (spread into a mutable array
to avoid a readonly-tuple-vs-`string[]` mismatch, the same class of bug already seen elsewhere in
this file). `tsc --noEmit` clean.

~~**#65.** "Ensure directory exists" reimplemented independently 4+ times, including **4 times
within the same file** (`global-setup.ts:271-273,385-387,497-499,531-533`), plus
`resource-tracker.ts:18-23` (`ensureDirExists`), `group-helper.ts:32-36` (`ensureDir`), and 2 more
in `table-registry-helper.ts:253,468`. **High.**~~

**RESOLVED (2026-08-12):** canonical home chosen was `group-helper.ts`'s existing (now exported)
`ensureDir(dir)` — not a new file, and specifically **not** `resource-tracker.ts` or
`constants-keeper.ts`, because `resource-tracker.ts` imports `TableRegistryApiClient`, which
imports `group-helper.ts`; had the canonical function lived in `resource-tracker.ts` instead,
`group-helper.ts` importing it back would have closed a cycle
(`group-helper → resource-tracker → table-registry-api-client → group-helper`). Verified this
direction is safe: `group-helper.ts`'s own imports (`fs`, `path`, `constants-waiter.ts`) have no
path back to `resource-tracker.ts`, `global-setup.ts`, or `table-registry-helper.ts`.
`resource-tracker.ts`'s `ensureDirExists(filePath)` is now a 1-line wrapper
(`ensureDir(path.dirname(filePath))`); `global-setup.ts`'s 4 sites and `table-registry-helper.ts`'s
2 sites now import and call `ensureDir` directly. `tsc --noEmit` and `eslint` both clean on all 4
files.

~~**#66.** `global-setup.ts:34-71` (`waitForTableReady`) hand-rolls its own poll loop instead of the
generic `pollUntilReady` (`test-polling-helper.ts:20-45`) that Round 1's #15 extracted for exactly
this purpose. **Medium.**~~

**VERIFIED, NOT APPLIED (2026-08-12):** the suggested fix doesn't actually fit.
`pollUntilReady` takes a single static `intervalMs` and throws on timeout; `waitForTableReady`
needs a **graduated/adaptive interval** (`graduatedPollDelayMs(elapsed)`, to avoid hammering the
server every 1s across a up-to-450s cold-start wait) and returns a **boolean** (both call sites
treat "not ready" as an expected, handled outcome, not an exception). Forcing this onto
`pollUntilReady` as-is would either lose the graduated backoff (real risk: increased request rate
during exactly the scenario — pod cold start — this function exists to wait out gently) or require
widening `pollUntilReady`'s signature to accept a dynamic-interval function, which would touch
~12 other callers of a widely-shared utility for the sake of one call site. Per this project's
"verify the audit's suggested fix before applying it" rule, left as a documented exception rather
than forced — same category of judgment call as Round 1's #4 (`base-api-client.ts`'s own `delay`
copy, kept separate to avoid a different cycle).

~~**#67.** A generic "retry N times with delay" loop is reimplemented ~4 times with different
signatures: `withCleanupRetry` (`group-cleanup-helper.ts:24-43`),
`createAuthenticatedApiContextWithRetry`/`createUserAuthenticatedApiContextWithRetry`
(`test-polling-helper.ts:101-138`, near-identical bodies), `assertServiceReachable`'s inline loop
(`global-setup.ts:184-212`). **Medium-Low** — shapes differ enough that forcing one abstraction is
a judgment call.~~

**PARTIALLY RESOLVED (2026-08-12):** only the two truly byte-identical bodies
(`createAuthenticatedApiContextWithRetry`/`createUserAuthenticatedApiContextWithRetry`, same file)
were consolidated into a new private `retryContextCreation` helper in `test-polling-helper.ts`.
`withCleanupRetry` (numbered-attempt logging with a caller-supplied label) and
`assertServiceReachable`'s inline loop (different diagnostics) were left separate — genuinely
different enough in behavior/logging that forcing a shared abstraction would reduce clarity for no
real dedup gain, confirming the finding's own "judgment call" caveat. `tsc`/`eslint` clean.

### `api/system_core/`

~~**#68.** `performOp` and `performOperationAndWait` (`table-registry-helper.ts:867-902`) are
functionally identical (only the error text differs); importers have already diverged across
files. **High.**~~

**RESOLVED (2026-08-12):** `performOp` (the more general of the two — it already supported a
configurable `expectedStatus`) is now the sole implementation; `performOperationAndWait` is a
1-line wrapper (`performOp(client, projectionId, operation, payload, customHeaders, 200, waitMs)`).
Both names stayed exported rather than repointing every call site, matching the precedent already
set by #65's `ensureDirExists` wrapper: `performOp` is also imported by
`api/integration_chapter/tests/audit-fields-integration.spec.ts`, out of this pass's scope (owned
by a parallel agent) and must keep compiling unchanged. `tsc`/`eslint` clean.

~~**#69.** `new Promise(resolve => setTimeout(...))` hand-rolled 4 times in
`table-registry-helper.ts` (lines 883, 900, 943, 996) where `delay()` is already imported and used
6+ times in the same file. **High.**~~

**RESOLVED (2026-08-12):** all remaining hand-rolled `new Promise(resolve => setTimeout(...))`
sites (`performOp`, `performOperationAsUserWithRetry`, `performIntentWithRetry`) now use
`delay(...)`. One of the original 4 occurrences disappeared for free — it lived in
`performOperationAndWait`'s body, which #68 replaced with a call to `performOp`. `tsc`/`eslint`
clean.

~~**#70.** Idempotent-table-registration logic (create → already-exists → provision schema →
recreate) is duplicated between `createTableAndWait` and the loop in `createTablesAndWait`
(`table-registry-helper.ts:382-430`, `:562-613`); the `isAlreadyExists` predicate is copy-pasted
~4 times. **High.**~~

**RESOLVED (2026-08-12):** extracted `isAlreadyExistsError(status, text)` (the 409/400-with-message
predicate) and `registerTableIdempotently(client, payload)` (create → classify → if already
registered, check schema provisioning → if missing, delete stale metadata and retry) into shared
helpers. Both `createTableAndWait` and `createTablesAndWait`'s Phase 1 loop now call
`registerTableIdempotently` and branch only on its `{ status, alreadyExisted, schemaWasMissing }`
result for their own caller-specific follow-up (early-return/reassign for the single-table path;
`needsPodRestart` bookkeeping for the batch path) — verified against the original branch conditions
for every status combination (fresh 201, already-exists-and-provisioned,
already-exists-and-schema-missing, on both `attempt === 1` and `attempt > 1`) to confirm identical
behavior is preserved. `tsc`/`eslint` clean.

~~**#71.** `validation-engine-helper.ts:17-27` and `:138-146` — the same schema-readiness SQL query
duplicated twice **within the same file**. **High.**~~

**RESOLVED (2026-08-12):** `ensureVeTable`'s "freshly created" branch now calls the file's own
`isSchemaProvisioned()` inside a `pollUntilReady(...)` loop instead of hand-rolling a second
`while` loop with its own inline SQL and its own dbClient connect/disconnect. Side effect: this also
removed an empty, non-logging `catch { void 0; }` block that lived only inside the now-deleted loop.
Trade-off noted: `isSchemaProvisioned` opens/closes its own DB connection per poll attempt rather
than reusing one connection for the whole wait, matching how the "already exists" branch already
used it — accepted per the finding's explicit direction. `tsc`/`eslint` clean.

~~**#72.** `projection-forms-helper.ts:226-255` (`waitForProjectionDefinition`) hand-rolls a
`while(Date.now()...)` poll loop instead of `pollUntilReady`. This function predates `c0343581`
and was missed by Round 1's sweep. **High.**~~

**RESOLVED (2026-08-12):** rewrote `waitForProjectionDefinition` on top of `pollUntilReady`,
folding the status/body tracking into the check function's `diagnostic` return value. `tsc`/`eslint`
clean.

~~**#73.** `ddd-test-helper.ts:131-146` (`provisionFieldsAndSchema`) duplicates the existing
`waitForTableField` (`test-polling-helper.ts:224`, used 12+ places elsewhere), differing only in
timeout/interval. **High.**~~

**RESOLVED (2026-08-12):** replaced the hand-rolled loop with
`await waitForTableField(setupTableClient, tableId, targetPropertyToWaitFor, 30000)`. `tsc`/`eslint`
clean.

~~**#74.** `SystemCoreProjectionHelper`'s constructor requires `{baseUrl}`, and ~30 instantiation
sites all repeat `{ baseUrl: process.env.BASE_URL }` — unnecessary, since the API context already
carries a `baseURL` and `SYS_CORE_API_PATHS` paths are relative.
`listAvailableTables`/`listAvailableGroups`/`updateTableDefinition` manually build absolute URLs
as a result. **High** — single fix removes boilerplate at all 30 sites.~~

**RESOLVED (2026-08-12):** the 3 methods now call `this.client.get`/`.put` with the relative
`SYS_CORE_API_PATHS` path directly (removing the `if (!this.baseUrl) throw` guards and the
`${this.baseUrl}/...` string concatenation); the now-unused `normalizeHttpUrl` import and
`baseUrl` field were removed. The constructor still *accepts* `options.baseUrl` (typed but ignored,
suppressed with a one-line `eslint-disable-next-line no-unused-vars`) purely for source
compatibility with `api/integration_chapter/tests/audit-fields-integration.spec.ts` (4 call sites,
out of this pass's scope) — removing the parameter type entirely would have broken that file's
compile. Within scope, all 26 `system_core/tests/*.spec.ts` instantiation sites (24 mechanical +
2 folded into #77's shared fixture) were repointed to drop the now-pointless
`{ baseUrl: process.env.BASE_URL }` argument. `tsc`/`eslint` clean.

~~**#75.** `createUnauthenticatedContext`/`NO_TOKEN_HEADERS`/`INVALID_TOKEN_HEADERS` already exist in
`user-group-helper.ts:349-361` (8 uses) but are reimplemented inline in
`validation-engine-smoke.spec.ts:318-321` and twice in `user-profile-api-regression.spec.ts:
597-600,627-633`. **High.**~~

**RESOLVED (2026-08-12):** all 3 inline `playwright.request.newContext({ baseURL: ...,
extraHTTPHeaders: ... })` call sites now call `createUnauthenticatedContext(playwright.request,
extraHTTPHeaders, NO_TOKEN_HEADERS | INVALID_TOKEN_HEADERS)` instead, confirmed byte-for-byte
equivalent to what each inline call built. `user-profile-api-regression.spec.ts`'s now-unused
`HeaderName` import was removed. `tsc`/`eslint` clean.

~~**#76.** The inline `errorBody.detail ?? .message ?? .error ?? ''` chain (instead of
`extractErrorMessage`, itself fixed by Round 1's #9, but that sweep never reached `tests/`) recurs
at 6 sites: `validation-engine-regression.spec.ts:109,133,178,206`,
`table-registry-smoke.spec.ts:169`, `customization-smoke.spec.ts:362`. **High.**~~

**RESOLVED (2026-08-12):** all 6 sites now call `extractErrorMessage(errorBody)`.
`customization-smoke.spec.ts` already imported it for two other sites in the same file; the
remaining two files needed the import added. `tsc`/`eslint` clean.

~~**#77.** `validation-engine-smoke.spec.ts` and `validation-engine-regression.spec.ts` share a
byte-identical ~40-line `Fixtures`/`test.extend` block plus `beforeAll`/`afterAll` pair.
**Medium-High.**~~

**RESOLVED (2026-08-12):** extracted the shared `Fixtures` type, `test.extend(...)` block, and the
`ensureVeTable`/cleanup pair into a new `api/system_core/helpers/validation-engine-fixtures.ts`
(exports `test`, `ensureVeTableForSuite`, `cleanupVeTableForSuite`) — justified as a real shared
fixture for 2 spec files, not a trivial constant, per the project's "don't split out tiny files"
convention. Each spec file keeps its own `veResult` closure variable (can't be module-level shared
state across two independently-run spec files) and now just calls
`ensureVeTableForSuite(authenticatedApiContext)` / `cleanupVeTableForSuite(veResult)`. Also applied
#74's constructor simplification inside the new fixture file. `tsc`/`eslint` clean.

### `api/fin_accounting/` (all new code, post-Round-1)

~~**#78.** Two independent implementations of "pull `setOfEntriesId` out of the POST response":
`entryData.setOfEntriesId` (`entry-generation-helper.ts:306-307`) vs. `extractSetOfEntriesId`
(`:418-422`), with different fallback logic. Smoke spec uses one, regression spec the other.
**High.**~~

**RESOLVED (2026-08-12):** `entryData.setOfEntriesId` deleted; every call site (smoke spec TC-001,
TC-012, TC-042, TC-072, plus the new shared seed helper) now uses the more robust
`extractSetOfEntriesId` (broader fallback chain: `entries[0]` → `setOfEntriesId` → snake_case →
`id`). `tsc`/`eslint` clean.

~~**#79.** `entry-generation-smoke.spec.ts:41-55` (`seedOriginalTransaction`) and
`entry-generation-regression.spec.ts:108-127` (`postAndTrackEntries`) each hand-roll their own
"POST, extract id, assert, track" wrapper instead of sharing one — compounds #78 since each uses a
different id-extractor. **High.**~~

**RESOLVED (2026-08-12):** extracted a shared `postEntriesAndExtractSetId(client, payload, headers?,
label?)` into `entry-generation-helper.ts` (POST → read text → assert 201 → parse → extract id via
`extractSetOfEntriesId` → assert truthy → throw if missing). Both specs' wrappers now delegate to it
— the regression spec's `postAndTrackEntries` additionally pushes the id into `createdRefs` for
cleanup (kept local, since that's genuinely spec-specific state), the smoke spec's
`seedOriginalTransaction` just returns `{txnRef, setId}` (it never tracked cleanup refs to begin
with, so that behavior is preserved unchanged — smoke intentionally posts without an idempotency
header, which the shared helper's optional `headers` param preserves). `tsc`/`eslint` clean.

~~**#80.** `REVERSAL_FIELDS_INTERNAL` (built from `EG_VALUES.FIELD.*`, `entry-generation-helper.ts:
280-284`) and `REVERSAL_FIELDS` (raw string literals, `:475`) maintain the same 3 field names two
different ways in the same file. **High.**~~

**RESOLVED (2026-08-12):** unified into a single exported `REVERSAL_FIELDS` built from
`EG_VALUES.FIELD.*`, declared once near its first use; `financialFingerprint`/`reversalFingerprint`
now filter via `(REVERSAL_FIELDS as readonly string[]).includes(key)`, matching the cast style
already used elsewhere in the same file. `tsc`/`eslint` clean.

~~**#81.** `posting-detail-seed-helper.ts` (new file) duplicates `entry-generation-helper.ts`'s
`postingDetail.ensureProfiles` pattern: reimplements the existence check as raw SQL instead of the
already-shared `DB_QUERIES.ENTRY_GENERATION.EXISTS_BY_ID`, hardcodes literal schema/space strings
instead of `EG_VALUES.DB.*`, and uses a locally-hardcoded projection id `'POSTING.DETAIL~BASIC'`
that doesn't match the sibling helper's `EG_VALUES.POSTING_DETAIL_PROJECTION_ID = 'POSTING.DETAIL'`
— **needs verification (not via guessing) whether these are genuinely different projections or a
naming-drift bug.** **High.**~~

**RESOLVED (2026-08-12):** verified via the Bruno collection
(`C:\Users\user\BrunoApi\proj-bruno-api\collections\Tables\Entry Generation\POSTING.DETAIL\`) —
`Create POSTING.DETAIL table.yml` registers table id `POSTING.DETAIL`; the live (non-example)
request in `Create POSTING.DETAIL~BASIC Projection.yml` and in `Posting Engine/Create POSTING.DETAIL
values.yml` (its `projectionId` path param) both target projection id `POSTING.DETAIL~BASIC`. All 3
sibling Entry Generation tables (`EG.JOURNAL.ENTRY`, `EG.SET.OF.ENTRIES`, `EG.TRANSACTION.REVERSAL`)
follow the identical `<TABLE>` → `<TABLE>~BASIC` convention, and the seed doc's own prose says "The
record is written through the `POSTING.DETAIL~BASIC` projection." The three bare-`POSTING.DETAIL`
URLs only appear in that Bruno file's stale saved `examples:` block, not its live request — **this
is naming-drift, not two legitimate projections.** Fixed by correcting
`EG_VALUES.POSTING_DETAIL_PROJECTION_ID` to `'POSTING.DETAIL~BASIC'` (the sibling helper's value was
the bug, not `posting-detail-seed-helper.ts`'s local constant). Consolidated together with #94/#107
below: `posting-detail-seed-helper.ts` no longer hardcodes its own projection id, raw SQL, or a
parallel seeding loop — it now delegates entirely to `entry-generation-helper.ts`'s
`postingDetail.ensureProfiles` (which already used `DB_QUERIES.ENTRY_GENERATION.EXISTS_BY_ID` and
`EG_VALUES.DB.*` correctly). `tsc`/`eslint` clean.

~~**#82.** `waitForSetOfEntriesRow` (`entry-generation-helper.ts:453-464`) hardcodes `timeout: 10_000`
instead of the shared `EG_LEDGER_POLL_TIMEOUT_MS`/`EG_LEDGER_POLL_INTERVALS_MS` every sibling call
site uses for the same condition. **High.**~~

**RESOLVED (2026-08-12):** now imports and uses `EG_LEDGER_POLL_TIMEOUT_MS`/
`EG_LEDGER_POLL_INTERVALS_MS` from `constants-waiter.ts`, matching every sibling `expect.poll` call
in the same file. `tsc`/`eslint` clean.

~~**#83.** `EntryGenerationDbHelper.clean()`/`searchRowsFuzzy`/`searchJournalEntryRowsFuzzy`
(`entry-generation-helper.ts:163-277`) hand-roll raw SQL while the same class's other methods
correctly use `DB_QUERIES.ENTRY_GENERATION.*` — a fresh recurrence, in brand-new code, of the exact
anti-pattern Round 1's #48 already fixed once elsewhere. **High.**~~

**RESOLVED (2026-08-12):** added `FUZZY_ROWS`, `FUZZY_JOURNAL_LEGS_BY_TYPE`, `FUZZY_DELETE`, and
`IDEMPOTENCY_DELETE_BY_TXN_REFS` to `DB_QUERIES.ENTRY_GENERATION` (`db-query-keeper.ts`), matching
the file's existing template-function style; `searchRowsFuzzy`, `searchJournalEntryRowsFuzzy`, and
`clean()` now call these instead of building SQL strings inline. `tsc`/`eslint` clean.

~~**#84.** `api/integration_chapter/tests/sys-params.spec.ts` (6 sites: lines 54-56, 74-77, 127-130,
150-153, 179-182, 209-210) hand-rolls raw SQL against `system_parameter.liv` that is functionally
identical to the existing, currently-unused `DB_QUERIES.SYSTEM_PARAMETER.SELECT/INSERT/DELETE`
(`db-query-keeper.ts:107-116`). **High.**~~

**RESOLVED (2026-08-12):** the `beforeAll` SELECT/INSERT and TC-01's two "row exists" checks (all
against the fixed id `'SYSTEM'`) now use `DB_QUERIES.SYSTEM_PARAMETER.SELECT(TableSpace.LIV)`/
`INSERT(TableSpace.LIV)`. TC-02's check uses a different, arbitrary id (`'NOT_SYSTEM'`), which
`SYSTEM_PARAMETER.SELECT` can't express (it hardcodes `id = 'SYSTEM'`), so that site uses
`DB_QUERIES.GENERIC.SELECT_BY_ID(schema, 'liv')` instead — still eliminates the inline SQL, just via
the more general escape-hatch query already designed for arbitrary-id lookups. TC-03's "no id
filter, verify singleton" query (`SELECT id FROM system_parameter.liv`) had no existing counterpart
that preserves its whole-table-singleton semantics (switching to `SYSTEM_PARAMETER.SELECT` would
silently weaken the assertion to only check the `id='SYSTEM'` row, not that no other row exists) —
added a new `DB_QUERIES.SYSTEM_PARAMETER.SELECT_ALL_IDS(space)` query for it, mirroring the existing
`TABLE_REGISTRY.ALL_TABLE_IDS` pattern. `tsc`/`eslint` clean.

~~**#85.** `audit-fields-integration.spec.ts` — ~30 raw `SELECT`/`DELETE ... WHERE id = $1`
statements structurally identical to the existing `DB_QUERIES.GENERIC.SELECT_BY_ID`/`DELETE_BY_ID`
(`db-query-keeper.ts:145-148`), never called. **High.**~~

**RESOLVED (2026-08-12):** mechanically replaced all 15 `SELECT * FROM ${schema}.${space} WHERE id =
$1` and 13 `DELETE FROM ${schema}.${space} WHERE id = $1` occurrences with
`DB_QUERIES.GENERIC.SELECT_BY_ID`/`DELETE_BY_ID`. The 2 `... WHERE id = $1 ORDER BY seq_no` reads
(TC-4's HIS-version checks) needed a new `DB_QUERIES.GENERIC.SELECT_BY_ID_ORDERED(schema, table,
orderColumn)` variant, added alongside the existing two. The diagnostic-only schema-discovery query
(`SELECT schema_name ... LIKE '%${runGroupId}%'`) now uses the existing
`DB_QUERIES.SCHEMA.MATCHING_ILIKE()` (a safe `LIKE`→`ILIKE` widening). Left as-is, deliberately: the
per-schema diagnostic loop's `SELECT * FROM "${schema}"."${space}" WHERE id = $1` — it quotes
identifiers because `schema`/`space` come from a live discovery loop over arbitrary matched schema
names, and `GENERIC.SELECT_BY_ID` doesn't quote; forcing it through the generic helper would drop
that protection for a diagnostic-only code path. `tsc`/`eslint` clean.

~~**#86.** `sms-system-core.spec.ts` TC-22/TC-23 (~lines 798-811, 892-905) each inline-reimplement
`extractErrorMessage`'s fallback chain instead of importing it (used correctly two files over in
`customization-integration.spec.ts:605`). **High.**~~

**RESOLVED (2026-08-12):** both sites now call `extractErrorMessage(errorBody)` (imported from
`response-parser.ts`), falling back to the raw response text only when the extracted message is
empty (`extractErrorMessage(errorBody) || RESPONSE_TEXT`) — preserves the original's exact
last-resort behavior while removing the duplicated `??` chain. `tsc`/`eslint` clean.

**#87.** The `IDENTIFIER_GENERATION` policy-rule shape is hand-rolled inline ≥6 times
(`sys-params.spec.ts` TC-04/05/07/08, `customization-integration.spec.ts` TC-06/07) instead of
extending `buildPolicyRule`/`buildSequentialPolicyPayload`/etc. (`payload-builder.ts:488-537`).
**Medium.** **LEFT OPEN (2026-08-12):** `payload-builder.ts:488-537` falls in the line range owned
by a parallel agent working the same file in this pass (lines 1-1075) — out of my permitted edit
section (1076-2009). Fixing the call sites without extending the builder would just relocate the
duplication; extending the builder itself would conflict with the parallel agent's concurrent edits.
Recommend the owning agent (or a follow-up pass) add an `IDENTIFIER_GENERATION`-shaped helper next
to `buildPolicyRule` and repoint both spec files' 6 inline occurrences to it.

~~**#88.** `pf-sc-sms.spec.ts:66` hardcodes `'pf_type_mock'`/`'pf_type_mock_1'` — a fresh, unaudited
occurrence of the company-schema-suffix pattern Round 1's #2 already centralized into
`COMPANY_SCHEMA_SUFFIXES`; this call site wasn't in that fix's list. **Medium.**~~

**RESOLVED (2026-08-12):** replaced the two literals with
`COMPANY_SCHEMA_SUFFIXES.filter((suffix) => suffix.startsWith('_mock')).map((suffix) =>
\`pf_type${suffix}\`)`, reusing the centralized suffix list instead of a second hardcoded pair.
`tsc`/`eslint` clean.

### Types (`api/types/`) — corroborated independently by two agents

~~**#89.** `pf-smoke.types.ts` — **8 interfaces declared twice, byte-identical**, back-to-back in the
same file (same defect class as Round 1's #25, but a second, larger block that was missed):
`CustomerConditionData` (105-110/178-183), `OfficersConditionData` (112-117/185-190),
`SourceCalculationConditionData` (119-130/192-203), `ActionChargesConditionData` (132-141/205-214),
`ChargeConditionData` (143-147/216-220), `InterestConditionData` (149-157/222-230),
`BalanceAvailabilityConditionData` (159-163/232-236), `LimitConditionData` (165-171/238-244).
TypeScript interface-merges them silently (compiles clean since identical), but it's dead weight.
**High.** Fix: delete the second occurrence of each (lines 178-244).~~

**RESOLVED (2026-08-12):** deleted the second occurrence of all 8 interfaces; `AdditionalPartyRole`
(which sat between the two blocks) kept in place. `tsc --noEmit`/`eslint` clean.

~~**#90.** `product.types.ts:29-35` and `:46-52` — `ManagerPayload` declared twice, byte-identical,
14 real call sites. **High.**~~

**RESOLVED (2026-08-12):** superseded by #91's consolidation below — `ManagerPayload` no longer
exists at all (folded into `ManagerActionPayload`), so the duplicate went away with it rather than
being independently deduped.

~~**#91.** `PFApiClient` has 3 different methods hitting the same `PF_MANAGER.INPUT` endpoint with
inconsistent payload handling: `manageProduct` (routes through `toServerPayload`, a no-op per #26's
verdict), `manageProductWithExpiry` and `validateProduct` (post raw). Tests pick whichever
arbitrarily for the same logical operation. **Medium-High.**~~

**RESOLVED (2026-08-12):** collapsed to a single `manageProduct(payload: ManagerActionPayload)`
that posts raw (no `toServerPayload` call, per #26's no-op finding). `ManagerActionPayload`
(`product.types.ts`) gained an explicit optional `EXPIRY_DATE?: string` field so the same type
covers the former `ManagerActionExpiryPayload` use case. `manageProductWithExpiry` and
`validateProduct` deleted; all call sites repointed — `pf-core-regression.spec.ts`'s 2
`manageProductWithExpiry` calls and `product-attribute-classes-core-engine-smoke.spec.ts`'s 13
`validateProduct` calls now use `manageProduct`, with their `ManagerActionExpiryPayload`/
`ManagerPayload` type annotations changed to `ManagerActionPayload`. Left
`api/integration_chapter/tests/pf-sc-sms.spec.ts` untouched (out of this pass's scope) — it already
called `adminClient.manageProduct(... as unknown as ManagerActionPayload)`, so it needed no change
and continues to compile against the consolidated method. `tsc --noEmit`/`eslint` clean.

### `test-data/`

~~**#92.** `payload-builder.ts:608-611` (`toProjectionName`) and `:617-620`
(`toProjectionUiText`) are byte-identical functions, called from different sites. **High.**~~

**RESOLVED (2026-08-12):** deleted `toProjectionUiText`; its 5 call sites in
`buildFldCustomizationProjectionPayload`/`buildFldCustomizationProjectionUpdatePayload` now call
`toProjectionName` instead (byte-identical bodies, so behavior is unchanged). `tsc --noEmit`/
`eslint` clean.

~~**#93.** `buildJournalFootprintPayload` (`:1128-1139`) and `buildNarrativeFootprintPayload`
(`:1409-1454`) hardcode the same envelope that the file's own `buildJournalFootprint` helper
(`:1456-1468`) exists to centralize — every other Entry Generation builder in the file correctly
delegates to it; these two don't. **High.**~~

**RESOLVED (2026-08-12):** both now delegate to the private `buildJournalFootprint(transactionReference,
legs, overrides?)` helper — `buildJournalFootprintPayload` passes `defaultLegs()`,
`buildNarrativeFootprintPayload` passes its 3-leg narrative array. `tsc`/`eslint` clean.

~~**#94.** `NARRATIVE_POSTING_DETAIL_PROFILES` (`payload-builder.ts:1188-1402`) duplicates 3 records
byte-for-byte (`LOAN_DISB_NARR`, `LOAN_FEE_NARR`, `NOSTRO_SETTLE_NARR`) with
`posting-detail-seed-helper.ts`'s `NARRATIVE_ENRICHMENT_POSTING_DETAIL_RECORDS` — cross-references
#81; editing one silently desyncs the other. **Medium-High.**~~

**RESOLVED (2026-08-12):** resolved together with #81/#107. `posting-detail-seed-helper.ts`'s
21-record superset (it had 24 records total vs. `NARRATIVE_POSTING_DETAIL_PROFILES`'s 3) was the
more complete side, so `payload-builder.ts`'s `NARRATIVE_POSTING_DETAIL_PROFILES` is now the single
source of truth, extended to all 24 records (`PRIO_P1..P4`, `PRIO_N2..N4`, `NAR_w`, `NAR_ww`,
`STATIC_NARR`, `PAYLOAD_NARR_AL`, `PAYLOAD_NARR_AL_2`, `TEST_NAT_AL`, `TEST_NAR_PL`, `TEST_MISS`,
`TEST_MISS_2`, `EXACT_LEN_NARR`, `TRUNC_STATIC_NARR_2/3`, `HARD_TRUNC_NARR`, `PD_5`), generated
programmatically from the original JSON blob to avoid transcription errors and diffed against the
source to confirm byte-for-byte field parity. `posting-detail-seed-helper.ts` now imports this array
instead of carrying its own copy. `tsc`/`eslint` clean.

~~**#95.** `buildCreateGroupPayload` (11 call sites) and `buildCreateGroupPayloadWithName` (1 call
site) build the identical `CreateGroupPayload` defaults via two different override mechanics — one
type-safe, one using a `delete payload.replicaCount` hack. **Medium.**~~

**RESOLVED (2026-08-12):** rather than repointing the single `WithName` call site (it lives in
`api/integration_chapter/tests/sms-system-core.spec.ts`, out of this pass's scope and already being
edited by a parallel agent), fixed the duplication at the source: `buildCreateGroupPayloadWithName`
is now a 1-line delegate — `buildCreateGroupPayload({ name, ...overrides })` — instead of
re-implementing the defaults. The `delete payload.replicaCount`/`delete payload.environmentVariables`
hack in `buildCreateGroupPayload` is gone from the picture entirely, since it's no longer duplicated
anywhere. Verified behavior-preserving for the one real call
(`buildCreateGroupPayloadWithName(GROUP_NAME)`, no overrides passed) — with overrides that include a
*partial* `deploymentProperties`, the two builders' merge strategies do differ (deep-merge vs.
full-replace), but that call site passes none, so this doesn't apply here. `tsc --noEmit`/`eslint`
clean; `sms-system-core.spec.ts` needed zero edits.

**#96.** `payload-builder.ts`'s `buildAssembleAssociatedProjectionPayload`/etc. (686-744) and
`payload-builder-projection-forms.ts`'s `buildDetailsProjectionPayload`/etc. (941-988) both
independently implement "build a Details sub-projection, wrap into `associations: [...]`" — not
byte-identical (different field naming), so not a mechanical merge, but the same shape reinvented.
**Medium.**

**LEFT OPEN (2026-08-12):** evaluated and deliberately not merged. The two builders differ in more
than naming: `~INPUT.DETAILS` vs. `~DETAILS` id suffixes (both plausibly tied to real seeded
projection ids on the server), single- vs. dual-language `name` payloads (`{'en-GB', 'fr-FR'}` vs.
`{[LANGUAGE_ID.DEFAULT]}`), and a caller-parameterized field (`TableDefinitionSeedOptions`-driven)
vs. a hardcoded `FLD1` field. Forcing a shared abstraction would mean threading enough parameters
through both call sites that the "shared" builder becomes a thin pass-through with two different
config shapes at the call site anyway — no real dedup gain, real risk of subtly changing either
projection's id/name/schema shape against a live CBS instance. Left as two intentionally separate
implementations per the finding's own "not a mechanical merge" caveat.

### `ui/`

~~**#97.** `dashboard-user.ts:59-64` reconstructs the exact auth-context options object that
`field-registry-setup.ts:47-56` already exports as `createFieldRegistryAuthContext()`. **High.**~~

**RESOLVED (2026-08-12):** renamed to `createUiAdminAuthContext` and moved to
`ui/utils/helpers/dashboard-user.ts` (it's the module that owns UI-admin/dashboard-user
provisioning); `provisionDashboardUser` now calls it instead of reassembling the options object.
`field-registry-setup.ts` and `field-registry.spec.ts` updated to import it from there instead of
defining/re-exporting their own copy. `tsc --noEmit`/`eslint` clean.

~~**#98.** `first-login-invalid-credentials.spec.ts:71` hardcodes
`{ storageState: undefined, extraHTTPHeaders: {} }` directly in a raw `browser.newContext()` call
even though the spec already imports from `anonymous-session-fixtures.ts` (built by Round 1's #32
to avoid exactly this) — needed here because raw `newContext()` bypasses the fixture. **Medium.**~~

**RESOLVED (2026-08-12):** exported `ANONYMOUS_BROWSER_CONTEXT_OPTIONS` (typed
`BrowserContextOptions`) from `anonymous-session-fixtures.ts`; the `test.extend` fixture and the
spec's raw `browser.newContext()` call now both read from this single constant instead of two
separate literals. `tsc --noEmit`/`eslint` clean.

~~**#99.** `field-registry-setup.ts:70-181` (`waitForTableDefinitionProperties`,
`updateTableDefinitionWhenWritable`) each hand-roll a `while` poll loop instead of `pollUntilReady`
— genuinely new instance, this file wasn't in Round 1's polling-consolidation scope. **Medium-High.**~~

**RESOLVED (2026-08-12):** `waitForTableDefinitionProperties` rewritten on top of `pollUntilReady`
(`api/utils/helpers/test-polling-helper.ts`) and moved into the new
`ui/utils/helpers/field-registry-table-helper.ts` (see #106). `updateTableDefinitionWhenWritable`
and `isRetryableTableDefinitionStatus` were left completely untouched byte-for-byte — those are
#100's retry-logic scope, owned by a parallel agent; `updateTableDefinitionWhenWritable`'s call
site (`await waitForTableDefinitionProperties(...)`) still resolves correctly since the function
name/signature didn't change, just its implementation and location. `tsc --noEmit`/`eslint` clean.

**#100.** `field-registry-setup.ts:39-45` (`isRetryableTableDefinitionStatus`) plus its manual
retry loop reimplement what `BaseApiClient`'s `isTransientClientError` hook exists for — same
anti-pattern as Round 1's #5, recurring in a UI file outside that pass's scope. **Medium**
(`TableRegistryApiClient`'s constructor doesn't currently forward this hook, so it's a small
base-class widening, not a one-liner).

**PARTIALLY RESOLVED (2026-08-12):** the safe, additive half is done —
`TableRegistryApiClient`'s constructor now accepts an optional `isTransientClientError` and
forwards it to `super()`, exactly like it already forwards `retries`/`delayMs`/`attachToAllure`
(pure widening, no existing caller passes it today, so behavior is unchanged; `tsc`/`eslint`
clean). **Left open, not forced:** repointing `field-registry-setup.ts`'s
`updateTableDefinitionWhenWritable` onto this hook. That loop does more than "retry N times" —
it uses a **graduated backoff** (`TABLE_DEFINITION_WRITE_INTERVALS_MS`, a different interval per
attempt) and, on 401 specifically, **disposes and recreates the whole authenticated context**
(`createShortRetryTableClient`) rather than refreshing a shared token in place.
`BaseApiClient.requestWithRetry`'s built-in retry only supports a single fixed `delayMs` and
already does its own in-place 401 token-refresh via the shared `overrideToken` cache — swapping in
the generic hook would either lose the graduated backoff (real risk: hammering a pod that's
mid-cold-start, the exact scenario this loop exists for) or require widening
`requestWithRetry`/`isTransientClientError`'s contract to support both retry strategies. Same
class of judgment call as #66's `graduatedPollDelayMs` exception — documented instead of forced.
`field-registry-setup.ts` is also the one file outside `api/system_core/` explicitly in this
pass's remit (coordinated with the parallel UI agent), so no other agent will pick this up either;
flagging for a follow-up pass rather than leaving it silently dropped.

### Cross-cutting client layer

~~**#101.** `postMultipart`/`putMultipart` (`base-api-client.ts:234-260`, new methods added for the
Allure feature) call `this.request.post`/`.put` directly, **bypassing `requestWithRetry`
entirely** — unlike every other verb method. A 401 during a plugin upload won't trigger
`refreshOverrideToken()`; a transient 5xx won't retry. Real consumer:
`plugin-manager-api-client.ts:33,39` (plugin JAR upload/update). Corroborated independently by two
agents. **High** confidence it's an inconsistency; confirm if intentional (multipart bodies can be
harder to safely retry) rather than assuming a bug.~~

**RESOLVED (2026-08-12):** both methods now route through `requestWithRetry` exactly like
`post`/`put`, gaining the same 401-refresh and transient-retry behavior; added an optional
`requestOptions: { retries?, delayMs? }` param for parity with `post`/`put`. Sole caller
(`plugin-manager-api-client.ts`) is unaffected — new param is optional. `tsc --noEmit` clean.

~~**#102.** `table-registry-api-client.ts:71,85,143` (`createTableNoRetry`, `updateTableNoRetry`,
`executeEnquiry`) still manually spread `this.authHeader` into headers, even though
`defaultHeaders` (the same object) is already merged automatically by `BaseApiClient.getHeaders` —
harmless no-op today, but vestigial boilerplate in the very client Round 1's #8 targeted.
**Medium.**~~

**RESOLVED (2026-08-12):** removed the redundant `this.authHeader` spread from all three call
sites — `createTableNoRetry`/`updateTableNoRetry` now pass `{}` for `customHeaders` (matching
`createTable`'s pattern), `executeEnquiry` uses `customHeaders` directly. `this.authHeader` field
itself is kept (still needed by `withSingleAttempt()` to construct a sibling instance).
`tsc --noEmit` clean.

---

## Tier 2 — Misplacement

~~**#103.** `FIELD_REGISTRY_UI_CONSTS` (CSS selectors like `.ant-table-row`, UI timeouts) lives in
the **API-side** `api/utils/constants/constants-keeper.ts:262-271`, with its only two consumers
both in `ui/`. Crosses the `ui/utils`/`api/utils` boundary Round 1 (TB-2799) established. **High.**~~

**RESOLVED (2026-08-12):** moved into the existing `ui/utils/constants/field-registry.values.ts`
(its only two real consumers — itself and `proj-field-registry-page.ts` — are both field-registry
files; no new file created, per project convention of not splitting out constants without enough
volume/variety to justify a dedicated file). `proj-field-registry-page.ts` now imports it from
there instead of `constants-keeper.ts`. `tsc --noEmit` shows the exact same pre-existing,
out-of-scope `ENUM_FIXED_VALUES` readonly-tuple error at its new line numbers — confirms the move
was behavior-preserving.

~~**#104.** `table-registry-helper.ts:1001-1024` (`getAliveTableId`) accepts `findExistingTableIds`
as a callback parameter, though it's the only implementation and every call site passes the same
import. **Medium.**~~

**RESOLVED (2026-08-12):** removed the callback parameter; `getAliveTableId` now imports
`findExistingTableIds` directly from `db-helper.ts` and calls it internally. Its sole caller,
`system-parameterization-smoke.spec.ts` (9 call sites), had the now-redundant `findExistingTableIds`
argument removed from each call (and the now-unused import dropped). `tsc`/`eslint` clean.

~~**#105.** UI-side types scattered instead of centralized in `ui/types/`: `DashboardTestUser`
(`dashboard-user.ts:15`), `LoginCredentials` (`login-flow.ts:5`), `ActiveUserCompany`
(`proj-table-registry-page.ts:8`, not even exported), `FieldRegistryPreconditions`
(`field-registry-setup.ts:23-30`). Mirrors the already-resolved API-side types centralization.
**Medium** — small colocated types are also a defensible style; judgment call.~~

**PARTIALLY RESOLVED (2026-08-12):** `FieldRegistryPreconditions` moved into
`ui/types/field-registry.types.ts` (it's field-registry domain and already had that file as a
natural home — this also fixed a backwards import, since that types file previously imported the
type *from* `field-registry-setup.ts`). `field-registry-setup.ts` and `ui-fixtures.ts` now import
it from there. Left `DashboardTestUser`, `LoginCredentials`, `ActiveUserCompany` colocated with
their owning modules by choice: each is defined and consumed together with the function(s) that
produce/use it in the same file (`DashboardTestUser` alongside `provisionDashboardUser`/
`withMaskedPassword`; `LoginCredentials` alongside `loginAndReachCompanySelection`;
`ActiveUserCompany` is private/unexported, used only inside its own class). `DashboardTestUser`
alone has 10+ consumer spec files importing it directly from `dashboard-user.ts` — relocating it
would mean editing every one of them for a purely organizational, non-functional change on a
finding explicitly marked "judgment call." Judged the colocated style defensible per the finding's
own caveat; `tsc --noEmit`/`eslint` clean either way.

~~**#106.** `field-registry-setup.ts` (353 lines) is nominally a "fixtures" file, but only 2 of its
exports are consumed by an actual `test.extend` fixture — the rest
(`waitForTableDefinitionProperties`, `updateTableDefinitionWhenWritable`,
`isRetryableTableDefinitionStatus`, `createShortRetryTableClient`, `previewBody`) is generic
polling/retry/orchestration logic belonging in `ui/utils/helpers/`, mirroring Round 1's already-
fixed #34/#35. **Medium.**~~

**RESOLVED (2026-08-12):** moved `previewBody`, `createShortRetryTableClient`, and
`waitForTableDefinitionProperties` (rewritten per #99) into a new
`ui/utils/helpers/field-registry-table-helper.ts`. Deliberately left `isRetryableTableDefinitionStatus`
and `updateTableDefinitionWhenWritable` in `field-registry-setup.ts`, untouched, since they're
#100's scope (owned by a parallel agent working the same file) — `field-registry-setup.ts` now
just imports the three relocated functions by name, so the reserved functions' call sites
(`createShortRetryTableClient(...)`, `previewBody(...)`, `waitForTableDefinitionProperties(...)`)
needed zero edits. `tsc --noEmit`/`eslint` clean.

~~**#107.** `posting-detail-seed-helper.ts:33-336` embeds a 300-line literal test-data JSON blob
inside `helpers/`, while the sibling data for the same feature correctly lives in
`test-data/payload-builder.ts`. Splitting it out would also make #94's duplication impossible to
miss. **Medium.**~~

**RESOLVED (2026-08-12):** resolved as one movement with #81/#94 (per the review's own recommendation
to do so). The 300-line JSON blob is gone from `helpers/`; its data now lives as the extended
`NARRATIVE_POSTING_DETAIL_PROFILES` in `test-data/payload-builder.ts`. `posting-detail-seed-helper.ts`
shrank from 367 lines to 18 — it now just opens a DB connection and calls
`entry-generation-helper.ts`'s `postingDetail.ensureProfiles(client, db,
NARRATIVE_POSTING_DETAIL_PROFILES)`, eliminating the parallel seeding-loop implementation entirely
(the actual #81 duplication fix). `tsc`/`eslint` clean.

~~**#108.** `omitNullKeys`/`expandRepeatNotation`/`expandItem` (`posting-detail-seed-helper.ts:14-31`)
are generic payload-transform utilities with no dependency on the surrounding DB-seeding logic.
**Low.**~~

**RESOLVED (2026-08-12):** moot after #107 — `posting-detail-seed-helper.ts` no longer has any
seeding-loop logic left to weigh these utilities against (the file is now 18 lines). Moved
`omitNullKeys`/`expandRepeatNotation` into `test-data/payload-builder.ts` next to
`buildPostingDetailPayload`, which now applies them internally (`profile.items.map(...)`) so every
consumer of `NARRATIVE_POSTING_DETAIL_PROFILES` — both the smoke test's 3-record subset and the
regression test's full 24-record set — gets the same null-omission/repeat-notation expansion
automatically, instead of the caller having to remember to apply it. No new file created. `tsc`/
`eslint` clean.

---

## Tier 3 — Complexity / inconsistency / SOLID in base & cleanup classes

### Oversized-file decomposition (the user's #4 ask, applied concretely)

**#109. `table-registry-helper.ts` (1342 lines) → split into 4 files:**
1. **`table-db-polling-helper.ts`** (~125 lines) — pure DB-polling: `checkTableSpacesReady`,
   `pollDatabaseForTableSpaces`, `checkRecordExists`, `pollDatabaseForRecord`, `checkSchemaExists`,
   `getActualDbSchema`, `getParsedData`.
2. **`table-creation-helper.ts`** (~600 lines, one connected "create table + wait + self-heal"
   concern): `TableNotRegisteredError`, `waitForTableApiReady`, the group-self-heal cluster,
   `createTableAndWait`, `createTablesAndWait`. ~16 importers — mechanical but broad repoint.
3. **`record-operation-helper.ts`** (~170 lines after dedup with #68): generic CRUD orchestration —
   `updateDefinitionAndWait`, `performInputAndWait`, the merged `performOperationAndWait`,
   `performOperationAsUserWithRetry`, `buildPayloadForProjection`, `performIntentWithRetry`.
4. **`four-eyes-helper.ts`** (~265 lines) — `setAuthRequired`, `enableFourEyesAuth`,
   `waitForMakerAuthorized`, `setupFinTableWithFourEyes`. Few importers, low risk.

**#110. `projection-helper.ts` (962 lines) → split into 2 files**, based on a confirmed
zero-overlap consumer split:
1. **Keep in `projection-helper.ts`** (~600 lines) — "projection bootstrap", used by 7 specs:
   `SystemCoreProjectionHelper` + `resolveTestProjection`.
2. **New `projection-runtime-fixtures-helper.ts`** (~260 lines) — used exclusively by
   `projection-forms-regression.spec.ts`: `extractProjectionList`, `findRuntimeProjection`,
   `fetchRuntimeProjection`, `provisionProjectionRuntimeFixtures`.

(Re-confirms Round 1's #49, which deliberately deferred this exact restructuring as out of scope
for a dedup-only pass — the user's current, broader ask is the right moment to act on it.)

**#111. `payload-builder.ts` (2009 lines) mixes 3 unrelated domains** — table-registry/PF/
system-core generics (1-596), projection/customization builders (607-1074), and Entry Generation
(1076-2009, **933 lines / 46% of the file**). The Entry Generation section's every export is
confirmed consumed exclusively by `api/fin_accounting/*`, already has its own types file
(`entry-generation.types.ts`) and helpers. **Recommend extracting to
`test-data/payload-builder-entry-generation.ts`**, matching the existing
`payload-builder-projection-forms.ts` naming convention. Low-risk since the module boundary is
already load-bearing. **High confidence this split is warranted.**

**#112. `entry-generation-regression.spec.ts` (3333 lines, the largest spec in the repo) has 3
clean natural seams** by its own `test.describe` blocks: US-06.01.01 Direct Postings (~2000
lines), US-06.01.02 Reversal (~700 lines), US-06.01.03 Narrative Enrichment (~500 lines, its own
scoped `beforeAll`). **Recommend splitting into 3 files** mirroring the already-separate
`entry-generation-smoke.spec.ts` — lets Playwright parallelize across workers and shrinks
per-file review/diff surface. Apply together with #113 below to shrink the Direct-Postings file
further before/while splitting.

**#113. ~15 tests in `entry-generation-regression.spec.ts` (TC-015–TC-041, TC-061–TC-064) share an
identical rejection-runner body** pasted into every `runScenarios(...)` callback (build payload →
POST with fresh idempotency key → assert 400 → validate error → assert no ledger rows). Only the
scenario table and 1-2 assertion params vary. **Single highest-value simplification found in this
round** — a shared `runRejectionScenarios(...)` helper next to the existing `runScenarios` would
collapse an estimated 400-600 duplicated lines. **High.**

### Other base/cleanup-class and inconsistency findings

**#114.** `BaseApiClient`'s per-verb Allure wiring is repeated 7 times (`post/get/delete/put/
patch/postMultipart/putMultipart` each open with the same `withAllureAttachment(...)` call). The
underlying masking/formatting logic is correctly delegated to `allure-exchange-reporter.ts` (a
well-designed, correctly-placed file) — this is wiring repetition, not an SRP violation. **Medium**,
optional: a private `execute(method, endpoint, payload, fn)` wrapper would cut ~15 lines.

**#115.** `db-helper.ts:221-223` (`isTestOwnedSchema`) is a trivial single-caller pass-through
around `isTestOwnedName`. **Low**, cosmetic. (Note: the rest of `db-helper.ts` — the "cleanup
class" specifically called out for scrutiny — was found reasonably decomposed; no other DRY/SOLID
violation found there.)

**#116.** `API_CLIENT_DEFAULTS` defaults every `BaseApiClient`-derived client to **80 retries ×
3000ms delay** — up to ~240s tail latency per call, applied blanket across ~20 clients. Predates
this branch (from TB-2799), not a regression, but never previously surfaced as its own finding.
**Medium** — plausibly deliberate for pod cold-starts, but worth confirming this blanket default
(vs. a scoped override like `sys-core-api-client.ts`'s `ensureProjectionExists` already uses) is
intended everywhere, since a genuine 500 anywhere else now takes 4 minutes to fail instead of
failing fast. Architecture-adjacent — see also #124.

**#117.** `global-setup.ts` (566 lines) mixes bootstrap-table creation, group reuse/self-heal,
Liquibase lock release, SYSTEM-parameter seeding, and service-reachability probing with no helper
extraction — same oversized-multi-concern pattern as #109/#110. **Low** / observational —
consistent with Round 1's own cost/benefit reasoning for #49, not recommending action at this
time given the volume of other work already identified.

**#118.** `attachToAllure` is only exposed on `TableRegistryApiClient`'s constructor options type,
though `BaseApiClient` supports it universally — other clients (`SysCoreApiClient`,
`UserGroupApiClient`, `UserProfileApiClient`, `FieldDefinitionApiClient`, `PFApiClient`) don't
accept an options object at all, and `PluginManagerApiClient` doesn't type it through either. Not
a bug today, but a trap for the next non-test-context caller of these clients. **Medium.**

**#119.** `AntdVirtualizedDropdown` — 6 of 9 methods are called only from within the class itself
(confirmed by repo-wide grep); over-broad public surface. **High**, mechanical fix (mark `private`).

**#120.** Fragile structural CSS selectors (`.ant-table-row`/`.ant-table-cell`, via
`FIELD_REGISTRY_UI_CONSTS`) target AntD's internal DOM classes rather than `getByTestId`/
`getByRole`, unlike every other locator in the same page object. Unlike the virtualized dropdown
(confirmed necessary per Round 1's #53), there's no structural reason this can't use a
`data-testid`. **Medium-High.**

**#121.** Timeout magic numbers bypass the centralized `constants-waiter.ts` convention at 4 sites:
`proj-login-page.ts:25,39`, `proj-select-company-page.ts:19`, `keycloak-update-password-page.ts:19`.
**Medium.**

**#122.** Redundant locator aliases in `CbsCreateFieldModalPage` (`modalContent = this.modal`,
etc.) exist only to give a lookup `Record` uniform-looking keys. **Low**, stylistic.

**#123.** `KeycloakUpdatePasswordPage`'s granular methods (`fillNewPassword`/`fillConfirmPassword`/
`submit`) are public but only ever called from within the class's own `changePassword`. **Low** —
not dead, just unused-as-public-API today.

**#124.** Bare numeric HTTP-status literals (`.toBe(200)`, `.toBe(403)`, etc.) throughout
`sms-system-core.spec.ts` (23x) and `pf-sc-sms.spec.ts` (32x) — neither imports `HTTP_STATUS`,
unlike every sibling integration spec. Same anti-pattern Round 1's #7 already fixed once in a
client file. **Medium.**

**#125.** Several silent `catch { /* ignore */ }` blocks in `audit-fields-integration.spec.ts`
(lines ~294-296, 484-486, 501-503) swallow cleanup/diagnostic errors with **no logging** —
directly against this project's own no-empty-catch-blocks convention (every catch must
console.debug/warn/error or rethrow). Inconsistent with `entry-generation-helper.ts`'s `clean()`,
which always `console.warn`s in the same feature area. **Medium**, straightforward fix.

**#126.** Inconsistent builder style within `payload-builder.ts` — most reference-data builders
delegate to the file's own `buildRecordInputPayload(recordId, {...})`, but ~10 user/group/rule
builders hand-roll the `{recordId, data: {...}}` literal instead. **Low**, style-only.

**#127.** Fixture naming drift: the identical `TableRegistryApiClient` fixture is named
`tableRegistryClient` in `system-param-regression.spec.ts:58-65` and `registryClient` in
`system-parameterization-smoke.spec.ts:32-39`. **High** confidence, name-only fix.

**#128.** `audit()` helper is defined locally in `audit-fields-regression.spec.ts:24-26` (90 uses)
while its sibling `audit-fields-smoke.spec.ts` uses raw property access 84 times instead of the
purpose-built `audit-fields-helper.ts`. **Medium-High.**

**#129.** Minor cleanup: `console.log` debug remnants in `validation-engine-smoke.spec.ts:104,147`
(and others), one empty no-op `test.beforeEach(() => {})` at `:61`. **Low priority**, trivial to
remove.

---

## Tier 4 — Dead code (confirmed zero consumers repo-wide)

~~**#130.** `parseRecords<T>` (`response-parser.ts:70-82`) — zero callers. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero callers repo-wide, deleted.

~~**#131.** `pollDatabaseForColumn` + private `checkColumnExists` (`table-registry-helper.ts:713-754`)
— zero importers. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero importers repo-wide, deleted both.

~~**#132.** `pollDuplicateRegistryForSourceRef` (`table-registry-helper.ts:789-808`) — zero
importers. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero importers repo-wide, deleted.

~~**#133.** `getTableRegistryGroups` (`table-registry-helper.ts:863-865`) — zero importers. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero importers repo-wide, deleted (its now-unused
`APIResponse` import was also removed).

~~**#134.** Five dead exports in `auto-id-helper.ts`: `buildAutoIdPolicyRuleWithoutStrategy` (446),
`buildEditFinNewLeadCompanyRule` (530), `inputTableRecordIntent` (725, not the used
`inputTableRecordIntentNoRetry`), `buildEditableFinAutoIdRule` (460, superseded by
`buildEditableFinAutoIdRuleWithResult`), `buildEditableIntAutoIdRule` (545). **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero importers repo-wide for all five, deleted. Their
dependents (`parseGeneratedRecordInputResult`, `GeneratedRecordInputResult`,
`inputTableRecordIntentNoRetry`) all still have real remaining callers, so nothing else went dead
as a result.

~~**#135.** `extractProjectionList`/`findRuntimeProjection`/`toProjectionTablePrefix`/
`getProjectionTableId` in `projection-helper.ts` are marked `export` but used only internally —
not dead, but unnecessarily public. **Low.**~~

**RESOLVED (2026-08-12):** re-confirmed zero external importers repo-wide for all four, dropped
`export` on each (now file-private). `tsc`/`eslint` clean.

~~**#136.** `CbsCreateFieldModalPage.getRelatedTableOptionLabels()` — zero callers. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero callers repo-wide, deleted.

**#137.** `FieldRegistryPreconditions.sourceTableId` is computed/cleaned up but never read by any
consuming test. **Medium** — confirm before removing; may be reserved for an unwritten test.

**LEFT OPEN (2026-08-12):** re-confirmed zero reads repo-wide (only produced in
`field-registry-setup.ts` and passed through `cleanup`). Left as-is per the finding's own caveat —
it's the source table backing the LinkedTable/Join precondition fields, plausible a not-yet-written
test would want to reference it directly; deleting a precondition field is harder to justify than
leaving an unused one.

**#138.** `CreateFieldScenario.description` (all 8 entries in `field-registry.values.ts`) is
populated but never read — tests use `scenario.typeLabel` instead. **Medium.**

**REVERTED (2026-08-12):** initially removed (re-confirmed zero *programmatic* reads), then
restored on user review — this field is human-readable documentation for each test scenario, not
dead logic; "never read by code" isn't the right bar for a field whose entire purpose is to be
read by a person scanning `CREATE_FIELD_SCENARIOS`. `typeLabel` alone doesn't convey the same
information. Left in place with its original values; not treated as a Tier 4 finding going
forward.

~~**#139.** `CbsLoginPage.LOGIN_URL`/`CbsTableRegistryPage.TABLE_REGISTRY_URL` exported but only used
as their own method's internal default — no external importer. **Low**, may be deliberate
future-facing API.~~

**RESOLVED (2026-08-12):** re-confirmed zero external importers repo-wide, dropped `export` on
both (now file-private consts, `goto()`'s own default parameter still works identically).
`TABLE_REGISTRY_URL_PATTERN`/`USER_COMPANY_STORAGE_KEY` in the same file have real external
consumers and were left exported.

~~**#140.** `table-registry.types.ts`: `RecordResponse` (107-115), `GetAllTablesResponse` +
file-private `TableWithGroup`/`TableGroup` (125-136, 165-167), `IntentResponse` (185-188) — zero
consumers repo-wide. **High.**~~

**RESOLVED (2026-08-12):** re-confirmed zero consumers repo-wide for all of `RecordResponse`,
`GetAllTablesResponse`, `TableWithGroup`, `TableGroup`, and `IntentResponse`; deleted all five.
`tsc --noEmit`/`eslint` clean.

---

## Tier 5 — Architecture: reducing test-execution load (the user's #5 ask)

### Parallelization

**#141. [Highest-leverage, structural]** `API_TESTS_MAX_WORKERS = 1`
(`api-client.constants.ts:9`) hard-locks the entire `API-tests` Playwright project to a single
worker. Root cause: the Keycloak override-token cache (`overrideToken`/`inFlightRefresh`
module-level vars in `base-api-client.ts:17-27`) is process-local — >1 worker would race/duplicate
refreshes. **This is correct and still necessary today** — all 43 API spec files run serially
regardless of `fullyParallel: true`. Raising it safely needs either a cross-process token cache
(file/lockfile-based) or moving the token fetch into a shared Playwright global-setup fixture.
Confirmed this is the same mechanism behind the previously-fixed "fullyParallel reruns beforeAll"
issue and it remains correctly configured — **not a regression**, but the single biggest lever for
cutting API-suite wall-clock time if ever revisited.

**#142.** `playwright.config.ts:34`'s `workers: process.env.CI ? 1 : undefined` is a **global**
default that also governs `UI-Chromium`, which has no override — UI tests have no comparable
shared-mutable-state reason to run single-worker on CI (the one worker-scoped fixture,
`fieldRegistryPreconditions`, is itself safe under multiple workers). **Medium**, recommend an
independent `workers` override on the `UI-Chromium` project.

**#143.** Double-layered retry compounding: Playwright's `retries: process.env.CI ? 2 : 0`
(whole-test re-execution) stacks on top of the 80×3000ms internal client retry ceiling (#116) —
worst case, a single stubbornly-failing test can consume up to ~240s internally × up to 3 total
Playwright attempts, inside a 15-minute per-test timeout. **Low-Medium**, recommend lowering
`API_CLIENT_DEFAULTS.RETRIES` materially and/or making Playwright's `retries` conditional on suite
type.

### Setup/teardown cost

**#144. [Highest-leverage, operational]** `global-setup.ts:375,393` gates the "reuse an existing
warm QA group instead of cold-provisioning" fast path behind `!isCI`. **On CI, every single job
always cold-provisions a new group** (`createGroup` → `ensureBootstrapTableReady` with
`COLD_START_WAIT_MS = 450_000`) — up to **7.5 minutes of pod cold-start wait, on every CI job,
every time**, with the self-heal/staleness machinery that makes local reuse safe already built and
unused for CI. **High** — likely the single biggest wall-clock cost in the whole pipeline.
Extending the same guard rails to CI (e.g. a pipeline-cached group id, `ENV_TARGET`-keyed) is
feasible, but flag the real risk first: concurrent CI pipelines sharing one warm group could race
each other — needs per-runner/per-branch group pools or an explicit lock, not a blind removal of
the `!isCI` guard.

**#145.** `cleanupOrphanedSchemas`/`cleanupStaleGroups` (`group-cleanup-helper.ts:274-282,420-434`)
run strictly sequential `for...await` loops over independent DB rows, unconditionally at the top
of every CI `global-setup`. **Medium**, candidate for bounded-concurrency `Promise.all`.

**#146.** `global-setup.ts:296-357` runs a full check-and-maybe-insert against
`system_parameter.liv` on every single run, defending against a record that should essentially
never be missing after first bootstrap. **Low**, candidate for a pipeline-scoped skip cache if
setup latency is being trimmed aggressively.

### Retry/backoff (recently touched for Allure)

**#147.** Confirmed **not a regression**: `withAllureAttachment` wraps the entire
`requestWithRetry` call, so exactly one attachment pair is produced per logical call regardless of
internal retry count — correct design.

**#148.** `attachRequest`/`attachResponse` unconditionally attach the full masked payload/body for
every successful call by default (`attachToAllure ?? true`). Across a full regression run this
measurably inflates `allure-results/` size (a 7-day CI artifact, also uploaded to Allure TestOps).
**Medium** — worth confirming this hasn't materially grown artifact size/upload time since
`b37d774a`; consider truncating large bodies or sampling for regression suites.

**#149.** Confirmed **correctly fixed, not a new gap**: the `b37d774a` commit's own two
retry-correctness fixes (401-refresh could bypass a caller's `retries: 1` budget; a thrown
exception's message/stack was discarded) are both verified in place and reduce, not add, latency
surface.

### DB cleanup

**#150.** `scripts/cleanup-test-schemas.ts:143-152` drops candidate schemas in a sequential loop,
same pattern as #145 — lower priority since this is a manually-invoked tool, not a CI hot path.
**Medium.**

**#151.** `scripts/db-clean-pf.ts` re-confirmed still intentionally kept as a manual-only
maintenance script (Round 1's #60 call re-verified correct) — no new finding.

### CI (GitLab CI)

**#152.** `.install_java_for_allure` runs `apt-get update && apt-get install -y
default-jre-headless` fresh in **every** report-generating job — a fixed ~20-60s tax per job with
zero reuse. **Medium**, recommend baking a JRE into a custom derivative of the Playwright base
image, built once.

**#153.** npm cache `key: '${CI_COMMIT_REF_SLUG}'` is branch-scoped only — every new branch starts
with a cold npm-download cache. **Low**, recommend `cache.fallback_keys: ['main']`.

**#154.** `.gitlab-ci.yml`'s `TEST_TYPE` variable description references an `"all"` value that no
longer exists among the pipeline's actual options — documentation drift, not a functional bug.
**Low.**

**#155.** Confirmed **not a lint-weakening regression**: `eslint.config.mjs`'s +14 lines only add
5 legitimate Entry-Generation assertion-wrapper names to `playwright/expect-expect`'s
`assertFunctionNames` — the rule stays at `'error'`.

**#156.** Confirmed **still correct, no regression**: the `fullyParallel`/`beforeAll`
per-test-rerun fix from project memory — `playwright.config.ts` is byte-identical to before this
work for the relevant section; `API-tests`' `workers: API_TESTS_MAX_WORKERS` override is intact
and is exactly what #141's boot-time guard enforces.

### UI-side execution cost

**#157.** Full Keycloak login + company-selection repeated in **every one of ~15 tests** in
`field-registry.spec.ts` (7 explicit + 8 scenario-loop tests), each preceded by provisioning a
brand-new Keycloak user in `beforeEach` — none of these (besides login-specific specs) are testing
login itself. **High** — a worker-scoped authenticated `storageState`, captured once and reused
the way `fieldRegistryPreconditions` already amortizes API-side provisioning, would cut ~15 logins
per run to ~1 per worker.

**#158.** The worker-scoped `fieldRegistryPreconditions` fixture's cost-amortization is undermined
on local (non-CI) runs: `UI-Chromium` has no `workers`/`fullyParallel` override (unlike
`API-tests`), so under the global `fullyParallel: true` with `workers > 1`, Playwright can split
one file's tests across workers and silently re-run this "amortized" fixture multiple times —
same class of issue as the already-fixed API-side case, recurring here. **Medium** — doesn't
manifest in CI (pinned to `workers: 1` there), only in unconstrained local runs.

**#159.** `CbsFieldRegistryPage.searchFields()` always sleeps a fixed
`LISTING_SEARCH_SETTLE_MS` (750ms) instead of waiting on a concrete signal, called multiple times
per scenario — compounds across the suite. **Medium** — plausibly a deliberate debounce margin,
worth reconsidering if UI suite runtime becomes a concern.

---

## Re-verified — no regression found

Explicitly spot-checked against the new Entry-Generation/Allure code, all clean:
- Round 1 **#3** (field-registry client consolidation) — no third parallel client reappeared.
- Round 1 **#5** (`SysCoreApiClient.ensureProjectionExists` retry hook) — file untouched, intact.
- Round 1 **#14** (`getClientInternals` reflection hack) — no new reflection-hack pattern in the
  new Entry Generation code.
- Round 1 **#37** (`SystemCoreProjectionHelper` uses `TableRegistryApiClient`) — no parallel
  hand-rolled client reappeared.
- Round 1 **#44** (account/cob/customer/security_management scaffolding) — still pure stubs,
  unchanged; `security_management`'s health-check still correctly reaches into `system_core`'s real
  clients, confirming #18's fix holds.
- All 9 real `BaseApiClient`-derived clients route through the base class's HTTP verbs — **zero**
  clients bypass Allure reporting via a raw `fetch`/`this.request.*` call outside `base-api-client.ts`
  itself.
- `field-definition` module (client + paths) — clean, matches Round 1's #3/#33 fixes exactly.
- All of Round 1's UI findings (#29-32, #39-41, #51-53) — confirmed resolved/present, no regression
  (the `ui/` directory hasn't changed since `c0343581`, so this is a directory-wide re-confirmation).

---

## Recommended sequencing

1. **#63 first, no dependencies** — the compile-breaking regression. Blocks CI regardless of
   everything else.
2. **#26's closure** — retire the dead dotted-key PF types and their now-unnecessary
   `normalizePayloadKey` branches; unblocks #89/#90/#91 (PF types tidy-up) as one coherent pass.
3. **Mechanical Tier 1/4 consolidations** (the bulk of #64-#102, #130-#140) — same low-risk,
   high-value shape as Round 1's execution: one PR per cluster (api/utils, system_core helpers,
   fin_accounting/entry-generation, types, UI), verified by `tsc --noEmit` + `eslint` per the
   project's no-test-run convention.
4. **File decomposition cluster** (#109-#113) — `table-registry-helper.ts`,
   `projection-helper.ts`, `payload-builder.ts` split, `entry-generation-regression.spec.ts` split
   + shared rejection-runner extraction. Higher blast radius (many importers) — do after step 3's
   mechanical fixes land, so the decomposition starts from already-deduped code.
5. **Tier 3 base-class/consistency items** (#114-#129) — bundle with whichever cluster above
   already touches that file; #125 (silent catches) is quick and independent.
6. **Architecture/performance cluster** (#141-#159) — separate track from the correctness/dedup
   work above, since it changes runtime behavior rather than just code shape. Recommend sequencing
   by risk: #144 (CI group reuse) needs a concurrency-safety design decision before implementation;
   #157 (UI storageState reuse) and #152 (bake JRE into CI image) are comparatively low-risk wins;
   #141/#142/#143 need a scoped decision on whether to touch the token-cache architecture at all.

Nothing in this document has been fixed yet — same "discovery first" convention as Round 1. Track
execution the same way: strike through (`~~text~~`) each item here as it's resolved, with a
`**RESOLVED (date):**` note, so progress survives a context/session cutback.

---

## Execution status (2026-08-12)

The user approved fixing **Tier 1 (duplication), Tier 2 (misplacement), and Tier 4 (dead code)**
in this pass; **Tier 3 (base-class/complexity) and Tier 5 (architecture/performance) were
explicitly deferred** — left as discovery-only recommendations above, not yet acted on.

**#63 (critical) and #26 (Round 1's reopened item) are both resolved.** All in-scope Tier 1/2/4
findings (#64-#108, #130-#140) are either resolved, partially resolved with a documented reason,
or left open with an explicit justification — see the strikethrough/RESOLVED annotations inline
above for each one. Two items were judgment calls the assigned agents deliberately did not force:
**#96** (payload-builder.ts/payload-builder-projection-forms.ts association-payload overlap — real
differences in id suffix/i18n shape made a merge risky) and the **#100/#66/#67** family (generic
pollers/retry hooks that don't fit — same "verify before forcing the suggested fix" discipline
Round 1 established).

**Execution method:** the fixes in this section were done directly in the main session (small,
foundational, cross-cutting items: #63, #64, #65, #66, #67, #101, #102, #103, #130) plus 4 parallel
subagent clusters with non-overlapping file ownership (`api/utils`+cross-cutting were done inline;
`api/system_core`, `api/fin_accounting`+`api/integration_chapter`, `api/types`+`test-data`+
`api/product_factory`, and `ui/` each ran as a separate agent). Each cluster verified its own
`tsc --noEmit`/`eslint` before finishing and edited this document itself.

**Ad-hoc fix outside the original 62/97-finding numbering:** the user separately flagged
`db-query-keeper.ts`'s query-constant naming as unclear on its own merits (not a round-2 finding)
— specifically `FUZZY_ROWS`/`FUZZY_JOURNAL_LEGS_BY_TYPE`/`FUZZY_DELETE` (named after the SQL
`ILIKE` mechanism rather than what they return) and `SCHEMA.MATCHING_ILIKE`/`SCHEMA.EXIST` (same
problem, plus `EXIST` was ambiguous against the neighboring `EXISTS_FOR_SPACE`). Renamed once the
fin_accounting/system_core agents (which were actively adding new call sites under the old names
for #82/#83/#85) finished, to avoid a mid-flight collision:
- `ENTRY_GENERATION.FUZZY_ROWS` → `ENTRY_SEARCH_BY_ID_OR_KEYWORD`
- `ENTRY_GENERATION.FUZZY_JOURNAL_LEGS_BY_TYPE` → `JOURNAL_LEG_SEARCH_BY_ID_OR_KEYWORD_AND_TYPE`
- `ENTRY_GENERATION.FUZZY_DELETE` → `ENTRY_DELETE_BY_ID_OR_KEYWORD`
- `SCHEMA.MATCHING_ILIKE` → `SCHEMA.SCHEMAS_MATCHING_PATTERN`
- `SCHEMA.EXIST` → `SCHEMA.SCHEMAS_EXIST_BY_NAMES`

All 7 call sites across 5 files repointed. Deliberately left every other key in the file untouched
per the user's own bar ("only rename what an ordinary reader can't guess from the name alone") —
e.g. `ROWS_BY_ID` was explicitly kept.

The user also suspected many `DB_QUERIES` entries were dead code repo-wide. Counted real usages
for all 41 keys individually (`grep -rl "\.KEY("`, excluding the definition file) — only **one**
was actually unused: `SCHEMA.COLUMN_EXISTS_IN_SPACE` (0 references anywhere). Every other key had
≥1 real consumer. Deleted the one dead entry; the "many" impression didn't hold up under an actual
count, reported back to the user as such rather than deleting more than the evidence supported.

**Final full-repo verification (2026-08-12, after all of the above):** `npx tsc --noEmit` — 0
errors. `npx eslint .` — 0 errors/warnings. `npx prettier --check .` — clean (4 files needed
`--write` after the parallel agents' concurrent edits landed; applied and reverified).

**Not yet done, by design:** Tier 3 (#109-#129, including the `table-registry-helper.ts`/
`projection-helper.ts`/`payload-builder.ts` file-decomposition plan and the
`entry-generation-regression.spec.ts` split) and Tier 5 (#141-#159, the architecture/performance
cluster) remain exactly as discovery-only recommendations. Nothing has been committed — this all
sits uncommitted in the `proj-test-automation` working tree per this project's standing convention
of not committing without the user reviewing the full diff first.
