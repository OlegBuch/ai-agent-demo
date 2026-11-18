# commands/execution/review-pr-commands/ Index

GitLab merge-request review: four narrow, single-purpose commands over the same diff, each
writing its own file into one per-MR `docs/review-mr/<mr-iid>-.../` folder, plus one cross-MR
curation command that mines that accumulated history. Draws on the Senior Code Style &
Conventions Reviewer (`../../team/code-style-agent.md`), Senior Full Stack AQA Engineer
(`../../team/fullstack-aqa-agent.md`), Senior QA Test Automation Lead Engineer
(`../../team/aqa-lead-agent.md`), and Senior Change Justification Reviewer
(`../../team/skeptic-agent.md`) personas.

| File | Invocation | Read this when you need... |
|---|---|---|
| `review-cosmetic-pr.md` | `/execution:review-pr-commands:review-cosmetic-pr <mr-iid>` | Code Style lens only, every changed line — writes `docs/review-mr/<mr-iid>-.../cosmetic_analysis.md`. |
| `review-logical-pr.md` | `/execution:review-pr-commands:review-logical-pr <mr-iid>` | AQA + AQA Lead lenses, joint — correctness and suite-level fit, plus first-pass necessity citations — writes `logical_analysis.md`. |
| `review-pr-orchestrator.md` | `/execution:review-pr-commands:review-pr-orchestrator <mr-iid>` | The entry point for reviewing a whole MR: runs the two commands above if their files don't exist yet, then has the Skeptic lens adversarially challenge their necessity conclusions — writes `final_analysis.md`, the file with the ready-to-paste GitLab comment. |
| `review-pr-recheck.md` | `/execution:review-pr-commands:review-pr-recheck <mr-iid>` | Run after `final_analysis.md`'s findings were posted and the author pushed fixes: verifies every `Comment N` was actually fixed (file:line by file:line) and sweeps the current diff for anything new — writes `re-review-analysis.md`. Read-only against the other three files. |
| `review-pr-distill-patterns.md` | `/execution:review-pr-commands:review-pr-distill-patterns` | Never touches a GitLab MR — mines every past `final_analysis.md`/`re-review-analysis.md` under `docs/review-mr/` for a finding that recurs across ≥3 distinct MRs, and drafts (never applies) the `docs/frame-specs/` addition that would catch it automatically next time. Writes `docs/review-mr/_pattern-log.md`. |
| `gitlab-mcp-access.md` | not a command — `@`-included at the top of the four MR-reading commands | How to read an MR through the plugin's GitLab MCP (metadata, changed files, diffs, commits, discussion threads, versions), the head-sha check, and the read-only rule: findings go to the file and to chat, the user posts. `git fetch` stays as fallback. |
| `severity-taxonomy.md` | not a command — `@`-included at the top of the other four files | The shared `[Severity]` vocabulary (`Critical`/`Confirmed`/`Risk`/`Nit`) and the Approval Standard that drives `review-pr-orchestrator.md`'s Verdict line. One authoritative definition referenced from all four, never restated per-file. |

## Rules

- **Artifacts per MR** — all in `docs/review-mr/<mr-iid>-<slug>/`: `cosmetic_analysis.md`
  (`review-cosmetic-pr`), `logical_analysis.md` (`review-logical-pr`), `final_analysis.md`
  (`review-pr-orchestrator`: merged findings, debate log, Verdict, Ready-to-paste `Comment N`),
  `re-review-analysis.md` (`review-pr-recheck`). Cross-MR: `docs/review-mr/_pattern-log.md`, created
  by `review-pr-distill-patterns` on its first run.
- **Re-runs** — running a command again appends a dated `## Changelog` entry to its own file. The
  orchestrator reads an existing cosmetic/logical file as-is; only `review-pr-recheck` verifies that
  flagged lines were actually fixed.
- **One shared vocabulary** — `severity-taxonomy.md` holds the `[Severity]` values, the Approval
  Standard (Verdict), the Finding Entry Format, the Response Language & Format Contract and the
  Coverage Table; `gitlab-mcp-access.md` holds the read-only GitLab rules and the fallback-branch
  rule (creating/deleting `_mr-<iid>-review` needs the user's yes).
- **Model routing** — Gather steps run on Haiku, Judge steps on Sonnet (`../../team/model-routing.md`).
- **Known-issue cross-check** — `review-logical-pr` checks the diff against `docs/common-issues/`,
  `docs/module-theory/<Module>/` Patterns and `_pattern-log.md`; the Skeptic lens and
  `review-pr-recheck` Part B apply the same check.
- **Read-only** — nothing here posts to GitLab, Jira or Confluence; the user posts the comments.
- **Output location** — the files stay in `docs/review-mr/`; committing them happens only through
  `/create-pr` at the owner's request.
- **`review-pr-distill-patterns`** — proposes `docs/frame-specs/` additions for a finding recurring
  in at least `min-occurrences` (default 3) distinct MRs; never edits `docs/frame-specs/` itself.
- The package was split out of the former joint 4-lens review (no longer exists) and lives in its
  own `<domain>-commands/` folder per `ai-architect-agent.md`'s naming convention.
