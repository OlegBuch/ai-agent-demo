# docs/metrics/ Index

**TL;DR:** a measured record of plugin usage. Only the per-person data files are committed (with the next `/create-pr`), so pull requests do not conflict. Reports are rebuilt from them on every machine and are never committed. Nothing here names a model, a vendor or a prompt.

## What lives here

| Path | What it is | Written by |
|---|---|---|
| `data/<person>/<YYYY-MM>.jsonl` | One row per work session, per own commit on main, per own knowledge-base commit. Committed. Rows of one person never touch another person's files; a merge keeps both sides of a changed row and the loader keeps the newer one | `Stop` hook, `scripts/metrics/metrics.js auto` |
| `reports/<person>.md` | That person's dashboard: totals, by month, by day, by hour, per ticket, hook activity. Local, git-ignored | the same hook, rebuilt from the data files |
| `TEAM.md` | Everyone's data combined, with a By person table. Local, git-ignored. Rebuild it right before presenting | `/claude-proj-agent:metrics team` |

## What is measured

| Metric | Source | Kind |
|---|---|---|
| Work sessions, prompts, active hours, wall hours | local session history | measured |
| Task time per ticket: first session to last own commit on main, active hours between | session history plus `origin/main` | measured |
| Lines written into specs, docs and code | the edit and write calls of each session | measured |
| Own commits on main: files, lines added and removed, spec lines | `git log origin/main` of each repository worked in | measured |
| Knowledge-base output on main: analyses, test cases, reviews, specs, common-issues | `git log origin/main` of `proj-ai-agentic`, classified by path | measured |
| Slash commands, roles, subagent calls by tier, MCP calls by server, tool calls | session history | measured |
| Backstop hook blocks and acknowledgements | session history | measured, a block is not a proven prevented error |
| Time saved | norm supplied by the owner | estimate only, never written to data files |

## Privacy rules

| Never stored | Stored instead |
|---|---|
| Prompts, answers, tool inputs and outputs | counts and durations |
| Ticket titles, page titles, test-case text | the ticket key only |
| Model or vendor names | tiers: light, standard, heavy |
| Local paths | the repository folder name |

## How a number gets here

| Step | Detail |
|---|---|
| 1 | Every turn end, the hook parses the changed session file and upserts its row. Unchanged files are skipped by size and mtime |
| 2 | At most every 30 minutes it also re-reads `origin/main` of the repositories seen in sessions. It never runs `git fetch` by itself |
| 3 | Reports are rewritten only when their text changes. Session rows carry no machine-specific fields, so the same data produces the same file everywhere |
| 4 | Data files stay uncommitted until `/create-pr` carries them, one pull request per session |

## Retention

The local session history is cleaned automatically after about a month. The data files are the permanent copy: a session that is not parsed before the cleanup is lost. `collect` reparses everything still on disk.
