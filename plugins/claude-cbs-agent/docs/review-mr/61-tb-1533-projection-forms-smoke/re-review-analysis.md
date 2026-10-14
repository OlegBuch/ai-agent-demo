# Re-Review — MR !61 (TB-1533: Projection Forms & UI Framework - Smoke)

**Date/time:** 2026-08-04 22:45 · **Branch checked:** `group-1/TB-1533` (local working tree, 3
commits ahead of `origin/group-1/TB-1533`, 0 behind — this is the MR's source branch)

**Methodology note:** this round was run as a local branch-state check against
`final_analysis.md`'s Ready-to-paste comment, not the full `review-pr-recheck.md` protocol —
`git fetch origin merge-requests/61/head` was not performed (this session had no reachable
network path to the GitLab host, `10.0.102.50`, an internal address). Findings below were
verified directly against files in the checked-out working tree instead of a freshly fetched MR
ref. Since the local branch is strictly ahead of its own remote tracking branch, this is
equivalent to checking the MR's current state, but flagging the deviation from the documented
protocol for transparency. No fresh sweep (Part B of the full protocol) was performed this
round — see Open Items.

## Summary

All 16 original `Пункт`s were checked. 9 Fixed, 5 Not Fixed, 1 Partially Fixed, 1 Fixed via a
different mechanism than originally suggested (case removal instead of quarantine). No fresh
sweep for new issues was performed this round (see Open Items).

## Fix Verification

**Пункт 1 — [Fixed]** afterAll no longer touches the worker-scoped group. `projection-forms-smoke.spec.ts:59-96`'s `afterAll` now only calls `cleanupTables(dbClient, createdTableIds)`; no `createdGroupIds`/`deleteGroup` reference remains anywhere in the file.

**Пункт 2 — [Fixed, different mechanism]** No unquarantined Failed/Blocked markers remain. TC-106 was removed outright rather than quarantined with `test.fixme`; TC-48/141/179/193 now carry unconditional assertions (e.g. `:340-343`, `:499-502`) instead of the original "Failed - no Rules"/"Blocked" annotations.

**Пункт 3 — [Fixed]** Zero comments in the spec file — confirmed via full-file scan for `//`/`/*`.

**Пункт 4 — [Partially Fixed]** `api/utils/json-helper.ts` no longer exists at all (the unwrap logic moved into `api/system_core/helpers/projection-forms-helper.ts:38`, uncommented) — that location is resolved. But `api/utils/db-helper.ts:45-50` still carries a 4-line JSDoc on `createDbClient`, and WHAT-restating JSDoc persists at `:434-436` (`getProjectionSchema`) and `:452-454` (`ensureSystemShareCusData`) — not fixed.

**Пункт 5 — [Fixed]** The hand-rolled group-cleanup block is gone from the spec entirely; `cleanupGroupById` remains the sole implementation (`api/utils/group-cleanup-helper.ts:122`), unduplicated.

**Пункт 6 — [Fixed]** No `executedHooks` reference exists anywhere in the repo; TC-193 (`:650-761`) no longer tests hook execution/runtime layout at all. Note: a different, non-cited conditional (`if (runtimeSchema !== undefined)` at `:741-747`) still skips an existence assertion for a different field — tracked as a new, separate observation below, not this Пункт.

**Пункт 7 — [Fixed]** The widened `['LIV', 'NAU']` acceptance is gone; TC-193's persistence check (`:750-760`) now only verifies DB existence via `DB_QUERIES.RECORD_SPACE.EXISTS_IN_LIV_OR_NAU`, no longer asserting on the SEE response's `space` field at all.

**Пункт 8 — [Not Fixed]** All 9 test titles still use `'TC-<n> - US-<story> | <feature> | <action> (API)'` instead of `'TC-<number>: <behavior>'` — `:99,329,481,566,650,767,802,880,921`.

**Пункт 9 — [Fixed]** All `test.step` narration now uses `'PRECONDITION...'`/`'STEP N:...'`/`'VERIFY...'`/`'VERIFICATION:...'` — confirmed across 30 occurrences.

**Пункт 10 — [Fixed]** No hardcoded HTTP status literals remain in the spec; `TEST_CONSTS.HTTP_STATUS.CONFLICT = 409` was added (`constants-keeper.ts:79`) and is used at `:825,829`.

**Пункт 11 — [Fixed]** `FieldDefinitionApiClient.getFieldById` removed — the class now only exports `createField`.

**Пункт 12 — [Not Fixed]** `api/utils/db-helper.ts` still defines a local `delay()` (`:412`) and hardcodes `maxWaitMs = 60_000` (`:417`)/`delay(1000)` (`:429`) inside `pollDatabaseForSchemas`, none centralized into `constants-waiter.ts`.

**Пункт 13 — [Fixed]** The duplicated manual URL-construction expression is gone; the spec now only uses the existing helper-based path at `:589`.

**Пункт 14 — [Not Fixed]** `plugin-manager.values.ts:26` still hardcodes `expectedId` (not per-run suffixed); `ensurePluginExists` (`plugin-manager-test-helper.ts:38-49`) still short-circuits to `{created: false}` if the plugin already exists, with no delete/reset path.

**Пункт 15 — [Not Fixed — discrepancy inverted]** The originally-cited widened `[200, 201]` acceptance is gone, but `plugin-manager-test-helper.ts:65` now asserts upload status equals `TEST_CONSTS.HTTP_STATUS.CREATED` (201) **exclusively**, while `Plugin Manager/Plugins/Upload Plugin.yml:47` (Bruno) still documents/exemplifies exactly `200`. The test and the documented contract now disagree in the opposite direction from the original finding.

**Пункт 16 — [Not Fixed]** `resources/proj-identity-confinement-validation-plugin-1.0.1.jar` still exists; `architecture.md` still has no mention of `resources/` or a binary-fixture policy.

## New Findings

Fresh sweep (Part B of the full `review-pr-recheck` protocol — re-running the Code Style/AQA/AQA
Lead checklists over the MR's current full diff) was **not performed this round**; out of scope
for this session. One incidental observation surfaced while verifying Пункт 6, noted here for a
future full sweep to confirm/reject rather than asserted as a finding:

- `projection-forms-smoke.spec.ts:741-747` gates an assertion behind `if (runtimeSchema !== undefined)` without first asserting `runtimeSchema` is defined — same shape as the original Пункт 6 pattern, but for a different field/location than what Пункт 6 originally cited. Needs its own confirmation pass before being raised as a formal finding.

## Ready-to-paste GitLab follow-up comment

```
Пункт 4 (частично)
[Major] Комментарии в разрешённой локации превышают лимит 1-2 строки или пересказывают WHAT
Локация в json-helper.ts устранена (файл удалён, логика перенесена в projection-forms-helper.ts без комментария). Но остаётся: `api/utils/db-helper.ts:45-50` (4-строчный JSDoc на createDbClient), `:434-436` и `:452-454` (JSDoc, пересказывающий имя функции).
Как исправить: удалить или сократить до одной короткой WHY-фразы.

Пункт 8
[Major] Названия тестов не соответствуют конвенции TC-<number>: <behavior>
`api/system_core/tests/projection-forms-smoke.spec.ts:99,329,481,566,650,767,802,880,921` — всё ещё используется формат `'TC-<n> - US-<story> | ...'`.
Как исправить: переименовать в `'TC-<n>: <бизнес-поведение>'`.

Пункт 12
[Possible Risk] Новые функции поллинга в db-helper.ts не используют constants-waiter.ts
`api/utils/db-helper.ts:412,417,429` — локальный `delay()` и хардкод `maxWaitMs`/интервала внутри `pollDatabaseForSchemas`.
Как исправить: добавить именованные константы в constants-waiter.ts.

Пункт 14
[Possible Risk] Плагин-кейсы деградируют до read-only после первого прогона
`api/utils/plugin-manager.values.ts:26`, `api/system_core/helpers/plugin-manager-test-helper.ts:38-49` — id не суффиксируется, ensurePluginExists выходит рано без reset/delete.
Как исправить: задокументировать как "ensure exists"-проверку либо добавить cleanup/reset.

Пункт 15
[Possible Risk] Ассерт статуса загрузки теперь противоречит документированному контракту Bruno (инвертированное расхождение)
`api/system_core/helpers/plugin-manager-test-helper.ts:65` — assert-ится `201`, но `Plugin Manager/Plugins/Upload Plugin.yml:47` документирует `200`.
Как исправить: привести в соответствие — либо assert `200` по документации, либо обновить Bruno-документ, если `201` действительно актуален.

Пункт 16
[Possible Risk] Директория resources/ с бинарным JAR всё ещё не задокументирована
`resources/proj-identity-confinement-validation-plugin-1.0.1.jar`, `architecture.md` не обновлён.
Как исправить: добавить описание назначения resources/ и политику хранения бинарных фикстур.
```

## Open Items / Follow-ups

- A full Part B fresh sweep (Code Style + AQA + AQA Lead checklists over the MR's entire current
  diff) has not been run — only the original 16 `Пункт`s were re-verified. Recommend running
  `/execution:review-pr-commands:review-pr-recheck 61` properly (with real GitLab MR-ref access)
  for a complete pass, once network access to the GitLab host is available from wherever that
  command runs.
- `projection-forms-smoke.spec.ts:741-747`'s conditional (noted above) needs a dedicated look to
  confirm whether it's a genuine new instance of the Пункт 6 pattern.
