# Infrastructure

**TL;DR.** Runs target qa/stage (CI, dev cluster) or the Azure sites bankstg/bankuat/two (tools VM via
`run-on-vm.sh`, by hand or from the `site:<env>` CI jobs). Auth is Keycloak, verification is direct
Postgres, reporting is Playwright HTML + Allure (TestOps upload from CI only). Manual VM runs are
Vault-free; the Vault bootstrap scripts were removed 2026-10-01.

## Target environments

Verified 2026-10-07 against `.gitlab-ci.yml` and `scripts/test-scripts/shell-scripts/` on the
working-tree branch `group-3/TB-4295` (not `origin/main`).

CI selects the environment with the `ENV_TARGET` pipeline variable (`qa` default, `stage`, `bankstg`,
`bankuat`, `two`):

- **QA**: `qa.proj.local`; **STAGE**: `stg.proj.local` — dev-cluster targets, the `api:*`/`ui:*` jobs run Playwright
  directly on a dev-network runner.
- **bankstg / bankuat / two** — the Azure sites, run through the `site:<env>` jobs (see "Azure sites" below).
- A further host, `dev.proj.local`, is in CI's `CI_HOST_ALIASES` but has no `ENV_TARGET` option —
  treat it as reserved/manual.

CBS itself runs on Kubernetes (AKS, based on `global-setup.ts`'s "supports AKS cold starts" comment
and the up-to-300s schema-provisioning wait). Creating a Table Registry **Group** drives an actual
`table-template` Kubernetes deployment sized by `deploymentProperties.replicaCount` — this repo's
test setup is provisioning real cluster workloads, not calling a stub. See
`docs/frame-specs/architecture.md`'s "Global setup / teardown" section.

## Azure sites: bankstg / bankuat / two.bankuat

The Azure sites are reached in two ways, both through `scripts/test-scripts/shell-scripts/run-on-vm.sh`:

- **By a person (or an agent), manually** — `run-on-vm.sh` (usually via `npm run find-test` /
  `find-suite`) against a shared Azure "tools VM" inside the target VNet (measured ~0.002-0.015s per
  request there vs. ~0.65-0.78s over VPN from a workstation — why large suites run there rather than
  locally).
- **From GitLab CI** — the `site:bankstg` / `site:bankuat` / `site:two` jobs (section 4 of
  `.gitlab-ci.yml`, manual/schedule/api pipelines only, same `TEST_TYPE`/`ENV_TARGET` form as qa and
  stage). The sites sit behind a point-to-site VPN that only one runner holds (tags `bankstg`,
  `bankuat`), so the job only *drives* the run: `scripts/test-scripts/shell-scripts/ci-run-on-site.sh`
  calls the same `run-on-vm.sh` over SSH and the reports come back into `playwright-report/` and
  `allure-results/`, so artifacts, `allure generate` and the TestOps upload rule are shared with the
  other jobs. One run per environment at a time (`resource_group: aqa-$ENV_TARGET`), job timeout 8h.
  Site coordinates are passed as `SITE_*` variables (not the unprefixed names, because project-level
  variables with scope `*` that point at the dev cluster would override them). CI credentials are
  one Vault AppRole per environment (`AQA_VAULT_ROLE_ID` / `AQA_VAULT_SECRET_ID`, masked,
  environment-scoped); the rest is read from the site's Vault at run time, provisioned from the
  devops repo (`proj-devops`, `ansible/89-aqa-ci.yml`). This Vault use is CI-only and lives in
  `ci-run-on-site.sh`; the manual path below is Vault-free.

Earlier history (2026-09-14, superseded): a first attempt at two manual CI jobs (`azure:bankstg` /
`azure:bankuat`, tagged for a not-yet-existing runner) was built and reverted, replaced by a
`--detach` flag on `run-on-vm.sh`; the repo stays on GitLab (no migration to Azure DevOps). The
current `site:<env>` jobs are a later, different mechanism — do not confuse the two.

**Concurrency gotcha (fixed 2026-09-14):** `start_run()`'s "a run is in progress" guard
(`pgrep`-based, checked against the VM) originally ran *after* `sync_sources`/`bootstrap_env`, so a
second `run-on-vm.sh` launch (another terminal or engineer, same shared `/opt/perftest/aqa`
checkout) would overwrite the source tree/`.env` under an already-running suite before failing on the
launch check. The check now sits at the very top of the `run` branch. `--status`/`--follow`/
`--fetch-only` never touch the checkout and are always safe to run concurrently; only a second
*launch* was the risk.

| | bankstg | bankuat | two.bankuat |
|---|---|---|---|
| Local settings file | `.env.bankstg-local` (copy `.env.bankstg-local.example`) | `.env.bankuat-local` (copy `.env.bankuat-local.example`) | `.env.two.bankuat-local` (copy `.env.two.bankuat-local.example`) |
| `.env` composition on the VM (manual runs) | **Vault-free** — direct copy of `.env.bankstg-local` to the VM's `.env` (the Vault bootstrap was removed 2026-10-01) | **Vault-free** — direct copy of `.env.bankuat-local` | **Vault-free**, same as bankuat |
| Selector | `--env bankstg` — also the default | `--env bankuat` | `--env two.bankuat` (CI `ENV_TARGET` value is `two`) |
| Env-detection in test code | `getCurrentEnvName()` (`api/utils/helpers/test-ownership.ts`) returns `'bankstg'` when `DB_NAME` ends `_bankstg`; `db-helper.ts` sets `rejectUnauthorized: false` (self-signed Postgres cert) for it | Same function returns `'bankuat'` for a `_bankuat`-suffixed `DB_NAME`; same SSL bypass applies | Not distinguished — `DB_NAME=proj_two_bankuat` deliberately stays `_bankuat`-suffixed, so it registers as `'bankuat'` too (see note below) |

**Superseded 2026-10-01 (TB-4197): Vault-era tooling removed.** Only `run-on-vm.sh` +
`find-test`/`find-suite` are used to run on the VMs by hand, so the Vault-era leftovers were deleted:
`scripts/bankstg-scripts/` and `scripts/bankuat-scripts/` (`bootstrap-env.sh`, `provision.sh`),
`run-on-vm.ps1`, and `scripts/probe-kafka-rest-publish.ts`. Every env's `.env` on the VM is a direct
copy of `.env.<env>-local`. What stays in `scripts/`: `test-scripts/` (`shell-scripts/` with
`run-on-vm.sh`, `run-suite.sh`, `ci-run-on-site.sh`; `npm-scripts/` with the find-/show-/delete-
scripts), `cleanup-test-schemas.ts`, `cleanup-group.ts`, `filter-allure-results.ts` and
`verify-allure-ids.ts` (CI/husky), `build-offline-bundle.sh`.

**`two.bankuat` (added 2026-09-21).** A second CBS stack on bankuat's own UAT infrastructure — same
VM/DB pattern as `bankuat` (selector `--env two.bankuat`, settings from
`.env.two.bankuat-local`/`.env.two.bankuat-local.example`), but its own Keycloak realm (`two`, confirmed
via `proj-bruno-api`'s `environments/two.bankuat.yml`) and its own `proj-two` k8s namespace — it is this
suite's replacement for the old `qa` env. One deliberate exception to the "swap bankuat for
two.bankuat" pattern: `KEYCLOAK_BASE_URL` stays `keycloak.bankuat.local` (shared host) — Bruno confirms
this, don't "fix" it to match `BASE_URL`. No `scripts/two.bankuat-scripts/` folder exists (or is
needed). `getCurrentEnvName()`/`db-helper.ts` have no distinct `'two.bankuat'` case —
`DB_NAME=proj_two_bankuat` was deliberately kept `_bankuat`-suffixed so it falls into the existing
`bankuat` branch (SSL bypass); two.bankuat is indistinguishable from bankuat to test code that branches
on `CbsEnvName`. VM/DB/Kafka/ClickHouse hosts in the local file were copied from `bankuat`'s own (no
separate two.bankuat infra confirmed) — an unverified assumption, flagged in the file itself; confirm
with the platform team.

Both `.env.<env>-local` are git-ignored; the `.env.<env>-local.example` templates are tracked and
kept identical in variable *set* (sections: VM/SSH, local run behavior incl. `CBS_VM_SEED_ROOT` and
the worker counts, CBS app core, Keycloak, direct DB, Kafka, ClickHouse, service URLs, Allure) — only
the values differ per environment. No credential, VM hostname or environment coordinate is ever
committed — see `scripts/test-scripts/shell-scripts/run-on-vm.sh`'s own header comment for the full
mechanics (sync, detached launch, `--status`/`--follow`/`--fetch-only`/`--stop`/`--ps`/`--kill`,
`--detach`, report fetch).

**How `/opt/perftest` is populated.** Nothing on either tools VM is "installed" in the normal sense:
there is no root on the tools VMs, and neither has a route to npm/PyPI. `/opt/perftest/{node,browsers,libs}`
plus a shared `/opt/perftest/aqa` checkout (with its own `node_modules`) are a **bundle built locally**
(Node, `node_modules`, Chromium headless + its shared-library closure —
`scripts/build-offline-bundle.sh`, needs Docker on the workstation building it) **copied onto the VM by
hand, once**, then reused by every engineer. Rebuilding only happens when dependencies actually change.
`run-on-vm.sh` hardcodes `/opt/perftest/node/bin` etc. and `ensure_node_modules()` does a `cp -a` from
`CBS_VM_SEED_ROOT` (default `/opt/perftest/aqa`) or dies with instructions to build and copy the bundle
by hand. An earlier automatic "detect missing runtime, build the bundle via Docker, scp it over" path
(`lib/vm-runtime.sh` (deleted)) was reverted in full and the file no longer exists. bankuat's
`/opt/perftest` was provisioned the same manual way (sudo granted by devops for that one-off); any
engineer on that VM gets a working run via the default `CBS_VM_SEED_ROOT`/`CBS_VM_ROOT`.

Incidental fixes kept: `sync_sources` makes scripts executable with
`find scripts -name '*.sh' -exec chmod +x {} +` (a `scripts/*.sh` glob stopped reaching nested
folders), and its tar `--exclude` list includes `offline-bundle/` (214MB, gitignored; shipping it on
every run was silent and, over a slow link such as bankuat's ~0.46MB/s, indistinguishable from a hang).

See the (local-only, gitignored) `.claude/skills/azure-test-runs/` skill in the consuming repo for the
day-to-day runbook (known-expected failures, Keycloak gotchas, shared-VM etiquette) — written for
bankstg specifically and not yet confirmed to hold for bankuat.

## Auth infrastructure

Keycloak, realm-based. Env vars (`.env.example`): `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`
(`proj-qa`), `KEYCLOAK_CLIENT_ID` (`proj-app`), plus a service-account `KEYCLOAK_USERNAME`/
`KEYCLOAK_PASSWORD` and, for permission-boundary tests, named per-user credentials
(`INTERNAL_USER_USERNAME`/`PASSWORD`, `EXTERNAL_USER_USERNAME`/`PASSWORD`).

## Database infrastructure

Direct Postgres access is required to run this suite meaningfully (`DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME` in `.env`). Two logical databases are touched:

- The main CBS data database (`DB_NAME`, e.g. `proj_qa`) — holds one Postgres **schema per Table**
  (named after the table ID, plus `_mock`/`_mock_1`/company-suffixed variants for `FIN`-classified
  tables), each with `liv`/`nau`/`his`/... tables inside it.
- The **Table Registry** metadata database — name derived by suffix convention in
  `getRegistryDbName()` (`table_registry_qa`/`table_registry_dev`/`table_registry_stg`, chosen by
  matching `DB_NAME`'s own suffix) — holds `table_registry.tables`, `table_registry.table_spaces`,
  `table_registry.enquiries`.

Maintenance scripts (run manually, not part of the Playwright suite itself):

- `npm run db:cleanup` → `scripts/cleanup-test-schemas.ts` — manual run of the same sweep
  `global-setup.ts` does before every test run (`cleanupOrphanedSchemas` + `cleanupStaleGroups`,
  reusing `findStaleGroups` from `group-cleanup-helper.ts`) against a chosen env (`--env qa|bankstg|
  bankuat|two.bankuat`, else interactive; creds from `.env` / `.env.<env>-local`), for anything older
  than `--min-age-hours` (default 1, vs. the suite's 12h for groups / 30min for orphans). Asks for
  `yes` (skip with `--yes`) and prints a grouped report: groups (name + ID, with their tables),
  orphan tables, dropped schemas. `--scope table|user|all` (default `all`): `user` also deletes stale test-owned `SM.USER.GROUP` records (id timestamp older than the threshold) by direct SQL on `sm_user_group.liv/nau/his` (CBS has no API path to physically remove a LIVE record; only test-owned, unreferenced-by-any-`SM.USER`-profile groups) and reports them bucketed by name prefix; the automatic pre-test sweep still covers table groups only.
- `npm run group:cleanup` → `scripts/cleanup-group.ts` — drops orphaned table groups from previous
  failed runs.
- `npm run allure:verify-ids` → `scripts/verify-allure-ids.ts` — statically scans every spec for
  `allureCaseId(...)` calls and fails if a case id is reused by more than one test outside the
  script's own allowlist for genuinely-shared manual scenarios (see `docs/frame-specs/
  testing-standards.md`'s "Conventions to preserve"). Replaced the old `allure:verify-map`/
  `test-data/allure-testcase-map.json` pair, which no longer exist in this repo.

## Allure reporting

Report Portal has been removed from this repo — do not reintroduce `REPORTPORTAL_*` env vars or
an RP reporter from an older doc's description. Reporting is Allure-only:

- `playwright.config.ts` registers `allure-playwright` unconditionally (not optional/self-guarding
  like the removed RP integration), configured via `ALLURE_RESULTS_DIR` (default `allure-results`),
  `ALLURE_LAUNCH_NAME` (default `Playwright Tests Suite`), `ALLURE_PROJECT_NAME` (default `CBS`).
- `api/utils/helpers/allure-exchange-reporter.ts` attaches masked API request/response exchanges
  (passwords/secrets/tokens/authorization redacted) to the Allure result for each test.
- Each test links to its Allure TestOps case via `allureCaseId(<id>)` passed as the `test(...)`
  call's second argument (`api/utils/helpers/allure-case-link.ts`; see
  `docs/frame-specs/testing-standards.md`'s "Conventions to preserve") — the shared `beforeEach`
  fixture reads that annotation and sets the `ALLURE_ID` label for the uploaded result. This
  replaced the old `test-data/allure-testcase-map.json` title-keyed file, which no longer exists
  in this repo — do not reintroduce it from an older doc's description. A test with no
  `allureCaseId(...)` call uploads unlinked and TestOps creates a new case for it.
- `npm run allure:verify-ids` (`scripts/verify-allure-ids.ts`) statically checks every
  `allureCaseId(...)` call across `api/`/`ui/` and fails if a case id is reused by more than one
  test outside that script's own allowlist for genuinely-shared manual scenarios.
- `allure-commandline` generates the local HTML report (`allure-report/`) from `allure-results/`.

## Kafka infrastructure

- `KAFKA_UI_URL` / `KAFKA_CLUSTER_NAME` (both optional) — Kafka UI (Kafbat) REST API, used for
  topic cleanup on teardown and as a produce fallback. Hardcoded directly in `.gitlab-ci.yml`
  (`http://kafka.proj.local`, cluster `proj-kafka`) — not secret; `kafka.proj.local` is already in
  `CI_HOST_ALIASES`.
- Kafka tests are not a separate CI `TEST_TYPE` — they ride whichever existing job matches their own
  tag (currently only `health-check`). See the root `README.md`'s "Kafka Testing" section for the
  full fixture API, topic-naming convention, and CI rules-based path filter.

## GitLab CI/CD (`.gitlab-ci.yml`)

Two stages: `validate` (lint, format check, typecheck and `allure:verify-ids` in `validate:lint-and-format`, plus an optional manual network-diagnostics job) and
`test`.

- **Runner image**: `playwright-tools:v1.62.1-jammy` from the project's internal container registry
  (`proj-ci-scripts` project, see `.gitlab-ci.yml`'s `.default_job`) — pinned to match the
  `@playwright/test` version so browser binaries match the installed package.
- **Host resolution**: the runner has no DNS for `*.proj.local` — `.default_job`'s `before_script`
  appends `${CI_TARGET_IP} ${CI_HOST_ALIASES}` to `/etc/hosts` before every job (`CI_TARGET_IP`,
  `CI_HOST_ALIASES` are pipeline variables).
- **Caching**: the npm cache (`.cache/npm/`), keyed by `${CI_COMMIT_REF_SLUG}`.
- **Workflow dedup**: `workflow.rules` runs on MR events OR branch pushes, never both for the same
  change, to avoid duplicate pipelines.

### Job structure

The `smoke`/`regression` scope split by CBS milestone (`-m1`/`-m2`/`-m3`), the full `TEST_TYPE` option
list (API milestone suites, `e2e`, `health-check`, and `ui-smoke-m*`/`ui-regression-m*`/`ui-all`), and the MR-title-keyword auto-selection rule are documented in the root `README.md`'s
"GitLab CI/CD Pipelines" section — read that for the current, canonical list rather than this
file, which only tracks what's structurally true across all jobs:

- API jobs: `api:health-check`, `api:smoke-m1`/`api:regression-m1`, `api:smoke-m2`/`api:regression-m2`,
  `api:smoke-m3`/`api:regression-m3`,
  `api:e2e` (branch/manual/schedule, gated by `TEST_TYPE`), plus an `:mr` variant of each for
  Merge Request pipelines (all `when: never` today, see below). `@integration` has no pipeline job — local-only
  (`npm run test:api:integration`).
- UI jobs: `ui:all`, `ui:smoke-m1`/`m2`/`m3`, `ui:regression-m1`/`m2`/`m3` — same `TEST_TYPE` gating pattern,
  no separate `RUN_UI_SUITES` flag.
- Azure sites: `site:bankstg`, `site:bankuat`, `site:two` (section 4) — manual/schedule/api pipelines
  only, see "Azure sites" above. The `api:*`/`ui:*` jobs are skipped there via `.skip_on_azure_site`.
- **As of TB-2632, the `test` stage does not auto-run on MR pipelines** — only
  `validate:lint-and-format` runs there by default; a full run needs a manual "Run pipeline" (web)
  trigger using `TEST_TYPE`. Confirm this is still the case before assuming MR pipelines exercise
  tests (`.gitlab-ci.yml`'s section-1 comment carries the tracking ticket and the revert instructions).

Every test job fails fast if `BASE_URL`/`KEYCLOAK_*` variables are missing (explicit check in
`.api_suite_test_template`/`.ui_suite_test_template` before running), and always uploads
`test-results/`, `playwright-report/`, `allure-results/`, and `allure-report/` as artifacts (7-day
expiry), regardless of pass/fail.

Required CI/CD variables and where they're consumed are also tracked in `docs/ci-cd-secrets.md` —
check both when adding a new suite that needs a new secret/variable.

### Allure TestOps upload (CI only)

`ALLURE_TESTOPS_ENABLED`, `ALLURE_ENDPOINT` (`https://allure.proj.local:8443`), `ALLURE_TOKEN`
(declared empty in `.gitlab-ci.yml`, so the real value must come from a CI/CD variable; the upload
step runs only when it is non-empty, on a `web` pipeline, on `main` or a `*stg-freeze*` branch),
`ALLURE_PROJECT_ID` (`2`), `ALLURE_LAUNCH_NAME` (defaults to
`${CI_JOB_NAME_SLUG} - ${CI_COMMIT_REF_NAME} (Build #${CI_PIPELINE_IID})`) drive an automatic
results upload to Allure TestOps after each job — separate from, and in addition to, the local
`allure-playwright` reporter (`docs/frame-specs/tech-stack.md`) that every job always runs
regardless of TestOps upload being enabled. See `rules/allure.md` for the TestOps side (test case
authoring/reconciliation) — this is the CI-side result upload only.

## Environments as Playwright config, not as separate config files

There is no `playwright.qa.config.ts`/`playwright.stage.config.ts` — a single `playwright.config.ts`
reads everything from environment variables (`BASE_URL`, `KEYCLOAK_*`, `COMPANY_CODE`, etc.), and
CI selects the environment by setting those variables per job (`environment: qa` / `environment:
$ENV_TARGET` GitLab environments map to variable scopes, not to different config files).
