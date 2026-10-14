Module: Currency Definition and Logic (EP-01.13 / TB-8)
Stories: [US-01.13.01](US-01.13.01/README.md) (TB-1987), [US-01.13.02](US-01.13.02/README.md) (TB-1988), [US-01.13.03](US-01.13.03/README.md) (TB-1989), [US-01.13.04](US-01.13.04/README.md) (TB-1990)
Automation branch: group-3/TB-2960 (proj-test-automation)
Last updated: 2026-09-25

**2026-09-25**: regression run failure on Allure 3110 ("Superseding order overwrites active rates
for the same market/BU/pair", US-01.13.02) — **resolved same day as a confirmed test bug**, not a
backend/daemon issue. The rate write succeeded correctly; `getCurrencyRatesOrderIdsForKey`'s jsonb
containment query just couldn't find it because `CURRENCY.RATES.UNIT` is persisted as an *omitted*
key (not `""`) for a `DIFF_UNIT: false` market, and the query's key included `UNIT: ""` literally —
the same omitted-vs-empty pattern already known on `CURRENCY.ORDER.UNIT` (TB-3588), now confirmed on
the `CURRENCY.RATES` read side too. Fixed at the source in `currency-helper.ts` (~14 call sites
benefit). See
[US-01.13.02/bug-superseding-order-rates-not-written.md](US-01.13.02/bug-superseding-order-rates-not-written.md)
for the full live-diagnostic trail.

**2026-09-17**: Confirmed a 3rd time same day (2 more smoke failures, same leak) — two compounding
bugs, not one: `currency-regression.spec.ts` sets shared Market "1" to `DIFF_UNIT=false` and never
restores it (why it's intermittent, not why it fails), plus `grantCheckerAccessToCurrencyOrder`'s
`UNIT`-stripping override being dead at runtime despite being provably correct in source
(Node-verified 3 ways). **Later same day: the first fix's own "Market 10" choice was
self-contradictory (set `DIFF_UNIT=true` but still `delete`d `UNIT`) — corrected to reuse Market "1"
itself, idempotently reset to `DIFF_UNIT=false` right before every probe, instead of a second
market.** A "VM/local drift" hypothesis was floated and then **retracted** after the user produced a
controlled counter-example (`smoke_m2` fail → standalone `currency-smoke` pass → `smoke_m2` fail,
same branch, no edits between) that dirty-tree sync cannot explain. Corrected root cause:
`CURRENCY.MARKET~MASTER` is a fixed system table whose records persist across separate runs on the
shared `bankstg` environment — Market "1"'s `DIFF_UNIT` is genuinely ambient, cross-run state, and
concurrency was ruled out entirely (pre-TB-3874, `API-tests` was hardcoded to exactly 1 worker for
every run referenced here). The `UNIT`-not-surviving-to-the-wire mechanism itself is **still not
mechanically explained** as of this writing. See `US-01.13.03/README.md`'s 2026-09-17 sections (read
to the end — the last entry supersedes the drift theory) for the full history. Distinct from, and not
explained by, the reconciler-cascade issue in `docs/common-issues/infra-and-environment/`.

**Full component Allure audit, 2026-08-27**: 68 cases total across all 4 Stories (25 + 19 + 21 +
3) as first found live; then **case 3207 (US-01.13.03, TC-25) was deleted the same day** — its
Expected Result ("Engine does NOT read SYSTEM.PARAMETER for transit") directly contradicted this
Story's own live Confluence page (still explicit about the `SYSTEM.PARAMETER` fallback rung even
after being edited that same morning) — per the user's explicit priority ruling, see
[[feedback_confluence-story-outranks-conflicting-tc]]. **Current total: 67 cases, 67/67
automated — full coverage, no open gaps.** No orphan `allureCaseId` links found anywhere in
`currency-smoke.spec.ts`/`currency-regression.spec.ts` — every linked id maps 1:1 to a real case
under the correct Story. See [[project_currency-definition-and-logic-full-audit]] for the full
per-story id lists and diff against the prior (2026-08-26) audit.

**2026-08-31 — Currency Engine update is now LIVE on QA, verified directly (not just from the dev
call).** Three files cover this, read in this order:
1. [Currency-Engine-Updates-2026-08-28-Transcript.md](Currency-Engine-Updates-2026-08-28-Transcript.md)
   — raw transcript of the dev's demo call (his local machine, pre-deploy).
2. [Currency-Engine-Updates-2026-08-28-Analysis.md](Currency-Engine-Updates-2026-08-28-Analysis.md)
   — what he said/showed, cross-referenced against Bruno as it stood then.
3. [Currency-Engine-QA-Verification-2026-08-31.md](Currency-Engine-QA-Verification-2026-08-31.md)
   — **the current source of truth**: the contract as empirically confirmed live on `qa.proj.local`
   today (including the new `/rates/local` endpoint's exact reverse-engineered shape, since Bruno
   still has zero documentation of any of this), **two regressions found live that the call never
   mentioned** (**any `DIFF_UNIT: false` market** — not just market `1`, confirmed via a live sweep
   across markets `1`/`2`/`3`/`10` plus a brand-new market minted specifically to test this — no
   longer resolves via the main endpoint at all, regardless of businessUnit; a market-`10`
   multi-`RATE_BANDS` query can 500 persistently), a full audit of all
   67 currently-linked Allure cases plus an exact-text diff for all 6 keyword-flagged ones —
   [Currency-Engine-Allure-TC-Diff-2026-08-31.md](Currency-Engine-Allure-TC-Diff-2026-08-31.md) —
   **5 confirmed genuinely stale after verbatim verification against the live Allure content**
   (3094, 3153, 3160, 3208, 3209 — 3208 also blocked separately by the market-1 regression, 3209
   needs a rethink since `rate.value.nanos` can't even represent the 17-decimal-digit claim its ER
   makes), **1 false positive** (3145 — flagged text was in the request JSON, not the response
   assertion). **Second pass, code-level (not just Allure text)**: 14 automated tests actually break
   under the new response shape (most Allure ERs describe behavior, not JSON shape, so they don't
   need text edits — only the code does). **`allureCaseId(3146)`'s test used the now-removed
   `currencies[]` array mode — RESOLVED 2026-09-02: not a broken test, AC2 (BASE_CCY_RANK fallback
   when no base is declared) was itself invalidated** (Artur Fonichkin, team chat — rates now
   always exist in both directions, so "no base declared" is not a real state). AC2 is being
   removed from the Story text; the test was deleted from `currency-regression.spec.ts` and Allure
   case 3146 deleted, same day. Full detail: [[project_currency-engine-contract-findings]] and
   `US-01.13.03/README.md`. Two of
   the six existing automated smoke tests are confirmed failing live for these exact reasons;
   most of the US-01.13.03 regression block is expected to be red too (verified the failure pattern
   directly in code, didn't need to run every test to confirm it repeats).
   `scripts/currency-engine-contract-check.ts` (`npm run currency:contract-check`, in
   `proj-test-automation`) keeps a running snapshot of the live response shape for future diffs.

**[BUSINESS-OVERVIEW.md](BUSINESS-OVERVIEW.md)** — plain-language business-logic explainer: why
the module exists, what legacy problems it solves, what each story does, and how it affects the
product. Start there for a quick "what is this block about" read, before diving into table
schemas.

This file is the entry point for anything touching the Currency module. Read it first, before
re-deriving facts from Bruno/Jira/Confluence — most of what's below (and in the per-story files)
took a full session of cross-checking three sources to pin down, including cases where an
independent research pass gave a wrong answer that had to be caught by re-reading `origin/main`
directly. If something turns out stale, update the relevant file (and note the date), don't just
silently work around it.

Per-story detail lives one level down — go there for table schemas, hooks, discrepancies, and
automation status:

- **[US-01.13.01](US-01.13.01/README.md)** — `CURRENCY~MASTER`, `CURRENCY.MARKET~MASTER`: field
  immutability rules, the NO_OF_DECIMALS/USD collision incident.
- **[US-01.13.02](US-01.13.02/README.md)** — `CURRENCY.ORDER~MASTER`, `CURRENCY.RATES~MASTER`: the
  daemon, status lifecycle, AUTH/4-eyes setup, Story-vs-implementation discrepancies, Jira
  snapshot, automation status (18/18 automated as of 2026-08-20, not yet run live for the latest
  fixes).
- **[US-01.13.03](US-01.13.03/README.md)** — Currency Engine (`proj-currency-engine`) direct-rate
  resolution, triangulation, Business Unit hierarchical fallback. Not automated as of 2026-08-21 —
  the pasted manual TC assumed a GET endpoint that doesn't exist; real contract is `POST
  currency-engine/api/v1/currencies/rates`. BUSINESS.UNIT (needed for this story's own headline
  "hierarchical fallback" AC) doesn't exist on this environment at all.
- **[US-01.13.04](US-01.13.04/README.md)** — Universal MID-rate access (front-office) vs. GL/COB
  revaluation (a completely separate EP-06 batch process, not this endpoint). **Updated
  2026-08-27**: Manual QA created this Story's first 3 Allure cases on 2026-08-27
  (ids 3229/3230/3231, all Draft) — all 3 already had a matching automated test in place
  (TC-01/TC-03/TC-05, written 2026-08-26 before the Allure cases existed) and are now linked via
  `allureCaseId(...)`. The COB-revaluation AC (AC2/AC4) remains untestable at this layer — it's a
  separate EP-06 batch process, not the Currency Engine endpoint this Story's cases target.

**See [[project_currency-engine-contract-findings]]** (session memory, `proj-test-automation`) for
the full Confluence → Bruno → TC gap analysis behind the last two bullets above.

**2026-09-02 — 15 new Allure cases found live, none yet automated.** Full re-scan of the Component
(project 2 "TB CBS", Component custom field id -4 / value id 81) via direct REST (MCP servers
unreachable this session — `allure-testops-native` timed out, `allure-testops-custom` couldn't
connect from its own process despite the host itself reaching `allure.proj.local:8090` fine over
`curl`; used the token from this plugin's `.mcp.json` directly, per
[[reference_allure-testops-rest-access-from-proj-test-automation]]) found ids 3232-3441 span the
project-wide growth since the 2026-08-27/08-31 baseline (2824 → 3019 total elements), of which
**15 belong to this Component, all created 2026-09-02 by Viktoryia.burak, all `Draft`, all tagged
`API`/`Regression`/`regression_m2` (zero Smoke)**:
- **US-01.13.02** (+5): ids 3437-3441 — the `DIFF_UNIT`/`DIFF_AMT` market-gating cases (see that
  Story's own README "Automation status" section for the per-case breakdown).
- **US-01.13.03** (+10): ids 3427-3436 — `/rates/local` endpoint + same-currency resolution cases
  (see that Story's own README).
- US-01.13.01 and US-01.13.04 gained none.

**Running total: 67 (2026-08-27 baseline) + 15 = 82 cases.** **Corrected 2026-09-03: actual live
count is 81, not 82** — a full parallel 4-subagent re-audit (one per Story, each independently
verifying every candidate id's `/cfv` live, plus scanning ids 3442-3518 for anything new) found
25+24+29+3=81, not 82; the prior count appears to have double-counted or miscounted one
US-01.13.03 case. Trust this 81 figure going forward, not the 82 above.

**Update, same day (2026-09-02) — all 15 automated and live-run: 14/15 passed, 1 fixed.** Written
into `currency-regression.spec.ts`, statically verified (tsc/eslint/prettier clean), then run live
by the user. **14 passed as written.** 1 (`allureCaseId(3435)`, "Rejects a non-boolean
isBaseCurrency") failed because its Allure case's own Expected Result text
(`"isBaseCurrency must be boolean (true/false)."`) doesn't match live reality (a generic Spring/
Jackson `"Failed to read request"` JSON-deserialization failure, same `400` status) — assertion
fixed to match the real message; the Allure case's ER text itself is still wrong and worth Manual
QA correcting. Separately, `allureCaseId(3440)` ("single band `AMT_FROM<>0` rejected when
`DIFF_AMT=false`") — initially withheld as a contract conflict against this file's own Pattern
rule below, then automated on the user's explicit instruction after re-confirming its real ER via
the proper Allure path — **passed live**, which means the Pattern rule was incomplete, not 3440;
see the DIFF_AMT Pattern entry below for the correction. Full per-case detail (including the
`/step`-vs-`/scenario` research-methodology miss that required re-verifying all 15 cases mid-session)
is in [[project_currency-definition-and-logic-full-audit]] and each Story's own README.

This INDEX.md holds only what's true across the *whole module*, regardless of which story a task
touches.

---

## Module-wide facts

### BUSINESS.UNIT — out of scope for the current environment
Does not exist as a table anywhere in `proj-bruno-api`. Confirmed **M3 scope** (Dima Bogoslovsky,
team chat 2026-08-14: "a) M3"). Any Story precondition saying "BUSINESS.UNIT populated" is not
realistic for the current M2 environment — treat it as background flavor text, not a real
precondition to set up. Applies to every Currency story, not just US-01.13.02.

### Bruno beats Allure ER text
Confirmed at least twice in this module (US-01.13.01 status codes, US-01.13.02 status codes — see
each story's file): when an Allure case's Expected Result text disagrees with what Bruno's own
request examples show for the same operation, trust Bruno. Re-derive from `proj-bruno-api`
`origin/main` directly (always `git fetch` first — local `main` on this machine has been seen
hundreds of commits behind).

### Never hardcode a shared/real currency id
`CURRENCY~MASTER` records can never be deleted or reversed (`REVERSE` is rejected with `500` by
design) and several fields lock permanently once authorized (see US-01.13.01). A test that
hardcodes a real/shared id (`USD`, `EUR`, ...) collides with whatever a prior run already committed
for that id, non-deterministically depending on run order — this is exactly what happened in the
incident documented in full in [US-01.13.01](US-01.13.01/README.md#incident-the-no_of_decimalsusd-collision-2026-08-18-fully-resolved).
**Rule**: mint a dedicated random currency id/numeric code for every new Currency test
(`generateRandomCurrencyId()`/`generateRandomNumericCode()` in `currency-helper.ts`) unless the
case is specifically about that literal identity's real-world meaning.

**2026-09-03 — collision-retry made generic, not just `createDedicatedCurrency`.** A full sweep of
`currency-regression.spec.ts` found 5 more tests calling `generateRandomBaseRank()`/
`generateRandomNumericCode()`/`generateRandomCurrencyId()` bare (no retry) where `createDedicatedCurrency`
didn't fit (a fixed real recordId like `JPY`, an UPDATE to an already-existing currency, or a
deliberate BASE_RANK collision that must stay fixed while only the *other* fields retry) — the same
class of bug as the 1870 incident below, just at different call sites. Fixed by:
- `createDedicatedCurrency` now returns the value it *actually persisted* when `overrides.BASE_RANK`/
  `NUMERIC_CODE` is passed (previously returned the discarded freshly-generated one — a second latent
  bug found alongside the first).
- New `postCurrencyWithBaseRankRetry(buildAndSend, generateCandidate?, maxAttempts = 3)` helper for
  call sites that can't use `createDedicatedCurrency` wholesale — retries only the field(s) actually
  at risk, using the now-exported `isRetryableCurrencyIdCollision`.
- Tests that deliberately need a field to *stay* colliding (e.g. "Reject Duplicate BASE_RANK") retry
  everything BUT that field in a local loop, breaking out only once the expected collision message
  appears — see that test for the pattern.
**Predict**: any *new* Currency test that builds a payload by hand instead of via `createDedicatedCurrency`
is a candidate for this same bug — check first whether it (a) asserts on specific error-message text
(not just status code — status-only assertions are unaffected) and (b) uses a bare generator for a
field CBS treats as unique. Both together is the actual risk; either alone is not (confirmed via the
2026-09-03 sweep, which found one bare-generator site with a status-only assertion and correctly
left it alone — line 742, `generateRandomNumericCode()` in "Reject duplicate currency ID").

## Patterns & Predictive Rules (use these to predict, then verify — don't just cite the facts above)

These are the generalized rules a veteran of this module would apply to a table/field/case they
haven't personally touched yet. Form a prediction from these before designing a case or reviewing
a proposal for anything new in this module, then confirm against Bruno/the ticket before asserting
it — see `context-resolution.md`'s "Patterns & Predictive Rules" section for the discipline.

- **A CBS record's identity-defining fields tend to lock permanently once it reaches LIV.**
  Confirmed for `CURRENCY~MASTER`'s `NUMERIC_CODE`/`NO_OF_DECIMALS`/`QUOTATION_CODE`/
  `INTEREST_DAY_BASIS` (TB-1351) and being extended to `DECIMALS_NAME`/`PRECIOUS_METAL` (TB-2979).
  **Predict**: for any field on a Currency table you haven't specifically checked, don't assume
  it's freely editable post-authorization just because the schema doesn't say otherwise — look for
  an immutability ticket or a Bruno rejection example first. Two out of two identity-shaped field
  groups checked so far in this module turned out immutable; treat that as the prior, not the
  exception.
- **A table whose data is described as populated by a scheduled/backend process is a dead end for
  direct `INPUT`.** Confirmed for `CURRENCY.RATES~MASTER` (daemon-fed, `403` on direct `INPUT`, no
  seeding backdoor). **Predict**: before writing a test-setup helper for a Currency table you
  haven't automated against yet, check whether Bruno documents it as SYS/daemon-fed — don't assume
  a plugin or fixture provides a seeding path just because one exists for the sibling tables that
  *are* directly writable.
- **A pasted Allure case's stated HTTP status/behavior for this module has a real, non-trivial
  chance of disagreeing with Bruno.** Confirmed twice independently in this module (US-01.13.01 and
  US-01.13.02 status codes both disagreed with the pasted text). **Predict**: for the next Currency
  story, budget time to verify status codes against Bruno rather than assuming a third case will
  agree just because it looks similarly worded — see "Bruno beats Allure ER text" above.
- **A Currency record you create in a test is permanent and globally visible on that environment.**
  (`REVERSE` rejected by design.) **Predict**: any new Currency test case, regardless of which
  table it targets, needs its own minted id/numeric code — never assume a "just this once" literal
  id is safe because the case looks like a one-off; the NO_OF_DECIMALS/USD incident happened from
  exactly that assumption.
- **A jsonb `data @>` containment key built with an empty-string field will silently miss a real
  row if the backend persists that field as an omitted key instead.** Confirmed 2026-09-25 on
  `CURRENCY.RATES.UNIT` for a `DIFF_UNIT: false` market: the rate row was written correctly with the
  right `ORDER_ID`, but `getCurrencyRatesOrderIdsForKey`'s query (`data @> {"UNIT": "", ...}`) matched
  0 rows because Postgres containment requires the key to be *present*, not just falsy — dropping
  `UNIT` from the query key entirely found the row immediately. Same omitted-vs-empty distinction as
  `CURRENCY.ORDER.UNIT` (TB-3588), now confirmed on the read/query side too, not just write/validation.
  **Predict**: before building a jsonb containment key for any Currency table field that can be
  legitimately empty (`UNIT`, and any other optional string field), check whether the backend
  actually persists an empty string or omits the key — don't assume the two are query-equivalent;
  `data @>` will silently exclude the omitted-key case with no error, producing a false "not found"
  that looks exactly like a timing/daemon problem.
- **A manual sheet's own TC-N placement under a Story doesn't guarantee that's the right Story.**
  Confirmed for US-01.13.03's sheet TC-26 (2026-08-26): pasted under that sheet, but its actual
  assertion (CURRENCY.ORDER INPUT rejection) is an Order Staging & Validation concern —
  US-01.13.02's, not US-01.13.03's — which only surfaced once Manual QA's own Allure case for it
  carried `Story = "Asynchronous Rate Order Staging, Validation, and Scheduling"`. **Predict**: when
  wiring an `allureCaseId` for any case in this module, treat the Allure case's `Story` custom field
  as the authoritative placement signal, not the sheet section it was pasted under — a mismatch
  means the test's `describe` block (not the Allure case) is what's wrong, and it should move.
- **`CURRENCY.ORDER~MASTER`'s DIFF_AMT band-count gate counts array rows, not unique `AMT_FROM`
  values.** TB-2980 (Closed 2026-08-24, confirmed live via Jira and via `proj-bruno-api`
  `origin/main`'s `INPUT - Reject Amount Ranges Against Market Without DIFF_AMT.yml` / `INPUT -
  Multi Band.yml`, both explicit and passing): `proj-currency-order-validation-plugin` rejects any
  `RATE_BANDS` array with more than one row when the order's `CCY_MKT` has `DIFF_AMT: false` — even
  when every row shares the same `AMT_FROM` and only `RATE_TYPE` differs (e.g. three rows for
  BID/ASK/MID at `AMT_FROM: '0'`). A market with `DIFF_AMT: false` accepts exactly one `RATE_BANDS`
  row, full stop. **Refined 2026-09-02 (allureCaseId 3440, live-confirmed passing)**: "exactly one
  row" is necessary but not sufficient — that one row's `AMT_FROM` must also be `'0'`. A single
  band with a non-zero `AMT_FROM` (e.g. `'1000'`) on a `DIFF_AMT: false` market is **also
  rejected** (`400`), not silently accepted as the original TB-2980 wording implied. **Predict**:
  any new Currency test/case that stages more than one `RATE_BANDS`
  row — for any reason, not just genuine amount tiers — needs a market with `DIFF_AMT: true` (the
  established convention is `diffAmtMarketId = '10'`, ensured via a PRECONDITION `INPUT` before
  staging; see `currency-smoke.spec.ts`'s and `currency-regression.spec.ts`'s repeated use of this
  exact pattern). This broke `currency-smoke.spec.ts`'s `allureCaseId(3094)` test on 2026-08-26 —
  it staged 3 BID/ASK/MID rows against the default market (`CCY_MKT: '1'`, `DIFF_AMT: false`),
  which had been silently tolerant before TB-2980 shipped. Fixed by switching that test to market
  `'10'`.
- **`CURRENCY.ORDER~MASTER`'s validation plugin now gates `UNIT` the same way it gates
  `RATE_BANDS` count — a mirror of the `DIFF_AMT` rule above, confirmed 2026-09-02 for `DIFF_UNIT`.**
  A market with `DIFF_UNIT: false` (including the shared default market `'1'`) rejects any order
  whose `UNIT` is non-empty (`"UNIT must be empty because market <id> does not differentiate by
  Business Unit (DIFF_UNIT is false)"`), where this used to be silently tolerated — the "unit_diff"
  check Artur Fonichkin described as in-progress rollout (chat, 2026-09-01). Not yet documented in
  `proj-bruno-api`'s `Register CURRENCY.ORDER~MASTER hook.yml` (stale on this point as of this
  writing). **Predict**: any new `CURRENCY.ORDER` test payload must pair `UNIT`/`UNIT_INCLUDE` with
  its `CCY_MKT`'s actual `DIFF_UNIT` — non-empty `UNIT` needs a `DIFF_UNIT: true` market (same
  `diffAmtMarketId = '10'` convention, which already carries `DIFF_UNIT: true` too), otherwise send
  `UNIT: '', UNIT_INCLUDE: false`. Broke 11/18 tests in `currency-regression.spec.ts`'s
  US-01.13.02 block, and 16/19 in its US-01.13.03 block, on 2026-09-02 (both fixed same day — see
  those Stories' `README.md`s). US-01.13.03's fix introduced its own `DIFF_UNIT_MARKET_ID = '10'`
  (same physical market as US-01.13.02's local `diffAmtMarketId`, reused deliberately since the two
  Stories' describe blocks run in the same file/worker and the market record is a shared global —
  US-01.13.02's own market ("1") is deliberately kept `DIFF_UNIT: false` as its own "Interbank
  Market" precondition, so US-01.13.03 cannot reuse market "1" for its business-unit cases and
  needed a distinct market id instead). `currency-smoke.spec.ts` and US-01.13.04 were not yet
  re-audited against this rule — check before trusting them if new UNIT-bearing cases are added.
  **Refined again 2026-09-03 (TB-3588, not yet fixed):** the rule above governs the *business-rule*
  plugin only (non-empty `UNIT` rejected on `DIFF_UNIT=false`) — it does not mean `UNIT` can be
  omitted from the payload. The projection's JSON-schema `required` list still marks `UNIT`
  unconditionally mandatory (checked *before* the business-rule plugin runs), so omitting the key
  entirely 400s with `"required property 'UNIT' not found"` even on a `DIFF_UNIT=false` market,
  which per the ticket should accept a null/omitted `UNIT` there. No test in this file caught it
  because every `CURRENCY.ORDER` payload here always sends the `UNIT` key (as `''` or a real value) —
  never omits it. **Predict**: "empty string" and "key omitted" are not the same equivalence class for
  a `required` schema check; when a conditionally-mandatory field is being tested, cover the literal
  omitted-key case as its own test, don't treat an existing "UNIT: ''" case as already covering it just
  because its title says "no UNIT". Full incident:
  [US-01.13.02/README.md](US-01.13.02/README.md)'s 2026-09-03 entry;
  general pattern: [`common-issues/required-field-omitted-vs-empty-value-are-different-checks.md`](../../common-issues/required-field-omitted-vs-empty-value-are-different-checks.md).
  **False alarm, investigated and closed 2026-09-17 — NOT a code or backend bug, a stale VM sync
  artifact.** `vm-results-smoke-m2-20260916-202906` / `vm-results-regression-m2-20260917-004121`
  showed `grantCheckerAccessToCurrencyOrder`'s AUTH-propagation probe (market `'1'` via
  `buildCurrencyOrderInputData`'s default `CCY_MKT`) failing with the business-rule message
  (`"UNIT must be empty because market 1 does not differentiate by Business Unit (DIFF_UNIT is
  false)"`) — and the captured request attachment genuinely showed a non-empty `UNIT` in the wire
  payload, even though the helper's own `{ ...buildProbeOrderData(), UNIT: undefined,
  UNIT_INCLUDE: false }` override should have stripped it (confirmed by `git log -p`: every
  committed version of this line, since 2026-09-03, correctly nulls `UNIT`). Two rounds of
  full-chain tracing (`buildRecordInputPayload` → `TableRegistryApiClient.performRecordOperation` →
  `BaseApiClient.post`/`requestWithRetry` → Allure's `attachRequest`/`maskSensitiveData`) plus a
  live empirical Node check of the exact spread pattern found **no code, past or present, capable
  of reintroducing `UNIT`**. **Resolved same day**: user re-ran `currency-smoke` fresh against
  bankstg (`vm-results-api-20260917-101628`) — all 6 tests passed, and the identical probe's captured
  request now correctly omits `UNIT` entirely (confirmed via the raw attachment JSON, response 200).
  Since the code is unchanged between the two runs, the only explanation consistent with the
  evidence is `scripts/run-on-vm.sh`'s `sync_sources()`: it `tar`s the **raw local working tree**
  to the VM (excludes only `.git`/`node_modules`, not a `git archive` of a specific ref), so a run
  can execute whatever was on someone's disk at sync time — including an uncommitted, transient
  edit that no longer exists anywhere to inspect after the fact. **No test-code or backend fix
  needed or applied** — a market-switch "fix" was attempted, then reverted once this was understood
  as a sync artifact, not a real DIFF_UNIT defect. **Predict**: before trusting *any* live bankstg/VM
  failure whose root cause isn't obvious from the response body alone, check whether `git status`
  was clean on the syncing machine at run time — `run-on-vm.sh` cannot guarantee it ran what's
  committed. See also `common-issues/infra-and-environment/vm-sync-whitelist-silently-stranded-fixes.md`
  for the same sync mechanism's other known failure modes.
  One test (`Triangulated cross-rate preserves at least 18 decimal digits...`, allureCaseId 3209)
  was deliberately left unfixed/unmodified 2026-09-02 per user instruction — it's blocked on a
  separate, already-known issue (9-decimal RATE_VALUE input cap, [[project_tb-1989-tc28-blocked-rate-value-decimals]]/TB-3277) and the user said dev plans to land the real fix (cap RATE_VALUE at 9 decimals, not 18, plus a new NO_OF_DECIMALS>9 rejection) on QA soon — revisit only once the user confirms that shipped.
  **Resolved, same day (2026-09-02, later):** dev confirmed the `NO_OF_DECIMALS>9` rejection shipped
  to QA live (`CURRENCY~MASTER` INPUT now rejects `NO_OF_DECIMALS: 12` with `400
  "NO_OF_DECIMALS must be a whole number between 0 and 9"`). Also found the "≥18 decimal digits"
  half of case 3209's claim is not provable through this API *at all*, independent of that
  validation — `ResolveRateResponse.rate.value` is `{units, nanos}` (1e9 granularity, hard 9-decimal
  ceiling), so the response can never literally contain an 18-decimal-digit substring, and computed
  verification (exact BigInt math vs. native `double`, several 9-decimal pairs) confirmed double
  and exact math already agree bit-for-bit at the system's real 9-decimal ceiling — the divergence
  this case wants to prove can't manifest at any precision this API can stage or return. Test
  repurposed to prove only the `NO_OF_DECIMALS` rejection (still `allureCaseId(3209)`); full
  writeup and the Allure-case-update follow-up in [[../US-01.13.03/README.md]]'s 2026-09-02 entry.
- **Creating a TestOps case via `testops_create_testcase` needs matching a real sibling's full
  stored shape, not just its custom fields — the tool's generic schema is not this project's
  convention.** Confirmed 2026-08-26 (US-01.13.03, case 3228), three independent misses on the same
  case, none caught by any automated check this session ran:
  1. **Tree placement** needs all three of `Feature`, `Component`, `Story` set (`System Core →
     Currency Definition and Logic → <Story title>`), not `Story` alone — a case with only `Story`
     set still matches Story-field scans correctly but renders at the TestOps tree root, invisible
     next to its siblings.
  2. **Field-format**: every real case in this project puts `"Preconditions:\n<prose>"` into
     `description` and leaves the tool's dedicated `precondition`/`expectedResult` fields empty; and
     `scenario.steps` holds exactly **one** step (the single actual API call) with its own ER, not a
     separate step per setup action (mint data / stage data / make the call) — setup detail is prose
     inside `description`, not its own steps.
  3. **`tags`** need the sibling-standard 3 (`"API"` + `"Regression"`/`"regression_m2"` or
     `"Smoke"`/`"smoke_m2"` depending on layer/tier) — left empty on the first draft.
  All three times the user caught it by eye in the UI/API response, not this session's own tooling.
  **Predict**: before calling `testops_create_testcase` for any case in this module (or likely any
  Allure TestOps project), fetch a real sibling's full stored content first —
  `GET /testcase/{siblingId}` for name/description/precondition/expectedResult/tags,
  `GET /testcase/{siblingId}/cfv` for custom fields, `GET /testcase/{siblingId}/step` for scenario
  shape — and
  mirror it exactly. The tool's own schema describes what's *possible*, not what a given project
  *actually uses*; there's no shortcut for checking a real sibling's full field set.
- **`INPUT` with an already-existing `recordId` is an implicit UPDATE for `authOperationRequired:
  false` tables in this module — not a rejected duplicate-create.** Confirmed live for
  `CURRENCY~MASTER` (case 1871, US-01.13.01, 2026-08-26): re-`INPUT`-ing a fresh dedicated currency
  with a byte-for-byte identical payload returns `200` (silent no-op, `seqNo` increments); it only
  fails (`400`) when the new payload disagrees with one of the record's already-locked immutable
  fields (`NUMERIC_CODE`/`NO_OF_DECIMALS`/`QUOTATION_CODE`/`INTEREST_DAY_BASIS`, the same TB-1351
  list from "Module-wide facts" above). **Predict**: for any Currency-family case titled around
  "reject duplicate ID" or similar, don't assume a dedicated uniqueness-rejection code path exists —
  verify whether the observed rejection is actually the immutable-field guard reacting to a payload
  that happens to differ from the existing record, since a genuinely identical resubmission will
  silently succeed instead. Full detail: [[../US-01.13.01/README.md]]'s "Case 1871" section.
- **Always check an Allure case's comments, not just description/precondition/scenario/step, before
  treating its requirements as fully understood.** `GET /api/comment?testCaseId=<id>` (not
  `/api/testcase/{id}/comment`, which 404s) is a separate REST resource this session hadn't been
  querying at all — case 1871 carried a clarifying worked example from its own author that would
  have resolved an apparent contract mismatch immediately, found only after the user pointed at it
  in the UI. A full sweep of this module's 65 cases afterward found 1871 was the only one with a
  comment, so no other in-flight finding was affected this time — but treat comment-checking as a
  standing part of Step 1 research from now on, not a one-off recovery.

- **When this Story's own Confluence page conflicts with a pasted/Allure TC's Expected Result,
  the Confluence page wins and the TC gets deleted — user's explicit standing rule (2026-08-27,
  case 3207).** Not "escalate and leave open" as this role's general default would suggest —
  for this module specifically, the user has stated the priority order directly: Story > TC.
  **Predict**: the next time a Currency TC's literal wording disagrees with what its Story's
  Confluence page currently says (not Bruno/implementation — this rule is about two *requirement*
  sources disagreeing with each other, a different situation from "Bruno beats Allure ER text"
  above, which is requirement-vs-real-behavior), re-read the live Confluence page fresh first
  (don't rely on a cached read from an earlier session), and if the contradiction holds, delete
  the TC via `testops_delete_testcase` rather than opening a fresh escalation thread. Full
  rationale: [[feedback_confluence-story-outranks-conflicting-tc]].
- **US-01.13.02/03 test runtime is dominated by the real `CURRENCY.ORDER` daemon cadence, not test
  overhead — and sequential loops over independent orders multiply it linearly.** Confirmed
  2026-08-27 by timing every test in `currency-regression.spec.ts`: US-01.13.01 (pure `CURRENCY~MASTER`/
  `CURRENCY.MARKET~MASTER` CRUD+validation, no daemon dependency) runs every case in under ~2s;
  every US-01.13.02/03 case that calls `forceCurrencyOrderScheduleTaskToFireNow` +
  `waitForOrderStatus` + `waitForCurrencyRatesRowsForOrder` (the db-scheduler-backed order
  flattening chain, `currency-helper.ts`) costs a real ~35-40s per order round trip regardless of
  poll-interval tuning — that figure is the backend's own scheduler tick cadence, not
  `pollUntilReady`'s 3s interval (which adds only ~1.5s average slop). A test that stages N
  independent orders in a sequential `for...of` loop (e.g. the triangulation cases in
  US-01.13.03, which each stage 2 orders per formula case × up to 3 cases) pays N × ~35-40s
  sequentially even though the orders are otherwise unrelated — this is the single biggest
  contributor to the multi-minute outliers (3.9m/2.7m/2.0m tests all decompose almost exactly into
  N × ~35-40s). **Predict**: before writing a new Currency test that stages more than one
  independent order for setup, consider whether those orders' full stage→force-fire→wait chains can
  run concurrently (`Promise.all`) instead of sequentially — but verify first that each order gets a
  distinct `START_DATETIME` to the second: `forceCurrencyOrderScheduleTaskToFireNow` looks up the
  schedule_task row by exact `one_shot_run_at` timestamp, and `Date.now()` calls issued in the same
  tick from parallel branches can collide, since existing test code truncates to
  `.toISOString().slice(0, 19)` (second precision). Also note `API_TESTS_MAX_WORKERS = 1`
  (`api/utils/constants/api-client.constants.ts`) is a deliberate, separate constraint (Keycloak
  token cache is in-process, not cross-worker) — raising cross-file/worker parallelism is a
  different, larger change than intra-test concurrency and needs its own infra fix first.
- **A per-iteration `test.step` loop wrapper (e.g. iterating `TRIANGULATION_FORMULA_CASES`) is
  where the "bare action before PRECONDITION" bug hides.** Confirmed 2026-08-27:
  `allureCaseId(3153)`/`allureCaseId(3154)` in `currency-regression.spec.ts` had
  `createDedicatedCurrency(...)` running unwrapped inside the outer per-iteration step, ahead of
  the nested `PRECONDITION` step. This is a `proj-test-automation`-wide Allure-hygiene convention
  (confirmed to recur outside Currency in the same 2026-08-27 sweep), not Currency-specific — full
  rule, fix pattern, and cross-module incident log live in
  [[../../common-issues/unwrapped-requests-outside-test-step.md]].

## 2026-09-03 — Full 1:1 Allure-vs-code audit, all 81 cases (4 parallel subagents, one per Story)

User asked for a strict re-verification of every Currency case against its actual stored Allure
Steps/ER/comments/precondition (not just "does an `allureCaseId()` exist"). Result: **62 MATCH, 17
PARTIAL MATCH, 2 MISMATCH, 0 NOT AUTOMATED/ORPHAN/NO-STEPS.** Full per-case table in
[[project_currency-allure-vs-code-audit-2026-09-03]] (session memory) — this section holds only the
durable, generalizable findings.

**2 confirmed MISMATCH, left open pending live re-verification (not silently fixed):**
- `allureCaseId(2261)` (US-01.13.01, `currency-regression.spec.ts:834`) — Allure ER demands `409
  Market ID must be unique`; the test actually proves the opposite, a `200` idempotent upsert with
  DESCRIPTION overwrite. Whether the test or the Allure ER is stale is unknown without a live check
  against the real system — do not assume either side by default.
- `allureCaseId(2269)` (US-01.13.01, `currency-regression.spec.ts:969`) — Allure ER (and the case's
  own title) demand `403 Forbidden` for a token lacking admin scope; the test asserts `401
  Unauthorized`. Same open question: real behavior needs re-checking before deciding which side to
  fix. ER's "no record created" follow-up check is also simply missing from the test regardless.

**Systemic pattern, mostly in US-01.13.01: negative-path tests assert status code only, never the
literal quoted Allure ER message text**, even though the repo already has
`extractErrorMessage`/`extractPropertiesErrorMessage` in active use elsewhere in this same file.
**Predict**: when reviewing or writing any negative-path Currency test, check whether Allure quotes
an exact message — if so, assert it via the existing helper, don't stop at the status code; this
audit found ~15 cases in US-01.13.01 alone doing exactly that.

**Allure-authoring artifacts found, not code bugs**: cases 3145 and 3427 (US-01.13.03) have
Steps/Expected-Result text copy-pasted verbatim from an unrelated template case, contradicting their
own titles — the automated tests correctly implement what the case *title* says, not the stale
copy-pasted ER. Needs Manual QA to re-author those two cases' content, not a code fix.

**2026-09-03, all 19 fixable PARTIAL MATCH cases closed, live-verified 19/19 passing** (user
explicit direction: Confluence → Bruno → live-script probe → fix → re-run, per case, no
shortcuts). Highlights beyond "added the missing message assertion":
- **3208**: live-probed the documented market=1 (`DIFF_UNIT=false`) 404 regression via a full
  real Playwright test (stage+auth+daemon+resolve, not a bare script — `grantCheckerAccessToCurrencyOrder`
  requires the fixture system) — **it no longer reproduces** (`200`, real rate returned). Reverted
  the market=10 workaround back to the Allure-literal market=1. **Predict**: an undated "still
  broken as of 2026-08-31" note in this INDEX/a Story README is a snapshot, not a standing fact —
  re-verify live before trusting it, the same discipline as everything else in this file.
- **2696**: Confluence claims a `CURRENCY.RATES.ACTIVATED` event; Bruno documents no such event,
  only that `CURRENCY.RATES` has `RECORD_CREATED`/`RECORD_UPDATED` emission enabled on its generic
  per-table topic (`Enable CURRENCY.RATES event emission.yml`, LIV-space only). Confirmed live via
  `KafkaService.listTopics()` (finds `qa.CURRENCY.RATES`) and `readLatestMessages` (real
  `RECORD_CREATED` messages, keyed by the exact `Market.Unit.Base.Quote` composite id, carrying
  `value.data.ORDER_ID`). Wired a real assertion using this. **Predict**: a Confluence-named
  "XXX.EVENT_NAME" event in this module is very likely the generic per-table `RECORD_CREATED`/
  `RECORD_UPDATED` stream on that table's own `{{env}}.<TABLE_ID>` topic (same mechanism already
  known for `CURRENCY.ORDER`), not a bespoke event — check `KafkaService.listTopics()` for
  `{{env}}.<TABLE_ID>` before assuming "not implemented."
  **Bug found and fixed 2026-09-11**: `CURRENCY_RATES_EVENT_TOPIC` in `currency-payload-builder.ts`
  hardcoded the `qa.` prefix as its fallback instead of deriving it from the actual run
  environment — worked when this was confirmed above (that check ran against `qa`), broke
  regression-m2 on `bankstg` (`Failed to read topic "qa.CURRENCY.RATES": 404 Topic not found`).
  Fixed to reuse the module-agnostic `getCurrentEnvName()` helper already established in
  `test-ownership.ts` (same `<env>.<tableId>` convention `kafka-cleanup-helper.ts` uses) instead of
  a literal string. **Confirmed by the user 2026-09-11: `bankstg`'s topic prefix is `bankstg`**, not
  `stg` — matches `getCurrentEnvName()`'s existing `_bankstg` → `'bankstg'` branch already, so the fix
  needed no further change; the resolved topic is `bankstg.CURRENCY.RATES`. Not yet re-run live to
  confirm the 404 clears (fix is static-verified only, per this role's user running tests manually).
- **1867 (`STATIC.CURRENCY.SAVED`) — genuinely NOT implemented**, by the same method: no
  `Enable ... event emission` file exists anywhere under `CURRENCY`'s Bruno tree, and
  `qa.CURRENCY` fails to read (`503 no healthy upstream`) unlike the working `qa.CURRENCY.RATES`.
  Left unautomated/escalatable — do not fabricate a check against a topic that doesn't actually
  carry traffic.
- **BLOCKING, dev-confirmed 2026-09-03 (Yan Tayanouski) — `CURRENCY.ORDER~MASTER` INPUT has two
  mutually exclusive `UNIT` validation hooks for a `DIFF_UNIT:false` market.** Root cause confirmed
  by dev: a new plugin was deployed with `UNIT` mandatory, without removing the old mandatory/empty
  rule for `DIFF_UNIT:false` markets — exactly the "two hooks never reconciled" theory below. Dev is
  fixing it now; re-verify this whole entry once the fix ships (this was live-reproduced and
  DB-confirmed before the dev fix, not from Bruno/Confluence — don't assume the mechanism below is
  still current once resolved, re-check live).
  **Update 2026-09-03, RESOLVED — root cause was on our side, not a still-broken backend.** Full
  chain, reconstructed from [TB-3588](https://bank-proj.atlassian.net/browse/TB-3588) (BA Viktoryia
  Burak, filed 2026-09-03) plus live dev confirmation (Yan Tayanouski, same day):
  - TB-3588's actual business rule (3 parts, quoted from the ticket): (1) `UNIT` must NOT be
    mandatory when `DIFF_UNIT=false`; (2) `UNIT` **cannot be an empty string `""`** if provided;
    (3) `UNIT` **can be `null` or omitted** when `DIFF_UNIT=false`.
  - TB-3588's Bruno fix (merged, `origin/main` commit `27a51ca9`) removed `UNIT` from the projection
    schema's static `required` list — this fixed the "key omitted entirely" 400. Dev's `proj-system-
    core-plugins` deploy (the "new plugin" Yan mentioned) is this same TB-3588 fix landing on QA.
  - **Our own test code was sending `UNIT: ''` (empty string) everywhere for market 1
    (`DIFF_UNIT:false`)** — `grantCheckerAccessToCurrencyOrder`'s probe payload and 3 call sites in
    `currency-regression.spec.ts` (the shared `buildOrderData` default in US-01.13.02, and two
    `stageAndAuthorizeOrder` payloads). Per TB-3588 rule (2), empty string is explicitly disallowed
    — so `"UNIT cannot be empty"` was the NEW, correct, intended validation firing on OUR non-compliant
    payload, not a leftover half-fixed hook. Confirmed live by dev: *"надо вместо "" слать null"*.
  - **Fix applied 2026-09-03**: all 4 call sites changed `UNIT: ''` → `UNIT: null`. One 5th site
    (`ratesKey` at `currency-regression.spec.ts:1955`) deliberately left as `''` — that's not an
    INPUT payload, it's the *stored* composite-key shape for querying `CURRENCY.RATES` rows (the
    empty Business-Unit segment in `1..USD.XAF`), a separate concept from what INPUT accepts.
  **Predict**: any other CURRENCY.ORDER test/helper anywhere in this codebase sending `UNIT: ''`
  (not `null`, not omitted) for a `DIFF_UNIT:false` market will now fail the same way post-fix —
  search for the literal before assuming a new failure is a new bug.

  **Update 2026-09-03, later same day — `UNIT: null` also fails, but at a DIFFERENT (earlier) layer,
  and this is itself a new finding, not a retry of the same bug.** After switching all 4 call sites
  to `UNIT: null` per dev's own suggestion ("надо вместо \"\" слать null"), a NEW error appeared:
  `400 "UNIT - null found, string expected"` — this is the generic JSON-schema TYPE validator
  (upstream of `proj-currency-order-validation-plugin` entirely), not the same hook as before. Bruno's
  schema for `UNIT` (`Create CURRENCY.ORDER~MASTER projection.yml`) declares `"type": "string"` with
  no `null` variant (`["string","null"]`/`nullable:true`) — so a literal JSON `null` fails type
  validation before any business rule is even reached. TB-3588's fix only removed `UNIT` from
  `required` (fixes the *omitted-key* case); it never widened the field's *type* to accept `null`
  (fixes the *explicit-null* case) — rule 3 of the ticket ("can be null or missed") is only half
  implemented. **Fix (this codebase's side): use `UNIT: undefined` (key omitted, matches the already
  proven TB-3588/case-3441 pattern) instead of `UNIT: null` everywhere UNIT needs to be "not set" for
  a `DIFF_UNIT:false` market** — reverted at all 4 call sites. Left ONE deliberate exception: a new
  test step (added outside this session, not authored by this session — `currency-regression.spec.ts`
  around line 2420, "Send a second order with UNIT explicitly null — expect it accepted") still sends
  literal `UNIT: null` on purpose, to directly prove/disprove TB-3588 rule 3's null-acceptance claim
  live — do not "fix" that one by changing it to `undefined`, its failure IS the finding to report
  back to dev (schema type needs widening to accept `null`, not just remove `required`).
  **Predict**: `null` and "omitted key" are NOT interchangeable in this API even when a ticket's
  prose says "can be null or missed" as if they were — a schema's `required` list and a field's
  declared `type` are two independent constraints, and a fix can loosen one without loosening the
  other. Check both before assuming either is fixed.

  **Open question RESOLVED, live-confirmed 2026-09-03 (throwaway diagnostic script, not the test
  suite):** non-empty `UNIT` (`"USD"`) on market 1 (`DIFF_UNIT:false`) is still rejected —
  `"UNIT must be empty because market 1 does not differentiate by Business Unit (DIFF_UNIT is
  false)"`. `allureCaseId(3438)` is correct and current; Bruno's `origin/main` `INPUT - Valid
  Record.yml` example (showing `UNIT:"USD"` as 200-valid for market 1) is confirmed **stale**, not
  a competing source of truth — no test change needed. Full live matrix for `UNIT` on a
  `DIFF_UNIT:false` market, for future reference: omitted key → `200`; `""` → `400 "cannot be
  empty"`; `" "` (whitespace) → same `400 "cannot be empty"` (whitespace counts as empty); `null` →
  `400 "null found, string expected"`; non-empty real value → `400 "must be empty because ... DIFF_UNIT
  is false"`. Only "key omitted" succeeds.
  **Test + Allure synced 2026-09-03**: `allureCaseId(3441)` Step 2's ER updated from "HTTP 200;
  order accepted" to "HTTP 400; ... UNIT - null found, string expected", and
  `currency-regression.spec.ts`'s matching assertion now expects `BAD_REQUEST` plus checks the exact
  message via `extractPropertiesErrorMessage` — no longer a deliberately-left-failing canary, now an
  accurate encoding of current (still-incomplete-per-TB-3588) behavior. Re-flip both back to `200`/
  "accepted" if the backend schema is ever widened to accept `null`.

  Root cause chain (dev-deployed plugin change had a pre-existing generic "UNIT mandatory" hook not
  yet reconciled against the new `DIFF_UNIT`-conditional one) and the original deadlock symptom
  (`grantCheckerAccessToCurrencyOrder`'s 30s AUTH-propagation timeout, actually a deterministic
  INPUT rejection, not a timing issue) are preserved in full in
  `docs/chat-history/` for this date — this section keeps only the current, still-relevant rule.
- **1868**: the AC's "50,000 JPY @ 0.75 = 375 USD" block-logic conversion claim has no provable
  endpoint anywhere in this API (`QUOTATION_CODE` only appears in schema/validation files and the
  Currency Engine's rate-only `resolveRate`, never an amount-conversion endpoint) — left
  unautomated, same reasoning as 1867.
- **1870, self-inflicted collision bug found and fixed same day**: an early fix pass switched a
  hardcoded `NUMERIC_CODE` literal to `generateRandomNumericCode()` called fresh inside each of 3
  reused-payload calls — breaking the field's own immutability invariant (each call got a
  *different* random code) and exposing this environment's small 900-value NUMERIC_CODE pool being
  heavily saturated (collided on the very first live run, then again on retry with a different
  code). Fixed by minting the code once via `createDedicatedCurrency` (which already retries up to
  `MAX_NUMERIC_CODE_COLLISION_RETRIES=10` internally) and reusing it across all payload variants.
  **Predict**: never call a `generateRandom*` id/code generator fresh inside a payload-builder
  closure that gets invoked more than once for the *same* underlying record — mint once outside,
  reuse the value, and prefer the collision-retrying helper (`createDedicatedCurrency`) over a raw
  `generateRandomNumericCode()` call for anything that must actually persist.
  **Recurred 2026-09-03**: `currency-regression.spec.ts`'s "Reject Duplicate BASE_RANK..." test
  (US-01.13.01) was edited to swap its hardcoded `NUMERIC_CODE`s for bare `generateRandomNumericCode()`
  calls (no retry), bypassing `createDedicatedCurrency`. The random code collided with an existing
  currency (`EZU`/696) on the very first live run, so the POST was rejected for `NUMERIC_CODE`
  instead of `BASE_RANK`, failing the test's own duplicate-`BASE_RANK` assertion. Same root cause,
  different call site — the rule holds: any test building a Currency payload by hand instead of via
  `createDedicatedCurrency` is exposed to this environment's ~900-value `NUMERIC_CODE` pool.
- **2839**: Allure's own case content (`GET /testcase/2839/step`, direct REST) is genuinely vague
  ("payload containing 2 currency pairs", no attachment, no literal example) — and the schema
  itself only has one scalar `CCY_BASE`/`CCY_QUOTE` slot each (confirmed: `CURRENCY.ORDER`'s
  "scalar — exactly ONE pair per order" fact already in this Story's README), so "2 pairs" cannot
  be constructed as two full slots at all. The existing `CCY_BASE` as a 2-element array is the only
  constructible interpretation; live-confirmed it 400s via a generic schema-type message
  (`"CCY_BASE - array found, string expected"`), not a dedicated business-rule message — Allure's
  "exactly ONE currency pair per order is allowed" ER describes the schema's natural consequence,
  not a separate plugin check. Added the message assertion against the real (generic) text.

**Predict, module-wide**: a full re-audit like this one surfaces two structurally different failure
classes that need different owners — (a) code that doesn't fully prove what Allure already
correctly states (fix the test), and (b) Allure content itself that's internally inconsistent or
stale (fix the case, escalate per [[feedback_no-automate-on-contract-mismatch]]) — don't default to
"the code is wrong" just because a mismatch was found by comparing code to Allure.

**Third failure class, confirmed 2026-09-03 for both MISMATCH cases above (2261, 2269)**: an
Allure ER can assert specific behavior (an exact HTTP status code, a specific rejection rule) that
the Story's own Confluence page simply never states anywhere — not a Story-vs-TC contradiction
(the "Confluence Story outranks conflicting TC" rule doesn't even apply, since there's nothing on
the page to conflict with), just a claim with zero grounding. **Predict**: when a test's actual
behavior disagrees with an Allure ER, check whether the Story's Confluence page documents that
specific behavior at all before assuming either side needs to change — re-reading the Story fresh
can reveal the disagreement is unfounded on both the "Bruno beats Allure" and "Story beats TC" axes
simultaneously, and the real fix is asking Manual QA where the ER's specific number/rule came from.

## Test-data conventions (shared across all Currency stories)

- `api/system_core/currency-payload-builder.ts` (`proj-test-automation`): `buildStandardCurrencyInputData(baseRank,
  numericCode)` (generic — was `buildUsdCurrencyInputData`, renamed once it stopped being USD-
  specific), `buildCurrencyOrderInputData(overrides)`, `buildCurrencyMarketInputData(...)`.
- `api/system_core/helpers/currency-helper.ts`: `generateRandomBaseRank()`,
  `generateRandomCurrencyId()` (exactly 3 letters), `generateRandomNumericCode()` (3 digits),
  `createDedicatedCurrency(client)` (mint+create a throwaway currency, returns its id),
  `grantCheckerAccessToCurrencyOrder(adminClient, checkerClient, companyCode,
  buildProbeOrderData)` (US-01.13.02's AUTH/4-eyes setup — see that story's file §AUTH),
  `ensureCurrencyMasterHasBaseRankAndPreciousMetal` (pre-existing TB-2858/2859 schema self-heal,
  unrelated to the above).
- Tests live in `api/system_core/tests/currency-smoke.spec.ts` and `currency-regression.spec.ts`
  (`test.describe('US-01.13.01 | ...')` and `test.describe('US-01.13.02 | ...')` nested inside the
  file's outer Feature describe, per this repo's Story-scoped-describe convention).

## Cross-cutting patterns that apply here but live in `docs/common-issues/`

- **`authOperationRequired`** — before assuming a table/projection needs `INPUT`+`AUTH`, check its
  flag. `CURRENCY.ORDER~MASTER` is `true` (needs it); `CURRENCY~MASTER`, `CURRENCY.MARKET~MASTER`,
  `CURRENCY.RATES~MASTER` are all `false` (single `INPUT` commits to LIV, no `AUTH` step). See
  [`common-issues/auth-operation-required.md`](../../common-issues/auth-operation-required.md) for
  the general rule and the incident that established it.
- **Shared/singleton-record snapshot-restore races under concurrent test execution.** Confirmed
  2026-09-02 for `COMPANY.TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` — see
  [`common-issues/shared-record-snapshot-restore-race-under-concurrency.md`](../../common-issues/shared-record-snapshot-restore-race-under-concurrency.md).
- **A small-alphabet random id (e.g. `generateRandomCurrencyId()`) can collide with real
  pre-seeded reference data**, not just with other test fixtures. Confirmed 2026-09-02 (drew the
  real ISO code `'COU'`) — see
  [`common-issues/random-id-can-collide-with-real-reference-data.md`](../../common-issues/random-id-can-collide-with-real-reference-data.md).
