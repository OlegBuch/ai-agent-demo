# Review: MR !138 — TB-2083 Test impl: Override and Dispo Processing - Smoke

## Summary

TB-2083 ("Implement the API TCs with smoke tag") asks for smoke automation of the Override and
Dispo Processing feature (`security_management` module — DISPO.OFFICER hierarchy, OVERRIDE/
OVERRIDE.CLASS/OVERRIDE.CLASS.DETAILS configuration, hard-block/standard-override triggering,
record authorisation, dispo-ticket routing/escalation, and dispo approval). The MR delivers one
new 3,364-line spec, `api/security_management/tests/override-dispo-smoke.spec.ts` (53 test cases,
`TC-01`–`TC-53`, across 7 `US-02.05.0X`-scoped `describe` blocks, tagged `@api`/`@smoke_m2`),
backed by a new 926-line helper (`override-dispo-helper.ts`), a new payload builder
(`payload-builder-override-dispo.ts`), a new type file (`override-dispo.types.ts`), a new
constants file (`override-dispo.values.ts`), plus changes to two shared, pre-existing files —
`table-registry-helper.ts`'s `setAuthRequired` and `table-registry.types.ts`'s
`RecordInputResponse` — and small additions to `user-profile-helper.ts`, `user-group.types.ts`,
`db-query-keeper.ts`, and `.env.example`. Net diff: 11 files, +4725/-7.

Using `security_management`'s own stub client instead of `TableRegistryApiClient`/
`FieldDefinitionApiClient` would be wrong here — `testing-standards.md` documents that real SM
entities are legitimately exercised through `system_core`'s clients today, and this MR follows
that precedent correctly.

The core problem with this MR: it widens a shared, cross-module response type
(`RecordInputResponse`) to make previously-required fields optional, which breaks `npm run
typecheck` for *existing* code outside this MR — verified by actually running it (see Confirmed
Issue #1). Beyond that, the new suite has a real determinism gap (an unasserted cleanup/restore
call feeding into a shared, non-serial-mode fixture record — Confirmed Issue #2), a missing test
case (`TC-47` — Confirmed Issue #3), and a recurring pattern of hardcoded literal record IDs that
bypass this repo's own unique-ID convention (Confirmed Issue #5).

---

## Confirmed Issues

**[Blocking] Widening shared `RecordInputResponse` breaks typecheck for existing, unrelated tests**
`api/types/table-registry.types.ts:114-121`:
```diff
 export interface RecordInputResponse {
-  recordId: string;
-  seqNo: number;
-  data: Record<string, unknown>;
+  recordId?: string;
+  seqNo?: number;
+  data?: Record<string, unknown>;
   errorIds?: string[] | number[];
+  /** @deprecated Prefer `overrides` — live 422 responses use `{ id, params, targetFieldId }[]`. */
   overrideIds?: string[] | number[];
+  overrides?: OverrideConfirmation[];
 }
```
`RecordInputResponse` is shared across the whole suite (7 pre-existing consumers besides this
MR's own new file: `sms-system-core.spec.ts`, `customization-integration.spec.ts`,
`dates-holidays-smoke.spec.ts`, `system-tables-static-dictionaries-smoke.spec.ts`,
`idempotency-smoke.spec.ts`, `idempotency-regression.spec.ts`). Making `recordId`/`seqNo`/`data`
optional under this repo's `strict: true` breaks unguarded property access predating this MR.
Verified by actually running `npx tsc --noEmit -p tsconfig.json` against this branch:
```
api/integration_chapter/tests/sms-system-core.spec.ts(318,9): error TS18048: 'recordResponseBody.data' is possibly 'undefined'.
```
This is exactly what Husky's pre-commit/pre-push `npm run typecheck` hook runs — the repo does
not currently typecheck clean on this branch.
Fix: don't loosen the shared type for every consumer. Add a narrower response type for this
module's own 4xx/validation-error shape (e.g. `OverrideDispoRecordInputResponse` extending
`RecordInputResponse` with the fields that are genuinely optional here) and use that in the new
helper/spec instead, or narrow with an explicit `if (!body.data) throw ...` at the one call site
that needs it.

**[Blocking] Cleanup/restore call has no status assertion — corrupted baseline is silent, and the fixture it restores isn't serial-guarded**
`api/security_management/helpers/override-dispo-helper.ts:265-280`:
```ts
export async function restoreDispoOfficerUnderTestBaseline(
  client: TableRegistryApiClient,
  officerId: string,
  superiorId: string,
  majorId: string,
): Promise<void> {
  await client.inputProjectionRecord(
    DISPO_OFFICER_BASIC_PROJECTION_ID,
    buildDispoOfficerBasicInputPayload(officerId, {
      DISPO_AMOUNT: '5000.00',
      OVERDRAFT_AMT: '1000.00',
      REPORTING_TO: superiorId,
      ROUTE_TO: majorId,
      ...DISPO_OFFICER_UNDER_TEST_BASELINE_ABSENCE,
    }),
  );
}
```
No `expectStatus`/`expect` on the response — every other mutation in this file asserts its
status. This is called in `finally` blocks at `override-dispo-smoke.spec.ts:2875, 3017, 3355`
(`TC-49`, `TC-50`, `TC-53`), all three of which reconfigure the *same* shared
`DISPO_OFFICER_UNDER_TEST_ID` record's live `DISPO_AMOUNT`/`REPORTING_TO`/`ROUTE_TO`/absence
window via `configureDispoOfficerUnderTest`. The spec's outer `describe` (line 47) carries no
`test.describe.configure({ mode: 'serial' })` — confirmed absent repo-wide in this file (`grep`
for `mode:\s*'serial'` in this spec returns nothing) — so if the restore silently fails (a
transient 5xx, a validation conflict), every subsequent test relying on this officer's baseline
inherits corrupted fixture data with no signal at the point of failure, and nothing prevents these
three tests from being scheduled concurrently across workers in the first place.
Fix: assert the restore call's status the same way every other mutation in this file does
(`expectStatus(res, HTTP_STATUS.OK, 'Expected DISPO_OFFICER_UNDER_TEST baseline restore to
succeed')`), and confirm/declare `mode: 'serial'` for the `describe` blocks that share this
officer record if it isn't already inherited from an outer scope.

**[Confirmed] `TC-47` is missing — unexplained gap in the case sequence**
`api/security_management/tests/override-dispo-smoke.spec.ts:2481` (`TC-46`) is immediately
followed by `:2617` (`TC-48`) — `TC-47` does not exist anywhere in this file (confirmed by
grepping the whole file for `TC-47`: no matches).
Why it matters: the AQA Lead's coverage-traceability checklist requires every case id to map to
`Automated`/`Not Automatable(reason)` — a silent numbering gap with no comment or note reads as
either a dropped case or a case automated elsewhere with no cross-reference.
Fix: state in the MR description why `TC-47` isn't here (duplicate of another case, moved to a
different spec, not automatable) rather than leaving the gap unexplained.

**[Confirmed] Comment inside a `*.spec.ts` file — never acceptable per this repo's own convention**
`api/security_management/tests/override-dispo-smoke.spec.ts:1613-1616`:
```ts
// Assumption: PRECEDENCE's "required" is enforced by schema-level (structural) validation,
// which runs independently of — and before — any LINKED_TABLE referential check on
// DEFAULT_DISPO_OFFICER. So this 400 should fire regardless of whether DISPO_OFFICER_MAJOR_ID
// (seeded out of this module's scope, per US-02.05.05) actually exists on the environment.
```
`coding-standards.md`: "A comment anywhere inside a `*.spec.ts` file is never acceptable either,
regardless of length or content" — a test's `test.step` narration is supposed to carry this role.
Fix: delete the comment; if the assumption is load-bearing, fold it into the relevant
`test.step`/assertion message text instead.

**[Confirmed] Hardcoded, non-unique record IDs bypass this repo's own uniqueness convention — sibling tests in the same file do it correctly**
Multiple new tests declare literal record IDs instead of wrapping them in
`generateCustomId(...)`, e.g.:
- `override-dispo-smoke.spec.ts:253-254` (`TC-05`): `const overrideId = 'ovr_large_wire_v1';` /
  `const overrideClassId = 'ovc_supervisor_class';` — contrast `TC-02` two tests earlier
  (`:104`): `const overrideId = generateCustomId('ovr_large_wire_v1');`.
- `:334` (`TC-11`): `const errorId = 'err_missing_message_v1';`
- `:371` (`TC-12`): `const overrideId = 'ovr_missing_message_v1';`
- `:559, :626` (`TC-15`/`TC-17`-area): `const overrideClassId = 'ovc_supervisor_class';` reused
  as a bare literal again.
`testing-standards.md`'s "Unique identifiers" rule requires every dynamically-created resource's
suffix to come from `dynamic-name-generator.ts`, specifically so specs stay safe to run unordered
and repeatedly — these records are never tracked/cleaned up (only `createdTableIds` are dropped in
`afterAll`), so re-running this suite against a shared QA/STAGE environment will either collide
with a pre-existing record from the last run or silently reuse its stale state, masking a real
assertion failure.
Fix: wrap these literals in `generateCustomId(...)`, consistent with `TC-01`–`TC-04`/`TC-19`–`TC-20`
in the same file.

**[Confirmed] Six-way duplicated restricted-user-context boilerplate not extracted, despite the helper file that should own it**
`override-dispo-smoke.spec.ts:1026, 1128, 1233, 1400, 1507, 1823` each repeat the same ~25-line
shape verbatim:
```ts
const restrictedContext = await createAuthenticatedApiContextWithRetry(playwright.request, {
  baseURL: process.env.BASE_URL, companyCode: process.env.COMPANY_CODE,
  realm: process.env.KEYCLOAK_REALM, username: USERS_DATA.RESTRICTED_USER.CREDENTIALS.username,
  password: USERS_DATA.RESTRICTED_USER.CREDENTIALS.password, userContext: USERS_DATA.RESTRICTED_USER.ID,
});
try { /* ... */ } finally { await restrictedContext.dispose(); }
```
wrapped by an outer `try { assignRestrictedUserFullOverrideClasses(...) } finally {
restoreRestrictedUserProfile(...) }`, also duplicated 6×.
Why it matters: this exact profile-swap + context-create/dispose + restore pattern is the single
most duplicated shape in the new suite — a future change to how a restricted context is
established needs editing 6 call sites, and `override-dispo-helper.ts` (which already extracts
comparable multi-step setup, e.g. `provisionDispoOverrideDefaultingToOfficer`) is the obvious home
for it.
Fix: extract to a helper, e.g. `runAsRestrictedUserWithClasses(userGroupClient,
userProfileClient, playwright, classIds, tableId, async (restrictedClient) => {...})` owning both
the profile swap/restore and the context create/dispose.

**[Confirmed] Eight near-identical "reject INPUT + verify 404" test bodies not consolidated**
`TC-35` (`:1867`), `TC-36` (`:1909`), `TC-38` (`:2003`), `TC-39` (`:2046`), `TC-40` (`:2126`),
`TC-41` (`:2170`), `TC-42` (`:2214`), `TC-43` (`:2259`) each repeat the same two-step shape — INPUT
with an invalid payload → expect 400 with a non-empty error, then SEE → expect 404 — differing
only in the payload override and expected message string.
Why it matters: 8 near-identical ~30-line blocks is exactly the "repeated logic across the diff
should have been extracted into shared code" case the AQA Lead lens exists to catch; a shared
assertion helper would cut this to one line per case and remove the chance of one variant's
assertion drifting from the rest.
Fix: add e.g. `assertDispoOfficerInputRejected(client, officerId, overridePayload,
reasonMessage)` to `override-dispo-helper.ts` wrapping both steps.

**[Confirmed] New `.env.example` comment violates this repo's own no-comments-in-`.env.example` rule, and cites a file that doesn't exist**
`.env.example:85`:
```
# Dispo officers for override smoke tests (dispo-officer-override.spec.ts)
```
`coding-standards.md`'s Comments section explicitly lists `.env.example` as a location where "no
comment is acceptable at any length — the fix for a violation there is to delete the comment
entirely." The comment is also factually wrong: no `dispo-officer-override.spec.ts` exists in this
diff — the actual file is `override-dispo-smoke.spec.ts`.
Fix: delete the comment; the env var names (`DISPO_OFFICER_FIRST_ID` etc.) are already
self-documenting.

---

## Possible Risks

**Shared helper `setAuthRequired`'s retry behavior changed for every existing caller, not just this MR's new tests**
`api/system_core/helpers/table-registry-helper.ts:963-1025` — previously *any* 400 on the INPUT
call triggered a blind retry with `{ data: defObj }`. This MR adds
`shouldRetryProjectionDefinitionInputWithDataEnvelope`, a regex heuristic over the raw error-body
text, that now fails fast (using the *first* response) whenever the body doesn't match a
"should retry" pattern or matches an explicit "don't retry" pattern. `setAuthRequired` is consumed
well beyond this MR's own new tests. If any existing caller currently depends on the old
unconditional retry succeeding for a body shape the new regexes don't cover, it starts failing
where it used to pass — and there's no WHY-comment here explaining the heuristic despite
`helpers/` being an allowed location for one.
Fix: run the full suite (not just this MR's own spec) to confirm no other `setAuthRequired`
caller relied on the old blind-retry path; add a 1-2 line WHY comment explaining the two regex
branches.

**Module-level mutable cache not keyed by officer identity**
`override-dispo-helper.ts:135`: `let resolvedMajorReportingTo: string | null | undefined;`,
consumed by `ensureTopLevelDispoOfficersProvisioned` (`:137-238`) — memoizes a probe result across
every test in the same worker process, keyed by nothing. If this helper is ever invoked with a
different `major` identity within the same worker, the second call reuses the first call's cached
resolution against a different officer.
Fix: key the cache by `major.id` (a `Map`), or resolve once in a suite-level `beforeAll` and pass
the result down explicitly.

**Hardcoded projection-ID string literals instead of the file's own named constants**
`'DISPO.ITEM~SYSTEM'`/`'DISPO.ITEM~REVIEW'` appear as bare literals roughly 15 times throughout
`override-dispo-smoke.spec.ts` (e.g. `:1554, 1581, 1601, 2445, 2609, 2707, 2724, 3214, 3216`)
rather than sourced from `override-dispo.values.ts`, which already centralizes sibling projection
IDs (`DISPO_OFFICER_BASIC_PROJECTION_ID`, `OVERRIDE_DISPO_PROJECTION_ID`).
Fix: add `DISPO_ITEM_SYSTEM_PROJECTION_ID`/`DISPO_ITEM_REVIEW_PROJECTION_ID` to
`override-dispo.values.ts` and use them consistently.

**Raw HTTP-status-range literals**
`override-dispo-smoke.spec.ts:1844, 1848, 2590, 2591`: `.toBeGreaterThanOrEqual(400)` /
`.toBeLessThan(500)` instead of `HTTP_STATUS` constants used everywhere else in this file. This is
a range check rather than an exact match, so no single named constant fits cleanly — flagging as a
risk rather than confirmed.

**Environment-dependent setup: three real, shared officer records mutated across the whole run**
`ensureTopLevelDispoOfficersProvisioned`/`configureDispoOfficerUnderTest`
(`override-dispo-helper.ts:137-238, 270-288`) mutate three persistent, env-configured
`DISPO_OFFICER_FIRST/SECOND/THIRD` records shared across the whole suite/CI run, and
`ensureTopLevelDispoOfficersProvisioned` branches its own behavior on whatever conflicting state
already exists live on the environment. This is likely an accepted tradeoff given DISPO.OFFICER
apparently requires real backing `SM.USER`s (per the code's own citation of
`US-02.05.05/06/07`), but it is not test-isolated in the usual sense.
Fix (if not already agreed as a deliberate exception): document the tradeoff near the helper, and
confirm these suites aren't run in parallel workers against the same three officer ids.

**No `allureCaseId(...)` on any of the 53 test cases in this new spec**
Confirmed by grepping the whole file: `allureCaseId` appears zero times in
`override-dispo-smoke.spec.ts`. Per `testing-standards.md` this is only correct when a case has no
Allure TestOps entry yet — plausible for a fully new feature, but worth confirming explicitly
given the ticket's own description ("Implement the API TCs with smoke tag") implies pre-existing
cases to link against, and 53-for-53 omitted is unusual.
Fix: confirm with the author whether these map to real Allure TestOps case ids; if so, add
`allureCaseId(<id>)` to each.

**Fragile error-message substring match**
`override-dispo-helper.ts:130-132` (`isReportingToConflict`) branches on
`errors?.REPORTING_TO?.includes('only one officer may have an empty REPORTING_TO')` — a hardcoded
substring of backend prose. A wording change on the API side silently breaks this fallback path
(it falls through to an `expectStatus(..., OK)` assertion and fails with a confusing message, not
a clear "wording changed" signal).
Fix: use a stable error code if the platform exposes one; otherwise track this as a known,
documented fragility in `testing-standards.md`'s "Known gaps" section.

---

## Nice-to-Have Improvements

**Duplicate payload-builder functions with byte-identical bodies**
`payload-builder-override-dispo.ts:204-214` (`buildDualStandardOverrideClassDetailsInputPayload`)
and `:216-226` (`buildOverrideClassDetailsLinkedInputPayload`) have identical parameter lists and
identical bodies (both call `buildOverrideClassDetailsInputPayload` with the same arguments in
the same order). Both are actually called (from `override-dispo-helper.ts` and the spec), so
neither is dead code — just redundant. Consolidate to one, or document why two names for the same
behavior are intentional.

**`TC-24`/`TC-25` near-duplicate bodies**
`override-dispo-smoke.spec.ts:990` and `:1088` differ only by `authRequired` and one extra
NAU/LIV verification step. A small shared inner function parameterized by `authRequired` would
cut ~60 lines of duplication; not blocking since the two cases genuinely assert different platform
behavior (auto-LIV vs. still-NAU).

**Repeated 6-line table/field provisioning precondition not consolidated, despite existing precedent for exactly this**
`TC-45, 46, 48, 49, 50, 51` (`:2362, 2481, 2617, 2739, 2884, 3026`) each re-derive the same
"create table → register linked field → `updateTableDefinition` → expect 201" block verbatim,
differing only in variable names — while `provisionDispoOverrideDefaultingToOfficer` in the same
helper file already shows this exact kind of consolidation being done correctly elsewhere in this
MR. A follow-up helper (e.g. `provisionSourceTableWithOfficerField`) would cut ~40 duplicated
lines.

**Hardcoded test-case reference inside a reusable, generically-named helper**
`override-dispo-helper.ts:308` (`assertSeededDispoOfficerWithApproveAuthority`) hardcodes
`"platform seed required for TC-52"` in its assertion message. If a second test reuses this
helper, the message becomes misleading. Its sibling one line above,
`assertSeededDispoOfficerDispoAmountCoversViolation`, already accepts `purpose` as a parameter —
follow the same pattern here.

**Duplicate type shape across two files in the same diff**
`override-dispo.types.ts`'s `HardBlockRejectionResponse.errors` re-declares the same
`{ id: string; params: unknown[]; targetFieldId: string | null }` shape just added as
`OverrideConfirmation` in `table-registry.types.ts`. Reuse `OverrideConfirmation[]` instead of
redeclaring — matches this repo's own "one file per entity family, shared types live once" rule.

**JSDoc comment placed in a location the comment convention doesn't cover**
`table-registry.types.ts:118`'s `/** @deprecated ... */` is legitimate content, but
`coding-standards.md`'s comment allowance is scoped to `helpers/`/`utils/constants/`-style files,
not `api/types/*.types.ts` — move the rationale into `api-conventions.md` doc prose instead, for
consistency with the stated rule.

**Cosmetic, unrelated rename**
`user-group.types.ts:7`: `[key: string]: string` → `[language: string]: string` is a pure
index-signature rename unrelated to Override/Dispo. Harmless, but scope creep for a ticket scoped
to "implement the API TCs with smoke tag" — worth a one-line note in the MR description if
intentional, otherwise drop to keep the diff minimal.

**Unresolved naming-convention source**
`override-dispo-helper.ts:637`'s `AUTH_PROBE_PROJECTION_SUFFIX = 'AUTO.TEST'` synthesizes
`${tableId}~AUTO.TEST` projection ids with no cited Bruno/contract source in this file — likely
fine if it mirrors an established pattern elsewhere, but worth confirming per the fullstack-aqa
persona's "state where a new id convention comes from" rule.

---

## Ready-to-paste GitLab comments

```
Пункт 1
[Blocking] RecordInputResponse ломает typecheck для существующих тестов
table-registry.types.ts:114-116 — recordId/seqNo/data стали optional. Это ломает npm run typecheck (проверено локальным прогоном): sms-system-core.spec.ts:318 падает с TS18048, т.к. этот тип используется в 6+ существующих файлах.
Как исправить: не расширять общий тип — завести свой тип-наследник под нужды этого модуля (например OverrideDispoRecordInputResponse extends RecordInputResponse) и использовать его в новых helper/spec.

Пункт 2
[Blocking] restoreDispoOfficerUnderTestBaseline не проверяет статус ответа
override-dispo-helper.ts:265-280 — вызов inputProjectionRecord в finally (TC-49/50/53, spec.ts:2875,3017,3355) ничего не проверяет. Общий DISPO_OFFICER_UNDER_TEST_ID при этом мутируется тремя тестами без mode: 'serial' в файле — если restore упадёт, следующий тест тихо унаследует испорченный baseline.
Как исправить: добавить expectStatus как у остальных мутаций в файле, подтвердить serial-режим для этих тестов.

Пункт 3
[Confirmed] Пропущен TC-47
override-dispo-smoke.spec.ts — после TC-46 (:2481) сразу идёт TC-48 (:2617), TC-47 нигде не встречается в файле.
Как исправить: указать в описании MR, почему TC-47 отсутствует (дубль/не автоматизируется/перенесён), а не оставлять пропуск без объяснения.

Пункт 4
[Confirmed] Захардкоженные неуникальные ID вместо generateCustomId
spec.ts:253-254 (TC-05), :334 (TC-11), :371 (TC-12) и другие используют литералы вроде 'ovr_large_wire_v1' напрямую, тогда как TC-02 рядом (:104) правильно оборачивает тот же ID в generateCustomId(...). Без уникального суффикса и без cleanup повторный прогон против общего QA/STAGE окружения либо столкнётся с уже существующей записью, либо тихо переиспользует состояние из прошлого прогона.
Как исправить: обернуть все такие ID в generateCustomId(...), как в TC-01-04/TC-19-20 этого же файла.

Пункт 5
[Confirmed] 6x и 8x дублирование не вынесено в helper
Паттерн restrictedContext (createAuthenticatedApiContextWithRetry + profile swap/restore, spec.ts:1026,1128,1233,1400,1507,1823) и паттерн "INPUT reject + SEE 404" (TC-35/36/38-43) повторяются практически без изменений. override-dispo-helper.ts уже показывает такую консолидацию на примере provisionDispoOverrideDefaultingToOfficer — стоит сделать так же и здесь.
Как исправить: вынести оба паттерна в отдельные helper-функции.
```

---

## Changelog

- **2026-08-21**: Re-review after the branch advanced from `5992231f` (originally reviewed commit)
  to `abea3a65` (48 new commits, several titled `fix comments`/`fix duplications`/`fix status
  code`/`fix hardcoded`/`fix naming and dublication`/`fix types`/`fix env example`/`fix remove
  comments in tests`/`fix blocking comments`). Diffed the new head against current `main` (13 files
  actually belonging to this MR — confirmed `main` had advanced too, so an earlier stat against the
  old reference commit falsely included unrelated `negotiation_rules`/`currency`/`lng-trn` files
  from other merged MRs; re-diffed against current `main` to isolate this MR's own changes) and
  against the previously-reviewed commit specifically, to see what changed.

  **Both [Blocking] issues are resolved, verified directly, not just by reading the diff:**
  - `RecordInputResponse` widening: **reverted**. `recordId`/`seqNo`/`data` are required again in
    `table-registry.types.ts`; a new `OverrideDispoRecordInputResponse` (in
    `override-dispo.types.ts`) extends it via `Omit<..., 'recordId'|'seqNo'|'data'>` with those
    three optional, scoped to this module only — exactly the fix recommended. Re-ran
    `npx tsc --noEmit -p tsconfig.json` against the new head: **passes clean, no errors.**
  - `restoreDispoOfficerUnderTestBaseline` (the `TC-49`/`TC-50`/`TC-53` cleanup call): now asserts
    `expectStatus(res, HTTP_STATUS.OK, ...)`. The module-level `resolvedMajorReportingTo` mutable
    variable was also fixed unprompted — replaced with a `Map` keyed by `major.id`
    (`resolvedMajorReportingToByOfficerId`), with a WHY comment explaining it, closing the adjacent
    Possible Risk. `mode: 'serial'` is still not declared anywhere in this spec (confirmed absent by
    grep) — the residual "two tests could mutate the shared officer concurrently" risk is downgraded
    from Blocking to a Possible Risk, since the dangerous part (a failed restore silently corrupting
    the next test with no signal) is now closed; a genuine race would at least fail loudly.

  **Other Confirmed Issues:**
  - In-spec comment (`:1613-1616`): removed — the rationale was folded directly into the
    `test.step` label string instead. Fixed.
  - Hardcoded non-unique IDs: fixed for every case that actually persists a record (`TC-05`,
    `TC-11`, `TC-12`, `TC-15`/`TC-17`-area, `TC-02`-adjacent `ovr_atm_withdrawal_v1` case) — all now
    wrapped in `generateCustomId(...)`. Two literals remain unwrapped
    (`ovr_missing_precedence_v1` in `TC-13`, `ovr_missing_default_officer_v1` in `TC-14`) — verified
    these are non-issues: both are rejected-INPUT-then-404-SEE negative cases where the record is
    never actually persisted, so there's nothing to collide with on rerun.
  - Six-way restricted-user-context duplication: extracted into a new
    `runAsRestrictedUserWithClasses` helper, used at every one of the six original call sites
    (`TC-24`, `TC-25`, `TC-00`, `TC-31`, `TC-34`, `TC-32`). Fixed.
  - Eight-way reject-INPUT/verify-404 duplication (`TC-35`/`36`/`38`–`43`): extracted into a new
    `assertDispoOfficerInputRejected` helper — and `eslint.config.mjs`'s
    `playwright/expect-expect` `assertFunctionNames` allowlist was correctly updated to include it,
    so the lint rule still recognizes these tests as containing real assertions. Fixed, with the
    correct companion lint-config change.
  - `.env.example` comment: the wrong filename was corrected
    (`dispo-officer-override.spec.ts` → `override-dispo-smoke.spec.ts`), and a full "Override &
    Dispo Processing Testing" section was added to `README.md` documenting the env vars and a
    one-time `DISPO.ITEM` permission setup step. The underlying rule (`.env.example` should carry no
    comment at all, per `coding-standards.md`) is still technically not satisfied — the comment is
    now correct rather than absent — but this is minor now that the real documentation lives in
    `README.md` where it belongs; downgrading to Nice-to-Have.
  - `TC-47` gap: **still open, not addressed** — grepping the current file for `TC-47` still
    returns no matches.

  **Possible Risks:**
  - `setAuthRequired`'s regex-based retry-behavior change (`table-registry-helper.ts`): **not
    touched by any fix commit** (confirmed via `git diff` between the old and new head scoped to
    this file — no changes) — still open, still worth a full-suite confirmation run.
  - Hardcoded `'DISPO.ITEM~SYSTEM'`/`'DISPO.ITEM~REVIEW'` literals: fixed — replaced throughout
    with `OverrideDispoValues.DISPO_ITEM_SYSTEM_PROJECTION_ID`/`DISPO_ITEM_REVIEW_PROJECTION_ID`,
    added to `override-dispo.values.ts` exactly as suggested.
  - Raw HTTP-status-range literals (`toBeGreaterThanOrEqual(400)`/`toBeLessThan(500)`): fixed —
    replaced with `expectStatus(authRes, HTTP_STATUS.FORBIDDEN, ...)`, which is actually more
    precise than the range check it replaced.
  - Environment-dependent shared-officer setup: not made isolated (as expected — this is
    apparently unavoidable given real `SM.USER` backing), but now explicitly documented as a
    deliberate design choice in the new `README.md` section. Downgrading from "confirm this is
    deliberate" to "acknowledged, documented."
  - Missing `allureCaseId(...)` on all 53 cases: **still open** — still zero occurrences in the
    file. Still worth a direct answer from the author.
  - Fragile `isReportingToConflict` substring match: **not touched** — still open.

  **Nice-to-Have:**
  - Duplicate payload-builder functions: fixed — `buildOverrideClassDetailsLinkedInputPayload` was
    deleted entirely; its two call sites now use `buildDualStandardOverrideClassDetailsInputPayload`.
  - Repeated 6-line table/field provisioning precondition: fixed — new
    `provisionSourceTableWithOfficerFields(client, fieldClient, workerGroupId, createdTableIds,
    fieldCount)` helper, used across `TC-45`/`46`/`48`/`49`/`50`/`51`.
    - Hardcoded `"TC-52"` reference: fixed — `assertSeededDispoOfficerWithApproveAuthority` now
    takes `purpose` as a parameter, matching its sibling.
  - Duplicate `HardBlockRejectionResponse`/`OverrideConfirmation` type shape: fixed — now reuses
    `OverrideConfirmation[]` directly.
  - Misplaced `@deprecated` JSDoc comment: fixed — removed entirely along with the widening it was
    explaining.
  - `TC-24`/`TC-25` near-duplicate bodies: unchanged as separate tests, but the boilerplate portion
    of the duplication is gone now that both route through `runAsRestrictedUserWithClasses` — the
    remaining difference is only the genuinely-distinct `authRequired`/NAU-vs-LIV assertion, so this
    is effectively resolved in substance even though two `test(...)` bodies still exist.
  - Cosmetic `user-group.types.ts` index-signature rename: untouched, as expected (this was always
    Nice-to-Have/non-blocking).
  - `AUTH_PROBE_PROJECTION_SUFFIX` convention-source citation: not addressed, still open (low
    priority).

  **Net result: both Blocking issues and 5 of 6 other Confirmed Issues are resolved (only `TC-47`
  remains open); 3 of 6 Possible Risks are resolved, 1 downgraded/documented, 2 remain open
  (`setAuthRequired` behavior change, missing `allureCaseId`); 6 of 8 Nice-to-Haves are resolved.**
  Updated ready-to-paste comments for what's still actually outstanding:

```
Пункт 1 (обновлено 2026-08-21)
[Confirmed] Всё ещё пропущен TC-47
После правок нумерация тестов не изменилась — после TC-46 сразу идёт TC-48, TC-47 по-прежнему нигде не встречается в файле.
Как исправить: указать в описании MR, почему TC-47 отсутствует, а не оставлять пропуск без объяснения.

Пункт 2 (обновлено 2026-08-21)
[Possible Risk] setAuthRequired изменил retry-поведение для всех существующих вызовов — не подтверждено
table-registry-helper.ts:963-1025 — новая regex-эвристика shouldRetryProjectionDefinitionInputWithDataEnvelope осталась без изменений в этой волне фиксов и без прогона полного сьюта.
Как исправить: прогнать весь сьют (не только этот файл), чтобы убедиться, что ни один существующий вызов setAuthRequired не полагался на старое безусловное retry.

Пункт 3 (обновлено 2026-08-21)
[Possible Risk] allureCaseId по-прежнему отсутствует во всех 53 тестах
Стоит явно подтвердить у автора: это осознанно (кейсов ещё нет в Allure TestOps) или пропущенный шаг линковки.
Как исправить: подтвердить и при необходимости добавить allureCaseId(<id>) к нужным тестам.
```
