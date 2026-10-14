# Cosmetic Analysis — MR 61 (TB-1533, `group_1/TB-1533`)

**Lens:** Senior Code Style & Conventions Reviewer (mechanical, line-by-line — no design/necessity verdicts).

## Summary

**Scope correction (2026-07-31):** the initial pass diffed against a stale local `main` ref that
was missing several already-merged commits (TB-1354's Kafka CI/CD work, TB-2225), which made 19
files that are *not* part of MR 61 (`.env.example`, `.gitlab-ci.yml`, `README.md`,
`api/kafka/tests/kafka-health-check.spec.ts`, `api/utils/constants-waiter.ts`,
`api/utils/global-setup.ts`, `api/utils/group-cleanup-helper.ts`,
`api/system_core/helpers/table-registry-helper.ts`, `api/utils/test-ownership.ts`,
`api/utils/paths/kafka-paths.ts`, `package.json`, and others) appear to be part of the diff. MR 61's
actual diff against the correct `main` is **17 changed files / 1,977 insertions, 16 deletions**.
Every finding below has been re-checked against that true 17-file list; findings whose only
evidence lived in one of the 19 out-of-scope files have been removed (see Changelog).

17 changed files / 1,977 insertions, 16 deletions were reviewed in full, in bounded windows,
against `docs/frame-specs/coding-standards.md`, `testing-standards.md`, the current tag taxonomy
(`README.md` + sibling specs), and the full reuse surface (`api/utils/**`, `constants-keeper.ts`,
`api/types/*.types.ts` for the touched domains, `*.values.ts`/`*-api-paths.ts`, existing client
classes). No sampling — every changed line in every changed file was checked, including the
1,225-line new `api/system_core/tests/projection-forms-smoke.spec.ts`.

⸻

## Confirmed Issues

### [Blocking] Comments inside `*.spec.ts` files (zero-tolerance rule)

`coding-standards.md:78-80`: "A comment anywhere inside a `*.spec.ts` file is never acceptable
either, regardless of length or content." `api/system_core/tests/projection-forms-smoke.spec.ts`
adds 9 such comments: `:189` (`// Tracks every table ID created...`), `:243` (`// Clean up created
User Groups while testing`), `:271` (`// Ignore dispose errors`), `:282`, `:386`, `:505`, `:576`,
`:744`, `:861` (the `// Failed- no Rules - https://bank-proj.atlassian.net/browse/TB-1794` /
`// Blocked - ...` annotations placed immediately before 6 of the 10 new tests).
**Fix:** delete all 9 comments; move the Jira-ticket/blocked-reason context into the test name or
drop it — the file has no designated location for a comment at any length.

### [Blocking] Comments in an allowed location exceeding the 1-2 line cap or restating WHAT

`coding-standards.md:72-75`: a comment inside `api/utils/**`/`api/system_core/helpers/**` is
acceptable only "capped at 1-2 lines, stating a WHY that isn't obvious from the code itself —
never a WHAT-restatement." The following comments the diff adds or changes violate this:
- `api/utils/json-helper.ts:9-12` — 4-line comment on `unwrapEnvelope`.
- `api/utils/db-helper.ts:41-46` — 4-line JSDoc on `createDbClient`'s new reconnect wrapper.
- `api/utils/db-helper.ts:413-415` — JSDoc "Polls projection_def.schema until all named properties
  exist" purely restates what `pollProjectionSchemaProperties` already says by name.
- `api/utils/db-helper.ts:439-441` — JSDoc "Polls projection_def until the auto-generated default
  projection exists for a table" purely restates `getDefaultProjectionId`'s name.
**Fix:** delete each of these comments (or shrink to a single short WHY-sentence where a genuine
hidden constraint exists — none of the above state one); the function/constant names already carry
the WHAT.

### [Major] Test names don't match the repo's `TC-<number>: <behavior>` convention

`testing-standards.md:71-72`: "Every test case is named `TC-<number>: <behavior>`... (e.g.
`'TC-004: Table creation fails without mandatory LIV space'`)." Every one of the 10 new tests in
`api/system_core/tests/projection-forms-smoke.spec.ts` instead uses
`'TC-<n> - US-<story> | <feature> | <action>'` (a hyphen instead of a colon, plus an embedded
user-story reference and a pipe-delimited feature/action pair):
`:283`, `:387`, `:506`, `:577`, `:745`, `:862`, `:1010`, `:1078`, `:1128`, `:1166`.
**Fix:** rename each to `'TC-<n>: <precise business-behavior description>'`, moving the US-story
reference into a comment-free location (e.g. the Allure test-case link/description) if it must be
kept.

### [Major] `test.step` narration doesn't match the documented PRECONDITION/STEP N convention

`testing-standards.md:73-76`: "`test.step` narrates PRECONDITION/STEP N." Every `test.step` call
in the new spec instead uses lower-case `'Step N: ...'`, and several inline the word
`PRECONDITION` mid-label with an em dash instead of leading with `'PRECONDITION: ...'`:
`api/system_core/tests/projection-forms-smoke.spec.ts:303, 307, 347, 369, 403, 452, 509, 527, 556,
582, 596, 683, 713, 748, 755, 868, 876, 899, 926, 1013, 1032, 1059, 1081, 1086, 1115, 1131, 1136,
1169, 1177` (29 occurrences).
**Fix:** relabel to `'STEP N: ...'` and `'PRECONDITION: ...'` per the documented pattern.

### [Major] Hardcoded HTTP status literals instead of the existing `TEST_CONSTS.HTTP_STATUS` constants

`testing-standards.md:131-137`: "a hardcoded numeric literal like `toBe(200)`/`toBe(404)` inline in
a spec is a red flag, use (or add) a named constant instead." `constants-keeper.ts`'s `TEST_CONSTS`
already exports `HTTP_STATUS.OK` (200), `.CREATED` (201), `.BAD_REQUEST` (400), `.NOT_FOUND` (404).
`api/system_core/tests/projection-forms-smoke.spec.ts` inlines the raw literals instead, 16 times:
`:81, 325, 340, 352, 414, 424, 440, 459, 601, 891, 936, 1028, 1044, 1110, 1143, 1186`.
**Fix:** replace each literal with `TEST_CONSTS.HTTP_STATUS.OK`/`.CREATED`/`.BAD_REQUEST`/
`.NOT_FOUND` (add a `.CONFLICT = 409` entry to `constants-keeper.ts` for the two `409` usages, which
have no existing equivalent yet).

### [Minor] `getFieldById` duplicates an existing client method under the same name

`api/field-definition/client/field-definition-api-client.ts:15-17` adds
`FieldDefinitionApiClient.getFieldById(fieldId)`, a bare `GET
${FIELD_DEFINITION_API_PATHS.FIELDS}/${fieldId}`. `api/system_core/client/
dynamic-data-dictionary-api-client.ts`'s `FieldRegistryClient.getFieldById(id)` (pre-existing,
unchanged by this diff) already does the same GET against the same `field-registry`/`FIELD.BY_ID`
endpoint, just via a different client class for the same domain.
**Fix:** confirm with the Change Justification lens whether a second `getFieldById` on a second
client class for the same domain is intentional (e.g. `FieldRegistryClient` is being phased out) or
should be consolidated onto one client.

⸻

## Possible Risks

- **[Possible Risk] New DB-polling functions bypass the existing `constants-waiter.ts`
  centralization.** `constants-waiter.ts` (pre-existing on `main`, merged separately via TB-1354)
  states its purpose as "import from here instead of redefining or duplicating a value locally, so
  tuning any of this timing only requires touching one file" — yet `api/utils/db-helper.ts:417`
  (`maxWaitMs = 120_000`), `:443` (`maxWaitMs = 60_000`), and `:427`/`:452` (`delay(3000)`), all
  added by this diff, introduce new local wait literals instead of extending that file.
  **Fix:** add named constants to `constants-waiter.ts` for these four values and import them into
  `db-helper.ts` instead of the local literals.
- **[Possible Risk] Duplicated URL-construction expression instead of the existing helper.**
  `api/system_core/tests/projection-forms-smoke.spec.ts:1704-1706` re-assembles
  `` `${SYS_CORE_API_PATHS.PROJECTION.DEFINITIONS(TABLE_ID)}/${encodeURIComponent(TC02_PROJECTION_ID)}` ``
  by hand — the identical expression already lives inside `fetchProjectionDefinition`
  (`api/system_core/helpers/projection-helper.ts`). The test's own stated intent (verifying the raw
  direct-GET contract) is a plausible reason to bypass the helper here, so this is flagged as a risk
  rather than a confirmed duplicate.

## Nice-to-Have Improvements

- **[Nice-to-Have] `api/utils/dynamic-name-generator.ts:41`**'s new single-line comment on
  `generateNumericTestSuffix` ("Zero-padded 3-digit suffix (000–999) for compact AQA resource
  ids.") is borderline WHAT vs. WHY — acceptable as-is, but could be tightened to just the
  non-obvious part (why 3 digits / why numeric-only) if it's ever revisited.

⸻

## Changelog

- 2026-07-31 — initial cosmetic review of MR 61.
- 2026-07-31 — scope correction: the initial review diffed against a stale local `main` that was
  missing TB-1354's Kafka CI/CD merge and TB-2225, causing 19 files outside MR 61's actual diff to
  be reviewed. Removed 4 findings whose only evidence lived in those out-of-scope files
  (`.env.example` comments, the Kafka health-check test's missing Scope tag, the dangling
  `package.json` npm script, the `kafka-paths.ts` subfolder convention risk, the `global-setup.ts`
  hardcoded interval), narrowed the "comments exceeding cap" finding to drop
  `constants-waiter.ts`/`group-cleanup-helper.ts`/`table-registry-helper.ts`/`test-ownership.ts`
  items, dropped the `constants-waiter.ts` comment Nice-to-Have, and corrected the DB-polling
  Possible Risk's framing (`constants-waiter.ts` pre-exists on `main`, it wasn't introduced by this
  diff). Summary and file/line counts corrected to the true 17-file / 1,977-insertion diff. All
  remaining findings were re-verified against that true diff.
