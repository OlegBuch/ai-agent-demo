Story: US-01.13.02 — part of the [Currency Definition and Logic](../INDEX.md) module.
Opened: 2026-09-25. **RESOLVED same day — confirmed test bug, not a backend bug.**

## Symptom

Allure case 3110 ("Superseding order overwrites active rates for the same market/BU/pair"),
`currency-regression.spec.ts`, failed in the 2026-09-25 regression run at its own PRECONDITION step:

```
PRECONDITION: stage, authorize, and activate the initial order for this market/BU/pair
  stageAndAuthorizeOrder(...)                          -> ok
  forceCurrencyOrderScheduleTaskToFireNow(dbClient, start.toISOString())
  waitForOrderStatus(client, previousRecordId, PROCESSED)   -> resolved (order reached PROCESSED)
  waitForCurrencyRatesOrderIdForKey(dbClient, ratesKey, previousRecordId)
    -> timeout after 90s: CURRENCY.RATES rows for key
       {"CCY_MKT":"1","UNIT":"","CCY_BASE":"HLC","CCY_QUOTE":"DTJ"} currently have ORDER_ID(s): none
```

The order's own status flipped to `PROCESSED` (the test would have failed earlier, on
`waitForOrderStatus`, if it hadn't), but no `CURRENCY.RATES` row for the key ever showed this
order's `ORDER_ID`, even after the test's own `forceCurrencyOrderScheduleTaskToFireNow` workaround
and a 90s poll (`waitForCurrencyRatesOrderIdForKey`, 3s interval).

## What's already confirmed (not in question)

- The `UNIT: ''` key convention is correct for a `DIFF_UNIT: false` market (`CCY_ORDER_TEST_MARKET_ID`
  here) — `UNIT` carries no `required` constraint in either `CURRENCY.ORDER` or `CURRENCY.RATES`
  schemas (`proj-bruno-api` origin/main, `02 - Currency Seeding/05 - Update Currency Schemas/04 & 05`).
- Rate-refresh is genuinely asynchronous by design, not a bug in itself: `proj-currency-order-schedule-plugin`
  schedules a one-shot `RATE_REFRESH_JOB_ONESHOT` tied to the order's `START_DATETIME`
  (`02 - Currency Seeding/11 - Currency Scheduling/01 Bind CURRENCY.ORDER event.yml`) — this is
  exactly why the test already calls `forceCurrencyOrderScheduleTaskToFireNow` instead of waiting
  out real time.
- The test's own workaround is not new/untested — it's the established pattern this Story's other
  order-lifecycle tests already rely on.

## Open question

Does `forceCurrencyOrderScheduleTaskToFireNow` force the *same* scheduled task that both (a) flips
`CCY_ORDER_STATUS` to `PROCESSED` and (b) writes the `CURRENCY.RATES` row — or are these two
separate scheduled tasks/stages, where the helper (called once, with the order's own `start`
timestamp) only reliably forces the first? If they're one atomic job, a `PROCESSED` order with no
resulting `CURRENCY.RATES` row points at a real backend gap in the rate-write step specifically. If
they're two stages, the test's workaround is incomplete (forces only the status transition) and
needs a second force-fire call for the rate-refresh stage itself — that would make this a test gap,
not a backend bug.

**Needs**: a live check — query `scheduled_tasks` (or whatever the plugin's live task-queue table is
called) for this exact order's `previousRecordId` right after the `PROCESSED` status is observed, to
see whether a second, still-pending task exists for the rate write, or whether the write was
attempted and failed/was skipped. This module's Story doc already tracks unrelated known daemon
timing issues (see `Full_Transcript_Daemon_Currency_Sync.md`/`DaemonFlow.md` in this same folder) —
worth checking whether this is the same known class of daemon gap or a new one before treating it as
novel.

## Live diagnostic, 2026-09-25 (qa.proj.local, NOT confirmed same env as the original failure)

Ran a read-only DB diagnostic directly against this machine's `.env` target (`BASE_URL=qa.proj.local`,
`DB_HOST=10.0.130.10`) — **caveat: the original failure came from a VM run
(`vm-results-api-20260925-131424`, `run-on-vm.sh`, default `--env bankstg`), which is a different
environment than `qa.proj.local`. Nothing below is confirmed to be the same instance/DB.**

- `currency_order.schedule_task` (the table `forceCurrencyOrderScheduleTaskToFireNow` reads via
  `FIND_TASK_ID_BY_RUN_AT`) is a **single self-rescheduling recurring `REFRESH-<timestamp>` job**,
  not a per-order table — confirmed by inspecting its rows directly. On `qa.proj.local`, **the newest
  row in the entire table (any company_code) has `created_at = 2026-09-11T16:51:48Z`** — nothing has
  been inserted in 14 days as of this writing. If order-specific one-shot rate-refresh scheduling
  depends on this same recurring anchor job still being alive, a dead chain here would explain
  exactly this failure's shape (order-status transition working via some other path while rate
  refresh silently never fires again) — but this is a hypothesis pending a check on the *actual*
  environment the original failure ran on, not yet proven equivalent.
- `currency_order.schedule_task_db_scheduler` had **zero matching rows** for any of the 20 most
  recent `schedule_task` ids — i.e. nothing currently pending/tracked for those tasks either way.
- **Could not live-reproduce the original scenario from this session**: `npx playwright test
  --project=API-tests-singleton --grep "Superseding order overwrites active rates"` against
  `qa.proj.local` failed at a much earlier stage — `workerSuperAdmin` fixture setup itself got
  `403` on `SM.USER.GROUP~MAIN INPUT` while creating the test super-admin user
  (`test-user-service.ts:142` → `user-group-helper.ts:151`). This matches the pre-existing known gap
  in this project's memory (`Local .env missing Keycloak admin creds`) — this machine's local `.env`
  does not have working admin credentials for `qa.proj.local`, so nothing past worker setup could be
  exercised here, and the DB finding above could not be cross-checked against a live repro in the
  same run.

## Resolution (2026-09-25, confirmed live against `bankuat`, `.env.bankuat-local`)

The earlier `qa.proj.local` diagnostic above was against the wrong environment (a stale/unrelated
target — its `currency_order.schedule_task` recurring chain being dead there was a real but
irrelevant finding). Re-ran against `bankuat` (`DB_HOST=10.191.0.21`, `DB_NAME=proj_bankuat` — reachable
from this session, unlike `bankstg`), which is presumably what the original VM run actually targeted.
On `bankuat`:

- `currency_order.schedule_task` is alive and actively creating fresh rows (newest at time of check:
  today, `created_at` within the hour) — the scheduler/daemon mechanism itself is healthy, not stuck.
- **Direct lookup of the exact failing order (`AQA_CORD_w4_1790331173024_6ae` from the original error)
  found no order record** (already cleaned up by the test's own afterAll) **but DID find its
  `CURRENCY.RATES` row**: `id: "1..HLC.DTJ"`, `data.ORDER_ID: "AQA_CORD_w4_1790331173024_6ae"`,
  `CCY_MKT: "1"`, `CCY_BASE: "HLC"`, `CCY_QUOTE: "DTJ"` — **the rate write succeeded**. The daemon did
  its job correctly.
- **Root cause, confirmed**: `data ? 'UNIT'` on that row is `false` — the backend persists
  `CURRENCY.RATES.UNIT` as an **omitted key**, not an empty string, for a `DIFF_UNIT: false` market's
  rate row. `getCurrencyRatesOrderIdsForKey`'s jsonb containment query (`data @> {"UNIT": "", ...}`)
  requires the `UNIT` key to literally be present with value `""` — Postgres `@>` containment fails
  when the queried key is absent from the target row, so the query matched 0 rows even though the
  correct row existed the whole time. Confirmed directly: the exact query the test runs
  (`data @> '{"CCY_MKT":"1","UNIT":"","CCY_BASE":"HLC","CCY_QUOTE":"DTJ"}'`) → 0 rows; the same query
  with `UNIT` dropped entirely → 1 row, the correct one.
- This is the **exact same omitted-vs-empty pattern already known on `CURRENCY.ORDER.UNIT`**
  (TB-3588) — now confirmed to also apply on the `CURRENCY.RATES` read/query side, not just the
  `CURRENCY.ORDER` write/validation side.

**Verdict: test bug, not a backend bug.** The 90s poll in `waitForCurrencyRatesOrderIdForKey` could
never have succeeded no matter how long it waited — this wasn't a timing/daemon issue at all.

**Fixed** in `api/system_core/helpers/currency-helper.ts`'s `getCurrencyRatesOrderIdsForKey`: the
jsonb containment key now drops `UNIT` when it's an empty string (via `JSON.stringify` dropping
`undefined` values), matching how the backend actually persists it. This is a shared helper used by
~14 call sites across `currency-regression.spec.ts` (`waitForCurrencyRatesOrderIdForKey` and direct
`getCurrencyRatesOrderIdsForKey` calls) — fixed once at the source rather than per call site.
Verified live against `bankuat`: the fixed query finds the real row (`ORDER_ID` matches) that the
unfixed query missed. `tsc --noEmit` and `eslint` both clean.
