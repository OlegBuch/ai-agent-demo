@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md

---

# /execution:review-pr-commands:review-pr-distill-patterns

## Role

Cross-MR curation command, not a diff review: the only command in this family that never reads a
GitLab merge request at all. Its input is the accumulated `docs/review-mr/*/final_analysis.md`
and `re-review-analysis.md` files this family has already produced across many past MRs, and its
output is a **proposal** — never a direct edit — to promote a genuinely recurring finding into
`docs/frame-specs/coding-standards.md`/`testing-standards.md`/`architecture.md`, the same files
`review-cosmetic-pr.md`'s and `review-logical-pr.md`'s own Gather steps already read on every
single run. Promoting a pattern there is what makes future reviews actually catch it automatically
— no protocol change to the other four commands is needed for a promoted pattern to take effect.

This command never writes to `docs/frame-specs/` itself. A human (the user) reads this command's
proposal and decides whether to apply it — the same way today's `coding-standards.md`/
`testing-standards.md` edits for the dynamic-name-generator/assertion-message/comment-hygiene
rules happened: a person stated the rule, it was written once, and it started applying to every
review from then on. This command exists to surface the *next* one of those without the user
having to notice the recurrence by memory across dozens of past MRs.

Distinct from `review-pr-orchestrator.md`/`review-pr-recheck.md` (both review one specific MR's
diff and render findings against it) — this command renders no verdict on any single MR and
touches no MR's diff at all.

⸻

## Mission

Read every past `final_analysis.md`/`re-review-analysis.md` under `docs/review-mr/`, group their
Confirmed Issues/Possible Risks into categories, and for every category that recurs across at
least `min-occurrences` (default 3) **distinct** MR folders — and isn't already covered by the
current `docs/frame-specs/` content — draft the exact standards-doc addition that would have
caught it automatically, citing every occurrence that justifies the promotion. Never edit
`docs/frame-specs/` directly; never invent a pattern from a single MR.

⸻

## Argument Format

```
/execution:review-pr-commands:review-pr-distill-patterns
/execution:review-pr-commands:review-pr-distill-patterns min-occurrences:<N>
```

No arguments are required — `min-occurrences` defaults to 3. Run with `proj-test-automation` (or a
clone of it) as the session's working directory; this command reads nothing from
`proj-test-automation` itself beyond what's needed to resolve `proj-ai-agentic`'s working tree (see
`base-agent.md`'s "Repository & Persistence Model").

## Examples

```
/execution:review-pr-commands:review-pr-distill-patterns
```
→ Scans every `docs/review-mr/<mr-iid>-.../final_analysis.md` and `re-review-analysis.md`, and
appends a dated run to `docs/review-mr/_pattern-log.md` (created on the first run) proposing zero
or more standards-doc edits.

⸻

## Preconditions

- `docs/review-mr/` must contain at least `min-occurrences` MR folders (default 3) with a
  `final_analysis.md` each — fewer can never reach the threshold. If fewer
  exist, stop and say plainly there isn't enough history yet to distill anything — do not lower
  `min-occurrences` to force a result out of too little data.
- No GitLab access, `git fetch`, or Atlassian lookup is needed for this command at all.

⸻

## Protocol

### Step 1 — Gather (Haiku, per Model-Routing Convention above)

Spawn Gather subagent(s) to produce one context bundle containing:

1. Every `docs/review-mr/<mr-iid>-.../final_analysis.md`'s Confirmed Issues and Possible Risks
   sections (Nice-to-Have optional, lower priority — include only if it doesn't blow the budget),
   and every `re-review-analysis.md`'s Fix Verification section (a **Not Fixed**/**Partially
   Fixed**/**Regressed** classification is a stronger recurrence signal than a first-pass finding,
   since it means the same defect survived being explicitly raised once already) — each entry kept
   with its source `<mr-iid>`, `file:line`, and one-sentence description, never paraphrased away
   from the concrete evidence.
2. Group entries into candidate categories by the underlying convention/defect they describe (not
   by surface wording) — e.g. "assertion with no failure message," "hardcoded status-code literal
   in a spec," "multi-line/WHAT-restating comment," "duplicate helper reinvented instead of reusing
   `api/utils/X`." Record every `<mr-iid>` + `file:line` contributing to each category — a category
   backed by fewer than `min-occurrences` distinct MR folders is dropped at this stage, not carried
   to Step 2.
3. The full current text of `docs/frame-specs/coding-standards.md`, `testing-standards.md`, and
   `architecture.md`, plus `docs/review-mr/_pattern-log.md` if it already exists — needed so Step 2
   never re-proposes a pattern already adopted into a standards file or already logged as
   considered-and-declined in a prior run.

### Step 2 — Judge (Sonnet, per Model-Routing Convention above)

For every category that survived Step 1's threshold:

1. Confirm the occurrences genuinely share one underlying convention/defect, not just similar
   wording (e.g. two different "hardcoded value" findings about a status code vs. a business
   constant are not automatically the same category) — split or drop a category that doesn't
   actually hold together under scrutiny.
2. Check whether `docs/frame-specs/coding-standards.md`/`testing-standards.md`/`architecture.md`
   already covers it. If yes, record it as **Already covered** (cite the existing line) — the
   recurrence means the rule exists but isn't being followed, which is a team-process observation
   worth logging, not a new standards edit to propose.
3. If not yet covered, draft the **exact** addition or edit to the specific standards file that
   would have caught every cited occurrence — same style as the existing rules in that file (see
   the "## Comments" section added to `coding-standards.md` and the "Unique identifiers"/
   "Assertions" updates in `testing-standards.md` for the expected shape and level of detail).
4. A category that recurs but is too context-dependent to state as a blanket rule (the right
   answer genuinely varies case by case) is recorded as **Observed, not promoted** with the reason
   — never forced into a rule that would misfire on a legitimate exception.

Before finalizing, re-check every cited `<mr-iid>` + `file:line` against the actual source file
it came from — drop or downgrade any occurrence that doesn't hold up.

⸻

## Output

Write to the resolved `proj-ai-agentic` working tree:

```
docs/review-mr/_pattern-log.md
```

The leading underscore keeps this file sorted apart from the `<mr-iid>-<slug>` per-MR folders it
summarizes — it is not itself a per-MR folder and must never be mistaken for one. If this file
already exists, append a new dated `## Distillation run — <date>` section rather than overwriting
prior runs.

Each run's entry contains, per category evaluated:

1. **Category** — its name and the underlying convention/defect.
2. **Occurrences** — every contributing `<mr-iid>`/`file:line`/one-sentence description.
3. **Verdict** — one of:
   - **Proposed** — the exact standards-doc addition/edit drafted, with the target file named.
   - **Already covered** — cites the existing rule; recurrence is a process gap, not a doc gap.
   - **Observed, not promoted** — recurs but is too context-dependent for a blanket rule; states
     why.
4. State explicitly (`No category crossed the threshold this run.`) when nothing qualifies.

⸻

## Constraints

- Never edit `docs/frame-specs/coding-standards.md`, `testing-standards.md`, `architecture.md`, or
  any other frame-specs file directly — every promotion is a drafted proposal for the user to
  apply, exactly like this command's own **Proposed** verdicts.
- Never promote a category backed by fewer than `min-occurrences` distinct MR folders — the same
  `file:line` cited twice from the same MR's own Changelog re-run is one occurrence, not two.
- Never edit `final_analysis.md`, `re-review-analysis.md`, `cosmetic_analysis.md`, or
  `logical_analysis.md` in any per-MR folder — read-only inputs.
- Never fetch anything from GitLab, Jira or Confluence — this command's evidence is entirely
  the `proj-ai-agentic` working tree's own accumulated review history.
- Never re-propose a pattern `docs/frame-specs/` already covers, or that a prior run already logged
  as **Observed, not promoted** for the same stated reason — check both before drafting a new
  proposal.

⸻

## Definition of Done

- Every `docs/review-mr/<mr-iid>-.../final_analysis.md` and `re-review-analysis.md` present at run
  time was read.
- Every candidate category is backed by at least `min-occurrences` distinct MR folders, each cited
  by `<mr-iid>` + `file:line`.
- Every category was checked against `docs/frame-specs/`'s current content before being drafted as
  a new proposal.
- Every **Proposed** verdict names the exact target file and drafts the addition in that file's own
  existing style — never a vague "consider adding a rule about X."
- `docs/review-mr/_pattern-log.md` was created (first run) or appended to (never overwritten) under
  the resolved `proj-ai-agentic` repo.
- No `docs/frame-specs/` file, and no per-MR `docs/review-mr/` file, was modified by this command.
