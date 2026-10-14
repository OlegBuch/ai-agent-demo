# Cosmetic Analysis — MR !87 (TB-1973: Playwright with Allure TestOps)

## Summary

Reviewed all 13 reviewable changed files (excluding `package-lock.json`, a lockfile) across
~649 insertions / ~834 deletions, every changed line checked against
`docs/frame-specs/coding-standards.md`, `testing-standards.md`, the root `README.md`'s
Conventions/tag-taxonomy tables, and the reuse surface (`api/utils/`, `constants-keeper.ts`,
sibling `*.spec.ts` tag arrays, `scripts/*.ts`). Mechanical verification was also run directly
against the MR head in an isolated worktree: `npx prettier --check` (via stdin, all files) and
`npx eslint` on every touched `.ts` file both pass clean — no formatting or lint-rule violations.

## Confirmed Issues

**[Confirmed - Blocking] Comment hygiene: multiple multi-line and WHAT-restatement comments added by the diff.** Per the mandatory rule ("no comments by default; a comment is acceptable only as a single short WHY-only sentence — never multi-line, never a WHAT-restatement"), the diff introduces several comments that violate this in both files:
- `scripts/verify-allure-testcase-map.ts:1-13` — an 11-line JSDoc header block on a brand-new file, restating what the whole script does plus a usage line, instead of a single WHY sentence.
- `api/utils/api-fixtures.ts:63` — `// Links each test to its Allure TestOps case by title (see README § Linking automated tests).` restates WHAT the following `beforeEach` does rather than explaining a hidden constraint.
- `.gitlab-ci.yml:85-86` — 2-line comment on why a JVM install step is needed.
- `.gitlab-ci.yml:159-160` — 2-line comment explaining the shared `.allure_report_and_upload` template.
- `.gitlab-ci.yml:167-170` — 4-line `TEMPORARY (lead request...)` comment block.
- `.gitlab-ci.yml:173-174` — 2-line comment about the `allurectl` binary/`curl -f` choice.
- `.gitlab-ci.yml:184-185` — 2-line comment about `CI_COMMIT_BRANCH` fallback.

Fix: Collapse each to a single short WHY-only sentence (drop the WHAT-restatement in `api-fixtures.ts:63` entirely; move the longer rationale already duplicated in the new README.md "Allure TestOps upload — operational notes" section out of the inline `.gitlab-ci.yml` comments, and shrink `verify-allure-testcase-map.ts`'s header to one line).

## Possible Risks

No issues detected.

## Nice-to-Have Improvements

**[Nice-to-Have] npm script naming order inconsistency.** `package.json:28` adds `"verify:allure-map": "ts-node scripts/verify-allure-testcase-map.ts"`, which orders as `<verb>:<domain>`, inverting the `<domain>:<verb>` pattern used by the three sibling custom scripts it sits directly beside (`db:cleanup`, `group:cleanup`, `kafka:delete-topic`). Fix: rename to `allure:verify-map` for ordering consistency with its siblings (no CI/doc references would need to change beyond `.gitlab-ci.yml:104` and `.husky/pre-commit:6`).

**[Nice-to-Have] Divider-comment width inconsistency introduced by the diff.** `.gitlab-ci.yml:297` and `:299` changed the `# ===...===` banner around "2. JOBS FOR BRANCH PUSHES / MANUAL / SCHEDULES" from 79 to 80 `=` characters, while the file's two other identical banners (around "1. JOBS FOR MERGE REQUESTS" and "3. …", untouched by this diff) remain at the old width — the file now has two different banner widths for the same visual convention. Fix: revert this banner to the original 79-character width to match its siblings.

**[Nice-to-Have] Inline ad-hoc type instead of a named type.** `api/utils/api-fixtures.ts:10` declares `const ALLURE_TESTCASE_MAP: Record<string, number> = allureTestCaseMap;` with the shape typed inline rather than via a named type alias, which is a soft deviation from `coding-standards.md`'s "shared shapes live in `api/types/*.types.ts`" guidance (this map is tooling/reporting data rather than a domain entity, so the case for extracting it is weak, but a named `AllureTestCaseMap` alias would still self-document the JSON import's shape). Fix: optionally add `type AllureTestCaseMap = Record<string, number>;` next to the constant, or in `api/types/`, if this pattern is reused elsewhere later.

## Changelog

### 2026-07-31 — Recheck against updated coding-standards.md/testing-standards.md

Re-fetched the MR head (`_mr-87-review-recheck`, deleted after use) against `origin/main` — same 14-file diff as the original run — and re-checked every touched line specifically against the four rules newly added since the prior run: (1) `coding-standards.md`'s new "## Comments" section (comments acceptable only inside `api/utils/**` / `api/system_core/helpers/**` / module `helpers/`/`client/` folders, capped 1-2 lines, WHY-only; never acceptable at all in `*.spec.ts`), (2) `testing-standards.md`'s "Unique identifiers" bullet mandating `dynamic-name-generator.ts` over inline `Date.now()`/ad hoc strings, (3) its "Assertions" section mandating a message (with status+body for API responses) on every `expect(...)`, and (4) its constants-keeper.ts bullet flagging hardcoded HTTP status literals. Did not re-litigate any previously-recorded finding except where one of these four rules changes its assessment.

**Rules 2–4 (dynamic-ID generation, mandatory `expect(...)` messages, hardcoded status codes): no new findings.** Verified directly rather than trusting the prior spot-check: the diff's only test-file change, `api/system_core/tests/audit-fields-regression.spec.ts:619` (mojibake fix in the `TC-53` title string), touches only that title line — the adjacent `const id = \`CUST_${Date.now()}\`;` and every `expect(...)` call in that test are untouched context. No other file in the 14-file diff contains an `expect(...)` call, a dynamically-generated identifier, or a hardcoded HTTP status literal on a touched line. These three rules surface nothing new against this MR.

**Rule 1 (Comments — helper/utils-only, capped 1-2 lines, WHY-only; never in `*.spec.ts`): one new finding, plus fix-guidance updates on two already-recorded findings.**

- **[Confirmed - Blocking] New instance, folds into the existing `.gitlab-ci.yml` comment-hygiene issue above.** `.gitlab-ci.yml:163` — `# \`||\`, not \`;\` — a failing test run must not skip the report/upload steps below.` This single-line WHY-only comment was compliant under the old file-agnostic "single WHY sentence" rule and so was correctly not flagged in the original run. Under the new rule it is a violation too: `.gitlab-ci.yml` is not one of the designated comment-carrying locations (`api/utils/**`, `api/system_core/helpers/**`, module `helpers/`/`client/` folders), so brevity and WHY-content no longer save it. Fix: fold this line into the same remediation as the existing `.gitlab-ci.yml` finding — the same `||`-vs-`;` rationale is already documented in this diff's own new "Allure TestOps upload — operational notes" section of `README.md`, so the inline comment can be dropped entirely rather than rewritten.
- **[Assessment update — fix guidance changed, severity unchanged]** `scripts/verify-allure-testcase-map.ts:1-13` — the original Fix ("shrink to one line") is superseded: `scripts/` is not a designated comment-carrying location under the new rule either, so no comment is permitted there at any length. Fix is now: **delete the 11-line header block entirely** rather than shrink it to a single WHY sentence.
- **[Assessment confirmed — no change]** `api/utils/api-fixtures.ts:63` — `api/utils/` *is* a designated location, so the original Fix (rewrite as a single WHY-only sentence, don't remove) still stands unchanged.
- Also checked under the new rule and found compliant (no new findings): `api/utils/api-fixtures.ts:64` (`// eslint-disable-next-line no-empty-pattern -- Playwright requires the fixtures arg to be destructured` — single-line, WHY-only, inside `api/utils/`) and `api/utils/global-setup.ts`'s touched comment (`// Write sentinel so downstream tooling knows setup succeeded` — same, inside `api/utils/`).

**Scope resolution (2026-07-31, post-recheck):** confirmed with the requester that the Comments
rule applies repo-wide, with no carve-out for CI/config/env-template files. `coding-standards.md`
was updated accordingly. This resolves the ambiguity below — `.env.example:23` is promoted from
Possible Risk to Confirmed Issue.

- **[Confirmed - Blocking]** `.env.example:23` — `# Allure (optional for local runs; TestOps upload only applies in CI)` is a new single-line comment outside the rule's designated locations (`api/utils/**`, `api/system_core/helpers/**`, module `helpers/`/`client/` folders). Fix: delete the comment; if the "optional for local runs" nuance is worth preserving, state it in README's environment-variable table instead.

**Summary of this recheck:** two Confirmed Issues net new (`.gitlab-ci.yml:163`, folded into the existing `.gitlab-ci.yml` entry above; `.env.example:23`, promoted from an initially-flagged Possible Risk once scope was confirmed), one Fix-guidance correction on an existing Confirmed Issue (`scripts/verify-allure-testcase-map.ts` — fix is now "delete entirely," not "shrink to one line"), and one existing Fix confirmed unchanged (`api/utils/api-fixtures.ts:63`). Rules 2, 3, and 4 introduced no findings at all against this diff. All other previously-recorded entries stand as originally written.
