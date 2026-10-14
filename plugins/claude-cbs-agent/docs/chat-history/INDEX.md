# docs/chat-history/ — session-to-session continuity log

Chronological by design (one file per session, filename = `<yyyy-MM-dd_HH-mm>_<slug>.md`, never
reorganized or renamed — see `commands/team/context-resolution.md`'s "Session History" section and
its "Topic-folder hierarchy" note on why this folder is the deliberate exception to topic-folder
structure). This index is a **navigation aid only** — grouping entries by topic/ticket for lookup —
it does not change where any file lives; always still read the actual dated file, never just this
index's one-line summary.

## By topic / ticket

### TB-1525 — Customization Integration Suite
- [`2026-07-13_12-37_chat-history-skill-and-cleanup-fix.md`](2026-07-13_12-37_chat-history-skill-and-cleanup-fix.md) — Cleanup-code review + new session-summary/chat-history continuity skill (framework meta-work, TB-1525 first item only).
- [`2026-07-14_13-31_tb-1525-customization-integration-review.md`](2026-07-14_13-31_tb-1525-customization-integration-review.md) — Review, bug fixes, and fidelity check.

### TB-1354 — Kafka CI/CD Wiring
- [`2026-07-29_15-17_tb-1354-kafka-cicd-wiring.md`](2026-07-29_15-17_tb-1354-kafka-cicd-wiring.md) — Analysis, fresh implementation, and verification.
- [`2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md`](2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md) — Pipeline debugging and README consolidation (continuation).
- [`2026-07-29_16-00_tb-1354-kafka-fundamentals-explainer.md`](2026-07-29_16-00_tb-1354-kafka-fundamentals-explainer.md) — Kafka fundamentals explainer for context (continuation).

### TB-1533 — Plugin Manager
- [`2026-08-04_22-45_tb-1533-plugin-manager-auth-and-review-recheck.md`](2026-08-04_22-45_tb-1533-plugin-manager-auth-and-review-recheck.md) — PluginManagerApiClient cleanup + review-finding recheck.

### TB-1860 — Idempotency (Duplicate Prevention Engine)
- [`2026-07-17_14-07_tb-1860-idempotency-integration-test-cases.md`](2026-07-17_14-07_tb-1860-idempotency-integration-test-cases.md) — Integration test case design, v1–v5.
- [`2026-08-28_09-53_idempotency-allure-linking.md`](2026-08-28_09-53_idempotency-allure-linking.md) — Allure TestOps linking + coverage audit (TB-3400 branch).
- [`2026-08-28_10-14_idempotency-excel-audit-dedup-newtest.md`](2026-08-28_10-14_idempotency-excel-audit-dedup-newtest.md) — Excel cross-check, Allure dedup, new test, bugfix (continuation).
- [`2026-08-28_11-42_idempotency-2734-2740-diagnostic-resolution.md`](2026-08-28_11-42_idempotency-2734-2740-diagnostic-resolution.md) — Allure 2734 rewritten, 2740 deleted, 2726 gap fixed (continuation).

### TB-2034 / TB-2225 — Table Group Health & Self-Heal Performance
- [`2026-07-23_16-57_tb-2034-group-health-and-timeout-fixes.md`](2026-07-23_16-57_tb-2034-group-health-and-timeout-fixes.md) — Group readiness-wait and test-timeout fixes.
- [`2026-07-23_18-51_tb-2034-call-prep-summary.md`](2026-07-23_18-51_tb-2034-call-prep-summary.md) — Call-prep summary of TB-2034 + TB-2225 combined work.
- [`2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md`](2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md) — Self-heal performance root-cause and orchestrator review.
- [`2026-07-24_14-33_tb-2225-orchestrator-self-heal-architecture-review.md`](2026-07-24_14-33_tb-2225-orchestrator-self-heal-architecture-review.md) — Orchestrator review checkpoint (4 rounds, Workflow tool).
- [`2026-07-24_14-36_tb-2225-orchestrator-review-self-heal-architecture.md`](2026-07-24_14-36_tb-2225-orchestrator-review-self-heal-architecture.md) — Full orchestrator review Round 4 final-decision report.

### TB-2083 — Override Dispo Smoke
- [`2026-08-19_21-39_tb-2083-override-dispo-fixes.md`](2026-08-19_21-39_tb-2083-override-dispo-fixes.md) — setAuthRequired, PERMISSIONS, FIN classification fixes + CI typecheck.
- [`2026-08-21_15-02_tb-2083-mr138-review-response.md`](2026-08-21_15-02_tb-2083-mr138-review-response.md) — MR !138 automated-review response (confirmed issues, risks, docs).
- [`2026-08-21_19-24_tb-2083-mr138-recheck-and-docs-sync.md`](2026-08-21_19-24_tb-2083-mr138-recheck-and-docs-sync.md) — MR !138 recheck follow-ups and project-spec/frame-specs sync.
- [`2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md`](2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md) — TC-004/TC-020/TC-026 precondition fixes and manual UI re-verification (Override/Dispo UI sheet).

### TB-2102 — Customization Testing
- [`2026-08-03_20-39_tb-2102-tc04-nau-staging-fix.md`](2026-08-03_20-39_tb-2102-tc04-nau-staging-fix.md) — TC-04 NAU-staging fix (Safe Deletion Policy — DEL segment purge blocking).

### TB-2179, TB-1987, TB-1988, TB-1989, TB-1990 — Currency Smoke Automation
- [`2026-08-21_10-49_tb-2179-currency-us-01-13-02-03-04-research.md`](2026-08-21_10-49_tb-2179-currency-us-01-13-02-03-04-research.md) — US-01.13.02/03/04 research & escalation (TB-1988/1989/1990 cases).
- [`2026-08-27_14-37_tb-2960-currency-full-component-audit.md`](2026-08-27_14-37_tb-2960-currency-full-component-audit.md) — Full Allure component audit (TB-2960 branch, coordinates TB-1987/1988/1989/1990).

### TB-2437 / TB-2440 / TB-2485 — Enquiry Regression
- [`2026-08-25_10-01_enquiry-regression-table-consolidation.md`](2026-08-25_10-01_enquiry-regression-table-consolidation.md) — Related-table consolidation decision.
- [`2026-08-25_20-08_enquiry-link-defaultjoin-shape.md`](2026-08-25_20-08_enquiry-link-defaultjoin-shape.md) — LINK/defaultJoin shape live-config confirmation.
- [`2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md`](2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md) — Auditable field fix, US-01.07.03/04 batch, LINK/defaultJoin shape.
- [`2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md`](2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md) — inputFieldIds contract, pagination boundary fix, TC-1010 investigation.
- [`2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md`](2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md) — TC-997 removed (full reference for later resume).

### TB-2960 / TB-1987, TB-1988, TB-1989, TB-1990 — Currency Definition & Order Automation
- [`2026-08-26_11-52_tb-2960-currency-smoke-diff-amt-fix.md`](2026-08-26_11-52_tb-2960-currency-smoke-diff-amt-fix.md) — currency-smoke DIFF_AMT band-count fix.
- [`2026-08-26_09-38_tb-2960-us-01-13-03-allure-linking.md`](2026-08-26_09-38_tb-2960-us-01-13-03-allure-linking.md) — US-01.13.03 Allure linking, new TCs surfaced, 12 wired.
- [`2026-08-26_09-59_tb-2960-tc30-tc31-triangulation.md`](2026-08-26_09-59_tb-2960-tc30-tc31-triangulation.md) — TC-30 (LOCAL_CURRENCY fallback) and TC-31 (read-only isolation) automation.

### TB-3083 — Enquiry Regression Code Cleanup
- [`2026-08-26_16-42_removed-unused-enquiry-helper-functions.md`](2026-08-26_16-42_removed-unused-enquiry-helper-functions.md) — Removed seedRelatedNameRecord, waitForEnquirySelectionFieldReady.
- [`2026-08-27_10-22_mr152-tb3083-review-closeout.md`](2026-08-27_10-22_mr152-tb3083-review-closeout.md) — MR !152 code-review triage: drilldown dedup, TC-1014 fix.

### TB-3196 — Access Administration Smoke
- [`2026-08-27_13-07_removed-tc1675-keycloak-permission-blocker.md`](2026-08-27_13-07_removed-tc1675-keycloak-permission-blocker.md) — TC-1675 removed (Keycloak service-account permission blocker).
- [`2026-09-02_15-16_tb-3196-lock-intent-management-hooks-review.md`](2026-09-02_15-16_tb-3196-lock-intent-management-hooks-review.md) — US-02.03.04 Lock & Intent Management: case-by-case TC implementation and hooks review.

### TB-3197 — Access Administration Regression
- [`2026-08-28_17-10_tb-3197-access-administration-dedup.md`](2026-08-28_17-10_tb-3197-access-administration-dedup.md) — access-administration-regression deduplication pass.
- [`2026-09-10_17-30_mr-202-tb-3197-logical-review.md`](2026-09-10_17-30_mr-202-tb-3197-logical-review.md) — MR 202 logical review (AQA + AQA Lead lenses) of auth-service.ts changes.

### TB-3888 — Override-Dispo UI Regression/Smoke Hardening
- [`2026-09-21_08-57_tb-3888-override-dispo-ui-hardening.md`](2026-09-21_08-57_tb-3888-override-dispo-ui-hardening.md) — DYNAMIC_GROUP_ID UI worker fixture, scenario-table refactor, save-race elimination, UI "not persisted" checks moved to API-level (regression + smoke).

### TB-3874 — Azure bankstg/bankuat CI
- [`2026-09-14_16-18_tb-3874-azure-bankstg-bankuat-gitlab-ci.md`](2026-09-14_16-18_tb-3874-azure-bankstg-bankuat-gitlab-ci.md) — Manual GitLab CI jobs for bankstg/bankuat designed (later reverted).
- [`2026-09-14_18-48_tb-3874-azure-ci-reverted-detach-flag-added.md`](2026-09-14_18-48_tb-3874-azure-ci-reverted-detach-flag-added.md) — CI jobs reverted; `--detach` flag added to run-on-vm.sh/.ps1 instead.

### Framework & Meta Work
- [`2026-07-29_10-44_review-pr-commands-split.md`](2026-07-29_10-44_review-pr-commands-split.md) — Split aqa-review-*-pr commands, added review-pr-recheck (no ticket).
- [`2026-08-18_22-23_ai-architect-framework-optimization.md`](2026-08-18_22-23_ai-architect-framework-optimization.md) — Knowledge-base restructure, context-engineering audit, closeout hook, architecture diagrams (AI Architect meta-work, no consuming-repo ticket).
- [`2026-08-30_19-51_enquiry-regression-helper-dedup.md`](2026-08-30_19-51_enquiry-regression-helper-dedup.md) — Smoke M2 refactor: boilerplate dedup, dead-code TS fix (group_1/refactor/smoke-m2, no ticket).
- [`2026-08-31_07-37_override-dispo-regression-refactor-and-timeout-fix.md`](2026-08-31_07-37_override-dispo-regression-refactor-and-timeout-fix.md) — Smoke M2 refactor continuation: projection-forms timeout, enquiry-regression beforeAll review.

### Other (Password Policy / Keycloak issues, no single ticket)
- [`2026-08-28_tc1506-skipped-no-policy-configured-infeasible.md`](2026-08-28_tc1506-skipped-no-policy-configured-infeasible.md) — TC-1506 skipped: default Password Policy unreachable via API.
- [`2026-08-28_tc1569-1524-skipped-sm-user-lockout-sync-gap.md`](2026-08-28_tc1569-1524-skipped-sm-user-lockout-sync-gap.md) — TC-1569/1524 skipped: SM.USER never syncs to LOCKED after Keycloak brute-force.

## Chronological (all entries, oldest first)

- [`2026-07-13_12-37_chat-history-skill-and-cleanup-fix.md`](2026-07-13_12-37_chat-history-skill-and-cleanup-fix.md)
- [`2026-07-14_13-31_tb-1525-customization-integration-review.md`](2026-07-14_13-31_tb-1525-customization-integration-review.md)
- [`2026-07-17_14-07_tb-1860-idempotency-integration-test-cases.md`](2026-07-17_14-07_tb-1860-idempotency-integration-test-cases.md)
- [`2026-07-23_16-57_tb-2034-group-health-and-timeout-fixes.md`](2026-07-23_16-57_tb-2034-group-health-and-timeout-fixes.md)
- [`2026-07-23_18-51_tb-2034-call-prep-summary.md`](2026-07-23_18-51_tb-2034-call-prep-summary.md)
- [`2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md`](2026-07-24_14-29_tb-2225-self-heal-perf-and-review.md)
- [`2026-07-24_14-33_tb-2225-orchestrator-self-heal-architecture-review.md`](2026-07-24_14-33_tb-2225-orchestrator-self-heal-architecture-review.md)
- [`2026-07-24_14-36_tb-2225-orchestrator-review-self-heal-architecture.md`](2026-07-24_14-36_tb-2225-orchestrator-review-self-heal-architecture.md)
- [`2026-07-29_10-44_review-pr-commands-split.md`](2026-07-29_10-44_review-pr-commands-split.md)
- [`2026-07-29_15-17_tb-1354-kafka-cicd-wiring.md`](2026-07-29_15-17_tb-1354-kafka-cicd-wiring.md)
- [`2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md`](2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md)
- [`2026-07-29_16-00_tb-1354-kafka-fundamentals-explainer.md`](2026-07-29_16-00_tb-1354-kafka-fundamentals-explainer.md)
- [`2026-08-03_20-39_tb-2102-tc04-nau-staging-fix.md`](2026-08-03_20-39_tb-2102-tc04-nau-staging-fix.md)
- [`2026-08-04_22-45_tb-1533-plugin-manager-auth-and-review-recheck.md`](2026-08-04_22-45_tb-1533-plugin-manager-auth-and-review-recheck.md)
- [`2026-08-18_22-23_ai-architect-framework-optimization.md`](2026-08-18_22-23_ai-architect-framework-optimization.md)
- [`2026-08-19_21-39_tb-2083-override-dispo-fixes.md`](2026-08-19_21-39_tb-2083-override-dispo-fixes.md)
- [`2026-08-21_10-49_tb-2179-currency-us-01-13-02-03-04-research.md`](2026-08-21_10-49_tb-2179-currency-us-01-13-02-03-04-research.md)
- [`2026-08-21_15-02_tb-2083-mr138-review-response.md`](2026-08-21_15-02_tb-2083-mr138-review-response.md)
- [`2026-08-21_19-24_tb-2083-mr138-recheck-and-docs-sync.md`](2026-08-21_19-24_tb-2083-mr138-recheck-and-docs-sync.md)
- [`2026-08-25_10-01_enquiry-regression-table-consolidation.md`](2026-08-25_10-01_enquiry-regression-table-consolidation.md)
- [`2026-08-25_20-08_enquiry-link-defaultjoin-shape.md`](2026-08-25_20-08_enquiry-link-defaultjoin-shape.md)
- [`2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md`](2026-08-25_23-13_enquiry-regression-link-and-auditable-fixes.md)
- [`2026-08-26_09-38_tb-2960-us-01-13-03-allure-linking.md`](2026-08-26_09-38_tb-2960-us-01-13-03-allure-linking.md)
- [`2026-08-26_09-59_tb-2960-tc30-tc31-triangulation.md`](2026-08-26_09-59_tb-2960-tc30-tc31-triangulation.md)
- [`2026-08-26_11-52_tb-2960-currency-smoke-diff-amt-fix.md`](2026-08-26_11-52_tb-2960-currency-smoke-diff-amt-fix.md)
- [`2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md`](2026-08-26_13-34_tb-2437-2440-inputfieldids-pagination-fixes.md)
- [`2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md`](2026-08-26_15-38_tc-997-removed-defaultjoin-execute-gap-reference.md)
- [`2026-08-26_16-42_removed-unused-enquiry-helper-functions.md`](2026-08-26_16-42_removed-unused-enquiry-helper-functions.md)
- [`2026-08-27_10-22_mr152-tb3083-review-closeout.md`](2026-08-27_10-22_mr152-tb3083-review-closeout.md)
- [`2026-08-27_13-07_removed-tc1675-keycloak-permission-blocker.md`](2026-08-27_13-07_removed-tc1675-keycloak-permission-blocker.md)
- [`2026-08-27_14-37_tb-2960-currency-full-component-audit.md`](2026-08-27_14-37_tb-2960-currency-full-component-audit.md)
- [`2026-08-27_15-50_tc1638-1639-skipped-self-service-password-gap.md`](2026-08-27_15-50_tc1638-1639-skipped-self-service-password-gap.md)
- [`2026-08-28_08-51_tb-2960-auditable-field-fix.md`](2026-08-28_08-51_tb-2960-auditable-field-fix.md)
- [`2026-08-28_09-53_idempotency-allure-linking.md`](2026-08-28_09-53_idempotency-allure-linking.md)
- [`2026-08-28_10-14_idempotency-excel-audit-dedup-newtest.md`](2026-08-28_10-14_idempotency-excel-audit-dedup-newtest.md)
- [`2026-08-28_11-42_idempotency-2734-2740-diagnostic-resolution.md`](2026-08-28_11-42_idempotency-2734-2740-diagnostic-resolution.md)
- [`2026-08-28_17-10_tb-3197-access-administration-dedup.md`](2026-08-28_17-10_tb-3197-access-administration-dedup.md)
- [`2026-08-28_tc1506-skipped-no-policy-configured-infeasible.md`](2026-08-28_tc1506-skipped-no-policy-configured-infeasible.md)
- [`2026-08-28_tc1569-1524-skipped-sm-user-lockout-sync-gap.md`](2026-08-28_tc1569-1524-skipped-sm-user-lockout-sync-gap.md)
- [`2026-08-30_19-51_enquiry-regression-helper-dedup.md`](2026-08-30_19-51_enquiry-regression-helper-dedup.md)
- [`2026-08-31_07-37_override-dispo-regression-refactor-and-timeout-fix.md`](2026-08-31_07-37_override-dispo-regression-refactor-and-timeout-fix.md)
- [`2026-09-02_15-16_tb-3196-lock-intent-management-hooks-review.md`](2026-09-02_15-16_tb-3196-lock-intent-management-hooks-review.md)
- [`2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md`](2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md)
- [`2026-09-10_17-30_mr-202-tb-3197-logical-review.md`](2026-09-10_17-30_mr-202-tb-3197-logical-review.md)
- [`2026-09-14_16-18_tb-3874-azure-bankstg-bankuat-gitlab-ci.md`](2026-09-14_16-18_tb-3874-azure-bankstg-bankuat-gitlab-ci.md)
- [`2026-09-14_18-48_tb-3874-azure-ci-reverted-detach-flag-added.md`](2026-09-14_18-48_tb-3874-azure-ci-reverted-detach-flag-added.md)
- [`2026-09-21_08-57_tb-3888-override-dispo-ui-hardening.md`](2026-09-21_08-57_tb-3888-override-dispo-ui-hardening.md)
