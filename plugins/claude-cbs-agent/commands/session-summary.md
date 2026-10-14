@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /session-summary

## Role

Utility skill, not a persona. Callable from any role, or standalone, at any point in a
conversation — it carries no fixed stack/domain assumption and doesn't need one.

## Mission

Capture what this Claude Code chat session discussed, implemented, and learned into a single
dated Markdown file under `docs/chat-history/`, so a later session — any role, any day — can
recover this session's context without re-deriving it from git history or re-litigating a
question this session already settled. This is the project's session-to-session continuity
layer: every persona checks it before implementing (see
`${CLAUDE_PLUGIN_ROOT}/commands/team/context-resolution.md`'s "Session History (Continuity)" section).

**This file belongs in the separate `proj-ai-agentic` git repository, never in the repo the
current session's working directory belongs to (e.g. `proj-test-automation`), and never in
`${CLAUDE_PLUGIN_ROOT}` (the installed plugin cache — it has no `.git` and isn't committable).**
Resolve the actual `proj-ai-agentic` working tree first: check the user's global
`~/.claude/settings.json` (`extraKnownMarketplaces`) for a `path`-type source, otherwise look for
a sibling directory (alongside the consuming repo or under the user's home directory) containing
both a `.git` folder and `plugins/claude-proj-agent/.claude-plugin/plugin.json`; if neither
resolves it, ask the user once for the local path. Everything below writes into
`<that working tree>/plugins/claude-proj-agent/docs/chat-history/`.

## Input

```
/session-summary
/session-summary <short title override>
```

No arguments are required — the title and slug are derived from what the session actually did.
Pass an override only when the auto-derived slug would be misleading.

## Steps

1. **Get the real timestamp — never guess it.** Run the actual system clock, don't infer date
   or time from conversation context:
   - PowerShell: `Get-Date -Format 'yyyy-MM-dd_HH-mm'`
   - Bash: `date +"%Y-%m-%d_%H-%M"`
2. **Review the full session** from its start (or since the last `/session-summary` checkpoint
   earlier in this same session, if one was already run) — not just the last few turns.
3. **Derive a short slug** (2-5 words, kebab-case) naming what the session was actually about.
   Include the ticket/branch key when the session worked against one (e.g.
   `tb-1525-customization-cleanup`) — this repo already anchors `docs/test-cases/` and branch
   names to ticket keys, so keep the same anchor here.
4. **Ensure `docs/chat-history/` exists** in the resolved `proj-ai-agentic` working tree (create it
   if this is the first summary written).
5. **Write the summary** to `<proj-ai-agentic working tree>/plugins/claude-proj-agent/docs/chat-history/<timestamp>_<slug>.md`
   using the template below. Never overwrite an existing chat-history file — every session gets
   its own timestamped file, append-only, same spirit as the `analysis.md` changelog /
   `-test-cases-vN` convention in `docs/test-cases/` (see `docs/INDEX.md`).
6. Report the file path back to the user. Leave it as an uncommitted change — don't commit or
   push it here; that only happens via the `/create-pr` skill, run explicitly by the user (once,
   for everything the session changed), per base-agent.md's "Repository & Persistence Model."

## Template

```markdown
# <Human-readable session title>

**Date/time:** <yyyy-MM-dd HH:mm> · **Branch:** <branch, if applicable> · **Ticket(s):** <keys, if any>

## Discussed
<Decisions made, clarifications resolved, context established — not implementation, not code.>

## Implemented
<Files created/edited/deleted, tests added, commands run, verification results (build/lint/test
outcome — pasted evidence, or `UNVERIFIED` with the owner's command; a test run only on an environment the owner named).
Cite paths, e.g. `api/integration_chapter/tests/foo.spec.ts:42`.>

## Learned
<Conventions, gotchas, or patterns discovered this session that weren't already documented.
If something here is a durable project fact rather than session narrative, say so — but still
route it into `docs/frame-specs/` or `docs/project-spec/` separately; this file is a log, not
the authoritative doc.>

## Open Items / Follow-ups
<Unresolved questions, deferred work, anything flagged back to another role. Write "None" if empty.>

## References
<Jira/Allure/PR links actually mentioned this session. Write "None" if empty.>
```

## Constraints

- Every section must reflect what actually happened in this session — write "None" for an empty
  section rather than inventing content to fill it.
- This command produces a chat-level log, not a substitute for `docs/frame-specs/` or
  `docs/project-spec/`. A durable project fact learned this session still belongs in those docs
  (or flagged to the user for someone to add it there) — recording it in `## Learned` here is not
  sufficient on its own.
- Don't generate a summary for a session that hasn't discussed or done anything yet.
