Story: US-01.13.01 (TB-1987) — part of the [Currency Definition and Logic](../INDEX.md) module.
Last updated: 2026-08-21

Confluence source (re-read in full 2026-08-21, per the mandatory 5-step flow now codified in
`commands/team/fullstack-aqa-agent.md`): `bank-proj.atlassian.net`, pageId `1529610247`, v1.2
(2026-08-11, "Addition of the COMPANY metadata registry").

Read the module [INDEX.md](../INDEX.md) first for module-wide facts (BUSINESS.UNIT scope, the
never-hardcode-a-currency-id rule, shared test-data helpers). This file covers only what's specific
to this story's two tables.

---

## Data model (confirmed against `proj-bruno-api` `origin/main` directly — always `git fetch`
first, local `main` runs hundreds of commits behind)

### CURRENCY~MASTER
Fields: `NUMERIC_CODE`, `NO_OF_DECIMALS`, `QUOTATION_CODE`, `INTEREST_DAY_BASIS`, `DECIMALS_NAME`
(multilang), `BASE_RANK` (unique, amendable), `PRECIOUS_METAL` (boolean).
- `authOperationRequired: false` — a single INPUT commits straight to LIV (no AUTH step, no 4-eyes).
- **Immutable once authorised** (TB-1351, Done): `NUMERIC_CODE`, `NO_OF_DECIMALS`, `QUOTATION_CODE`,
  `INTEREST_DAY_BASIS`. TB-2979 (In testing as of 2026-08-18) is extending this to `DECIMALS_NAME`
  and `PRECIOUS_METAL` too — Bruno's own rejection examples already cover those two, not the
  original four (no dedicated Bruno file for e.g. "reject NO_OF_DECIMALS change" — that gap is why
  we initially assumed NO_OF_DECIMALS was mutable; TB-1351 proves it isn't, see the incident below).
- recordId must be exactly 3 alphabetic characters. `NUMERIC_CODE` must be a unique 3-digit code.
  `BASE_RANK` must be a unique positive integer.
- **Records can never be deleted or reversed** — `REVERSE` on `CURRENCY~MASTER` is rejected with
  `500` by design (Bruno: "REVERSE - Rejected"). Any currency you create in a test lives forever on
  that environment. Never hardcode a literal currency id in a new test (see the incident below and
  the module INDEX's "never hardcode" rule) — generate one.

### CURRENCY.MARKET~MASTER
`DIFF_UNIT`/`DIFF_AMT` booleans, multilang `DESCRIPTION`. Market id must be 1–99 per the Story.
**CORRECTED 2026-08-31 (was previously "no such validation exists in Bruno / unimplemented gap"):**
live-confirmed as part of an unrelated market-behavior sweep — `INPUT` with a recordId outside
`1`-`99` now correctly rejects with `400 "Market ID must be between 1 and 99"`. The gap is closed;
this was likely fixed as a side effect of the same backend work behind the 2026-08-28 Currency
Engine update, not called out on that call. `INPUT` is an idempotent upsert (re-posting the same id
updates it, no uniqueness rejection despite what an Allure case's text may say — confirmed live for
case 2261). **Confluence cross-check, 2026-09-03** (full 1:1 audit, page re-read fresh at v14): the
Story's own Business Rules & Validations table has 5 rows (Market ID Limit 1-99, Quotation Logic,
Boolean Market Flags, Base Currency Rank Fallback uniqueness, Mandatory Triangulation Consistency)
and **zero rows about Market ID uniqueness** — unlike `BASE_RANK`, whose uniqueness is explicit
("Base currency rank must be unique"), nothing in this Story ever states Market ID must be unique.
allureCaseId(2261)'s `409 Market ID must be unique` ER has no basis in the Story at all — not a
Story-vs-test conflict, a Story-vs-Allure-case gap. Escalate to Manual QA (Viktoryia.burak) to
correct/remove the case rather than treating the automated (upsert-200) behavior as wrong.

**allureCaseId(2269) ("...Return 403 Forbidden When Token Lacks Admin Scope"), same 2026-09-03
audit**: the automated test asserts `401 Unauthorized`, contradicting the case's own `403`. The
Story's *entire* access-control content is one Pre-Conditions line — `"Access Rules: The
Administrator should have access to the Core Configuration app for input."` — no HTTP status code,
no 401-vs-403 distinction, no RBAC mechanics anywhere on the page. Same conclusion as 2261:
Allure's specific `403` claim is unfounded against this Story, not a test bug — escalate rather
than "fix" the test to assert 403 without independently confirming which status the real system
returns for this exact failure mode.

### COMPANY (added to this Story in Confluence v1.2, 2026-08-11 — not previously in this file)
`ID`, `LOCAL_CURRENCY` (LinkedTable → `CURRENCY`), `MANDATORY_TRIANGULATION` (boolean, default NO),
`TRIANGULATION_CCY` (LinkedTable → `CURRENCY`, defaults to `LOCAL_CURRENCY` if blank). Business
rule: if `MANDATORY_TRIANGULATION = YES`, `TRIANGULATION_CCY` must be set, or the save is rejected
— confirmed real in Bruno (`COMPANY/proj-table-template/Operations/INPUT - Reject Missing
Triangulation Currency.yml`, `INPUT - Mandatory Triangulation With Currency.yml`). Live DB check
(2026-08-21): the `MOCK` company this suite runs under has `LOCAL_CURRENCY: "ZZC"` and
`MANDATORY_TRIANGULATION: false`; no `COMPANY.liv` row (of ~30, mostly test-generated junk from
unrelated runs) has `TRIANGULATION_CCY` set. `LOCAL_CURRENCY: "ZZC"` reads as accidental test
pollution (matches `generateRandomCurrencyId()`'s output shape) rather than a deliberate config —
don't build a new test on it as-is.

**Coverage gap, newly identified 2026-08-21**: this Story's own AC6 (Cameroon subsidiary —
`LOCAL_CURRENCY=XAF`, `MANDATORY_TRIANGULATION=YES`, `TRIANGULATION_CCY=XAF`) has **no
corresponding Allure case at all** among the 25 Active cases mapped to this Story (see
[[project_tb-2179-allure-coverage]]) and **no automated test** in `currency-smoke.spec.ts`/
`currency-regression.spec.ts` — every existing case/test targets `CURRENCY`/`CURRENCY.MARKET`
only, none touch `COMPANY`. This is a real gap between the Confluence story and both the Allure
test-case matrix and the automation, not something to silently fill in — Manual QA needs to author
a case for it first, per this role's escalate-don't-invent rule.

---

## Story text vs. real implementation

- **HTTP status codes**: same "Bruno beats Allure ER text" pattern seen on `CURRENCY.ORDER~MASTER`
  (US-01.13.02) — where an Allure case's Expected Result text disagrees with a Bruno rejection
  example's actual status code, trust Bruno.
- **DECIMALS_NAME vs NO_OF_DECIMALS immutability** — see the incident below; this one cost real
  debugging time, worth reading in full before touching either field in a test.

---

## Incident: the NO_OF_DECIMALS/USD collision (2026-08-18, fully resolved)

A regression test (Allure 2253, "Reject NO_OF_DECIMALS Modification for Referenced/Active
Currency") and a smoke test (Allure 1867, "Create USD Currency Profile") both hardcoded the literal
`USD` as their `CURRENCY` recordId. `CURRENCY~MASTER` records are permanent and several fields lock
after authorization (see above) — so whichever test ran second collided with whatever the first one
had already committed for `USD`, depending purely on run order.

Root-cause chain, in the order it was actually found (don't re-derive, just check the outcome):
1. First hypothesis (wrong): the immutability rule was a backend bug, since a live `NO_OF_DECIMALS`
   change on `USD` returned 200. Actually: the environment's `USD` seed data had been wiped by an
   unrelated table-restore incident earlier that day, so the "modify" was really a fresh *create*
   (`seqNo: 1` in the response is the tell — confirmed by re-checking with a plain `SEE` immediately
   after, which showed `seqNo: 2`, i.e. it really had just been created once already).
2. Confirmed via Jira: **TB-1351** (Done) really does make `NUMERIC_CODE`/`NO_OF_DECIMALS`/
   `QUOTATION_CODE`/`INTEREST_DAY_BASIS` immutable once authorised — the Story's Alt 2 wording
   ("once referenced in a dynamic transaction") is a looser paraphrase of the real condition, which
   is simply "once authorised" (LIV), nothing to do with being referenced elsewhere.
3. User's resolving decision: **do not** patch this by deleting/resetting `USD` via raw SQL — that
   bypasses the app's own referential-integrity guarantees on a shared environment other tests/teams
   also touch, and REVERSE on CURRENCY is rejected by design for exactly that reason. Confirmed
   instead that the Story's "USD" is just an illustrative example (not a hard requirement for either
   case) — general principle: test-case literal values (currency codes, IDs) in manual QA cases
   aren't mandatory to reproduce exactly unless the literal identity is itself under test.
4. **Fix applied**: both tests now mint their own throwaway currency id
   (`generateRandomCurrencyId()`/`generateRandomNumericCode()` in `currency-helper.ts`) instead of
   touching `USD`. The whole US-01.13.02 block does the same for `CCY_BASE`/`CCY_QUOTE` — it creates
   its own dedicated pair in `beforeAll` (`createDedicatedCurrency`) rather than depending on
   `currency-smoke.spec.ts`'s side effects or on environment pre-seeding, which is exactly the class
   of fragility that caused this incident in the first place.

**Rule going forward**: never hardcode a real/shared currency id (`USD`, `EUR`, ...) in a new
Currency test unless the case is specifically about that literal identity (e.g. a real downstream
consumer depends on it existing by that exact name) — mint a dedicated random one instead.

---

## Case 1871 ("Reject duplicate currency ID") automated, 2026-08-26

**There is no dedicated "duplicate recordId" rejection mechanism for `CURRENCY~MASTER` at all.**
`INPUT` with an already-existing `recordId` is always treated as an **UPDATE**, never as a rejected
create — confirmed live, twice:
- Minting a fresh dedicated currency, then re-`INPUT`-ing the **exact same** payload again (byte-for-
  byte identical) returns `200` (`seqNo` increments — a silent no-op update), not `400`/`409`.
- Re-`INPUT`-ing the same `recordId` with **one changed immutable field** (`NUMERIC_CODE`,
  `NO_OF_DECIMALS`, or `QUOTATION_CODE` — the same four-field list from TB-1351 above, minus
  `INTEREST_DAY_BASIS` which wasn't tested here) returns `400`, citing that specific field as
  immutable — e.g. `{"errors":{"NUMERIC_CODE":"Field NUMERIC_CODE is immutable once the currency
  record is authorised"}}`. Confirmed independently for all three fields, each in isolation (only
  that one field changed, everything else matching the original record).

So the case's own literal precondition/step (`POST /currencies {"ID":"USD", ...}` → expect `400`)
only holds because any realistic "new currency" payload will differ from the existing record's
immutable fields — the `400` is a side effect of the immutability guard, not a dedicated
duplicate-ID check. **This would have looked like a genuine contract mismatch** (case premise
doesn't match real behavior) if not for the case's own comment (see below) — treat "the case's
Expected Result happens to be numerically correct, but for a different mechanism than its title
implies" as still automatable, not a blocker, as long as the automated test reproduces the
mechanism that actually produces that result (here: change an immutable field), not a mechanism
that doesn't exist (a literal duplicate-ID guard).

**Caught a real methodology gap: Allure TestOps case comments are a separate REST resource,
`GET /api/comment?testCaseId=<id>`** (not `/api/testcase/{id}/comment`, which 404s — this project's
instance uses a flat `/api/comment?testCaseId=` query param, discovered by trial). Case 1871 carries
one comment, from Viktoryia Burak, with a worked example matching this finding almost exactly:
```json
{
  "recordId": "XAG",
  "data": {
    "NUMERIC_CODE": "962", "NO_OF_DECIMALS": 2, "QUOTATION_CODE": 1,
    "INTEREST_DAY_BASIS": "ACT.360", "PRECIOUS_METAL": true, "BASE_RANK": 88
  }
}
```
"Change NUMERIC_CODE, NO_OF_DECIMALS, QUOTATION_CODE, send [recordId] the same" — i.e. exactly the
per-field immutability-violation test this session had already independently converged on via live
probing, before the user pointed out the comment existed. **This session had not been checking
Allure comments at all up to this point** — checked the full Currency Definition and Logic component
(65 cases) after this was raised, and 1871 is the *only* one carrying a comment, so no other
in-flight finding this session (TC-25/3207 included) was affected. **New rule, going forward: always
check `GET /api/comment?testCaseId=<id>` as part of Step 1 (existing-case) research, not just
description/precondition/scenario/step** — a case's own author may have left a clarifying example
there that isn't reflected anywhere else. Folded into the module `INDEX.md` Patterns section too.

Test (`currency-regression.spec.ts`, `allureCaseId(1871)`): mints a dedicated currency, then loops
over the three immutable fields, changing exactly one per iteration (`expect.soft`, matching this
file's existing multi-value-loop convention), reusing the same `recordId` each time. Live-verified
all three iterations independently return `400` with the expected field cited in the error detail.
