# TB-2225/2034 — Orchestrator Review: Table-Group Self-Heal Architecture

**Date/time:** 2026-07-24 14:33 · **Branch:** group-3/TB-2225-FixTableHelper · **Ticket(s):** TB-2225 (references TB-2034's prior self-heal work)

This file documents the 4-round adversarial orchestrator review run via the `Workflow` tool
(`/team:orchestrator architect,aqa-lead,manual-qa,ai-architect`, run id `wf_1dfb3805-1f6`, 20
agents, all completed with no errors). Full raw transcript:
`C:\Users\user\.claude\projects\C--Users-user-proj-test-automation\ea9ef21f-4d40-485c-abaa-af2b7009dcd6\subagents\workflows\wf_1dfb3805-1f6\journal.jsonl`.

## Why this review was commissioned

Despite four bugs found and fixed earlier the same session (poll-deadline/cold-start mismatch,
no-op heal-retry, idle DB connection, 401-retry-budget theft — see the general session summary
`2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md`), the user's complaint was unchanged:
running one test or a batch locally is "very long, very slow, and often fails." The user
explicitly asked whether the four fixes meant "our logic is now correct," and — suspecting the
answer was "the fixes are correct but something bigger is still wrong" — asked for an independent,
adversarial review of the *whole* group-reuse/self-heal architecture (TB-2225/TB-2034), not just
the bugs fixed so far.

## Participants and scope

- **Solution Architect** — architecture-fitness verdict (own domain).
- **AQA Lead** — test strategy/quality-gate fitness (own domain).
- **Senior Manual QA Engineer** — test reliability/coverage/trust-in-signal angle (own domain).
- **AI Architect** — explicitly scoped to the *framework's own process*, not the CBS architecture:
  asked whether the fact that this exact subsystem has now produced bugs across two tickets and
  four sessions (one of which was already an orchestrator review) reveals a process gap — e.g.
  should shared-test-infrastructure changes require a mandatory design-level review before being
  called Done.

## Round-by-round highlights (condensed — full text is in the journal above)

**Round 1 (independent proposals):** Architect, AQA Lead, and Manual QA independently reached the
same verdict without seeing each other's work: the architecture is **not fit for "fast, reliable"
local-dev + CI, and no further patching inside `healGroupIfDead`/`waitForTableApiReady` will make
it fast** — the 150s natural-propagation wait is unconditional, the escalation to a 450s cold
start is the accepted normal cost of registering one table, and it can cascade into a *second*
450s cold start via `healGroupIfDead`. AI Architect scoped its Round 1 to a documentation/process
finding: the lesson that this subsystem needs stronger review has already been written down once
(in TB-2034's own chat-history "Learned" section) and was never enforced.

**Round 2 (peer review):** Reviewers cross-checked each other's file:line citations against the
actual code (not taken on faith) and found: a citation overreach (a `playwright.config.ts` comment
tied to the wrong constant), a missing test-independence/ownership-tracing analysis for batched
table creation, an unquantified "fast enough" bar, and — most consequentially — that
`createTablesAndWait` (the batch table-creation path, used by only 3 of 14 spec files) has **no
self-heal logic at all**, meaning none of the day's four fixes reach it.

**Round 3 (author response):** Each persona accepted nearly all peer feedback with independent
re-verification (not blind acceptance), refined their recommendations into "ship now, no consult
needed" vs. "consult required" buckets, and converged further. AI Architect additionally found and
fixed a *second* dead cross-reference bug — this time in the framework's own docs
(`docs/frame-specs/architecture.md:21` points at a "Shared infra" heading that doesn't exist).

## Round 4 — Final Decision (synthesized from all four Round 3 final proposals)

### Executive Summary

Architect, AQA Lead, and Manual QA converge on one verdict, unchanged from Round 1 through Round
3: the current architecture (one reused table group + self-heal via forced full pod cold-starts,
possibly cascading into a second cold-start) **cannot be made fast by further patching** — today's
four fixes are correct but only harden the *recovery* path, not the cost structure that makes
recovery necessary so often. AI Architect did not vote on the architecture (out of scope by its
own charter) but independently confirmed a second, real problem: this exact failure pattern
(bugs surviving multiple single-agent sessions on the same subsystem, with no live verification and
no explicit fitness verdict ever recorded) has now happened twice.

### Consensus

- `NATURAL_TABLE_PROPAGATION_WAIT_MS = 150_000` (`table-registry-helper.ts:104`) is an
  unconditional wait, not inside any catch/retry branch; escalation triggers
  `COLD_START_WAIT_MS = 450_000` (`global-setup.ts:35`); `healGroupIfDead` can force a *second*
  full cold-start. The project timeout had to be raised to 900s (`playwright.config.ts:99`)
  specifically to give this room — direct evidence the multi-minute happy path is designed-in, not
  accidental.
- `workers: 1` (`playwright.config.ts:94`) serializes the entire suite onto one shared, unowned,
  mutable group — every wait blocks the whole run, and concurrent local developers can race the
  same group with only a naming convention as a guard.
- **New, accepted finding:** `createTablesAndWait` (`table-registry-helper.ts:488-641`, used by
  only 3 of 14 spec files) has no `healGroupIfDead` and no graduated wait — flat throw after 300s.
  None of today's four fixes reach this path.
- The self-heal state machine itself (6 branches) has **zero dedicated test coverage** — found and
  fixed four times only via production-adjacent breakage, never via a test exercising it directly.
- There is no signal today distinguishing "test failed because of a self-heal race" from "test
  failed because of a real product regression" — both produce an identical red Playwright result.
- All three CBS-facing personas agree: **today's four fixes must not be presented to the user as
  having resolved "slow" or "often fails."**

### Remaining Disagreements

- Whether a live measurement run is needed before acting: Architect holds the verdict already
  stands on control-flow evidence (arithmetic on merged constants) and that measurement is only
  needed to size implementation, not to decide direction.
- Whether the 150s propagation wait is a real, undocumented backend NFR or pure test-harness
  overhead (Manual QA's question, accepted by Architect as "the sharpest catch of the round") —
  changes what "fix the root cause" even means.
- Whether the unconditional 30s `additionalWaitMs` (`table-registry-helper.ts:~484`) is pure waste
  or a real settling margin (e.g. Kafka/projection lag) — softened from "delete it" to "confirm
  with backend first" after cross-review.
- AI Architect's proposed fix is procedural, not technical: a mandatory "Shared-Infra Trigger" gate
  in `rules/definition-of-done.md` requiring a recorded design-level orchestrator pass, an explicit
  fitness verdict, a recorded SLO target, and live-run evidence before any future change to this
  subsystem is called Done — directly because a prose-only version of this lesson already existed
  and was ignored once.

### Final Recommendation

**Ship now (test-side, no consult needed):**
1. Reorder `global-setup.ts`'s reuse path — probe pod-warmth *before* calling `refreshGroupEnv`,
   only bump the epoch if confirmed stale (removes a self-inflicted restart on the common path).
2. Confirm with backend/Full-Stack-AQA whether the unconditional 30s wait is load-bearing before
   removing it.
3. Audit whether `waitForTableApiReady` (pod-recognition gate) is actually required at every call
   site, or DB-schema readiness alone suffices for many.
4. Write dedicated test coverage for the self-heal state machine's 6 branches.
5. Add instrumentation/counters for fast-path/escalation/heal/replacement hit rates.
6. Port the missing self-heal logic into `createTablesAndWait` (currently absent for 3/14 files).
7. Add an explicit infra-vs-product-defect signal to test output/failure reporting.
8. Document the backend's ≤5-10-tables-per-group ceiling and the `{retries:1}` polling rule in
   `docs/frame-specs/` — both have surfaced repeatedly across sessions and never landed there.
9. Adopt the "Shared-Infra Trigger" Definition-of-Done gate proposed by AI Architect.

**Consult required (Architect + AQA Lead + backend/DevOps) before committing:**
10. Get BA/Architect to answer whether 150s-to-propagate is a documented product NFR.
11. Escalate the reconciler-trigger behavior to backend as a 3-option design menu (DB-watch /
    gated rescan hook / shorter poll interval).
12. Get a live baseline (real wall-clock + failure-rate data with today's fixes applied) — to size
    the problem, not to decide direction.
13. Don't commit to per-worker/pre-warmed-pool group isolation until a DevOps capacity study
    confirms the cluster sustains N concurrent groups without reproducing today's degradation.
14. Pin a numeric SLO for local-run wall-clock time / self-heal trigger rate.

### Risks

Six distinct failure modes have already been found across two tickets and four sessions on this
same subsystem. Absent structural change, the expectation across all three CBS-facing personas is
a further failure mode from the same substrate — "more correct, never fast." Presenting today's
four fixes to the user as having resolved "slow"/"often fails" would be a false claim.

### Open Questions

- Is the 150s propagation floor a real backend NFR or test-harness artifact?
- Is the unconditional 30s wait load-bearing (Kafka/projection settling) or genuinely removable?
- Does the K8s dev/CI cluster have capacity for N concurrent table groups?
- What is the numeric SLO for "fast enough" / "reliable enough"?
- Does the same unenforced-review-gate gap exist in `aqa-automate.md`/`aqa-update-test.md`
  (flagged by AI Architect as a follow-up audit, not verified this round)?

## References

None (no Jira/Allure/Confluence fetched via MCP). All findings are grounded in direct reading of
`proj-test-automation` source files and this review's own multi-round transcript.




