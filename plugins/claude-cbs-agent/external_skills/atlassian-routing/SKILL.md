---
name: atlassian-routing
description: Which Atlassian MCP connection reaches which Jira/Confluence site. This plugin configures two separate OAuth connections — `atlassian-innowise` reaches ONLY innowise-group.atlassian.net (CBSA space, Innowise internal instance where analysis is drafted) and `atlassian-bank` reaches ONLY bank-proj.atlassian.net (TB space, PKF/CBS client instance docs are published to). Activates whenever reading or writing Jira issues or Confluence pages on either site — a Jira/Confluence URL is pasted, a page must be fetched or published, an issue searched or created — to pick the right tool prefix and to recover from "Cloud id ... isn't explicitly granted" errors.
user-invocable: false
---

# Atlassian access — which connection for which site

This plugin registers Atlassian's official remote MCP server **twice**, under two names. Each connection is OAuth-scoped to a different Jira/Confluence site. Pick the tool set by the site in the URL/link — **do not assume one connection can reach both**.

Both sites are active in parallel — neither is legacy. `innowise-group` is Innowise's internal corporate instance where analysis is drafted; `bank-proj` is the client (PKF/CBS project) instance those docs get published to.

| Site | Space(s) | Tool prefix to use |
|------|----------|--------------------|
| `innowise-group.atlassian.net` | `CBSA` (CBS-Analysis) — Innowise internal corporate instance | `mcp__plugin_claude-proj-agent_atlassian-innowise__*` |
| `bank-proj.atlassian.net` | `TB` (TEFO Bank) — PKF/CBS client project instance | `mcp__plugin_claude-proj-agent_atlassian-bank__*` |

## Wrong-site recovery

If a `getConfluencePage` / `getJiraIssue` call on one prefix errors with `"Cloud id ... isn't explicitly granted"`, that page lives on the **other** site — retry with the other tool prefix rather than asking for broader access.

## cloudId

Pass the hostname directly as `cloudId` (e.g. `bank-proj.atlassian.net`); no need to resolve a UUID first.

## Authentication

Each connection runs its own OAuth flow (browser-based, no API keys). If a tool call returns an auth error, tell the user to run `/mcp`, select the failing server (`atlassian-innowise` or `atlassian-bank`), and complete authentication.

**The site scoping is a convention set during OAuth consent**: grant the `atlassian-innowise` connection access to `innowise-group.atlassian.net` only, and the `atlassian-bank` connection access to `bank-proj.atlassian.net` only. If a connection was granted the wrong site, re-authenticate it via `/mcp` — do not compensate by widening the other connection's grant.
