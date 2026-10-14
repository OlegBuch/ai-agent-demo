# Kafka topic env-prefix: use `getCurrentEnvName()`, not a raw env var

**TL;DR:** CBS Kafka topics are named `<env>.<tableId or entity>` (`qa.CM.CUSTOMER`,
`bankstg.EG.JOURNAL.ENTRY.dlq`). The established, already-used way to get `<env>` in
`proj-test-automation` is the typed helper **`getCurrentEnvName()`**
(`api/utils/helpers/test-ownership.ts`), not a raw env var read. It derives the environment from
`DB_NAME`'s suffix (`_dev`/`_stg`/`_bankstg`/`_bankuat`, else `'qa'`) and returns a typed
`CbsEnvName`. Existing call sites: `kafka-cleanup-helper.ts`'s `tableIdToKafkaTopicName()`
(`` `${getCurrentEnvName()}.${tableId}` ``, with the comment "CBS Kafka topics are named
`<env>.<tableId>`") and `constants-keeper.ts`'s `AML_TOPIC`/`RECORD_TOPIC`. Before building any
Kafka topic name in a new test/helper, use `getCurrentEnvName()` — do not invent a new env var and
do not reach for `ENV_TARGET` either (see below for why that's a different, coexisting thing).

`ENV_TARGET` is a **separate** env var (CI pipeline variable in `.gitlab-ci.yml`, default `'qa'`)
used only for Allure's `environment` tag (`playwright.config.ts`:
`process.env.ENV_TARGET ?? process.env.BASE_URL`). It used to also back `cce-values.ts`'s
`AUDIT_TOPIC` (a `proj.*`-prefixed audit topic) — that call site was switched to
`getCurrentEnvName()` too during this same incident, so as of 2026-09-18 `getCurrentEnvName()` is
the *only* mechanism for any Kafka topic name in this repo, CBS-record-event or audit-topic alike.
Don't reach for `ENV_TARGET` for a topic name: it's not guaranteed to be set outside CI (it wasn't
in `.env.bankstg-local`/`.env.bankuat-local` until this incident — added there anyway, since the
Allure tag still silently degraded to `BASE_URL` on VM runs without it), whereas
`getCurrentEnvName()` always resolves because `DB_NAME` is set in every real `.env*` file.

## What happened (2026-09-18)

`api/consolidation_engine/tests/consolidation-engine-smoke.spec.ts` and `-regression.spec.ts` (15
call sites) built Kafka topic names from a nonexistent `process.env.CBS_ENV_NAME`. That var was
never defined anywhere, so the template literal collapsed to the literal string
`"undefined.CM.CUSTOMER"`. Kafka UI (`kafbat.ui`) returned `404 Topic not found` with a full
Java/Reactor stack trace in the response body; the test's `expect.poll` retried this every ~1s for
up to 90s (`KAFKA_POLL_TIMEOUT_MS`), flooding the console with the same giant stack trace on every
attempt.

First fix attempt reached for `ENV_TARGET` (a real, already-used var) instead of the actually
CBS-topic-naming-idiomatic `getCurrentEnvName()` — a plausible-looking but second-best choice,
caught only because the user knew `getCurrentEnvName()` existed. Final fix: all 15 Consolidation
Engine call sites, plus `cce-values.ts`'s `AUDIT_TOPIC` (which had been using `ENV_TARGET` since
before this incident), now call `getCurrentEnvName()` (import from
`../../utils/helpers/test-ownership`).

## Pattern

Before adding any env-derived value to a test/helper (env-prefix, company code, environment name),
grep for an existing **typed helper function** first (`getCurrentEnvName`, `resolveKeycloakContext`-
style resolvers, etc.) — not just for env var names. A raw `process.env.X` read is a weaker,
easier-to-get-wrong substitute for a helper that already encodes the derivation rule and is reused
elsewhere; finding "some other file also reads this exact env var" is not the same as finding "this
is the one function that owns deriving this value."
