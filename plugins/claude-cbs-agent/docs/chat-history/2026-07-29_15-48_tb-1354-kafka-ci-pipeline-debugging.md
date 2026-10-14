# TB-1354: Kafka CI pipeline debugging and README doc consolidation

**Date/time:** 2026-07-29 15:48 · **Branch:** `group-3/TB-1354-Kafka-CI/CD` (repo: `proj-test-automation`) · **Ticket(s):** TB-1354, TB-1788

Continuation of this same session — picks up right after the previous checkpoint
(`2026-07-29_15-17_tb-1354-kafka-cicd-wiring.md`), which covered the initial fresh
implementation. This entry covers everything from there through the user actually opening the
MR, running real GitLab pipelines, and debugging three separate real CI failures.

## Discussed

- User asked to fold the standalone `docs/kafka-service.md` into `README.md` instead — agreed,
  no alternative considered, straightforward consolidation.
- User pushed the MR and reacted negatively to `diagnostics:network-connectivity` always showing
  up as a manual "Run job" button in every pipeline regardless of relevance ("выглядит топорно,
  странно и не правильно"), and proposed three alternatives: always-automatic gate, automatic
  only when Kafka is actually touched (asked "as as how to determine that"), or purely manual via
  the Jobs page. Landed on a hybrid: remove the Kafka check from the shared bash diagnostics job
  entirely (redundant given `kafka-health-check.spec.ts` is a strictly stronger real-code check),
  and instead auto-trigger `api:health-check:mr`/`api:e2e:mr` via GitLab's `rules: changes:` path
  filter scoped to Kafka-related files — no title keyword needed, no unrelated-MR noise.
- After the user later found the diagnostics job's TCP check genuinely useful as a zero-setup
  first signal, they asked to bring it back — re-added the same shell block to
  `diagnostics:network-connectivity`, keeping the new `changes:`-based auto-trigger on the real
  test jobs as well (both mechanisms now coexist, not mutually exclusive).
- Discussed, when the user asked "what if we need this diagnostics job on another environment,"
  why it was QA-only in two independent ways (job `environment:` scope for GitLab CI/CD Variable
  injection, and the separate, pre-existing, broader `CI_TARGET_IP` hardcoding used by all of
  that job's HTTP checks) — deliberately fixed only the first (Kafka-relevant) part
  (`environment: qa` → `environment: $ENV_TARGET`), left `CI_TARGET_IP` alone since fixing it
  needs real knowledge of Staging's network topology that wasn't available and is out of TB-1354's
  scope.
- Explained where `ENV_TARGET` itself comes from (a plain `.gitlab-ci.yml`-declared pipeline
  variable with `options:`, rendering a GitLab "Run pipeline" dropdown; no effect on automatic MR
  pipelines, which always take its default `qa`).
- Gave a full session wrap-up to the user at the end: current state of Kafka locally/in CI, what
  other engineers need in their own `.env` once this merges to `main`, and what remains open from
  TB-1354's original scope for future work.

## Implemented

- `README.md` — merged all content from the now-deleted `docs/kafka-service.md` into a single
  "Kafka Testing" section (infra table, env-var table, usage example, API reference, CI wiring,
  limitations); updated the CI-wiring paragraph twice as the trigger design changed (removed →
  reinstated the diagnostics-job TCP check description).
- Deleted `docs/kafka-service.md`; swept all references to it (`.env.example`, `.gitlab-ci.yml`,
  `api/utils/kafka-service.ts` error messages, `kafka-health-check.spec.ts`) to point at
  `README.md "Kafka Testing"` instead.
- `api/utils/kafka-service.ts` — added traceability logging to `connect()` (broker list,
  clientId, duration, native-vs-fallback outcome); renamed the private `brokers` field to
  `brokerList` and added a public `brokers` getter (needed for the new logging without a naming
  collision) and a `clientId` field.
- `api/kafka/tests/kafka-health-check.spec.ts` / `kafka-service-example.spec.ts` — added
  step-by-step `console.log` traceability (topic/correlationId, connect result, produced
  payload, matched message partition/offset/key/value, validation result, cleanup) after the
  user reported the first CI run being an opaque pass/fail with no visibility.
- **Bug fix — test discovery:** the two spec files had been moved (by the user, in commit
  `0754a69`) from `api/integration_chapter/tests/` into a new top-level `api/kafka/` folder, but
  directly at its root, not under a `tests/` subfolder. `playwright.config.ts`'s
  `testMatch: '**/tests/*.spec.ts'` requires that literal `tests/` segment (confirmed every other
  domain module — `api/account/tests/`, `api/cob/tests/`, etc. — follows it), so both files were
  silently invisible to the test runner in CI (`api:health-check` ran only 5 of 6 expected tests;
  `api:e2e` failed with "Error: No tests found" since `kafka-service-example.spec.ts` was the only
  `@e2e` test in the repo). Fixed via `git mv` into `api/kafka/tests/`, then corrected the
  relative imports back to `../../utils/...` (they'd been shortened to `../utils/...` for the
  previous, shallower path). Re-verified with `npx playwright test --grep @kafka --list`.
- `.gitlab-ci.yml`:
  - Removed, then (per user request) re-added the raw `/dev/tcp` TCP-reachability check for
    `KAFKA_BROKERS` inside `diagnostics:network-connectivity`.
  - Added `rules: changes:` entries (Kafka file paths) to `api:health-check:mr` and
    `api:e2e:mr` so they auto-run on any MR touching Kafka code, independent of MR title.
  - **Bug fix — variable scope:** `diagnostics:network-connectivity` had no `environment:` key
    at all, so GitLab never injected the environment-scoped `KAFKA_BROKERS` variable into it
    (confirmed: the same variable *was* correctly injected into `api:health-check`/`api:e2e`,
    which already had `environment: qa`/`environment: $ENV_TARGET`). Fixed by adding
    `environment: qa`, then generalized to `environment: $ENV_TARGET` so a manually-triggered
    "Run pipeline" with `ENV_TARGET=stage` picks up the stage-scoped `KAFKA_BROKERS` too.
- Verification performed at every step: `npx tsc --noEmit`, `npm run lint:ci`, `npm run
  format:check`, YAML validity via `npx --yes js-yaml .gitlab-ci.yml` (no `js-yaml`/PyYAML
  available locally otherwise). Beyond local checks, this session is the first time actual
  **GitLab pipeline runs** were used as ground truth — the user pasted real job logs for
  `diagnostics:network-connectivity`, `api:health-check:mr`, and `api:e2e:mr` across several
  iterations, which is how both real bugs above were caught (neither was reproducible from local
  `tsc`/`eslint`/`playwright --list` alone).
- Final state confirmed working end-to-end in the real MR pipeline: `api:e2e:mr` passed with
  native broker connection (`usingRestFallback=false`), full
  create→subscribe→send→waitForMessage→validate→delete cycle logged and green.

## Learned

- `playwright.config.ts`'s `testMatch: '**/tests/*.spec.ts'` (for the `API-tests` project)
  silently matches zero files if a spec sits outside a literal `tests/` directory — no error, no
  warning, the suite just runs fewer tests than expected. Any new domain folder must follow the
  `api/<domain>/tests/*.spec.ts` convention already used everywhere else.
- GitLab CI/CD **environment-scoped** variables (Environment scope = `qa`/`stage` etc.) are only
  injected into a job that has a matching `environment:` key defined — a job with no
  `environment:` field at all does not receive them, silently, even when the variable is
  correctly configured in Settings → CI/CD → Variables. This is a general GitLab mechanic, not
  Kafka-specific, and is worth checking on any *other* job in this pipeline that reads an
  environment-scoped variable but lacks `environment:`.
- `CI_TARGET_IP` is a single global hardcoded constant (`10.0.130.10`, i.e. QA) used by *every*
  check inside `diagnostics:network-connectivity`, predating this session's work — `stg.proj.local`
  is already listed in `CI_HOST_ALIASES` pointing at that same IP, suggesting (unconfirmed) that
  HTTP services route by ingress Host-header regardless of environment, whereas Kafka's raw TCP
  NodePort genuinely differs per environment (`10.0.130.10:30094` QA vs `10.0.140.10:30094`
  Staging per TB-1788) since NodePorts can't be host-header-routed.
- `ENV_TARGET` is a `.gitlab-ci.yml`-declared pipeline variable with `options:` (not a Settings
  CI/CD Variable) — GitLab renders these as a dropdown only on manually-triggered "Run pipeline";
  automatic MR pipelines always use the declared default (`qa`) with no way for the author to
  pick `stage` at MR-open time.
- The `[FAIL] Failed to delete Kafka topic "qa_bootstrap_*"` /
  `UnknownTopicOrPartitionException` seen in CI teardown logs is pre-existing behavior of
  `kafka-topic-cleanup-helper.ts` (not introduced this session) that only became *visible* once
  Kafka UI connectivity was actually wired into CI — bootstrap tables apparently have no real
  corresponding Kafka topic. Non-blocking (caught internally), but worth its own follow-up ticket.
- A Node `TimeoutNegativeWarning` observed during a very fast (48ms) `kafkajs` connect is
  internal to `kafkajs` itself — confirmed by grepping `kafka-service.ts` for `setTimeout`; both
  call sites use fixed positive durations and cannot produce a negative value.

## Open Items / Follow-ups

- Staging Kafka broker reachability (`10.0.140.10:30094`) still not independently confirmed from
  an actual CI runner — the stage-scoped `KAFKA_BROKERS` GitLab variable exists, but no
  `diagnostics:network-connectivity` run with `ENV_TARGET=stage` has been executed yet.
- The `qa_bootstrap_*` Kafka-topic-cleanup 500 (`UnknownTopicOrPartitionException`) — recommend a
  separate follow-up ticket; explicitly out of TB-1354's scope, not fixed here.
- Real business-flow Kafka test scenarios (the TC-KAFKA-001..015 style events seen on Abdulla's
  stale branch — TableGroupChangeRequest, CUSTOMER_CREATED/UPDATED, payment order flow) remain
  intentionally unported; still gated on Manual QA authoring approved Allure TestOps test cases
  first, not an ad-hoc port by this role.
- SASL/SSL GitLab CI/CD Variables intentionally not created (current broker listener is
  plaintext/no-auth per TB-1788); add only if the platform team enables broker auth later.
- MR is open with the pipeline passing as of this summary, but not confirmed merged to `main` —
  once merged, TB-1354's Jira/Allure Automation Status still needs updating.
- The broader `CI_TARGET_IP`-is-QA-only limitation across the whole `diagnostics:network-connectivity`
  job (not just the Kafka part) was flagged to the user but deliberately left unfixed — out of
  scope, needs real Staging network-topology input from someone else.

## References

- Jira: TB-1354, TB-1788 (both carried over from the previous checkpoint; no new tickets opened
  this entry, though a follow-up ticket for the `qa_bootstrap_*` cleanup issue was recommended
  but not created).
- GitLab: MR opened this session on `group-3/TB-1354-Kafka-CI/CD` (commit `0754a69` and
  subsequent uncommitted `.gitlab-ci.yml` fixes); no direct MR/pipeline URL was shared, only
  pasted job logs for `diagnostics:network-connectivity`, `api:health-check:mr`, `api:e2e:mr`.
