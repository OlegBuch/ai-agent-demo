# proj-ai-agentic

Claude Code plugin marketplace hosting `claude-proj-agent` — the "virtual team" (personas, slash
commands, review workflows, process rules, and domain/stack knowledge) for the `proj-test-automation`
engagement. Everything Claude-related was moved out of `proj-test-automation` and centralized here
because that repo's client does not want any Claude/AI-agent files or mentions in it — see this
repo's `CLAUDE.md` for the full rationale and the trade-offs that came with it.

**For diagrams of how this all actually fits together** — the include graph, who depends on whom,
the QA pipeline's checkpoint, why `/team:orchestrator` costs so much more than `/review-board`, and
the docs-closeout enforcement hook — see [`README_ARCHITECTURE.md`](./README_ARCHITECTURE.md).

## What's in `claude-proj-agent`

- **`commands/team/`** (see `commands/team/INDEX.md` for the per-file catalog) — 9 personas (the `*-agent.md` files other than `base-agent.md`) forming the QA/BA/Architecture/Framework/PM team (Business Analyst, Solution
  Architect, AQA Lead, Senior Manual QA, Senior Full Stack AQA, Senior Code Style & Conventions
  Reviewer, Senior Change Justification Reviewer, AI Architect, Project Manager), plus
  `orchestrator`/`review-board` multi-persona debate commands. The first five (plus the Code Style
  and Change Justification reviewers) own the CBS product's requirements/design/testing; the AI
  Architect owns this framework's own structure, roles, and skills; the Project Manager owns
  personal HRM/timesheet logging assistance for this engineer — none of these overlap with each
  other. The Code Style Reviewer is deliberately mechanical-only (cosmetic/formatting/pattern
  conformance, never design judgment) and the Change Justification Reviewer is deliberately
  adversarial (challenges whether a change was actually necessary rather than just correct) —
  see the `review-cosmetic-pr`/`review-logical-pr`/`review-pr-orchestrator` command
  family below for why splitting these out of the Full Stack AQA/AQA Lead lenses, and out of a
  single joint review command, catches detail a combined pass was dropping. That family also
  introduced this plugin's first per-task model-routing convention, now promoted to
  `commands/team/model-routing.md` and `@`-included by `base-agent.md` itself so every persona and
  command has it: cheap fetch/summarize subagent work runs on Haiku, all judgment/findings stay on
  Sonnet 5, and Opus is disabled by default — used only when the user explicitly asks for it in
  that specific moment, never on the framework's own initiative.
- **`commands/execution/`** (see `commands/execution/INDEX.md`, and each domain folder's own
  `INDEX.md`) — the Manual QA → Allure TestOps → AQA automation command pipeline
  (`mqa-commands/`, `allure-commands/`, `aqa-commands/`), plus the `review-pr-commands/` package
  for GitLab merge-request review (outside that linear pipeline).
- **`docs/`** and **`rules/`** — `proj-test-automation`'s domain/business rules, tech stack,
  QA deliverables, session history, and Jira/Confluence/Allure process rules — bundled here
  instead of living in the consuming repo (see `CLAUDE.md`'s "Architecture Note" for why this is
  *not* the generic/portable design the personas were originally built for). Every skill that
  reads or writes here resolves this repo's own git working tree at runtime — never the installed
  plugin cache — per `commands/team/base-agent.md`'s "Repository & Persistence Model".
- **`hooks/`** (see `hooks/hooks.json`) — `classify-http-readonly.ps1`, a `PreToolUse` hook
  (`Bash|PowerShell`) that auto-approves every command except known mutating shapes (filesystem,
  git, package managers, mutating HTTP verbs, kubectl, docker, ...), which fall through to the
  normal permission prompt, and that hard-denies commit and PR text that mentions AI authorship (`git commit` and `git tag` in any form including `-F <file>`, `gh pr` and `glab mr`/`glab issue` bodies; it does not inspect Jira, Confluence or chat comments); plus four
  `PostToolUse`/`Stop` pairs that enforce prose conventions as technical backstops, not just
  prompt instructions — `closeout-track.ps1`/`closeout-check.ps1` for `context-resolution.md`'s
  Task Closeout Protocol (`proj-closeout-ack` escape hatch), `delegation-track.ps1`/
  `delegation-check.ps1` for `model-routing.md`'s Gather-stage delegation (`proj-delegation-ack`
  escape hatch), `model-routing-track.ps1`/`model-routing-check.ps1` (plus a `UserPromptSubmit`
  hook, `model-routing-classify.ps1`) for `model-routing.md`/`model-routing-levels.md`'s mandatory
  per-message complexity classification, hook-enforced via the `proj-model-tier` declaration itself
  (not an escape hatch — there's no "skip this" token for it), and `version-bump-track.ps1`/
  `version-bump-check.ps1`, which require a `plugin.json` version bump after a plugin-cache-served
  file (anything under `plugins/claude-proj-agent/` except `docs/` and `rules/`) was edited — see
  each pair's own header comment for its exact rule. A fifth `Stop` hook, `node scripts/metrics/metrics.js auto`,
  records usage metrics into `docs/metrics/` (see `docs/metrics/INDEX.md`; needs `node` on the PATH). All `.ps1`
  hooks share `hooks/hook-common.ps1`, are saved as UTF-8 with BOM and run with `-ExecutionPolicy Bypass`.
- **`scripts/`** — `validate-framework.js` is a read-only drift check (dead command and file references,
  INDEX and README catalogs against the disk, Jira/Confluence write instructions, test runs without the
  environment question, vendored-skill hygiene). Run it before opening a PR:
  `node plugins/claude-proj-agent/scripts/validate-framework.js --consumer <path to proj-test-automation>`.
  `metrics/metrics.js` backs the `/metrics` command and the metrics hook; `statusline/` backs `/setup-statusline`.
- **Verification and mutation rules** — `commands/team/verification-protocol.md`, `@`-included by every command
  that edits code, writes to Allure, deletes files or hands text to a human: evidence instead of assertion;
  a test may be run only while fixing, automating or changing a test, after asking the owner which
  environment to use (otherwise the criterion is `UNVERIFIED` with the exact command); Jira and Confluence
  are read-only for the framework; an explicit stop before commit, push, PR, Allure writes and deletions.
- **`.mcp.json`** — bundled MCP servers (`github`, `gitlab`, `filesystem`, `allure-testops-native`,
  `allure-testops-custom`, `playwright`, plus the remote `atlassian-innowise`, `atlassian-bank`,
  `mermaid-ai`, `bluedot`), session-wide once the plugin is enabled, regardless of
  the session's working directory. Tracked, secret-free — every token is a `${VAR}` placeholder
  resolved from your own environment at launch time (`docs/ci-cd-secrets.md`); `playwright` is the
  one exception needing no secret at all (see Step 9). `playwright` gives Claude a real,
  driveable browser (navigate, click, screenshot, read the DOM) — distinct from the two Allure
  MCP servers, which only return structured API data. Use it to visually inspect how something
  actually renders (e.g. the Allure Report UI's attachment/step layout) when improving
  traceability/reporting design, not as a way to read Allure data — see `rules/allure.md` §9 for
  the exact boundary between it and the two Allure MCP servers.

## Dependencies

`claude-proj-agent` has **no external plugin dependencies** (2.0.0+): `plugin.json` declares none.
Everything it needs ships inside the plugin — the skills `atlassian-routing`, `bruno`,
`bruno-validate`, `bluedot`, `k8s-connect`, `k8s-read-only`, `proj-context` and `nfr`, and the
remote MCP servers `atlassian-innowise`, `atlassian-bank`, `mermaid-ai` and `bluedot` (alongside
`github`, `gitlab`, `filesystem`, `allure-testops-*` and `playwright`). See "Bundled skills &
services" below, and "Migrating from 1.x" if you previously installed the bank plugins.

## Full local setup, from zero

This walks a new engineer — including someone who has never touched Claude Code, SSH keys, or
plugin marketplaces before — through getting `claude-proj-agent` up and running on a fresh Windows
machine. It's written from an actual, verified run-through, in the order it was actually done:
install the tool, prove you have the right access, get the repo, tell Claude Code where to find
it, then turn everything on and check it.

If you're on macOS/Linux, Step 1 has an equivalent install command, and everything from Step 3
onward is the same shell commands with a different clipboard/PATH mechanic — this section just
hasn't been walked through end-to-end on those OSes the way it has on Windows.

**What this setup gets you**: `claude-proj-agent` itself, working, with its personas/commands
available in any Claude Code session on this machine. Actually *using* the automation commands
(`aqa-automate`, etc.) day to day happens with `proj-test-automation` as your working directory —
cloning and configuring that repo (`npm install`, `.env`, Playwright browsers) is a separate,
standard onboarding task this section doesn't cover; see
`docs/frame-specs/build-and-run.md` in this repo for that.

### Step 1 — Install the Claude Code CLI

Open **PowerShell as Administrator** and run:

```powershell
irm https://claude.ai/install.ps1 | iex
```

(macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`, or `brew install --cask
claude-code` on macOS. All platforms also support `npm install -g @anthropic-ai/claude-code` if
you'd rather use Node.js, version 22+.)

Verify it worked — open a **new** terminal window (PATH changes don't apply to the one you just
used to install) and run:

```
claude --version
```

If that prints a version number, skip to Step 3. If it says `claude` isn't recognized, go to
Step 2.

### Step 2 — Fix your PATH if `claude --version` didn't work

The installer is supposed to add `C:\Users\<you>\.local\bin` to your PATH automatically, but on
some machines it doesn't take effect until you check it by hand:

1. Press **Win**, search **"Environment Variables"**, open **"Edit the system environment
   variables"**.
2. Click **Environment Variables...**.
3. In **both** the top box (**User variables**) and the bottom box (**System variables**), find
   the `Path` entry, click **Edit**, and confirm `C:\Users\<you>\.local\bin` is listed in each. Add
   it if it's missing from either one.
4. Close all dialogs, **restart your terminal** (a full reboot if it still doesn't work), and
   re-run `claude --version`.

### Step 3 — Get SSH access to Bitbucket (this repo's host)

`proj-ai-agentic` lives on Bitbucket, and Bitbucket needs to recognize your machine before it'll
let you clone over SSH.

Check whether you already have a key before generating a new one — reusing an existing key is
fine:

```bash
ls ~/.ssh/id_ed25519.pub
```

If that says "No such file", generate one (accept the default path when prompted, set a
passphrase):

```bash
ssh-keygen -t ed25519 -C "<your work email>"
```

On Windows, the SSH agent service that holds your key's passphrase in memory is disabled by
default — turn it on once per machine, then start it:

```powershell
Get-Service -Name ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent
```

Copy the **public** key to your clipboard:

```powershell
# Windows — PowerShell
Get-Content ~/.ssh/id_ed25519.pub | Set-Clipboard
```

```bash
# macOS
pbcopy < ~/.ssh/id_ed25519.pub
# Linux (requires xclip)
xclip -selection clipboard < ~/.ssh/id_ed25519.pub
```

No clipboard tool available? Just print it and copy the output by hand: `cat
~/.ssh/id_ed25519.pub`.

Paste it into Bitbucket: bitbucket.org → your avatar (top-right) → **Personal settings** → **SSH
keys** → **Add key**.

Confirm it worked, from any terminal (a VS Code integrated terminal works fine):

```bash
ssh -T git@bitbucket.org
```

A successful response looks like `authenticated via ssh key` — not a permission/host-key error.
Don't move on until this works.

### Step 4 — Clone `proj-ai-agentic`

```bash
git clone git@bitbucket.org:innowise-group/proj-ai-agentic.git
```

This is a real, editable working tree — different from the read-only cache copy that registering
the marketplace (Step 5) installs separately (see `commands/team/base-agent.md`'s "Repository &
Persistence Model" for why both exist).

### Step 5 — Register the marketplace

Open a terminal **inside the `proj-ai-agentic` folder you cloned in Step 4** and start Claude
Code:

```bash
cd proj-ai-agentic
claude
```

Inside the Claude Code session, run `/plugin`, go to **Marketplace**, and add the source:

```
Add Marketplace → git@bitbucket.org:innowise-group/proj-ai-agentic.git
```

It should confirm the marketplace was added — if it fails, re-check Step 3's SSH access before
retrying.

### Step 6 — Refresh the caches

Right after adding the marketplace, run these two commands so Claude Code picks up everything
fresh rather than relying on a stale in-memory list:

```
/reload-skills
/reload-plugins
```

### Step 7 — Authorize the MCP servers that need it

Run `/mcp`. Three bundled remote servers need an OAuth login before they work. The two Atlassian
ones are separate logins, one per Jira/Confluence site (see the `claude-proj-agent:atlassian-routing`
skill for why there are two):

- **`atlassian-innowise`** — select it, **Authenticate**, and log in with your **Innowise**
  Atlassian account (innowise-group.atlassian.net).
- **`atlassian-bank`** — same, but log in with your **PKF/client** Atlassian account
  (bank-proj.atlassian.net).
- **`bluedot`** — same, with your Bluedot account (only needed for meeting-recording queries).

For both Atlassian servers, the browser consent screen will ask to grant read **and** write access —
uncheck (deny) the **write** permission before confirming, so the connection ends up read-only. None
of this framework's commands need to write to Jira/Confluence directly, so read-only is the correct,
least-privilege setting, not an optional hardening step.

### Step 8 — Turn on auto-update and install for the team

Still in `/plugin`, go to **Marketplace**:

Select **`proj-ai-agentic`** → **Enable auto-update** → **Update now** → **Browse plugins** →
press **Enter** on `claude-proj-agent` → **Install for all collaborators**.

**"Install for all collaborators"** (rather than a plain personal install) is what makes a
teammate opening this same marketplace later pick the plugin up automatically too, instead of
each person repeating this step by hand.

This configuration lands in your **global** `~/.claude/settings.json` (not a project-local file
inside `proj-ai-agentic`) — which is what you want: it means these plugins and personas are
available in *any* Claude Code session on this machine, including one you later open with
`proj-test-automation` as the working directory, with nothing further to configure there.

### Step 9 — MCP secrets for direct GitHub/GitLab/Allure TestOps tools (only if you need them)

Skip this unless you specifically plan to use the bundled `github`, `gitlab` or Allure TestOps MCP tools
directly — `gitlab` is also what the `review-pr-commands` read MRs through — (most day-to-day
QA/AQA/analysis commands go through the Atlassian MCP servers from Step 7 instead, and don't need
this).

`plugins/claude-proj-agent/.mcp.json` is a tracked, secret-free file — nothing to copy or create.
Every token in it is a `${VAR}` placeholder, resolved from your own OS environment variable of the
same name when Claude Code launches the server. This is a **one-time, per-machine, manual step** —
set the variable once, the plugin (and every future version bump of it) reads it from then on:

- `GITHUB_TOKEN` — a GitHub personal access token (github.com → **Settings → Developer settings →
  Personal access tokens**), read access is enough.
- `GITLAB_TOKEN` — a personal access token from the self-hosted GitLab (`http://10.0.102.50` →
  avatar → **Preferences → Access Tokens**), scope `read_api` is enough. Read by the `gitlab` server
  (`@zereight/mcp-gitlab`), which `.mcp.json` pins to `GITLAB_API_URL=http://10.0.102.50/api/v4` and
  `GITLAB_READ_ONLY_MODE=true` — it can list/read MRs, diffs, discussions, pipelines, files, but
  never create or change anything. Needs the corporate network/VPN to reach `10.0.102.50`.
- `ALLURE_TOKEN` — your Allure TestOps personal API token (from your Allure TestOps account
  settings). One value, read by both `allure-testops-native` (test case/shared step/mute CRUD) and
  `allure-testops-custom` (self-owned, group search/launches/results/statistics/metadata); see
  `plugins/claude-proj-agent/rules/allure.md` §1/§8 for what each is for.

`allure-testops-custom` (the self-owned, `uv`-based server) additionally needs `uv` (Python
3.10+) installed locally — see `plugins/claude-proj-agent/docs/ci-cd-secrets.md`'s "Prerequisites
beyond Node/npm" for the install command and the fix for the Application Control (`os error
4551`) failure some locked-down corporate machines hit the first time `uv` tries to run.

**Windows (PowerShell) — persists for your Windows user account:**

```powershell
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "<YOUR_TOKEN>", "User")
[System.Environment]::SetEnvironmentVariable("GITLAB_TOKEN", "<YOUR_GITLAB_TOKEN>", "User")
[System.Environment]::SetEnvironmentVariable("ALLURE_TOKEN", "<YOUR_ALLURE_TOKEN>", "User")
```

`playwright` needs no token/secret — it's a plain `npx @playwright/mcp@latest` process. Its only
one-time cost is the first launch, which downloads the package and a Chromium build over the
network; expect that first connection in `/mcp` to take noticeably longer than the other servers,
not to fail.

macOS/Linux, `cmd.exe`, the Windows GUI, and a per-project `direnv` alternative are all in
`plugins/claude-proj-agent/docs/ci-cd-secrets.md`.

**`allure-testops-native` talks to `allure.proj.local` over plain HTTP on `:8090`** — the
officially documented MCP/CI port — so there is no certificate to trust and nothing else to
configure beyond setting `ALLURE_TOKEN` above. Don't point it at `:8443`: that's nginx's
browser-only HTTPS front, its certificate is self-signed with `Basic Constraints: CA:FALSE`
(structurally untrustable to Node/OpenSSL, no matter how it's re-pinned), and MCP was never meant
to run through it.

Restart Claude Code after setting the environment variables for the new/changed servers to
connect.

**Troubleshooting**:

- *"I don't see the `/plugin` command at all"* — the CLI build is too old; re-run Step 1's install
  command, then restart the terminal.
- *"A plugin/command that was just added to the marketplace isn't showing up"* — the local cache
  is stale: `/plugin` → **Manage marketplaces** → select the marketplace → **Update** (or wait for
  the next session if Auto-Update is on). If it's a genuinely new plugin rather than a change to
  one already installed, updating the marketplace alone won't add it — it still needs its own
  `/plugin install <plugin>@<marketplace>`.
- *"A command/skill I expect isn't available"* — confirm it's actually enabled: `/plugin list`
  should show it as `true`. If it's missing from that list entirely, re-run the matching
  `/plugin install` line above.
- *"`allure-testops-native`/`allure-testops-custom`/`github`/`gitlab`/`filesystem` don't show up at
  all in `claude mcp list`, not even as unauthenticated"* — confirm `GITHUB_TOKEN`/`GITLAB_TOKEN`/`ALLURE_TOKEN` are
  actually set in the environment the Claude Code process was started from (a value set via
  `SetEnvironmentVariable`/`setx`/a shell profile only applies to processes started *after* it was
  set), then restart Claude Code. Since `.mcp.json` is a tracked file now, a plugin version bump
  never drops these servers on its own.
- *"`allure-testops-native` fails to reconnect with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`"* — check
  `.mcp.json`'s `allure-testops-native.url`: it must be `http://allure.proj.local:8090/api/mcp`
  (plain HTTP). If it's pointed at `:8443` instead, that's the browser-only nginx front with a
  self-signed, structurally-untrustable certificate — no amount of `NODE_EXTRA_CA_CERTS`
  wiring fixes it; switch the URL back to `:8090`. `allure-testops-custom` (the self-owned,
  `uv`-based server) is unaffected either way.
- *"`/mcp` shows `Failed to reconnect to plugin:claude-proj-agent:allure-testops-custom: CONNECTION_CLOSED`"*
  (while `allure-testops-native` connects fine) — `allure-testops-custom` is a local process Claude Code
  launches via `uv`, not an HTTP connection, so `CONNECTION_CLOSED` here almost always means the
  process itself failed to start rather than an auth/network problem. Run `uv --version` in a
  terminal; if it's not found, `uv` isn't installed — see the Step 9 prerequisite above.
- *"`uv` fails with `An Application Control policy has blocked this file. (os error 4551)`"* on a
  locked-down corporate machine — Application Control (WDAC/AppLocker) is blocking the Python
  interpreter `uv` downloaded into `AppData\Roaming`, not `allure-testops-custom` or your token. See
  `plugins/claude-proj-agent/docs/ci-cd-secrets.md`'s "Prerequisites beyond Node/npm" for the fix
  (point `uv` at an already-installed, policy-approved Python via `UV_PYTHON`, or get one installed
  through IT) — never try to bypass Application Control itself.
- *"`Stop hook error: ... cannot be loaded because running scripts is disabled on this system"*
  (for `closeout-check.ps1`, `delegation-check.ps1`, `model-routing-check.ps1` and/or
  `version-bump-check.ps1`) — the Windows PowerShell execution
  policy for your user is `Restricted`, blocking every `.ps1` script, including this plugin's Stop
  hooks. Fix, no admin rights needed:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  No restart needed — each hook launches a fresh `powershell.exe` process, which reads the policy
  from the registry at that moment. If the command instead reports the policy is "overridden by a
  policy defined at a more specific scope," it's locked by Group Policy at the org level and needs
  IT to allow `RemoteSigned`/`Bypass` for `CurrentUser`.

### Step 10 — Verify

Open a fresh Claude Code terminal, this time with `proj-test-automation` as the working directory
(clone/configure it first per `docs/frame-specs/build-and-run.md` if you haven't already), and
run:

```
/plugin list
```

Confirm `claude-proj-agent@proj-ai-agentic` shows as enabled, then try:

```
/execution:mqa-commands:mqa-review-story <any ticket key you have access to>
```

If it resolves the ticket via Jira/Confluence and writes `docs/test-cases/<TICKET-KEY>/analysis.md`
into your `proj-ai-agentic` checkout from Step 4 (never into `proj-test-automation`), the whole
chain — SSH access, the marketplace, both repos, and the Atlassian connections — is wired up
correctly.

## Keeping `proj-test-automation`'s git history clean

`proj-test-automation`'s client requires **zero committed** Claude/AI-agent trace in that repo's
shared git history (see this repo's `CLAUDE.md`, "Primary Consumer") — this has already caused a
real incident once (a default `Co-Authored-By: Claude` commit trailer forced a merge request
closed and reopened under clean history). The setup above avoids this by keeping all
configuration in your **global** `~/.claude/settings.json`, never a file inside
`proj-test-automation`'s own working tree.

The one thing worth adding once you're working inside `proj-test-automation`: a local,
never-committed `CLAUDE.md` restating that no commit, PR, or comment may ever carry an
AI/Claude/Anthropic attribution line — the bundled `claude-proj-agent` hook already hard-denies a
`git commit` whose message carries one (it does not check PR or comment text), but this file is a second, human-readable reminder for any session where the plugin
isn't active. Keep it out of git via your **personal** `.git/info/exclude` (never the shared,
committed `.gitignore`):

```bash
cd proj-test-automation
cat >> .git/info/exclude <<'EOF'
/CLAUDE.md
EOF
cat > CLAUDE.md <<'EOF'
# proj-test-automation — local project instructions (never committed)

This repository's client requires zero Claude/AI-agent trace in shared git history. Concretely:

- Never include any AI/Claude/Anthropic self-attribution in a commit message, commit trailer
  (e.g. `Co-Authored-By: Claude ...`), PR title/description, or code comment/docstring — write
  every one exactly as a human engineer would, regardless of any tool default that would
  otherwise add such a line.
- Verify the exact commit/PR text before running `git commit`/opening a PR — never assume a
  default template already left it clean.
EOF
```

If you ever *do* register the marketplace or enable plugins from a session opened directly inside
`proj-test-automation` (rather than relying on the global settings the Step 5–8 flow above already
gives you), add `/.claude/` and `/.mcp.json` to that same `.git/info/exclude` first — never the
committed `.gitignore`.

## Installing (quick reference, once the full setup above is already done elsewhere)

If you've already completed the full setup once on this machine or account (CLI installed, SSH
keys registered on Bitbucket, marketplace added under your global settings),
joining a fresh machine only needs Steps 1–3 (install, PATH check, SSH keys — all truly
one-time, per-machine) redone, then Steps 5–8 (register the marketplace, refresh, authorize, enable)
inside a fresh `proj-ai-agentic` clone.

## Migrating from 1.x / bank-proj-marketplace

Version 2.0.0 bundles what 1.x pulled in from `bank-proj-marketplace` and drops that dependency.
Do these in order:

1. In `/plugin`, **disable** the 11 bank plugins first (`atlassian`, `bruno`, `mermaid`,
   `proj-context`, `proj-use-cases`, `proj-devops`, `bluedot`, `tech-writer`, `k8s`, `spotless`,
   `notebooklm`). Do **not** remove the bank marketplace itself for about a week — it is your rollback
   path.
2. Update `claude-proj-agent` to 2.0.0 and restart Claude Code.
3. In `/mcp`, log in to `atlassian-innowise`, `atlassian-bank` and `bluedot` (deny write access on
   the Atlassian consent screens, as in Step 7).
4. In your personal settings, rewrite permission allow-lines `mcp__plugin_atlassian_*` to
   `mcp__plugin_claude-proj-agent_atlassian-innowise__*` / `mcp__plugin_claude-proj-agent_atlassian-bank__*`,
   and remove the bank entries from `enabledPlugins`.
5. Smoke-check: fetch one page from each Atlassian site (CBSA on innowise, TB on bank).
6. Rollback: install `claude-proj-agent` from the `main-1.8.4` branch reference (or pin version
   1.8.4) and re-enable the bank plugins.

## All available commands & skills

Everything below is what Steps 5–8 actually install. "Invocation" is the literal call form as
documented in that command/skill's own source — where a skill doesn't document an explicit
slash form, it says "auto" (context-triggered) instead of a guessed syntax.

### `claude-proj-agent` (this repo — `plugins/claude-proj-agent/commands/`)

**Team / persona commands**

| Invocation | Description |
|---|---|
| `/team:orchestrator [participants]: <topic>` | Full 4-round structured technical review across the requested personas: independent proposal → peer review → author response → final decision report. Expensive (`N × (N-1)` peer reviews) — reserve for a genuinely contested, hard-to-reverse decision, never all nine participants by default. See `commands/team/INDEX.md`'s "Choosing between a direct persona call, `/review-board`, and `/team:orchestrator`" for the full decision table. |
| `/review-board <participants>: <topic>` | Lighter single-pass design review — each requested persona responds once, then a `[VERDICT]` (consensus / open conflicts / recommended next step). The default multi-perspective path for most questions. |

Invocation forms below are the short forms documented in each command's own file; the full
namespaced form is `/claude-proj-agent:team:<name>` / `/claude-proj-agent:execution:<package>:<command>`,
and the model-routing hook arms only on a prompt that starts with that full prefix.

Participant keys for both: `architect` (Solution Architect), `analyst` (Business Analyst),
`aqa-lead` (QA Test Automation Lead), `manual-qa` (Senior Manual QA), `aqa` (Senior Full Stack
AQA), `code-style` (Senior Code Style & Conventions Reviewer — cosmetic/formatting/pattern
conformance only), `skeptic` (Senior Change Justification Reviewer — adversarially challenges
whether a change was actually necessary), `ai-architect` (AI Architect — this framework's own
structure/roles/skills, not the CBS product), `pm` (Project Manager — personal HRM/timesheet
logging assistance, not product scope).
The 9 persona files themselves (`commands/team/*-agent.md`, except the shared `base-agent.md`) are **not** separately invocable slash
commands — they're the "Role" every `execution:` command below assumes (for the first five, plus
`code-style` and `skeptic` in the `review-pr-commands` family specifically), the meta-role
that maintains the framework those commands live in (for `ai-architect`), or the role
`/create-hrm-template` applies (for `pm`), and the personas these two review commands draw on.

**Execution pipeline — Manual QA → Allure TestOps → AQA automation**

| Invocation | Description |
|---|---|
| `/execution:mqa-commands:mqa-review-story <TICKET-KEY>` | Resolve a Jira ticket's full context (Epic/Tasks/Confluence) and write/update `docs/test-cases/<TICKET-KEY>/analysis.md` — Business Flows, Rules, Alt Flows, ACs, gaps, required test types. |
| `/execution:mqa-commands:mqa-create-local-test-case <TICKET-KEY> [types:...]` | Local-only counterpart to `allure-native-create-test-case`: design the same traceable test case suite from a completed analysis file, but persist it as `docs/test-cases/<TICKET-KEY>/<TICKET-KEY>-test-cases-v<N>.xlsx` **and** `.csv` (never Allure), plus an appended Coverage Matrix analysis in `analysis.md`. Use when Allure isn't the target for this ticket (offline review, client handoff, ad-hoc analysis). |
| `/execution:allure-commands:allure-native-create-test-case <TICKET-KEY> [types:...]` | Design and create the full test case suite in Allure TestOps from a completed analysis file. |
| `/execution:allure-commands:allure-native-update-test-case <TICKET-KEY> [types:+/-...]` | Reconcile existing Allure cases after the ticket/AC/Confluence changed — patch in place, mark `Outdated`, never delete for a requirement change. |
| `/execution:allure-commands:allure-native-get-test-case <id>` or `tag:<TICKET-KEY>` | Fetch and render one Allure test case using the column set defined in `commands/team/manual-qa-agent.md` (12 columns). Read-only. |
| `/execution:allure-commands:allure-native-list-test-cases [status:\|ticket:...]` | List/filter Allure test cases as a coverage overview. Read-only. |
| `/execution:allure-commands:allure-native-delete-test-case <id>` | Remove a genuinely mistaken/duplicate Allure case (soft-delete) — never for a requirement change, that's `allure-native-update-test-case`'s `Outdated` path. |
| `/execution:allure-commands:allure-native-create-shared-step <name>` | Extract a repeated step sequence into a reusable Shared Step. |
| `/execution:allure-commands:allure-native-update-shared-step <shared-step-id>` | Reconcile an existing Shared Step's content — propagates to every referencing test case. |
| `/execution:allure-commands:allure-native-find-shared-steps [name:...]` | Check for an existing Shared Step before creating a near-duplicate. Read-only. |
| `/execution:allure-commands:allure-native-create-mute <test-case-id> <reason>` | Suppress a known-flaky/broken-for-unrelated-reasons automated test's failures, with a stated reason. |
| `/execution:allure-commands:allure-native-delete-mute <mute-id>` | Remove a mute once its cause is fixed or no longer justified. |
| `/execution:allure-commands:allure-custom-search-test-cases feature:\|component:\|story:\|suite:\|tag:\|status:\|automated:<value>` | Find cases by Feature/Component/Story/Suite/tag/status/automated via the in-memory index (`allure-testops-custom`) — compact summary. Read-only. |
| `/execution:allure-commands:allure-custom-list-field-values field:<Feature\|Component\|Story\|Suite>` | List every distinct value of one custom field, to catch a near-duplicate before creating a new one. Read-only. |
| `/execution:allure-commands:allure-custom-refresh-index` | Rebuild the in-memory index after cases changed mid-session. |
| `/execution:allure-commands:allure-custom-list-launches [size:<n>]` | Recent launches, newest first, with pass/fail counts. Read-only. |
| `/execution:allure-commands:allure-custom-get-test-results <launch-id> [status:<...>]` | Test results of one launch, optionally filtered by status. Read-only. |
| `/execution:allure-commands:allure-custom-search-failed-tests [size:<n>]` | Failed and broken results of the most recent launch. Read-only. |
| `/execution:allure-commands:allure-custom-get-project-statistics` | Total/automated counts, automation rate, last closed launch breakdown. Read-only. |
| `/execution:allure-commands:allure-custom-project-metadata what:<projects\|categories\|category-matchers\|layers\|statuses>` | Project metadata lookups. Read-only. |
| `/execution:allure-commands:allure-review-report <path-to-allure-results-or-report> [focus:...]` | Full Stack AQA command: opens the **rendered** Allure HTML report in a real browser via the `playwright` MCP (tabs, step tree, request/response attachments) and reports Usability/Structure/Architecture findings — a visual check no data-only Allure MCP tool can do — then implements a fix directly in `proj-test-automation`'s automation code when explicitly asked. |
| `/execution:aqa-commands:aqa-automate <allure-case-id>` or `tag:<TICKET-KEY>` | Automate one (or every tagged, not-yet-automated) Allure case into real test code. |
| `/execution:aqa-commands:aqa-review-test <allure-case-id>` or `tag:<TICKET-KEY>` | Read-only: does the existing automation still prove what the case says and match the real API contract? |
| `/execution:aqa-commands:aqa-update-test <allure-case-id>` or `tag:<TICKET-KEY>` | Patch existing automation back in sync after its Allure case changed. |
| `/execution:aqa-commands:aqa-delete-test <allure-case-id>` | Remove automation whose Allure case was deprecated/deleted — code-side cleanup, always with confirmation. |

**GitLab merge-request review (`execution:review-pr-commands:...`)** — outside the linear pipeline above:

| Invocation | Description |
|---|---|
| `/execution:review-pr-commands:review-cosmetic-pr <mr-iid>` or `/merge_requests/<mr-iid>` or a full MR URL | Code Style lens only, every changed line — writes `docs/review-mr/<mr-iid>-.../cosmetic_analysis.md`. |
| `/execution:review-pr-commands:review-logical-pr <mr-iid>` or `/merge_requests/<mr-iid>` or a full MR URL | AQA + AQA Lead lenses, joint — correctness and suite-level fit, plus first-pass necessity citations — writes `logical_analysis.md`. |
| `/execution:review-pr-commands:review-pr-orchestrator <mr-iid>` or `/merge_requests/<mr-iid>` or a full MR URL | Entry point for reviewing a whole MR: runs the two commands above if their files don't exist yet, then has Skeptic adversarially challenge their necessity conclusions. Read-only against GitLab — writes the merged findings, Change Justification Debate log, and ready-to-paste GitLab comment to `final_analysis.md` in the same folder. |
| `/execution:review-pr-commands:review-pr-recheck <mr-iid>` or `/merge_requests/<mr-iid>` or a full MR URL | Run after `final_analysis.md`'s comment was posted and the author pushed fixes: verifies every raised item was actually fixed (file:line by file:line) and sweeps the current diff for anything new — writes `re-review-analysis.md` and its own ready-to-paste follow-up comment. Never rewrites the other three files. |
| `/execution:review-pr-commands:review-pr-distill-patterns [min-occurrences:<N>]` | Touches no GitLab MR: mines every past `final_analysis.md`/`re-review-analysis.md` under `docs/review-mr/` for a finding recurring across ≥3 (default) distinct MRs, and drafts — never applies — the `docs/frame-specs/` addition that would catch it automatically next time. Writes `docs/review-mr/_pattern-log.md`. |

**Utility skills**

| Invocation | Description |
|---|---|
| `/session-summary [title override]` | Capture what this Claude Code session discussed/implemented/learned into a dated `docs/chat-history/<timestamp>_<slug>.md` file. |
| `/create-pr [description override]` | The **only** command that commits/pushes/opens a PR against this repo — one PR per session (never a branch per file/task), branch named `<git-username>/<short-slug>`, ends by prompting `/clear`. |
| `/create-hrm-template <DD.MM.YYYY> <day description>` | Project Manager persona (`pm-agent.md`): resolve the Jira Parent/Epic for every ticket mentioned, group the day's work per the org's HRM logworks template, print it, and upsert it into `docs/hrm-logs/<yyyy-MM>.md`. Never fabricates hours. |
| `/setup-statusline [--force]` | Install the shared two-line terminal status line (model, 5h/7d limits, branch, context, cache, per-model tokens, lines changed, duration) into the user's own `~/.claude/settings.json`: dry run first, backups kept, never replaces a different existing `statusLine` without an explicit yes. Source: `plugins/claude-proj-agent/scripts/statusline/`. |
| `/metrics [collect\|report\|team]` | Refresh and show the measured usage record under `plugins/claude-proj-agent/docs/metrics/`: sessions, active hours, time per ticket from first session to last own commit on main, lines written, hook activity. The `Stop` hook keeps it current every turn; this command is the manual refresh. Files stay uncommitted until `/create-pr`. |
| `/bootstrap-project [path]` | Point this framework at a brand-new consuming repo and populate `docs/project-spec/`/`docs/frame-specs/` from a real analysis of that repo's actual stack/domain, following this repo's own existing file shape — never overwrites a file that already has real project-specific content, and reports a Portability Risk Report for any persona/command whose hardcoded tool assumption doesn't match the new project. |

### Bundled skills & services (inside `claude-proj-agent`, no separate install)

Since 2.0.0 these ship inside this plugin (`plugins/claude-proj-agent/external_skills/` and
`plugins/claude-proj-agent/.mcp.json`) — there is no dependency on another marketplace. Skills are
invoked as `claude-proj-agent:<name>`; MCP tools are named `mcp__plugin_claude-proj-agent_<server>__<tool>`.
Skill content is a dated snapshot vendored from `bank-proj-marketplace` — see
`plugins/claude-proj-agent/docs/architecture/bank-vendoring/bank-vendoring.md`.

| Bundled item | Kind | Invocation | Description |
|---|---|---|---|
| `atlassian-routing` | skill | auto (any Jira/Confluence work) | Picks the right Atlassian MCP server — `atlassian-innowise` (innowise-group.atlassian.net, CBSA space) vs `atlassian-bank` (bank-proj.atlassian.net, TB space) — and recovers from "Cloud id ... isn't explicitly granted" errors. |
| `bruno` | skill | auto (editing Bruno `.yml`/OpenCollection files) | Bruno API-client format context — `opencollection.yml`/request-file structure, the `bru`/`req`/`res` scripting API, Chai.js testing. |
| `bruno-validate` | skill | user-invoked | Audits Bruno request `.yml` files against org-specific API design rules (pagination shape, RFC 7807 errors, header conventions, `PUT` semantics, etc.). |
| `proj-context` | skill (+10 references) | auto, or `/claude-proj-agent:proj-context` | CBS platform architecture/terminology — business Tables vs DB tables, Projections, hooks, Plugin API, the four core services. |
| `nfr` | skill | auto, or `/claude-proj-agent:nfr` | CBS Non-Functional Requirements Register (`NFR-xx-yy` IDs, critical flows `CF-1..10`, Tiers, data classes, ASRs) — binding quality requirements and their rationale. |
| `bluedot` | skill | auto (Bluedot meeting questions) | Query Bluedot meeting recordings/transcripts/action items via the `bluedot` MCP server, scoped to the CBS workspace. |
| `k8s-connect` | skill | auto, or `/claude-proj-agent:k8s-connect` | Connect a workstation to the CBS dev/QA Kubernetes cluster (kubeconfig, `rke-dev` context) and set up Lens. |
| `k8s-read-only` | skill | auto, or `/claude-proj-agent:k8s-read-only` | Read-only k8s diagnostics (pods, logs, rollout status, crashloops); any mutating change is suggested, never auto-executed. |
| `atlassian-innowise`, `atlassian-bank` | MCP server (OAuth in `/mcp`) | tools `mcp__plugin_claude-proj-agent_atlassian-innowise__*` / `..._atlassian-bank__*` | Jira/Confluence access, one server per site. |
| `mermaid-ai` | MCP server | tools `mcp__plugin_claude-proj-agent_mermaid-ai__*` | Diagram generation/rendering (e.g. `generate_ticket_diagram`). |
| `bluedot` | MCP server (OAuth in `/mcp`) | tools `mcp__plugin_claude-proj-agent_bluedot__*` | Bluedot meeting data. |

Not part of this plugin: `proj-devops`, `notebooklm`, `spotless`, `proj-use-cases` and `tech-writer`
were dropped in 2.0.0 (see the bank-vendoring doc above for why); install them from
`bank-proj-marketplace` on your own if you want them.
