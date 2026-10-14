# The Kafka UI REST proxy intermittently times out or drops the connection — not a code bug, needs a bounded retry per call site

Applies to: any helper that talks to the Kafka UI REST API (`KAFKA_UI_VALUES.baseUrl`) rather than
the native Kafka broker — `kafka-service.ts`'s `KafkaService.readLatestMessages` (read) and
`kafka-cleanup-helper.ts`'s `deleteKafkaTopicsForTableIds` (topic teardown). First two occurrences
both hit on `group-3/TB-3587`, 2026-09-03.

## The pattern/symptom

Two distinct call sites through the same proxy hit the same class of failure, self-healing on the
very next run with no code/environment change:

- `deleteKafkaTopicsForTableIds`: `apiRequestContext.delete: read ECONNRESET` on
  `DELETE /api/clusters/proj-kafka/topics/<topic>`.
- `KafkaService.readLatestMessages`: `apiRequestContext.get: Timeout 15000ms exceeded` on
  `GET /api/clusters/proj-kafka/topics/<topic>/messages/v2?mode=LATEST`, surfaced through
  `currency-regression.spec.ts`'s `expect.poll(..., { timeout: 60000 })` around it — a single
  15-second internal stall ate a quarter of the poll's entire retry budget in one iteration,
  leaving too few remaining poll cycles for the awaited Kafka event to show up before the outer
  60s expired.

## The rule

Treat a single connection-level failure (timeout, `ECONNRESET`, `ECONNREFUSED`) from the Kafka UI
proxy as transient noise, not a real signal — same category as
`../keycloak-and-auth/keycloak-transient-login-401.md`'s Keycloak-under-load pattern, different service. A genuine
HTTP error response from the proxy itself (non-2xx `response.ok() === false`) is NOT the same thing
and should still surface immediately, uncretried — it means the proxy is up and told you something
real (bad topic name, cluster misconfigured), not that the connection glitched.

**Fixed so far:** `KafkaService.readLatestMessages` (2026-09-03) now retries up to 3 attempts,
1000ms apart, only when `isTransientKafkaUiHttpFailure(error)` matches (timeout / `ECONNRESET` /
`ECONNREFUSED` / `ETIMEDOUT` / `EPIPE` in the message) — a real `!response.ok()` still throws on
the first attempt.

**Not yet fixed — known gap:** `deleteKafkaTopicsForTableIds` (`kafka-cleanup-helper.ts`) still has
zero retry; an `ECONNRESET` there is caught, logged, and the loop just moves to the next topic,
silently leaving that one Kafka topic un-deleted (a minor resource leak, not a test failure, since
cleanup errors don't fail the test). Apply the same `isTransientKafkaUiHttpFailure`-gated retry
there if this recurs enough to matter — deliberately deferred on 2026-09-03 since it doesn't fail
tests and the user hadn't asked for that specific fix yet, only for the noisy log (see
`../playwright-execution/playwright-error-message-embeds-call-log.md` for that part, which *was* fixed for both call
sites).

## Predictive rule

Any *new* helper added against this same Kafka UI proxy should assume it can intermittently
time out or reset a connection under load, exactly like Keycloak — build in the same
bounded-retry-on-transient-only pattern from the start rather than discovering it live via a flaky
CI run.
