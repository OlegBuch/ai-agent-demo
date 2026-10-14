# More than one local `proj-ai-agentic` git clone can exist — only the resolved one is real

## The pattern/symptom

A machine can have `proj-ai-agentic` checked out in more than one place at once: the user's own
manual dev clone (where they actually edit, commit, and push — the one with the branch tracking
whatever MR is open), and a separate clone Claude Code itself manages for the plugin marketplace
(`~/.claude/plugins/marketplaces/proj-ai-agentic`, fetched/checked-out independently, only ever
synced to `main`). There is also a third, read-only, per-version **plugin cache**
(`~/.claude/plugins/cache/proj-ai-agentic/claude-proj-agent/<version>/`) that Claude Code serves as
`${CLAUDE_PLUGIN_ROOT}` — refreshed only when `.claude-plugin/plugin.json`'s `version` changes.

Reading or editing whichever of these paths happened to be in front of you (e.g. because a diagnosis
started from `${CLAUDE_PLUGIN_ROOT}` or from the marketplace mirror) without separately calling
`base-agent.md`'s own resolution algorithm lands real work in a clone the user doesn't push from —
invisible to their actual branch/MR — and, as a side effect, `closeout-track.ps1`'s own
`Resolve-CbsAiAgenticRoot` won't recognize those edits as "inside `proj-ai-agentic`" either (it
compares literal paths against the *resolved* root only), so they get miscounted as product-repo
work requiring a Task Closeout.

## The rule

Before editing **any** `proj-ai-agentic` file, resolve the real working tree via the same algorithm
`base-agent.md`'s "Repository & Persistence Model" / `closeout-lib.ps1`'s `Resolve-CbsAiAgenticRoot`
use (settings.json `extraKnownMarketplaces` directory source, else the first sibling of `$PWD`/`$HOME`
containing both `.git` and `plugins/claude-proj-agent/.claude-plugin/plugin.json`) — never assume a
path reached via an unrelated diagnostic (`${CLAUDE_PLUGIN_ROOT}`, `~/.claude/plugins/cache/...`,
`~/.claude/plugins/marketplaces/...`) is the same tree the user develops in. If a marketplace-managed
clone exists alongside the real dev clone, treat the marketplace one as Claude-Code-internal and
leave it untouched (or restored to a clean checkout of `main` if it was touched by mistake) — all
real edits belong in the resolved dev clone only.

## The incident(s)

**TB-3468 session, 2026-09-03.** Diagnosing why renaming the `allure-testops` MCP server to
`allure-testops-custom` never took effect for the user surfaced three separate copies of the
plugin's `.mcp.json`/`plugin.json`: the stale per-version cache
(`~/.claude/plugins/cache/.../1.2.1/`), and the marketplace-managed clone
(`~/.claude/plugins/marketplaces/proj-ai-agentic`, on the user's feature branch). The actual fix
(bumping `plugin.json`'s `version` plus adding a `version-bump-track.ps1`/`version-bump-check.ps1`
enforcement pair) was first written directly into that marketplace clone — only running
`Resolve-CbsAiAgenticRoot` afterward (while wiring the new hooks) revealed it resolves to a third,
different path, `C:\Users\user\proj-ai-agentic`: the user's real manual dev clone, already on the
same branch with an open MR and genuine uncommitted work
(`docs/module-theory/Currency Definition and Logic/INDEX.md`). Had to copy the 5 changed/new files
across into the real clone and hard-reset the marketplace clone back to a clean `main` before
committing in the correct tree — and `closeout-track.ps1` had already counted 8 of the misplaced
edits as "outside `proj-ai-agentic`" work, triggering a Task Closeout block that was really about
this framework's own tooling, not `proj-test-automation`.
