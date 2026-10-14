@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/severity-taxonomy.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/gitlab-mcp-access.md

---

# /execution:review-pr-commands:review-pr-orchestrator

## Role

The entry point for "review this whole MR." Ensures `cosmetic_analysis.md`
(`review-cosmetic-pr.md`) and `logical_analysis.md` (`review-logical-pr.md`) both exist
for this MR — running whichever is missing — then runs the actual debate: the **Senior Full Stack
AQA Engineer** and **Senior QA Test Automation Lead Engineer**
(`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`,
`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`) defend `logical_analysis.md`'s necessity
citations and "this is the correct/this fits" conclusions, while the **Senior Change Justification
Reviewer** (`${CLAUDE_PLUGIN_ROOT}/commands/team/skeptic-agent.md`) adversarially challenges them,
per that persona's own Adversarial Debate Protocol — never deferring to their conclusions.

This is also distinct from `/review-board aqa-lead,aqa,skeptic: ...`, which is for live,
open-ended discussion; this command exists for a persisted, evidence-cited final report for one
specific MR that the user copies into GitLab.

**Who actually reviews an MR under this command family, spelled out once here since it's a
recurring question:** four personas, never one lens deciding alone —
`code-style-agent.md` (mechanical, line-by-line, via `review-cosmetic-pr.md`),
`fullstack-aqa-agent.md` + `aqa-lead-agent.md` jointly (correctness and suite-fit, via
`review-logical-pr.md`), and `skeptic-agent.md` (adversarial necessity challenge, this command's
own debate stage). No single persona — including `fullstack-aqa-agent.md` on its own — is "the"
MR reviewer; this command is what merges all four into one report.

⸻

## Mission

Produce one `final_analysis.md` per MR: every confirmed finding from all three lenses, a fully
resolved Change Justification Debate log, and the ready-to-paste GitLab comment — the single
deliverable this whole command family exists to produce.

⸻

## Argument Format

```
/execution:review-pr-commands:review-pr-orchestrator <mr-iid>
/execution:review-pr-commands:review-pr-orchestrator /merge_requests/<mr-iid>
/execution:review-pr-commands:review-pr-orchestrator <full-gitlab-mr-url>
```

Run with `proj-test-automation` (or a clone of it) as the session's working directory.

## Examples

```
/execution:review-pr-commands:review-pr-orchestrator 72
```
→ If `docs/review-mr/72-tb-2102-<slug>/cosmetic_analysis.md` and/or `logical_analysis.md` don't
exist yet, runs `review-cosmetic-pr`/`review-logical-pr` for MR 72 first, then debates and
writes `final_analysis.md` in the same folder.

⸻

## Preconditions

- The session's working directory has `proj-test-automation`'s actual GitLab remote as `origin` (or
  one pointing at the same project).
- The plugin's GitLab MCP (`gitlab-mcp-access.md`) is the primary way to read the MR;
  `git fetch` access to that GitLab host remains the fallback.
- If neither the MCP nor GitLab merge-request refs work, ask the user for the MR's source branch name.
- If `docs/review-mr/<mr-iid>-.../` already holds `final_analysis.md` and the user is asking for a
  re-review after fixes, stop and run `review-pr-recheck.md` instead — this command never
  re-verifies fixes.

⸻

## Protocol

### Step 0 — Ensure prerequisite analyses exist

Resolve the MR's output folder (`docs/review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/`) the
same way `review-cosmetic-pr.md`/`review-logical-pr.md` do (ticket key from the source
branch/commits, or ask the user).

- If `cosmetic_analysis.md` is missing in that folder, run `review-cosmetic-pr.md`'s full
  Protocol for this MR now (spawn it via the `Agent` tool with a prompt pointing at that command
  file and this MR's IID) before continuing.
- If `logical_analysis.md` is missing, do the same for `review-logical-pr.md`.
- If both already exist (a re-run after pushed fixes), read them as-is — do not re-derive their
  findings.

### Step 1 — Gather (Haiku, per Model-Routing Convention above)

Spawn a Gather subagent to read `cosmetic_analysis.md` and `logical_analysis.md` in full and
condense them into one bundle: every Confirmed Issue/Possible Risk/Nice-to-Have from
`cosmetic_analysis.md` verbatim (these are not debated — mechanical findings pass through
unchanged into the final report), and every entry from `logical_analysis.md`'s Necessity
Citations section plus any finding whose header implies a "this is correct/this fits" conclusion
(these are what gets challenged in Step 2).

### Step 2 — Judge: the debate (Sonnet, per Model-Routing Convention above)

Run `skeptic-agent.md`'s own **Adversarial Debate Protocol** against every item the Gather bundle
flagged as challengeable:

1. Skeptic states the challenge: the specific decision, the concrete existing alternative it
   believes covers it, and where that alternative lives.
2. The Full Stack AQA / AQA Lead lens (whichever owns that conclusion in `logical_analysis.md`)
   responds — rebuttal or concession.
3. Resolve explicitly: **Justified** (rebuttal survives — state why) or **Not Justified**
   (concession, or the rebuttal fails against the cited evidence). Never leave one open.
4. Every **Not Justified** resolution is promoted into a Confirmed Issue or Possible Risk in the
   final merged findings, carrying the same cited evidence.

A `logical_analysis.md` with no non-trivial decision worth challenging yields an explicit "no
challenges raised" statement, not a fabricated debate.

⸻

## Output

Write to the resolved `proj-ai-agentic` working tree:

```
docs/review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/final_analysis.md
```

If this file already exists, append a dated entry under an internal `## Changelog`.

`final_analysis.md` contains:

1. **Summary** — one paragraph, taken from `logical_analysis.md`'s own Summary.
2. **Confirmed Issues** / **Possible Risks** / **Nice-to-Have Improvements** — the union of
   `cosmetic_analysis.md`'s and `logical_analysis.md`'s findings, plus every **Not Justified**
   promotion from Step 2, merged (not concatenated as separate lists) and de-duplicated where two
   lenses flagged the same thing. Same shape throughout, per `severity-taxonomy.md`'s Finding Entry
   Format (a source finding that already carried an `Example:` keeps it here). State `No major
   issues detected.` where empty.
3. **Change Justification Debate** — one entry per challenge from Step 2: decision challenged,
   cited alternative, rebuttal/concession, resolution. State explicitly when none were raised.
4. **Verdict** — `Approve` or `Request Changes`, per `severity-taxonomy.md`'s Approval Standard
   (Request Changes iff any `Critical`/`Confirmed` finding remains, or any debate challenge
   resolved `Not Justified`; otherwise Approve regardless of how many `Risk`/`Nit` findings remain
   open) — one line, plus the one-sentence reason it resolved that way. This line decides what's
   blocking; it never reduces how exhaustively findings were surfaced above.
5. **Ready-to-paste GitLab comment** — mandatory, never trimmed to a subset: every finding above
   at every severity (Confirmed Issue, Possible Risk and Nice-to-Have, the last kept terse), in
   English, grouped under short topic headings and numbered `Comment N` continuously in that
   order, in the same shape `severity-taxonomy.md`'s "Response Language & Format Contract"
   defines (one definition, not restated here). Plain text — no code fences or inline backticks
   inside the list:

       Comment 1
       [Severity] Title
       <file>:<line> — <what's wrong and why, 1-2 sentences>.
       Fix: <one sentence>.
       Example: (optional — carry over only if the source finding had an `Example:`, per
           `severity-taxonomy.md`'s own rule for when one earns its place; 1-2 plain lines)

   Every `<file>:<line>` here must be from the MR's own changed-file list. Exactly one `Fix:`
   sentence per comment, and at most one `Example:` snippet, carried over verbatim from the source
   finding's `Example:` rather than invented fresh at this stage — never added here for a finding
   that didn't already earn one in `cosmetic_analysis.md`/`logical_analysis.md`. The same list is
   also given to the user in chat, so they can pick which comments to post without opening the
   file.
   No AI/Claude/Anthropic self-attribution anywhere in this block (per `base-agent.md`'s "Commit,
   Comment & Attribution Hygiene") — write it exactly as the reviewing engineer would type it
   themselves.

⸻

## Constraints

- Never post a comment, review, or approval to GitLab — findings-file only.
- Never edit the MR's code, tests, or any Allure case.
- Never call a GitLab REST API by hand or use the GitLab MCP's write tools — the read-only rule is
  in `gitlab-mcp-access.md`; the user posts comments themselves.
- Never skip Step 0 — a debate over a `logical_analysis.md` that doesn't exist yet is not
  possible; run the prerequisite command first.
- Every Change Justification Debate challenge must be resolved (Justified/Not Justified) before
  the file is written — never left open.
- The "Ready-to-paste GitLab comment" section is mandatory, always covers every finding at
  every severity (never a curated subset), and carries no AI/Claude/Anthropic self-attribution.
- Findings stay in `severity-taxonomy.md`'s Finding Entry Format — never expanded into separate
  Evidence/Why-it-matters subsections, and an `Example:` snippet is never a quoted
  excerpt of the MR's own diff lines (it's an illustrative sketch, per that format's own rule) —
  never included at all for a finding whose `Fix:` sentence already stands on its own.

⸻

## Definition of Done

- `cosmetic_analysis.md` and `logical_analysis.md` both exist for this MR (run if missing) and
  were read in full, not re-derived.
- Every necessity citation and "this is correct/this fits" conclusion in `logical_analysis.md` was
  challenged or explicitly noted as not warranting a challenge.
- Every challenge raised has a stated resolution (Justified/Not Justified); every Not Justified
  resolution was promoted into the merged findings.
- The merged findings de-duplicate overlapping items from the two source files rather than
  concatenating them.
- The Ready-to-paste GitLab comment covers every finding at every severity, is topic-grouped and
  follows the `Comment N` template, and contains no AI/Claude/Anthropic self-attribution.
- A Verdict (`Approve`/`Request Changes`) was rendered per `severity-taxonomy.md`'s Approval
  Standard, with its one-sentence reason.
- `final_analysis.md` was written under the resolved `proj-ai-agentic` repo's
  `docs/review-mr/<mr-iid>-.../` — never GitLab, never `proj-test-automation`'s own tree.
- No GitLab comment, review, or approval was posted anywhere.
- This command never runs `review-pr-distill-patterns.md` itself — cross-MR pattern distillation
  is a separate, explicitly user-invoked step over the accumulated `docs/review-mr/` history, not
  something a single-MR review triggers automatically.
