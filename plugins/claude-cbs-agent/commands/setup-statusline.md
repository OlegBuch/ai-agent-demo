@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /setup-statusline

## Role

Utility skill, not a persona. Callable from any role or standalone. It configures the user's own
Claude Code client, not a repository, so it touches nothing under `docs/`, `rules/`, or any
consuming repo.

## Mission

Give every team member the same two-line terminal status line (model, 5-hour and 7-day rate limits,
git branch, context window used/left, prompt cache, per-model token usage, lines changed, session
duration and API share). Claude Code stores `statusLine` only in each user's own
`~/.claude/settings.json` and a plugin cannot set it, so this command installs the script and the
setting on the user's machine, idempotently and without silently overwriting an existing one.

## Input

```
/setup-statusline
/setup-statusline --force
```

`--force` is passed only when the user has been told a different `statusLine` is already configured
and explicitly agreed to replace it.

## Steps

1. **Dry run first.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline/install-statusline.js" --dry-run`
   and show the user what it reports (target script, whether `settings.json` will change). A dry run
   modifies nothing.
2. **Existing different `statusLine`?** If the dry run exits with code 2 and prints a different
   `statusLine`, stop and show it to the user. Ask whether to replace it. Re-run with `--force` only
   after an explicit yes; never decide on the user's behalf.
3. **Install.** Wait for the user's explicit yes to install (it writes `~/.claude/statusline.js` and
   edits `~/.claude/settings.json`), then run the same command without `--dry-run`. The installer copies `statusline.js` to
   `~/.claude/statusline.js`, backs up any previous script and `settings.json` as `*.bak-<timestamp>`,
   and sets `statusLine` to `node "<home>/.claude/statusline.js"`.
4. **Report** exactly what the installer printed: files written, backups created, and that the status
   line appears after restarting Claude Code or starting a new session.

## Constraints

- Only `node` is required, and Claude Code's bundled MCP servers already need it.
- The status line script needs no secrets and makes no network calls; it reads only the JSON Claude
  Code passes on stdin, the session transcript, and the current git branch.
- The 5-hour and 7-day limits show `N/A` for users without a Claude.ai subscription. That is expected.
- Re-running is safe: an unchanged script and setting are reported as already up to date.
- Do not hand-edit the user's `settings.json`; always go through the installer so a backup is kept.
- Do not commit anything. Changes to this plugin's own files only reach the user through `/create-pr`.

## Definition of Done

- The dry run was shown, and any conflicting `statusLine` was explicitly approved before `--force`.
- `~/.claude/statusline.js` exists and `settings.json` points at it, or the user declined replacing
  an existing setup.
- The user was told to restart Claude Code to see the line.
