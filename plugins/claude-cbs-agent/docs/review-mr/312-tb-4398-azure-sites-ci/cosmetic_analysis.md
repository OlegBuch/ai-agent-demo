# Cosmetic analysis — MR !312 (TB-4398)

Reviewed 2026-10-06, MR head `a139949a`: 4 changed files, about 450 added lines (`ci-run-on-site.sh` 287, `.gitlab-ci.yml` ~175, `run-on-vm.sh` 4, `README.md` 10), every added line checked in windows of 150-300 lines. No TypeScript is changed, so the assertion-message and tag-taxonomy checks have nothing to apply to. `shellcheck` is not installed and the repo has no shell lint config, so shell style was checked by hand against the neighbouring `run-on-vm.sh`/`run-suite.sh`.

## Confirmed Issues

[Confirmed] Multi-line and WHAT-describing comments throughout the diff (comment-hygiene rule, blocking)
Convention: added/changed code carries no comments by default; a comment is allowed only as one short WHY sentence — never multi-line, never a restatement of what the code does (`code-style-agent.md`, Comment & Tag Hygiene). Violations, every block of two or more lines or a section banner:
- ci-run-on-site.sh: 2-36 (a 35-line header covering rationale, secret inventory, expected variables and exit codes), 50-51, 56-58, 69-71, 91-93, 105-106, 121-123, 134-137, 158-160, 172-174, 178-180, 189-190, 219-220, 233-235, 238-240, 246-250, 262-264, 282-283, plus the numbered section banners ("── 1. Vault ──" … "── 6. Put the reports …") which only restate what the next lines do.
- .gitlab-ci.yml: 195-196, 343-344, 587-610 (a 24-line block above the site jobs), 615-616, 618-619, 640-641, 678-679, 689-690.
- run-on-vm.sh: 178-180.
The neighbouring `run-on-vm.sh` header is also long, but an existing pattern is not a citation for new violations.
Fix: cut each comment to a single short WHY sentence (or delete it); move the rationale that is worth keeping (why the job drives the VM instead of running Playwright, which Vault path holds what, why `SITE_*`) into the README section this MR already adds or into the commit message.
Example:
    # -k omitted on purpose: Vault is reached over the tunnel, see README "Target environment".
    # one WHY sentence, not a paragraph

[Confirmed] Six identical variables are repeated in `site:bankuat` and `site:two`
.gitlab-ci.yml:697-698, 700, 704-706 and 719-720, 722, 726-728 — `SITE_INGRESS_IP`, `SITE_VAULT_ADDR`, `SITE_KEYCLOAK_BASE_URL`, `SITE_KAFKA_BROKERS`, `SITE_KAFKA_UI_URL`, `SITE_CLICKHOUSE_URL` have the same values in both jobs (the comment at :689-690 even says the two share a cluster, Keycloak, Kafka, ClickHouse, Vault and runner tag), as does `tags: [bankuat]`. A change of broker IP has to be made twice (In-File Duplication).
Fix: put the shared cluster values and the tag into a hidden job (e.g. `.site_bankuat_cluster`) and extend it from both jobs; `extends` merges `variables` maps.
Example:
    .site_bankuat_cluster:
      tags: [bankuat]
      variables: { SITE_INGRESS_IP: '10.191.0.100', SITE_VAULT_ADDR: '...', ... }
    site:two:
      extends: [.site_tests, .site_bankuat_cluster]

## Possible Risks

No issues detected.

## Nice-to-Have Improvements

No issues detected.

## Checks with no finding

- Commit messages: all five start with `TB-4398:` and say what and why (the body of 4aba5a94 still mentions `proj-admin`, which d8f0ce09 later replaces — history only, not a defect). The MR carries fix-up commits on top of the first one and is not squashed (`squash: false`); that is a workflow choice, not a placeholder-message violation.
- Text quality: no spelling or grammar defect found in the added comments, error messages, YAML descriptions or the README section.
- Naming: `SITE_*`, `AQA_VAULT_*`, snake_case shell helpers (`vget`, `vssh`, `kv`, `q`) are consistent within the new file and with `run-on-vm.sh`'s lower-case helper style.
- Duplicated literals against the global `variables:` block (`'proj-app'`, `'proj-kafka'`, `'proj-aqa-ci'`): intentional — the `SITE_` prefix exists precisely so these cannot be overridden by scope-`*` project variables, so referencing the globals would defeat it.
