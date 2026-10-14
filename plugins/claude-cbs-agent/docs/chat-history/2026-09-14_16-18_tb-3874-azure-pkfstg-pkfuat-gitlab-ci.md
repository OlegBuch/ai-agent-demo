# TB-3874: manual GitLab CI jobs for bankstg/bankuat

**Date/time:** 2026-09-14 16:18 · **Branch:** group-3/TB-3874 · **Ticket(s):** TB-3874

## Discussed

The user asked, in Russian, how to "run CI/CD on Azure" for bankstg/bankuat so those environments
run in a pipeline the way they already run locally. The premise mixed two unrelated things, which
had to be separated before any YAML was touched:

1. An **earlier memory** (2026-08-27, `project_gitlab-to-azure-devops-migration.md`) recorded that
   `proj-test-automation`'s CI/SCM was believed to be migrating from self-hosted GitLab to Azure
   DevOps as the tool, planning call upcoming.
2. The `azure-test-runs` skill (`.claude/skills/azure-test-runs/`) documents that bankstg/bankuat are
   Azure-*hosted CBS environments*, reachable only via VPN + SSH to a shared "tools VM", and states
   explicitly: "There is no CI for Azure — GitLab is not connected to it and is not planned to be —
   so every Azure run is started by a person or an agent."

Asked the user directly (AskUserQuestion) which of the two applied, and got a clear answer:

- The repo is **staying on GitLab** — no Azure DevOps tool migration for `proj-test-automation`.
  This supersedes the 2026-08-27 memory note (updated the same file, same session).
- Network access to bankstg/bankuat stays exactly as manual as it is today: an engineer turns their
  own VPN on, then manually triggers the pipeline. **No auto-trigger, ever** — this was explicit
  and non-negotiable per the user.
- The ask reduces to: extend the existing `.gitlab-ci.yml` (same templates/conventions already
  used for qa/stage) with the ability to also run against bankstg/bankuat, reusing
  `scripts/run-on-vm.sh` rather than reimplementing its SSH/sync/bootstrap logic.

## Implemented

- **`.gitlab-ci.yml`** (`proj-test-automation`):
  - Added an `AZURE_SUITE` pipeline dropdown variable (`health-check`/`smoke-m1`/`smoke-m2`/
    `regression-m1`/`regression-m2`/`integration`/`e2e`/`api`/`ui`/`full` — the exact vocabulary
    `scripts/run-on-vm.sh` accepts; deliberately not reusing `TEST_TYPE`, which has extra
    per-milestone `ui-*` values `run-on-vm.sh` doesn't understand).
  - Added a new "4. AZURE (bankstg / bankuat) JOBS" section: `.azure_job_template` (base) plus
    `azure:bankstg` / `azure:bankuat` (each just sets `AZURE_ENV` and `environment:`). Key
    properties: `tags: [azure-vpn]` (a runner tag that must be registered on a VPN-connected
    machine — not yet done, flagged explicitly in a comment block above the template); `rules:`
    restricted to `$CI_PIPELINE_SOURCE == "web"` with `when: manual` (never auto, never on
    push/MR/schedule); `before_script` materializes `.env.<env>-local` from Environment-scoped
    (`bankstg`/`bankuat`) GitLab CI/CD Variables (never echoed to the log), then `script` calls
    `./scripts/run-on-vm.sh "${AZURE_SUITE}" --env "${AZURE_ENV}"` (the same blocking "run" mode an
    engineer already uses locally — sync, bootstrap, launch, watch, fetch); `after_script` deletes
    the generated `.env.<env>-local`; `artifacts` publishes `vm-results-*/` (7-day expiry).
  - Validated the whole file with PyYAML (registering a no-op constructor for GitLab's `!reference`
    tag) and with `npx prettier --check` — both clean.
- **`README.md`** (`proj-test-automation`): added an "Azure (bankstg / bankuat) runs" subsection under
  "GitLab CI/CD Pipelines" documenting the manual-only trigger, the `AZURE_SUITE` dropdown, the
  `azure-vpn` runner-tag prerequisite, and where results land.
- **`docs/frame-specs/infrastructure.md`** (`proj-ai-agentic`): rewrote the "Azure bankstg/bankuat"
  section (previously said "no CI pipeline for either" — no longer true) to document the two new
  manual jobs, corrected the stale "migrating to Azure DevOps" aside, and added a bullet to the
  "Job structure" list under "GitLab CI/CD (`.gitlab-ci.yml`)".
- **Memory** (`~/.claude/projects/.../memory/`): marked
  `project_gitlab-to-azure-devops-migration.md` SUPERSEDED with today's correction (repo stays on
  GitLab), kept the original 2026-08-27 note below it as historical context rather than deleting
  it outright, updated its `MEMORY.md` index line.

## Learned

- The two "GitLab → Azure" concerns in this repo's history are genuinely independent and must not
  be conflated: a hypothetical CI *tool* migration (GitLab → Azure DevOps, not happening) vs.
  bankstg/bankuat being CBS *environments* that happen to be hosted in Azure (real, and now has a
  manual CI entry point). A future session hitting either phrase for this repo should confirm
  which one is meant before acting — the `project_gitlab-to-azure-devops-migration.md` memory note
  now says this explicitly.
- `scripts/run-on-vm.sh` already honors real environment variables over its `.env.<env>-local`
  file (`LOCAL_ENV` sourcing loop only fills unset variables), which made wiring it into CI
  straightforward: no fork needed between "local" and "CI" code paths for the runner-only settings
  — only the file itself had to be synthesized in `before_script` since `bootstrap_env()` insists
  on the file existing (it doesn't fall back to arbitrary env vars for the suite-level KEYCLOAK_*/
  DB_* keys the way the runner-only keys do).
- GitLab CI/CD's Environment Scope mechanism (already used today for qa/stage's
  `KEYCLOAK_USERNAME`/`PASSWORD`) extends cleanly to bankstg/bankuat by reusing the exact same
  variable *names* scoped to a different `environment:` value — no `AZURE_`-prefixed variable
  naming needed, keeping this consistent with the existing convention.

## Open Items / Follow-ups

- **The `azure-vpn` GitLab Runner does not exist yet.** Someone (the user or platform/DevOps) needs
  to register a GitLab Runner tagged `azure-vpn` on a machine that stays connected to the Azure
  VPN, before `azure:bankstg`/`azure:bankuat` can actually pick up a triggered run. Until then the
  jobs will sit "pending" — this is expected, not a bug in the YAML.
- **The full CI/CD variable set must be created** (Settings → CI/CD → Variables, Environment Scope
  `bankstg` and `bankuat` separately) — the exact list is in the comment block above
  `.azure_job_template` in `.gitlab-ci.yml` and mirrors `.env.bankstg-local.example`/
  `.env.bankuat-local.example` field-for-field. `CBS_VM_SSH_KEY` should be a **File**-type variable.
- Not yet decided/asked: whether bankstg/bankuat runs should ever upload to Allure TestOps (today
  they don't — only the local HTML/allure-results artifacts are produced, matching what
  `run-on-vm.sh`'s own `fetch_results()` already generates locally).
- `run-on-vm.ps1` still has no CI counterpart — only the bash `run-on-vm.sh` path was wired into
  `.gitlab-ci.yml`, on the assumption the `azure-vpn` runner will be Linux/bash-based. If that
  runner ends up being Windows-only, the jobs need a PowerShell invocation instead.

## References

None.
