# Resolving merge conflicts: compare each side's diff-size against merge-base first

## The pattern/symptom

A `git pull`/merge into a long-lived feature branch (TB-3587) produced 7 conflicted files. Several
of them had git-marked conflict regions that looked small (one or two `<<<<<<<`/`>>>>>>>` hunks),
but naively resolving hunk-by-hunk inside the conflict markers was unsafe: in at least two files
(`contract-lifecycle-smoke.spec.ts`, `product-factory-e2e-m2.spec.ts`) the *incoming* side
(`MERGE_HEAD`) had made far more extensive changes to the same file than the conflict markers alone
suggested — content outside the marked regions differed between HEAD and MERGE_HEAD too (git's
merge algorithm only marks a region as conflicting when both sides touch *overlapping* lines; two
nearby-but-non-overlapping independent edits to the same file are silently taken from one parent
without a marker, which can silently discard the other parent's real work).

## The rule

Before resolving conflicts in a file by hand, run:
```
git diff <merge-base> HEAD -- <file>   # what our branch actually changed
git diff <merge-base> MERGE_HEAD -- <file>   # what the incoming side actually changed
```
Compare line counts. If one side's diff is dramatically larger than the other's, that side has done
substantially more work on this file — treat its full content as the base to reapply the smaller
side's diff onto, rather than trying to hand-merge inside just the marked conflict regions (which
can miss silently-overwritten unmarked differences). Concretely: `git show MERGE_HEAD:<file> >
<file>`, then manually reapply the smaller diff's hunks against the new content, checking whether
the larger side already independently made the same fix (in which case skip reapplying it — see the
incident below) or use different identifiers/structure than the smaller diff assumed (in which case
adapt, don't paste verbatim).

A useful side-effect: this comparison itself can reveal that the incoming side already fixed the
exact same problem your branch was fixing, just differently — always check for that before blindly
reapplying your own diff on top (would silently regress the incoming side's approach or duplicate
work).

**If `git merge` reports a conflicted file as "binary" / `file <path>` shows `data` instead of
`ASCII/UTF-8 text`,** don't assume real binary content — grep for a literal NUL byte
(`python3 -c "open(path,'rb').read().count(b'\x00')"` or `grep -c $'\x00' <file>`) before giving up
on text-based conflict-marker resolution. A single stray `\x00` inside an otherwise-ordinary
template-literal string is enough to flip git's binary-file heuristic for the whole file; strip it
(replace with the intended character, usually a space) and the file resolves as text normally.

## The incident

2026-09-07, TB-3587 branch merging in `main` (which had picked up TB-2691 Action Processing and
TB-952 Interest Calculation Engine work along the way). Two files needed the diff-size comparison:
- `contract-lifecycle-smoke.spec.ts`: MERGE_HEAD's diff against base was 1770 lines vs HEAD's 157 —
  MERGE_HEAD had already independently migrated the same two `USERS_DATA`-hardcoded maker sessions
  to `createTestUserSession` (differently structured than HEAD's fix), but left 2
  `'Cbs-User-Context': USERS_DATA.SUCCESSFUL_USER.ID` header-stamp lines un-migrated — reapplying
  HEAD's whole diff verbatim would have reverted MERGE_HEAD's more complete work; only the 2 leftover
  header stamps needed a small manual fix (swapped for the in-scope maker session's own `userId`).
- `product-factory-e2e-m2.spec.ts`: MERGE_HEAD's diff was 2269 lines vs HEAD's 313 — same situation,
  scaled up across 4 test cases, requiring moving a `createTestUserSession` call earlier in each test
  (before a shared setup helper that needed the maker's id) and de-duplicating an accidentally-
  double `let makerSession` declaration this reapplication produced.

Also found while type-checking after resolution (unrelated to the 7 conflicts, initially reported
to the user as "pre-existing brokenness in main" — **corrected after the user pushed back and asked
to double-check via git history, don't just assume**):
`api/account/tests/account-restrictions-locked-amounts-regression.spec.ts` (a brand-new file from
MERGE_HEAD, not conflicted) imports `assignRestrictedUserFullOverrideClasses`/
`restoreRestrictedUserProfile` from `override-dispo-helper.ts` and `USERS_DATA` from
`user-credentials.values.ts`. Checking `git show MERGE_HEAD:...` proved **both APIs still exist on
main** — our own branch's `ae307536` commit (TB-3587) is what deleted
`assignRestrictedUserFullOverrideClasses`/`restoreRestrictedUserProfile` (confirmed safe at the
time: every real caller in *our* tree — `override-dispo-regression/smoke.spec.ts` — had already been
migrated off them), and this session separately deleted the whole `user-credentials.values.ts`
file. This is a genuine cross-file-dependency break with no textual conflict recorded (our deletion
and main's new file never touched the same lines), not an independent bug in main. **Lesson: before
telling a user "X is already broken in main, unrelated to us," verify with
`git cat-file -e MERGE_HEAD:<path>` / `git show MERGE_HEAD:<path> | grep <symbol>` and
`git log -p -- <path>` to find which side's history actually removed what — don't infer provenance
from "it's not one of the 7 conflict markers."** Fixed by migrating the new file to the current
disposable-user pattern (`createTestUserSession`/`createTestUser` + local
`OVERRIDE_CLASSES`-carrying groups for the Chief-Accountant cases, mirroring the already-migrated
sibling `account-restrictions-locked-amounts.spec.ts`), using a Python regex pass for the ~24
near-identical maker/checker boilerplate blocks (19 maker, 5 checker variants) plus manual edits for
3 one-off permission variants and 3 `assignRestrictedUserFullOverrideClasses` call sites.

2026-09-17, `group-3/TB-3911` merging in an updated `main` (which had picked up `group-3/TB-3874`'s
just-merged MR). Confirms the same rule from a different angle — 8 conflicted files, several
resolved by the diff-size comparison above rather than hand-editing inside the markers:
- `api/consolidation_engine/consolidation-engine-db-helper.ts`: modify/delete conflict (deleted on
  `main`, replaced by a restructured `helpers/consolidation-engine-helper.ts`). `git diff
  <merge-base> HEAD -- <file>` showed only two small semantic fixes on our side (an env-var-
  overridable cache TTL, and `FINAL_STATUSES` switched from a hardcoded `['DONE','ERROR']` array to
  `PF_CONSTS.OPERATION_STATUS.TERMINAL`, plus matching message-text updates) against a huge
  structural rewrite on `main`'s side. Accepted `main`'s deletion/restructure and ported the two
  small fixes into the two locations in the new file (and into the new
  `CONSOLIDATION_ENGINE_CACHE`/`consolidation-engine.values.ts` constant `main` had extracted them
  into) rather than fighting the restructure.
- `api/consolidation_engine/tests/consolidation-engine-smoke.spec.ts`: same `FINAL_STATUSES` fix,
  but `main`'s rewrite (6686-line diff) was so large that git's conflict markers actually
  interleaved unrelated regions of the file (a `test.step` block from one part of the file appeared
  spliced next to unrelated code from another), producing markers that looked resolvable but weren't
  — a duplication-heavy spec file confuses git's diff matching. Resolution: `git checkout --theirs`
  the whole file (discard our smaller diff entirely), confirm the two known-fix locations still had
  the old hardcoded pattern (`grep` count matched exactly 2, same as our original diff), then
  reapply the fix textually rather than trusting the marked regions at all.
- `api/product_factory/pf-api-paths.ts`: not a diff-size case — both sides had genuinely different,
  compatible changes (our side refactored the whole file from raw template-literal paths to the
  shared `SYS_CORE_API_PATHS.PROJECTION.RECORD_OPERATION` helper; `main` added new `DELETE` and
  `ACCEPT_OVERRIDE` fields using the old raw-string style). Resolved by keeping our refactored style
  throughout and re-expressing `main`'s two new fields in that style (`RECORD_OPERATION` for
  `DELETE`; kept a local `contractOperationsEngineBase` constant for `ACCEPT_OVERRIDE`, which hits a
  genuinely different microservice base path that the shared helper doesn't model).
- `scripts/test-scripts/npm-scripts/find-test.ts`: this file also hit the binary/NUL-byte issue documented above. Once fixed,
  the real conflict was dead code — `main`'s side was leftover single-file-selection logic
  (`let command: string; ... relFile ... grep`) that a prior multi-file-selection refactor on our
  side had already fully superseded (confirmed via `git show <our-branch>:<file>` showing the clean
  version has no such block at all); resolution was deleting `main`'s dead block entirely, not
  merging it.
