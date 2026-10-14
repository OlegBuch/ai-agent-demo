# Direct Debit Instructions (DDI) — Module Index

**TL;DR:** New module, first automated (TB-3291 smoke, TB-3292 regression, 2026-09). Core tables:
`TF.DD.MANDATE`, `TF.DD.INSTRUCTION`, `TF.DD.PARAMETER` (singleton `SYSTEM`). Execution dispatch
(US-08.04.05) is Kafka-async via an **EVENT HANDLER** plugin, a category distinct from the
platform's synchronous PRE/POST hooks — read "Patterns & Predictive Rules" below before writing or
debugging any test that polls for a dispatch/callback side effect.

## Scope

- **Mandate lifecycle** (US-08.04.02): `TF.DD.MANDATE`, self-service (0-auth) and staff (4-eyes)
  creation, amendment, closure. `DIRECTION` is schema-locked to `INWARD` only in the current scope.
- **Instruction intake** (US-08.04.03): `TF.DD.INSTRUCTION~NEW`, routes every valid submission
  straight to `INSTRUCTION_STATUS = PENDING_EXECUTION` (limit/confirmation workflow not reachable
  yet).
- **Execution routing, dispatch & callback** (US-08.04.05): On-Us (`FUNDS.TRANSFER`) vs Off-Us
  (`PAYMENT.ORDER~DDI`) routing on the mandate's bank codes, `EXECUTION_REFERENCE` capture, and the
  callback that lands `EXECUTED` / `REJECTED`.
- Out of scope for M2 (documented but not implemented): COB-driven date transitions, over-limit
  confirmation, post-execution returns (`RETURNED`), automated retry (US-08.04.06), M3 monitoring.

## Patterns & Predictive Rules

- **`EVENT HANDLER` plugins are Kafka-subscribed, not synchronous with the triggering
  request.** TI-08.04 names `DdiDispatchPlugin`, `DdiExecutionCallbackPlugin`, and
  `MandateAuthActivationPlugin` all as "EVENT HANDLER" — a third plugin category alongside the
  platform's `PRE`/`POST` hooks (`proj-context` `system-core.md` §8.3 scopes hooks strictly to
  before/after the DB write of *their own* operation; §9 names Kafka pub/sub as the *only* async
  inter-Table channel). A caller's `200 OK` on the triggering `INPUT`/`AUTH` is proof the write
  committed, **not** proof any EVENT HANDLER reacting to it has run yet. Any test (or production
  code) that reads back a field an EVENT HANDLER is expected to populate must poll for it and must
  not assume near-instant delivery — verified 2026-09-10 against `TF.DD.INSTRUCTION`'s dispatch
  (see `US-08.04.05/README.md`). Predict the same for any other EVENT HANDLER-driven field in this
  or another module (e.g. Payment Order's own "asynchronous, Kafka-bound EventExtension plugins" —
  TI-08.01) before assuming a request/response round trip is sufficient.
- **No dispatch-latency SLA is documented for M2.** US-08.04.05's own Alt 7 ("Stuck Dispatch — No
  Callback") explicitly defers "the stuck-dispatch report and its threshold" to the M3 monitoring
  contour. A test poll timeout against this dispatch today is necessarily a guess, not a value
  derived from a confirmed bound — flag it as such rather than presenting it as a validated safety
  margin, and revisit once Dev/Ops publish a real number.
- **`constants-keeper.ts` POLL blocks are copied shapes, not derived numbers.** The DDI
  `POLL.DISPATCH_TIMEOUT_MS`/`STATUS_TIMEOUT_MS` = `120_000` with intervals `[2000, 5000, 10_000]`
  is the same shape reused verbatim across unrelated modules (DM reconciliation, transfer status
  polls, idempotency). Finding the same numbers elsewhere is not corroborating evidence of a
  validated SLA for DDI specifically — check for a comment explaining *why*, and if there is none,
  treat the number as an unvalidated default.

## Story folders

| Story | Folder | Notes |
| --- | --- | --- |
| US-08.04.05 \| Smart Hybrid Execution Routing (On-Us/Off-Us) | `US-08.04.05/README.md` | ddi-smoke flakiness root-cause (2026-09-10). |
