# Idempotency — Excel cross-check, Allure dedup, one new automated test, one live-run bugfix

**Date/time:** 2026-08-28 10:14 · **Branch:** group-3/TB-3400 (proj-test-automation) · **Ticket(s):** TB-3400

Continuation of the same session as `2026-08-28_09-53_idempotency-allure-linking.md` — read that
file first for the initial Allure-linking pass; this entry covers the follow-up work triggered by
the user pasting the original manual-QA Excel test-design sheet for all 3 Idempotency stories.

## Discussed

- User supplied the full original Excel test-design sheet (all 3 stories, with each case's own
  `Automation Status`/`State`/comments) and asked to cross-check it against Allure + the repo, and
  to re-assess whether any currently-unautomated case can now actually be automated.
- Mid-task, user asked to (1) find and delete Allure duplicates per Story, keeping the better copy,
  (2) explain precisely why each remaining not-automated case is unautomated (Manual/no
  implementation/planned for a later milestone), (3) verify every repo test case's `allureCaseId`
  still resolves to a real, matching Allure case — "должно быть всё прозрачно, правильно и чисто."
- User pushed back on an initial draft that put the new OVERRIDE-continuation test in its own nested
  `test.describe` — correctly pointed out the file already has an established pattern
  (`US-01.12.03`'s shared `beforeAll` provisioning multiple tables) and no nested describe was
  needed; reworked to match.
- User ran the new test locally and reported a live failure (`400`, `ACCOUNT_NUMBER maxLength <=
  32`) — fixed immediately (see Implemented).

## Implemented

- Two Gather subagents (Confluence, Bruno) resolved the real Jira tickets (TB-1549/1550/1551, all
  Done) and their dedicated Confluence pages, plus two official "QA Compliance Check" tickets
  (TB-3029 for US-01.12.01, TB-3031 for US-01.12.03) that neither Excel nor Allure mentioned.
- Deleted Allure case **2672** (`DELETE /api/testcase/2672`, confirmed `202`, soft-delete —
  restorable via `testops_restore_testcase`) after confirming via a project-wide `name ~=` AQL sweep
  that it was the only duplicate in the whole 46→45-case component, not just within one Story.
- Added one new automated test to `idempotency-regression.spec.ts`
  (`api/system_core/tests/idempotency-regression.spec.ts`), `allureCaseId(2674)` "OVERRIDE
  continuation: accept uses a different scoped key" — extended the existing
  `US-01.12.01 | Technical Idempotency` describe's shared `beforeAll` with one more
  duplicate-config-backed table (`overrideContTableId`/`overrideContProjectionId`), added the test
  as a flat sibling (no nested describe). Fixed a live failure the user reported after running it:
  `generateCustomId('ACC_OVRCONT')` produced a 33-char id against `ACCOUNT_NUMBER`'s `maxLength: 32`
  (the generator's format is `aqa_<prefix>_<13-digit ms>_<3 hex>` = 22 + prefix length) — shortened
  the prefix to `'ACC_OVR'` (29 chars total). Verified via `tsc --noEmit`, `eslint`, `prettier
  --check` after each change; did not re-run the test myself (user's standing preference).
- Updated `docs/module-theory/Idempotency/INDEX.md` (final counts: 45 cases, 38 automated, 7 not —
  full per-case "why" table), and 4 files under `US-01.12.01/`/`US-01.12.03/`
  (`bug-allure-2672-mislabeled-duplicate.md` → marked resolved/deleted,
  `tc07-override-accept-no-permission-200.md` → marked confirmed bug via TB-3031,
  new `bug-ttl-13min-not-1day.md`, new `missing-allure-case-overriderequiredexception-not-cached.md`).

## Learned

- **TB-3029/TB-3031 "QA Compliance Check" tickets exist and are more current than either the Excel
  sheet or the Allure case comments** — they're found via `getJiraIssueRemoteIssueLinks` alongside
  the Story ticket, not by guessing a name. Check for these on any module before trusting an old
  "still in implementing"-style QA comment.
- **Confirmed bug: idempotency cache TTL is ~14 minutes on QA, not the documented 1 day** (TB-3029).
  Confirmed bug: **`/accept` has no permission check at all**, for any actor (TB-3031, AC7 = Fail) —
  this was previously recorded as an open hypothesis in `tc07-override-accept-no-permission-200.md`;
  now it's an official, ticket-backed fact.
- **There is exactly one generic `/accept` endpoint in the whole `proj-bruno-api` collection**
  (`Execute Accept Override`), shared by Technical Idempotency (Layer 1) and Functional Duplicate
  Detection (Layer 2) — confirmed by a full `git grep` for `OverrideRequiredException` (0 hits) and
  for any second accept-shaped endpoint (none). This is *why* case 2674 could be automated using the
  exact same `acceptOperationOverride` client method already proven in US-01.12.03's tests.
- **No cache-flush/TTL-fast-forward/session-expire-early mechanism exists anywhere in Bruno** — this
  is why cases 2667/2675/2678/2679 (TTL) and 2727 (30-min session) stay blocked/expensive rather than
  quick automation wins.
- **`generateCustomId(prefix)` produces `aqa_<prefix>_<13-digit-ms>_<3-hex>` — total length is
  `22 + prefix.length`.** Any field with `maxLength: 32` needs a prefix ≤ 10 chars. Worth adding to
  `docs/common-issues/` if this trips up another module later (not done yet — only one occurrence
  so far, didn't feel like a pattern yet).

## Open Items / Follow-ups

- **2734** (date normalization) vs **BR-3.5**: still needs a BA/QA decision — unchanged from the
  previous checkpoint.
- **2740** (four-eyes): now formally *can't* be automated meaningfully until the confirmed `/accept`
  permission-check bug (TB-3031 AC7) is fixed — not just "open," genuinely blocked.
- **TTL bug** (2667/2678/2679): needs a BA/Dev decision on 1-day-vs-~14-minutes before any of these
  3 can move off Manual.
- **2727** (30-min session): technically automatable via a real 30-minute wait; needs a decision on
  whether that belongs in a slow/nightly suite.
- **Missing Allure case** for the Excel's "OverrideRequiredException response is NOT cached" (AC6):
  flagged for Manual QA to decide whether to re-create it in Allure; not created here.
- User should confirm the new `allureCaseId(2674)` test now passes after the `ACC_OVR` fix (they run
  tests themselves).
- Whether to update Allure's `Automation Status` custom field on case 2674 to reflect it's now
  automated — not done here, needs the user's explicit go-ahead per
  [[feedback_confirm-before-mutating-actions]] (the *delete* of 2672 was explicitly requested this
  session; updating 2674's status field was not).

## References

- Jira: TB-1549, TB-1550, TB-1551 (Stories, all Done), TB-3029, TB-3031 (QA Compliance Checks, Done).
- Confluence: `US-01.12.01 | Technical Idempotency` (pageId 1500184580), `US-01.12.03 | Functional
  Duplicate Detection (ERROR + OVERRIDE)` (pageId 1498611717), both TB space.
- Allure TestOps: project id 2 ("TB CBS"), component "Idempotency & Duplicate Prevention Engine",
  case 2672 deleted, case 2674 newly automated.
- `proj-bruno-api` origin/main @ `44d44205`.
