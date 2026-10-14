# TB-3196 | Access Administration Smoke — Lock & Intent Management (US-02.03.04), hooks review

**Date/time:** 2026-09-02 15:16 · **Branch:** `group-1/TB-3196` (`proj-test-automation`) · **Ticket(s):** TB-3196

## Discussed

- Worked one manual QA case at a time from `US-02.03.04 | Lock & Intent Management`
  (`api/security_management/tests/access-administration-smoke.spec.ts`), implementing each
  `TC-NNN` from a pasted manual case, running the static verification pipeline, handing the user
  an exact `npx playwright test --grep "TC-XXXX"` command, and waiting for the user's live
  pass/fail before moving to the next case. Covered this way this session: TC-3073, TC-3029,
  TC-3057, TC-3059, TC-3064, TC-3066, TC-3070, TC-3072, TC-3071, TC-3069, TC-3062, TC-3067 — all
  confirmed "passed" live by the user. `TC-3068` ("idle until `expiresAt` auto-removes the lock")
  was investigated but not automated — see Open Items.
- User explicitly asked to remove **only** the HTTP request/response logging feature from
  `api/utils/services/base-api-client.ts` (added in an earlier session), leaving retry logic,
  circuit breaker, and token refresh untouched. Done and verified clean.
- A code reviewer flagged "many hooks" (`beforeAll`/`beforeEach`/`afterAll`/`afterEach`) in
  `access-administration-smoke.spec.ts`. Audited every hook in the file with the user; conclusion:
  hook *count* (4 hooks / 15 tests) was not itself excessive, but the file-level
  `beforeAll`/`afterEach` (`SYSTEM.PARAMETER` save/restore) was scoped too broadly — only
  `TC-1606` in `US-02.03.01` actually mutates `SYSTEM.PARAMETER`. User authorized narrowing their
  scope ("сделаем").
- Separately audited the file for literally consecutive/duplicate same-type hooks worth merging —
  user explicitly asked to discuss only, no code changes, for that specific check; none were found
  (each `describe` block's hooks are already distinct in purpose and none directly repeat).
  Drafted/iterated reviewer-response text with the user (multiple revisions, no code impact).
- Checked this `proj-ai-agentic` repo for anything new relevant to hook conventions, per the user's
  request. Found the documented canonical hook-layering template in
  `docs/frame-specs/testing-standards.md` ("Fixture and test structure pattern": file-level
  `beforeAll`/`afterEach`/`afterAll` for db client + shared IDs + run-level cleanup, with a
  per-Story `beforeEach` for client instantiation) — not recently changed, but genuinely useful
  for the hooks discussion. Compared it against the actual precedent file it cites
  (`api/system_core/tests/table-registry-smoke.spec.ts`) and found the precedent itself doesn't
  fully match the doc's own template (its `beforeEach` sits at file level too, and it uses no
  nested `US-XX` `describe` blocks at all) — flagged this discrepancy to the user rather than
  silently picking a side. No decision was reached on whether to restructure the current file
  toward the literal template; this remains open (see below).
- User asked, informationally, how to generate an Allure HTML report from already-run results —
  answered directly (`npx allure generate allure-results --clean -o allure-report` /
  `npx allure open allure-report`), including cmd.exe vs PowerShell command differences the user
  hit live. No code change.

## Implemented

- `api/security_management/tests/access-administration-smoke.spec.ts` — added all 12
  `US-02.03.04 | Lock & Intent Management` smoke tests listed above (`TC-3073`, `TC-3029`,
  `TC-3057`, `TC-3059`, `TC-3064`, `TC-3066`, `TC-3070`, `TC-3072`, `TC-3071`, `TC-3069`,
  `TC-3062`, `TC-3067`), each using `test.step` PRECONDITION/STEP/CHECK narration and asserting
  both the REST response and the underlying `record_lock` row via direct Postgres queries.
  Committed across several commits ending in `5d2545e0 fixed hooks`, which moved the
  `SYSTEM.PARAMETER` save/restore `beforeAll`/`afterEach` from the outer
  `Access Administration - Smoke Tests` `describe` into the nested `US-02.03.01` `describe`
  (verified via full static pipeline + `--list`; not yet re-run live by the user after this
  specific move).
- `api/system_core/client/table-registry-api-client.ts` — added `releaseRecordIntent` (`DELETE
  .../records/:recordId/operations/:operation/intent`) and `refreshRecordIntent` (`PUT`, same
  path) to support `TC-3071`/`TC-3072`/`TC-3067`.
- `api/system_core/helpers/auto-id-helper.ts` — `inputAutoIdRecordIntentWithReadinessRetry` now
  also treats `503 "no healthy upstream"` as a retriable table-not-ready signal (previously only
  `404`/`Unknown tableId` were retried; other `5xx` were immediately fatal). Fixed in the shared
  helper rather than worked around locally, per the user's explicit choice when asked.
- `api/utils/services/base-api-client.ts` — removed the HTTP request/response logging feature
  entirely (imports, constants, `formatLogBody`/`writeHttpLog`/`logHttpRequest`/`logHttpResponse`,
  and every call site in `post`/`get`/`delete`/`put`/`patch`) at the user's explicit instruction.
  Retry/circuit-breaker/token-refresh logic untouched.
- `docs/frame-specs/platform-conventions.md` (local, gitignored copy inside `proj-test-automation`
  itself) accumulated 5 entries this engagement, most recently added this session: table
  classification (`INT`/`FIN`) gating `authOperationRequired`; `LIV`/`NAU`/`HIS` physical schema
  differing by classification; the `TABLE_REGISTRY` permission requirement for intent endpoints;
  the `TC-3068` TTL-not-following-live-config open question; `record_lock` having no `company_id`
  column; and AUTH execution's four-eyes enforcement (inputter ≠ authoriser). The durable ones
  among these are routed into this (`proj-ai-agentic`) repo's own `docs/common-issues/` and
  `docs/module-theory/Security Management/` in this same closeout pass — see below.
- Verification pipeline run after every change this session: `prettier --write` →
  `eslint --max-warnings=0` → `tsc --noEmit -p .` → `playwright test --list --grep "<TC>"` →
  `npx ts-node scripts/verify-allure-ids.ts` — clean throughout.

## Learned

New platform facts discovered live this session, now split between what's genuinely cross-cutting
(routed to `docs/common-issues/`) and what's specific to Lock & Intent Management
(routed to `docs/module-theory/Security Management/US-02.03.04/README.md`):

- **Cross-cutting** (`docs/common-issues/`): a table's `classification` gates whether
  `authOperationRequired: true` can be set on any of its projections at all (`INT` cannot; `FIN`
  can) — folded into the existing `auth-operation-required.md` entry, which already covered the
  per-projection flag but not this table-level constraint. `LIV`/`NAU`/`HIS` physical Postgres
  schema naming differs by classification (`INT`: per-table dynamic schema; `FIN`: one shared
  `<tableId>_<companyCode>` schema) — new entry, `fin-table-schema-naming.md`. Record Intent
  endpoints (Create/Refresh/Release) require a `TABLE_REGISTRY_WRITE` grant separate from the data
  table's own permission, or fail `403 "User does not have access to table: TABLE_REGISTRY"` — new
  entry, `table-registry-permission-for-intents.md`.
- **Module-specific** (Security Management / US-02.03.04): `record_lock` has no `company_id`
  column on either classification (exactly 4 columns: `record_id`/`user_id`/`created_at`/
  `expires_at`); AUTH execution (not AUTH-intent-holding) requires the authoriser to be a
  different user from the inputter, confirmed with the exact `403` error text; `TC-3068`'s premise
  (reducing `AUTOLOG_TIME_MINS` live shortens the very next lock's TTL) did not hold in a live
  probe — open question, not yet resolved, see Open Items.
- This repo's own documented canonical hook-layering template
  (`docs/frame-specs/testing-standards.md`) is not itself fully consistent with the precedent file
  it cites — worth keeping in mind before treating that template as a literal, enforceable
  contract in a future hooks discussion.

## Open Items / Follow-ups

- **`TC-3068`** ("idle until `expiresAt` auto-removes the lock") remains unautomated. Reducing
  `AUTOLOG_TIME_MINS` live via `SYSTEM.PARAMETER` right before creating a lock did not shorten
  that lock's `expiresAt` in a live probe (still ~15 min out, not ~1 min, ~19s after the config
  change was confirmed via `SEE`). Root cause not yet determined — could be config caching on some
  interval, or `expiresAt` not actually being driven by `AUTOLOG_TIME_MINS` at all. No fast way to
  shrink the real TTL has been found; the case can currently only be exercised by waiting out the
  real default, which doesn't fit the smoke suite's timeout budget as designed. Needs a BA/Dev
  decision or further live investigation before it can be automated.
- The hooks-scoping fix (moving `SYSTEM.PARAMETER` `beforeAll`/`afterEach` into `US-02.03.01`,
  commit `5d2545e0`) was verified statically (prettier/eslint/tsc/`--list`/`verify-allure-ids`)
  but **not yet re-run live** by the user after that specific change.
- Whether to restructure `access-administration-smoke.spec.ts` toward the literal
  `testing-standards.md` hook template (file-level db client/shared-IDs `beforeAll` + per-Story
  `beforeEach` for client instantiation) is still an open discussion — no decision made, see
  Discussed above. The current file has no file-level hooks at all; each Story's own hooks are
  scoped to what only that Story actually needs (`US-02.03.01`'s `SYSTEM.PARAMETER` pair,
  `US-02.03.04`'s shared-table pair), which the doc's own "layered cleanup" note supports as valid
  even though it doesn't match the literal top-of-file template.
- Reviewer conversation about the hooks (count + scoping) is still in progress outside this
  session — response drafts were iterated with the user but no final text was confirmed sent.

## References

- Jira: TB-3196 (branch `group-1/TB-3196`), TB-3431 (linked bug referenced by the manual cases for
  `TC-3062`/`TC-3069`, confirmed frontend-only and not affecting the API-level test design).
- No Confluence/Allure links were fetched or created this session beyond what's already covered by
  `allureCaseId(...)` on each test.
