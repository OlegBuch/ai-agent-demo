# Cosmetic Analysis — MR 289 (TB-4035: Audit Fields UI implementation)

## Summary

11 changed files / 1751 inserted, 2 deleted lines reviewed line-by-line, no sampling: `eslint.config.mjs`
(9 lines), `scripts/verify-allure-ids.ts` (1 line), `ui/base/constants/ui-timeouts.ts` (1 line),
`ui/basic-customization/pages/projection-runtime-page.ts` (7 lines), and the entire new
`ui/system_core/audit_fields/` module (`audit-fields-record-schema.ts`, `audit-fields-ui-paths.ts`,
`fixtures/audit-fields-provisioning.ts`, `helpers/audit-fields-setup.ts`,
`pages/audit-fields-record-page.ts`, `tests/audit-fields-regression.spec.ts`,
`tests/audit-fields-smoke.spec.ts`).

Diff target: `origin/main`, merge-base `8538fe335fd7bf473644f3e7dcf698cd289f4a44`. The MR's own `git
log` (after excluding unrelated commits picked up by a stale local `origin/main` ref) carries exactly
two commits: `31e6ebeb "TB-4035, Audit fields UI implementation"` and `3fa74926 "audit fields UI -
stabilization"`.

⸻

## Confirmed Issues

**[Confirmed] Comment added to non-designated file restates WHAT, not WHY**
`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:5` — the new comment
`// "YYYY-MM-DD HH:MM:SS", e.g. "2026-09-23 11:11:14".` above `AUDIT_DATE_TIME_PATTERN` restates what
the regex matches rather than a hidden constraint/why, and `pages/` is not one of
`coding-standards.md`'s designated comment locations (`api/utils/**`, `api/system_core/helpers/**`,
each module's own `helpers/`/`client/` folder) — no comment is acceptable there at any length. Per
this command's own Constraints, any such comment is blocking regardless of size.
Fix: delete the comment; the pattern is already self-describing via its name and the regex itself.

**[Confirmed] British "authorise/authoriser" spelling inconsistent with the established American convention**
Every pre-existing and newly-added identifier that names this concept uses American spelling
(`assertAuthorizeButtonVisible` in `projection-runtime-page.ts`, and this diff's own
`assertAuthorizer`/`assertAuthorizeDateTime`/`assertAuthorizeProjection`/`authOperationRequired`), but
this diff's test-facing prose and one new function name consistently use British spelling instead —
including inside `audit-fields-record-page.ts` itself, where the assertion *messages* say
"authorised"/"Authoriser" while the *method names* right next to them say "Authorizer": lines 118,
174, 181, 188, 199. Also: `helpers/audit-fields-setup.ts:86` (function name
`authoriseRecordAsDifferentUser`) and `:105` (test.step text); `tests/audit-fields-regression.spec.ts`
lines 254, 284, 306, 317, 398, 421, 501, 531, 547, 561, 612, 660, 703, 749, 635 (test.step text using
"re-authorise"); `tests/audit-fields-smoke.spec.ts` lines 166, 203, 206, 223, 260, 280, 317, 320, 397,
400.
Fix: standardize on "authorize/authorizer" throughout every new string and identifier, matching the
codebase's existing spelling.

**[Confirmed] Tag taxonomy: new UI specs use `_m1`, but every existing UI spec uses `_m2`**
`ui/system_core/audit_fields/tests/audit-fields-smoke.spec.ts:27,165,341` (`{ tag: ['@ui',
'@smoke_m1'] }`) and `tests/audit-fields-regression.spec.ts:26` (`{ tag: ['@ui', '@regression_m1'] }`)
— a repo-wide check across all 8 existing UI modules (auth, basic-customization, customization,
field-registry, table-registry, schedule, override-dispo — 30+ tag arrays) found `_m2` used with zero
exceptions and not a single existing `_m1` UI tag anywhere in `ui/`.
Fix: change all four tag arrays to `@smoke_m2`/`@regression_m2` to match the milestone every other UI
suite is currently tagged with, or confirm with the team that Audit Fields UI genuinely belongs to a
different milestone before merging.

**[Confirmed] `test.setTimeout(...)` used inside test bodies instead of the established `test.describe.configure({ timeout })` pattern**
`ui/system_core/audit_fields/tests/audit-fields-regression.spec.ts:72,394,534,615,706` each call
`test.setTimeout(N)` as the first line of an individual test. Every one of these tests already sits
inside its own dedicated nested `describe` block. The established pattern for a long-running,
multi-context test in this repo is `test.describe.configure({ timeout: N })` at the describe level —
used 19 times across existing UI specs (`basic-customization-regression.spec.ts`,
`customization-regression.spec.ts`, `cross-tab-logout.spec.ts`, etc.), against a single pre-existing
`test.setTimeout(...)` outlier (`customization-smoke.spec.ts:180`).
Fix: move each `test.setTimeout(N)` into a `test.describe.configure({ timeout: N })` call at the top
of that test's enclosing `describe` block.
Example:
```ts
test.describe('Company field behaviour (INT/FIN/CUS)', () => {
  test.describe.configure({ timeout: 300_000 });
  // ...
});
```

**[Confirmed] `assertCurrentSpace`'s new timeout parameter invents an options-object shape when the same class already has a bare-parameter equivalent**
`ui/basic-customization/pages/projection-runtime-page.ts:112-115` changes `assertCurrentSpace` to
accept `options: { timeout?: number } = {}`, but the same class's `assertReached` (line 56) already
takes `timeout?: number` as a plain optional parameter for the identical "let the caller override this
wait" concept — an equivalent pattern already exists a few lines away in the same file.
Fix: match the established shape — `assertCurrentSpace(space, timeout?: number)` — instead of
introducing a new options-object convention for this one method.

**[Confirmed] New `PROJECTION_RUNTIME` URL builder duplicates an existing one for the identical route**
`ui/system_core/audit_fields/audit-fields-ui-paths.ts:4-7` defines
`AUDIT_FIELDS_UI_PATHS.PROJECTION_RUNTIME.URL(tableId, projectionId, query)` building
`/proj-web/en/tableRegistry/${tableId}/projections/${projectionId}/runtime` — the exact same route
template already defined as `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME.URL_PATTERN` in
`ui/basic-customization/basic-customization-ui-paths.ts:18-23`. This diff already reuses
`ProjectionRuntimePage` from `ui/basic-customization/pages/` for the same page, so the route
definition should be reused (or composed) from that same module rather than re-derived from scratch
in a second file.
Fix: extend `BASIC_CUSTOMIZATION_UI_PATHS.PROJECTION_RUNTIME` with the navigable-URL variant this
module needs (or import and build on its existing route fragment), instead of declaring a second,
independently-maintained `PROJECTION_RUNTIME` path definition.

**[Confirmed] Hardcoded `'x-type': 'ALPHANUMERIC'` instead of the existing `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` constant**
`ui/system_core/audit_fields/audit-fields-record-schema.ts:8,15` — `api/utils/constants/constants-keeper.ts:272`
already exports `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` as the shared field-type constant pool
`testing-standards.md` documents for exactly this purpose ("field types").
Fix: import `FIELD_CONSTS` and use `FIELD_CONSTS.X_TYPE.ALPHANUMERIC` for both `ID` and `TEST`'s
`x-type` instead of the raw string literal.

**[Confirmed] Split `@playwright/test` imports, inconsistent with every sibling file in this same diff**
`ui/system_core/audit_fields/fixtures/audit-fields-provisioning.ts:1-2` and
`ui/system_core/audit_fields/helpers/audit-fields-setup.ts:1-2` each split their `@playwright/test`
import into two separate `import` statements, while every other new file in this same diff
(`pages/audit-fields-record-page.ts:1`, `tests/audit-fields-regression.spec.ts:1`,
`tests/audit-fields-smoke.spec.ts:1`) merges everything it needs from `@playwright/test` into one
statement.
Fix: merge each pair into a single `import { ... } from '@playwright/test';`.

**[Confirmed] New `assert*` page-object methods only partially registered in ESLint's `expect-expect` allowlist**
`eslint.config.mjs:126-134` adds 9 of the 15 new `assert*`-prefixed methods this diff's own
`AuditFieldsRecordPage` introduces (`assertDisplayed` was already covered by a pre-existing entry) —
but `assertCompareDisplayed`, `assertAuthorizerEmpty`, `assertAuthorizeDateTimeEmpty`,
`assertAuthorizeProjectionEmpty`, and `assertAuthorizerEqualsInputter`
(`ui/system_core/audit_fields/pages/audit-fields-record-page.ts:115,171,178,185,192`) are not
registered anywhere. No current test in this diff happens to call any of these five without also
calling an already-registered assertion in the same test body, so `lint:ci` doesn't fail today — but
the list is meant to cover every custom assertion helper (evidenced by the other 9 entries this same
hunk adds for the same class), and a future test that calls only one of these five would silently fail
`playwright/expect-expect` with a confusing "test has no assertions" error.
Fix: add the remaining 5 method names to the `assertFunctionNames` array alongside the 9 already added.

⸻

## Possible Risks

No issues detected.

⸻

## Nice-to-Have Improvements

**[Nit] Duplicated `{ maxLength: 64 }` object literal within the same file**
`ui/system_core/audit_fields/audit-fields-record-schema.ts:9` and `:16` — `ID` and `TEST` both
declare an identical `'x-config': { maxLength: 64 }` object.
Fix: extract a local `const DEFAULT_FIELD_CONFIG = { maxLength: 64 };` and reuse it for both
properties.

**[Nit] New timeout constant breaks the file's own blank-line concern-grouping**
`ui/base/constants/ui-timeouts.ts:7` — `UI_RECORD_OPERATION_TIMEOUT_MS` is inserted directly after
`UI_API_RESPONSE_TIMEOUT_MS` with no blank line, visually joining an unrelated "record operation"
concern onto the "API response" group, while the rest of the file consistently separates concerns
(retry intervals / API response / modal / dropdown / auth) with a blank line between each group.
Fix: add a blank line before (and, if this constant is expected to grow a group of its own, after)
`UI_RECORD_OPERATION_TIMEOUT_MS`.

⸻

## Exhaustiveness Self-Check

- `eslint.config.mjs`, `scripts/verify-allure-ids.ts`, `ui/base/constants/ui-timeouts.ts`,
  `ui/basic-customization/pages/projection-runtime-page.ts`: every changed line has a working note
  above (findings or explicit pass — e.g. `scripts/verify-allure-ids.ts`'s new allowlist comment was
  checked against the file's own existing comment format and found consistent, no issue).
- `audit-fields-record-schema.ts` (20 lines), `audit-fields-ui-paths.ts` (8 lines): both fully new and
  short enough that every line was individually checked; findings above account for every
  non-boilerplate line.
- `fixtures/audit-fields-provisioning.ts` (121 lines) and `helpers/audit-fields-setup.ts` (137 lines):
  every import, every constant/literal (`ORIGIN_TYPE.LOCAL`, `GROUP_REPLICA_COUNT`, `retries: 5`,
  `~MAIN` suffix construction, `view: 'form'`, `span: 24`) was checked against the reuse surface
  (`constants-keeper.ts`, other UI/API fixtures) and confirmed to match already-established
  repo-wide patterns, with only the import-split finding above surviving as a real defect.
- `pages/audit-fields-record-page.ts` (202 lines): every method was checked against the
  `assertFunctionNames` allowlist and against `ProjectionRuntimePage`'s existing method shapes; the
  comment-hygiene, spelling, and eslint-allowlist findings above account for every real issue found.
- `tests/audit-fields-regression.spec.ts` (835 lines) and `tests/audit-fields-smoke.spec.ts` (412
  lines): every `test.describe`/`test`/`allureCaseId`/tag/`expect` was checked — Story-scoped describe
  nesting, `TC-<n>` ↔ `allureCaseId(n)` number matching (all 12 unique ids match, including the
  intentional `3266` duplicate already allowlisted in `verify-allure-ids.ts`), and assertion-message
  presence (a mechanical sweep found zero bare `expect(...)` calls) all passed with no violations
  beyond what's listed above.

## Commit Message Quality

Both of the MR's own commits pass the mechanical presence check (say something beyond the ticket
key): `31e6ebeb "TB-4035, Audit fields UI implementation"` and `3fa74926 "audit fields UI -
stabilization"`. Neither matches a banned placeholder pattern. No issues detected.
