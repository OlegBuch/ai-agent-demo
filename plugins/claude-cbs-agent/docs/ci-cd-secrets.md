# CI/CD Secrets

Every secret this repository's tooling needs, in one place — what it's for, where it's
consumed locally vs. in CI, and how to set it up either way. Never commit a real value
anywhere; every reference in `.mcp.json` is a `${VAR}` placeholder, resolved from your real
process environment at MCP-server-launch time — `.mcp.json` itself is a tracked, secret-free
file, same as any other file in this plugin.

## Required variables

| Variable | Used by | Purpose | Scope |
|---|---|---|---|
| `GITHUB_TOKEN` | `.mcp.json`'s `github` MCP server | Access to GitHub repos/issues/PRs from Claude Code; a read-scoped token is enough (the framework does not write to GitHub) | Local + CI |
| `GITLAB_TOKEN` | `.mcp.json`'s `gitlab` MCP server (`env.GITLAB_PERSONAL_ACCESS_TOKEN`; `GITLAB_API_URL=http://10.0.102.50/api/v4`, `GITLAB_READ_ONLY_MODE=true`) | Read-only access to GitLab MRs/diffs/discussions/pipelines/files for `review-pr-commands`; PAT scope `read_api` is enough | Local only |
| `ALLURE_TOKEN` | `.mcp.json`'s `allure-testops-native` entry (`headers.Authorization: "api-token ${ALLURE_TOKEN}"`) and `allure-testops-custom` entry (`env.ALLURE_TOKEN`) | Auth against the on-prem Allure TestOps instance — the built-in `allure-testops-native` MCP server for all `allure-commands/`/`aqa-commands/` test-case/shared-step/mute CRUD (`rules/allure.md` §3), plus the self-owned `allure-testops-custom` MCP server for group search/launches/results/statistics/metadata (`rules/allure.md` §8) | Local only |

Set `ALLURE_TOKEN` exactly like `GITHUB_TOKEN`/`GITLAB_TOKEN` below — same OS-level env var
mechanism, same `${VAR}` expansion. There is no GitLab CI/CD Variable to configure for it: these
are Claude Code session-time MCP tools, not part of the Playwright suite `proj-test-automation`
runs in CI, so `.mcp.json`'s `ALLURE_TOKEN` has no CI use. (`proj-test-automation`'s CI has its own
separate `ALLURE_TOKEN` variable for uploading results — see `docs/frame-specs/infrastructure.md`,
"Allure TestOps upload (CI only)"; that is a different consumer than `.mcp.json`.)

If you add a new MCP server or tool that needs a secret, add a row here **and** a matching
`${VAR}` placeholder in `.mcp.json` in the same PR.

## Prerequisites beyond Node/npm

- **`uv`** (Python 3.10+) — needed locally to run the `allure-testops-custom` MCP server
  (`uv run --directory ${CLAUDE_PLUGIN_ROOT}/mcp-servers/allure-testops-custom
  allure-testops-custom`, per `.mcp.json`). Install from [astral.sh/uv](https://astral.sh/uv) if
  `uv --version` doesn't already resolve. This is a Claude Code tooling dependency only — it has
  nothing to do with `proj-test-automation`'s own stack (`docs/frame-specs/tech-stack.md`) and
  isn't needed to run the Playwright suite itself.

  On a machine locked down with Application Control (WDAC/AppLocker), `uv` can fail the first
  time it runs with something like:
  ```
  error: Failed to query Python interpreter at C:\Users\<you>\AppData\Roaming\uv\python\...\python.exe
    Caused by: An Application Control policy has blocked this file. (os error 4551)
  ```
  This means the policy is blocking the interpreter `uv` just downloaded into `AppData\Roaming`,
  not the `allure-testops-custom` server or the token itself. There is no way around Application Control
  from inside `uv` — it's a deliberate security boundary, not a bug. Two legitimate fixes:
  1. **Point `uv` at an already-installed, policy-approved Python** instead of letting it download
     its own — run `where python` / `py --list-paths` to find one (must be 3.10+), confirm that
     exact `python.exe` actually runs (`<path>\python.exe --version`) without the same error, then
     set (Windows, persists for your user account):
     ```powershell
     [System.Environment]::SetEnvironmentVariable("UV_PYTHON", "<path to that python.exe>", "User")
     [System.Environment]::SetEnvironmentVariable("UV_PYTHON_PREFERENCE", "only-system", "User")
     ```
     (`UV_PYTHON_PREFERENCE=only-system` stops `uv` from ever trying to download a managed Python
     again.) Restart your terminal/Claude Code session afterward — same env-var propagation caveat
     as `GITHUB_TOKEN`/`ALLURE_TOKEN` above — then retry.
  2. **If no approved Python exists on the machine at all**, this has to go through IT/security to
     get Python 3.10+ installed via an approved channel (Software Center, a signed MSI, etc.) —
     don't try to work around Application Control by moving files into a trusted folder or
     disabling the check yourself.

## Local setup

1. `.mcp.json` is a tracked file — cloning/installing the plugin already gives you it, nothing to
   copy or create.
2. Export every secret above (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `ALLURE_TOKEN`) in your actual
   shell/OS environment *before* starting Claude Code (see the OS-specific options below).
3. Do **not** rely on a `.mcp.json` server's own `env` block to expand `${VAR}` inside that same
   server's `args` — Claude Code only expands `${VAR}` in `args` from the real outer
   environment, never from a sibling `env` block in the same server entry. This is unrelated to
   the `headers`/`env` expansion `GITHUB_TOKEN`/`ALLURE_TOKEN` rely on (both resolve straight from
   the real outer environment, which Claude Code does support) — it only matters if you ever add a
   server whose `args` need a secret.

Replace the `<YOUR_...>` placeholders with the real value **only in your own terminal** — never
paste a real value into a chat with Claude, a commit, or this file.

### Windows — PowerShell (persistent, recommended)

Sets it once for your Windows user account; every new process (new terminal, new Claude Code
session) picks it up from then on:

```powershell
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", "<YOUR_TOKEN>", "User")
[System.Environment]::SetEnvironmentVariable("GITLAB_TOKEN", "<YOUR_GITLAB_TOKEN>", "User")
[System.Environment]::SetEnvironmentVariable("ALLURE_TOKEN", "<YOUR_ALLURE_TOKEN>", "User")
```

**Restart your terminal/Claude Code session afterward** — a value set via
`SetEnvironmentVariable` only applies to processes started *after* it's set, not the one you
ran the command in.

Verify it took effect, without printing the value:

```powershell
foreach ($n in "GITHUB_TOKEN","GITLAB_TOKEN","ALLURE_TOKEN") {
  "$n : " + $(if ([System.Environment]::GetEnvironmentVariable($n,"User")) {"SET"} else {"NOT SET"})
}
```

### Windows — Command Prompt (`cmd.exe`)

Same persistence model as PowerShell's `SetEnvironmentVariable` (per-user, picked up by new
processes only):

```cmd
setx GITHUB_TOKEN "<YOUR_TOKEN>"
setx GITLAB_TOKEN "<YOUR_GITLAB_TOKEN>"
setx ALLURE_TOKEN "<YOUR_ALLURE_TOKEN>"
```

### Windows — GUI (no command line)

Win+R → `sysdm.cpl` → *Advanced* tab → *Environment Variables* → under *User variables*, click
*New* for each of the three names above (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `ALLURE_TOKEN`). Same restart caveat applies.

### macOS / Linux — persist via shell profile (recommended)

Append to whichever profile your shell actually loads on a new terminal — `~/.bashrc`/
`~/.bash_profile` for Bash, `~/.zshrc` for Zsh:

```bash
echo 'export GITHUB_TOKEN="<YOUR_TOKEN>"' >> ~/.zshrc
echo 'export GITLAB_TOKEN="<YOUR_GITLAB_TOKEN>"' >> ~/.zshrc
echo 'export ALLURE_TOKEN="<YOUR_ALLURE_TOKEN>"' >> ~/.zshrc
```

Then either open a new terminal, or reload the current one:

```bash
source ~/.zshrc
```

### macOS / Linux — current shell only (temporary, not persisted)

Useful for a quick one-off session; gone once the shell closes:

```bash
export GITHUB_TOKEN="<YOUR_TOKEN>"
export GITLAB_TOKEN="<YOUR_GITLAB_TOKEN>"
export ALLURE_TOKEN="<YOUR_ALLURE_TOKEN>"
```

### Cross-platform alternative — `direnv` (auto-load per-project)

If you already use [direnv](https://direnv.net/), it's a good fit here since it scopes the
variables to this project directory only, and loads/unloads them automatically on `cd` — no
manual export, no restart needed:

1. Create a `.envrc` file at the repo root (already covered by `.gitignore`'s secrets rule) with:
   ```bash
   export GITHUB_TOKEN="<YOUR_TOKEN>"
   export GITLAB_TOKEN="<YOUR_GITLAB_TOKEN>"
   export ALLURE_TOKEN="<YOUR_ALLURE_TOKEN>"
   ```
2. Run `direnv allow` once in the repo root.
3. Every time you `cd` into the repo (including when Claude Code's terminal starts there),
   direnv exports these automatically for that shell session — no separate restart step.

### Which option to pick

- **One machine, use this token elsewhere too** (e.g. `GITHUB_TOKEN` for other repos/tools) →
  persistent OS-level env var (PowerShell/`setx`/shell profile).
- **Token is specific to this project only** → `direnv` — keeps it out of your global shell
  environment entirely.
- **Just testing something once** → current-shell-only `export` (macOS/Linux) — simplest, but
  you'll redo it every new terminal.

## CI (GitLab) setup

This section applies to `GITHUB_TOKEN` only. `GITLAB_TOKEN` and `.mcp.json`'s `ALLURE_TOKEN` have no
CI use: they authenticate the `gitlab`/`allure-testops-native`/`allure-testops-custom` MCP servers,
which are Claude Code session-time tools, not part of the Playwright suite `proj-test-automation`
actually runs in CI. Do not add them as GitLab CI/CD Variables for MCP purposes; nothing in a
pipeline job reads them for that.

Add each remaining variable above under **Settings → CI/CD → Variables** on this project (or
group, if shared across projects), with:

- **Protected**: on — only available to pipelines running on protected branches/tags.
- **Masked**: on — the value never appears in job logs.
- **Type**: Variable (not File), unless a specific tool requires a file-mounted secret.

GitLab CI/CD Variables are injected as real environment variables into every job — no
`.mcp.json` templating step is needed in `.gitlab-ci.yml` beyond having the variables defined
in the project settings; anything invoking Claude Code (or a script reading these vars
directly) in a job picks them up the same way a local shell would.

Never echo, `cat .mcp.json`, or otherwise print a variable's value in a job's script or log —
masking only works if the pipeline itself doesn't defeat it by printing the raw value in a
context GitLab's masker doesn't recognize (e.g. after string concatenation or encoding).

## Rotation

If `GITHUB_TOKEN`/`GITLAB_TOKEN`/`ALLURE_TOKEN` is rotated:

1. Update the GitLab CI/CD Variable's value (`GITHUB_TOKEN` only — `GITLAB_TOKEN` and the
   MCP-side `ALLURE_TOKEN` have no CI use).
2. Update your own local shell/OS environment variable.
3. No code or committed file changes are needed — every reference is a `${VAR}` placeholder,
   never a literal value.
