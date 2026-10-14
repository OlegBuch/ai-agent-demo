# Override-Dispo Regression Refactor, Projection-Forms Timeout Fix, and Enquiry-Regression beforeAll Review

**Date/time:** 2026-08-31 07:37 · **Branch:** group_1/refactor/smoke-m2 · **Ticket(s):** None

## Discussed

- Closed out the projection-forms timeout-margin decision from the previous session (Option C+D,
  already approved by the user as "делаем" before this session's summary point) — no new
  discussion needed, just execution (see Implemented).
- Reviewed `api/system_core/tests/enquiry-regression.spec.ts` against a reviewer comment
  ("beforeAll часто" — beforeAll used too often). Discovered the file does not exist on the
  current branch (`group_1/refactor/smoke-m2`) at all — it only exists on `group-1/TB-3083`.
  Read it there via `git show group-1/TB-3083:api/system_core/tests/enquiry-regression.spec.ts`
  without switching branches. Counted structure: 1 outer `test.describe` (2 `beforeAll` + 1
  `afterAll` + 1 `beforeEach`) plus 7 sibling named `describe` blocks (one per user story:
  US-01.07.01, .01.01, .01.02, .01.03, .02, .03, .04), each with exactly one `beforeAll` scoped to
  that block's own dedicated table/enquiry fixture — 9 `beforeAll` total across 85 tests. Verified
  (per user's explicit follow-up ask) there is no hidden deeper nesting a flat grep might miss:
  checked for `test.describe.serial(`/`.only(`/generic `describe(`/`beforeAll(` variants, and
  confirmed via indentation that dotted-name blocks like `US-01.07.01.01` are siblings of
  `US-01.07.01`, not nested inside it. Concluded the structure is already the idiomatic
  one-beforeAll-per-story-block pattern (low density, ~1 per 9-10 tests) and is not the anti-pattern
  the reviewer's comment implies — recommended asking the reviewer for the specific line/block if
  they had one in mind, since none was evident from the file's structure. Discussion only; no code
  touched (file isn't even on this branch).

## Implemented

- `api/system_core/helpers/projection-forms-helper.ts`: changed
  `TABLE_FIELD_PROPAGATION_TIMEOUT_MS` from `600_000` to `300_000`, completing the Option C+D
  timeout-margin fix (nested `US-1.06.05 | Projection runtime` describe already had
  `timeout: 400000` from the prior session). Verified: `prettier --write` unchanged, `eslint
  --max-warnings=0` exit 0, `tsc --noEmit -p .` exit 0, `playwright test --list` confirmed all 51
  tests intact in `api/system_core/tests/projection-forms-regression.spec.ts`.

- `api/security_management/tests/override-dispo-regression.spec.ts` +
  `api/security_management/helpers/override-dispo-helper.ts` +
  `api/security_management/payload-builder-override-dispo.ts` — full duplication/bug audit
  (discussed first, implemented after explicit "все делаем" / "все четыре" go-aheads):
  - **Bug fix:** the file had a genuine leaked `pg` connection — a shared `dbClient` variable was
    opened in the `US-02.05.02 | Hard-Block Processing` block's own `beforeAll` (which had no
    `afterAll` to close it) and then silently overwritten (not closed) by a second
    `createDbClient()` in `US-02.05.03 | Standard Override Processing`'s `beforeAll`. The
    outer-level `afterAll` then ran a query against whichever client was left in the variable —
    already-ended by the time it fired, risking a spurious end-of-run error. Fixed by centralizing
    `dbClient` creation in one outer-level `beforeAll` and closing it in one outer-level `afterAll`
    only; removed the duplicate creation/cleanup from both nested blocks.
  - **Table consolidation:** merged `hardBlockTableId` and `standardOverrideTableId` (structurally
    identical: same INT classification, same `NEW_TABLE_TYPE`, same `INT_TABLE_SPACES`) into one
    `sharedOverrideTableId`, created once with all 4 trigger fields attached in a single PUT —
    removing one `createTableAndWait` + `waitForProjectionRulesReady` round trip. `authTableId`
    (FIN, required for the auth-required path) stays separate.
  - **Helper extraction** (all added to `override-dispo-helper.ts` unless noted): `registerTriggerField`
    (createField+assert+id reassignment, 7 sites), `updateTableDefinitionAndWaitForRules`
    (updateTableDefinition+assert+waitForProjectionRulesReady, 3 sites),
    `createRuleOrThrow` (createProjectionRule+assert+parse, 9 sites),
    `createOverrideDispoRecordOrThrow` (generic create-record-and-assert-OK wrapper covering
    createErrorRecord/createOverrideRecord/createOverrideClassRecord/
    createOverrideClassDetailsRecord, 11 sites), `createOverrideDispoAdminContext` (wraps the
    repeated `createAuthenticatedApiContext(request, {baseURL, companyCode, realm, userContext:
    CBS_USER_CONTEXT_HEADER})`, applied only to this file's 4 sites — the same pattern recurs 31
    more times across 15 other spec files project-wide, deliberately left untouched per the user's
    "п1 только для нашего случая"), `createUnrelatedOverrideClassFixture` (the 3x-repeated
    "unrelated OVERRIDE.CLASS fixture" block).
  - **Generalized an existing helper instead of keeping a near-duplicate:**
    `assignRestrictedUserFullOverrideClasses`/`runAsRestrictedUserWithClasses` widened from
    `classIds: [string, string]` to `classIds: string[]` (verified backward-compatible — the only
    other caller, `override-dispo-smoke.spec.ts`, always passes exactly 2), and dropped the
    hardcoded "full-permission" wording from the group's `DESCRIPTION` text (cosmetic only, not
    asserted anywhere) so it reads correctly for the regression file's partial/zero-permission
    scenarios too. Deleted the regression spec's local near-duplicate
    `asRestrictedUserScopedToOverrideClasses` function and repointed its 5 call sites (TC-26, 27,
    28, 29, 30).
  - `payload-builder-override-dispo.ts`: added `buildAnyTriggerFieldSchemaProperty(fieldId, title)`
    and `buildAnyTriggerFieldProjectionSchemaProperty(fieldId, title)` (the latter wraps title in a
    `{'en-GB': ...}` multilang map, matching the different shape the projection-definition schema
    needs vs. the table-definition schema) — replaced all remaining inline
    `{id, type, title, 'x-type', 'x-config'}` property literals across 3 sites.
  - Deduped the 4 repeated `buildAnyTriggerFieldSchemaProperty` calls shared between the outer
    `beforeAll` and TC-30 into a local `buildSharedTriggerFieldSchemaProperties()` function.
  - Verification after every step, and again at the end: `prettier --write` (unchanged/reformatted
    as expected), `eslint --max-warnings=0` exit 0, `tsc --noEmit -p .` exit 0 project-wide,
    `playwright test --list` on both `override-dispo-regression.spec.ts` (7 tests: TC-21, 22, 26,
    27, 28, 29, 30) and `override-dispo-smoke.spec.ts` (38 tests, re-checked since its shared
    helper changed) — 45 total, all intact.

## Learned

- A recurring risk pattern worth checking for elsewhere in this suite: a shared `dbClient`
  variable reassigned inside more than one nested `describe`'s `beforeAll` without a matching
  `afterAll` in each block closes it — the last-assigned client silently orphans any earlier one
  (leak) and an outer-level `afterAll` can end up operating on an already-closed client. The fix
  pattern is to own `dbClient` creation/cleanup at exactly one level (ideally the outermost
  `beforeAll`/`afterAll` pair) rather than per nested block.
- `enquiry-regression.spec.ts` (the file behind the reviewer's "beforeAll часто" comment) only
  exists on branch `group-1/TB-3083`, not on this session's active branch — a reminder to confirm
  which branch a referenced file actually lives on (`git show <branch>:<path>` works without
  switching branches) before analyzing or answering questions about it.
- `USER_GROUP_VALUES.PERMISSIONS.MINIMAL` is `[{TABLE: 'SM.USER', FUNCTION: 'SEE'}]` — unrelated to
  override-class permissions, which is what made widening `runAsRestrictedUserWithClasses`'s
  `classIds` param safe without re-auditing every caller's assertions.

## Open Items / Follow-ups

- The `enquiry-regression.spec.ts` reviewer comment was answered by analysis only (branch
  `group-1/TB-3083`); no code was touched there this session. If the user wants that file actually
  adjusted, that would be separate follow-up work on that branch.
- The `createAuthenticatedApiContext(request, {baseURL, companyCode, realm, userContext:
  CBS_USER_CONTEXT_HEADER})` duplication (35 occurrences across 15 files project-wide) was
  explicitly scoped down to this file only per the user's request — a project-wide shared helper
  for it remains an open opportunity if the user wants it later.

## References

None.
