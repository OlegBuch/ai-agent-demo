# Cosmetic Review — MR !156 (TB-1740, Customer (Party) Integration Tests)

## Summary

11 changed files / 3,472 changed lines (2,268 insertions, 1,204 deletions) reviewed line-by-line
against `docs/frame-specs/coding-standards.md`, `testing-standards.md`, and the project's reuse
surface (`api/utils/`, `constants-keeper.ts`, touched `*.types.ts`/`*.values.ts` files).

## Confirmed Issues

**[Blocking] Comments added inside a `*.spec.ts` file — zero-tolerance rule violated (22 occurrences)**
`coding-standards.md:78-84` states a comment is never acceptable anywhere inside a `*.spec.ts`
file, regardless of length or content, because `test.step` narration and the test's name already
carry that role. The new `api/customer/tests/customer-party-integration.spec.ts` adds 22 comments
(including one JSDoc block) at lines: 63, 66, 90, 156-157, 208, 261, 295, 394, 467, 473, 502, 516,
597, 632, 637, 662, 753, 856, 887, 953, 1046, 1107.
**Fix:** delete every one of these comments; where a comment currently explains a hidden platform
behavior needed to understand the test, fold that explanation into the adjacent `test.step` name
instead.

**[Blocking] Four `test.describe` blocks skip the mandatory Story-scoped nesting**
`testing-standards.md:87-91` requires every test case's `describe` to be named
`'US-XX.YY.ZZ | <Story title>'`, copied verbatim from Allure/Confluence, "from the very first test
case added for a Story, not only once a second case forces a split" — never left flat. Four of the
six describes in the new file have no Story-id prefix at all:
`api/customer/tests/customer-party-integration.spec.ts:209` (`'Customer to External User Linkage
Raises a Role-Specific Document Obligation'`), `:468` (`'Customer Profile Defaulting
(CM.CUSTOMER.DEFAULT)'`), `:954` (`'Draft Customer Deletion & Document Checklist Archival'`), `:1047`
(`'Expired Document Blocks Contract Authorisation'`).
**Fix:** prefix each with its actual `US-XX.YY.ZZ | <Story title>`, verbatim from the Allure case's
Story field.

**[Blocking] `.env.example` gains two new-entry comments missing the space after `#`**
Every pre-existing comment in this file uses `# ` (space after the hash) — e.g. lines 2, 5, 9, 29,
59, 91. The diff's two new entries at `.env.example:81` (`#DM CHECKER USER...`) and `:86` (`#CM
CHECKER USER...`) omit it, inconsistent with the file's own established style.
**Fix:** `# DM CHECKER USER (...)` / `# CM CHECKER USER (...)`.

**Reuse-by-name duplicate: raw literal `'CM.CUSTOMER'` where `TABLE.CM_CUSTOMER` already exists in the same file**
`api/customer/tests/customer-party-integration.spec.ts:296` calls
`readRecord(dmContext, 'CM.CUSTOMER', ids.customerId)` with a hand-typed literal, while the same
file already imports and uses `TABLE.CM_CUSTOMER` for the identical value at lines 148, 220 and 393
(and `DM_CONSTS.TABLE.CM_CUSTOMER` at line 264).
**Fix:** replace the literal at line 296 with `TABLE.CM_CUSTOMER`.

## Possible Risks

**Mass removal of `allureCaseId(...)` links (39 occurrences) replaced by bare `TC-N:` name prefixes**
`testing-standards.md:119-126` documents `allureCaseId(<id>)` as the only acceptable way to link a
test to an existing Allure TestOps case, and states the argument is omitted only when "the test is
written from a locally-supplied/pasted case with no Allure entry." This diff removes 39
pre-existing `allureCaseId(...)` calls (ids in the 2665-2730 range) from
`api/system_core/tests/idempotency-regression.spec.ts` and `idempotency-smoke.spec.ts`, replacing
every test name with a bare `TC-<n>: <behavior>` prefix instead — the format documented for tests
with no Allure entry. One test that used to exist (`allureCaseId(2674)`, "OVERRIDE continuation:
accept uses a different scoped key") is removed outright along with its setup.
**Fix:** confirm with the team/Allure TestOps whether these ~39 cases were intentionally
deprecated/renumbered as part of this rewrite; if not, restore the `allureCaseId(...)` links rather
than reverting to the no-Allure-entry naming convention.

**`.env.example`'s two multi-line comment additions are far more verbose than the file's own established one-line-per-entry style**
Every pre-existing comment in `.env.example` is a single line (e.g. lines 2, 5, 9, 29, 59, 91).
The diff's edits at lines 14-16 (3 lines) and 20-25 (6 lines) break that pattern, and
`coding-standards.md:78-84` would in fact ban any comment at all in this location.
**Fix:** trim each block to one concise line consistent with the file's own style, or move the
fuller Keycloak-auth-path rationale into README/doc prose per the same rule.

## Nice-to-Have Improvements

**Inconsistent em-dash spacing in a test name**
`api/customer/tests/customer-party-integration.spec.ts:956` reads `"...deleting a client
draft—documents are not deleted"` with no spaces around the em-dash, while every other em-dash use
in this file (e.g. lines 63, 208, 295) is spaced (`" — "`).
**Fix:** `"...draft — documents are not deleted"`.

**Repeated magic literals `'80'`/`'81'` (RELATION_CODE) with no named constant**
`RELATION_CODE` values `'80'` (Guarantor) and `'81'` (Guaranteed Party) are hard-coded 6 times at
`api/customer/tests/customer-party-integration.spec.ts:678, 723, 751, 779, 803, 854`, with their
meaning currently only documented by the comment being removed per the Confirmed Issue above.
**Fix:** once that comment is deleted, extract two local constants (e.g.
`RELATION_CODE_GUARANTOR = '80'`, `RELATION_CODE_GUARANTEED_PARTY = '81'`) so the meaning survives
without a banned in-file comment.
