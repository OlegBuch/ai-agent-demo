# TB-1860 — Idempotency (duplicate prevention): Integration test case design, v1→v5

**Date/time:** 2026-07-17 14:07 · **Branch:** group-3/TB-1860 · **Ticket(s):** TB-1860

## Discussed

- Scope: design genuinely cross-module **Integration** test cases for TB-1860 (Idempotency /
  duplicate prevention), covering both feature layers — Layer 1 Technical Idempotency
  (`X-Idempotency-Key`, cache-only) and Layer 2 Functional Duplicate Detection (`matchFields`,
  `enforcementAction`, `purgeDays`, SHA-256 hash registry) — across all 5 User Story units
  (US-01.12.01 through US-01.12.05).
- Repeated self-audit cycle, each round prompted by the user's own skeptical verification
  questions ("are these really Integration cases, not feature tests in disguise?", "where did
  these modules come from?", "did you actually check Bruno?"). The user does not want reassurance
  — they want cited, verifiable sourcing, and expects genuine re-checking, not defensive
  justification of prior work.
- Decided, iteratively, and then made **permanent, project-wide rules** (not just TB-1860-local
  conventions) in `.claude/commands/team/manual-qa-agent.md` and
  `.claude/commands/execution/allure-commands/allure-create-test-case.md`:
  - Mandatory Cross-Module Discovery step before designing any Integration case.
  - "The primary goal of an Integration Test Case is the cross-module handoff itself" — a case
    touching only its own Story's module, even with a real API call + DB check, is Component
    wearing an Integration label.
  - Combining-criteria exception: a genuine cross-module case may cite more than the normal
    2-AC cap, additively (never replacing the granular per-Story cases).
  - New required table columns: `Test Data` (between Steps and Expected Results) and
    `Modules / Sub-Modules` (last column) — 12 columns total, fixed format.
  - Numbered-content formatting: every numbered item in Steps/Test Data/Expected Results is its
    own line/block (`<br/><br/>` in Markdown), never inline "1) X 2) Y".
- Confirmed via `/team:manual-qa-agent`: do a full Bruno pass to correlate the Product Factory
  field names/payload shapes used across the suite against the real API contract, and produce v5
  if the pass surfaces real corrections (it did).
- Most recent decision this session: add 2 new cases decomposing BR-3.2 (hash canonicalization)
  into dimensions TC-38 hadn't covered — a `matchFields` value that is itself a Map (key+value)
  and one that is an array — modeled on TC-38's structure but each testing a different
  equivalence class, per the "decompose multi-dimensional rules" rule already in
  `manual-qa-agent.md`.

## Implemented

- `docs/test-cases/TB-1860/analysis.md` — original requirement analysis (Business
  Flows/BR/Alt/AC per unit); base source of truth, unchanged this session.
- `docs/test-cases/TB-1860/integration-test-cases.md`/`.xlsx` (v1) → `-v2`/`-v2.1`/`-v2.2` →
  `-v3` → `-v4` → **`-v5`** (both `.md` and `.xlsx`), each iteration re-verified against a
  different evidence source: v2 retargeted onto real modules + added the two new columns; v3
  re-verified against fresh Confluence + real integration_chapter spec files, fixed a mislabeled
  "Duplicate Registry" module and a false "Account domain" claim; v4 incorporated 12 ground-truth
  corrections from the team's own already-executed Smoke/Regression suite and real dev chat
  (real header `X-Idempotency-Key`, struck the non-existent `IN_PROGRESS` AC4 state, resolved
  `Q-L1RESP` as cached-response replay, 16-char key length, 128-bit truncated base64url hash,
  no separate `DUPLICATE.REGISTRY` table, etc.) — 56 cases (TC-01–TC-56).
- **v5** (this session's main work): full Bruno verification pass against
  `C:\Users\user\BrunoApi\proj-bruno-api` (the sibling checkout, authoritative API contract per
  `docs/frame-specs/api-conventions.md`). Found and fixed real, concrete errors:
  - Product Factory field names use underscores (`PRODUCT_TYPE`, `PRODUCT_CLASS`,
    `COMBINE_ACTIONS` as a real boolean, `PRODUCT_CURRENCIES`), not the dotted-string convention
    this repo's own `test-data/payload-builder.ts` uses — flagged as a real staleness bug in that
    shared helper, worth reporting separately, not something this session fixed.
  - `PF.MANAGER`'s `INPUT` acts on an *existing* product's `recordId` (created via `PF.BUILDER`),
    confirmed via Bruno's own `Tables/Product Factory/00 - Seeding/12 - Full Lifecycle E2E Test/`
    — it does not create an independent record. Fixed by adding an explicit `PF.BUILDER`
    draft-creation step before every `PF.MANAGER` `INPUT` (TC-08, TC-18, TC-19, TC-38).
  - Date-normalization case reanchored from a non-existent `EFF_DATE` field onto `PF.PRODUCT`'s
    real, confirmed `AVAILABLE_DATE` field.
  - 56 cases total after these fixes (TC-01–TC-56), same count as v4 — v5 was corrections, not
    additions, at that point.
  - Added a "Bruno Verification & Corrections" section at the top of the doc documenting the
    confirmed field map per table and the `payload-builder.ts` discrepancy.
- **Added TC-39 and TC-40** (this turn's primary new work), inserted immediately after TC-38 in
  Unit 3, decomposing BR-3.2 into two further, genuinely undocumented dimensions:
  - **TC-39** — a `matchFields` value that is a key-value map. Grounded in Bruno's real
    `MULTILANGUAGE_TEXT` Field Registry DataType (`Field Registry/Field Definition/folder.yml`),
    whose runtime value is an object like `{"en":"...","fr":"..."}` (same shape as every table's
    native `DESCRIPTION` field). Tests whether two functionally identical maps submitted with
    different key insertion order hash the same or differently — written as an open question,
    since BR-3.2's wording only documents ordering *across* the `matchFields[]` list, never a
    single field's own internal serialization.
  - **TC-40** — a `matchFields` value that is an array. Confirmed via Bruno's
    `Field Registry/Field Definition/folder.yml` that Field Registry itself has **no
    array-shaped DataType** at all — so, unlike TC-38/TC-39's Field-Registry-injected custom
    field pattern, TC-40 uses `PF.BUILDER`'s own real native array field `PRODUCT_CURRENCIES`
    (confirmed via `Tables/Product Factory/00 - Seeding/05 - Update Schemas/07 Update PF.BUILDER
    schema.yml`, `"x-type":"ALPHANUMERIC","type":"array"`) directly. Tests element-order
    sensitivity the same way, also written as an open question.
  - Inserting these two cases after TC-38 shifted every subsequent case number by +2 (old
    TC-39–TC-56 → new TC-41–TC-58); found and fixed the one internal cross-reference this broke
    (old TC-48's "Reuse TC-44's row" → new TC-50's "Reuse TC-46's row"). Updated the Coverage
    Matrix (US-01.12.03 now 15 raw items but 17 cases, called out explicitly as the expected
    effect of decomposition) and Changelog.
  - Total case count: 56 → **58**.
- Regenerated `docs/test-cases/TB-1860/integration-test-cases-v5.xlsx` via the scratchpad's
  generic Markdown→xlsx converter (`md_to_xlsx_v5.py`, `openpyxl`-based, one sheet per Markdown
  table). Verified output: 8 sheets total, Unit 3 sheet now has 17 rows (TC-29–TC-45), matching
  the `.md`; `.md` and `.xlsx` are in sync as of this session's end.
- `docs/test-cases/TB-1860/test-cases-explained-ru.md` — Russian plain-language explanation doc
  for a BA approval call. Last synced to **v4** (56 cases); **not yet updated for v5** — still
  describes v4's case IDs/content. This is a known, explicitly flagged gap, not an oversight.

## Learned

- Field Registry's own DataTypes table (`Field Registry/Field Definition/folder.yml`) is a fixed,
  documented enum: `ANY, ASCII_PRINTABLE, ALPHANUMERIC, MULTILANGUAGE_TEXT, SWIFT, NUMERIC,
  BOOLEAN, AMOUNT, RATE, DATE, TIME, DATE_TIME, PERIOD, FREQUENCY, LINKED_TABLE, ENUM,
  VIRTUAL_TABLE, INFORMATION, JOIN` — none of these are array-shaped. Any array-valued field in
  this platform (e.g. `PRODUCT_CURRENCIES`, `ATTRIBUTE_CLASSES`) is a native JSON-schema array
  property baked directly into a Product Factory table's own schema via
  `PUT tables/api/v1/tables/PF.*/definitions`, not something created through Field Registry's
  `POST /fields`. This is durable, reusable knowledge for any future case needing an
  array-shaped or map-shaped test field in this codebase — worth carrying into
  `docs/frame-specs/` or `docs/project-spec/` if a future session needs it again, since this
  chat-history file is a log, not the authoritative doc.
- `PF.MANAGER`'s `INPUT` operation always requires a pre-existing `recordId` from a `PF.BUILDER`
  draft — this is now fixed in this suite's own cases (TC-08, TC-18, TC-19, TC-38, TC-39) but is
  a general platform fact worth remembering for any other ticket touching Product Factory.
- This repo's own `test-data/payload-builder.ts` uses a stale dotted field-naming convention
  (`'PRODUCT.TYPE'`, `'COMBINE.ACTIONS'` as a string) that doesn't match the platform's real,
  current schema (confirmed via Bruno) — flagged as a possible real bug affecting other,
  already-existing Product Factory tests, not verified further this session.
- User memory reconfirmed this session (see project memory
  `feedback_justify-additions-before-making.md`): every new endpoint/field/module claim must be
  cited to an exact Bruno file, doc, or code location before being added to a test case — this
  was applied throughout, most recently for TC-39/TC-40's field-type grounding.

## Open Items / Follow-ups

- `test-cases-explained-ru.md` still reflects v4 (56 cases), not v5 (58 cases, including
  TC-39/TC-40) — needs a resync pass before the BA approval call if this doc is still going to be
  used for that purpose.
- `test-data/payload-builder.ts`'s stale dotted Product Factory field-naming convention is a
  flagged, unconfirmed potential bug — not reported to anyone or fixed; someone (AQA Lead?)
  should decide whether to investigate/fix it, and whether other existing automated tests are
  silently affected.
- TC-39/TC-40's actual pass/fail outcomes are genuinely unknown (by design — written as open
  questions) since BR-3.2 never documents map-key-order or array-element-order canonicalization
  behavior. These need to actually be executed against the real system once automated, with the
  observed behavior escalated to the Architect for a decision on whether it's intended.
- Redis-at-PKF deployment status (from v4's ground-truth corrections) remains unconfirmed — still
  an open dependency for TC-09 (two-tier cache lookup).
- Real session/OVERRIDE-confirmation timeout duration (TC-32) and the OVERRIDE self-approval vs.
  four-eyes question (TC-36) remain open per the team's own regression suite parity — not
  resolved this session, by design (escalated, not guessed).

## References

None.
