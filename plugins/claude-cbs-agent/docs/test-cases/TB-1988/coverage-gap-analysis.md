# TB-1988 / US-01.13.02 — Automation coverage gap analysis

Date: 2026-08-20 (baseline), extended 2026-08-21 to cover TC-01, then TC-08 removed same day.
Automated tests: `api/system_core/tests/currency-regression.spec.ts` (TC-02, TC-05, TC-06, TC-07,
TC-09..TC-21 — 17 TCs, all green as of 2026-08-20 except TC-08 which has since been deleted) plus
`api/system_core/tests/currency-smoke.spec.ts` (TC-01 / Allure case 2405, added 2026-08-21, not yet
run live). **18 of the 19 pasted test cases are automated; TC-08 is `Not Automatable` and has no
test in the suite** — it was briefly shipped as "Automated" while actually proving the opposite of
half its own Expected Result, then removed once that was flagged (see its own entry below) rather
than left in with a caveat. Story source: Confluence page 1529872386 (`bank-proj`, TB space),
version 9, last edited 2026-08-11 — read directly for this analysis, not from memory/notes.

**Purpose**: all 18 pasted test cases pass, but "green" here does not mean every AC/Alt/BR is
proven. This document lists, case by case, where the automated test proves something narrower,
different, or absent compared to what the test case (and the AC/Alt/BR it cites) literally
describes — so this can be walked through with Manual QA (test-case wording) and Dev (confirm
which side — Story or system — is actually wrong) rather than silently patched in code.

Every finding below is either (a) confirmed against live system behavior/Bruno this session or a
prior one, or (b) marked explicitly as inferred/unconfirmed. Nothing here should be read as "the
code is broken" — most of these are proof strength gaps or Story/system mismatches, not bugs.

**2026-08-20, later pass — findings marked `FIXED`**: every finding below that was fixable purely
by making the automated test assert what the *existing, approved* TC/AC/BR already describes (no
new scenario invented, nothing requiring a Manual QA/Dev decision first) has been fixed in
`currency-regression.spec.ts`/`currency-helper.ts` and is marked `FIXED` inline. Findings that
require a Story-vs-system decision (which document is right), a new approved TC (§0.5/§0.6/TC-19),
or infrastructure this framework doesn't have (Kafka consumption) are unchanged and still open.

**Policy correction, 2026-08-21 (later same day) — documents outrank the real implementation for
this project.** Several assertions in this suite had, up to this point, quietly followed *confirmed
real system behavior* instead of the pasted TC's literal Expected Result whenever the two disagreed
(status codes, message text) — on the reasoning that a Bruno/live-confirmed fact is stronger
evidence than an unconfirmed document. The user explicitly overturned that ordering: **for this
project, the User Story / Test Case document is the priority. Where the real implementation
diverges from it, that divergence must be raised with BA/Dev as a defect or a wording question —
not quietly encoded into the test as the new "correct" answer.** Re-audited every TC against the
originally pasted table on that basis; every case below where the test had asserted the real value
instead of the documented one was rewritten to assert the documented value. Several of these are
now **expected to fail on the next live run** — that failure is deliberate: it *is* the mechanism
for raising the discrepancy, not a bug in the test. Don't "fix" any of these back toward matching
real behavior without a corrected TC or an explicit decision from the user/Manual QA first.

Cases changed by this policy correction: **TC-01, TC-13, TC-14, TC-16, TC-17, TC-20, TC-21** — see
each entry below. Cases left unchanged because they were already asserting the documented value
(no divergence existed): TC-05, TC-09, TC-11, TC-12, TC-15, TC-18, TC-19. Cases that remain
`Not Automatable`/structurally unfixable regardless of this policy (the literal scenario cannot be
represented in the shipped schema/API at all, not just "asserted differently"): TC-08, TC-10.
TC-02's event-emission clause remains an open infrastructure gap (no Kafka consumer), not something
this policy correction could fix by itself — see its own entry for a possible DB-only partial
signal.

---

## 0. Cross-cutting findings (apply to more than one TC)

### 0.1 — Story specifies `422` for validation rejections; every test (and live Bruno/system
behavior) uses `400`

The Business Rules & Validations table and AC7 specify `422` for: Source Tracking (TC-11), Explicit
Rate Typology (TC-12), Validation Time-Lag (TC-13, TC-14), and END/START ordering (TC-21, "Not
explicit in US" per the pasted table itself). All five corresponding automated tests assert `400`
instead, because that is what the live system and Bruno's own INPUT-rejection examples confirm.
This is a single, systemic Story-vs-implementation mismatch, not five independent ones — worth one
conversation with Dev/BA about which document (Story or API) is authoritative, rather than five.

### 0.2 — RESOLVED 2026-08-21: `CCY_ORDER_CUTOFF` is now 300 seconds (5 minutes), matching the Story

Was 3600 seconds (1 hour) on this environment through 2026-08-20 (see the superseded text below,
kept for history). Manual QA confirmed the deployed value was corrected to match AC7/the BR table's
"5-minute buffer" wording, and this was independently re-confirmed by a direct read-only query
against `system_parameter.liv` on `qa.proj.local` (2026-08-21): `data.CCY_ORDER_CUTOFF = "300"`.
`TEST_CONSTS.CCY_ORDER_CUTOFF_SECONDS` and TC-13/TC-20 were updated to match — TC-13 now uses the
pasted Steps' literal "2 minutes in the future" (genuinely inside the real 5-minute buffer) and
TC-20 the literal "6 minutes in the future" (genuinely just outside it), no more magnitude
mismatch. TC-13 also now asserts a single `400` (not a `[400,403]` hedge).

**Correction, 2026-08-21 (later same day)**: the line above originally claimed TC-13 asserts "the
exact pasted message" — that was checked again directly against `proj-bruno-api` (`git grep` across
the full `origin/main` tree for the literal phrase) and it is **not** confirmed anywhere in the
repo; that was an overclaim, not a Bruno-backed fact. What `INPUT - Reject START_DATETIME Inside
The Cutoff Lag.yml` actually asserts is narrower: the response body (stringified) contains the
substring `"execution lag buffer"`, and `res.body.properties.errors` names the key
`START_DATETIME`. TC-13's code asserts exactly that narrower, Bruno-confirmed pair — not the
pasted TC's fuller sentence. Don't tighten this further without a fresh Bruno file or a live-run
confirmation of the complete phrase.

**Bruno/live drift, noted not acted on**: `proj-bruno-api`'s own seed script
(`11 - Seed Data/05 Seed SYSTEM.PARAMETER record.yml` and its dependent E2E files) still hardcodes
`"CCY_ORDER_CUTOFF": "3600"` — the Bruno collection itself was never updated to 300 even though the
live environment was. This is a Bruno-vs-live inconsistency, not an error on either our tests or
this file; our tests correctly follow the live, DB-confirmed value (300), not Bruno's stale seed.

**Superseded (kept for history — do not act on this)**: AC7 and the BR table both say "5-minute
time-lag buffer" (twice). The deployed `SYSTEM.PARAMETER.CCY_ORDER_CUTOFF` (TB-2961, Done) was
seeded at 3600 seconds. TC-13/TC-20 tested the real 1-hour value, not the "2 minutes late / 6
minutes early" boundary the pasted Steps literally described — same shape of test (just inside vs.
just outside the buffer), different magnitude. If the Story's "5 minutes" is what the business
actually wants, this is a live product configuration gap (TB-2961 shipped the wrong number), not a
test gap. If 1 hour is intentional, the Story/AC7 text and TC-13/TC-14/TC-20's literal wording all
need updating.

### 0.3 — AC7's cutoff enforcement point (INPUT vs. AUTH) doesn't match the Story's wording

AC7 reads "an administrator attempts to **submit or schedule**... THEN the system rejects the
transaction" — implying rejection at submission. The real, confirmed system enforces this at
**AUTH** time (`proj-currency-order-cutoff-plugin`, bound on `AUTH`/`PRE`), not at `INPUT`. TC-13
correctly stages the order successfully (`INPUT` returns 200) and only expects the rejection on the
subsequent `AUTH` call — which is the *right* thing to test given confirmed system behavior, but it
means the AC's own literal wording ("rejects the transaction" on submit) does not match reality: an
order inside the buffer sits visibly in `CURRENCY.ORDER` (state `NEW`, not rejected) until someone
tries to authorise it. Separately, TC-14 (`START_DATETIME` already in the past) *is* rejected at
`INPUT` directly — so the Story's single BR row conflates two validations that are actually
enforced at two different hooks/points in the real system. Worth confirming with Dev whether that
split is intentional.

### 0.4 — There is an open developer-side doubt about whether the cutoff plugin is even deployed

On the dev-sync recording (2026-08-19, Artur, 13:46–13:55) the implementing developer was
uncertain whether the time-lag/cutoff enforcement is configured on this environment at all. TC-13/
TC-20 hedge their AUTH-rejection assertion as `[400, 403]` instead of a single fixed code because
of this. If TC-13 or TC-20 ever goes green for the "wrong" reason (e.g. AUTH returns 200 for an
inside-buffer order and a hedge elsewhere masks it) that would not currently be caught — worth
flagging to Dev to close this open item rather than leaving the hedge in place indefinitely.

### 0.5 — AC2 (`UNIT_INCLUDE` / `BUSINESS.UNIT` hierarchy replication) has **zero** corresponding
test case in the pasted 18

AC2: *"GIVEN an inbound order with `UNIT_INCLUDE = TRUE` ... THEN the rates are assigned to the
parent branch and automatically propagated (replicated) down to all child branches ... in the
`BUSINESS.UNIT` hierarchy."* No TC-02..TC-21 exercises this. Notably, every order our suite builds
(`buildCurrencyOrderInputData`'s default) sets `UNIT_INCLUDE: true` unconditionally — so this flag
is always on in every test, yet **no test ever asserts that replication actually happened** (e.g.
that a child Business Unit also received a `CURRENCY.RATES` row). This is not an automation gap in
the usual sense — there is no approved test case for it at all. Recommend Manual QA author a
dedicated TC for AC2 before this can be automated (per this role's boundary: adding an unapproved
scenario is not something AQA does unilaterally).

### 0.6 — `CANCELLED` is also a terminal, update-blocking status — dev-confirmed and Bruno-confirmed,
but zero corresponding TC in the pasted 18

Dev-sync transcript (`Full_Transcript_Daemon_Currency_Sync.md`, 02:15–02:32, Artur, verbatim):
*"апдейтятся записи только со статусом NEW. Если эта запись ERROR, CANCELLED или PROCESSED ... то
её уже апдейтить нельзя, должна выпадать ошибка. Если можно — это баг."* Three terminal statuses
are named — `ERROR`, `CANCELLED`, `PROCESSED` — all equally update-blocking. The pasted 18 TCs only
cover two of the three (TC-16/PROCESSED, TC-17/ERROR); TC-15 only proves the NEW→CANCELLED
transition itself and that the daemon ignores an already-cancelled order during its polling cycle —
neither TC-15 nor any other pasted case proves that a *further* update attempt on an
already-`CANCELLED` order is rejected.

Re-checked against `proj-bruno-api` (`origin/main`) and found three confirmed, scripted scenarios in
this exact area that have no automated or even manually-designed TC counterpart at all:
- `INPUT - Reject CANCELLED To PROCESSED.yml` — 400; body contains `CCY_ORDER_STATUS`, `CANCELLED`,
  `NEW`. Docs: *"CANCELLED is terminal - a cancelled order cannot be processed afterwards."* This is
  the direct, scripted proof of the dev's statement above.
- `INPUT - Reject Create As CANCELLED.yml` — 400; an order cannot be **created** directly with
  `CCY_ORDER_STATUS = CANCELLED` (must start `NEW`).
- `INPUT - Reject Field Change While Moving To CANCELLED.yml` — 400; a status-change-to-`CANCELLED`
  payload that *also* changes another field (`UNIT` in the example) is rejected — a "status
  transition must carry nothing else" purity rule not stated anywhere in the AC/BR text, only in
  Bruno.

**Caveat, same pattern as TC-16/TC-17 (§ TC-16 below)**: all three Bruno scripts exercise
`CURRENCY.ORDER~BATCH`; this suite's CANCELLED-related tests use `~MASTER`. The exact rejection
body text is Bruno-confirmed for `~BATCH` only — re-verify against `~MASTER` before asserting the
same body content, same as already done for TC-16/TC-17's own message-loosening.

**Recommendation**: escalate to Manual QA to author 3 new test cases for these (they sit squarely
inside this Story's existing BR "Staged In-Flight Cancellation" scope, just an angle the pasted 18
never covered), then automate against `~MASTER` with a live body confirmation first.

### 0.7 — Multiple orders due at the same instant, processed in one polling cycle — implied by the
Story, not exercised by any TC

Happy Path step 6/9 and the dev transcript (05:11) both describe the daemon triggering **once** per
due timestamp and then picking up **all** orders due at that instant in one pass ("у нас на 15 вот
этот schedule может быть 10-20 курсов, которые обновляются в одно время, но нам главное
триггернуться один раз, чтобы мы потом это всё взяли"), processing them one at a time via an
iterator. Every one of TC-02/06/07/15/16/18 exercises exactly **one** order per `START_DATETIME` —
none constructs two-or-more orders sharing the same due instant to confirm the daemon actually
drains all of them in a single cycle (not just the single one it was told to accelerate). Lower
priority than §0.6 (no direct Bruno evidence either way, and the DB-acceleration technique this
suite already uses makes constructing a true multi-order-same-instant scenario non-trivial), but
worth a mention if this area gets revisited.

### 0.8 — Dev-confirmed: no server-side cleanup mechanism exists; direct-DB-delete with a
recognizable id prefix is the intended approach

Asked Artur directly (Slack, 2026-08-20): *"а у нас есть какой-то механизм очистки рекордов,
ордеров... чтобы то что я создаю тестами, потом вычищать из системы"* His answer: *"Нет механизма
нет, можно из БД руками удалить если нужно на QA, я бы делал определенные префикс для ИД рекорда и
удалял через `recordId LIKE 'QA_PREF_%'`."* This confirms two things this suite already does
correctly, not gaps:
1. Direct DB deletion (`ReferenceDataDb.cleanup()`, used throughout this suite) is the **right**
   approach — there is no API-level or scheduled purge mechanism to prefer instead.
2. A recognizable id prefix for bulk cleanup is exactly what `generateCustomRecordId`/
   `generateCustomId` already produce project-wide (`AQA_<prefix>_<epoch ms>_<3 hex chars>`, e.g.
   `AQA_CORD_1787209795698_148` for every `CURRENCY.ORDER` record this suite creates) — a dev could
   already run `DELETE ... WHERE id LIKE 'AQA_%'` against `currency_order_mock.*` today.

**The one place this convention cannot apply**: `CURRENCY` record ids (`generateRandomCurrencyId`,
3 random letters, no prefix) — the field is business-constrained to exactly 3 characters, so no
prefix fits. This is the confirmed root cause of the `MEJ` id collision investigated earlier this
session (a 2026-08-18 orphaned currency from an interrupted run, not caught by any cleanup because
nothing tracks it). No code fix changes this constraint; it's a structural property of the
`CURRENCY` field, not a gap in our automation. Worth flagging to Dev as a standing, low-probability
risk on this shared environment (3 letters = 17,576 combinations, drawn from by every test suite,
every manual tester, and every crashed/interrupted run, with no expiry) rather than something to
silently work around further in code.

---

## 1. Per-test-case findings

### TC-01 — Smoke: POST valid CURRENCY.ORDER (single pair, 3 bands, BID/ASK/MID)

**Cited criteria**: Happy Path steps 1–4. The pasted TC's own comment already flags: *"Endpoint
paths & exact HTTP codes assumed pending the published API contract (OPEN Q-API)."*

**What's actually proven** (`currency-smoke.spec.ts`, `allureCaseId(2405)`): a `CURRENCY.MARKET`
with `DIFF_AMT=true` is ensured (market `10`), then one order is `INPUT`-ed for `USD`/`EUR` with 3
`AMT_FROM` bands (`0`/`1000`/`10000`), each carrying all three `BID`/`ASK`/`MID` rate types (9
`RATE_BANDS` entries total). Asserts `HTTP_STATUS.OK` (200), `recordId` echoed back,
`CCY_ORDER_STATUS = NEW`, and `RATE_BANDS` has exactly 9 entries.

**Gap — what/why, same two systemic patterns already confirmed elsewhere in this Story**:
1. **`SOURCE_SYSTEM`**: the pasted Steps say `SOURCE_SYSTEM=REUTERS`; the test doesn't override it,
   so it uses the shared builder's default `'TEFO'`. This is the same confirmed seed-data gap as
   the module README documents (`REUTERS` is spec-valid per Confluence, just unseeded on this QA
   environment — `TEFO` is the only value that will actually pass a live POST here today). Not a
   test bug.
2. **HTTP status**: the pasted Expected Result says `201/202`; the test asserts `200`. Same
   systemic Story-text-vs-real-status-code mismatch already confirmed for every other successful
   `INPUT`/`AUTH` in this entire module (see TC-20 finding below) — and the TC's own pasted comment
   already anticipates this ambiguity ("exact HTTP codes assumed pending the published API
   contract"), so this isn't a new discrepancy, just the first case in this Story where that comment
   is directly testable.

**What's NOT a gap**: unlike the currency pair used by the regression suite's `CURRENCY.ORDER`
tests (dedicated random 3-letter ids via `createDedicatedCurrency`), this smoke test uses the
literal `USD`/`EUR` currency ids the pasted TC names verbatim — appropriate for a smoke test that's
meant to exercise the literal happy-path pair, not a randomized regression scenario.

**Policy correction, 2026-08-21**: `SOURCE_SYSTEM` is now submitted as the literal `REUTERS` the
Steps name (not the working-but-undocumented `TEFO`), per the doc-priority correction (see the
ordering note at the top of this file). **Expected consequence**: because `REUTERS` isn't a
registered `CurrencyRatesSourceSystem` value on this environment, the `INPUT` call itself is
expected to come back `400` — the smoke case is expected to go red on the next live run. That's
the intended signal: as literally written, this smoke case cannot pass on this environment today.

**Status-code decision, 2026-08-21 (same day)**: the pasted TC gives two acceptable codes
(`201`/`202`), which itself violates this repo's "always assert exactly one expected status"
convention — see `feedback_always-one-expected-status` in `proj-test-automation`'s memory. Asked the
user which single code to pin down; they chose **the real, confirmed value (`200`)** rather than
guessing between the TC's own two options, since neither is independently more "correct" than the
other absent further BA input. The status assertion is `HTTP_STATUS.OK` (single value); only
`SOURCE_SYSTEM` remains asserted per the document, so this case is still expected to fail live —
just for one clean reason (`400` vs `200`) instead of two entangled ones.

**Not yet run live** — only statically verified (`tsc`/`eslint`/`prettier`), per this repo's
convention that the user runs tests manually.

---

### TC-02 — AC1 + Happy Path steps 8–9 (order flattening, composite PK, event emission)

**Cited criteria**: AC1 (3 amount bands, composite PK `MM.UUUUUUU.USD.EUR`, all three tiers under
one PK), Post-Conditions ("Event Emitted: `CURRENCY.RATES.ACTIVATED`").

**What's actually proven**: an order with a **single** rate tier (the shared `buildOrderData()`
default — `RATE_BANDS: [{ MID, AMT_FROM: '0' }]`) gets processed, produces at least one
`CURRENCY.RATES` row, and that row's id *contains* the market/base/quote id substrings.

**Gap — what/why/how it differs**:
1. ~~**Multi-tier flattening is unverified.**~~ **FIXED 2026-08-20.** AC1 explicitly says
   "containing 3 amount bands" and "all three rate tiers ... in `CURRENCY.RATES`". The test now
   submits 3 distinct `AMT_FROM` tiers (`0`/`1000`/`10000`) and, after activation, reads the
   flattened row's own `RATE_BANDS` back from the DB (`getCurrencyRatesRateBands`, a new helper)
   and asserts it equals the exact 3 submitted tiers — proving the daemon actually preserves all
   of them through flattening, not just that some row exists.
2. ~~**Composite PK format is a substring check.**~~ **FIXED 2026-08-20.** Queried a live
   `currency_rates_mock.liv` row directly (read-only) and confirmed the real `id` format is exactly
   `${CCY_MKT}.${UNIT}.${CCY_BASE}.${CCY_QUOTE}` (e.g. `"1.IJX.IJX.MEJ"`) — matching AC1's
   `MM.UUUUUUU.BBB.SSS` structure field-for-field. The assertion is now an exact `toBe(...)` match
   on that composite key, not a substring `toContain`.

   **Follow-up regression (same day, later run)**: the first version of the 3-band fix used the
   shared `CCY_ORDER_TEST_MARKET_ID` (`"1"`), which live-broke with `400` — *"RATE_BANDS may hold
   only one band because market 1 does not allow amount-based differentiation (DIFF_AMT is
   false)"*. This is `TB-2980` ("RATE_BANDS amount ranges gated by market's DIFF_AMT", In Progress
   per the Jira snapshot above) confirmed live: a market's own `DIFF_AMT` flag gates whether its
   orders may carry more than one distinct `AMT_FROM`, and the shared market `"1"` (created in this
   suite's own `beforeAll` with `DIFF_UNIT=false, DIFF_AMT=false`) doesn't allow it. Fixed by
   reusing market `"10"` — already established elsewhere in this codebase
   (`currency-smoke.spec.ts`, `allureCaseId(2255)`, "Create market with DIFF flags = true") as *the*
   `DIFF_UNIT=true, DIFF_AMT=true` market — instead of inventing a new one or mutating the shared
   `"1"` (which 17 other tests in this same describe depend on, and which a separate test
   elsewhere in this very file explicitly asserts is `DIFF_AMT=false`). TC-02 now idempotently
   INPUTs market `"10"` itself (safe — confirmed elsewhere in this file that re-INPUT of an
   existing market is an accepted idempotent upsert) rather than assuming the smoke suite already
   created it, so there's no cross-file test-order dependency.
3. **`CURRENCY.RATES.ACTIVATED` event emission is not checked at all.** Still open — the framework
   has no Kafka/outbox consumer; the only confirmed event names in this codebase are the generic
   `RECORD_CREATED`/`UPDATED` (TB-2970), and the specific `CURRENCY.RATES.ACTIVATED` name is never
   mentioned in the dev-sync transcript either. This is the AC's own explicit Post-Condition and
   remains entirely unproven — needs a Kafka test-consumer building block plus dev confirmation of
   the real event name before this can be automated at all.

   **New signal, 2026-08-21 (still not proof either way)**: a direct read-only query found
   `currency_rates`'s own `processed_event` table (definition schema) **completely empty** — zero
   rows — while `currency_order`'s `processed_event` is populated with `RECORD_CREATED`/
   `RECORD_UPDATED` rows. If `CURRENCY.RATES.ACTIVATED` were emitted through the same table-template
   outbox/processed-event pipeline every other event in this module uses, this table shouldn't be
   completely empty. This is a signal that the event is either not emitted through that standard
   pipeline at all, or is emitted through a separate, bespoke path this DB-only inspection can't see
   — not a confirmed absence. Doesn't change the verdict (still unproven, still blocked on a Kafka
   consumer + dev confirmation of the real mechanism), but worth mentioning to Dev alongside the
   event-name question.

4. **FIXED 2026-08-21** — added a direct DB check (`getCurrencyOrderStatusFromDb`) confirming
   `CCY_ORDER_STATUS` is `PROCESSED` in `currency_order.liv` itself, not only via the API's `SEE`,
   plus a check that the order has left `NAU` — narrows "the API says PROCESSED" to "the DB record
   itself says PROCESSED and is fully committed," per the user's broader ask that this suite lean on
   direct DB verification wherever the module's DB schema supports it, not only API responses.

---

### TC-05 — AC3 (future `START_DATETIME` stays `NEW`)

**Cited criteria**: AC3.

**What's actually proven**: order stays `NEW`; `CURRENCY.RATES` has zero rows for that
`ORDER_ID` while `START_DATETIME` is in the future (~24h out, the shared default).

**Gap**: none of substance. This is a solid, direct proof of AC3 — arguably a *stronger* check than
AC3 asks for (it confirms zero rows exist at all, not just "not queryable"). No action needed.

---

### TC-06 — Happy Path step 9 (rate becomes active/queryable at `START_DATETIME`)

**Cited criteria**: Happy Path step 9.

**What's actually proven**: after DB-accelerating the schedule task to fire "now," the order
reaches `PROCESSED`, a `CURRENCY.RATES` row appears, and a real `SEE` against
`CURRENCY.RATES~MASTER` for that row returns 200.

**Gap — what/why**: "exactly at `START_DATETIME`" is proven via the DB-acceleration technique
(`forceCurrencyOrderScheduleTaskToFireNow`), not by literally waiting for the real wall-clock
instant to arrive. This is a deliberate, already-approved substitution (real-time waiting to a
`START_DATETIME` beyond the 1-hour cutoff would make the test impractically slow), but it means the
test proves "the daemon correctly activates a due order when its schedule fires," not literally
"the rate turns queryable at the precise real-world second `START_DATETIME` is reached." Worth
stating this plainly to Manual QA/Dev so nobody assumes real-time precision was verified. Also
shares TC-02's single-rate-tier limitation (same default order builder).

---

### TC-07 — AC4 + Happy Path step 10 (expired rate purge)

**Cited criteria**: AC4 ("immediately purges the expired rate from the cache"), Happy Path step 10.

**What's actually proven (as of the 2026-08-21 rewrite below)**: a `SEE` on a `CURRENCY.RATES` row
whose `END_DATETIME` has been moved into the past is rejected (`status !== 200`), **and** the row
is asserted to have moved from `LIV` to `HIS`. The second assertion currently fails live on this
environment — see the decision note below for why that's intentional.

**Gap — what/why, the important one**: AC4 and Happy Path step 10 both describe an **active daemon
purge** ("the daemon processes its cycle... immediately purges the expired rate"). Confirmed live
on `qa.proj.local`: `currency_rates` has **no** `schedule_task_db_scheduler` row (unlike
`currency_order`, which is the only one of the four module tables with a live scheduled background
processor) — there is no scheduled job that could purge anything from `CURRENCY.RATES` at all. The
only confirmed mechanism is `proj-currency-rates-expiry-plugin`, bound on `SEE`/`POST`, which is a
**lazy, read-time rejection**, not an active purge. This was tested as a hard "must be deleted"
assertion earlier this same day and reverted after a live run confirmed the row is never deleted —
matching this architecture finding exactly. **The AC/Happy-Path text and the confirmed system
architecture describe two different mechanisms** (active purge vs. lazy read-time reject). This is
the single clearest item for Manual QA + Dev to reconcile: either the "purged (deleted) from the
cache" wording needs correcting to describe a read-time reject, or there is a genuinely missing
active-purge feature that AC4 expected and was never built.

**What would close it**: a dev confirmation of which of the two is intended. If lazy-reject is the
real, accepted design, Manual QA updates AC4/TC-07's wording and the current soft-log test is
already sufficient (just needs a status-code assertion, once confirmed, added back for the `SEE`
rejection). If active purge was actually expected, this is a product gap, not a test gap.

**2026-08-21 update — manual QA's fresh clarification is directly contradicted by live DB
evidence, needs a decision before any code change.** The user relayed a new manual-QA clarification
for TC-07: *"после END_DATETIME рекорд должен перейти в HIS, а до окончания его там быть не
должно"* (after END_DATETIME the record should move to HIS, and shouldn't be there before). A
direct, read-only query against `qa.proj.local` (2026-08-21) found:
- `currency_rates_mock.liv` currently holds **5 rows whose `END_DATETIME` is already in the past**
  (the oldest ~2 days old, e.g. id `10.MOCK.USD.EUR`, `END_DATETIME: 2026-08-19T19:49:31`) — if a
  HIS-transition-on-expiry mechanism existed and worked, none of these should still be sitting in
  `liv` this long after expiring.
- `currency_rates_mock.his` does have rows (28), but the mechanism populating it is standard
  table-template **update-versioning** (every `RECORD_UPDATED`/supersession moves the *prior*
  revision to `his`), not expiry — confirmed by finding the same id (e.g. `10.MOCK.USD.EUR`) in
  both `his` (an older revision) and `liv` (the current one) simultaneously, exactly the shape
  TC-18's superseding-order behavior already produces, unrelated to `END_DATETIME`.
- `information_schema.triggers` for `currency_rates_mock` returned **zero rows** — no DB trigger
  could be doing this either.
- Re-confirms the pre-existing finding: `currency_rates` (definition schema) still has no
  `schedule_task_db_scheduler` table (unlike `currency_order`) — no scheduled job exists that could
  move anything to `his` on expiry.

This doesn't prove a bespoke Java-side mechanism *couldn't* exist entirely outside the DB layer
(e.g. a batch service that reads and re-writes rows through a path this DB-only inspection can't
see) — but the direct, current evidence (expired rows still sitting in `liv` for ~2 days) makes
that very unlikely to be *working* today, whatever the intent.

**Decision, 2026-08-21 (same day, later): write the test to the spec, not to the confirmed-broken
reality.** After a live run confirmed a first attempt (asserting the *current* behavior — row
stays in `LIV`, never appears in `HIS`) passes green, the user explicitly decided that's the wrong
thing to lock in: *"надо сделать как описано в ТС, а не как реально"* (do it as the TC describes,
not as it actually is). Rewritten again: STEP 3 now asserts the row has **left `LIV`** and is
**present in `HIS`** once `END_DATETIME` passes — i.e. asserts the *intended* AC4/manual-QA
behavior, not the confirmed-current one. A new check was also added right after the rate is first
created (before `END_DATETIME` is moved into the past) asserting it is **not yet** in `HIS` —
covering the other half of manual QA's clarification ("до окончания его там быть не должно").

**Expected consequence, stated plainly so a live-run failure isn't mistaken for test flakiness**:
given the DB evidence above (no trigger, no `schedule_task_db_scheduler` for `currency_rates`, 5
real rows sitting expired in `liv` for up to ~2 days), this test is **expected to fail (red)** on
this environment today. That red is the point — the test now stands in place of a filed defect,
proving the intended behavior is missing rather than silently agreeing with the gap. Do not
"fix" this test back to soft-checking current behavior if it goes red; that would be re-hiding the
same gap this rewrite exists to surface. Closing it requires either Dev shipping the HIS-transition
mechanism, or Manual QA formally correcting AC4/TC-07's wording — at which point this test's
assertions get revisited alongside that decision, not before.

---

### TC-08 — AC5 / Alt1 (corrupted tier, daemon-time ACID rollback) — REMOVED from the suite, 2026-08-21

**Cited criteria**: AC5, Alt1, BR "Atomic Save (ACID)".

**Status: `Not Automatable` (pending Manual QA/Dev decision) — deleted from
`currency-regression.spec.ts`, not left in with a caveat.** The user explicitly flagged that
shipping this as "Automated" while it silently proved a different scenario than the cited Expected
Result was the wrong call, and had it pulled from the run rather than patched further.

**What the (now-removed) test actually proved**: an `INPUT` containing one tier with an invalid
`RATE_TYPE` ("SPOT") was rejected outright with 400; a follow-up `SEE` confirmed nothing was staged
(404); a later same-day patch also confirmed zero `CURRENCY.RATES` rows for that id.

**Why that was the wrong thing to ship as "Automated", not just an imperfect test**:
1. **Wrong layer/timing.** AC5/Alt1 both frame this as a **daemon-time** failure: "WHEN the daemon
   attempts to unpack and save the data... the database transaction fails... status set to
   `ERROR`." Our test proves an **INPUT-time schema validation** rejection instead — the order
   never reaches `CURRENCY.ORDER` at all (confirmed 404 on `SEE`), so there is no record for the
   daemon to ever touch, let alone set to `ERROR`. The test's own STEP 2 assertion (404, nothing
   staged) is the literal opposite of AC5's stated post-condition (a record exists with
   `STATUS = ERROR`).
2. **The literal trigger doesn't exist in the real schema.** AC5's "corrupted currency code within
   a tier" has no field to express — `RATE_BANDS` carries no per-tier currency code (`AMT_FROM`/
   `RATE_TYPE`/`RATE_VALUE` only; `CCY_BASE`/`CCY_QUOTE` are scalar, order-level fields). This is a
   known leftover of an earlier, later-rejected nested `CURRENCY_PAIRS[]` design (2026-07-22/23 team
   chat).

**Lesson for this role**: when a test can only prove a materially different scenario than the one
its Expected Result names — not just a narrower proof of the *same* scenario — marking it
`Automated` with an inline caveat is not an acceptable substitute for escalating to Manual QA
before automating at all. A green test that proves the opposite of its own cited post-condition is
worse than no test, because it reads as real coverage on a dashboard/Allure status field. Patching
it further (adding a `CURRENCY.RATES`-untouched assertion) only made it look more thorough without
fixing the core problem — it should have been escalated as `Not Automatable`, not shipped and then
incrementally polished.

**What would actually close this**: a genuine way to force a daemon-time ACID failure without
inventing an unconfirmed corruption vector (same blocker as TC-17 below). Until Dev identifies one,
this stays `Not Automatable`, not `Automated` with a footnote. No test exists in the suite for
TC-08 as of 2026-08-21 — this is an honest, visible gap, not a green checkmark masking one.

---

### TC-09 — AC6 / BR Explicit Rate Typology (MID-only order valid)

**Cited criteria**: AC6, BR "Explicit Rate Typology" — note the BR's own text has a second,
negative clause: *"auto-spread calculation is strictly prohibited."*

**What's actually proven**: a MID-only order is accepted with 200 and staged.

**Gap — what/why**: only the positive half of the BR is tested. The negative half — that the
system does **not** silently synthesize `BID`/`ASK` values from the single `MID` rate — is never
checked. The test doesn't read the staged record back to confirm `RATE_BANDS` still contains
exactly the one submitted `MID` tier and nothing else.

**FIXED 2026-08-20**: added a `SEE` after staging that asserts `RATE_BANDS` equals exactly the one
submitted `MID` band — no extra auto-derived `BID`/`ASK` entries. Both halves of the BR are now
proven.

---

### TC-10 — "Reject order with more than one currency pair"

**Cited criteria**: User Story / V1.1 ("one pair per order restriction").

**What's actually proven**: submitting an **array** of two ids for the scalar `CCY_BASE` field
(instead of one string) is rejected with 400.

**Gap — what/why**: this is structurally impossible to test as literally worded. The shipped
schema has scalar `CCY_BASE`/`CCY_QUOTE` — there is no way to construct a well-formed request
carrying "2 currency pairs" at all (the team explicitly designed and rejected a nested
`CURRENCY_PAIRS[]` array for this per the 2026-07-22/23 chat). What's actually being proven is
basic JSON-schema type validation (array supplied where a scalar is expected), which is a much
weaker/different property than "the business rule limiting orders to one pair is enforced" — the
schema itself makes a second pair unrepresentable, so there is no business-rule *enforcement* to
test, only a type-mismatch rejection that would fire for the same reason on *any* scalar field.

**What would close it**: nothing to change in code — this is a Manual QA wording issue. Recommend
rewording TC-10 to describe what's actually being verified (rejection of a malformed/wrong-type
payload), or retiring it in favor of documenting the "one pair by design" constraint elsewhere.

---

### TC-11 — BR Source Tracking (missing/untraceable `SOURCE_SYSTEM`)

**Cited criteria**: BR "Source Tracking" — exact text: *"Missing/untraceable source results in
rejection: 'Untraceable rate feed ignored'."*

**What's actually proven**: omitting `SOURCE_SYSTEM` → 400; an unrecognized value
(`UNTRACEABLE_FEED`) → 400.

**Gap — what/why**: (1) status code 422 (BR text) vs. 400 (asserted, confirmed-live) — see §0.1.
(2) the specific rejection message **"Untraceable rate feed ignored" is never asserted** — deliberately
left out because no Bruno/live confirmation of that exact phrase exists yet (per the 2026-08-19
audit). As written, the test would pass identically if the 400 came from a completely unrelated
validation failure elsewhere in the same payload — it proves "a 400 happens," not "specifically the
Source Tracking rule fired."

**Partially resolved 2026-08-21 — with an honest caveat.** Manual QA supplied the exact wording
expected for the missing-field sub-case; the test now asserts the response body contains
`"required property 'SOURCE_SYSTEM' not found"` for STEP 1 (omitted field). **Re-checked against a
fresh `origin/main` fetch (same pass that caught TC-13's overclaim): `INPUT - Reject Missing
SOURCE_SYSTEM.yml` (`~MASTER`) asserts only `expect(res.status).to.equal(400)` — no message text
at all — and a repo-wide search for this exact phrase, or the generic "required property ... not
found" pattern, finds it nowhere else in Bruno either.** This assertion is implemented per the
user's direct instruction (the manual-QA-updated case text), not because Bruno independently
confirms it — flagged here so a first live run is the actual confirmation, not an assumption. The
second sub-case (`SOURCE_SYSTEM: 'UNTRACEABLE_FEED'`, an unrecognized but present value) still has
no Bruno file and no confirmed message text — left as status-only. §0.1's 422-vs-400 point still
applies to both sub-cases (both assert `400`).

---

### TC-12 — BR Explicit Rate Typology (invalid `RATE_TYPE`)

**Cited criteria**: BR "Explicit Rate Typology" — exact text: *"every rate must be explicitly
labeled as `BID`, `ASK`, or `MID`."*

**What's actually proven**: `RATE_TYPE = "SPOT"` → 400, and the response body names the allowed
list.

**Partially resolved 2026-08-21 — with an honest caveat, stronger than TC-11's.** Added
`.toContain('RATE_BANDS[0].RATE_TYPE - value is not in the allowed list: [BID, ASK, MID]')` per
manual QA's updated case text. **Re-checked against a fresh `origin/main` fetch: there is no Bruno
file anywhere that tests rejecting an invalid `RATE_TYPE` on `CURRENCY.ORDER` at all** — not the
message, not even the status code. (The only `RATE_TYPE`/`"SPOT"` hits in the repo are the field's
own `enum` definition and an unrelated Currency Engine response example — not a rejection test.)
This assertion, including the `400` status itself, rests entirely on this suite's own earlier live
testing and the manual-QA-updated case text — not on any Bruno confirmation. Same as TC-11: this
is implemented per direct user instruction, flagged so a first live run is the real confirmation.
§0.1's 422-vs-400 point still applies.

---

### TC-13 — AC7 / BR Validation Time-Lag (inside-buffer rejection) — REWRITTEN 2026-08-21

**Cited criteria**: AC7, BR "Validation Time-Lag".

**Correction to this file's own prior finding**: §0.3 above previously claimed the cutoff plugin
enforces only at `AUTH`, not `INPUT` — that was checked again directly against a fresh
`origin/main` fetch of `proj-bruno-api` and found to be **wrong**. `09 Bind CURRENCY.ORDER~MASTER
hooks.yml` binds `proj-currency-order-cutoff-plugin` on **both** `INPUT/PRE` (`executionOrder: 2`)
and `AUTH/PRE` (`executionOrder: 1`), and a dedicated Bruno file (`INPUT - Reject START_DATETIME
Inside The Cutoff Lag.yml`) proves the `INPUT`-side rejection directly: POSTs with `START_DATETIME`
= now+2min, asserts `400`, body containing `"execution lag buffer"`, and
`res.body.properties.errors` naming `START_DATETIME`.

**What's actually proven now**: an order with `START_DATETIME` = now + 2 minutes (matching the
pasted Steps literally, and genuinely inside the now-confirmed real 300s/5-minute buffer per §0.2)
is rejected at `INPUT` itself with `400`, body containing `"execution lag buffer"` and the error
keyed on `START_DATETIME`; a follow-up `SEE` confirms nothing was staged. No `AUTH` call is made —
the order never reaches a state where one would apply. This now matches AC7's own literal wording
("an administrator attempts to submit or schedule... THEN the system rejects the transaction") —
previously this file said that wording *didn't* match reality; it does.

**Policy correction, 2026-08-21 (later same day)**: reverted back to asserting the pasted TC's
full literal sentence (`"START_DATETIME violates the configured execution lag buffer"`), dropping
the narrower Bruno-confirmed-substring version above. Per the doc-priority correction, the TC text
is what gets asserted; if the real message differs from this literal sentence, that's exactly the
kind of divergence meant to surface as a live-run failure and get raised with Dev, not be quietly
avoided by asserting a weaker, safer substring.

---

### TC-14 — BR Validation Time-Lag (historical activation)

**Cited criteria**: BR "Validation Time-Lag" (same row as TC-13/AC7, same quoted message).

**What's actually proven**: `START_DATETIME` 24h in the past → rejected 400 **at `INPUT`**.

**Gap — what/why**: this rejection fires at `INPUT` time via `proj-currency-order-validation-plugin`
(`executionOrder: 1`, runs before `proj-currency-order-cutoff-plugin`'s own `INPUT`-side check at
`executionOrder: 2` — see §0.3, corrected 2026-08-21: the cutoff plugin is now confirmed bound on
both `INPUT` and `AUTH`, not `AUTH`-only as this file previously said). The Story's BR table
presents "too-soon-future" and "already-past" as one rule with one message; the real system
enforces them via two different hooks, both at `INPUT`, running in a fixed order — not the
INPUT-vs-AUTH split this file previously described. TC-13 and TC-14 no longer diverge on *where*
they're enforced (both at `INPUT` now), only on *which* hook catches them.

**FIXED 2026-08-20 (partial)**: `proj-bruno-api`'s `INPUT - Reject START_DATETIME In The Past.yml`
(`CURRENCY.ORDER~MASTER`) confirms the rejection body **echoes back the submitted `START_DATETIME`
value** (not the fixed phrase "violates the configured execution lag buffer" — Bruno's own script
never asserts that phrase either). Added a matching assertion that the response body contains the
exact submitted `START_DATETIME` string.

**Policy correction, 2026-08-21**: tightened further to the pasted TC's full literal message
template — `"START_DATETIME <value> must not be in the past"` — instead of just the bare echoed
value. Per the doc-priority correction (top of file), this is the literal text to assert
regardless of Bruno confirmation; if real behavior's wording differs, that's the divergence to
raise with Dev.

---

### TC-15 — AC8 / BR Staged In-Flight Cancellation (cancel while `NEW`)

**Cited criteria**: AC8, BR "Staged In-Flight Cancellation".

**What's actually proven**: solid — stage→authorize→resubmit as `CANCELLED`→authorize the change→
confirm `CANCELLED`→force the schedule cycle→confirm the daemon leaves it `CANCELLED` and produces
no `CURRENCY.RATES` row.

**Gap — minor, wording only**: the pasted Steps say "PATCH /currency-orders/{id} status =
CANCELLED" — there is no `PATCH` verb anywhere in this API. A status change is a second `INPUT` +
`AUTH` on the same `recordId` (confirmed: no PATCH/CANCEL endpoint exists anywhere in this system).
This is already dev-confirmed correct behavior — flagging only so Manual QA updates the TC's Steps
wording to match the real API shape (no functional gap).

---

### TC-16 — Block cancellation of a `PROCESSED` order

**Cited criteria**: BR "Staged In-Flight Cancellation"; pasted Expected Result: **"HTTP 409"**.

**What's actually proven**: a genuinely daemon-`PROCESSED` order (staged → authorized → real
force-fire → waited for `PROCESSED`) gets a **400**, not 409, when a cancellation is attempted;
the rejection body is confirmed, 2026-08-19, to be exactly
`"order <id> is PROCESSED - only an order with CCY_ORDER_STATUS NEW can be changed"` on `~MASTER`.

**RESOLVED 2026-08-21**: tightened the assertion from a loose two-substring check
(`'CCY_ORDER_STATUS'`, `'PROCESSED'`) to the full confirmed phrase above (with the real `recordId`
interpolated in) — proves the exact rejection reason, not just that those two words appear
somewhere in the body. **Confirmation-source caveat (re-checked 2026-08-21)**: `proj-bruno-api`'s
own `INPUT - Reject PROCESSED To CANCELLED.yml` exists only on `CURRENCY.ORDER~BATCH`, not
`~MASTER` (this suite's projection), and even there it asserts three separate substrings
(`"CCY_ORDER_STATUS"`, `"PROCESSED"`, `"NEW"`), not the one glued-together sentence this test now
checks. The full sentence is confirmed a different, legitimate way — a direct live run against
`~MASTER` on 2026-08-19 (recorded in this Story's module README) — not by Bruno. That's a solid
source, just worth knowing it's live-run evidence rather than a Bruno file, and worth re-confirming
on the next live run since it's now nearly two days old.

**Policy correction, 2026-08-21**: the assertion previously followed the live-confirmed `400`
instead of the pasted TC's `409`. Per the doc-priority correction (top of file), switched to assert
`HTTP_STATUS.CONFLICT` (`409`) as the TC literally states. **Expected consequence**: since the
real, confirmed system returns `400`, this test is expected to go red on the next live run — that
failure is the mechanism for raising "Story says 409, system returns 400" with Dev, not a bug in
the test. Don't revert this back to `400` without a corrected TC or explicit sign-off.

---

### TC-17 — Block cancellation of an `ERROR` order

**Cited criteria**: BR "Staged In-Flight Cancellation"; pasted Expected Result: **"HTTP 409"**.

**What's actually proven**: an order forced directly to `CCY_ORDER_STATUS = ERROR` via `INPUT`
(not a genuine daemon-time failure) gets `400` when cancellation is attempted; the rejection body
is confirmed to be exactly
`"order <id> is ERROR - only an order with CCY_ORDER_STATUS NEW can be changed"` on `~MASTER`.

**RESOLVED 2026-08-21**: same tightening as TC-16 — asserts the full confirmed phrase instead of a
loose substring check. Same confirmation-source caveat as TC-16 applies: Bruno's
`INPUT - Reject ERROR To CANCELLED.yml` exists only on `~BATCH` and asserts three substrings, not
the glued sentence; the full sentence is live-run-confirmed against `~MASTER` (2026-08-19), not
Bruno-confirmed.

**Policy correction, 2026-08-21**: same as TC-16 — now asserts `409` per the pasted TC, expected to
go red live since the confirmed real status is `400`.

**Gap — still open**: **the precondition is artificial** — there's no known way to make an order
reach `ERROR` through a genuine daemon-time failure (same missing-corruption-vector problem as
TC-08/AC5), so the test directly sets the status via `INPUT` instead of proving the daemon itself
ever produces an `ERROR` order this way. TC-16 was upgraded to a genuine daemon-processed
precondition earlier this project; TC-17 was explicitly left with the artificial one because no
genuine trigger is known.

---

### TC-18 — Alt2 (superseding order overwrites active rates)

**Cited criteria**: Alt2 ("Superseding Active Rates").

**What's actually proven**: solid — two orders processed sequentially for the identical
market/BU/pair key; `CURRENCY.RATES` ends up holding only the second (superseding) order's id for
that key.

**Gap — minor**: Alt2's wording specifies "with **overlapping dates**" — the test doesn't
deliberately construct or assert an overlapping `START_DATETIME`/`END_DATETIME` window between the
two orders (both just use the default 24h-out start / 48h-out end derived independently per call).
In practice the two orders' windows are likely to overlap by construction, but this isn't engineered
or asserted explicitly, so "overlap" isn't a verified precondition of the observed overwrite.

**FIXED 2026-08-20**: both orders now get an explicit `END_DATETIME` set to their own
`START_DATETIME + 24h` instead of the base builder's independently-derived default. Since the
superseding order's `START_DATETIME` (computed after the first order's PRECONDITION step already
ran real wall-clock time) is only minutes after the initial order's own `START_DATETIME` — nowhere
near the initial order's now-explicit `+24h END_DATETIME` — the two windows overlap by construction,
guaranteed rather than incidental.

---

### TC-19 — Adapter without ESB permission is rejected — RESOLVED 2026-08-21

**Cited criteria**: Pre-Conditions ("ESB credentials that LACK the `CURRENCY.ORDER` submit
permission"); the pasted table's own comment: **"OPEN Q: negative auth not explicit -> confirm."**

**What was previously proven (superseded)**: a request carrying a plain invalid/garbage bearer
token — an **authentication** (authN) failure, not the **authorization** (authZ) failure the
precondition actually describes (a valid identity lacking one specific grant). The pasted TC's own
"OPEN Q" flagged exactly this ambiguity.

**RESOLVED 2026-08-21**: manual QA supplied a real SMS authorization test-fixture doc naming six
provisioned SM.USER profiles across INTERNAL/EXTERNAL/SYSTEM classifications, each in a full- and
no-permission pair, specifically for authZ testing. A first pass wired TC-19 to a new
`proj-sms-test-system-none` service-account client (`client_credentials` grant) matching that doc's
SYSTEM row — then the user pointed out this repo already has an equivalent, existing fixture:
`USERS_DATA.USER_WITHOUT_PERM` (`user-credentials.values.ts`, username `NO_perm`, id from
`USER_WITHOUT_PERM_ID` in `.env`), already used elsewhere in this suite for the identical
"authenticated but no permission" scenario. TC-19 now authenticates via
`createAuthenticatedApiContext` with `USERS_DATA.USER_WITHOUT_PERM.CREDENTIALS` (username/password
grant) instead — same precondition satisfied (a genuinely authenticated identity with zero table
grants), reusing an established fixture rather than introducing a new client/secret. The
`SMS_TEST_SYSTEM_NONE_CLIENT_ID`/`_SECRET` env vars added in the first pass were removed again —
unused once this switch landed.

**Status-code decision, 2026-08-21 (same day)**: initially asserted a `[401, 403]` hedge (the
pasted TC's own "HTTP 401/403" and the doc's "Expected Behavior" column don't pin one code
either). Per this repo's "always assert exactly one expected status" convention
(`feedback_always-one-expected-status`), tightened to a single value: **403 Forbidden**. Unlike
TC-01/TC-20 (where neither of the TC's two options was independently more defensible than the
other), this one has a clear, confident answer from plain REST/security semantics — 401 means "I
don't know who you are," 403 means "I know who you are, but you can't do this." Since the caller
is now a genuinely authenticated identity that simply lacks a grant (not an invalid/garbage
token), 403 is the correct single code, not a guess between two documented options. The
order-never-staged follow-up check is unchanged.

---

### TC-20 — BR Validation Time-Lag, positive boundary — RESOLVED 2026-08-21

**Cited criteria**: BR "Validation Time-Lag"; pasted Expected Result: **"HTTP 201/202"**.

**What's actually proven now**: `START_DATETIME` = now + 6 minutes (the pasted Steps' literal
value, genuinely just outside the now-confirmed real 300s/5-minute buffer — see §0.2) → `INPUT`
200, `AUTH` 200, plus a direct DB read confirming `CCY_ORDER_STATUS` is `NEW` in
`currency_order.liv` itself and that the record has left `NAU`.

**Status-code decision, 2026-08-21**: the pasted TC gives two codes (`201`/`202`) — a multi-value
hedge that violates this repo's "always exactly one expected status" convention. Same resolution
as TC-01: asked the user, who chose the real, confirmed single value (`HTTP_STATUS.OK`, `200`)
over guessing between the TC's two options. So this `INPUT` status assertion currently matches
real behavior, not the pasted TC's `201/202` — a known, deliberate exception to the doc-priority
policy above, made because the doc itself didn't commit to one value. The `AUTH` call's own `200`
assertion is unaffected — the pasted TC only describes the `INPUT`/staging response, not `AUTH`.

---

### TC-21 — Reject `END_DATETIME` not strictly after `START_DATETIME`

**Cited criteria**: not explicit in the User Story; pasted comment: **"OPEN Q: confirm
validity-window validation with @Mikalai."**

**What's actually proven**: `END_DATETIME == START_DATETIME` → 400 + nothing staged;
`END_DATETIME < START_DATETIME` → 400 (soft assertions) + nothing staged.

**Gap — what/why**: the 400 (vs. the pasted 422) follows the same pattern as §0.1. It was
previously flagged as *not individually Bruno-confirmed* for this specific rule, unlike TC-11/12/
13/14 — that has since been resolved (see `FIXED` note below), so this status-code choice is no
longer a bare inference for either sub-case.

**FIXED 2026-08-20**: found and read the exact matching Bruno files for both sub-cases —
`INPUT - Reject Equal START And END.yml` and `INPUT - Reject END_DATETIME Before START_DATETIME.yml`
(both `CURRENCY.ORDER~MASTER`). Both confirm `400` (settling the status-code question for this TC
specifically, independent of §0.1's broader pattern) **and** that the rejection body echoes back
the submitted datetime value(s) — the equal-dates file asserts the body contains the one shared
value, the before-case file asserts it contains *both* the submitted `START_DATETIME` and
`END_DATETIME`.

**Policy correction, 2026-08-21**: tightened both sub-cases from "contains both values somewhere"
to the pasted TC's full literal connecting template — `"END_DATETIME <end> must be later than
START_DATETIME <start>"` — instead of two independent substring checks. Bruno confirms the two
values are echoed but not this exact connecting phrase; per the doc-priority correction, the TC's
literal wording is what gets asserted, so a live run is what will actually confirm or refute it.
@Mikalai's sign-off is still worth getting since the pasted TC itself flagged this as unconfirmed
against the Story text.

---

## Summary table (for a quick walkthrough)

| TC | Cites | Fully proven? | Core gap (✅ = fixed 2026-08-20) |
|----|-------|----------------|----------|
| TC-01 | Happy Path 1-4 | Written to spec (status excepted), expected RED | ✅ `SOURCE_SYSTEM: REUTERS` per the pasted TC (doc-priority); status asserts the single real value `200`, not the TC's ambiguous `201/202` hedge, per user decision (see §ordering note); expected to fail live on `SOURCE_SYSTEM` alone |
| TC-02 | AC1 | Partial | ✅ 3-band flattening + exact PK + DB-level STATUS/NAU-exit check now proven (2026-08-21); event emission still unproven (blocked, no Kafka consumer — see DB `processed_event` finding below) |
| TC-05 | AC3 | Yes | — |
| TC-06 | Happy Path 9 | Partial | activation proven via DB-acceleration, not real wall-clock — accepted, deliberate substitution |
| TC-07 | AC4 / HP10 | **Written to spec, expected RED on this environment (2026-08-21)** | asserts the row leaves `LIV` and appears in `HIS` at expiry, per manual QA's clarification — live DB evidence shows this mechanism doesn't exist today, so the test is expected to fail until Dev ships it or Manual QA corrects the wording; see the dedicated finding below |
| TC-08 | AC5 / Alt1 | **Not Automatable — removed 2026-08-21** | previously shipped `Automated` while proving the opposite of half its own Expected Result; deleted rather than patched further, pending a genuine daemon-time trigger from Dev |
| TC-09 | AC6 / BR | Yes | ✅ negative half ("no auto-spread") now asserted too |
| TC-10 | User Story V1.1 | Weak | proves type-validation, not the "one pair" business rule (unrepresentable otherwise) — Manual QA wording only, no code fix possible; **manual QA confirmed 2026-08-21 the case is fine as-is** |
| TC-11 | BR Source Tracking | Partial | ✅ status + exact message (`"required property 'SOURCE_SYSTEM' not found"`) now asserted for the missing-field sub-case (2026-08-21); the unrecognized-value sub-case still status-only, pending confirmed message text |
| TC-12 | BR Rate Typology | Yes | ✅ status + exact message (`"...not in the allowed list: [BID, ASK, MID]"`) now asserted (2026-08-21) |
| TC-13 | AC7 / BR Time-Lag | Yes (per doc) | ✅ RESOLVED 2026-08-21 — buffer corrected to 300s/5min (matches Story), enforced at INPUT (not AUTH, see §0.3), single `400` status, asserts the TC's full literal message sentence (not Bruno-confirmed as one string — doc-priority policy, see top of file); see §0.2 |
| TC-14 | BR Time-Lag | Yes (per doc) | ✅ now asserts the TC's full literal message template (`"START_DATETIME {value} must not be in the past"`), not just the echoed value |
| TC-15 | AC8 / BR Cancellation | Yes | Steps wording says "PATCH" (doesn't exist) — cosmetic only |
| TC-16 | BR Cancellation | Written to spec, expected RED | ✅ policy correction 2026-08-21 — now asserts `409` per the TC (confirmed real status is `400`), expected to fail live; message assertion unchanged (live-confirmed phrase) |
| TC-17 | BR Cancellation | Written to spec, expected RED | ✅ same `409` correction as TC-16, expected to fail live; artificial `ERROR` precondition still unresolved |
| TC-18 | Alt2 | Yes | ✅ overlapping windows now deliberately engineered, not incidental |
| TC-19 | Pre-Conditions | Yes | ✅ RESOLVED 2026-08-21 — genuinely-authenticated zero-permission SYSTEM service account (`proj-sms-test-system-none`), closing the authN-vs-authZ gap; status tightened from a `[401,403]` hedge to a single `403` (correct REST semantics for a valid-but-unpermissioned caller) |
| TC-20 | BR Time-Lag | Yes (status excepted) | ✅ literal "6 minutes" now achievable (real buffer is 300s); `INPUT` status asserts the single real value `200`, not the TC's ambiguous `201/202` hedge, per the same user decision as TC-01; DB-level NEW/left-NAU check unchanged |
| TC-21 | (unconfirmed) | Yes (per doc) | ✅ both sub-cases now assert the TC's full literal connecting phrase ("END_DATETIME ... must be later than START_DATETIME ..."), not just that both values appear somewhere |

Fixed 2026-08-20 (no new scenario invented, just made the test assert what the existing TC/AC/BR
already describes): **TC-02, TC-09, TC-14, TC-18, TC-21**. **TC-08 was removed from the suite
2026-08-21** (see its own entry above) rather than patched further — it had been shipped
`Automated` while actually proving the opposite of half its own Expected Result, which is a worse
outcome than leaving it `Not Automatable`. Everything else needs either a Manual QA wording
decision, a Dev architecture confirmation, or infrastructure this framework doesn't have — none of
those are something AQA can resolve by editing test code alone.
