Story: US-01.13.02 (TB-1988) — part of the [Currency Definition and Logic](../INDEX.md) module.
Last updated: 2026-08-21

**Re-verified 2026-08-21** against this Story's dedicated Confluence page in full (`bank-proj`,
pageId `1529872386`, v1.1) per the mandatory 5-step flow now codified in
`commands/team/fullstack-aqa-agent.md` — Step 4 verdict: this file already correctly captured
every discrepancy the fresh read surfaced (one-pair-per-order, the 5-min-vs-3600s time-lag
mismatch, AC5/Alt1's daemon-time-vs-INPUT-time distinction, the CANCELLED-only-while-NEW lifecycle)
**except** the SOURCE_SYSTEM/REUTERS point folded into the data model below — no other changes
needed, no re-automation required. `UNIT_INCLUDE` cascading to child Business Units (AC2) remains
untestable for the same reason noted in the module INDEX (`BUSINESS.UNIT` doesn't exist on this
environment) — not a new finding, just confirmed still true.

Read the module [INDEX.md](../INDEX.md) first for module-wide facts (BUSINESS.UNIT scope, the
never-hardcode-a-currency-id rule, shared test-data helpers). This file covers only what's specific
to `CURRENCY.ORDER~MASTER`/`CURRENCY.RATES~MASTER` and the daemon.

---

## Data model (confirmed against `proj-bruno-api` `origin/main` directly — always `git fetch`
first, local `main` runs hundreds of commits behind)

### CURRENCY.ORDER~MASTER
```
CCY_ORDER_STATUS   enum NEW | PROCESSED | CANCELLED | ERROR
SOURCE_SYSTEM      VIRTUAL_TABLE -> CurrencyRatesSourceSystem (only seeded value on QA: "TEFO";
                   the Story's own text explicitly names "REUTERS, BLOOMBERG, MANUAL" as intended
                   examples — REUTERS is spec-valid, just unseeded on this environment, not a
                   fictional value. Confirmed 2026-08-21: `git grep -il reuters` across every
                   remote branch of `proj-bruno-api` finds nothing, and a direct
                   `virtual_table.liv` query + a live probe POST both confirm only TEFO is
                   registered — `400 "... Allowed: [TEFO]"`. Real seed-data gap, not a QA-case
                   error; automated tests use TEFO because it's the only value that will actually
                   pass here today.)
CCY_MKT            LINKED_TABLE -> CURRENCY.MARKET
START_DATETIME     DATE_TIME
END_DATETIME       DATE_TIME
UNIT               ALPHANUMERIC
UNIT_INCLUDE       BOOLEAN
CCY_BASE           LINKED_TABLE -> CURRENCY   (scalar — exactly ONE pair per order, see below re TC-10)
CCY_QUOTE          LINKED_TABLE -> CURRENCY   (scalar)
RATE_BANDS[]       { AMT_FROM (AMOUNT), RATE_TYPE (enum BID|ASK|MID), RATE_VALUE (RATE) }, minItems 1
```
- `authOperationRequired: true` — INPUT stages a NAU draft; a separate `AUTH` call is required to
  make it LIV. **AUTH must be done by a different user than the one who INPUT-ed it** (4-eyes; the
  API's own error is `"Authorisation denied: Inputter and Authoriser must be different"`, 403). See
  "AUTH / 4-eyes pattern" below for exactly how this repo's tests satisfy that. For the general
  `authOperationRequired` rule (which tables need this at all), see
  [`common-issues/auth-operation-required.md`](../../../common-issues/auth-operation-required.md).
- Three hooks are bound on `~MASTER` (confirmed 2026-08-21 via a fresh `origin/main` fetch of
  `09 Bind CURRENCY.ORDER~MASTER hooks.yml` — **corrects an earlier, wrong claim that the cutoff
  plugin was AUTH-only**): `proj-currency-order-validation-plugin` on `INPUT`/`PRE`
  (`executionOrder: 1`, validates the START/END datetime range and the schema-level enum/
  required-field checks), `proj-currency-order-cutoff-plugin` on `INPUT`/`PRE` (`executionOrder: 2`,
  rejects a `START_DATETIME` inside the time-lag buffer immediately at `INPUT` — nothing is ever
  staged), and the same `proj-currency-order-cutoff-plugin` again on `AUTH`/`PRE`
  (`executionOrder: 1`, re-reads the buffer at authorization time for the case where enough time
  passed between `INPUT` and `AUTH` to fall inside it). AC7's "an administrator attempts to submit
  or schedule... THEN the system rejects the transaction" wording matches the `INPUT`-side check
  directly — see TC-13 in `docs/test-cases/TB-1988/coverage-gap-analysis.md` §0.3.
- Status-changing is **not** a separate endpoint — there is no PATCH/CANCEL operation anywhere in
  this system. A "status change" is a second `INPUT` on the same `recordId` with a different
  `CCY_ORDER_STATUS`, followed by another `AUTH` (by the checker user again) to commit it. This is
  confirmed working live (manual QA verified via a raw request on a call, 2026-08-18): resubmitting
  NEW→CANCELLED via INPUT is accepted.
- Lifecycle (confirmed by the user from the Story, 2026-08-18): `NEW` is the only state the daemon
  polls. `NEW → PROCESSED` (daemon activation) / `NEW → ERROR` (ACID rollback during daemon unpack)
  / `NEW → CANCELLED` (manual, only while still NEW). `PROCESSED`/`ERROR`/`CANCELLED` are terminal —
  no further status change is allowed once reached.
- `CURRENCY_STATUSES` constant added to `proj-test-automation`'s `constants-keeper.ts`
  (`TEST_CONSTS.CURRENCY_STATUSES.{NEW,PROCESSED,CANCELLED,ERROR}`) — use it instead of a literal
  string wherever `CCY_ORDER_STATUS` is set or asserted.

### CURRENCY.RATES~MASTER
`ORDER_ID` (LINKED_TABLE -> CURRENCY.ORDER), `CCY_MKT`, `UNIT`, `START_DATETIME`, `END_DATETIME`,
`CCY_BASE`, `CCY_QUOTE`, `RATE_BANDS[]` (same shape as ORDER). `authOperationRequired: false`.
**This is a SYS table — direct `INPUT` from an API client is rejected with `403 "INPUT operation is
not allowed for SYS table 'CURRENCY.RATES'"` (confirmed live).** The only way data ever gets into
this table is the daemon (see below). There is no seeding backdoor, no `~SEEDING` projection exists
on `origin/main` despite an earlier (wrong) research-pass claim that one did.
**STALE as of 2026-08-25 — corrected below.** ~~`proj-currency-rates-expiry-plugin` is bound on
`SEE`/`POST` — reads with `END_DATETIME` in the past are rejected at read-time (lazy guard), not
actively purged by a batch job.~~ `proj-bruno-api` commit `f416c646` (Ilona Fralova, 2026-08-25,
"TB-3132: stop binding the currency rates expiry hook") **removed this hook entirely** — the plugin
upload step and its hook-binding request were both deleted from the seeding collection, replaced
with an empty-array unbind. New confirmed behavior, straight from that commit's own message: *"A SEE
now returns a rate record whatever its END_DATETIME... proj-currency-engine skips an expired record
during resolution."* Expiry enforcement moved from this table's own read-time hook to
`proj-currency-engine`'s resolve-time filtering — see the "Live-diagnosed" entry in the pass log below
for how this was rediscovered live (a 22-attempt, then a 24h-margin, poll of `SEE` on a
raw-SQL-expired row that never once rejected).

---

## The daemon — CORRECTION 2026-08-19: it is live on `qa.proj.local`, not "out of scope"

**Everything below this line up to the next `---` was wrong.** Direct DB inspection on
`qa.proj.local` (2026-08-19, read-only, via `createDbClient()`) shows the daemon is deployed and
actively running, contradicting the "structural, we don't control time, not automatable" verdict
recorded earlier the same day. What's actually there:

- `currency_order.schedule_signal_binding` has one row: `signal = 'RATE_REFRESH_JOB_ONESHOT'`,
  `plugin.id = 'proj-currency-rates-refresh-plugin'` — the refresh plugin **is** uploaded; the
  earlier "no schedule/refresh plugin in Bruno's Plugins Setup" check was looking in the wrong
  place (Bruno's static collection, not the live DB).
- `currency_order.schedule_task` (app-level) has one recurring row (`DAILY-RATE-REFRESH`,
  `cron: '0 0 2 * * *'`) **plus one `REFRESH-<ISO timestamp>` one-shot row per staged order**,
  `one_shot_run_at` = that order's own `START_DATETIME` (not a fixed 1-minute poll of all NEW
  orders as previously assumed — it's a discrete per-order timer).
- `currency_order.schedule_task_db_scheduler` is the underlying Java `db-scheduler` library table
  driving actual execution. It has a `task_instance = 'recurring'` row that is **firing and
  succeeding roughly every 30 seconds right now** (`last_success` populated, ticking forward each
  poll, `consecutive_failures: 0`) — this is the live poller. Each staged order additionally gets
  its own one-shot row, `task_instance = 'CURRENCY.ORDER::<id>'` — **`<id>` is
  `currency_order.schedule_task.id` (the app-level scheduling row's own PK, confirmed by matching
  `one_shot_run_at`/`payload` timestamps against a real order's `START_DATETIME`), NOT the order
  record's own `seq_no`** (`currency_order_mock.liv.seq_no` is a separate, unrelated counter — do
  not assume they're the same number). `execution_time` = the order's `START_DATETIME`. As of this
  check, 58 such rows existed, none yet overdue (every test
  order so far was staged with a `START_DATETIME` far enough in the future — mostly `now + 24h` —
  that none has come due), so there is still no *direct* evidence of a successful `CURRENCY.ORDER`
  one-shot firing end-to-end (recurring poller success ≠ proof an order-specific row was ever
  processed) — but the recurring poller alone is enough to disprove "nothing runs."

**Implication for TC-02/TC-06/TC-07/TC-18**: these are very likely automatable now, two ways:
1. **Real-time wait**: stage an order with `START_DATETIME` just past `CCY_ORDER_CUTOFF` (3600s) +
   a small margin, then poll `CURRENCY.RATES`/order status for up to ~1hr+30s. Correct but slow —
   not fit for a per-PR gate, could work as a separate long-running/nightly test.
2. **DB-accelerated firing** (not yet done, needs explicit sign-off before writing): after staging
   and authorizing the order via the API (as today), directly `UPDATE
   currency_order.schedule_task_db_scheduler SET execution_time = now() WHERE task_instance =
   'CURRENCY.ORDER::<seqNo>'` for that order's own row, then poll for the ~30s recurring cycle to
   pick it up. This has **not been validated end-to-end** (no confirmed case yet of a
   `CURRENCY.ORDER::N` one-shot actually completing) and touches a shared, live scheduler table on
   `qa.proj.local` — a materially new test technique for this suite, not merely new test data. Get
   the record's own DB `seq_no` (not the business `recordId`) for the `task_instance` match, e.g.
   from `currency_order_mock.liv`/`.nau`'s own sequence column — not yet confirmed which column.

Original (now superseded) claim, kept for context: "The daemon is a backend-only scheduled
mechanism (per the team chat, 2026-08-10: polls every 1 minute for `CCY_ORDER_STATUS = NEW` orders
whose `START_DATETIME` has been reached, in ascending `START_DATETIME` then `DATE_TIME` order, then
writes to `CURRENCY.RATES` under one ACID transaction). We do not test it, by explicit user
decision (2026-08-18) — it's an automatic, backend-internal mechanism with no test-triggerable
hook..." — the bolded conclusion just above corrects this; the underlying DB evidence is real,
re-verify the "confirmed firing" gap before fully unblocking these 4 cases.

Implementing ticket: **TB-2027** ("Implements scheduler + event pushing") — still **In Code Review**
as of 2026-08-18 09:55 (17 MRs across 5 repos, none resolved), yet the scheduling mechanism is
demonstrably live on this environment regardless of the ticket's Jira status — another instance of
"don't assume ticket status reflects `qa.proj.local`'s actual state" (see the Jira snapshot section
below). A related, separate ticket **TB-2026** ("manual update actual exchange rates by Treasury in
CURRENCY.RATES") is also In Code Review — this is likely what a dev meant by "everything's done
except rates" (2026-08-18); it is not actually done either, and does not add a test-trigger for the
daemon regardless.

---

## Story text vs. real implementation — confirmed discrepancies

- **HTTP status codes**: the pasted/Allure test-case text for US-01.13.02 uses `422` throughout for
  every INPUT-level rejection (missing SOURCE_SYSTEM, invalid RATE_TYPE, START_DATETIME in the past,
  invalid date window). **Bruno's own INPUT-rejection examples all confirm 400**, not 422 — same
  "Bruno beats Allure ER text" pattern already seen on the CURRENCY table (US-01.13.01).
- **Time-lag buffer value — RESOLVED 2026-08-21**: the Story (Confluence, US-01.13.02) says "5
  minutes" twice (Happy Path step 6, AC7 verbatim). The deployed `SYSTEM.PARAMETER.CCY_ORDER_CUTOFF`
  was **3600 seconds (1 hour)** through 2026-08-20 (TB-2961's original Done value) — a real
  Story-vs-environment mismatch at the time. **This has since been corrected to 300 seconds (5
  minutes)**, independently re-confirmed by a direct read-only query against `system_parameter.liv`
  on `qa.proj.local` (2026-08-21): `data.CCY_ORDER_CUTOFF = "300"`. `TEST_CONSTS.
  CCY_ORDER_CUTOFF_SECONDS`, TC-13 (now single `400` + exact message, literal "2 minutes"), and
  TC-20 (literal "6 minutes") were all updated to match — no more hedge, no more magnitude
  mismatch. See `docs/test-cases/TB-1988/coverage-gap-analysis.md` §0.2 for the full history.
- **TC-10 ("reject order with 2 currency pairs")**: structurally impossible, not a gap. The team
  chat (2026-07-22/23) shows they explicitly designed and then rejected a nested `CURRENCY_PAIRS[]`
  array (`TableJsonSchemaValidator`: "nested groups are not allowed") — the shipped schema has
  scalar `CCY_BASE`/`CCY_QUOTE`, exactly one pair per order, on purpose. The EP-01.13 Epic page
  (Confluence, still as of a 2026-08-18 edit) contradicts this ("a single CURRENCY.ORDER record
  accommodates multiple currency pairs") — that's a stale Epic page, not evidence the restriction
  is wrong; Story-level text + Bruno + the chat all agree with "one pair."
- **AC5/Alt1 ("one corrupted tier rolls back the whole order")**: the Story's own text frames this
  as a **daemon-time** ACID rollback ("WHEN the daemon attempts to unpack and save the data..."),
  and its "corrupted currency code within a tier" premise doesn't map onto the real `RATE_BANDS`
  shape (no currency code field per-tier — another leftover of the rejected `CURRENCY_PAIRS`
  design). What was automated as TC-08 for a while was a real, different, already-implemented
  guarantee instead: `proj-currency-order-validation-plugin` rejects the whole INPUT (400, nothing
  persisted) when one tier has an invalid `RATE_TYPE`. That's a legitimate atomicity proof at the
  INPUT layer, but it does **not** prove the Story's literal daemon-time AC5 — and shipping it as
  `Automated` while it silently proved the opposite of AC5's own "STATUS -> ERROR" post-condition
  was judged the wrong call (2026-08-21) and the test was **removed from the suite** rather than
  kept with a caveat. TC-08 is currently `Not Automatable`, with no test in `currency-regression.spec.ts`
  — see `docs/test-cases/TB-1988/coverage-gap-analysis.md` for the full reasoning.
- **DECIMALS_NAME vs NO_OF_DECIMALS immutability**: not this story's table — see
  [US-01.13.01](../US-01.13.01/README.md#incident-the-no_of_decimalsusd-collision-2026-08-18-fully-resolved)
  for the full incident.
- **TC-19 ("adapter without ESB permission")**: the 2026-08-18 conclusion ("no permission model
  documented") was stale. **TB-2025** ("Batch INPUT endpoint") is **Done** and its AC states
  outright that the batch endpoint is used by CURRENCY.ORDER for EP-01.13, and that a user without
  INPUT rights on the projection is rejected at the mesh boundary before reaching
  `proj-table-template`. Bruno confirms `CURRENCY.ORDER~BATCH` exists (`authOperationRequired:
  false`, path `.../records/operations/INPUT/batch`). Automated 2026-08-19 against that endpoint
  with the same unprivileged-token pattern used elsewhere in this suite (US-01.13.01's
  `allureCaseId(2269)`). Lesson: re-verify a "blocked, no model documented" conclusion against
  Jira/Bruno again in a later session before repeating it — a ticket can ship quietly between
  sessions and resolve what a prior summary recorded as an open blocker.

---

## AUTH / 4-eyes pattern for CURRENCY.ORDER specifically

`CURRENCY.ORDER~MASTER` needs a genuinely different user for `AUTH` than the one that did `INPUT`,
**and** that second user needs an actual table-level permission grant — logging in as them is not
enough (`403 "User does not have access to table: CURRENCY.ORDER"` otherwise). The working recipe
(mirrors `table-registry-helper.ts`'s `setupFinTableWithFourEyes`, generalized in
`grantCheckerAccessToCurrencyOrder`):

1. `INPUT` + `AUTH` a `SM.USER.GROUP~MAIN` record with `PERMISSIONS: [{TABLE: 'CURRENCY.ORDER',
   FUNCTION: 'ALL'}]`.
2. `INPUT` + `AUTH` a `SM.USER~INTERNAL` record for `USERS_DATA.CHECKER_USER.ID` setting `GROUPS:
   [thatGroupId]` (plus the boilerplate `COMPANY_CODES`/`LANGUAGE_ID`/`START_DATE`/`END_DATE`/
   `ALLOWED_DAYS`/`START_TIME`/`END_TIME` fields the endpoint requires — see the helper for the
   exact shape).

   **Careful**: `SM.USER.GROUP~MAIN` and `SM.USER~INTERNAL` are themselves `authOperationRequired:
   false` — step 1 and step 2's "AUTH" here really means "INPUT commits straight to LIV, no
   separate AUTH call exists for these two projections." See
   [`common-issues/auth-operation-required.md`](../../../common-issues/auth-operation-required.md)
   before copying an `INPUT`-then-`AUTH` shape onto either of them elsewhere.
3. **Wait for propagation** — granting the permission does not take effect instantly. The helper
   polls a disposable probe order's real `AUTH` call every 2s for up to 30s until it stops
   returning 403. Don't skip this; a bare retry-on-login (as some other suites do) doesn't actually
   verify the *table* permission synced, only that login itself succeeded.
4. Use the resulting `checkerClient` for every `AUTH` call on `CURRENCY.ORDER`; keep the regular
   `client`/`setupClient` (default company user) for every `INPUT`/`SEE`.

---

## Full transcript pass (`Full_Transcript_Daemon_Currency_Sync.md`) — new findings beyond the summary

- **Open risk for TC-13/TC-20 (cutoff buffer)**: on the recording, Artur himself was uncertain
  whether the time-lag/cutoff is even configured on this environment right now — verbatim (13:46–
  13:55): *"лаг не настроен еще... не знаю, или его нет в параметрах, он может по параметрам не
  настроен, не могу пока сказать... это нужно будет с Элоной уточнить."* This is the implementing
  developer, live, saying the AUTH-time cutoff enforcement itself might not be active — a stronger
  and more direct signal than the earlier "TB-2977 In testing" ticket-status caveat. **If TC-13
  fails with AUTH returning 200** (order authorizes despite being inside the buffer) instead of
  400/403, that is NOT a test bug and NOT necessarily a product bug either — it may mean the cutoff
  simply isn't wired up on `qa.proj.local` yet. Don't "fix" TC-13 by loosening it further; escalate to
  confirm with a dev (Elona per the transcript) whether the plugin is deployed on this environment
  before treating a red run as either a regression or a flaky test.
- **Direct developer confirmation of the TC-16/TC-17 guard's intent** (02:15–02:32, verbatim):
  *"апдейтятся записи только со статусом NEW. Если эта запись ERROR, CANCELLED или PROCESSED... то
  ее уже апдейтить нельзя, должна выпадать ошибка. Если можно — это баг."* — direct, first-party
  confirmation that only `NEW` orders are updatable and any update attempt on a terminal status must
  error; strengthens confidence in TC-16/TC-17 beyond the Bruno-script confirmation already cited.
- **Batch vs Master, confirmed by demo, not just inference**: Artur first sent a Master (manual)
  order — `schedule_task` row appeared but stayed unexecuted because the record sat in `NAU`
  (unauthorized). He then switched to the Batch projection (skips auth, straight to `LIV`) purely
  for demo convenience — not because Master doesn't work, just faster to demonstrate. Our tests use
  the Master path (`stageAndAuthorizeOrder`) correctly, since we do complete the AUTH step before
  forcing the schedule to fire.
- **Currency Engine / transit-currency business rules — full detail for whichever Story eventually
  covers this** (this module's own TC-02..TC-21 do **not** include it; captured here only so a
  future session doesn't have to re-derive it from the recording):
  - Fallback chain when no direct rate exists: (1) if the request explicitly names a transit
    currency, convert through it (source→transit, then transit→target); (2) else look at
    `COMPANY.MANDATORY_TRIANGULATION` — if `true`, convert only through `COMPANY.TRIANGULATION_CURRENCY`
    (this is mandatory when the flag is true — the field can never be empty in that case, per Artur:
    *"MANDATORY_TRIANGULATION когда true, TRIANGULATION_CURRENCY должна быть всегда абсолютно"*);
    (3) else try `COMPANY.TRIANGULATION_CURRENCY` if set, whether or not it's mandatory; (4) else try
    the company's local currency; (5) else try `SYSTEM.PARAMETER.DEFAULT_GLOBAL_CURRENCY`; (6) if
    none of these resolve a rate, error ("rate not found").
  - **Explicit negative rule**: if `MANDATORY_TRIANGULATION = true` and the request itself also
    specifies a transit currency, that must be **rejected as an error** — you may not name your own
    transit currency when the company enforces one (26:25–26:46).
  - If the transit currency itself equals one of the pair's own currencies (e.g., converting BYN→RUB
    with transit=BYN), that transit is skipped as redundant, not treated as valid (21:53–22:08).
  - The engine also gates on `RATE_BANDS[].AMT_FROM`: querying an amount below every band's
    threshold for the requested `RATE_TYPE` yields "Rate not found" even if a rate exists for a
    higher `AMT_FROM` (19:27–19:53) — a boundary condition worth its own test case on that Story.
  - The dev team (Artur/Viktoryia) explicitly flagged transit-currency test coverage as needing
    **real bank rate data for a specific date** to validate triangulated output against a known-good
    external calculation — not just internal self-consistency — and offered a dedicated working
    session once this module's automation reaches that Story.

---

## Dev sync confirmation (`CurrencyFlow-Meet.md`, 2026-08-19 recording w/ Artur Fonichkin)

A cleaner transcript of the same call as `DaemonFlow.md`/the Gemini notes, and it confirms the DB
findings above directly from the implementing developer:
- **`schedule_task` is created immediately at LIV-arrival time, authorized or not** — Artur
  demoed a Master (manual) order: the `schedule_task` row appears right away, but at its scheduled
  time the plugin does nothing (stays `null`/no-op) because the order is still in `NAU`, not `LIV`
  (not yet authorized). A Batch order (goes straight to `LIV`, no AUTH needed) fires correctly and
  produces rows in `currency_rates_mock`. **Implication for our tests**: `forceCurrencyOrderScheduleTaskToFireNow`
  must only be called *after* `AUTH` has succeeded (which is what `stageAndAuthorizeOrder` already
  does before it in TC-02/TC-06/TC-18) — forcing it early on a still-`NAU` order would silently no-op,
  not error.
- Confirms the exact flow already reverse-engineered from the DB: `LIV` → Kafka event →
  `schedule_task` (UTC) → at trigger time, plugin fetches `NEW` records for that time → fetches
  rates → `CURRENCY.RATES` write + status → `PROCESSED`. Records in `ERROR`/`CANCELLED` are skipped
  by the plugin.
- **Separate, out-of-scope-for-US-01.13.02 feature surfaced in the same call**: a downstream
  "Currency Engine" (Spring Boot service, not part of `proj-table-template`) does cross-rate
  **triangulation** — `COMPANY.MANDATORY_TRIANGULATION` (bool) / `COMPANY.TRIANGULATION_CURRENCY`
  (ISO code) drive whether/which transit currency bridges a rate lookup when no direct rate exists,
  falling back to a system-level `DEFAULT_GLOBAL_CURRENCY` parameter if unset and not mandatory.
  This belongs to a different Story (not TB-1988/US-01.13.02's TC-02..TC-21 list) — noted here only
  so a future session doesn't rediscover it from scratch; do not fold triangulation test cases into
  this module's automation without a corresponding Manual QA test case for that Story.

---

## Full DB schema map for this module (confirmed live on `qa.proj.local`, read-only introspection, 2026-08-19)

Four table-template schemas exist for this module: `currency`, `currency_market`, `currency_order`,
`currency_rates`. Each one has a **definition schema** (the bare name, e.g. `currency_order`) holding
the table's own metadata, plus one **record-space schema per company** (`<name>_mock`,
`<name>_mock_1`) holding the actual `LIV`/`NAU`/`HIS` rows. `currency_market` additionally gets a
`_mock`/`_mock_1` pair even though it wasn't listed with one at first glance — confirmed present.

**Definition schema tables** (`currency`, `currency_market`, `currency_order`, `currency_rates` —
identical set except where noted):
- `table_def`, `projection_def`, `projection_hooks`, `projection_associations`, `enquiry_def`,
  `rule` — the table-template's own metadata about this table's shape/behavior (schema, hooks,
  enquiries, business rules). Framework scaffolding, not test-relevant directly.
- `event_binding`, `event_emission_setting`, `processed_event`, `outbox` — this table's Kafka event
  wiring + outbox pattern for reliable emission (relevant to any future "did an event fire" check).
  Note: `outbox` only appears under the `_mock`/`_mock_1` record-space schemas below, not here.
- `schedule_signal_binding`, `schedule_task` — generic scheduling scaffolding present on **every**
  table-template table (confirmed also present on `currency`/`currency_market`/`currency_rates`,
  not unique to orders) — binds a named signal to a plugin id, and holds the app-level schedule
  entries (`cron` recurring rows + `one_shot_run_at` one-shot rows per staged record where
  applicable).
- `schedule_task_db_scheduler` — **only present under `currency_order`**, not under `currency`/
  `currency_market`/`currency_rates`. This is the one actually-wired-up daemon for this module — see
  the daemon section above. Its presence here (and absence elsewhere) confirms `CURRENCY.ORDER` is
  the only one of these four tables with a live scheduled background processor.
- `databasechangelog`/`databasechangeloglock` — Liquibase's own bookkeeping, not test-relevant.

**Record-space schemas** (`<name>_mock`, `<name>_mock_1` — one pair per company, `currency_order`'s
pair also has a plain `currency_order` variant seen without the mock suffix in some listings; always
resolve the real one via `companyScopedSchema()`/`findTableSchemas()`, never assume the suffix):
- `liv`/`nau`/`his` — the record spaces per [[proj-context]] conventions (Live/Not-yet-AUthorized/
  HIStory). `currency_market_mock`/`currency_rates_mock` additionally have `nau` per the listing
  (expected, since both are `authOperationRequired` in at least one direction) — **`currency_market`
  is `nau`-bearing too**, re-check that assumption if a market-specific test ever needs its NAU
  space.
- `duplicate_config`/`duplicate_registry` — functional-duplicate-detection scaffolding (see
  [[project_tb-1860-source-ref-jsonb-not-array]] for `duplicate_registry.source_ref`'s real jsonb
  shape if this table's uniqueness rules are ever tested).
- `record_id_sequence`, `record_lock`, `override_session` — table-template's own ID generation/
  locking/4-eyes-override bookkeeping. Not something tests read directly today.

Practical takeaway: nothing here changes any test already written, but confirms (a) the record-space
schema names already used in this suite (`companyScopedSchema('currency_order')` /
`companyScopedSchema('currency_rates')`) are correct and complete, and (b) `schedule_task_db_scheduler`
is the only module-specific extension beyond generic table-template scaffolding.

---

## Jira ticket snapshot (re-checked live 2026-08-19 — re-check again before trusting if this file is stale)

| Ticket | What | Status |
|---|---|---|
| TB-1988 | Story card, US-01.13.02 | Done (requirements accepted; says nothing about implementation) |
| TB-2027 | Scheduler/daemon → CURRENCY.RATES | In Code Review (unchanged since 2026-08-18) |
| TB-2026 | Manual Treasury rate update in CURRENCY.RATES | In Code Review (unchanged since 2026-08-18) |
| TB-2025 | Batch INPUT endpoint (`.../records/operations/INPUT/batch`) | **Done** — unblocks TC-19, see below |
| TB-2968 | Validate CCY_ORDER_STATUS transitions | Code Review |
| TB-3042 | Reject INPUT on existing order whose status != NEW | In progress (unchanged since 2026-08-18) |
| TB-2977 | AUTH-time hook vs CCY_ORDER_CUTOFF | In testing (unchanged since 2026-08-18) |
| TB-2961 | SYSTEM.PARAMETER.CCY_ORDER_CUTOFF (mandatory, seconds) | Done |
| TB-2969 | Validate START_DATETIME < END_DATETIME | Done |
| TB-2970 | RECORD_CREATED/UPDATED event emission (LIV only) | Done |
| TB-2489 | Split CURRENCY.ORDER~MASTER into manual/bulk projections | In Code Review |
| TB-2979 | Extend immutability to DECIMALS_NAME/PRECIOUS_METAL | In testing |
| TB-1351 | Immutability of NUMERIC_CODE/NO_OF_DECIMALS/QUOTATION_CODE/INTEREST_DAY_BASIS | Done |
| TB-2934 | Design investigation: urgent manual currency rate updates via CURRENCY.ORDER | Done (design/investigation doc only, no AC/impl) |
| TB-2344 | BUSINESS.UNIT hierarchy fallback (SEE pre-hook) | Ready for development, paused (M3) |
| TB-2980 | RATE_BANDS amount ranges gated by market's DIFF_AMT | **Closed 2026-08-24** — confirmed live/enforced on `qa.proj.local` 2026-08-26: broke `currency-smoke.spec.ts`'s `allureCaseId(3094)` test (staged 3 BID/ASK/MID rows against `DIFF_AMT: false` market `'1'`, previously tolerated). See `INDEX.md`'s Patterns & Predictive Rules for the exact gate behavior (counts array rows, not unique `AMT_FROM`) and the fix. |

None of the still-open tickets above being "In Code Review"/"In testing"/"In progress" means the
behavior is unmerged **on the environment we test against** — don't assume a colleague's "it works"
report from a different branch/local build reflects `qa.proj.local`'s current state; re-verify live
if a decision hinges on it (this is exactly how the NO_OF_DECIMALS incident on US-01.13.01
happened).

---

## Automation status (19 pasted cases TC-01, TC-02, TC-05..TC-21)

**2026-09-02 — 4 of the 5 new Allure cases automated, 1 blocked on a real contract conflict.**
Ran the mandatory 5-step flow (Confluence pageId 1529872386 re-read fresh — confirmed **zero
mention of `DIFF_UNIT`/`DIFF_AMT` anywhere on the page**, so these cases test behavior undocumented
at Story level; `proj-bruno-api` `origin/main` re-fetched — `DIFF_AMT` is fully documented/tested
there, `DIFF_UNIT`-on-`UNIT`-rejection is still undocumented in Bruno, consistent with the
"in-progress rollout" note below). Written into `currency-regression.spec.ts`:
- **3437** (rate stored with an empty Business-Unit segment, `1..<base>.<quote>`) — automated,
  high confidence: the composite key naturally reflects `UNIT: ''` on INPUT via the same
  `Market.Unit.Base.Quote` builder already asserted elsewhere in this suite (see line ~1194).
- **3438** (`UNIT` rejected when `DIFF_UNIT=false`) — automated using the exact live-confirmed
  message text already in this file: `"UNIT must be empty because market <id> does not
  differentiate by Business Unit (DIFF_UNIT is false)"`.
- **3439** (multi-band order rejected when `DIFF_AMT=false`) — automated, asserting the rejection
  names both `RATE_BANDS` and `DIFF_AMT`, per the Bruno-documented test file's own confirmed wording.
- **3441** (single band `AMT_FROM=0`, no `UNIT`, accepted) — automated, matches the established
  `DIFF_AMT=false` pattern in the module `INDEX.md` exactly.
- **3440** (single band with `AMT_FROM<>0` rejected when `DIFF_AMT=false`) — **automated 2026-09-02
  per the user's explicit instruction, after independently re-confirming the case's real Steps/ER
  via `testops_find_testcases(expand:["scenario"])` (not just title/precondition — the
  `/testcase/{id}/scenario` REST endpoint used earlier in this session returned an empty step tree
  for all 15 new cases; the MCP tool's `scenario` expand reads it correctly).** The case's own ER
  is explicit and unambiguous: `"HTTP 4xx; rejected because with DIFF_AMT=false the single band
  must start from 0 (AMT_FROM=0)."` — this **directly contradicts** the module's own previously
  confirmed Pattern rule above (TB-2980/Bruno: "a market with `DIFF_AMT: false` accepts exactly one
  `RATE_BANDS` row, full stop", silent on `AMT_FROM`'s value). Test asserts `400` only (no message
  text asserted — the case's ER is Manual QA's own paraphrase, not a quoted system string, so
  nothing to assert on). **If this test fails live, that is the expected/informative outcome of an
  open conflict, not a test bug** — it means the Pattern rule needs revisiting with BA/Dev, not
  that the assertion is wrong.

**Automated: 18 of 19 (pre-existing 19-case sheet, excludes the 5 new Allure-only cases above).** TC-08 is `Not Automatable` (removed from the suite 2026-08-21 — see
below). TC-01 was added 2026-08-21 in `currency-smoke.spec.ts` (`allureCaseId(2405)`, not yet run
live — see `docs/test-cases/TB-1988/coverage-gap-analysis.md` for its own finding: `SOURCE_SYSTEM`
uses `TEFO` not the pasted `REUTERS`, same confirmed seed-data gap as everywhere else in this
Story, and asserts `200` not the pasted `201/202`, same systemic status-code pattern as TC-20
below). The other 17 (TC-02, TC-05, TC-06, TC-07, TC-09, TC-10, TC-11, TC-12, TC-13, TC-14, TC-15,
TC-16, TC-17, TC-18, TC-19, TC-20, TC-21) are in `currency-regression.spec.ts` (ordered ascending
by TC number inside the `US-01.13.02` describe block; repeated stage/authorize/advance-status steps
factored into `stageAndAuthorizeOrder`/`advanceOrderToStatus` in `currency-helper.ts`). Caveats that
still apply to specific cases in that set:
- **TC-02/TC-06/TC-18** — unblocked 2026-08-19 via the DB-acceleration technique documented in the
  daemon section above (`forceCurrencyOrderScheduleTaskToFireNow`): stage+authorize as usual, then
  directly move the order's own `schedule_task_db_scheduler.execution_time` to `now()` so the live
  ~30s poller picks it up immediately instead of waiting for the real `START_DATETIME`. This was a
  user-approved, deliberate new technique for this suite (writes to a shared, live scheduler table
  on `qa.proj.local`) — **not yet confirmed to pass on a live run** (written and statically verified
  — tsc/eslint/prettier clean — but not executed; this repo's convention is the user runs tests
  manually, see `feedback_never-run-tests` in `proj-test-automation`'s memory). If any of these three
  go red, first suspect the acceleration mechanism itself (task-id lookup miss, timing race with the
  ~30s poll) before assuming a product regression.
- **TC-08** — **removed from the suite 2026-08-21.** Had briefly proven a real, different guarantee
  than the Story's literal AC5/Alt1 (see above), not a daemon-time ACID rollback — shipping that as
  `Automated` instead of escalating first was flagged as the wrong call, so it was deleted rather
  than kept with a caveat. See `docs/test-cases/TB-1988/coverage-gap-analysis.md` for the full
  writeup and the lesson learned.
- **TC-10** — only proves array-vs-scalar type rejection, not a dedicated "one pair per order" rule
  (structurally impossible to test the literal premise — see above).
- **TC-13/TC-20** — hedge the AUTH-rejection status as `[400, 403]` rather than asserting one fixed
  code, pending TB-2977.
- **TC-16/TC-17** — assert `400` (`HTTP_STATUS.BAD_REQUEST`), confirmed correct against
  `proj-bruno-api`'s own `INPUT - Reject PROCESSED/ERROR To CANCELLED.yml` test scripts — **not**
  `409` (an earlier same-day note claiming "assert 409 hard" was itself stale and has been
  corrected). The rejection-body assertion checks three separate substrings
  (`CCY_ORDER_STATUS`/`PROCESSED-or-ERROR`/`CANCELLED`), matching Bruno's own check, rather than one
  brittle composed phrase.
- **TC-19** — uses a real (not garbage-string) Keycloak service-account token that is validly
  authenticated but carries no CBS table grant, matching TB-2025's AC ("rejected at the mesh
  boundary") more faithfully than a malformed-JWT rejection would. **Registered in Allure TestOps
  2026-08-25** (id 3104), linked via `allureCaseId(3104)` in `currency-regression.spec.ts`.
- **Allure coverage audit, 2026-08-25**: re-checked every TC-02..TC-21 test in
  `currency-regression.spec.ts` (plus TC-01 in `currency-smoke.spec.ts`) for a linked
  `allureCaseId`. **16 of 18 already had one** (TC-01=2405, TC-02=2696, TC-05=2697, TC-06=2698,
  TC-07=2706, TC-09=2832, TC-10=2839, TC-11=2737, TC-12=2747, TC-14=2858, TC-15=2861, TC-16=2862,
  TC-17=2889, TC-20=2752, TC-21=2753) — an earlier note in this file claiming only TC-01 existed in
  Allure was **wrong**, based on an incomplete name-search; corrected here. Only **TC-13** and
  **TC-18** genuinely had no Allure case — created 2026-08-25: TC-13 → id 3109 ("Reject
  START_DATETIME inside the CCY_ORDER_CUTOFF buffer at INPUT"), TC-18 → id 3110 ("Superseding order
  overwrites active rates for the same market/BU/pair"), both linked via `allureCaseId`. TC-08
  remains without a case — `Not Automatable`, removed from the suite, no case needed. **All 18
  automated TC-02..TC-21 cases (plus TC-01) now have an Allure case + `allureCaseId` link.**
  Naming convention confirmed with the user: once a test carries `allureCaseId(...)`, its `test()`
  name string drops the `TC-N: ` prefix (the Allure id is the identifier now) — applied to TC-13/
  TC-18/TC-19's names accordingly.
- **TC-05** — also confirms `CURRENCY.RATES` has no row for the order yet (DB `COUNT_BY_DATA_FIELD`
  on `ORDER_ID`), not just that `CCY_ORDER_STATUS` echoes back what was submitted.
- **TC-26 (from the US-01.13.03 sheet), moved in 2026-08-26.** Not one of this Story's own 19 pasted
  cases — it was originally written under US-01.13.03's `test.describe` block (per that sheet's own
  numbering) but actually validates a CURRENCY.ORDER INPUT rejection, i.e. this Story's concern.
  Manual QA's own Allure case (id 3170) has `Story = "Asynchronous Rate Order Staging, Validation,
  and Scheduling"`, confirming the original placement was wrong. Moved into this `describe` block,
  renamed to the Allure case's own title ("Reject currency rate creation/update when RATE_BANDS
  contains duplicate (AMT_FROM, RATE_TYPE) combinations"), and linked via `allureCaseId(3170)` — see
  [[../US-01.13.03/README.md]] for the removal note on that side.

**TC-07 automated 2026-08-19 (later pass)** — with an important constraint discovered along the way:
**`END_DATETIME` can never be reached by real wall-clock waiting without also waiting out the
~1h `CCY_ORDER_CUTOFF`**, because `END_DATETIME` must be `> START_DATETIME` (TC-21's own rule) and
`START_DATETIME` must already be `>= now + CCY_ORDER_CUTOFF` to pass AUTH (TC-13/TC-20) — so a real
end-to-end wait for expiry is >1h regardless of the `forceCurrencyOrderScheduleTaskToFireNow` trick
(that trick only skips the scheduler's wait for `START_DATETIME`, it can't move `END_DATETIME`
itself). Implemented instead by directly patching the flattened `CURRENCY.RATES` row's own
`END_DATETIME` field in the DB to a few minutes in the past right after activation (see
`setCurrencyRatesEndDatetime` in `currency-helper.ts`), then asserting a `SEE` on that row is
rejected (`status !== 200`) rather than served as a valid rate — the actual business invariant
("traders cannot transact on stale prices"), without pinning to one specific unconfirmed HTTP code.
**Deliberately does NOT assert the row is physically deleted** (the pasted TC's literal "purged
(deleted) from the cache" wording) — no scheduled job exists for `currency_rates` (confirmed: it has
no `schedule_task_db_scheduler`, unlike `currency_order`), so nothing would proactively delete a row
just because its `END_DATETIME` field was patched; the standing theory (`proj-currency-rates-expiry-plugin`
is a lazy read-time reject, not an active purge) is very likely still correct, but the test instead
just **logs** whether the row still physically exists after the SEE call (`currencyRatesRowExists`)
for a human to observe on the first live run — if it turns out to be deleted, that's a signal to
promote this to a hard assertion and drop this caveat; if it's still present (expected), that's the
pasted TC's wording needing a Manual QA correction, not a code fix. **Not yet run live** (DB access
was intermittently unreachable — `ETIMEDOUT` to `10.0.130.10:5432` — during this specific pass; only
statically verified via tsc/eslint/prettier).

## Coverage-completion pass (2026-08-19, later still) — closing gaps found by the TC-by-TC audit

After auditing every automated test against its pasted TC's literal wording (ignoring HTTP status
code, per the user's explicit framing), fixed what was fixable without inventing anything unconfirmed:
- **TC-02** — now asserts the CURRENCY.RATES row's own id contains the market/base/quote key parts
  (a hedged proxy for the literal `MM.UUUUUUU.USD.EUR` composite-PK claim, since the exact separator/
  field-order was never confirmed via a live `id` value — DB access was down for this pass). **Event
  emission (`CURRENCY.RATES.ACTIVATED`) is still NOT verified** — no Kafka/outbox consumption exists
  in this test framework, the exact event name is never mentioned anywhere in the dev-sync transcript
  (only generic `RECORD_CREATED`/`UPDATED` per TB-2970), and guessing at an outbox table shape without
  DB access would be exactly the kind of unconfirmed invention this role is supposed to avoid. Needs
  Bruno/dev confirmation of the real event name and a Kafka test-consumer building block before this
  can be closed.
- **TC-06** — now also does a real `SEE` call against `CURRENCY.RATES~MASTER` for the activated row,
  proving "queryable" via the API, not just "exists in the DB".
- **TC-07** — upgraded from a soft diagnostic log to a **hard assertion** that the expired row is
  actually deleted (`waitForCurrencyRatesRowDeleted`, up to 60s), matching the pasted TC's literal
  "purged (deleted)" wording. Given the architecture evidence (no `schedule_task_db_scheduler` for
  `currency_rates`), this assertion may well fail on the first live run — that failure is itself the
  useful signal (confirms which of the two theories is correct) rather than something to soften away
  pre-emptively.
- **TC-15** — added a step that force-fires the schedule task after cancellation and confirms the
  order stays `CANCELLED` (not promoted to `PROCESSED`) and no `CURRENCY.RATES` row appears — a real
  proof of "daemon ignores it during the polling cycle," previously untested in either direction.
- **TC-16** — precondition swapped from an artificial direct `CCY_ORDER_STATUS=PROCESSED` INPUT to a
  **genuine** daemon-processed `PROCESSED` order (stage → authorize → force-fire → wait for
  `PROCESSED`, the same real mechanism as TC-02/06/18) — no longer faking the precondition.
- **TC-19** — added a `SEE` check confirming the rejected batch order was never staged (`404`),
  matching the pasted TC's "order not staged" clause, previously unchecked.
- **TC-21** — added the same "nothing staged" `SEE` check for both sub-cases (equal / earlier
  `END_DATETIME`), matching the pasted TC's "nothing staged in CURRENCY.ORDER" clause.

**Left open — architecturally can't be forced without guessing or fabricating, escalate to Manual QA
for a wording/spec decision rather than faked in code:**
- **TC-08** — the literal "corrupted currency code within a tier" has no field to express it
  (`RATE_BANDS` carries no per-tier currency code — confirmed via team-chat research) and the Story
  frames this as a *daemon-time* ACID rollback (`STATUS -> ERROR`), while the only real, confirmed
  guarantee is an INPUT-time schema rejection (nothing ever created). No known way to make the daemon
  itself fail mid-flatten without inventing an unconfirmed corruption vector. **Update 2026-08-21**:
  this was briefly automated anyway (an INPUT-time-rejection test standing in for AC5's daemon-time
  claim) and then removed once that was judged the wrong call — see
  `docs/test-cases/TB-1988/coverage-gap-analysis.md`. It is `Not Automatable` today, not merely
  "left open with a caveat."
- **TC-10** — structurally impossible per the shipped schema (scalar `CCY_BASE`/`CCY_QUOTE`, one pair
  by design, per the 2026-07-22/23 team chat rejecting a nested `CURRENCY_PAIRS[]` array). Testing "2
  pairs" literally isn't representable in this data model.
- **TC-13** — confirmed real system behavior enforces the cutoff at `AUTH`, not `INPUT`, so asserting
  the pasted TC's literal "reject at POST" would just be **wrong** about the real system, not a gap to
  close. Also carries the open risk (from the full call transcript) that the cutoff plugin might not
  even be configured on this environment right now.
- **TC-17** — same "artificial precondition" limitation as TC-16 had, but **not fixed**: there's no
  confirmed way to make an order reach `ERROR` via a genuine daemon-time failure (same missing
  corruption-vector problem as TC-08) — the precondition still force-sets `CCY_ORDER_STATUS=ERROR`
  directly via INPUT rather than through a real failure.
- **TC-10/TC-11/TC-12/TC-13/TC-14/TC-21** — none assert the pasted TC's literal error-message text
  (e.g. "Untraceable rate feed ignored", "START_DATETIME violates the configured execution lag
  buffer"). Only TC-16/TC-17's message assertions are Bruno-confirmed; inventing exact-phrase
  assertions for the rest without an equivalent Bruno/live confirmation would risk tests failing for
  the wrong reason (wording mismatch, not a real behavior regression) — deliberately left unasserted
  pending that confirmation.

Full reasoning/citations for the original 2026-08-18 baseline: see the session's chat history in
`proj-test-automation` on `group-3/TB-2960`. This file is the durable summary, kept in sync as of
2026-08-19; re-derive from Jira/Bruno/Confluence directly if a specific ticket's status needs
re-checking before acting on it.

---

## First live run, 2026-08-19 — root-caused and fixed (8 of 18 red)

The DB-acceleration technique above was confirmed **not** a product regression: every failure had a
test-code root cause, found via `git show origin/main:<path>` against `proj-bruno-api` and a live
error-body read, not guessed.

- **TC-02/TC-06/TC-07/TC-15/TC-16/TC-18 — `forceCurrencyOrderScheduleTaskToFireNow` "no row found"**.
  Root cause: `FIND_TASK_ID_BY_RUN_AT` did an exact `one_shot_run_at = $1::timestamptz` match, but
  the order's `START_DATETIME` is submitted truncated to whole seconds
  (`start.toISOString().slice(0, 19)`) while every call site passed the untruncated
  `start.toISOString()` (sub-second fraction included) as the lookup key — an instant up to 999ms
  away from what the daemon actually stored, so the exact-equality lookup always missed. **Not a
  timing race, not an acceleration-mechanism flaw** — the mechanism itself (confirmed live and
  described above) is sound. Fixed at the root in `db-query-keeper.ts`'s
  `CURRENCY_ORDER_SCHEDULE.FIND_TASK_ID_BY_RUN_AT`: compare `date_trunc('second', one_shot_run_at) =
  date_trunc('second', $1::timestamptz)` instead of exact equality, so the 7 call sites in
  `currency-regression.spec.ts` didn't need touching individually.
- **TC-16/TC-17 — rejection-body assertion expected "CANCELLED" (the attempted target status) in the
  error text.** The "Bruno-confirmed" claim earlier in this file was checked against the wrong
  endpoint: Bruno's `INPUT - Reject ERROR To CANCELLED.yml` / `INPUT - Reject PROCESSED To
  CANCELLED.yml` post to `CURRENCY.ORDER~BATCH`, but this suite's TC-16/TC-17 post to
  `CURRENCY.ORDER~MASTER` (`CURRENCY_ORDER_PROJECTION_ID`) — no Bruno file exercises that rejection
  on `~MASTER`. The live `~MASTER` error body (confirmed 2026-08-19) is `"order <id> is ERROR - only
  an order with CCY_ORDER_STATUS NEW can be changed"` — it names the field and the **current**
  status only, never the attempted target. Loosened both assertions to
  `['CCY_ORDER_STATUS', 'PROCESSED']` / `['CCY_ORDER_STATUS', 'ERROR']`, dropping `'CANCELLED'`. The
  `400` status-code assertion was already correct and unchanged. If `~MASTER`'s message format is
  later confirmed to also echo the target status, this can be tightened back up.
- **TC-19 — reverted the "real Keycloak service-account token" design back to the plain
  `Bearer invalid_or_unprivileged_token` pattern** (same as this file's `US-01.13.01`
  `allureCaseId(2269)` test). The 2026-08-19 "more faithful to TB-2025's AC" rewrite called
  `getKeycloakServiceAccountToken`, which requires `KEYCLOAK_ADMIN_CLIENT_ID`/`KEYCLOAK_CLIENT_SECRET`
  — per `auth-service.ts`'s own doc comment, that confidential client is "used exclusively by the
  Keycloak Admin API user-management helpers," a Keycloak-realm-admin credential, not a
  business/ESB-caller credential — and those two env vars are blank in this environment's `.env`
  (`.env.example` documents them as optional/admin-only). The rewrite was never actually confirmed to
  pass live (unlike TC-02/06/07/18, this bullet previously carried no "not yet run" caveat, which in
  hindsight was the gap). Reverted; TC-19 still targets `CURRENCY.ORDER~BATCH`'s
  `.../INPUT/batch` endpoint per TB-2025's AC, only the credential-acquisition mechanism changed
  back.
- **Confirmed correct, left unchanged**: TC-05, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, TC-14,
  TC-20, TC-21 all passed on this same run.

**TC-19 — RESOLVED for real, 2026-08-21.** Manual QA provided a dedicated SM.USER authZ
test-fixture doc (six accounts, two per INTERNAL/EXTERNAL/SYSTEM classification, one full-perm and
one zero-perm each) specifically for this kind of test. A first pass wired TC-19 to a new
`proj-sms-test-system-none` client_credentials client matching that doc — then the user pointed out
this repo already has an equivalent fixture (`USERS_DATA.USER_WITHOUT_PERM`, username `NO_perm`,
already used elsewhere in this suite for the same "authenticated but no permission" scenario).
TC-19 now authenticates via `createAuthenticatedApiContext` with
`USERS_DATA.USER_WITHOUT_PERM.CREDENTIALS` (username/password) instead — a genuinely authenticated
caller with zero table grants, matching the pasted precondition exactly, reusing an established
fixture rather than a new client/secret. Status assertion is a single `403 Forbidden` (not a
`[401,403]` hedge) — see `docs/test-cases/TB-1988/coverage-gap-analysis.md` for why.

---

## Second live run, 2026-08-20 — CORRECTION: it *was* partly a timing race after all

The `date_trunc('second', ...)` fix above was necessary but **not sufficient**. A fresh live run on
2026-08-20 still showed 6 of 18 red, with the exact same two error shapes as before, now on
different orders/timestamps:
- TC-02/TC-06/TC-18 — `forceCurrencyOrderScheduleTaskToFireNow` still threw "No
  `currency_order.schedule_task` row found with `one_shot_run_at` = ..." immediately after
  `stageAndAuthorizeOrder` returned.
- TC-07/TC-15/TC-16 — got past the `schedule_task` lookup (taskId found) but then threw "No
  `currency_order.schedule_task_db_scheduler` row found for `task_instance`
  `CURRENCY.ORDER::<id>`".

Root cause (no live DB access this pass — reasoned from this file's own "The daemon" section plus
the failure pattern, not re-guessed from scratch): both rows are created **asynchronously** after
`AUTH` commits the order to `LIV` — "`LIV` → Kafka event → `schedule_task`" per the dev-sync
confirmation above, and `schedule_task_db_scheduler`'s own one-shot row is registered as a
separate step after that. `forceCurrencyOrderScheduleTaskToFireNow` ran each lookup exactly once,
immediately after `stageAndAuthorizeOrder` resolved, with no allowance for that propagation lag —
the same class of race this suite already handles elsewhere via `pollUntilReady`/`waitForRecord`
(e.g. `grantCheckerAccessToCurrencyOrder`'s 30s/2s poll for the CHECKER_USER permission grant to
propagate). The previous "Not a timing race, not an acceleration-mechanism flaw" conclusion above
was wrong — it correctly found *a* real bug (the sub-second truncation mismatch) but that masked
this second, genuine race underneath it, which only became visible once the first bug stopped
firing on every run.

**Fix (2026-08-20, `currency-helper.ts`)**: `forceCurrencyOrderScheduleTaskToFireNow` now polls
(via the existing `pollUntilReady` helper, 1s interval, 30s default timeout, overridable via a new
optional third parameter) for the `schedule_task` row first, then polls again for the
`schedule_task_db_scheduler` UPDATE to affect a row, instead of a single one-shot query for either.
No call-site changes needed in `currency-regression.spec.ts` (same pattern as the previous fix —
fixed once at the helper). **Not yet run live** — statically verified only (`tsc`/`eslint`/
`prettier` clean), per this repo's convention that the user runs tests manually. If TC-02/06/07/
15/16/18 still go red after this, first suspect the 30s timeout being too short for this
environment's actual Kafka/scheduler propagation lag (bump it) before suspecting the polling
mechanism itself.

---

## Third live run, 2026-08-20 (same day, later pass) — polling fix confirmed live, two more findings

The polling fix above **did work**: TC-02/TC-06/TC-15 (previously red on "no row found") passed on
this run. But this run surfaced 3 new/different failures — not a second instance of the same bug,
three unrelated things the polling fix exposed by letting execution get further than before:

- **TC-16 — same `schedule_task_db_scheduler` "no row found" error, still red.** Not a
  regression from the polling fix itself (the fix *is* polling correctly — the `schedule_task` half
  found `taskId=133` fine); the 30s window for the *second* poll (`schedule_task_db_scheduler`) was
  simply too tight for this specific attempt. Consistent with "The daemon" section above: the
  recurring poller's own cycle runs roughly every ~30s, and the one-shot `db_scheduler` bookkeeping
  row for a brand-new task may only get registered on that same cadence — a 30s wait can land just
  on the wrong side of that cycle. **Fix**: bumped the function's default `maxWaitMs` from 30s to
  60s (one full cycle of margin). No dev-confirmed SLA exists for this latency; if TC-16 (or any
  other force-fire caller) still times out occasionally, that's the number to revisit next, not the
  polling mechanism itself.
- **TC-07 STEP 3 ("purged (deleted) from CURRENCY.RATES") — now actually ran (previously always
  died earlier in the PRECONDITION) and failed exactly as the 2026-08-19 "coverage-completion pass"
  entry above predicted it might**: the expired row was confirmed still present after 60s of
  polling. This is the "if it's still present (expected), that's the pasted TC's wording needing a
  Manual QA correction, not a code fix" branch of that earlier note, now with live confirmation
  behind it rather than architecture-inference alone. **Reverted** the hard "must be deleted"
  assertion back to a soft diagnostic `console.log` (the real business invariant — SEE rejects the
  expired row — stays a hard assertion in STEP 2, unchanged). **Open item for Manual QA**: the
  pasted TC-07 text's "purged (deleted) from the cache" wording does not match confirmed live
  behavior (no purge job exists for `currency_rates`); needs a wording correction on the Allure
  case, not further automation effort.
- **TC-17 — new failure, `createDedicatedCurrency` got a 400 "NUMERIC_CODE is immutable once the
  currency record is authorised" instead of the intended numeric-code-collision retry.** Root
  cause, found by tracing *why* TC-17's own dedicated currencies differ from every other TC's
  shared `baseCurrencyId`/`quoteCurrencyId` pair even though nothing in TC-17's own code creates
  new ones: **Playwright restarts the worker process after every test failure** (documented
  Playwright behavior, distinct from the `fullyParallel` issue in `playwright.config.ts`'s own
  comment) — each restart reruns this describe's `beforeAll` in the new worker, which calls
  `createDedicatedCurrency` twice more. Confirmed directly from this run's own cleanup logs: a
  fresh currency pair (and a fresh `CCY_ORDER_CHECKER` group) appears after every failing test
  (TC-07 → `KNR`/`ABY` cleaned up, TC-16 → `EOU`/`JWT` cleaned up), each is a brand-new `beforeAll`
  invocation for the worker that runs the remaining tests. This is expected/by-design Playwright
  isolation, not a bug to remove — but it does mean `createDedicatedCurrency` gets called far more
  often across a run with several failures than the "twice per suite" the code was written to
  expect, raising the odds of drawing an already-used 3-letter id (`generateRandomCurrencyId`'s
  space is only 26³ = 17,576, and unlike the `AQA_*`-prefixed helpers elsewhere in this suite, it
  has no timestamp/run-scoped component — can't add one either, since `CURRENCY` ids are
  business-constrained to exactly 3 characters). The actual collision was almost certainly against
  a residual currency record left behind by some earlier interrupted/crashed run on this shared
  `qa.proj.local` environment (a worker-restart's own `afterAll` cleans up what *that* worker
  created, but can't know about ids orphaned by a run that never reached its `afterAll` at all —
  e.g. a Ctrl+C, timeout, or crash on a previous session). **Fix**: broadened
  `isNumericCodeCollision` (renamed `isRetryableCurrencyIdCollision`) to retry on *any* field-level
  error message containing `"immutable"`, not only the original `NUMERIC_CODE ... already held by
  currency` text — a same-recordId collision against an already-authorised record surfaces as an
  immutability error on whichever field happens to differ (`NUMERIC_CODE` here, could as easily be
  `DECIMALS_NAME`/`PRECIOUS_METAL` per the US-01.13.01 immutability incident), not always that exact
  phrase. Still bounded by the existing `MAX_NUMERIC_CODE_COLLISION_RETRIES = 10` attempts.

**Not yet re-run live after these three fixes** — statically verified only
(`tsc`/`eslint`/`prettier` clean). Worth noting for whoever reads this next: because Playwright
restarts the worker on any failure, a single flaky test anywhere in this 18-test file can still
cascade into "did not run" for every test after it in the same file (this run lost TC-18/19/20/21
that way after TC-17 hard-failed) — that cascade is a consequence of the worker-restart-on-failure
behavior above, not a new independent bug, and isn't something this suite's code can prevent.

## Fourth live run, 2026-08-26 — "Expired rate is rejected via the read-time post-hook but is never
physically purged" (allureCaseId 2706) fails on its own PRECONDITION — ROOT-CAUSED, test bug, not a
product defect

Right after staging/authorizing/activating a fresh order (so its rate lands in `CURRENCY.RATES`),
the PRECONDITION step asserts the just-created row is **not yet** present in `HIS` — and finds it
already there. First seen with `1.IWV.IWV.TNA`; reproduced again on a later, cleaner run (only the 4
ticket-confirmed failures plus this one — TC-22/TC-27/TC-29/TC-30 all passed that time, confirming
those *were* the worker-restart cascade guessed below, and this one is not) with a completely
different pair, `1.YSK.YSK.KNR`. Reproducing across two unrelated runs and two unrelated currency
pairs ruled out both explanations originally guessed here — the real mechanism is simpler and is in
this describe block's own fixture design:

- `baseCurrencyId`/`quoteCurrencyId` (line ~1016 in `currency-regression.spec.ts`) are minted **once**
  in this describe's `beforeAll` and shared by every test in the block via `buildOrderData()`'s
  defaults — including the `beforeAll` itself (line 1025, staging a checker-grant order) and several
  tests that run *before* this one in file order (lines 1079, 1143, 1177), none of which override
  `CCY_BASE`/`CCY_QUOTE`/`UNIT`. Every one of those stages and activates a new order for the exact
  same `CCY_MKT.UNIT.CCY_BASE.CCY_QUOTE` natural key — i.e. the same `currency_rates` row `id`.
- `CURRENCY.RATES` rows are versioned by `(id, seq_no)`: activating a new order for an `id` that
  already has a live version moves the *previous* `seq_no` into `HIS` — this is the normal,
  documented mechanism this same test's own STEP 3 correctly describes ("HIS entries come from
  normal versioning when a newer rate overwrites this one"). By the time this test's own
  PRECONDITION runs, several earlier tests have already done exactly that to the shared pair.
- The PRECONDITION's check, `currencyRatesRowExistsInSpace(dbClient, ratesRowId, TableSpace.HIS)`,
  queries `SELECT id FROM ...his WHERE id = $1` — by `id` only, with no `seq_no`/freshness filter (see
  `DB_QUERIES.RECORD_SPACE.EXISTS`/`ROWS_BY_ID` in `db-query-keeper.ts`). So it can never
  distinguish "this id's *current* version is in HIS" (would be a real bug) from "this id has *any*
  prior version in HIS from normal supersession" (expected, benign, and already true before this
  test even starts) — it always returns `true` once ≥2 orders have ever been activated for the
  shared pair, regardless of expiry.
- This also explains why it passed in the three earlier live runs: per the Third live run's own
  finding above, a worker restart re-runs `beforeAll` and mints a **fresh** pair with zero prior
  history — if a restart happened to land shortly before this test in an earlier run, it got a clean
  pair by luck. Nothing about the assertion itself changed; only how much prior versioning the
  shared pair had already accumulated when this test happened to run.

**Not a product defect — no Jira ticket needed.** This is an assertion in the test itself checking
the wrong thing (id-ever-versioned instead of current-version-not-yet-expired), made order-dependent
by sharing one currency pair across ~20 tests in the block.

**Fixed, 2026-08-26**: this one test now mints its own dedicated `createDedicatedCurrency` base/quote
pair in a new PRECONDITION step, instead of the describe block's shared `baseCurrencyId`/
`quoteCurrencyId`, and passes it explicitly to `buildOrderData({ CCY_BASE, CCY_QUOTE, UNIT, ... })`.
Its `CURRENCY.RATES` id now has no prior version to have been pushed into `HIS` by an earlier
sibling test, so the "not yet in HIS" check is measuring what it always meant to. `tsc`/`eslint`/
`prettier` clean; not yet re-run live. The other ~19 tests in this block still intentionally share
the one `baseCurrencyId`/`quoteCurrencyId` pair (that's fine for them — none of the others assert an
`HIS`-absence invariant that a sibling's normal versioning would falsify) — this fix is scoped to
just the one test that needed it, not a describe-wide fixture change.

---

## Sixth live run, 2026-08-26 (later same day) — full regression block, 18 failed, root-caused into
5 distinct causes, 4 fixed

Followed the clean re-run this session already asked for (see the "Fourth/Fifth live run" notes
above). Full 18-failure list root-caused via code/git-history/Bruno reading (no live DB access this
pass). Grouped by cause:

- **RATE_VALUE silently rounded to the currency's own `NO_OF_DECIMALS` at `CURRENCY.ORDER` INPUT —
  confirmed intended design, not a bug.** Every literal `RATE_VALUE` with more decimals than its
  currency's `NO_OF_DECIMALS` (default 2, from `buildStandardCurrencyInputData`) round-trips rounded
  (`'1.0850'`→`'1.09'` etc., round-half-up) — matches this same file's already-cited TB-3277
  confirmation (Mikalai Yudzilevich, chat 2026-08-24/25 — see `US-01.13.03/README.md`'s "Real
  implementation" section): *"input scale should equal the currency's own NO_OF_DECIMALS"*. This
  single root cause explained 7 of the 18 failures, several two steps removed from where it looked
  like a fresh bug:
  - "Order flattening..." (2696) and "MID-only order is valid" (2832) used the describe-level shared
    `baseCurrencyId`/`quoteCurrencyId` pair (`NO_OF_DECIMALS: 2` default) with 4-decimal literals.
    **Fixed**: both now mint their own dedicated pair with `NO_OF_DECIMALS: 4`.
  - "Expired rate is rejected..." (2706) — its dedicated pair (from the Fourth-live-run fix above)
    also defaulted to `NO_OF_DECIMALS: 2`. **Fixed**: added `NO_OF_DECIMALS: 4`. Its own STEP 2
    failure (SEE returning 200 on an expired row instead of being rejected) is unrelated to this and
    stays **open** — see below.
  - "Cancel an order while in NEW status" (2861) and "Block cancellation of an ERROR order" (2889) —
    `advanceOrderToStatus` resubmits the order's full `orderData` (including its original
    4-decimal `RATE_BANDS`) when changing status; the backend compares that against the
    *already-rounded* stored value, sees a diff, and rejects with `"RATE_BANDS cannot change while
    CCY_ORDER_STATUS moves to X"`. **Fixed**: both now pin `RATE_BANDS` to a 2-decimal literal
    (`'1.09'`) that survives the shared pair's default rounding unchanged, so the resubmission is a
    true no-op diff.
  - Two triangulation tests in `US-01.13.03` (TC-10's `QUOTATION_CODE 2/3/4` sub-case, and the
    round-once-vs-per-leg test) turned out to be the *same* mechanism wearing a triangulation-bug
    costume — see that file's own write-up.
- **`extractErrorMessage` doesn't see `properties.errors` — a regression from this session's own
  earlier `raw-body-toContain-for-error-messages.md` fix**, not a backend change. The hook-validation
  envelope (`{"detail":"Hook execution failed for operation INPUT in PRE phase for projection
  X",...,"properties":{"errors":{"FIELD":"<the real message>"}}}`) is the documented platform-wide
  shape (see `proj-bruno-api`'s `Table Template/Operations/Batch INPUT Records.yml`, same
  `details.fieldErrors` pattern) — `extractErrorMessage` only ever read `detail`, so the earlier fix
  from raw-`toContain` to `extractErrorMessage(...)` silently broke every assertion checking a
  hook-validation message's *content* (4 tests: cutoff-buffer rejection, past-`START_DATETIME`
  rejection, PROCESSED/ERROR cancellation-block messages, `END_DATETIME`-ordering rejection).
  **Fixed**: added a new `extractPropertiesErrorMessage(body)` in `response-parser.ts` (prefers
  `properties.errors`/`errors`, falls back to `extractErrorMessage`) and switched the 6 call sites
  whose underlying error is genuinely hook-validated (not a schema-validation error, which puts its
  message straight in `detail` unwrapped — confirmed by checking the "SOURCE_SYSTEM omitted" and
  "invalid RATE_TYPE" sites, which do NOT need the switch). `extractErrorMessage` itself is
  unchanged, by design — the two functions stay separate so a caller can still get `detail` alone.
- **`403 User does not have access to table: CURRENCY.ORDER` from `checkerClient` — confirmed root
  cause, not a guess.** `BaseApiClient`'s `defaultIsTransientClientError` (`base-api-client.ts`,
  present since TB-2799, 2026-08-10, unchanged since) was clearly written to retry exactly this
  message (`bodyText.includes('does not have access to table')`) — but gated on `status ===
  HTTP_STATUS.BAD_REQUEST` (400), while this specific AUTH-permission-propagation case actually
  returns **403**, so the retry never fires and the very first race loses outright (matches the
  observed symptom: passes on a lone re-run). Broadening the *global* default was rejected — a dozen+
  other spec files (`user-groups-api-regression.spec.ts`, `customization-regression.spec.ts`,
  `table-registry-smoke.spec.ts`, etc.) assert a **persistent** 403 "does not have access to table"
  for legitimate no-grant users; retrying those for up to 80×3s would be a severe, silent regression.
  **Fixed, scoped**: `grantCheckerAccessToCurrencyOrder` now constructs `checkerClient` with a custom
  `isTransientClientError` (composing the exported `defaultIsTransientClientError` with an added
  403+"does not have access to table" case) — `checkerClient` is never used to assert a denied-access
  scenario anywhere in this suite, confirmed by grep, so this is safe at its current scope.
- **Two "already-filed" backend bugs, unchanged**: "A missing RATE_TYPE is rejected..." and
  US-01.13.04's TC-05 both match the already-filed **TB-3276** (generic `404 Rate Not Found` instead
  of the documented spread-prohibition message — confirmed correct-per-Bruno on 2026-08-26, see
  `US-01.13.03/README.md`); "18-decimal precision..." matches the already-filed **TB-3277** (bug #2,
  hardcoded 9-decimal INPUT cap). Left untouched, waiting on the fix.
- **Still open, not fixed this pass**: "Expired rate..." STEP 2 (a `SEE` on a `CURRENCY.RATES` row
  whose `END_DATETIME` was just pushed into the past via `setCurrencyRatesEndDatetime` — a **raw
  Postgres UPDATE**, bypassing the normal Table Registry write path — returned `200` instead of being
  rejected by the read-time post-hook). Leading hypothesis: a Table Client read-cache populated before
  the raw DB write doesn't get invalidated by it (the normal invalidation path is presumably tied to
  the Kafka event a real API write emits, which this raw UPDATE never produces) — **not verified
  live**, no DB/cache access this pass. Needs a live re-check (does adding a short poll after the raw
  UPDATE, before the `SEE`, make it pass?) before deciding this is a real post-hook regression vs. a
  test-harness cache-timing gap.
- Round-once-vs-per-leg triangulation test — see `US-01.13.03/README.md`'s own write-up; likely the
  same `NO_OF_DECIMALS`-rounding mechanism above, but left **unfixed** here because its assertion is
  an exact `.toBe()` on a literal this session couldn't verify live, and it may be entangled with
  TB-3277's *other* still-open half (the Currency Engine's own output not being re-rounded).

All fixes `tsc`/`eslint`/`prettier` clean; **not yet re-run live** (this repo's convention — the user
runs tests manually).

---

## Seventh live run, 2026-08-26 (later same day) — the Sixth-live-run fixes confirmed live: 18 → 6
failed

User re-ran the full regression block after the Sixth-live-run fixes above landed (still
uncommitted). **55 passed, 6 failed** (was 18 failed / 43 passed). Every Group A/B/C/D fix from the
Sixth live run held: no more `403 does not have access to table` anywhere, no more hook-message
parsing failures, no more `NO_OF_DECIMALS`-collision failures on "Order flattening"/"MID-only
order"/"Cancel..."/"Block cancellation of an ERROR order", the `QUOTATION_CODE 2/3/4` triangulation
sub-case now passes.

**Jira statuses re-checked directly (not assumed) for the 3 tickets the user cited as
possibly-deployed**: **TB-3277 is still `Code Review`** (same `updated` timestamp as the prior
check, `resolution: null`, no `fixVersions`) — **not deployed to QA**. The user's hypothesis that
TB-3277 shipping explained the rounding fix was wrong; the rounding tests passing is entirely this
session's own `NO_OF_DECIMALS` test-data fixes, unrelated to any backend deploy. **TB-3267**
("`In testing`") and **TB-3132** ("`Ready For Retest`", i.e. deployed) also checked — TB-3132's own
description turned out useful for one of the 6 remaining failures, see below.

The 6 remaining failures, root-caused:

- **"Expired rate..." STEP 2 — still open, unfixed, but with new corroborating evidence.**
  `TB-3132`'s own `Cause` section (a *different*, deployed ticket) states as established fact that
  *"A SEE on that [expired CURRENCY.RATES] record through Table Template returns 400"* — i.e. the
  general SEE-rejects-expired-row mechanism is confirmed working elsewhere on this environment. That
  strengthens (doesn't prove) the leading hypothesis already on file just above: this test's own
  `setCurrencyRatesEndDatetime` raw-Postgres-UPDATE technique is the more likely culprit than a
  systemic post-hook regression, since the hook demonstrably fires correctly for API-driven writes.
  Still needs the live poll-after-raw-write re-check noted above — not done this pass.
- **"A missing RATE_TYPE..." and US-01.13.04's TC-05 — both `TB-3276`, confirmed still `Open`
  (not started).** Unchanged, expected to keep failing until a dev picks it up.
- **NO_OF_DECIMALS scaling test — STEP 1 passed, STEP 3 failed; not a partial TB-3277 deploy, two
  different mechanisms.** STEP 1 (stage `'1.2347'` at `NO_OF_DECIMALS=3`, expect resolved
  `'1.235'`) now passes — but *not* because TB-3277 shipped (confirmed unmerged above). It passes
  because `CURRENCY.ORDER` already truncates `RATE_VALUE` to the currency's `NO_OF_DECIMALS` at
  storage time (the pre-existing, dev-confirmed mechanism from the Sixth live run) — the Currency
  Engine is just reading back an already-rounded stored value, not doing any rounding of its own.
  STEP 3 (stage `'0.95'`, expect resolved `'0.950'`, padded) still fails — nothing pads a
  *shorter* value up to the target scale, at either layer. This is the *other* direction TB-3277's
  own summary names explicitly (*"RATE_VALUE is independent of NO_OF_DECIMALS, **in both
  directions**"*) — the ticket's own repro only demonstrates the over-precision half, but the
  under-precision half is the same open ticket, not a separate bug.
- **Round-once-vs-per-leg (id 3208) — reproduced identically to how the Sixth live run left it.** No
  new information; still open per that entry above.
- **18-decimal precision → `400` "9 decimal places" — `TB-3277`'s own documented "BUG #2"**
  (`RATE_BANDS[0].RATE_VALUE - value must be a number with up to 9 decimal places`, quoted verbatim
  in the ticket body, flagged by its own reporter as a second, separate issue on the same ticket).
  Confirmed still open (ticket unmerged) — expected to keep failing.

**Not yet closed out further**: the "Expired rate" STEP 2 live poll-after-raw-write re-check, and
confirming whether TB-3277's eventual fix covers the padding direction too or only the truncation
direction described in its repro steps.

---

## Eighth pass, 2026-08-26 (later same day) — BA confirmation on padding, live diagnostic on Expired
rate STEP 2, smoke-test siblings fixed

**Padding direction confirmed NOT a bug — BA answer obtained directly, not inferred.** User asked
Mikalai Yudzilevich directly in chat: *"Если NO_OF_DECIMALS=3 и RATE_VALUE=0.95, должно прийти 0.95
или 0.950?"* — answer: *"А есть разница? Ну дорисуем мы нолей, суть не изменится. Я не вижу тут
проблемы."* This settles the "under-precision" half of TB-3277's "in both directions" framing as
**not a defect** — `RATE_VALUE` only ever gets capped down when the submitted value has *more*
decimals than `NO_OF_DECIMALS`; a shorter value is never padded, and that's fine. **Fixed**: STEP 3
of the NO_OF_DECIMALS-scaling test (id 3160) now asserts `body.rateValue === 0.95` (numeric,
`JSON.parse`) instead of `.toContain('"rateValue":0.950')` — the old assertion could never have
passed even under correct behavior, since a JSON *number* field doesn't preserve a trailing-zero
string form.

**Round-once-vs-per-leg (id 3208), root-caused and fixed.** Same missing-`NO_OF_DECIMALS`-override
mechanism as the Sixth-live-run fixes: `quoteCurrency` in this test defaulted to `NO_OF_DECIMALS: 2`
while `baseCurrency`/`transitCurrency` were explicitly set to `3`; the leg-2 literal `'2.044'` (3
decimals) got truncated to `'2.04'` on `CURRENCY.ORDER` storage before triangulation ever ran —
`1.003 × 2.04 / 10 = 0.204612`, rounded to `quoteCurrency`'s 2 decimals = `0.20`, matching the
observed `Received: 0.2` exactly. Confirmed **our test's own setup bug**, not a backend defect — the
BA confirmation above only concerns padding *shorter* values, and has no bearing on this (leg-2's
literal was *longer* than `NO_OF_DECIMALS`, which is the direction that's supposed to truncate).
**Fixed**: `quoteCurrency` now also gets `NO_OF_DECIMALS: 3` (matching the other two), and the
assertion no longer hardcodes an exact literal — it now computes the expected round-once value
dynamically from the raw leg rates and `transitCurrency.quotationCode`, asserted via `toBeCloseTo`
(same pattern already used by the `QUOTATION_CODE 2/3/4` sub-case) instead of `.toBe()` on a magic
number. This also removes the entanglement-with-TB-3277 caveat noted above — that caveat was about
the Currency Engine's *own* re-rounding of an in-memory computed value being possibly broken, which
remains a real unknown for the final divide step, but the dominant, actually-observed cause was
purely the input-truncation bug already fixed elsewhere in this pass.

**"Expired rate..." STEP 2 — live-diagnosed, definitively NOT a cache-invalidation lag, and NOT the
`CCY_ORDER_CUTOFF_SECONDS` buffer either.** Wrote `scripts/diagnose-expired-rate-see.ts` (reuses the
suite's own helpers outside the Playwright runner — `ReferenceDataDb`/`system-tables-helper.ts` had
to be avoided, it transitively imports `api-fixtures.ts` which calls `test.beforeEach()` at module
load and crashes under plain `ts-node`; every helper call that takes an optional `db` param was
passed `undefined` instead). Reproduced the test's exact sequence, then **polled `SEE` every ~1.4s
for 30s straight after the raw `setCurrencyRatesEndDatetime` UPDATE**, re-reading the stored
`END_DATETIME` directly from Postgres and printing wall-clock `now` at every attempt. First pass
used the test's own 5-minute-in-the-past margin — the user flagged that this exactly equals
`constants-keeper.ts`'s `CCY_ORDER_CUTOFF_SECONDS: 300`, a real confound risk since that constant
already governs a different `CURRENCY.ORDER` INPUT-side buffer check. **Re-ran with a 24-hour
margin instead** (`END_DATETIME = 2026-08-25T18:03:55`, every `SEE` attempt's `now` in the
`2026-08-26T18:03:55`–`18:04:25` range — a full day past, nowhere near any plausible cutoff/grace
window) — **identical result**: `200` on all 22 attempts, never once rejected. This rules out both
the cache-lag hypothesis and the `CCY_ORDER_CUTOFF_SECONDS` confound. TB-3132's own `Cause` section
(different ticket, but citing the identical mechanism — a SEE POST-phase hook comparing
`END_DATETIME` against now) confirms this class of hook exists and fires correctly elsewhere on this
environment, sharpening the question to *why not for a row expired via this test's specific
technique*. **Not fixed — this is now a solid, live-verified finding, not a guess, worth taking to
dev directly**: either the post-hook doesn't dynamically evaluate `END_DATETIME` per-request despite
being named "read-time" (e.g. relies on a flag/column set once by a daemon sweep rather than
comparing to wall-clock live), or something about a *directly-written* `END_DATETIME` (vs. one that
arrived through the normal daemon-flattening path) isn't seen by whatever the hook actually checks.
Recommend sharing this script's full transcript with Ilona Fralova/dev rather than guessing further
here — next step needs backend-side visibility this session doesn't have.

**Smoke-test siblings of the Sixth-live-run rounding fix, found and fixed.** `currency-smoke.spec.ts`
had the same missing-`NO_OF_DECIMALS`-override pattern in two places, surfaced by the user's next
smoke run: "A direct cross-rate resolves exactly as stored for BID, ASK and MID" (id 3094) and
"TC-01: Front-Office retrieves the pure MID rate" both minted currencies via bare
`createDedicatedCurrency(client, db)` (default `NO_OF_DECIMALS: 2`) while asserting exact 4-decimal
literals (`'1.0820'`/`'1.0840'`/`'1.0830'`, `'1.0850'`). Same fix as the regression-suite siblings:
`{ NO_OF_DECIMALS: 4 }` added to both currencies in both tests.

All fixes `tsc`/`eslint`/`prettier` clean; **not yet re-run live**.

---

## Ninth pass, 2026-08-26 (later same day) — "Expired rate" STEP 2 root-caused for real; round-once
test hardened twice more after user pushback

**"Expired rate..." STEP 2 root cause found — confirmed, not a guess.** `proj-bruno-api` commit
`f416c646` (Ilona Fralova, 2026-08-25 09:45, "TB-3132: stop binding the currency rates expiry
hook") intentionally **removed `proj-currency-rates-expiry-plugin` from `CURRENCY.RATES~MASTER`
entirely** as the actual fix for TB-3132 (rather than patching the exception handling that turned
its `400` into an uncaught `500`). Commit message, verbatim: *"A SEE now returns a rate record
whatever its END_DATETIME... proj-currency-engine skips an expired record during resolution."* This
is a **confirmed, dated, intentional architecture change** — expiry enforcement moved from this
table's own read-time hook to `proj-currency-engine`'s resolve-time filtering. Corrected the stale
"hook is bound" claim in the Data Model section above. allureCaseId 2706's premise (a Table-Registry
`SEE`-level rejection) **no longer matches the current architecture** — real coverage of "expired
rate is never resolved" now lives in id 3157 (`US-01.13.03`, matches `TB-3132` exactly).

**RESOLVED 2026-08-26, same day — reported to Artur/Mikalai as a live repro, then repurposed
rather than deleted.** Sequence: reported the STEP-2 mismatch (SEE returning `200` on an expired
row 22x in a row) to the team as a live repro; Artur confirmed it's not a bug — deliberate,
already-discussed-with-Mikalai design: **direct table access (`SEE`) intentionally never filters
by expiry** (an admin with table access can see exactly what's stored, expired or not); **the
Currency Engine is the only layer that filters expired rows**, and does so at resolve time. This
matches (and is now the live-chat confirmation of) the same-day Bruno-commit finding above — two
independent sources agreeing, not just one.

Separately asked Artur whether the OTHER half of case 2706 — "an expired row is never physically
purged, stays in LIV, isn't moved to HIS" — is still a real, worth-testing claim. Confirmed yes,
explicitly: *"Абсолютно реальный, у нас пока нет функционала, при котором мы что-то делаем с
заэкспайренной записью, на данный момент только при апдейте она попадает в HIS, точнее её старая
версия"* — no purge/archival mechanism exists at all today; only a later overwrite of the same key
ever creates a HIS entry. Worth keeping as forward-looking regression coverage precisely because
nothing currently guards against a future purge job being added carelessly.

**Action taken:** rather than delete case 2706 and create an orphan replacement (the original plan
discussed in chat), discovered `testops_delete_testcase` on it had actually been **blocked by the
Auto Mode permission classifier** in a prior turn — `deleted:false`, it was never removed. Given
that, repurposed the case **in place** instead of trying the delete again: renamed to "An expired
CURRENCY.RATES row stays in LIV and is never archived into HIS", trimmed `description`/`scenario`
to drop the now-wrong `SEE`-rejection claim entirely, keeping only the physical-persistence claim.
Custom fields (Component/Feature/Story) and tags (`API`/`Regression`/`regression_m2`) untouched —
same Story (`US-01.13.02`) as before. The corresponding test in `currency-regression.spec.ts`
(same location, right before `allureCaseId(2832)`) was rewritten the same way: dropped the old
STEP 2 (`SEE` rejection assertion) and its now-unneeded `CURRENCY_RATES_PROJECTION_ID`/`OPERATION.SEE`
call entirely; kept the aging step and the LIV/HIS/order-persistence assertions (renumbered as
STEP 1/STEP 2). `tsc`/`eslint`/`prettier` all clean; not yet re-run live.

**Caveat, confirmed explicitly by Artur in the same thread, worth carrying forward:** both the
"`SEE` never filters by expiry, only the Engine does" split and the "no purge mechanism, only a
later overwrite creates a HIS entry" fact were qualified as *"по крайней мере пока так"* ("at
least for now") when directly re-confirmed. Neither is a documented, permanent contract — just
today's real implementation. If this test (id 2706) ever starts failing, check for a new
purge/archival job before assuming a test regression — that would be the expected way this
specific test goes red on a legitimate future change, not a bug in the test itself.

**Round-once test (id 3208) — precision hardened twice more after user review caught real gaps.**
First fix (this session, earlier) used `toBeCloseTo(roundOnceValue, quoteCurrencyDecimals)` — too
loose: the two competing hypotheses (`0.205` round-once vs `0.204` round-per-leg-first) are only
`0.001` apart, and a `3`-decimal tolerance (`±0.0005`) left too little margin, with no explicit
"and NOT close to the wrong answer" check. **User caught this.** Tightened to `toBeCloseTo(...,
6)` (matching the precision already used by the `QUOTATION_CODE 2/3/4` sub-case) plus an explicit
`.not.toBeCloseTo(roundPerLegFirstValue, ...)` companion assertion. **Then a second issue
surfaced on review**: the dev-confirmed formula (`US-01.13.03/README.md`'s "Triangulation
arithmetic" section) states rounding "to `NO_OF_DECIMALS(B)`" in the context of computing
`Amount_B` (a transaction amount) — it does **not** explicitly confirm whether the bare `rateValue`
field from a triangulated resolve (no amount conversion) is itself rounded to `NO_OF_DECIMALS(B)`,
or returned at full/unrounded precision. Committing to an exact rounded target (`0.205`) risked
being wrong about which the engine actually does. **Final fix**: compare against the *unrounded*
full-precision value (`0.2050332`) with a tolerance (`10^-(quoteCurrencyDecimals+1)`) wide enough to
also accept a `NO_OF_DECIMALS`-rounded answer (`0.205`, only `0.0000332` away) but still ~30x too
tight to accept the round-per-leg-first alternative (`0.204`, `0.0010332` away) — the test now
verifies the actual claim (full-precision combine, not per-leg-rounded) without needing to guess
which of the two legitimate "correct" representations the engine returns. **Open question, not
resolved this pass**: whether triangulated `rateValue` gets rounded to the quote currency's
`NO_OF_DECIMALS` before being returned — worth a direct dev question if it ever needs pinning down
for a different assertion.

## 2026-09-02 — NEW live rule confirmed: `CURRENCY.ORDER` INPUT now rejects a non-empty `UNIT` when the market's `DIFF_UNIT` is `false`

Discovered while re-running `currency-regression.spec.ts`'s US-01.13.02 block on `group-3/TB-3468`
(the hardcoded-user-migration branch): 11/18 tests started failing with
`"UNIT must be empty because market <id> does not differentiate by Business Unit (DIFF_UNIT is
false)"` from `proj-currency-order-validation-plugin` on INPUT. This is almost certainly the
"unit_diff" check Artur Fonichkin described in chat (2026-09-01) as still being rolled out —
*"Проверки по amt_diff and unit_diff, чтобы можно было заливать курсы без бизнес юнитов"* ("checks
for amt_diff/unit_diff, so you can post rates without business units"). **Not yet documented** in
`proj-bruno-api`'s `Register CURRENCY.ORDER~MASTER hook.yml` — that doc (still current per
`git log`) only describes the datetime-range and `DIFF_AMT`/multi-band checks, nothing about
`UNIT`/`DIFF_UNIT`. Treat the Bruno doc as incomplete on this point until devs update it.

The describe block's own `beforeAll` already deliberately configures the shared
`CCY_ORDER_TEST_MARKET_ID` ("1") as an **Interbank Market** (`DIFF_UNIT=false, DIFF_AMT=false`) —
so this isn't new test data, it's the local `buildOrderData` wrapper (and a few individual test
overrides) that had always set a non-empty `UNIT` regardless, silently tolerated before this
validation went live. **Fixed** in `currency-regression.spec.ts`: `buildOrderData`'s default
now sends `UNIT: '', UNIT_INCLUDE: false` (matching the market's own DIFF_UNIT=false setup);
removed a stray explicit `UNIT` override on two tests ("An expired CURRENCY.RATES row...",
"MID-only order is valid" — both unrelated to business-unit differentiation, so the override was
just unexamined boilerplate); and updated "Superseding order..."'s `ratesKey.UNIT` from a business
currency code to `''` to match the corrected composite key. Tests that deliberately want
`DIFF_UNIT=true` behavior (e.g. "Order flattening...", allureCaseId 2696) already use their own
dedicated market (`diffAmtMarketId='10'`) with an explicit `UNIT` override — unaffected, still
correct. All 18 tests in this block pass again after the fix (live-verified same session).

**Pattern for the module `INDEX.md`:** any `CURRENCY.ORDER` test payload's `UNIT`/`UNIT_INCLUDE`
must match its `CCY_MKT`'s actual `DIFF_UNIT` value — `UNIT` non-empty requires a market with
`DIFF_UNIT=true`; a `DIFF_UNIT=false` market (including the shared default market "1") requires
`UNIT: '', UNIT_INCLUDE: false`, or INPUT now 400s. Mirrors the already-known `DIFF_AMT` rule
(>1 `RATE_BANDS` band requires `DIFF_AMT=true`) and the readiness-probe `UNIT` fix noted in
[[project_tb-3468-hardcoded-user-migration]] — same market-configuration class of bug, now also
confirmed at the regression-suite scale, not just in the one shared helper probe. US-01.13.03/
US-01.13.04 and `currency-smoke.spec.ts` were not yet re-audited against this rule this session —
check any order staged against a non-`DIFF_UNIT` market there too.

All fixes `tsc`/`eslint`/`prettier` clean; **not yet re-run live**.

## 2026-09-03 — TB-3588: `UNIT` omitted entirely from the payload 400s ("required property 'UNIT' not found"), missed by every existing automated case

Manual QA filed TB-3588 the day after the 2026-09-02 DIFF_UNIT-gate work above: `POST
CURRENCY.ORDER~MASTER/records/operations/INPUT` with the `UNIT` **key absent from the JSON body**
(market `CCY_MKT: "5"`, `DIFF_UNIT=false`) returns `400 "required property 'UNIT' not found"`.
Per the ticket, business logic wants `UNIT` optional (nullable/omittable) whenever `DIFF_UNIT=false`,
rejected only if present-and-blank (`" "`).

**Why the 2026-09-02 work (allureCaseId 3437-3441, and every other `CURRENCY.ORDER` test in this
file) didn't catch it:** every one of them sends `UNIT` as a JSON key that's always *present* — either
`''` (via `buildOrderData`'s own default, see the Pattern above) or a real currency id. None ever
constructs a payload with the `UNIT` key `delete`-d/omitted outright. That distinction matters because
two different validators are in play here, and only one of them was exercised:
- **The business-rule validator** (`proj-currency-order-validation-plugin`, confirmed 2026-09-02)
  rejects a *non-empty* `UNIT` on a `DIFF_UNIT=false` market — this is what 3438/3441 test, and
  `UNIT: ''` satisfies it (empty counts as "no business unit").
- **The projection's JSON-schema `required` check** (runs earlier, before any business-rule plugin)
  only cares whether the key is *present at all* — `UNIT: ''` passes it trivially since the key exists;
  omitting the key entirely is the only payload shape that can ever trip it. TB-3588 is this second
  validator rejecting an omitted `UNIT`, unconditionally, regardless of `DIFF_UNIT` — i.e.
  `CURRENCY.ORDER~MASTER`'s provisioned schema (not owned by this test suite — see `INDEX.md`'s
  "table whose data is described as populated by a scheduled/backend process" caution for the general
  shape of "provisioned, not test-created" tables) still lists `UNIT` as unconditionally `required`,
  which was never updated when the DIFF_UNIT-conditional business rule shipped.
- allureCaseId 3441's own title ("...**no UNIT** is accepted") reads as if it covers exactly this case
  — it doesn't; it sends `UNIT: ''`, not an omitted key. This is the actual reason the gap slipped past
  review: the test name and the bug's real equivalence class look identical in prose but are different
  request shapes.

**Correction after verifying the real stored Allure content (2026-09-03, direct REST — MCP
unreachable, per [[reference_allure-testops-rest-access-from-proj-test-automation]]):** it is
**not** accurate to say no case existed for this. `allureCaseId(3441)`'s own Step 1 text literally
reads `"POST (INPUT) CURRENCY.ORDER for CCY_MKT=1, no UNIT, RATE_BANDS: [...]"` — Manual QA's own
wording is "no UNIT", ambiguous between "key omitted" and "key present, empty value", with **zero
clarifying comments on the case** (`GET /api/comment?testCaseId=3441` returned empty). Automation
resolved that ambiguity as `UNIT: ''` (via `buildOrderData`'s shared default) — a defensible literal
reading, but the one that happens not to exercise the schema-level `required` check TB-3588 hits.
**Second correction (user pushback, 2026-09-03, same session):** the "ambiguous, defensible reading"
framing above was too generous to the automation. Read `allureCaseId(3441)`'s Step 1 in context of
its sibling `allureCaseId(3438)`, which writes a real value in explicit key=value form
(`"...with a non-empty UNIT (e.g. UNIT=\"TESY\")..."`) — by contrast, 3441 never writes `UNIT=` at
all, it just says "no UNIT" in prose alongside a literal `RATE_BANDS: [...]` JSON snippet. Read next
to its sibling, "no UNIT" reads as "the key is not part of the request", not "send an empty value for
it". **This was a misimplementation of an already-approved case, not an unresolvable ambiguity.**

**Fixed, same day:** `currency-regression.spec.ts`'s `allureCaseId(3441)` test now overrides
`UNIT: undefined` on top of `buildOrderData`'s `UNIT: ''` default — since the payload goes through
Playwright's `request.post({ data: payload, ... })` (`base-api-client.ts`), a key with value
`undefined` is dropped from the serialized JSON body entirely (standard `JSON.stringify` semantics),
so the request now genuinely omits `UNIT`, matching the TC's real intent. `tsc`/`eslint`/`prettier`
clean. **This test now correctly reproduces TB-3588 and is expected to fail live** (the `INPUT` call
inside `stageAndAuthorizeOrder` will get `400` instead of the asserted `200`) until the backend ships
the fix — that's the intended, correct state for a regression test tracking an open bug, not a
new problem.

Ticket text also names a third variant this fix does not attempt: `UNIT` explicitly provided as a
blank/whitespace string (`" "`) must be *rejected*, distinct from omitted/`null` which must be
*accepted* — genuinely ambiguous (the ticket's own wording doesn't make clear whether "empty" means
literally whitespace or `''` in general, and `UNIT: ''` is already separately confirmed accepted
elsewhere in this file), so left for Manual QA to clarify before automating, per
[[feedback_no-automate-on-contract-mismatch]].

**Generalizes to `docs/common-issues/`** (not Currency-specific — same trap applies to any
conditionally-required field on any projection): see
[`required-field-omitted-vs-empty-value-are-different-checks.md`](../../../common-issues/required-field-omitted-vs-empty-value-are-different-checks.md)
— updated to record this as a genuine misread, not just an inherent ambiguity.

**Extended, same day, on the user's explicit go-ahead:** added a `UNIT: null` variant, per the
ticket's own third point ("UNIT field can be null or missed when diffunit=false") — a lightweight
INPUT-only check (200 expected, no full daemon/RATES round trip, since that end-to-end proof
already exists for the omitted-key case in STEP 1-2 and for the empty-string case in `allureCaseId
3437`). Both `allureCaseId(3441)`'s Allure content (via `testops_update_testcase`, native MCP —
reachable this call, contrary to the "could not connect" note in
[[reference_allure-testops-rest-access-from-proj-test-automation]]; worth retrying the native MCP
before falling back to curl next time) and `currency-regression.spec.ts`'s test (new STEP 3) were
updated to match: Allure Step 1 = existing omitted-`UNIT` scenario (unchanged wording), Step 2
(new) = `UNIT: null` → `"HTTP 200; order accepted (TB-3588: UNIT can be null or missed when
DIFF_UNIT=false)."`. `tsc`/`eslint`/`prettier` clean on the test change. The `UNIT: ' '`
(whitespace) variant from the ticket's second point is still deliberately not automated or added
to Allure — genuinely ambiguous wording, needs Manual QA clarification first.

**Step-title cleanup, same day (user pushback):** the original STEP 1 title ("INPUT and AUTH a
Market 1 order with a single AMT_FROM=0 band and the UNIT key omitted entirely — expect it staged
as NEW") buried the actual point (UNIT absent from the payload) under incidental detail (the
AMT_FROM value, the AUTH mechanic, the NEW status) — a real instance of
[[feedback_step-names-behavioral-not-technical]], not just a one-off wording nit. Also flagged: 3
`test.step()` calls in code against 2 Allure `scenario.steps` reads as a mismatch unless labeled —
this file's convention (e.g. `allureCaseId(2696)`) already splits one Allure step into multiple
Playwright steps (act, then verify the daemon's effect), so it isn't a new inconsistency, but it
needs to be visible in the title rather than left for the reader to reconstruct. Retitled all three
to name the core check first and tag which Allure step each maps to: `STEP 1 (Allure Step 1, part
a): send the order with the UNIT field absent from the payload — expect it accepted and staged`,
`STEP 2 (Allure Step 1, part b): after the daemon runs, confirm the resulting rate key has an
empty Business-Unit segment`, `STEP 3 (Allure Step 2): send a second order with UNIT explicitly
null — expect it accepted`. **Predict**: any code step that represents only part of a single
Allure Step's full Expected Result (a stage-then-verify split, common in this module's daemon-fed
tests) should say so explicitly in its title — don't assume the 1:1 numbering will read as obvious
just because it was obvious while writing it.
