@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/severity-taxonomy.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/gitlab-mcp-access.md

---

# /execution:review-pr-commands:review-cosmetic-pr

## Role

Single-lens command: the Senior Code Style & Conventions Reviewer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/code-style-agent.md`) only. Mechanical, exhaustive,
line-by-line — never a design, necessity, or architecture judgment. That's
`review-logical-pr.md`'s job (correctness/suite-fit) and `review-pr-orchestrator.md`'s job
(necessity debate). This command exists so the mechanical pass can never lose a finding to a
simultaneous design discussion — see `code-style-agent.md`'s own Role section for why.

Distinct from `aqa-review-test` (checks one Allure case's existing automation against its
definition/API contract, not a diff) and from `review-pr-orchestrator` (which reads this
command's output rather than repeating its work).

⸻

## Mission

For one GitLab merge request: check every changed line, in every changed file, against this
repo's own documented conventions and existing patterns — exhaustively, never sampled — and write
`cosmetic_analysis.md`. Never post to GitLab, never edit the MR's code.

⸻

## Argument Format

```
/execution:review-pr-commands:review-cosmetic-pr <mr-iid>
/execution:review-pr-commands:review-cosmetic-pr /merge_requests/<mr-iid>
/execution:review-pr-commands:review-cosmetic-pr <full-gitlab-mr-url>
```

Run with `proj-test-automation` (or a clone of it) as the session's working directory.

## Examples

```
/execution:review-pr-commands:review-cosmetic-pr 72
```
→ Resolves MR `72`, fetches its diff, and writes
`docs/review-mr/72-tb-2102-<slug>/cosmetic_analysis.md` in the resolved `proj-ai-agentic` working
tree.

⸻

## Preconditions

- The session's working directory has `proj-test-automation`'s actual GitLab remote as `origin` (or
  one pointing at the same project) — this command resolves the MR against whatever `origin`
  already is, never a guessed URL.
- The plugin's GitLab MCP (`gitlab-mcp-access.md`) is the primary way to read the MR — metadata,
  changed files, diff, commits, existing discussions. `git fetch` access to that GitLab host
  remains the fallback when the MCP is unavailable. Both are read-only; no GitLab REST call by hand.
- If neither the MCP nor GitLab merge-request refs work (the fetch in Step 1 fails), stop and
  ask the user for the MR's source branch name directly rather than guessing it.

⸻

## Protocol

**Red Flags (Rationalizations to Recognize and Reject) — hold these throughout Step 2.** Each one
is how a real, mechanically-verifiable violation gets waved through instead of reported:

| Thought | Reality |
|---|---|
| "This diff is small, a light pass is enough" | Diff size has no exception in this command's own no-sampling rule — every line still gets checked, and every file gets a Coverage row. |
| "This naming/pattern already exists elsewhere in the file" | Repetition inside the same file is itself an In-File Duplication finding, not a reason to stop looking. |
| "This is a tedious, repetitive violation to enumerate" | Tedious is not the same as small — every occurrence still gets its own `file:line`, collapsed into one entry per the Output section's own rule, never summarized away. |
| "This looks like AI-generated code, but it's probably formatted fine" | Formatting confidence is not evidence — check it against the actual convention document, the same as any other line. |
| "I already found several real issues in this file, that's thorough enough" | A handful of findings is not proof every line was checked — the exhaustiveness self-check below exists precisely to catch this. |

⸻

### Step 1 — Gather (Haiku, per Model-Routing Convention above)

Spawn Gather subagent(s) to produce one context bundle containing:

1. The MR's diff and commit log — read through the GitLab MCP per `gitlab-mcp-access.md`
   (`get_merge_request`, `list_merge_request_changed_files`, `list_merge_request_diffs`,
   `list_commits`). Fallback when the MCP is unavailable: fetch the MR head into a temporary local
   branch (`git fetch origin merge-requests/<iid>/head:_mr-<iid>-review`, only after the user's
   yes — see `gitlab-mcp-access.md`), diff it against `main` (`origin/HEAD`, unless the MR states
   another target), read `git log main.._mr-<iid>-review --oneline`, then delete the temporary
   branch (again only after a yes). The bundle carries the full diff text and the
   changed-file list — never just a description.
2. The ticket key parsed from the source branch name (`<group>/<TICKET-KEY>`) or commit prefixes,
   used only to name the output folder (`<mr-iid>-<slug-of-ticket-key-or-mr-title>`) — this
   command doesn't need the ticket's Acceptance Criteria, since it never judges whether a change
   was the right one.
3. From the resolved `proj-ai-agentic` working tree (per `base-agent.md`'s "Repository &
   Persistence Model" — never `${CLAUDE_PLUGIN_ROOT}`, never `proj-test-automation`'s own tree):
   `docs/frame-specs/coding-standards.md`, `testing-standards.md`; the tag array actually in force
   today for every tag family (grep 2-3 sibling spec files in the same module, plus `README.md`'s
   tag-taxonomy table — not just one family); the full reuse surface — `api/utils/` in full,
   `api/utils/constants-keeper.ts`, every `api/types/*.types.ts` file for an entity family the diff
   touches (including siblings the diff doesn't import from), each touched module's own
   `*.values.ts`/`*-api-paths.ts` files, and its existing client class(es).

If GitLab MR refs are disabled (the Step 1 item 1 fetch fails), stop and ask the user for the source branch
name directly rather than guessing.

### Step 2 — Judge (Sonnet, per Model-Routing Convention above)

Apply `code-style-agent.md`'s own **Line-Level Review Checklist**, **Reuse-Surface Pattern
Matching**, **In-File Duplication**, and **Commit Message Quality** sections in full, over every changed line in every
changed file from the Gather bundle — no sampling, regardless of diff size; work through it in
bounded windows (150-300 diff lines at a time) until every line has actually been looked at. For
each window, check every changed line before moving to the next window — a line that "looked fine
at a glance" still gets checked, since that's exactly how a small, real violation (an inconsistent
quote, a locally re-invented constant, a garbled test title) survives a review that only skims for
the obviously-wrong ones. Per-line checking is not saved; the Coverage table in the output records
each file's diff lines, windows reviewed and findings. **Scope is the MR's changed-file
list only** — a finding's defect must live on a line the MR actually touches; an unmodified sibling
file read for reuse-surface comparison is supporting evidence, never a finding in its own right.

Before finalizing, re-check every finding against the actual diff and the checklist item it
violates — drop or downgrade anything not directly evidenced. Then run the exhaustiveness
self-check: any changed file with real churn (more than a handful of changed lines) and zero
findings needs a Coverage row showing every one of its windows was reviewed, not just an assumption
that the file was clean.

⸻

## Output

Write to the resolved `proj-ai-agentic` working tree:

```
docs/review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/cosmetic_analysis.md
```

If this file already exists (re-review after pushed fixes), append a dated entry under an
internal `## Changelog` rather than overwriting prior findings.

`cosmetic_analysis.md` contains:

1. **Summary** — one sentence: how many changed files/lines were reviewed.
2. **Confirmed Issues** / **Possible Risks** / **Nice-to-Have Improvements** — each entry follows
   `severity-taxonomy.md`'s own Finding Entry Format exactly (header/what-where-why/`Fix:`/optional
   `Example:`). A repeated identical violation pattern collapses into **one** entry that still
   enumerates every violating `file:line`, with at most one `Example:` for the whole collapsed
   entry. State explicitly (`No issues detected.`) when a category is empty rather than omitting it.
3. **Coverage** — the table defined in `severity-taxonomy.md`'s Coverage Table section.

This file is a working input to `review-pr-orchestrator.md`, not a GitLab-facing artifact —
that command produces the ready-to-paste comment.

**Chat response.** When this command is the only one run, finish by giving the user every finding
(all severities) in chat as the English, numbered, topic-grouped, plain-text comment list defined in
`severity-taxonomy.md`'s "Response Language & Format Contract" — one definition, not restated here.
When run together with `review-logical-pr`, that command's single merged list covers both.

⸻

## Constraints

- Never post to GitLab or call a GitLab REST API by hand — the read-only rule is in
  `gitlab-mcp-access.md`; never edit the MR's code.
- Never render a design, necessity, or architecture verdict — hand any finding whose only defense
  is "it works, and it's consistently named" to `review-logical-pr.md`'s scope.
- Every finding cites an actual `file:line` from the diff plus the exact convention/pattern
  violated.
- Every finding's defect sits in a file the MR's diff actually changes.
- Any comment added/changed by the diff that is more than a single short WHY-sentence, restates
  WHAT the code does, or reads as AI-generated is a **Confirmed Issue at blocking severity**,
  never Nice-to-Have.
- Fallback branch `_mr-<iid>-review`: created and deleted only after the user's yes, never left
  behind — see `gitlab-mcp-access.md`.

⸻

## Definition of Done

- The MR's full diff and commit history were fetched (Gather); if the fallback branch was used, it
  was created and deleted only with the user's yes.
- Every changed line in every changed file was checked against `code-style-agent.md`'s Line-Level
  Review Checklist — no sampling, regardless of diff size — and the Coverage table in
  `cosmetic_analysis.md` shows a row for every changed file, not a file-level impression.
- The full reuse surface (`api/utils/`, `constants-keeper.ts`, relevant `api/types/*.types.ts`
  including siblings, each module's `*.values.ts`/`*-api-paths.ts`, its client class(es)) was read
  and checked against every hand-rolled identifier/literal/helper in the diff.
- Every identifier/literal/code block the diff introduces was also checked against the rest of its
  own file for an in-file duplicate (per `code-style-agent.md`'s In-File Duplication check), not
  only against the external reuse surface.
- Every test/`describe` title, step description, assertion message, and comment the diff adds or
  changes was checked for grammatical correctness (per `code-style-agent.md`'s Text Quality check).
- Every commit message in the MR's `git log` was checked against `code-style-agent.md`'s Commit
  Message Quality check.
- Every tag family present in the diff was checked against the current milestone-suffixed
  taxonomy, not only the one that looked suspicious first.
- Every comment added/changed by the diff was checked against the comment-hygiene rule, with any
  violation raised as a blocking Confirmed Issue.
- `cosmetic_analysis.md` was written under the resolved `proj-ai-agentic` repo's
  `docs/review-mr/<mr-iid>-.../` — never GitLab, never `proj-test-automation`'s own tree.
- No GitLab comment, review, or approval was posted anywhere.
