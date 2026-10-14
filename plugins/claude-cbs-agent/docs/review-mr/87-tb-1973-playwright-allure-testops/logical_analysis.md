# Logical Analysis — MR !87 (TB-1973: Playwright with Allure TestOps)

## Summary

TB-1973 ("[Automation Framework] Integrate Playwright with Allure TestOps") asks to deactivate
the existing Report Portal integration, wire Allure TestOps in its place (adapter, result
generation, CI upload, environment/launch/build metadata, and test-case linking), and document
the new process. The diff does exactly this: `.env.example`/`.gitlab-ci.yml`/`README.md` swap
every `REPORTPORTAL_*` reference for `ALLURE_*`; `README_RP.md` and `api/utils/rp-reporter-guard.ts`
are deleted along with the RP probing logic in `global-setup.ts`; `playwright.config.ts` and
`package.json`/`package-lock.json` swap the RP reporter/dependency for `allure-playwright`,
`allure-js-commons`, `allure-commandline`; a new `.allure_report_and_upload` CI template generates
the HTML report on every run and uploads to TestOps only on a manually-triggered `main` run
(explicitly flagged `TEMPORARY`, with an exit criterion documented in README); and a new
title-based linking mechanism (`test-data/allure-testcase-map.json` + a `beforeEach` hook in
`api/utils/api-fixtures.ts` + a new guard script `scripts/verify-allure-testcase-map.ts`, wired
into both `.husky/pre-commit` and CI) attaches an `ALLURE_ID` label to 304 of the suite's 504
tests. The one test-file change (`api/system_core/tests/audit-fields-regression.spec.ts:619`) is
a mojibake fix to a test title, made necessary because the new linking mechanism matches on the
exact title string. This is pure test-infrastructure/tooling work — no new CBS test cases, no
Bruno-relevant endpoint/client/type additions — so the AQA-automate Mapping table (case-type →
layer) does not apply to anything in this diff.

## Confirmed Issues

**[Confirmed] Undocumented new env var `ENV_TARGET` referenced in `playwright.config.ts`.** The
new `environmentInfo` object passed to the Allure reporter config sets
`environment: process.env.ENV_TARGET ?? process.env.BASE_URL ?? 'local'`, but `ENV_TARGET` is not
declared or described anywhere in the diff's own `.env.example` or README.md's environment-variable
table (both fully rewritten in this MR to cover every other new `ALLURE_*` var), nor in
`.gitlab-ci.yml`. As written, this fallback is currently dead code in every documented environment.
Fix: either add `ENV_TARGET` to `.env.example` and README's variable table with a description of
when it should be set, or drop the fallback and read `BASE_URL` directly.

## Possible Risks

**[Possible Risk] Three duplicate-value collisions in `test-data/allure-testcase-map.json`.**
Direct inspection of the new map's 304 entries found three pairs of different test titles resolving
to the same Allure TestOps case id: `"TC-1: [AUTH] Four-Eyes Principle — Same User INPUT + AUTH
Rejection"` and `"TC-32: ..."` both → `114`; `"TC-3: [HOLD] INPUTTER Array Does Not Grow on Repeated
HOLD"` and `"TC-20: ..."` both → `102`; `"TC-053: HOLD operation successfully overwrites an existing
HOLD draft in NAU space"` and `"TC-073: HOLD operation overwrites an existing HOLD draft in NAU
space"` both → `58`. Neither the new `scripts/verify-allure-testcase-map.ts` (which only flags
orphaned *keys*, never duplicate *values*) nor README's documented unlinked-test breakdown (179
no-match / 19 lost-fuzzy-match / 2 ambiguous — all describing tests *outside* the map) accounts for
this failure mode, so two functionally distinct automated tests will silently report into the same
TestOps case's execution history. Fix: extend `scripts/verify-allure-testcase-map.ts` to also fail
on duplicate values (unless explicitly allow-listed), and manually confirm in TestOps whether these
three pairs are a deliberate one-case/two-tests design or map-building mistakes.

**[Possible Risk] `verify-allure-testcase-map.ts`'s title regex silently drops template-literal
titles.** `TITLE_RE = /\btest(?:\.skip|\.fixme|\.only)?\(\s*['"]((?:[^'"\\]|\\.)*)['"]/g` only
matches single/double-quoted `test(...)` calls; a title written as a template literal
(`` test(`TC-${n}: ...`) ``) would never be added to the collected-titles set, so any map entry for
such a test would be misreported as orphaned (or the test could never be linked at all) with no
indication of why. No such titles were found in the current suite, but nothing prevents one being
added later. Fix: widen the quote-character class to include backticks, or explicitly forbid
template-literal test titles via lint rule.

**[Possible Risk] TB-1973's "correctly linked" AC is ~60% satisfied with no tracked follow-up.**
The ticket's scope states "Ensure test cases are correctly linked between automation and Allure
TestOps," but README's own new "Linking automated tests" section reports only 304 of 504 tests
linked, with 200 unlinked across three documented categories — and the Jira issue has no linked
sub-task or comment tracking closure of that gap. Fix: file a follow-up ticket (or link one if it
already exists outside what this fetch could see) so the remaining 200 tests don't fall off the
radar once this MR merges.

## Nice-to-Have Improvements

**[Nice-to-Have] `test-data/allure-testcase-map.json` sits outside the folder's documented
purpose.** `docs/frame-specs/architecture.md`'s top-level layout describes `test-data/` as holding
"factory functions building request payloads" (`payload-builder.ts`, `users-data-builder.ts`); the
new file is static reporting/lookup metadata, not a payload factory. Fix: consider relocating it
next to its sole consumer, `api/utils/api-fixtures.ts`, or into a new `config/`-style folder, if the
distinction matters for future readers.

**[Nice-to-Have] `.husky/pre-commit`'s new `npm run verify:allure-map` re-scans every `*.spec.ts`
file on every commit**, even commits that touch neither a spec file nor the map itself (e.g. a
README-only change). Fix: gate the check on whether staged files include a `*.spec.ts` file or
`test-data/allure-testcase-map.json` (e.g. via `lint-staged`) to avoid the unconditional full-repo
scan.

**[Nice-to-Have] `scripts/verify-allure-testcase-map.ts` diverges from sibling scripts' entry-point
convention.** `scripts/cleanup-group.ts` and `scripts/cleanup-test-schemas.ts` both call
`main().catch((err) => { console.error('Fatal error:', err); process.exit(1); })`; the new script
calls bare `main();` with no wrapper. Functionally fine today since `main()` is fully synchronous,
but it's an avoidable inconsistency with the one other pattern this repo's `scripts/` folder
otherwise follows. Fix: wrap it the same way for consistency, even though it's currently a no-op
change in behavior.

## Necessity Citations

- **`ALLURE_*` env vars** (`.env.example`, `.gitlab-ci.yml`, `README.md`) — cited: TB-1973
  description, "Configure environment, launch, and build metadata" / "Configure Allure TestOps
  integration with the framework."
- **New dependencies `allure-commandline`, `allure-js-commons`, `allure-playwright`**
  (`package.json`) — cited: TB-1973, "Configure the Allure adapter and result generation."
- **Removal of `@reportportal/agent-js-playwright`, `REPORTPORTAL_*` vars, `README_RP.md`,
  `api/utils/rp-reporter-guard.ts`, and the RP probe in `global-setup.ts`** — cited: TB-1973,
  "Deactivate the current ReportPortal integration with the Playwright framework."
- **New `.allure_report_and_upload` CI template + `allure-results`/`allure-report` artifact
  paths** (`.gitlab-ci.yml`) — cited: TB-1973, "Set up automated upload of test execution results
  to Allure TestOps" / "Verify integration with the CI/CD pipeline for automatic reporting." The
  narrower "manual run on `main` only" upload gate is **not** cited by the ticket itself — its only
  justification is an inline diff comment ("TEMPORARY (lead request...)") and the new README
  "operational notes" section, both in-repo, not a Jira/Confluence record of the lead's decision.
- **JRE install step** in `.default_job`'s `before_script` (`.gitlab-ci.yml`) — cited: inline diff
  comment stating the technical cause (`npx allure generate` shells out to a JVM the Playwright base
  image lacks); a self-evident technical fact, no external doc, treated as sufficient.
- **`api-fixtures.ts`'s new `beforeEach` hook + `ALLURE_TESTCASE_MAP`/`allure.allureId(...)`
  call** — cited: TB-1973, "Ensure test cases are correctly linked between automation and Allure
  TestOps," and follows the existing test-scoped/worker-scoped fixture-hook pattern already
  documented in `docs/frame-specs/architecture.md`'s "Fixtures" section.
- **New `scripts/verify-allure-testcase-map.ts`, its `verify:allure-map` npm script, and its
  `.husky/pre-commit` wiring** — cited: TB-1973, "Ensure test cases are correctly linked...," plus
  the script's own JSDoc rationale (guards against silent map/title drift).
- **New `test-data/allure-testcase-map.json`** — cited: README's new "Linking automated tests"
  section, which documents its exact format and purpose (see also the Nice-to-Have on its folder
  placement above).
- **Project-level `ALLURE_PROJECT_ID` override** — cited: README's "operational notes" section
  explicitly documents the org's group-level CI variable precedence and why the project-level
  override is required; a good example of a decision that *is* fully cited.
- **`ENV_TARGET` reference in `playwright.config.ts`'s `environmentInfo`** — **no citation found**;
  see the Confirmed Issue above.
