@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/severity-taxonomy.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/gitlab-mcp-access.md

---

# /execution:review-pr-commands:review-pr-recheck

## Role

Follow-up verification command: after `review-pr-orchestrator.md` has already produced
`final_analysis.md` for an MR, its Ready-to-paste comment was posted, and the author pushed
fixes, this command re-checks that same MR against that prior report. Draws on the same three
lenses the split commands use — Senior Code Style & Conventions Reviewer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/code-style-agent.md`), Senior Full Stack AQA Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`), Senior QA Test Automation Lead
Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`) — but never the Senior Change
Justification Reviewer's adversarial debate: a new necessity citation this command surfaces is
recorded, not argued — challenging it stays `review-pr-orchestrator.md`'s job on a fresh run.

Fills a real gap the other three commands leave open: re-running any of `cosmetic_analysis.md`/
`logical_analysis.md`/`final_analysis.md`'s own commands after a push only appends a dated
Changelog entry to that same file — `review-pr-orchestrator.md`'s own Step 0 explicitly reads an
existing `cosmetic_analysis.md`/`logical_analysis.md` "as-is — do not re-derive their findings"
once both already exist, so none of the three ever actually re-checks whether a previously flagged
line was fixed, or scans the pushed commits for something new. This command is that missing step,
and is the only one of the four in this family that reads the other three's output as its own
input rather than producing a first-pass finding.

Distinct from `review-pr-orchestrator.md` (produces the *first* `final_analysis.md` and its Change
Justification Debate; never re-verifies a fix) and from `aqa-review-test` (Allure-case fidelity
against an API contract, not a diff).

⸻

## Mission

For one GitLab merge request that already has a `final_analysis.md`: verify, file:line by
file:line, that every issue raised in its Ready-to-paste comment was actually fixed in the
branch's current state, and separately sweep the MR's current diff for anything new worth raising
— writing both into `re-review-analysis.md`. Never post to GitLab, never edit the MR's code, never
rewrite `cosmetic_analysis.md`/`logical_analysis.md`/`final_analysis.md`.

⸻

## Argument Format

```
/execution:review-pr-commands:review-pr-recheck <mr-iid>
/execution:review-pr-commands:review-pr-recheck /merge_requests/<mr-iid>
/execution:review-pr-commands:review-pr-recheck <full-gitlab-mr-url>
```

Run with `proj-test-automation` (or a clone of it) as the session's working directory.

## Examples

```
/execution:review-pr-commands:review-pr-recheck 72
```
→ Reads `docs/review-mr/72-tb-2102-<slug>/final_analysis.md`'s Ready-to-paste comment, re-fetches
MR 72's current diff, verifies every `Comment N` against the branch's current state, sweeps for new
issues, and writes `re-review-analysis.md` in the same folder.

⸻

## Preconditions

- `docs/review-mr/<mr-iid>-<slug>/final_analysis.md` must already exist for this MR in the
  resolved `proj-ai-agentic` working tree. If it doesn't, stop and tell the user to run
  `review-pr-orchestrator` first — never guess prior findings or fabricate a baseline to recheck
  against.
- The session's working directory has `proj-test-automation`'s actual GitLab remote as `origin` (or
  one pointing at the same project).
- The plugin's GitLab MCP (`gitlab-mcp-access.md`) is the primary way to read the MR, its commits
  and — crucially here — its discussion threads; `git fetch` access to that GitLab host remains
  the fallback, same as the other three commands in this family.
- If neither the MCP nor GitLab merge-request refs work, ask the user for the MR's source branch name.

⸻

## Protocol

### Step 1 — Gather (Haiku, per Model-Routing Convention above)

Spawn Gather subagent(s) to produce one context bundle containing:

1. `final_analysis.md` in full — its merged Confirmed Issues/Possible Risks/Nice-to-Have entries
   and, specifically, its Ready-to-paste GitLab comment's numbered `Comment N` list, which is the
   authoritative record of what was actually communicated to the MR's author. Also read
   `cosmetic_analysis.md` and `logical_analysis.md` for each comment's original cited evidence and
   violated convention/pattern.
2. The MR's current diff and commit log — same GitLab-MCP read as the other three commands'
   Step 1 item 1 (`gitlab-mcp-access.md`; fallback `git fetch origin
   merge-requests/<iid>/head:_mr-<iid>-review` only after the user's yes, diff against
   `main`/`origin/HEAD` unless the MR states another target, then delete the temporary branch, again
   only after a yes). Also: `get_merge_request`'s head
   `sha` vs the head recorded in the prior analysis (equal = nothing was pushed, state it first),
   `list_merge_request_versions`, and `mr_discussions` — what was actually posted, each thread's
   `resolved`/`resolved_by`, and any reply from the author. A missing `final_analysis.md` is the
   stop case in Preconditions, even when the MR has posted threads — never reconstruct a baseline
   from them.
   This must be the MR's full current diff against its base, not merely the commits pushed since
   the last review — a fix can touch lines the most recent commits don't.
3. From the resolved `proj-ai-agentic` working tree: the same reference set
   `review-cosmetic-pr.md` and `review-logical-pr.md` each read in their own Step 1 —
   `docs/frame-specs/coding-standards.md`, `testing-standards.md`, `architecture.md`, the current
   tag taxonomy, the full reuse surface, and (read-only, via the `claude-proj-agent:atlassian-routing` skill) the ticket's Acceptance
   Criteria — needed for Part B below.

If GitLab MR refs are disabled (the fetch fails), stop and ask the user for the source branch name
directly rather than guessing.

### Step 2 — Judge (Sonnet, per Model-Routing Convention above)

Two mandatory parts, both required before writing the output:

**Part A — Fix verification (exhaustive).** For every `Comment N` in `final_analysis.md`'s
Ready-to-paste comment, locate its original `file:line` (following the line if the file was moved
or refactored) in the current branch state and classify it:

- **Fixed** — the cited defect is gone; cite the current line(s) that prove it.
- **Not Fixed** — the defect is still present as originally cited.
- **Partially Fixed** — a comment that originally enumerated more than one `file:line` (a collapsed
  repeated-pattern entry) where some, but not all, of those locations were corrected. **Every**
  enumerated location must be checked individually — never conclude "Fixed" from checking only the
  first one.
- **Regressed** — the defect was fixed by an earlier commit in this same push and then
  reintroduced by a later one.

No comment may be skipped or left unclassified.

**Part B — Fresh sweep (new problems only).** Apply `code-style-agent.md`'s own **Line-Level
Review Checklist**, **Reuse-Surface Pattern Matching**, **In-File Duplication**, and **Commit
Message Quality** sections, plus `fullstack-aqa-agent.md`'s own **Test Automation Review
Checklist** (including its in-file duplicate-scenario, text-quality, and security-hygiene items),
`review-logical-pr.md`'s Step 2.1 Known-Issue cross-check (against `docs/common-issues/`,
`docs/module-theory/` Patterns, and `docs/review-mr/_pattern-log.md` if it exists), and
`aqa-lead-agent.md`'s own **Test Review Checklist**, over the MR's full current changed-file list — same exhaustive, per-line, no-sampling standard as `review-cosmetic-pr.md`/
`review-logical-pr.md`, including that pair's own Per-Line Rationale Pass and Red Flags table
(don't restate those tables here — hold the same discipline while running this sweep). Report
**only** findings not already present in `cosmetic_analysis.md` or `logical_analysis.md` (whether
those were marked fixed or not in Part A above — anything already on record there is Part A's
concern, not a new finding here). A new endpoint/client method/type/pattern/npm dependency
introduced by a fix carries the same necessity-citation requirement `review-logical-pr.md`'s Step 2
defines — record the citation (or its absence); a fix that leaves something orphaned gets the same
Orphaned Code treatment. Do not run the Skeptic's adversarial debate here.

Before finalizing, re-check every classification and every new finding against the actual current
branch state — drop or downgrade anything not directly evidenced.

⸻

## Output

Write to the resolved `proj-ai-agentic` working tree:

```
docs/review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/re-review-analysis.md
```

If this file already exists (a third or later round after another push), append a dated entry
under an internal `## Changelog` rather than overwriting prior rounds.

`re-review-analysis.md` contains:

1. **Summary** — one paragraph: how many comments were verified and their Fixed/Not
   Fixed/Partially Fixed/Regressed split, and whether the fresh sweep found anything new.
2. **Fix Verification** — one entry per `Comment N` from `final_analysis.md`: `Comment N — [Status]
   Title`, then 1-2 sentences citing the current `file:line` evidence for that status. A
   Partially Fixed entry lists every enumerated location's own status.
3. **New Findings** — same format as the other three commands, per `severity-taxonomy.md`'s
   Finding Entry Format (header/what-where-why/`Fix:`/optional `Example:`). Include any Orphaned
   Code found by the fix. State `No new issues detected.` when empty. The Part B sweep also writes
   the Coverage table defined in `severity-taxonomy.md`, one row per changed file.
4. **Ready-to-paste GitLab follow-up comment** — mandatory: one entry per still-open item — every
   Not Fixed/Partially Fixed/Regressed `Comment N` (keeping its original number) plus every new
   finding at every severity, renumbered continuing after the highest original `Comment N` (or
   starting at 1 if none carry over). Never includes an already-Fixed comment. English, grouped
   under short topic headings, plain text, same `Comment N` / `Fix:` / optional `Example:` template
   as `final_analysis.md`, and carries no AI/Claude/Anthropic self-attribution (per
   `base-agent.md`'s "Commit, Comment & Attribution Hygiene"). The same list is also given to the
   user in chat.

⸻

## Constraints

- Never post a comment, review, or approval to GitLab — findings-file only.
- Never edit the MR's code, tests, or any Allure case.
- Never call a GitLab REST API by hand or use the GitLab MCP's write tools — the read-only rule is
  in `gitlab-mcp-access.md`; the user posts comments themselves.
- Never treat a `resolved` thread as proof of a fix — check the code at the cited line.
- Never modify `cosmetic_analysis.md`, `logical_analysis.md`, or `final_analysis.md` — they are
  read-only inputs; this command's own output is `re-review-analysis.md` only.
- Never mark a comment **Fixed** without citing the actual current `file:line` evidence.
- Never skip an enumerated `file:line` inside a collapsed repeated-pattern comment — check every
  one before classifying.
- Never run the Skeptic's adversarial debate here — a new necessity citation is recorded, not
  argued; that requires a fresh `review-pr-orchestrator` run.
- Fallback branch `_mr-<iid>-review`: created and deleted only after the user's yes, never left
  behind — see `gitlab-mcp-access.md`.

⸻

## Definition of Done

- `final_analysis.md` (and `cosmetic_analysis.md`/`logical_analysis.md` for original evidence)
  were located and read in full before any verification began.
- Every `Comment N` in `final_analysis.md`'s Ready-to-paste comment was checked against the current
  branch state and classified Fixed/Not Fixed/Partially Fixed/Regressed with cited evidence — none
  skipped.
- Every enumerated `file:line` inside a collapsed repeated-pattern comment was checked
  individually, not just the first occurrence.
- The fresh sweep applied the Code Style, AQA, and AQA Lead checklists over the MR's full current
  changed-file list (Coverage table has a row per file) and surfaced only genuinely new findings, not anything already on record in
  `cosmetic_analysis.md`/`logical_analysis.md`.
- `re-review-analysis.md` was written under the resolved `proj-ai-agentic` repo's
  `docs/review-mr/<mr-iid>-.../` — never GitLab, never `proj-test-automation`'s own tree.
- The Ready-to-paste follow-up comment covers every still-open `Comment N` and every new finding
  at every severity, is topic-grouped, follows the `Comment N` template, and contains no
  AI/Claude/Anthropic self-attribution.
- No GitLab comment, review, or approval was posted anywhere; `cosmetic_analysis.md`/
  `logical_analysis.md`/`final_analysis.md` were read but never modified.
