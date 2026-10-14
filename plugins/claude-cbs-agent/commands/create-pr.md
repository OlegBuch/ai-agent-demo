@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /create-pr

## Role

Utility skill, not a persona. Callable from any role, or standalone, at any point in a
conversation. This is the **only** place this plugin's commands commit, push, or open a PR for
the `proj-ai-agentic` working tree — every other command (`mqa-review-story`, `session-summary`,
`allure-native-update-test-case`, etc.) only ever leaves its output as an uncommitted change there
and says so. The AQA commands may commit test code in the *consuming* repo, but only after the
owner confirms the diff and the commit text (`verification-protocol.md`). See
`commands/team/base-agent.md`'s "Repository & Persistence Model."

## Mission

Turn everything this session changed inside the `proj-ai-agentic` working tree into exactly
**one** branch and **one** PR — never a branch per file, per task, or per unrelated change within
the same session. Then hand control back to the user and prompt them to run `/clear`, since this
command's job (and usually the session's) is done once the PR is open.

## When this runs

- The user runs `/create-pr` directly, or
- The user asks in chat, in their own words, to commit/push/open a PR for what's been done so
  far.

Never run this proactively after a single file write — that's exactly the per-file-branch
behavior this command exists to replace. If several distinct pieces of work happened earlier in
the session and nothing has been committed yet, this is the one point they all land in a single
PR together.

## Input

```
/create-pr
/create-pr <short description override>
```

No arguments are required — the branch slug and commit/PR summary are derived from what the
session actually changed. Pass an override only when the auto-derived slug would be misleading.

## Steps

### Step 1 — Resolve the working tree

Resolve the actual `proj-ai-agentic` git working tree on this machine, per base-agent.md's
"Repository & Persistence Model" (check `~/.claude/settings.json` for a `path`-type marketplace
source, otherwise locate a sibling checkout with `.git` +
`plugins/claude-proj-agent/.claude-plugin/plugin.json`, otherwise ask the user once). Never
operate on `${CLAUDE_PLUGIN_ROOT}` (the plugin cache — no `.git`, nothing to commit there).

### Step 2 — Check what's actually pending

Run `git status` in that working tree. If there is nothing staged, unstaged, or untracked, say so
plainly and stop — do not create an empty branch/PR.

If the working tree is currently mid-way through an *earlier*, already-pushed `/create-pr` branch
(i.e. the current branch isn't `main` and already has a remote-tracking branch with no new
local changes beyond what's already pushed), report that state instead of creating a new branch on
top of it.

### Step 3 — Make sure `main` is up to date, then branch fresh off it

First check that switching branches cannot lose the pending changes: list the uncommitted paths
from Step 2; if the current branch is not `main`, or `git diff --name-only HEAD..origin/main`
touches any of those paths (so `git pull` or `git checkout main` would conflict with them), or the
pending paths include files this session did not change, **stop and ask the user** how to proceed.
Never `git stash`, `git reset`, or discard anything to make the checkout succeed.

```bash
git fetch origin
git checkout main
git pull
git checkout -b <git-username>/<short-clear-slug>
```

- `<git-username>` — resolve from this working tree's own `git config user.name` (fall back to
  the global config; ask once if neither is set). Never hardcode a specific person's name.
- `<short-clear-slug>` — a brief (2-6 word), kebab-case summary of what *this session* actually
  changed, reviewed across everything pending (not just the most recent file) — e.g.
  `vadym.udaltsov/tb-2034-analysis-and-readme` if the session touched both an analysis doc and
  the README. Never a generic label like `update` or `changes`.
- Always branch fresh off `main` — never reuse a branch from an earlier session/task, even if one
  still exists locally.

### Step 4 — Stage and commit everything pending

**STOP before `git add`/`git commit`/`git push`/opening a PR:** show `git status`, the list of
files to be staged, the diff summary and the exact commit message, and wait for an explicit yes.

Stage every changed/new file relevant to this plugin's own tree (`git add` the specific paths that
changed — review `git status` output rather than blindly `git add -A`, in case something
unrelated and uncommitted happens to be sitting in the working tree from outside this session).
Write one commit message that summarizes **everything** this session changed, as a bulleted list
if it touched more than one distinct thing (e.g. "Add TB-2034 analysis" + "Expand README setup
guide" as two bullets in one commit, not two commits) — the "why" matters more than a mechanical
file list.

The commit message must contain no AI/Claude/Anthropic self-attribution of any kind — no
`Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" footer, nothing implying a
language model authored the change — per `base-agent.md`'s "Commit, Comment & Attribution
Hygiene." This applies here too, not only in `proj-test-automation`: write the message exactly as a
human engineer would, and verify the final text before running `git commit` — never assume a
tool's own default commit-message template already left it clean.

### Step 5 — Push and open the PR

```bash
git push -u origin <git-username>/<short-clear-slug>
```

Then open a PR against `main`:
- If the remote is GitHub and `gh` is available, use `gh pr create` with a title and body
  summarizing the session's changes.
- If the remote is Bitbucket (no `gh` equivalent available in this session), the `git push`
  output itself includes a direct "Create pull request" URL — report that link to the user
  instead of fabricating a PR number; do not claim a PR was opened if only the branch was pushed.

Never push straight to `main`. Never merge, approve, or self-close a PR you opened — the user
reviews and merges it by hand.

### Step 6 — Hand back to the user

Report what was committed (file list + one-line summary) and the PR link (or the branch name +
"create PR" link if no PR API was available). Then explicitly prompt the user to run `/clear` —
this command's job, and usually the session's, is finished once the PR/branch is out for review,
and continuing the same conversation only accumulates context that isn't needed anymore.

## Constraints

Never branch/commit/push the `proj-ai-agentic` tree without this command being the thing that
triggered it — no other skill does this on its own — and never before the explicit yes in Step 4.
Never switch branches in a way that can lose uncommitted changes (Step 3). Never create more than one branch/PR for one session's changes,
even if the session touched several unrelated files or tasks. Never reuse an old branch. Never
push directly to `main`. Never fabricate a PR link if the tooling available couldn't actually
open one. Never merge or approve the PR you open. Never let the commit message or PR title/body
contain any AI/Claude/Anthropic attribution line — verify before committing, don't rely on a tool
default. Always end by prompting `/clear`.

## Definition of Done

- Every pending change in the `proj-ai-agentic` working tree is committed, on one fresh branch off
  `main`, named `<git-username>/<short-clear-slug>`
- The branch is pushed and a PR (or, if no PR API is available, a direct "create PR" link) is
  reported back to the user
- The user was prompted to run `/clear` immediately after
- The user saw `git status`, the file list and the exact commit message, and confirmed before
  anything was staged, committed, pushed or opened
