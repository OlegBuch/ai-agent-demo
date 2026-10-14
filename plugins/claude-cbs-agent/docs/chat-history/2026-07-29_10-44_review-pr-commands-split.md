# Split aqa-review-*-pr commands into their own review-pr-commands package, then added review-pr-recheck

**Date/time:** 2026-07-29 10:44, updated 11:10 · **Branch:** vadym.udaltsov/update-pr-review (in `proj-ai-agentic`) · **Ticket(s):** None

## Discussed

User (as AI Architect persona) asked to move the GitLab MR-review command family — which had
already been split earlier this session from a single joint `aqa-review-pr.md` into
`aqa-review-cosmetic-pr.md` / `aqa-review-logical-pr.md` / `aqa-review-pr-orchestrator.md` inside
`aqa-commands/` — out into its own new `commands/execution/review-pr-commands/` package, dropping
the `aqa-` prefix from each command name (`review-cosmetic-pr`, `review-logical-pr`,
`review-pr-orchestrator`), and to update every doc/spec cross-reference to the new path so nothing
breaks.

Resolved the `proj-ai-agentic` working tree at `C:\Users\user\proj-ai-agentic` (sibling checkout with
`.git` and `plugins/claude-proj-agent/.claude-plugin/plugin.json`) — no `path`-type marketplace
source was registered, so this was found via the sibling-directory fallback per
`base-agent.md`'s "Repository & Persistence Model".

**Second round (11:10):** user asked for a new command in `review-pr-commands/` for the
"leave comments → author fixes → verify" workflow: after `final_analysis.md`'s Ready-to-paste
comment is posted and the author pushes fixes, re-check (1) that every commented issue was fixed
everywhere, file:line by file:line, against the branch's current state, and (2) that the fix
didn't introduce anything new — writing `re-review-analysis.md`. User proposed the name
`re-review-full-pr` but explicitly invited a better one if that was weak.

Checked for a naming/scope conflict before adding anything: none of the existing three commands
already do this — `review-pr-orchestrator.md`'s own Step 0 explicitly reads an existing
`cosmetic_analysis.md`/`logical_analysis.md` "as-is" once both exist, so re-running any of the
three after a push only appends a Changelog entry, it never re-verifies a fix or re-sweeps for new
problems. That gap is the cited justification for the new command.

Decided on `review-pr-recheck` instead of `re-review-full-pr` — "full" was misleading (it isn't
broader than the other three, it's a narrower recheck) and `re-review-` breaks the family's
`review-*` prefix convention (`review-cosmetic-pr`, `review-logical-pr`, `review-pr-orchestrator`).
This was an independent naming call per the AI Architect's own decision boundary (command naming,
provided it follows the established convention), surfaced to the user for override rather than
gated behind a question.

## Implemented

Moved (plain `mv`, files were untracked so `git mv` wasn't applicable):
- `commands/execution/aqa-commands/aqa-review-cosmetic-pr.md` → `commands/execution/review-pr-commands/review-cosmetic-pr.md`
- `commands/execution/aqa-commands/aqa-review-logical-pr.md` → `commands/execution/review-pr-commands/review-logical-pr.md`
- `commands/execution/aqa-commands/aqa-review-pr-orchestrator.md` → `commands/execution/review-pr-commands/review-pr-orchestrator.md`
- `commands/execution/aqa-commands/model-routing.md` → `commands/execution/review-pr-commands/model-routing.md` (shared Gather/Judge fragment, used only by the three files above)

Updated invocation strings, `@`-include paths, and cross-references inside all four moved files
(`/execution:aqa-commands:aqa-review-*` → `/execution:review-pr-commands:review-*`, and mutual
references between the three commands renamed to match).

Created `commands/execution/review-pr-commands/INDEX.md` (new file/invocation catalog + the
history note on why the split happened and why it later moved out of `aqa-commands/`).

Updated cross-references and catalogs in:
- `commands/execution/aqa-commands/INDEX.md` — removed the four moved rows, added a pointer to the new folder, trimmed the folder's own description (no longer "and reviewing GitLab merge requests")
- `commands/execution/INDEX.md` — added a `review-pr-commands/` row, updated the "Pipeline order" note
- `commands/team/INDEX.md` — updated `code-style-agent.md`/`skeptic-agent.md` descriptions (`aqa-review-cosmetic-pr`/`aqa-review-pr-orchestrator` → `review-cosmetic-pr`/`review-pr-orchestrator`)
- `commands/team/code-style-agent.md`, `commands/team/skeptic-agent.md` — their own "Own `/execution:...`" Principles-section lines
- `docs/INDEX.md` — the `review-mr/` section's command paths and file names
- `CLAUDE.md` — Documentation Reference table row
- `README.md` — the `commands/team/`/`commands/execution/` bullets, the full command table (split the three review-pr rows into their own labeled sub-table under `execution:review-pr-commands:...`), and the `aqa-review-*-pr` mention in the persona-catalog paragraph
- `.gitignore` — the `review-mr*` ignore-rule comment

Verified with a final repo-wide grep for `aqa-review-cosmetic-pr|aqa-review-logical-pr|aqa-review-pr-orchestrator|aqa-review-\*-pr` — no stale references remain anywhere in the repo.

All changes left uncommitted in the `proj-ai-agentic` working tree, per this framework's own rule —
not committed or pushed this session.

**Second round (11:10):** created `commands/execution/review-pr-commands/review-pr-recheck.md`,
following the same Role → Mission → Argument Format/Examples → Preconditions → Protocol → Output →
Constraints → Definition of Done shape and the shared `model-routing.md` Gather(Haiku)/Judge(Sonnet)
include as the other three. Protocol has two mandatory parts: **Part A — Fix verification**, which
classifies every `Пункт N` from `final_analysis.md`'s Ready-to-paste comment as
Fixed/Not Fixed/Partially Fixed/Regressed against the branch's current state (every enumerated
`file:line` in a collapsed repeated-pattern `Пункт` checked individually, never just the first);
**Part B — Fresh sweep**, which reapplies the Code Style + AQA + AQA Lead checklists over the MR's
full current diff but reports only findings not already on record in `cosmetic_analysis.md`/
`logical_analysis.md`. Writes `re-review-analysis.md` (with its own Ready-to-paste follow-up
comment) into the same per-MR folder; never modifies the other three files; never runs the
Skeptic's adversarial debate itself (a fresh `review-pr-orchestrator` run is required for that).

Updated cross-references for the new command in:
- `commands/execution/review-pr-commands/model-routing.md` — added it to the shared family's file list
- `commands/execution/review-pr-commands/INDEX.md` — new table row, plus a history paragraph on the gap it closes
- `commands/execution/INDEX.md` — folder description now mentions the post-fix recheck
- `docs/INDEX.md` — `review-mr/` section now documents all four commands and the `re-review-analysis.md` output file
- `CLAUDE.md` — Documentation Reference table row
- `README.md` — new row in the GitLab merge-request review sub-table
- `commands/team/INDEX.md` — `fullstack-aqa-agent.md`/`aqa-lead-agent.md`/`code-style-agent.md` entries now also note their role in `review-pr-recheck`'s fresh sweep

Verified with a repo-wide grep for `re-review-full-pr` (the originally proposed name) — no
leftover mentions anywhere.

All second-round changes also left uncommitted in the same working tree.

## Learned

Nothing newly durable beyond what's already captured in the moved/created files' own history notes
(the split-then-relocate rationale lives in `review-pr-commands/INDEX.md`; the recheck gap
rationale lives in `review-pr-recheck.md`'s own Role section and that same `INDEX.md`).

## Open Items / Follow-ups

- The `proj-ai-agentic` working tree currently has uncommitted changes from this whole session (the
  package relocation plus the new `review-pr-recheck` command) and an earlier session (the
  original `aqa-review-pr.md` → three-file split, plus several other untracked `INDEX.md` files
  already present before this session started). Run `/create-pr` when ready to turn all of it into
  one PR.
- `review-pr-recheck` has not been exercised against a real MR yet — first live use will confirm
  whether the Part A/Part B split and the `Пункт`-carry-over renumbering in its ready-to-paste
  comment work as specified.

## References

None
