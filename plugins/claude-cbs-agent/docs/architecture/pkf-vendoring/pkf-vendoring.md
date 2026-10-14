# bank-vendoring — what is bundled from bank-proj-marketplace and how to keep it fresh

## TL;DR

| Fact | Value |
|---|---|
| Plugin version | see `.claude-plugin/plugin.json` (2.0.0 was the vendoring release; 1.x depended on 11 bank plugins; `main-1.8.4` on the remote is the frozen rollback reference) |
| Upstream | `bank-proj-marketplace` (private GitHub), MIT (c) 2026 Dzmitry Bahaslouski |
| Pinned upstream SHA | `8743e5e4a1688106cc6c94dfd77ed9d95c8becb3` |
| Vendored on | 2026-10-05 |
| Record of truth | `third_party/bank-proj-marketplace/NOTICE.md` (pinned SHA, versions, patch list) and `third_party/bank-proj-marketplace/LICENSE` |
| Freshness rule | Snapshot older than 60 days -> refresh against upstream |
| External plugin dependencies | None (`plugin.json` has no `dependencies`, `marketplace.json` has no `allowCrossMarketplaceDependenciesOn`) |

## What is vendored

| Upstream plugin (version) | Bundled as | Where |
|---|---|---|
| `atlassian` 0.1.1 | skill `atlassian-routing`; MCP servers `atlassian-innowise`, `atlassian-bank` | `external_skills/`, `.mcp.json` |
| `bruno` 0.3.1 | skills `bruno`, `bruno-validate` | `external_skills/` |
| `bluedot` 0.1.0 | skill `bluedot`; MCP server `bluedot` | `external_skills/`, `.mcp.json` |
| `k8s` 0.2.0 | skills `k8s-connect`, `k8s-read-only` | `external_skills/` |
| `proj-context` 0.9.0 | skills `proj-context` (+10 references), `nfr` | `external_skills/` |
| `mermaid` | MCP server `mermaid-ai` (SSE `https://mcp.mermaid.ai/sse`), no skill | `.mcp.json` |

Remote MCP servers in `.mcp.json`: `atlassian-innowise` (`https://mcp.atlassian.com/v1/mcp/authv2`),
`atlassian-bank` (same URL with `?connection=bank`), `mermaid-ai`, `bluedot`
(`https://app.bluedothq.com/api/v1/mcp`). OAuth login for `atlassian-innowise`, `atlassian-bank` and
`bluedot` is done in `/mcp`.

## What was dropped, and why

Not used or documented as dependencies any more. Anyone who wants them installs them from
`bank-proj-marketplace` on their own.

| Dropped | Reason |
|---|---|
| `proj-devops` | About 3600 lines of infra runbooks, out of QA scope, 0 uses |
| `notebooklm` | Unstable, undocumented API |
| `spotless` | Java-only Python3 hook, irrelevant to this TypeScript suite |
| `proj-use-cases`, `tech-writer` | Unused; dropped by owner decision |

## Namespacing rules

| Thing | Name |
|---|---|
| Skill invocation | `claude-proj-agent:<name>` (e.g. `claude-proj-agent:atlassian-routing`, `claude-proj-agent:bruno`) |
| MCP tool | `mcp__plugin_claude-proj-agent_<server>__<tool>` (e.g. `mcp__plugin_claude-proj-agent_atlassian-bank__getJiraIssue`) |
| Skills folder | `external_skills/`, declared in `plugin.json` as `"skills": ["./external_skills/"]`; without that field the folder is not discovered |
| Old (1.x) names, do not use | `atlassian:routing`, `bruno:bruno`, `k8s:*`, `proj-context:*`, `mcp__plugin_atlassian_*` |

## Vendored files are exempt from the docs ceiling

Files under `external_skills/` are not authored docs: the 400-500 line soft ceiling and TL;DR-first rule
of `commands/team/context-resolution.md`'s Docs Authoring Standard do not apply to them. They must
stay byte-close to upstream so a sync diff is small. Every deliberate deviation is a numbered patch
in `third_party/bank-proj-marketplace/NOTICE.md`; do not edit a vendored file without adding or
updating that entry.

## Upstream sync procedure

1. Read the pinned SHA and the patch list in `third_party/bank-proj-marketplace/NOTICE.md`.
2. In a separate clone of upstream: `git fetch`, then
   `git diff <pinned SHA>..origin/main -- plugins/atlassian plugins/bruno plugins/bluedot plugins/k8s plugins/proj-context`.
3. Copy the changed files into `external_skills/` (and the MCP server definitions into `.mcp.json`).
4. Re-apply every patch from the NOTICE.md patch list; re-check each still applies.
5. Update the pinned SHA, plugin versions and vendoring date in `NOTICE.md`; keep `LICENSE`.
6. Bump `plugin.json` per the Plugin Version Bump Protocol in `commands/team/ai-architect-agent.md`:
   patch for a content refresh, minor for a new upstream skill brought in.
7. Update this file's TL;DR table if the SHA, versions or contents changed.
8. Tell the upstream owner (Dzmitry Bahaslouski) as a courtesy.

## Freshness rule

The AI Architect Framework Health Checklist flags a vendored snapshot older than 60 days
(vendoring date in `NOTICE.md`) for refresh against upstream. A flag means "run the sync
procedure above", not "the snapshot is broken".

## Rollback

Branch `main-1.8.4` on the remote is the frozen reference for the 1.x, bank-dependent version.
Rollback steps for users are in the root `README.md`, section "Migrating from 1.x /
bank-proj-marketplace".
