# US-01.12.02 | Duplicate Detection Configuration — 2026-09-11 regression failure

## TL;DR

Regression-m2 (`vm-results-regression-m2-20260911-013309`) failed 4/16 automated cases in this
Story (2714, 2717, 2719, 2722), all with `409 Conflict: "Only one duplicate config per table is
allowed"`. **Confirmed backend-side, intentional business-rule change** (dev team chat, Aug 11-12
discussion; Confluence page updated 2026-08-18 to match) — a table used to allow multiple
duplicate-configs distinguished by client-supplied `id`; now exactly **one** config block per
table is allowed.

**Fixed 2026-09-11** (user explicitly directed the fix after sending BA the Discrepancy #1
citation for a spec update): `idempotency-regression.spec.ts`'s `US-01.12.02` describe now
provisions a dedicated table per test (12 tables total) instead of one shared table across 16
tests — see "Fix applied" below. Discrepancy #1 (spec-says-update vs actual-409-reject) is still
open with BA/Dev, but the *structural* fix (per-test table isolation) doesn't depend on its answer
— either way a table can only ever hold one config. A **new test case** covering the "second
create on an already-configured table" scenario was added to code, pending an Allure TestOps case
(TestOps/`proj-bruno-api` unreachable this session — VPN down — could not create/verify against a
live sibling case's format yet).

## What changed, per the actual devs (not inferred)

Google Chat thread (referenced live by Ryhor Kisly on 2026-09-11), Aug 11-12 excerpt:
- Dima Bogoslovsky: "Мы должны мочь засетать только один duplication-config для таблицы. Их не
  может быть 2" (a table must have only one duplicate-config; there can't be 2).
- Ryhor Kisly: "то есть мы не можем добавить вот так если уже существует тот что сверху, так?" →
  Dima: "Да. По сути только обновить. И лист нам не нужен там" (yes — essentially only update is
  allowed now; we don't need a list endpoint there).
- On 2026-09-11, Ryhor Kisly confirmed directly against our exact failure: "Да, все верно.
  Добавляли такое" (yes, correct, we added this) when shown the `aqa_int_table_..._604` /
  `aqa_dupcfg_tc02_...` 409 from the "Both ERROR and OVERRIDE are accepted" test.

## Confluence — current spec confirms the new rule (CBSA space, pageId 5065277479, v1.0, last
edited 2026-08-18 — one week after the dev discussion)

- **Pre-Conditions**: "One configuration block per table; silent skip if absent."
- **Alt 3 (Configuration Already Exists – Update)**: "If a duplicate detection configuration
  already exists for the specified target table, the System **updates** the existing config block
  with the new property values (partial update)... Existing hashes... moved to an unchecked state."
- AC7/AC8 restate the same "already exists → update in place" behavior.

## Discrepancy #1 — spec says "update", actual API says "409 reject" (open question for BA/Dev)

Confluence's Alt 3 describes a **silent upsert**: submitting a new config when one already exists
should **update** the existing block, not fail. The **actual observed API behavior** on `bankstg` is
a flat `409 Conflict` rejection (`"Only one duplicate config per table is allowed: table X already
has config Y"`), no update performed. This could mean:
- the "upsert-on-create" half of Alt 3 simply isn't implemented yet (only the "block a second
  config" half landed), or
- Alt 3 is intended to describe `PUT .../duplicate-configs/{id}` behavior specifically, and POST
  `.../duplicate-configs` is meant to be a strict "table must have zero configs" gate — in which
  case the Confluence wording ("the System updates...") is describing the wrong endpoint/verb.

**Not resolved by this session** — needs a direct answer from Ryhor Kisly/Dima Bogoslovsky (the
same two devs already in the loop) on which endpoint is supposed to silently upsert.

## Discrepancy #2 — `proj-bruno-api` is stale on this endpoint (confirmed, needs a Bruno PR)

`collections/Table Template/Duplicate Config/Create Duplicate Config.yml` (local `main`,
`9797b175`, 2026-09-10 — **VPN was down this session, could not `git fetch origin/main` to confirm
even more current** — re-check before relying on this) still documents the **old** contract:
- `docs:` "Returns 409 if a **rule with the same id** already exists" (id-scoped conflict, not
  table-scoped).
- Its own `Duplicate id (409)` example shows a completely different error body: `{"detail":
  "Duplicate config already exists with id: customer-national-id", ...}` — not the
  `"Only one duplicate config per table is allowed"` message + `properties`/`instance` shape we
  actually get today.

Bruno has not been updated to reflect the Aug-11/12 change. This is a real drift, independent of
our test suite — worth a ticket/PR against `proj-bruno-api`, not something this session edited
(out of scope without explicit ask, and this repo requires its own review flow).

## Why our test suite hit this now (not a code bug in the tests' assertions — a stale design)

`idempotency-regression.spec.ts`'s `US-01.12.02` describe (`api/system_core/tests/
idempotency-regression.spec.ts:702`) provisions **one shared `dupCfgTableId`** in a single
`beforeAll` for the whole Story (line 707), then **16 tests** (cases 2707-2722) each independently
call `client.createDuplicateConfig(dupCfgTableId, <own new id>)` expecting `201 Created` — a design
that assumed the *old* "many configs per table, distinguished by id" contract. Under the *new*
one-config-per-table rule, only the **first** successful create on that shared table should ever
succeed; every subsequent POST-create (not PUT-update) on the same table is now expected to 409.

4 of the ~7 tests in this describe that call `createDuplicateConfig` directly (not via a
PRECONDITION-then-PUT pattern already existing on the same id) hit this: 2714 ("Both ERROR and
OVERRIDE are accepted"), 2717 ("purgeDays boundary=1"), 2719 ("Update matchFields[]..." — its own
PRECONDITION create), 2722 ("configId ownership" STEP 2). The other ~12 tests in the same describe
happened not to hit it this run (some only trigger 400s before any create call, e.g. 2709-2713,
2716; some reuse an id already present via PUT). This split looks incidental to test **order** and
which table state existed at that moment, not a deliberate isolation strategy — **12 "passing"
tests in this Story do not prove the describe's design is sound**, they just didn't happen to be
the create call that landed after another config already existed in this particular run.

**Sibling Story `US-01.12.03` (same file, line 1202) already does this correctly** — it provisions
three *separate*, purpose-dedicated tables (`errorTableId`, `overrideTableId`, `hashTableId`) in its
own `beforeAll` instead of sharing one table across every test. `US-01.12.02` needs the same
treatment: either a dedicated table per test (safest, matches the sibling Story's own pattern) or an
explicit reset (delete-or-update-to-known-state) between tests if a shared table is kept — not
decided here, needs the Discrepancy #1 answer first since "reset" would differ depending on whether
create-on-existing silently upserts or hard-rejects.

## Fix applied (2026-09-11)

`api/system_core/tests/idempotency-regression.spec.ts`'s `US-01.12.02` `beforeAll` now provisions
12 dedicated tables (via a local `provisionDupCfgTable()` helper, created in parallel like the
sibling `US-01.12.03` already does) instead of one shared `dupCfgTableId` for all 16 tests:

| Table | Used by |
|---|---|
| `dupCfgTableId` (kept, never gets a persisted config) | 2710-2713, 2716 (validation-only, always 400) |
| `noConfigProjectionId`'s table (kept) | 2721 ("no config at all") |
| `readBackTableId` | 2708 |
| `enforcementActionErrorTableId` + `enforcementActionOverrideTableId` (**two** tables — see below) | 2714 |
| `updateEnforcementTableId` | 2715 |
| `purgeDaysBoundaryTableId` | 2717 |
| `partialUpdateTableId` | 2718 |
| `matchFieldsUpdateTableId` | 2719 |
| `matchFieldsRuntimeTableId` (+ its own `~DUPCFG` projection) | 2720 |
| `configIdOwnershipTableId` | 2722 |
| `secondConfigTableId` | new test (below) |

**2714 itself needed a second table, not just isolation from its siblings**: its own body creates
TWO independent configs (`enforcementAction=ERROR` then `=OVERRIDE`) on what used to be one table —
under the new one-per-table rule, its own STEP 2 would conflict with its own STEP 1 even with full
cross-test isolation. Split into `enforcementActionErrorTableId` / `enforcementActionOverrideTableId`
so each create is still the first (and only) config on its table. No other test in this Story has
this same internal multi-create shape (2715/2718/2719/2720's later calls are `PUT update`, not a
second `POST create`).

Verified via `tsc --noEmit`, `eslint`, `prettier --check` (all clean) — **not run live** (this
role's user runs tests manually, static checks only).

**New test case added to code** (no Allure case yet — TestOps unreachable this session):
"Creating a second duplicate config on an already-configured table is rejected" — covers the
scenario this whole incident was actually about (a genuine second `POST create` attempt on a
table that already has a config), which no case in 2707-2722 tested on purpose before (the 4
failures were an *accidental* side effect of shared-table reuse, not a deliberate test of this
path). Precondition creates one config, STEP 1 attempts a second with a different `id` and
different `matchFields`, asserts `409` + response references the first config's `id`; STEP 2
confirms the original config is untouched. **Pending**: `allureCaseId(...)` wiring once the
Allure case exists — create it against a live sibling case's actual stored format (do not
guess the shape, per [[feedback_no-hardcoded-unique-field-values]]-adjacent
[[feedback_dont-equate-own-hypothesis-with-dev-confirmation]]-style discipline: this session
could not fetch a live example, so the case is not yet created).

## Allure case created (2026-09-11, VPN back up)

Case **3963** created in TestOps (Component "Idempotency & Duplicate Prevention Engine", Feature
"System Core", Story "US-01.12.02 | Duplicate Detection Configuration"; `status: Draft`, `workflow:
Default Manual`, `testLayer: API Tests`, `tags: [API, Negative, Regression]`) — format mirrored
from live sibling cases 2717/2713 (Preconditions+Test Data folded into `description`, numbered
scenario steps, expected result only on the final step). `allureCaseId(3963)` wired into the test
in code; `tsc`/`eslint`/`prettier` clean.

Also clarified this same session (BA follow-up question — "is changing the config cut off?"):
**no** — `PUT .../duplicate-configs/{id}` (update) is untouched by this change and is proven live
by this Story's own passing tests (2715, 2718, 2719, 2720 all update an existing config, including
changing `matchFields`). Only a second `POST create` while a config already exists is blocked.
Bruno's `Delete Duplicate Config.yml` also documents `DELETE .../duplicate-configs/{id}` → `204`,
"the id becomes reusable by a subsequent create" — a valid delete-and-recreate path, though this
one is Bruno-only, not live-verified by any test in this suite yet.

## Second hidden bug found after the first fix landed (2026-09-11, targeted re-run)

User re-ran just `US-01.12.02` (`vm-results-api-20260911-105959`, 16 tests, 15 passed, 1 failed) to
verify the table-isolation fix — 3 of the 4 original failures now pass; a **new, previously-masked**
failure surfaced in case 2719 ("Update matchFields[] set adds a field without creating a second
config"), STEP 2: `GET /api/v1/tables/{tableId}/duplicate-configs` (the **list** endpoint) now
returns **`405 Method Not Allowed`** (`"Method 'GET' is not supported."`), not the `200` + JSON array
Bruno's `List Duplicate Configs.yml` still documents. `(await listRes.json()) as
DuplicateConfigResponse[]` then parsed the 405 error body as if it were an array, so `.filter`
threw `TypeError: configs.filter is not a function` — the real error was two layers up from the
symptom.

This test's STEP 2 could never reach this call before (it never got past the STEP 1/PRECONDITION
409 on the shared table) — exactly this module's own documented pattern, "a multi-step flow with
one broken step usually hides another broken step behind it." **Not a fresh discrepancy needing
BA confirmation** — the list endpoint's removal was already dev-confirmed in the Aug 11-12 chat
transcript quoted earlier in this file ("И лист нам не нужен там" / "we don't need a list there"),
consistent with the one-config-per-table model (a list of at-most-one config doesn't need its own
endpoint).

**Fixed same day**: STEP 2 rewritten to `getDuplicateConfig(tableId, configId)` (read the one
existing config directly) instead of list+filter — same assertion intent (matchFields persisted
after update), proven via the correct still-live endpoint. `listDuplicateConfigs` removed from
`table-registry-api-client.ts` entirely (only call site, dead endpoint). `tsc`/`eslint`/`prettier`
clean.

**Not yet done**: case 2719's own Allure content wasn't re-checked for a "list" mention (VPN down
again this session) — check once connectivity is back. `Bruno`'s `List Duplicate Configs.yml` is
now stale too (documents `200` + array; real behavior is `405`) — same "needs a PR, out of session
scope" situation as `Create Duplicate Config.yml`.

## Not yet done

- Bruno's `Create Duplicate Config.yml` and `List Duplicate Configs.yml` still stale (old
  contracts) — not touched this session (separate repo, out of scope without explicit ask); needs
  a PR once BA/Dev resolves Discrepancy #1.
- ~~Discrepancy #1 (spec-says-update vs actual-409-reject) still open with BA/Dev~~ — **RESOLVED
  2026-09-11.** BA (Aliaksandr Symanovich) updated the **TB (bank-proj) mirror copy**
  (pageId `1500381186`, v5, 2026-09-11T08:11) — Alt 3 is now "Duplicate Create – 409 Conflict"
  (`POST` on an already-configured table → 409, nothing modified/created), a new Alt 5
  "Configuration Update – 200 OK" explicitly documents `PUT .../duplicate-configs/{configId}`, and
  AC7/AC8 now reference the Update action by name/verb. Verified live, matches case 3963 and the
  code fix exactly. **Two follow-ups for BA, not yet done**: (1) the CBSA (innowise) master copy
  (pageId `5065277479`) is still on v11/old wording — TB is now ahead of the master, the reverse of
  this module's usual lag direction (see [[reference_confluence-innowise-master-bank-mirror]]) —
  needs syncing back; (2) the edit introduced two flows both labeled "Alt 5" (the new Update flow,
  and the pre-existing Persistence Failure flow that was Alt 4 before) — cosmetic renumbering glitch,
  not a content problem.
- No live test yet for `DELETE .../duplicate-configs/{id}` — Bruno-documented only; could add one
  if the user wants delete-and-recreate confirmed the same way update already is.
