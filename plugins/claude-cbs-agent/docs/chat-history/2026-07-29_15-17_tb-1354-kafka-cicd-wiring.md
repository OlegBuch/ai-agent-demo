# TB-1354: Kafka CI/CD wiring — analysis, fresh implementation, and verification

**Date/time:** 2026-07-29 15:17 · **Branch:** `group-3/TB-1354-Kafka-CI/CD` (repo: `proj-test-automation`) · **Ticket(s):** TB-1354 (parent epic TB-791), TB-1788

## Discussed

- TB-1354 ("Framework: Kafka service for AQA framework") was already partially implemented on a
  stale remote branch `origin/group-int/TB-1354-kafka` (author Abdulla Karimov, last commit
  2026-07-14). Analyzed it via `git show`/`git diff` against `origin/main` directly (no GitLab
  web/API access from this environment — `10.0.102.50:443` connection refused, and no matching
  open MR ref found under `refs/merge-requests/*/head`).
- User decision: **do not switch to or rebase that branch.** Reimplement fresh on our own new
  branch (`group-3/TB-1354-Kafka-CI/CD`, cut from current `main`), borrowing design ideas only
  (hybrid native+REST-fallback producer, fail-fast retry config) — no code reused verbatim.
- CI strategy decision (user's call): Kafka tests are **not** a new `TEST_TYPE`/pipeline job.
  They ride the existing `@e2e` and `@health-check` tags/jobs. Confirmed via `--list` that both
  new spec files are correctly picked up by the existing `test:api:e2e`/`test:api:health-check`
  npm scripts — zero new `.gitlab-ci.yml` job needed.
- GitLab CI/CD Variables decision: only **`KAFKA_BROKERS`** needs to be a real GitLab secret
  (Environment scope `qa` → `10.0.130.10:30094`; `stage` → `10.0.140.10:30094` once confirmed).
  `KAFKA_CLIENT_ID`/`KAFKA_UI_URL`/`KAFKA_CLUSTER_NAME` are hardcoded directly in
  `.gitlab-ci.yml` (non-secret, same pattern as `KEYCLOAK_BASE_URL`). User has since created the
  `KAFKA_BROKERS` variable(s) in GitLab.
- Discussed (twice, in detail) the rationale for keeping **two** separate Kafka spec files
  instead of one, or instead of folding checks into a bare CI shell job:
  - `kafka-health-check.spec.ts` (`@health-check`) — fast (~4s) infra-only signal: proves native
    TCP+admin-protocol connectivity from the actual CI runner, isolates "is Kafka broken" from
    "is my test broken" during triage.
  - `kafka-service-example.spec.ts` (`@e2e`) — exercises the full reusable `KafkaService` surface
    (produce, consume, wait-by-predicate, correlationId filter, Zod payload validation, topic
    create/delete) that health-check never touches. Serves as: (1) copy-paste reference for the
    next engineer writing a real Kafka business test, (2) regression protection for the shared
    service itself (not just infra), (3) documentation that cannot silently drift out of sync
    with the real API, since it's type-checked and CI-run. Concluded a bare CI/CD shell/curl
    check would validate infra but never exercise the actual TypeScript contract other tests
    will depend on — rejected that alternative.
- Explained (in response to user's follow-up questions about verifying CI post-push) how the
  MR-title-keyword job-triggering pattern in `.gitlab-ci.yml` works (`health-check`/`e2e`/
  `regression` keywords are independent per-job rules, not mutually exclusive), and that
  `diagnostics:network-connectivity` is always present as a manual job on any MR regardless of
  title, making it the fastest zero-setup connectivity check.

## Implemented

New files (all in `proj-test-automation`, branch `group-3/TB-1354-Kafka-CI/CD`):
- `api/utils/kafka-service.ts` — `KafkaService` (connect/disconnect, send, subscribe+
  `KafkaSubscription`, `waitForMessage`, `byKey`/`byHeader`/`byCorrelationId`, `validatePayload`
  via Zod, `createTopic` with propagation-wait, `deleteTopic`, `listTopics`,
  `usingRestFallback`, `brokers` getter). Falls back to the pre-existing
  `kafka-ui.values.ts`/`isKafkaUiConfigured()` (Kafbat REST) for produce-only when native
  connect fails. Added full traceability logging (`[KafkaService] Connecting/Connected/Falling
  back...`) after user feedback that the first health-check run was a black box.
- `api/types/kafka.types.ts` — `KafkaServiceConfig`, `KafkaMessage<T>`, `SubscribeOptions`,
  `WaitForMessageOptions<T>`.
- `api/integration_chapter/tests/kafka-health-check.spec.ts` — `['@health-check','@api','@kafka']`.
- `api/integration_chapter/tests/kafka-service-example.spec.ts` — `['@e2e','@api','@kafka']`,
  self-contained (creates/deletes its own test-owned topic via `generateCustomId`).

Edited:
- `api/utils/api-fixtures.ts` — added `kafkaService` fixture (fresh instance per test,
  `disconnect()` in teardown).
- `.env.example` — added `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, optional SASL/SSL vars.
- `.gitlab-ci.yml` — added `kafka.proj.local` to `CI_HOST_ALIASES`; hardcoded
  `KAFKA_CLIENT_ID`/`KAFKA_UI_URL`/`KAFKA_CLUSTER_NAME`; extended
  `diagnostics:network-connectivity` with a raw `/dev/tcp` reachability check against
  `KAFKA_BROKERS`.
- `README.md` — added full **"Kafka Testing"** section (infra table, env-var table, usage
  example, API reference, CI wiring, limitations) and a `@kafka` row in the Test Tags table.
  A standalone `docs/kafka-service.md` was drafted first, then **deleted** per user request —
  all its content was folded into this README section instead; all internal references
  (error messages in `kafka-service.ts`, `.gitlab-ci.yml`, `.env.example`, test files) were
  updated to point at `README.md "Kafka Testing"` instead of the removed doc file.
- `package.json`/`package-lock.json` — added `kafkajs@^2.2.4` (devDependencies only; a stray
  `dependencies` block from an earlier ad-hoc `npm install` was caught and removed).

Verification performed (not just claimed):
- `npx tsc --noEmit`, `npm run lint:ci` (zero warnings), `npm run format:check` — all clean,
  re-run after every subsequent edit.
- Ran both Kafka specs against the **real QA Kafka cluster** (`KAFKA_BROKERS=10.0.130.10:30094`,
  reachable directly from this dev machine) — both passed, native connection confirmed (no REST
  fallback triggered).
- Independently confirmed the raw broker NodePort is reachable (`/dev/tcp` check) and that the
  Kafka UI (Kafbat) REST API is live and reachable via the exact `CI_TARGET_IP` + `Host:
  kafka.proj.local` header trick already used for every other `*.proj.local` service — response
  showed cluster name genuinely is `proj-kafka` (3914+ topics), confirming the hardcoded
  `.gitlab-ci.yml` values are correct.
- Proved the **pre-existing, unmodified** `kafka-topic-cleanup-helper.ts` (used in teardown by
  ~14 unrelated spec files, previously a silent no-op in CI since `kafka.proj.local` was never in
  `CI_HOST_ALIASES` before this session) now genuinely works: created a topic natively, deleted
  it via the exact REST route that helper calls (`DELETE .../topics/{name}` via curl, HTTP 200).
  All throwaway verification scripts were removed afterward, nothing committed.

## Learned

- The Kafka UI (Kafbat) instance and its topic-cleanup helper (`kafka-topic-cleanup-helper.ts`,
  `kafka-ui.values.ts`) already existed on `main` before this session, used only for teardown
  (delete test-owned topics after table/group deletion) — soft-fail by design, never breaks a
  test. It was never actually wired into CI (`kafka.proj.local` absent from `CI_HOST_ALIASES`,
  no `KAFKA_UI_URL`/`KAFKA_CLUSTER_NAME` anywhere in `.gitlab-ci.yml`), so real topic cleanup was
  almost certainly silently skipped in every CI run until this session's changes.
- `@e2e` was fully wired in the pipeline (`api:e2e`/`api:e2e:mr` jobs, `test:api:e2e` npm
  script) but had **zero** tests using it anywhere in the repo before this session.
- `@health-check` tests follow a one-file-per-module "dummy life-check" convention
  (`api-smoke.spec.ts` files), not a dedicated folder — informed the Kafka health-check's shape.
- GitLab CI/CD Variable **Environment Scope** must string-match the job's `environment:` value
  exactly (`qa` here) — a mismatch means the variable silently isn't injected, not an error;
  this repo's existing convention already relies on this for `BASE_URL`/`KEYCLOAK_*`.
- MR-pipeline job triggering here is keyword-based on the MR title, with **independent**
  per-job rules (not an if/elif chain) — a title containing both `health-check` and `e2e` runs
  both jobs in the same pipeline; `diagnostics:network-connectivity` is the one job always
  present (manual) regardless of title.
- This project's ESLint config disallows raw `setTimeout`/`delay`/`sleep`/`wait` calls directly
  inside test files (`test-flakiness/no-unconditional-wait`) — polling/retry logic (e.g.
  `createTopic`'s propagation wait) has to live in the utils layer, not the spec file.

## Open Items / Follow-ups

- Staging Kafka NodePort (`10.0.140.10:30094`, requested in TB-1788 alongside QA) has not been
  independently confirmed reachable from a CI runner — do not add a `stage`-scoped
  `KAFKA_BROKERS` GitLab variable or enable `ENV_TARGET=stage` Kafka runs until confirmed.
- No MR has been opened yet. User was walking through: push branch → verify
  `diagnostics:network-connectivity` (manual, always present) shows `TCP OPEN` → optionally set
  MR title to include `health-check`/`e2e` keywords (or use "Run pipeline" with `TEST_TYPE`) to
  actually execute the Kafka specs on CI and check for the `[KafkaService] Connected natively...`
  log line (not a REST-fallback warning).
- Porting real business-flow Kafka scenarios (e.g. the TC-KAFKA-001..015 style events —
  TableGroupChangeRequest, CUSTOMER_CREATED/UPDATED, payment order flow — seen on Abdulla's
  stale branch) is explicitly **not** done in this session and was flagged as needing actual
  approved Allure TestOps test cases from Manual QA first, not an ad-hoc port.
- Nothing has been committed to git yet in `proj-test-automation` as of this summary — all
  changes are sitting uncommitted on `group-3/TB-1354-Kafka-CI/CD`.

## References

- Jira: TB-1354 (this story), TB-1788 (Kafka NodePort infra, blocks TB-1354, status Done),
  TB-791 (parent epic, Milestone 2 — Integration Testing Preparation).
- GitLab: `origin/group-int/TB-1354-kafka` (stale reference branch, not used/merged — analyzed
  read-only via git, no reachable MR found for it).
- No PR/MR opened yet for this session's work.
