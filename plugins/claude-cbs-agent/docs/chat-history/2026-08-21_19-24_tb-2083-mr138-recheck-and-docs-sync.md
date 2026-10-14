# TB-2083 / MR !138 — recheck follow-ups and project-spec/frame-specs sync

**Date/time:** 2026-08-21 19:24 · **Branch:** `group-1/TB-2083---` (proj-test-automation) · **Ticket(s):** TB-2083, MR !138

## Discussed

- Continued the item-by-item MR !138 review response from the prior session (recorded there, but
  see "Learned" below — that session's own chat-history file turned out not to exist on disk).
- Walked the user through a re-review (`review-pr-recheck`) result pasted into chat: confirmed most
  of its findings against the actual repo state rather than trusting it at face value. Two of its
  "still open" claims (`isReportingToConflict` fragile substring match, three-shared-officer-records
  tradeoff) were actually already resolved — just not visible to a recheck scoped only to
  `proj-test-automation`'s own diff, because the documentation lives in this separate
  `proj-ai-agentic` repo (`testing-standards.md`'s Known gaps, `README.md`'s new section
  respectively).
- One recheck claim turned out to be **correct and a real regression**: the `setAuthRequired` WHY
  comment (`table-registry-helper.ts`), believed added in the prior session, was verified via
  `grep` to be absent from the actual file on disk — never committed. Re-added this session.
- User asked how to rotate a leaked/expired Keycloak QA password (`KEYCLOAK_PASSWORD`, GitLab
  CI/CD Variable, type "Masked and hidden") — explained the GitLab UI mechanics (delete + recreate,
  since hidden variables have no editable value field); did not view or handle the actual value.
- User asked to document this feature's work for `proj-ai-agentic`, commit, and push. Before doing
  so, audited `git status` in this repo: ~100 files showed as modified, but `git diff
  --ignore-all-space` showed real content changes in only 6 files — the rest was line-ending noise,
  not committed.

## Implemented

**In `proj-test-automation` (branch `group-1/TB-2083---`):**
- `api/types/override-dispo.types.ts`: `HardBlockRejectionResponse.errors` now reuses
  `OverrideConfirmation[]` from `table-registry.types.ts` instead of redeclaring the same shape.
- `api/security_management/helpers/override-dispo-helper.ts`:
  `assertSeededDispoOfficerWithApproveAuthority` now takes a `purpose: string` parameter (matching
  its sibling `assertSeededDispoOfficerDispoAmountCoversViolation`) instead of hardcoding
  `"platform seed required for TC-52"` — the message was already misleading in practice, since
  **TC-34** was also calling this helper, not just TC-52. Both call sites
  (`override-dispo-smoke.spec.ts:1383`/`2804` at the time) updated with real per-test messages.
- Prototyped and then **reverted, at the user's explicit request**, a consolidation of TC-24/TC-25
  into a shared `runDualStandardOverrideAutoApproveScenario` helper — the user preferred the
  asserts/`test.step`s to stay inline in the two tests. Fully reverted: helper function removed,
  its now-unused imports (`buildDualStandardOverrideTriggerRecordPayload`, `waitForRecord`,
  `OverrideDispoRecordInputResponse`) removed from `override-dispo-helper.ts`, `eslint.config.mjs`
  whitelist entry removed, both tests restored to their original bodies.
- `api/types/table-registry.types.ts`: removed the `/** @deprecated ... */` JSDoc comment on
  `RecordInputResponse.overrideIds` (comments aren't allowed in `api/types/*.types.ts` per
  `coding-standards.md`).
- `api/system_core/helpers/table-registry-helper.ts`: re-added the WHY comment above
  `shouldRetryProjectionDefinitionInputWithDataEnvelope` (see "Learned" — this was believed already
  done, but wasn't actually present).
- Verification: `prettier --write`/`eslint --max-warnings=0`/`tsc --noEmit`/`playwright --list` run
  clean after every change above. Live-run confirmation from the user received for TC-24/TC-25 and
  TC-34/TC-52-area changes.
- Left `user-group.types.ts`'s cosmetic `[key: string]` → `[language: string]` rename untouched,
  per explicit user decision ("не трогаем").

**In `proj-ai-agentic` (this repo):**
- `plugins/claude-proj-agent/docs/frame-specs/testing-standards.md`: updated the `security_management`
  row in the per-module automation-maturity table — no longer "stub only"; now notes the real
  53-case `override-dispo-smoke.spec.ts` suite alongside the still-empty `SMApiClient`/placeholder
  health-check. Updated the "Implication for new work" paragraph to match (removed
  `security_management` from the "no existing pattern" list, added a pointer to the new precedent).
- `plugins/claude-proj-agent/docs/project-spec/business-rules.md`: the "Override and Dispo
  Processing" section (added in an earlier, pre-implementation session but never committed) claimed
  tests lived in `api/system_core/tests/override-and-dispo-regression.spec.ts` with only
  `US-02.05.01`–`.03` covered. Corrected to the actual shipped state: MR !138,
  `api/security_management/tests/override-dispo-smoke.spec.ts`, full `US-02.05.01`–`.07` coverage,
  53 cases, `TC-47` gap noted. Removed the "spec-only, no test coverage" qualifiers from the
  Record Authorisation / Dispo Routing / Dispo Review section headers, since all three now have
  live coverage. Fixed a stale `TC-21`/`TC-26` placeholder-numbering reference (hard-block is
  actually `TC-19`/`TC-20` in the shipped suite).
- `plugins/claude-proj-agent/docs/project-spec/access-control.md`: updated the "Override
  Authorisation Matrix" section — no longer "none of this has test coverage", now points at MR !138.
- `plugins/claude-proj-agent/docs/project-spec/domain-model.md`: moved the Override/Dispo entity
  list out of the `system_core` module row into `security_management`'s own row (the entities are
  tested via `system_core`'s clients, but the actual spec file lives under
  `security_management/tests/`); updated the entity-map section's coverage line; removed
  `security_management` from the Bruno-workspace "still-stub modules" list.
- `plugins/claude-proj-agent/docs/project-spec/project-scope.md`: replaced the pre-implementation
  "Newly in active work... zero test coverage" paragraph with a "Shipped" paragraph reflecting MR
  !138's actual final state.
- Wrote this file.
- Left `docs/review-mr/121-tb-2220-enquiry-reporting-framework-smoke/` untouched (unrelated ticket,
  already untracked in this working tree before this session).
- Did **not** stage or commit the ~95 files whose only diff is line-ending noise
  (`git diff --ignore-all-space` empty) — flagged to the user as noise, not real change.

## Learned

- **A prior session's own chat-history file can silently not exist**, even when an earlier summary
  (in this same conversation's own prior-turn context) claimed it was written. This is the second
  time this exact failure mode showed up this session (the first was the `setAuthRequired` WHY
  comment) — always verify a "this was already done" claim against the actual file on disk before
  building on it, especially across a context-compaction boundary.
- **`git status --short` can wildly overstate real changes** when line-ending handling differs
  between how a file was last written and the repo's committed line endings — `git diff
  --ignore-all-space --stat` (or per-file `git diff -b`) is the fast way to separate real diffs from
  noise before deciding what to stage.
- **A re-review/recheck tool scoped to one repo's diff cannot see documentation fixes committed in
  a different repo** — `proj-ai-agentic`'s Known-gaps/README documentation for `proj-test-automation`
  MRs is invisible to any tool that only diffs `proj-test-automation` itself. Worth remembering when
  a recheck says something is "still open" that was actually addressed in the knowledge-base repo.
- `docs/project-spec/` content can be written speculatively **before** an MR actually ships (this
  session found business-rules.md/domain-model.md/access-control.md/project-scope.md content for
  Override and Dispo Processing that pre-dated MR !138's real implementation, sitting uncommitted).
  When picking up a "docs already exist" claim for an in-flight feature, check whether the doc
  describes the plan or the shipped result — file paths and coverage claims are the fastest tell.

## Open Items / Follow-ups

- TC-47 numbering-gap explanation and the "no Allure TestOps cases exist yet" confirmation still
  need to go into the actual GitLab MR !138 description — drafted (English) in this session's chat,
  not yet pasted by the user.
- `setAuthRequired`'s regex retry-behavior change (`table-registry-helper.ts`) has never been
  verified against a full-suite run (`npm run test:api`, not just this one spec) — only the WHY
  comment was added; the "no other caller relied on old blind-retry" claim is still based on
  reading callers, not a live full-suite pass.
- `KEYCLOAK_PASSWORD` GitLab CI/CD Variable rotation — user was walking through the GitLab UI at
  the end of this session; not confirmed done.
- Per this skill's own convention, this file should stay uncommitted until `/create-pr` normally
  handles it — the user explicitly asked to commit+push directly this session instead, which this
  session did as an explicit one-off, not a change to that convention.

## References

- MR !138 review: `docs/review-mr/138-tb-2083-override-and-dispo-processing-smoke/review.md`
  (includes its own dated Changelog entry for the 2026-08-21 recheck).
- Jira: TB-2083, TB-22 (Override and Dispo Processing feature).
