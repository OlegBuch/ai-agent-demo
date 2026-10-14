# US-08.04.05 | Smart Hybrid Execution Routing (On-Us / Off-Us)

**TL;DR:** `ddi-smoke.spec.ts`'s `US-08.04.05 | Execution Dispatch and Callbacks` block (5 tests)
fails intermittently (3–5 of 5 per run) with `TF.DD.INSTRUCTION <id> carries an EXECUTION_REFERENCE`.
Root cause: `DdiDispatchPlugin` is a Kafka-async **EVENT HANDLER** (TI-08.04), not synchronous with
the instruction's own `INPUT` — the test's 120 s poll (`ddi-helper.ts` `waitForExecutionReference`,
`DDI_CONSTS.POLL.DISPATCH_TIMEOUT_MS`) has no documented SLA behind it (US-08.04.05's own Alt 7
defers the dispatch-stuck threshold to the M3 monitoring contour, i.e. it doesn't exist yet). In the
2026-09-10 09:29 VM run (`vm-results-api-20260910-092920`) **all 5** tests in this block failed,
each timing out at ~118 s, single-worker/sequential, zero Kafka activity logged during the wait —
the async dispatch simply hadn't landed within budget that run, this is not a test-side race or a
`fullyParallel` issue. Not confirmed to be Kafka broker/consumer trouble specifically — that's the
open question below.

## Evidence

| Fact | Source |
| --- | --- |
| Error string `"<table> <id> carries an EXECUTION_REFERENCE"` is authored test-side, the `expect.poll` failure message in `waitForRecordValue`/`waitForExecutionReference` — not a CBS API error body. | `api/transfer/helpers/ddi-helper.ts:592-619, 741-764` |
| `waitForExecutionReference` polls `SEE TF.DD.INSTRUCTION~TEST.SETUP` for up to `DISPATCH_TIMEOUT_MS` = 120 000 ms, intervals `[2000, 5000, 10000]` ms, waiting for `data.EXECUTION_REFERENCE` to become truthy. Every `SEE` call itself returned HTTP 200 in 17–121 ms — the API layer is healthy, only the field stays empty. | `api/utils/constants/constants-keeper.ts:2116-2122`; VM report Allure steps |
| Dispatch is triggered from `prepareDispatchedInstructionScenario`: create mandate → `submitInstruction` → poll. No explicit dispatch/release trigger or Kafka `send` is issued by the test itself for any of the 5 failing scenarios (only settlement-outcome tests publish to Kafka, via `reportOrderOutcome`/`reportTransferCompliance`, which is a different step later in the flow). | `api/transfer/helpers/ddi-helper.ts:828-938` |
| `DdiDispatchPlugin` is documented as an **EVENT HANDLER**, "triggers on `RECORD_CREATED` in LIV with operation = INPUT" — a different plugin category from the `PRE INPUT`/`POST INPUT` hooks used everywhere else in the same spec (e.g. `MandateVerificationPlugin`). | Confluence TI-08.04 "Execution routing, dispatch and callback" (page 1590624257) |
| Platform architecture: hooks (`PRE`/`POST`) only run synchronously around their own operation's DB write; Kafka pub/sub is the platform's only asynchronous inter-Table channel. | `proj-context` `references/system-core.md` §8.3, §9 |
| US-08.04.05 Alt 7 ("Stuck Dispatch — No Callback"): "No callback arrives within the operational threshold... The stuck-dispatch report and its threshold are part of the M3 monitoring contour." No numeric SLA exists yet for M2. | Confluence US-08.04.05 (page 1601208321), Alt 7 |
| VM run `vm-results-api-20260910-092920`: 11 tests, 1 worker, 0 retries, 6 passed / 5 failed. All 5 failures are contiguous, all in this describe block, all with the identical `waitForExecutionReference` timeout shape, back-to-back with no idle gap between them. | `vm-results-api-20260910-092920/run.log`, `allure-report/` |
| `DISPATCH_TIMEOUT_MS`/`STATUS_TIMEOUT_MS` = `120_000` with `[2000,5000,10_000]` intervals is the same shape reused across unrelated modules (DM reconciliation, transfer/status polls) — no comment ties it to a measured DDI dispatch latency. | `api/utils/constants/constants-keeper.ts:1096-1122, 1683-1690, 1887-1899, 2116-2122` |

## What this rules out

- **Not `fullyParallel`/shared-`beforeAll` re-run** — the `API-tests` Playwright project already
  overrides `workers: 1` / `fullyParallel: false`; the VM run confirms strictly sequential
  single-worker execution.
- **Not the TB-3291 mandate-account seeding change** (`6784db26`) — that seeding is memoized once
  per file run and unrelated to the dispatch wait.
- **Not a client-side bug in the poll helper** — every `SEE` call inside the poll succeeded fast;
  the helper is polling correctly, the field just isn't populated yet.

## What to ask Dev, and the argument for each

| Ask | Argument to hand Dev (so they don't have to dig) |
| --- | --- |
| What's the expected/typical latency (p50/p99) between `TF.DD.INSTRUCTION` `INPUT` committing to LIV and `DdiDispatchPlugin` stamping `EXECUTION_REFERENCE`? Is there a real SLA anywhere, even an informal one? | TI-08.04 documents `DdiDispatchPlugin` as an **EVENT HANDLER** ("triggers on `RECORD_CREATED` in LIV"), not a `PRE`/`POST` hook — per the platform's own architecture doc, only Kafka pub/sub is async between Tables, so this genuinely doesn't run in the request/response cycle of the `INPUT` call. AQA's poll timeout (currently 200 s, was 120 s) is a number nobody derived from a measured value — it's the same generic `[timeout, intervals]` shape copied across 5+ unrelated modules. We need a real number to test against, or confirmation there isn't one yet. |
| Is a numeric "stuck dispatch" threshold planned for M2, or is it genuinely M3-only as the Story states? | US-08.04.05's own Alt 7 says the threshold is "part of the M3 monitoring contour" — i.e. the spec itself says this isn't defined yet. Worth double-checking that's still accurate before we design tests/alerting around "no answer yet." |
| Was bankstg's Kafka broker/consumer group under unusual load on 2026-09-10 around 09:18–09:29 (the run window) — a neighboring suite running concurrently, consumer lag, a rebalance, GC pause? | All 5 failing tests in that run timed out at ~118 s each, back-to-back, single worker, zero retries — a systemic slowdown across the whole run, not one unlucky test. That shape points at something environment-wide (broker/consumer-side) rather than per-instruction variance, but AQA has no visibility into Kafka-side logs/metrics to confirm it. |
| Does `DdiDispatchPlugin`'s event consumption have any batching/polling delay by design (e.g. a scheduled outbox publisher, like the one documented for Table Registry's own k8s control loop), or is publish-on-commit immediate and only consumer-side processing adds latency? | Matters for tuning: a fixed batching interval means the timeout should be "N cycles + margin," a variable consumer-lag issue means it should be based on a measured percentile instead. Right now AQA doesn't know which model applies here, so 200 s is still a guess, just a bigger one. |

**One-line summary you can paste to Dev, if useful:** "ddi-smoke's dispatch-dependent tests wait on `EXECUTION_REFERENCE` appearing after instruction submission — TI-08.04 says that's an async `EVENT HANDLER` (Kafka), not something the `INPUT` response guarantees. We're seeing runs where it doesn't land within 120s (now testing 200s) — is there a real expected latency for this, and was anything unusual happening on Kafka during our 2026-09-10 09:18–09:29 run on bankstg?"

Until answered, treat `DISPATCH_TIMEOUT_MS` as an unvalidated guess, not a safety margin — raising
it blindly would mask a genuine backend regression just as easily as it would fix an
under-provisioned timeout.

## 2026-09-10 update — timeout raised as an experiment, not a fix

`DISPATCH_TIMEOUT_MS` raised `120_000` → `200_000` (`constants-keeper.ts:2117`) at the user's
request, to see whether the observed ~118 s stalls clear a wider budget. `STATUS_TIMEOUT_MS` (the
later `EXECUTED`-transition wait, same `DdiExecutionCallbackPlugin` EVENT HANDLER architecture) was
left untouched — no failing test in the 2026-09-10 09:29 run reached that wait. This does not
answer either open question above; if the underlying dispatch latency is a genuine backend
regression rather than headroom, this change only pushes the failure further out or hides it.
Re-run and observe before treating this as resolved.

**Result: still failing at 200 s too** (confirmed by the user same day). This rules out "just needed
a bit more margin" — `EXECUTION_REFERENCE` is not landing even within a 200 s window on at least
some runs, which points away from a merely-tight timeout and toward either a genuinely stuck/dead
dispatch (the event never gets consumed at all for that instruction) or real infra trouble on the
Kafka side (broker, consumer group, topic) rather than ordinary processing latency. Reverting or
keeping 200 s doesn't matter much at this point — the fix isn't a bigger number. Escalation is
shifting from Dev (business logic/SLA) to DevOps (Kafka/broker/consumer health on bankstg) — the
"What to ask" table above should be read with that framing: the broker/consumer-load question is
now the primary one, not a side check.

## 2026-09-11 update — reproduced on the exact 3 On-Us/Off-Us cases, records preserved this time

Ran only the 3 dispatch-routing cases (Allure 3013, 3014, 3024 — lines 228, 254, 279) on bankstg via
`run-on-vm.sh api` with `PRESERVE_LOCAL_GROUP_FOR_DEBUG=true` (`vm-results-api-20260911-134723`, run
window 11:41:09–11:47:21Z). **All 3 failed, identical shape to 2026-09-10**: `expect.poll` on
`EXECUTION_REFERENCE` timed out (~2.0 m each, i.e. the current `DISPATCH_TIMEOUT_MS`), same error
string, same single-worker/sequential/back-to-back pattern, zero change from the prior finding. This
is the same open issue, not a new one — nothing here should reopen the "what's the cause" question,
it's additional occurrence evidence.

New this run: cleanup was skipped (`ddi-helper.ts`'s `console.table` addition, see
`common-issues/infra-and-environment/local-cleanup-vs-preserve-debug-flag.md`), so for the first time
the actual stuck `TF.DD.MANDATE`/`TF.DD.INSTRUCTION` records from a failing run survive on bankstg for
Dev/DevOps to inspect directly instead of only having log timestamps:

| Allure # | Test | TF.DD.MANDATE id | TF.DD.INSTRUCTION id |
| --- | --- | --- | --- |
| 3013 | On-Us / FUNDS.TRANSFER routing | `AQA_AQA.DD.MANDATE_1789126883073_abd` | `AQA_AQA.DD.INSTRUCTION_1789126883557_b37` |
| 3014 | Off-Us / DEBTOR_BANK_CODE routing | `AQA_AQA.DD.MANDATE_1789127002796_d83` | `AQA_AQA.DD.INSTRUCTION_1789127003277_d5d` |
| 3024 | Off-Us / collection-claim dispatch | `AQA_AQA.DD.MANDATE_1789127122384_517` | `AQA_AQA.DD.INSTRUCTION_1789127122813_aaa` |

These 3 `TF.DD.INSTRUCTION` records are live on bankstg right now, each stuck with no
`EXECUTION_REFERENCE` — exactly the artifact DevOps would need to trace the Kafka consumer side
(topic/partition, consumer-group lag, whether the `RECORD_CREATED` event was even published) instead
of reasoning from timestamps alone. Worth attaching to the same escalation as the one-line summary
above rather than opening a new thread — this is the same root question, now with inspectable
evidence.

**Full artifact inventory for this run**, since only the DDI records are affected by
`PRESERVE_LOCAL_GROUP_FOR_DEBUG` — everything else follows its own, separate lifecycle:

| Artifact | Id | Survives? |
| --- | --- | --- |
| Global table group | name `AQA-LOCAL-GROUP-1789126871313-227`, id `6245` | Yes — `LOCAL_CLEANUP=false` also skipped `resource-tracker`'s global sweep this run ("Skipping global resource cleanup to preserve schemas for local group reuse") |
| Run-scoped super-admin Keycloak user | `userId=804a6723-a925-45e6-8849-607938b47a33`, `username=aqa_admin_1789126871341_7b4`, realm `bankstg` | **No** — `global-teardown.ts` deletes this one unconditionally regardless of either flag (already the known gap, see `common-issues/infra-and-environment/local-cleanup-vs-preserve-debug-flag.md` point 3); gone by 11:47:21Z |
| Any other throwaway Keycloak user (checker/no-permission role) | — | Not applicable — none of these 3 tests call `resolveCheckerClient`/`resolveNoPermissionClient` |
| Downstream engine record (`FUNDS.TRANSFER`/`ORDER`) | — | Never created — the poll timed out before dispatch produced one, so there is nothing beyond MANDATE + INSTRUCTION to hand Dev for any of the 3 |
