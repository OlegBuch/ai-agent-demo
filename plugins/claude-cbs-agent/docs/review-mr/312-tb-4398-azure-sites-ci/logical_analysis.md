# Logical analysis — MR !312 (TB-4398)

MR head `a139949a` (5 commits, author Alex Dorokh, base `9d357893`, target `main`). Reviewed 2026-10-06.
Files: `scripts/test-scripts/shell-scripts/ci-run-on-site.sh` (new, 287 lines), `.gitlab-ci.yml`, `scripts/test-scripts/shell-scripts/run-on-vm.sh` (1 line), `README.md`.
No `api/utils/**` file is touched, so the Step 1.6 deep-impact rule is not triggered. The Architect lens was engaged anyway for the new cross-repo contract (Vault paths / AppRole provisioned by proj-devops `ansible/89-aqa-ci.yml`).

## Summary

Adds three Azure-site targets (`bankstg`, `bankuat`, `two`) to the `ENV_TARGET` pipeline variable. Each gets one `site:<env>` job on the dev2 runner that holds the site's VPN tunnel. The job does not run Playwright itself: `ci-run-on-site.sh` logs in to the site's Vault with an AppRole, reads every other credential from there, runs a Keycloak + CBS-rights preflight, composes the suite's `.env`, drives the existing `run-on-vm.sh` on the site's tools VM, and brings the reports back into the directories the shared `.allure_report_and_upload` step already uses. The `api:*`/`ui:*` jobs are switched off for these targets. The ticket (TB-4398, "pipelines for auto tests for bankuat and bankstg") has no description and no Acceptance Criteria, so the MR description is the only statement of intent; `two` is an extension beyond the ticket title. Per the MR description: `health-check` 42/42 green on `two`, all 42 red on `bankuat`/`bankstg` (BUSINESS_UNIT_ID, branch/release mismatch).

Local verification done in this review: `bash -n` on the script (OK), the `.gitlab-ci.yml` parses as YAML with `!reference`, and two behaviours were reproduced in a throwaway shell (see findings L-2 and the quoting helper `q()`, which behaved correctly for `'`, `"`, mixed and `#`/`$` values). Nothing was run against GitLab, Vault or the VMs.

## Confirmed Issues

[Critical] TLS certificate verification is disabled for every Vault call
ci-run-on-site.sh:61, :73, :82 — `curl -sk` is used for the AppRole login (which sends `role_id`/`secret_id`), for every secret read (SSH private key, Keycloak admin client secret, bootstrap-account password, ClickHouse password, DB credential lease) and for the token revoke. Nothing authenticates the server, so anyone able to answer on `SITE_VAULT_ADDR` from the runner's tunnel can capture the AppRole secret and serve forged secrets (e.g. a different SSH host key or DB host). Severity follows `fullstack-aqa-agent.md`'s security-hygiene rule (disabled TLS verification = Critical); the mitigating context is the private VPN address and the comment at :69-71 saying the deploy pipeline does the same — that is not a citation inside this repo, so it could not be verified, and an existing bad pattern elsewhere is not a justification.
Fix: verify the server — pass the site Vault CA via `--cacert` (shipped in the job image or provisioned by proj-devops) or pin the key with `--pinnedpubkey` taken from a non-secret `SITE_VAULT_PUBKEY` variable — and drop `-k`.
Example:
    curl -s --cacert "$SITE_VAULT_CA" --connect-timeout 15 ...
    # or: curl -s --pinnedpubkey "$SITE_VAULT_PUBKEY" ...

[Confirmed] The "stop an orphaned run" branch can never fire
ci-run-on-site.sh:241 — `if vm "$SITE_SUITE" --status | grep -q 'RUNNING'` runs under `set -euo pipefail` (:38). `grep -q` exits on the first match while `run-on-vm.sh --status` is still writing its remaining lines (`reported : N tests`, which needs another ssh round-trip), so the writer dies on SIGPIPE and the pipeline's status is non-zero. Reproduced locally with an equivalent writer: 0 of 3 runs matched although `RUNNING` was in the output every time. Result: after a cancelled job the orphan is never stopped, `vm "$SITE_SUITE" --detach` (:259) then hits `run-on-vm.sh`'s own `a run is in progress on <env>` guard (run-on-vm.sh:482) and exits 2, and every later job for that environment fails the same way until someone runs `--stop` by hand. This is exactly the scenario the comment at :236-239 and the MR description claim to handle.
Fix: capture the status first and test the variable, so `grep` never sits on the right of a pipe under pipefail.
Example:
    st="$(vm "$SITE_SUITE" --status || true)"
    if grep -q 'RUNNING' <<<"$st"; then ... fi

## Possible Risks

[Risk] A hung run holds the environment, the Vault token and the DB login for 8 hours
ci-run-on-site.sh:266-272 (retry loop around `--follow`), `.gitlab-ci.yml:620` (`timeout: 8h`). `watch_run()` in run-on-vm.sh:316-332 ends only when the VM log contains `finished:`. If the VM launcher dies without writing it (VM reboot, OOM-kill of the launcher, a stale log), `--follow` polls forever; the loop only retries when `--follow` itself exits non-zero. The job then sits on `resource_group: aqa-$ENV_TARGET`, blocking every other run for that site, and keeps the CREATE-ROLE DB login alive until the timeout. A human running `run-on-vm.sh` would notice; an unattended job will not.
Fix: add an overall deadline and a liveness check to the CI wrapper — e.g. each loop iteration also checks `--status` and, if it is IDLE with no `finished:` in the log, fails with a message — instead of relying on the 8 h job timeout.

[Risk] Secrets stay on the VM after the job; the comment says they are removed
ci-run-on-site.sh:194 says the generated `.env` is "removed when the next run syncs", but `run-on-vm.sh` `sync_sources` explicitly keeps `.env*` (run-on-vm.sh:175) and `bootstrap_env` only overwrites it (:237) with mode 660 (:239). After the job, `$CBS_VM_ROOT/.env` keeps `KEYCLOAK_PASSWORD`, `KEYCLOAK_CLIENT_SECRET` (admin client) and `CLICKHOUSE_PASSWORD` in clear text on a VM the README describes as shared. The DB login is revoked, the others are not. The comment is also factually wrong.
Fix: after the run has finished and been fetched, delete the file (`vssh "rm -f $CBS_VM_ROOT/.env"`, not before `--follow` completes because a detached run still reads it), and correct the comment.

[Risk] The header says nothing unprefixed is read, but six unprefixed variables are
ci-run-on-site.sh:20-31 vs :47, :196-197, :223-228 — the script reads `COMPANY_CODE`, `CBS_USER_CONTEXT_HEADER`, `API_TESTS_PARALLEL_WORKERS`, `UI_TESTS_PARALLEL_WORKERS`, `ALLURE_LAUNCH_NAME` and `TEST_SCRIPT` by their plain names. The comment (and commit 004323d8) exists because a scope-`*` project variable beats a value written in `.gitlab-ci.yml`; the same hazard applies to these six. A project-level `API_TESTS_PARALLEL_WORKERS` or `COMPANY_CODE` meant for the dev cluster would be written into the Azure `.env` without anyone noticing.
Fix: either read them as `SITE_*` too, or state in the header which unprefixed names are intentionally inherited and why that is safe.

[Risk] Missing Vault keys are written into `.env` as empty strings or the literal `null`
ci-run-on-site.sh:203-204 (`aqa admin_client_id`, `aqa admin_client_secret`), :216 (`jq -r '.data.data.password'` of ClickHouse), :118 (`vm_seed_root`). Only `bootstrap_user`, `ssh_user/ssh_host`, `vm_root` and the Keycloak password (indirectly, via the preflight) are validated. `jq -r` prints `null` for a missing key, so a half-provisioned site produces `CLICKHOUSE_PASSWORD='null'` or an empty admin client secret and fails later, deep inside a fixture, instead of with the "re-run ansible/89-aqa-ci.yml" message the script gives for the other keys.
Fix: validate every Vault key the `.env` needs in one place (`jq -e` / a `need`-style check on `aqa admin_client_id admin_client_secret vm_seed_root`) before writing the file.

[Risk] A single transient Keycloak 401 fails the whole job; the repo already documents that 401s can be load-induced
ci-run-on-site.sh:149-155 — HTTP 400/401 stops the job immediately ("Not retrying"), on the assumption that 401 means a locked account. `docs/common-issues/keycloak-and-auth/keycloak-transient-login-401.md` records that Keycloak can answer a password grant with 401 purely from load, which is why the suite's `withKeycloakLoginRetry` retries 3×/8 s. The no-retry design is defensible against permanent lockout (`keycloak-shared-credential-lockout-and-ci-log-masking.md` says the breaker threshold is tied to the realm policy), but one retry stays within that budget and removes a false red on a blip at job start.
Fix: for 401 only, retry once after a short delay before dying; keep 400 immediate.

[Risk] Results from three more environments upload into the same TestOps project with only the launch name to tell them apart
.gitlab-ci.yml:629 sets `ALLURE_LAUNCH_NAME` for site jobs, but the shared upload step (:197-280) and the project id (`ALLURE_PROJECT_ID: '2'`, :33) are unchanged, so a manual `web` run on `main` with `ENV_TARGET=bankstg` uploads to the same cases as qa. The step's own comment (:205-209) says the gate exists so the case catalog "can't drift further"; the MR description states the expected result on `bankstg`/`bankuat` is 42/42 failed. That run would push 42 failures into the case history.
Fix: restrict the upload to `ENV_TARGET` in `qa|stage` (or confirm with the lead that per-environment history is wanted and set the Allure environment label), and say which in the README.

[Risk] Two of the three site jobs are red by construction with `main`'s suite
MR description: bankuat (RC3) and bankstg (release-0-2) fail 42/42 on `BUSINESS_UNIT_ID`. The README section added at README.md:476-484 does not mention this, and the jobs have no guard or note, so a person following the README gets a 100 % failure and no explanation in the repo.
Fix: add a short caveat to the new README section (which branch/tag matches which site) so the expected failure is documented where the option is described.

[Risk] The non-secret `TEST_SCRIPT` value differs between qa and site runs
.gitlab-ci.yml:~655 (`export TEST_SCRIPT="${TEST_TYPE}"`, giving `smoke-m1`) vs the qa jobs' `test:api:smoke-m1` (:360-:579). `playwright.config.ts:27` uses `TEST_SCRIPT` as the Allure `suite` metadata, so the same suite is labelled differently depending on where it ran.
Fix: set it to the same `test:api:<type>` / `test:ui:<type>` form the qa jobs use, or accept and document the difference.

## Nice-to-Have Improvements

[Nit] Exclude pattern `.cache` is not anchored
run-on-vm.sh:186 — `--exclude='.cache'` matches any file or directory with that name at any depth of the archive, not just the CI npm cache at the repo root. No tracked `.cache` path exists today (checked `git ls-tree`), so no current impact.
Fix: anchor it to the repo root (`--exclude='./.cache'`).

[Nit] Preflight pins the Keycloak/gateway connection to port 80
ci-run-on-site.sh:143, :163 — `--resolve "$KC_HOST:80:$SITE_INGRESS_IP"` assumes the `SITE_*_URL` values are plain http on port 80 (true for all three sites today). An https or non-default-port URL would make the preflight silently resolve a different host:port than the suite.
Fix: derive the port from the URL, or fail in `need` if a URL is not `http://host` without a port.

[Nit] ssh config and known_hosts are overwritten unconditionally
ci-run-on-site.sh:105-114 — `> "$HOME/.ssh/known_hosts"` and `> "$HOME/.ssh/config"` replace whatever is there. Fine in a throwaway Docker executor, destructive on a shell executor or any runner with a persistent HOME.
Fix: write them under `$WORK` and point `ssh` at them with `-F`/`UserKnownHostsFile` (run-on-vm.sh would need to accept extra `SSH_OPTS`), or append instead of truncating.

[Nit] A preflight failure is followed by a second, unrelated failure
.gitlab-ci.yml:198-203 — when `ci-run-on-site.sh` exits 2 before any report exists, the shared step still runs `npx allure generate "${ALLURE_RESULTS_DIR}"` on a directory that was never created. The behaviour of `allure generate` on a missing directory was not run in this review, so treat this as unverified; if it exits non-zero the job ends there and `TEST_EXIT_CODE=2` never reaches the final `exit`. The real diagnostic is printed earlier, so the impact is noise.
Fix: `mkdir -p "$ALLURE_RESULTS_DIR"` in the site branch, or skip report generation when the script exited 2.

## Known-Issue Cross-Check

- Reintroduced anti-pattern: none.
- Correctly follows a documented resolution: single, early, non-parallel Keycloak login before any worker starts (`keycloak-shared-credential-lockout-and-ci-log-masking.md`); no shared `proj-admin` credential (same doc); `DB_NAME` per site so `getCurrentEnvName()` yields the right Kafka topic prefix (`kafka-topic-env-prefix-uses-env-target.md`); per-environment working copy instead of the shared `/opt/perftest/aqa` (`vm-sync-whitelist-silently-stranded-fixes.md` item 3).
- Partly in tension: the no-retry preflight vs `keycloak-transient-login-401.md` (see the Risk above).
- `docs/review-mr/_pattern-log.md` does not exist.

## Whole-repo blast-radius (Step 1.5)

| Changed symbol | Consumers found | Outside the MR's files | Behaviour change |
|---|---|---|---|
| `.allure_report_and_upload` (`.gitlab-ci.yml:192`) | `.api_suite_test_template`, `.ui_suite_test_template`, new `.site_tests` | the two existing templates (same file) | None while `SITE_SUITE` is unset; it is set only inside `.site_tests`. |
| `.skip_on_azure_site` rule added to 18 `api:*`/`ui:*` jobs | those 18 jobs | same file | Only when `ENV_TARGET` ∈ {bankstg,bankuat,two}; qa/stage/MR pipelines unchanged. |
| `ENV_TARGET` options | `playwright.config.ts:28` (Allure `environment`), `diagnostics:network-connectivity` (`environment: $ENV_TARGET`) | yes, `playwright.config.ts` | Allure environment label only; the diagnostics job still probes the dev IP when run with an Azure target (harmless, manual, `allow_failure`). |
| `run-on-vm.sh` `sync_sources` tar excludes | engineers' local runs, `delete-run-by-id.ts` (uses `--kill` only), new `ci-run-on-site.sh` | `delete-run-by-id.ts` | No change for `--kill`; local syncs now also skip `.cache`. |
| New `ci-run-on-site.sh` | only `.gitlab-ci.yml` | — | n/a |
| `api/utils/**` | not touched | — | n/a |

## Necessity Citations

| Decision | Cited justification |
|---|---|
| New `ci-run-on-site.sh` wrapper around `run-on-vm.sh` | README.md:262 (VM is the sane-latency path), run-on-vm.sh header :1-61 (the `--detach`/`--follow`/`--stop` modes this reuses); MR description. |
| Preflight request `GET table-registry/api/v1/groups` | `api/utils/paths/api-paths.ts:2` (`TABLE_REGISTRY_GROUPS`), `api/utils/fixtures/global-setup.ts:16` (same URL used as the health probe). |
| `X-Company-Code` header in the preflight | `api/utils/constants/constants-keeper.ts:38,128`. Note: fixtures also send `Cbs-User-Context` (`api-fixtures.ts:43,125`); the preflight does not. |
| TEST_TYPE → suite mapping | `run-suite.sh:19-22` (named API suites, `ui` = `@ui` grep) and `package.json:9-26` (the npm scripts it must match); `ui-smoke-m*`/`ui-regression-m*` → `ui` suite + `--grep @smoke_m1` equals `test:ui:smoke-m1`'s own grep. |
| `SITE_*` variable prefix | commit 004323d8 (incident job 318596); `.gitlab-ci.yml:26,35-37` show the scope-`*` variables it protects against. The job log itself could not be checked. |
| `resource_group: aqa-$ENV_TARGET` | run-on-vm.sh:482 refuses a second run; one working copy per env. |
| `timeout: 8h` | Cited as proj-devops `aqa_ci_token_ttl`; not verifiable from this repo. |
| apt-get `openssh-client jq` | `ci-run-on-site.sh:48` (tool check) and `.gitlab-ci.yml:635-637`; image lacks them per the MR. |
| `--exclude='.cache'` | `.gitlab-ci.yml:19` (`npm_config_cache=$CI_PROJECT_DIR/.cache/npm`). |
| node_modules re-seed marker | run-on-vm.sh:203-215 (`ensure_node_modules` seeds only when the directory is absent). |
| `curl -k` to Vault | No citation found in this repo; the comment points at proj-devops `proj-apps-site.yml`, which is outside this review. |
| Vault paths / AppRole | proj-devops `ansible/89-aqa-ci.yml` (counterpart MR) — not reviewable here. This MR must not be relied on before that MR is applied to each site. |

## Orphaned Code

None found.

## Verification-claim check

Commit a139949a lists six fixes; each is present in the diff (`jq env.*` at :73, `|| true` on the `ls`/`sed` at :274/:284, `400|401` at :149, re-seed after the orphan stop at :246-256, DB login after the preflights at :175, `vssh`). No claim without a matching change. There is no automated test for this wrapper; the only verification is the manual run described in the MR.
