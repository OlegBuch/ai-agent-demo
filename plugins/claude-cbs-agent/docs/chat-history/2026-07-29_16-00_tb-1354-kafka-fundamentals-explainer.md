# TB-1354: Kafka fundamentals explainer (for a user new to Kafka)

**Date/time:** 2026-07-29 16:00 · **Branch:** `group-3/TB-1354-Kafka-CI/CD` (repo: `proj-test-automation`) · **Ticket(s):** TB-1354, TB-1788

Continuation of this same session, picking up right after the previous checkpoint
(`2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md`). No code changed this entry — the
user asked for a plain-language explanation of Kafka itself (they'd never worked with it) and of
what this session's implementation actually does/checks, then asked to preserve that explanation
in chat-history for future reference. Recording the explanation itself below since that's
literally what was requested.

## Discussed

Gave a from-scratch Kafka explainer, tied directly to this session's code (not abstract):

**Core concept:** Kafka is a "bulletin board," not a phone call — a producer posts a message to
a topic and moves on without waiting for anyone to read it; consumers read whenever they want,
independently. Contrast with a normal HTTP request/response.

**Terms, mapped to intuition:**
- **Broker** — the Kafka server itself (our QA cluster is named `proj-kafka`, reachable at
  `10.0.130.10:30094` per TB-1788).
- **Topic** — a named channel/category of messages (e.g. a topic for customer events).
- **Producer** — whoever writes a message to a topic.
- **Consumer** — whoever reads messages from a topic.
- **Consumer Group** — a set of consumers that jointly process each message in a topic exactly
  once between them; *different* groups reading the same topic are fully independent of each
  other (each group sees every message, as if it had its own copy of the topic).
- **Offset** — a bookmark: how far a consumer has read into a topic.

**Why CBS uses it at all:** CBS is a microservice architecture — when one service does something
(creates a customer, posts a payment), it publishes an event to Kafka and other services
(audit, AML checks, payment hub) react asynchronously, decoupled from the original request.
Before this ticket, AQA could only verify the synchronous HTTP response, never what happens
downstream through Kafka.

**`KafkaService` (`api/utils/kafka-service.ts`) method-by-method, mapped to the concepts above:**
- `connect()` — opens the network connection to the broker.
- `send(topic, message)` — the Producer side; "posts to the board."
- `subscribe(topic)` + `.start()` — the Consumer side; creates a fresh, unique consumer group
  per call (random ID) specifically so different tests never compete over the same topic's
  messages; incoming messages buffer into `subscription.messages[]`.
- `waitForMessage(subscription, { predicate })` — the asynchrony-handling piece: a message may
  not arrive instantly, so this polls the buffer until a match appears or a timeout elapses
  (never hangs forever).
- `byKey` / `byHeader` / `byCorrelationId` — predicate helpers to answer "is this actually *my*
  message, or someone else's?" (a shared topic can carry unrelated traffic).
- `validatePayload(message, schema)` — confirms the message *body*, not just its arrival, has
  the expected shape (Zod schema).
- `createTopic` / `deleteTopic` — each test creates its own throwaway topic and deletes it
  afterward, so it never writes into a shared/real topic or leaves litter behind.

**What each of the two committed tests actually proves:**
- `kafka-health-check.spec.ts` — `connect()` → `listTopics()` only. Proves the Kafka *protocol*
  responds at all (fast, ~4s) — no real produce/consume exercised. First thing to check if
  anything Kafka-related looks broken: infra vs. our code.
- `kafka-service-example.spec.ts` — full loop: create own topic → subscribe *before* sending
  (Kafka consumers only see messages posted after they subscribe, unless `fromBeginning` is set —
  subscribing after sending risks missing your own message) → send a message carrying a unique
  `correlationId` header → wait for a buffered message matching that id → validate its payload
  shape via Zod → delete the topic. Framed for the user as "mail yourself a letter with a unique
  code on the envelope, and confirm it arrives with exactly the content you sent" — but through
  the real Kafka infrastructure, not a fake/mocked one.

**Why the REST fallback exists:** CI runners and local machines sit outside the Kubernetes pod
network, so TB-1788 opened a NodePort as the primary path (`10.0.130.10:30094`). If that native
path somehow fails, `KafkaService` falls back to producing via the Kafka UI (Kafbat) REST API —
HTTP-only, produce-only, no subscribe/consume possible that way. `kafka-health-check` explicitly
asserts `usingRestFallback === false`, so a silent fallback (which would otherwise mask a real
network regression) always surfaces as a visible signal instead.

**Bottom line explained to the user:** a green pipeline on these two tests means the CI runner
can genuinely reach the real QA Kafka cluster, produce a message, receive it back, and validate
its contents — i.e. the full infrastructure chain any *future* Kafka-event test (e.g. "verify
CUSTOMER_CREATED fires on customer creation") will depend on is already proven to work, not just
theoretically correct by reading the code.

## Implemented

None — explanatory turn only, no files changed.

## Learned

Nothing new architecturally; this entry exists to preserve a plain-language explanation of
already-implemented behavior (see the two prior checkpoints for the actual technical facts
learned while building/debugging it) so a future reader unfamiliar with Kafka doesn't have to
have this same conversation again.

## Open Items / Follow-ups

None new — see `2026-07-29_15-48_tb-1354-kafka-ci-pipeline-debugging.md` for the still-open
items (Staging broker reachability unconfirmed, `qa_bootstrap_*` topic-cleanup 500 follow-up
ticket, real business-flow Kafka scenarios pending Manual QA/Allure cases, MR not yet confirmed
merged).

## References

None new this entry — see prior two checkpoints for TB-1354/TB-1788 and the open MR.
