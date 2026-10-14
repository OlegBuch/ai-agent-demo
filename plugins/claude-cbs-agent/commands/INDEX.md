# commands/ Index

Three kinds of content live directly under `commands/`, each with a different invocation model:

| What | Where | How it's invoked |
|---|---|---|
| The virtual team's personas | `team/` — see `team/INDEX.md` | Not directly invocable — the "Role" every `execution/` command assumes, or drawn on by `/team:orchestrator` / `/review-board` |
| The Manual QA → Allure TestOps → AQA automation pipeline | `execution/` — see `execution/INDEX.md` | `/execution:<domain>-commands:<command-name> <args>` |
| Global utility skills, usable from any persona/context | `bootstrap-project.md`, `create-hrm-template.md`, `create-pr.md`, `session-summary.md`, `setup-statusline.md`, `metrics.md` (this folder, no subfolder) | `/bootstrap-project`, `/create-hrm-template`, `/create-pr`, `/session-summary`, `/setup-statusline`, `/metrics` |

The utility skills, one line each:

| Command | Purpose |
|---|---|
| `/bootstrap-project` | Populate `docs/project-spec/` and `docs/frame-specs/` for a new consuming repo and report portability risks |
| `/create-hrm-template` | Render a day's HRM logworks entry (Parent/Epic grouping, estimated hours) and upsert the monthly draft |
| `/create-pr` | Turn the session's `proj-ai-agentic` changes into one branch and one PR, after explicit confirmation |
| `/session-summary` | Write the dated session log under `docs/chat-history/` |
| `/setup-statusline` | Install the team's two-line Claude Code status line on the user's machine |
| `/metrics` | Refresh and show the measured usage record in `docs/metrics/`: time per task, lines, sessions, hook activity |

For the full command/skill catalog with descriptions, see the root `README.md`. For the overall operating model (why `docs/`/`rules/` live in this repo instead of the consuming one), see the root `CLAUDE.md`.
