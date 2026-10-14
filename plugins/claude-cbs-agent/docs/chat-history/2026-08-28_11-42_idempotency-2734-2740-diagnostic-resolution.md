# Idempotency — 2734 rewritten in Allure, 2740 deleted after live diagnostic, 2726 gap fixed

**Date/time:** 2026-08-28 11:42 · **Branch:** group-3/TB-3400 (proj-test-automation) · **Ticket(s):** TB-3400

Third checkpoint in this session — read `2026-08-28_09-53_idempotency-allure-linking.md` and
`2026-08-28_10-14_idempotency-excel-audit-dedup-newtest.md` first.

## Discussed

- User asked why 2734 and 2740 couldn't be automated (answered from the previous checkpoint's
  findings, no new work).
- User decided: for 2734, rewrite the Allure case itself to match the real tested behavior (BR-3.5)
  and link the existing test — rather than leaving it unlinked forever.
- For 2740, user stated a specific business-rule belief ("accept can't be done by whoever triggered
  the override — must be a different person") and asked for a live script to determine actual
  behavior before deciding anything, explicitly: "проверь... тогда поймём например что 2740 надо
  удалить (но не удаляй пока я не скажу)."
- After seeing the diagnostic result, the user deleted case 2740 themselves (via Allure UI, not via
  this session) and asked to verify our automated test for 2726 matches Allure's actual stored
  steps/expected-result content.

## Implemented

- **Allure case 2734 rewritten** via `testops_update_testcase` (name, description, 2-step
  scenario) to describe BR-3.5's real behavior instead of "dates are normalized." Relinked the
  existing `idempotency-regression.spec.ts` test: dropped `TC-11:` prefix, added `allureCaseId(2734)`.
- **Diagnostic script** (`api/system_core/tests/_diag-override-accept-actor-probe.spec.ts`, written,
  run, then deleted — never part of the permanent suite) probed 3 scenarios against a real
  OVERRIDE-configured table: same actor accepts own override (`200`), different actor with zero
  permissions accepts (`403 "does not have function: <table>.INPUT"`), MAKER_USER→CHECKER_USER pair
  (inconclusive — failed at basic table access, unrelated to override logic). First run of the
  script had the same `ACCOUNT_NUMBER` `maxLength: 32` overflow bug as before (labels too long);
  fixed by shortening probe labels, then re-ran clean.
- **Verified 2726 against its own stored Allure content** (fetched `/testcase/2726` +
  `/testcase/2726/step`): found the test only asserted the `422` status at Step 1, not the response
  body content Allure's Expected Result also requires. Added an assertion on the already-typed
  `RecordInputResponse.overrides` field being present/non-empty. Re-ran just this one test live —
  passes.
- Updated `docs/module-theory/Idempotency/INDEX.md` (final counts: 44 cases, 39 automated, 5 not),
  `US-01.12.03/tc03-override-accept-403.md` and `tc07-override-accept-no-permission-200.md` (both
  closed with the definitive diagnostic finding), Patterns section (four-eyes bullet rewritten from
  "ambiguous, unresolved" to "resolved — no identity check exists"), "Don't re-litigate" section
  (new entry for the four-eyes closure).

## Learned

- **The real `/accept` authorization model is: generic `INPUT` table permission, no identity
  check.** This is more precise than TB-3031's blanket "no permission check exists anywhere" —
  there IS a check, it's just not four-eyes and not override-specific. Same actor who triggered the
  override can accept it; so can any different actor, as long as they hold `INPUT` on the table.
  This means our existing tests (2726 self-approval→200, 2730 zero-permission-actor→403) were BOTH
  already asserting the correct, real behavior — neither was "encoding a bug."
- **Pre-provisioned role users (`MAKER_USER`/`CHECKER_USER`, `USER_WITHOUT_PERM`) are scoped to
  specific pre-existing tables**, not automatically granted access to freshly-created AQA dynamic
  tables — a maker-checker-pair probe against an ad-hoc table fails at basic table access before it
  can test anything override-specific. Don't reach for these users to test a brand-new table's
  authorization without first confirming/granting table access.
- **A throwaway diagnostic script needs the same rigor as a real test** — the first run of the probe
  script hit the identical `ACCOUNT_NUMBER` `maxLength: 32` / `generateCustomId` length bug as the
  earlier 2674 test, because the diagnostic wasn't held to the same care as permanent code. Worth
  remembering for any future ad-hoc probe.
- Allure's `testops_update_testcase` MCP tool works for rewriting name/description/scenario steps
  end-to-end in one call (structured `scenario.steps` with `body`/`expectedResultSteps`) — no need
  to fall back to raw REST PUT for this kind of edit.

## Open Items / Follow-ups

- None outstanding for 2734/2740/2726 — all three resolved this session.
- Carried over from earlier checkpoints: TTL bug (2667/2678/2679) and 2675/2727 still need
  BA/Dev/infra decisions before they can move off Manual/blocked.

## References

- Allure TestOps: case 2734 rewritten, case 2740 deleted (by user), case 2726 test corrected.
- `RecordInputResponse.overrides` / `OverrideConfirmation` types: `api/types/table-registry.types.ts:107-119`.
