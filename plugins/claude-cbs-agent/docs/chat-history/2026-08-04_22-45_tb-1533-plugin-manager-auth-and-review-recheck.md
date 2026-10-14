# TB-1533: PluginManagerApiClient cleanup + review-finding recheck

**Date/time:** 2026-08-04 22:45 · **Branch:** `group-1/TB-1533` (also touched `group_1/TB-2085`
earlier in the same session before the branch changed underneath — see Learned) · **Ticket(s):** TB-1533 (MR !61)

## Discussed
- Walked through the automated review summary for MR !61 (4 low-confidence candidates below the
  80-point bar) and, separately, the full 16-`Пункт` `final_analysis.md` already on record for
  this MR — explaining each finding concretely (exact file:line, mechanism, why it matters) before
  any fix, per the user's explicit "explain what and how first, don't touch code yet" request.
- Diagnosed and explained the self-comparison assertion bug: `expectedSchema` was assigned as a
  reference to the same object later passed as the "actual" argument in the first
  `assertCustomizationSchemaMatches`/`assertCustomizationUpdateSchemaMatches` call inside TC-48 and
  TC-141 — a tautological `expect(X).toEqual(X)` that always passes regardless of content. Judged
  low severity because each test's remaining calls already compare against genuinely independent
  values (parsed server response, DB-persisted schema).
- Diagnosed and explained the `getPlugin({ includeReleases: true })` auth-bypass: this branch
  called `this.request.get(...)` directly instead of `BaseApiClient.get()`, losing retry-on-5xx and
  401-refresh — because `BaseApiClient.get()`'s signature has no `params` support, forcing the raw
  call to pass Playwright's `params` option. Presented two fix options (extend `BaseApiClient.get()`
  signature vs. build the query string manually and stay on `this.get()`); user picked the
  lower-blast-radius option (manual query string).
- Established where the shared knowledge base actually lives (`proj-ai-agentic`, confirmed
  explicitly by the user this session) and which of its two ticket-documentation mechanisms fit
  today's work: `docs/chat-history/` (this file, per `/session-summary`'s intent) vs.
  `docs/review-mr/61-tb-1533-projection-forms-smoke/` (the existing formal review-finding record).
  User chose both.
- Confirmed the local `group-1/TB-1533` branch is 3 commits ahead of, 0 behind,
  `origin/group-1/TB-1533` — i.e. this checked-out branch is MR !61's actual current source state,
  so a local-file-state recheck of `final_analysis.md`'s 16 `Пункт`s is equivalent to checking the
  MR itself even without a GitLab API/fetch round-trip (no network path to the internal GitLab host,
  `10.0.102.50`, from this session).

## Implemented
- `api/system_core/client/plugin-manager-api-client.ts`: moved `assertPluginGetWithoutReleases`
  and `assertPluginGetWithReleases` (plus the `PluginReleaseExpectations` type) out to
  `api/system_core/helpers/plugin-manager-test-helper.ts`, matching this module's own established
  convention (assert helpers live in the `*-test-helper.ts`/`*-helper.ts` file, never the client) —
  the client file now has zero `expect()` calls, and its now-unused `expect` import was removed.
- `api/system_core/tests/projection-forms-smoke.spec.ts`: updated the import and both call sites
  (`:919`, `:967` at the time) from the `PluginManagerApiClient.assertPluginGetWith...` namespace
  form to direct named imports from the helper file. Separately removed the two tautological
  self-comparison assertion calls inside TC-48 (`VERIFY 1` step) and TC-141
  (`STEP: Construct update payload...` step) — the three/two remaining real assertions per test
  (against server response and DB-persisted schema) were left untouched; `expectedSchema` remained
  in use elsewhere in both tests, confirmed not orphaned.
- `api/system_core/client/plugin-manager-api-client.ts`: fixed the `getPlugin({includeReleases:
  true})` auth-bypass — replaced the raw `this.request.get(endpoint, {params, headers})` call with
  `this.get(\`${endpoint}?${new URLSearchParams({'include[]':'releases'}).toString()}\`)`, verified
  the resulting query-string encoding (`include%5B%5D=releases`) is byte-identical to what
  Playwright's own `params` option would have produced, so the wire request is unchanged — only the
  code path (now through `BaseApiClient.get()`'s retry/401-refresh) differs. `uploadPlugin`/
  `updatePlugin`'s multipart bypass was explicitly left untouched, per the review's own conclusion
  that it's architecturally justified and per the user's confirmation not to touch it here.
- `api/field-definition/client/field-definition-api-client.ts`: removed the dead
  `getFieldById(fieldId)` method (zero consumers anywhere in the repo, exact functional duplicate
  of `FieldRegistryClient.getFieldById` in `dynamic-data-dictionary-api-client.ts` — confirmed via
  repo-wide grep before removing, both resolve to the same `GET field-registry/api/v1/fields/{id}`).
- `api/system_core/tests/projection-forms-regression.spec.ts` (on `group_1/TB-2085`, a different
  branch active earlier in this same session — see Learned): removed all four `test.skip` blocks
  (TC-97, TC-121, TC-122, TC-123) plus their preceding comments and the 19 now-orphaned
  payload-builder/constant imports they were the sole consumers of.
- Verification note: `tsc --noEmit`/`eslint --max-warnings=0` consistently hung past this sandbox's
  45s command timeout all session (even `eslint --version` alone took ~11s, and a single-file lint
  run timed out at 40s with almost no CPU consumed — looks like a network/I/O stall in this
  environment, not a real compile issue). Every fix this session was instead verified by direct
  brace/paren balance checks, targeted greps for dangling references, and manual review of the
  diff — flagged to the user each time that a real local `tsc`/`eslint` run is still owed before
  merging.
- Wrote `docs/review-mr/61-tb-1533-projection-forms-smoke/re-review-analysis.md`: verified all 16
  original `Пункт`s from `final_analysis.md` against the current branch state. Result: 9 Fixed
  (1,3,5,6,7,9,10,11,13), 1 Fixed via a different mechanism than suggested (2 — case removal
  instead of `test.fixme` quarantine), 1 Partially Fixed (4 — the `json-helper.ts` location
  resolved by the file being deleted entirely, but `db-helper.ts`'s JSDoc violations remain), 5 Not
  Fixed (8, 12, 14, 15, 16). Пункт 15 is now an *inverted* discrepancy — the widened `[200,201]`
  acceptance was replaced with an exclusive `201` assert, which itself now disagrees with Bruno's
  documented `200`. Every classification was independently spot-checked (not taken on faith from
  the verifying subagent) before being written into the file.

## Learned
- The user has been committing edits themselves, incrementally, in near-real-time as this session
  progressed (all under the recurring message "add projection forms smoke") — `git log` showed
  commits seconds-to-minutes after several of this session's edits landed. This means `git status`
  at any moment mostly reflects only the *most recent*, not-yet-committed edit, not the session's
  full footprint — always cross-check `git log` for a file, not just `git status`, before reporting
  "what changed" across a whole session.
- The repo's active branch changed underneath this session at least once without an explicit
  announcement (from `group_1/TB-2085` to `group-1/TB-1533`, and there's also a third,
  easily-confused `group_1/TB-1533_` branch name in the local branch list) — reconfirmed the
  standing rule that branch/file state must be re-verified via `git branch --show-current` before
  trusting any earlier-session assumption about which files exist or what they contain.
- `docs/chat-history/` (session narrative, via `/session-summary`) and `docs/review-mr/<mr>/`
  (formal per-MR review findings, via the `review-pr-*` command family) are genuinely separate
  knowledge-base mechanisms with different audiences — a session that both writes code and
  addresses standing review findings may legitimately need to update both, as this one did.
- The formal `review-pr-recheck` protocol requires fetching the MR's ref directly from GitLab
  (`git fetch origin merge-requests/<iid>/head`); when that's unreachable (no network path from the
  session to the actual GitLab host), a same-effect fallback is checking the local branch against
  its own remote-tracking branch (`git log branch..origin/branch` / reverse) to confirm the local
  checkout **is** the MR's current source state, then verifying findings against local files
  directly — worth flagging explicitly as a methodology deviation when done this way rather than
  silently presenting it as equivalent to the documented protocol.

## Open Items / Follow-ups
- `re-review-analysis.md`'s Part B (fresh sweep for new issues beyond the original 16) was not
  performed this session — flagged as an open item inside that file itself. A real
  `/execution:review-pr-commands:review-pr-recheck 61` run (with actual GitLab access) would be
  more authoritative than this session's local-state approximation.
- `projection-forms-smoke.spec.ts:741-747` has a conditional (`if (runtimeSchema !== undefined)`)
  that skips an existence assertion, structurally similar to the original Пункт 6 pattern but for a
  different field — needs its own confirmation pass, not yet raised as a formal finding.
- Пункт 8 (test naming convention), 12 (`db-helper.ts` wait-literal centralization), 14 (plugin
  lifecycle read-only degradation), 15 (upload-status/Bruno contract mismatch, now inverted), and
  16 (`resources/` directory undocumented) remain open per `re-review-analysis.md`.
- `getPlugin`'s query-string fix (this session's last code change) was still uncommitted in the
  working tree as of this summary — the user has been committing manually; worth confirming it
  landed.
- Never independently confirmed whether the getFieldById removal (originally done while
  `group_1/TB-1533`, no hyphen with trailing underscore variant, might have been the actual branch
  checked out at that moment per an earlier `git branch --show-current` read) is present on the
  exact same branch as everything else in this summary — re-verified as present on `group-1/TB-1533`
  (current) via direct grep, so the end state is confirmed correct regardless of which branch label
  was live at the moment of the edit.

## References
- MR !61 (TB-1533), GitLab: `bankokam-research-center/tefo-bank/tefo-proj/tefo-proj/proj-test-automation`.
- `docs/review-mr/61-tb-1533-projection-forms-smoke/final_analysis.md` (prior report, read-only
  input this session) and `re-review-analysis.md` (this session's output).
