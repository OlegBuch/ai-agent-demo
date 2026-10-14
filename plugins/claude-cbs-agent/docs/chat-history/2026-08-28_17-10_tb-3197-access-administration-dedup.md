# TB-3197 — access-administration-regression.spec.ts deduplication pass

**Date/time:** 2026-08-28 17:10 · **Branch:** group-1/TB-3197 · **Ticket(s):** TB-3197

## Discussed

- Continued the open-ended TB-3197 regression-test workflow for Access Administration, this time
  focused entirely on deduplication/refactoring of `access-administration-regression.spec.ts`
  rather than implementing new manual-QA tickets (no new tickets arrived this session).
- Established (via an `AskUserQuestion`-mediated clarification, then reused implicitly for later
  helper moves) that a "move X to a separate file" request should land in the file matching this
  repo's actual convention for that kind of code — a `helpers/*.ts` file for composed
  test-orchestration logic, a `payload-builder-*.ts` file for payload/fixture construction — not
  wherever the literal wording ("client", "builder") most naturally suggests, when that wording
  doesn't match an existing repo pattern. Confirmed with the user each time before acting.
- Ran a full duplication audit (via a research sub-agent, twice — once broad, once re-verifying
  after several rounds of dedup already landed) to rank remaining duplication opportunities by
  value/risk. Worked through the list top-to-bottom across the session, each time discussing the
  planned shape before implementing.
- Mid-session, discovered independently (not from the user) that the diagnostic HTTP-exchange
  logging in `base-api-client.ts` was still present despite an earlier chat-history doc
  (`2026-08-27_13-07_removed-tc1675-keycloak-permission-blocker.md`) claiming it had been reverted
  in full. Flagged this discrepancy before touching anything; user confirmed removal.
- Discovered a second, unrelated diagnostic-logging block in `auth-service.ts`
  (`attemptKeycloakLogin`/`getKeycloakBruteForceStatus`/`pauseBeforeNextLoginAttempt`) tied to a
  skipped test (TC-1569/TC-1524, Keycloak brute-force lockout) that a prior chat-history doc had
  explicitly said to *keep* for a future restore. Surfaced this contradiction to the user before
  deleting it; user confirmed the restore plan itself was being abandoned (test permanently left
  for manual QA, not just skipped-pending-fix), which is what justified removing the helpers too.
  Updated that doc's "Disposition" section accordingly instead of leaving it stale.
- Near the end of the session, the user manually stripped (outside of any tool call, directly in
  their editor) every remaining comment from `access-administration-regression.spec.ts`. Detected
  this by diffing the working tree against the last auto-checkpoint commit, confirmed the removal
  was total (except one 2-line comment, removed on request afterward), fixed the resulting
  prettier formatting drift, and then removed my own added comments from every helper file touched
  this session on individual follow-up requests (`access-administration-helper.ts`,
  `payload-builder-access-administration.ts`, `auth-service.ts`). One exception: added a
  `console.debug` log line (matching this repo's existing `[module-name] message` convention, e.g.
  `currency-helper.ts`) in place of a comment the user asked to convert into "logging usable across
  the project," in `system-parametrization-helper.ts`.
- Answered a pure discussion question (no code touched) about whether an already-applied signature
  change to `asUserWithPermissions` (raw `APIRequestContext` passed to `run` instead of a
  pre-built `UserGroupApiClient`, now exported) could break other callers. Confirmed safe: zero
  external callers repo-wide, all 4 internal callers in `user-group-helper.ts` already updated to
  match, and `tsc --noEmit -p .` passing clean with this exact state in place.

## Implemented

Seven deduplication rounds against `api/security_management/tests/access-administration-regression.spec.ts`
(39 tests throughout, count unchanged end to end):

1. `submitSystemParameterOverride` moved from a local spec-file function into
   `api/system_core/helpers/system-parametrization-helper.ts` (already home to its sibling
   `inputSystemParameterWithState`, which it deliberately mirrors).
2. `buildCarryOverFields` moved into a new module-level builder file,
   `api/security_management/payload-builder-access-administration.ts`, following this repo's
   existing `api/<module>/payload-builder-<suffix>.ts` convention (precedent:
   `payload-builder-override-dispo.ts`).
3. `assertUserStatusUnchangedAndNoSignOnReset` — new helper in `access-administration-helper.ts`,
   collapsing 4 duplicate "SM.USER STATUS unchanged + no SIGN.ON.RESET record" verification blocks
   (TC-1530, TC-1528, TC-1529, TC-1573).
4. `buildPasswordPolicyPayloadOmitting` — new builder in `payload-builder-access-administration.ts`,
   collapsing 6 duplicate 11-field Password Policy payload literals (TC-1624, TC-1611, TC-1609,
   TC-1610, TC-1608, TC-1623); individual `test()`/`allureCaseId()` calls deliberately left
   unmerged to preserve per-TC Allure/Jira traceability.
5. `asUnauthenticatedUser` — new helper in `user-group-helper.ts`, alongside the existing
   `asUserWith*`/`asUserWithout*` family, collapsing 3 duplicate
   `createUnauthenticatedContext`+dispose blocks (TC-1648, TC-1509, TC-1532).
6. `assertPositiveIntegerFieldBoundary` — new helper in `access-administration-helper.ts`,
   collapsing the 2 structurally-identical "0/-1 rejected, 1 accepted" boundary tests (TC-1651,
   TC-1652); TC-1650 deliberately left standalone (different, structured error-body assertion).
   Required registering the new helper (plus `assertUserStatusUnchangedAndNoSignOnReset`) in
   `eslint.config.mjs`'s `playwright/expect-expect` → `assertFunctionNames` list, since their
   `expect()` calls now live inside a helper rather than directly in the test body.
7. `setUserStatus` — new helper in `access-administration-helper.ts`, collapsing 6 duplicate
   "INPUT SM.USER STATUS, expect 200" blocks (TC-1517, TC-1530, TC-1529, TC-1528, TC-1573 ×2).
8. `withTestKeycloakUser` — new generic wrapper in `auth-service.ts` (alongside
   `createKeycloakUser`/`deleteKeycloakUser`), collapsing all 17
   create-user/try/finally-delete-user boilerplate sites across 16 tests — by far the largest and
   highest-blast-radius change this session (16 of 39 tests touched). Handles the 3 sites with real
   variation: TC-1504 (custom/reused password + `temporary: false`), TC-1518 (called once per loop
   iteration over 3 user types), TC-1573 (two independent sequential calls for `testUser` and
   `whitespaceUser`). A stray unmatched brace introduced mid-edit on the TC-1529 conversion was
   caught immediately by `tsc --noEmit` and fixed before moving on.

Logging cleanup (unrelated to the dedup work above, done mid-session on request):

- Reverted `base-api-client.ts`'s diagnostic HTTP-exchange logging in full (removed `fs`/`path`
  imports, `HTTP_LOG_DIR`/`HTTP_LOG_FILE_PATH`, `formatLogBody`/`writeHttpLog`/`logHttpRequest`/
  `logHttpResponse`, and their call sites in all 5 HTTP methods) — this had been documented as
  already reverted but was not.
- Removed the TC-1569/TC-1524 brute-force investigation helpers in full from `auth-service.ts`
  (`attemptKeycloakLogin`, `getKeycloakBruteForceStatus`, `pauseBeforeNextLoginAttempt`,
  `KeycloakLoginAttemptResult`, `KeycloakBruteForceStatus`, `logLoginAttempt`,
  `LOGIN_ATTEMPT_LOG_PATH`), `KeycloakAdminApiClient.getBruteForceStatus`, and
  `KEYCLOAK_ADMIN_API_PATHS.BRUTE_FORCE_STATUS` — updated
  `docs/chat-history/2026-08-28_tc1569-1524-skipped-sm-user-lockout-sync-gap.md`'s Disposition
  section to "permanently left for manual QA, no restoration path" to match.
- Deleted all `LOG/api-client-*.log` and `LOG/keycloak-login-attempts.log` files. **Mistake made
  here**: the delete command (`rm LOG/api-client-*.log`) matched files back to 2026-08-22, not just
  today's — a prior chat-history doc had explicitly preserved older files from a previous cleanup.
  Flagged honestly to the user immediately; `LOG/` is gitignored so nothing was lost from git
  history, but the older diagnostic logs themselves are unrecoverable.

Comment removal (on explicit request, end of session):

- User manually removed all comments from `access-administration-regression.spec.ts` outside of
  any tool call; I detected it, fixed the resulting prettier formatting drift, and removed one
  remaining 2-line comment on follow-up request.
- Removed my own added comments (docstrings on the new helpers above) from
  `access-administration-helper.ts`, `payload-builder-access-administration.ts`, and
  `auth-service.ts` on individual follow-up requests. Left comments I did **not** add (pre-existing
  section-header comments in `auth-service.ts`) untouched.
- Replaced a comment in `system-parametrization-helper.ts`'s `submitSystemParameterOverride` catch
  block with `console.debug('[system-parametrization-helper] ...', err)`, matching this repo's
  existing bracket-prefixed logging convention elsewhere (e.g. `currency-helper.ts`).

**Verification, every round:** `prettier --write` → `eslint --max-warnings=0` → `tsc --noEmit -p .`
→ `playwright test --list` on the affected file(s), all clean, `Total: 39 tests in 1 file`
preserved throughout. Full-repo `eslint .` was attempted once for the `eslint.config.mjs` change
and timed out (>177s) — verified via the affected files plus `api/security_management/` instead,
both clean.

## Learned

- This repo has an automatic checkpoint-commit mechanism on this branch (commits literally named
  "refactor N") that snapshots the working tree periodically — useful for diffing against when
  investigating an unexpected change to a file (used this to confirm the user's manual comment
  removal really did happen outside my own edits, rather than assuming I'd made a mistake).
- `playwright/expect-expect` (via `eslint.config.mjs`'s `assertFunctionNames` list) needs a new
  entry whenever a helper function moves `expect()` calls out of a test body — otherwise ESLint
  flags the calling test as "has no assertions" even though it's delegating correctly.
- `git diff HEAD -- <file>` combined with `git show HEAD:<file>` is an effective way to isolate
  exactly what changed in a file since the last checkpoint when the cause isn't obvious from tool
  call history alone.

## Open Items / Follow-ups

- Live-run confirmation was outstanding for four of this session's refactors
  (`asUnauthenticatedUser`, `assertPositiveIntegerFieldBoundary`, `setUserStatus`,
  `withTestKeycloakUser`) as of the last static-verification pass. Resolved: the user ran the full
  file (`api/security_management/tests/access-administration-regression.spec.ts`, all 39 tests)
  after this doc was first written and confirmed it passed. This deduplication pass is done — no
  further verification needed.
- The ranked dedup audit from this session was fully worked through; nothing else is outstanding
  from it.
- Older `LOG/*.log` files (2026-08-22 through 2026-08-27) were deleted by mistake this session and
  cannot be restored (see "Implemented" above) — no action needed, just noted in case their absence
  is ever puzzling later.

## References

None.
