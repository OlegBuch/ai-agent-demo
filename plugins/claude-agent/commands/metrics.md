---
description: Refresh and show the plugin usage metrics (time per task, lines, sessions, hook activity) from the local session history and from main
argument-hint: [collect | report | team] [--since <date>] [--manual-minutes-per-spec-line <n>]
---

# /metrics

Role: Framework Owner (`ai-architect-agent.md`). This command reads and summarizes; it never edits product code and never writes to Jira, Confluence or Allure.

## Mission

Keep one measured record of what the plugin is used for and how long tasks take, so its value can be shown with numbers. The record lives in `docs/metrics/` of the `proj-ai-agentic` working tree and is refreshed automatically at the end of every turn by the `Stop` hook (`scripts/metrics/metrics.js auto`). This command is the manual entry point for a full refresh and for reading the result.

$ARGUMENTS

## Protocol

| Step | Action | Done when |
|------|--------|-----------|
| 1. Resolve | Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/metrics/metrics.js collect` (add `--fetch` only if the owner asked for a fresh `origin/main`). It resolves the `proj-ai-agentic` working tree the same way `base-agent.md` does | The script prints the metrics root, the user and the counts of parsed sessions, commits and doc artifacts |
| 2. Read | Show `docs/metrics/reports/<user>.md`, or run `report --since <date>` for a window | The totals, the by-month table and the Tasks table are shown to the owner |
| 3. Team view | Only when asked: `team` writes `TEAM.md` next to `INDEX.md` from every person's data files | `TEAM.md` exists and its By person table lists every `data/<user>/` folder |
| 4. Estimate | Only when the owner gives a norm: `report --manual-minutes-per-spec-line <n>` | The estimate section is present and labelled as an assumption |

## Reading rules

| Rule | Detail |
|------|--------|
| Measured vs estimated | Active time, lines, sessions, commits and hook counts are measured. Time saved is an estimate and is only printed when the owner supplies the norm |
| Hook blocks | A block is a backstop firing, not a proven prevented error. Report it as "fired", next to the acknowledgement count |
| Sources | Session data comes from the local session history, commits and documents from `origin/main` as last fetched on this machine |
| Privacy | Rows carry names, counts, durations and ticket keys only. No prompts, answers, tool inputs, ticket titles, model or vendor names. Models appear as tiers (light, standard, heavy) |

## Constraints

| Constraint | Detail |
|------------|--------|
| No commit | The data files under `docs/metrics/data/` are left uncommitted and travel with the next `/create-pr`. Reports and `TEAM.md` are git-ignored and never committed |
| No fetch by default | `git fetch` runs only with `--fetch` |
| No hand edits | `reports/` and `TEAM.md` are generated, fix the script, not the output |
| Period | Git figures are limited to the period covered by the sessions. Pass `--all-time` to include earlier history |

## Definition of Done

| Item | Evidence |
|------|----------|
| Data refreshed | The script output with the parsed counts |
| Result shown | The report sections asked for, quoted from the generated file |
| Gaps named | Any `note:` line the script printed (missing `origin/main`, failed fetch) is repeated to the owner |
