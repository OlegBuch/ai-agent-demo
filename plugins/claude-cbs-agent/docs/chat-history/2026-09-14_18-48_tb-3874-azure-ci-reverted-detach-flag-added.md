# TB-3874: bankstg/bankuat GitLab CI reverted, replaced with a --detach flag

**Date/time:** 2026-09-14 18:48 · **Branch:** group-3/TB-3874 · **Ticket(s):** TB-3874

Continuation of the same session as `2026-09-14_16-18_tb-3874-azure-bankstg-bankuat-gitlab-ci.md` —
read that file first for the full original context; this entry only covers what changed after it.

## Discussed

After the CI design in the earlier entry was explained back to the user, they pointed out that
`scripts/run-on-vm.sh` already launches every run detached (`nohup`) on the VM — it already
survives a closed laptop or dropped VPN/SSH session with zero CI involvement. The actual gap was
never "how do we survive a disconnect" (already solved), it was "how do I launch and immediately
get my terminal back without waiting for the whole suite to finish" — a first-class flag, not a
CI job. The user then explicitly said to delete all the CI/CD work.

Also clarified along the way: the GitLab Runner used for `api:health-check` etc. (qa/stage) does
**not** use any VPN at all — it's a dedicated, always-on runner that already lives inside the
corporate network (evidence: pulls its Docker image from an internal-only registry
`10.0.102.50:5050`, resolves `qa.proj.local` via a plain `/etc/hosts` line, no VPN client anywhere
in `.gitlab-ci.yml`). This corrected an earlier, wrong assumption in this session that qa/stage's
CI reachability was VPN-based too — it isn't; only a person's own local run needs VPN. If a real
CI entry point for bankstg/bankuat is ever revisited, the qa/stage precedent argues for a
permanently-network-resident runner (e.g. on the tools VM itself, if network topology allows —
unconfirmed, ownership handed to the user to ask DevOps/platform), not a person's laptop with a
manually-toggled VPN.

## Implemented

- **Reverted, `proj-test-automation`:**
  - `.gitlab-ci.yml` — `git checkout -- .gitlab-ci.yml` (the file had zero other changes this
    session, safe to fully revert).
  - `README.md` — removed only the "Azure (bankstg / bankuat) runs" section I had added; left every
    other pre-existing (unrelated, this session but before this conversation) change in the file
    untouched.
- **Added, `proj-test-automation`:**
  - `scripts/run-on-vm.sh` — new `--detach` flag. In `run` mode, still does
    sync/bootstrap/`start_run` as before, but if `--detach` is set, skips `watch_run`/
    `fetch_results` and instead prints the exact `--follow`/`--fetch-only` commands to reattach
    later. Validated with `bash -n`.
  - `scripts/run-on-vm.ps1` — same `-Detach` switch, same behavior, mirrored in PowerShell.
    Validated with `[System.Management.Automation.Language.Parser]::ParseFile`.
  - `scripts/find-test.ts` — already (pre-existing this session, not by me) asks "Local / Azure
    STG / Azure UAT" as a target after picking a spec/scope. Added one more `confirm` prompt right
    after that target choice ("Run detached...?"), shown only for the two Azure targets, which
    appends ` --detach` to the generated `run-on-vm.sh` command when answered yes.
  - `.claude/skills/azure-test-runs/SKILL.md` (local-only, gitignored) — new "Detached: launch and
    walk away" section documenting the flag and explicitly noting it is a local convenience, not a
    CI trigger.
- **`proj-ai-agentic` docs:**
  - `docs/frame-specs/infrastructure.md` — "Azure bankstg/bankuat" section rewritten back to "no CI
    pipeline for either", with a note recording that a CI job was tried and reverted the same
    session in favor of the `--detach` flag. The "Job structure" bullet list's `azure:*` entry
    removed.
  - This file, plus a correction to `project_gitlab-to-azure-devops-migration.md`'s Claude Code
    session memory (separate persistence layer, `~/.claude/projects/.../memory/`).

## Learned

- `scripts/run-on-vm.sh`'s existing `nohup`-based detach on the VM side already solves "survive a
  dropped connection" — the missing piece was purely about not blocking the *local* invoking
  script/terminal, which is a much smaller, purely local change than a CI pipeline.
- The qa/stage GitLab Runner's network access is a permanent, always-on placement inside the
  corporate network, not a VPN connection — worth remembering before assuming any future
  "runner needs network access to X" problem requires a VPN-in-the-loop design; the qa/stage
  precedent is "put the runner inside the network," not "give the runner a VPN client."

## Open Items / Follow-ups

- No GitLab CI job exists for bankstg/bankuat as of this entry — confirmed intentional, not a gap.
- If a CI entry point for bankstg/bankuat is wanted later, first confirm with DevOps/platform
  whether the Azure VNet hosting the tools VM already has a route back to the on-prem GitLab
  server (`10.0.102.50`) — this was asked and the user did not know the answer as of this session.
- `find-test.ts`'s new detach prompt was not manually exercised end-to-end (interactive CLI,
  `npm run find-test`) — only statically verified (`tsc --noEmit`, `eslint`, `prettier --check`)
  per this project's "verify statically, don't execute" convention.

## References

None.
