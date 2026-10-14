Module: Idempotency / Functional Duplicate Detection (US-01.12.03)
Confluence: `US-01.12.03 | Functional Duplicate Detection (ERROR + OVERRIDE)`
(innowise-group/CBSA space is the BA-authored master; the bank-proj/TB copy can lag behind it — check
the master when the two disagree).
Last updated: 2026-09-24

This file is the entry point for anything touching the Idempotency module. Read it first, before
re-deriving facts from Bruno/Jira/Confluence.

## What this module does

A dynamically created Table/Projection can carry a `duplicateDetection` config
(`matchFields[]`, `enforcementAction` = `ERROR` | `OVERRIDE`, `purgeDays`). On `INPUT`, the system
hashes the configured fields and checks `duplicate_registry` for a match:
- `enforcementAction = ERROR` — a matching hash rejects the request outright (`422`, includes the
  existing record's `source_ref`); nothing is persisted.
- `enforcementAction = OVERRIDE` — a matching hash returns `422` with override info /
  `input_session`, and a separate `.../records/operations/INPUT/accept` call is meant to let an
  authorized actor persist the record anyway, linking it into `duplicate_registry.source_ref`.

`duplicate_registry.source_ref` is a **jsonb column, not a Postgres array** — queries must use
jsonb containment (`@>`), not `ANY()`. BR-3.7 in an earlier `docs/test-cases/TB-1860/analysis.md`
draft assumed `TEXT[]`; corrected there once confirmed against the live schema.

## Open/resolved items — read the specific file for full detail

All three stories now have their own subfolder ([US-01.12.01/](US-01.12.01/),
[US-01.12.02/](US-01.12.02/), [US-01.12.03/](US-01.12.03/)).

| File | Status (as of 2026-09-11) | What it's about |
|---|---|---|
| [US-01.12.02/README.md](US-01.12.02/README.md) | **Fully resolved (code + Allure + spec) 2026-09-11; only Bruno + CBSA-master sync left** | Regression-m2 (2026-09-11) failed 4/16 cases with `409 "Only one duplicate config per table is allowed"` — confirmed backend-side intentional change: exactly ONE duplicate-config per table now, not many-by-id. Test suite rewritten to a dedicated table per test (12 tables); 2714 split into two tables since it creates 2 configs itself. New case **3963** created + wired. **Spec discrepancy resolved same day**: BA updated the TB (bank-proj) mirror page (v5) — Alt 3 now "Duplicate Create – 409 Conflict", new Alt 5 "Configuration Update – 200 OK" for PUT, AC7/AC8 reference PUT explicitly — matches our fix exactly. Remaining: CBSA (innowise) master copy still on old wording (needs sync from TB, unusual direction), a cosmetic double-"Alt 5" numbering slip, and `proj-bruno-api`'s Create Duplicate Config doc still stale (not yet PR'd). |
| [tc03-override-accept-403.md](US-01.12.03/tc03-override-accept-403.md) | **Closed for good** | URL bug fixed, then the four-eyes question was closed by a live 3-probe diagnostic — see next row. |
| [tc07-override-accept-no-permission-200.md](US-01.12.03/tc07-override-accept-no-permission-200.md) | **Closed — precise mechanism confirmed by live diagnostic** | `/accept` has no *identity-based* check (no self-approval-vs-different-actor distinction) — but it DOES check the generic `INPUT` table permission. Same actor with `INPUT` permission → `200`; a different actor lacking `INPUT` permission → `403`. This refines TB-3031's blanket "no permission check exists" — there is a check, it's just not four-eyes. Case 2740 (which assumed genuine four-eyes) was deleted by the user as a result. |
| [bug-500-accept-override.md](US-01.12.03/bug-500-accept-override.md) | Bug, was blocking | `.../INPUT/accept` returned `500` even after the URL fix above; now fixed upstream. |
| [bug-duplicate-registry-not-updated-on-accept.md](US-01.12.03/bug-duplicate-registry-not-updated-on-accept.md) | Bug, confirmed live (two independent runs) | After a successful `accept` (200, record persisted with `ST_OVERRIDES` audit), `duplicate_registry.source_ref` is never updated to include the newly accepted record — the override is not actually linked. |
| [bug-amount-normalization-not-deduped.md](US-01.12.03/bug-amount-normalization-not-deduped.md) | Bug, confirmed against current live Confluence spec | `AMOUNT` values that differ only in scale/notation (`100`, `100.00`, `1E2`) are not recognized as duplicates, even though the spec's Business Rule requires `BigDecimal.toPlainString` normalization before hashing. Distinct from the BR-3.5 item below (a *different*, dev-confirmed-intentional date-normalization mismatch — don't conflate the two). |
| [bug-allure-2734-contradicts-br-3.5-date-normalization.md](US-01.12.03/bug-allure-2734-contradicts-br-3.5-date-normalization.md) | **Resolved — case rewritten** (2026-08-28, at the user's explicit request) | Allure case 2734 previously said dates ARE normalized before hashing, contradicting dev-confirmed BR-3.5. Rewritten via `testops_update_testcase` to describe the real, tested behavior (exact-format-required, `400` for any other format) and linked to the existing test (`allureCaseId(2734)`, `TC-11:` prefix dropped). |
| [bug-allure-2672-mislabeled-duplicate.md](US-01.12.01/bug-allure-2672-mislabeled-duplicate.md) | **Resolved — case deleted** (soft-deleted 2026-08-28, `DELETE /api/testcase/2672`, restorable via `testops_restore_testcase` if this call turns out wrong) | Case 2672 was titled "X-Company-Code" but its actual steps duplicated case 2671's ":operation" scenario verbatim, byte-for-byte — a genuine accidental duplicate, not a second real case. Deleted per explicit user instruction after re-confirming no third copy exists anywhere in the component (checked via `name ~=` AQL across the whole project, not just this Story). 2673 (the real X-Company-Code case) is untouched and remains linked to the existing test. |
| [bug-ttl-13min-not-1day.md](US-01.12.01/bug-ttl-13min-not-1day.md) | **Confirmed bug** (official QA Compliance Check TB-3029) | Idempotency cache TTL is documented as 1 day (AC5) but confirmed on QA at **~14 minutes**. Blocks automating the 3 TTL-dependent Manual cases (2667, 2678, 2679) until BA/Dev decides which value is correct. |
| [missing-allure-case-overriderequiredexception-not-cached.md](US-01.12.01/missing-allure-case-overriderequiredexception-not-cached.md) | **Test written 2026-09-04, still no Allure case** | The original test-design sheet's "OverrideRequiredException response is NOT cached" case has no corresponding Allure case at all. **Citation correction (2026-09-04, verified live against Confluence pageId 1500184580, cloudId bank-proj.atlassian.net, version 4)**: the Excel sheet's own "AC6; Alt 3; Alt 8 (Override Continuation)" citation is stale — the live page's Alt flows stop at **Alt 7**, there is no Alt 8. The real requirement is: **Alt 3 / AC6** (general rule — a failed/rolled-back operation's marker is removed, a later retry with the same key may re-execute) applied to the override-required failure mode specifically, reinforced by **Alt 7's first sentence** ("If the original request results in an override requirement, the response is not cached"). AC10 (the other half of Alt 7, about `/accept` using an independent cache key) is a *different* scenario already covered by case 2674/TC-10 — not this one. At the user's explicit request, wrote the test anyway in `idempotency-regression.spec.ts` (no `allureCaseId(...)` yet — pending Manual QA creating the case). Design note: the 422 body is deterministic (`OverrideConfirmation.id` in `table-registry.types.ts` carries no per-attempt session token), so a plain repeat-and-compare can't distinguish a cache replay from a genuine re-execution — both would return the identical 422. First draft deleted the `duplicate_registry` row directly via DB between the two INPUT calls; revised after user pushback ("isn't this bypassing the feature?") to stay API-only instead — between the two identical INPUT calls, `PUT Update Duplicate Config` changes `matchFields` from `ACCOUNT_NUMBER` to the always-unique `ID`, reusing the exact runtime-takes-effect-without-redeploy behavior case 2720 already proves live. A genuine re-execution then hashes on `ID` and finds no match (`200`); a cached replay would still show the stale `422`. Cleaner than the DB approach: touches only the Layer 2 config surface already exercised elsewhere in this suite, via the public API, not a direct write to an internal table. Unverified live (VPN down at write time) — user will run and confirm. |

**Case 2740 ("OVERRIDE approver vs initiator (4-eyes)") was deleted from Allure by the user on
2026-08-28**, after a live 3-probe diagnostic (see [[tc07-override-accept-no-permission-200]])
confirmed the case described a concept — identity-based four-eyes — that has no code path in the
system at all, not even a broken/partial one. Not re-created here; if the platform ever adds a real
four-eyes check, this is the reference to reopen.

## Allure Linking — full component inventory (2026-08-28, final state after dedup + 2740 deletion)

`Component = "Idempotency & Duplicate Prevention Engine"` in Allure TestOps (project id 2, "TB CBS")
now holds **44 cases** across 3 Stories (started at 46: case 2672 deleted as a confirmed accidental
duplicate of 2671; case 2740 deleted by the user after a live diagnostic proved its premise —
identity-based four-eyes — doesn't exist in the system). Ids fetched via `GET /api/testcase/{id}/cfv`
plus a project-wide `name ~=` AQL sweep for every recurring phrase in this component to positively
confirm 2672/2673 was the *only* duplicate pair in the whole component — see
[[reference_allure-testops-rest-access-from-proj-test-automation]] for the query approach.
`proj-test-automation`'s `idempotency-smoke.spec.ts` / `idempotency-regression.spec.ts` had every
automated test's title stripped of its `TC-N:` prefix and given `allureCaseId(...)`, per
[[feedback_no-tc-prefix-when-allurecaseid-set]]. All `allureCaseId(...)` values in the repo were
re-verified live (fresh `GET /api/testcase/{id}` per id, not cached) to exist, not-deleted, and
title-match their test — confirmed clean, zero stale/typo'd ids.

| Story | Allure cases | Automated | Not automated |
|---|---|---|---|
| US-01.12.01 \| Technical Idempotency | 14 (2665–2679, minus deleted 2672) | 10 | 4 |
| US-01.12.02 \| Duplicate Detection Configuration | 16 (2707–2722) | 16 | 0 |
| US-01.12.03 \| Functional Duplicate Detection (ERROR + OVERRIDE) | 14 (2724–2738, minus deleted 2740 and 3 unrelated interspersed cases) | 13 | 1 |
| **Total** | **44** | **39** | **5** |

Not-automated breakdown, with the *why* behind each (none of these 5 are "planned for a future
milestone/M3" — the module's 3 Stories and their QA Compliance Checks are all ticket-status `Done`):

| Case | Title | Why not automated |
|---|---|---|
| 2667 | Successful commit caches the response for 1 day (TTL) | **Blocked by the TTL bug** — proving "1 day" for real would take a day; proving the actual ~14-minute value would encode a bug as the expected result. See [[bug-ttl-13min-not-1day]]. |
| 2675 | Cached response lost in both tiers => processed as a first attempt | **Revised 2026-09-04**: technically automatable now — the case's own Steps list "wait TTL" as a sanctioned alternative to flushing L1+L2, and its Expected Result doesn't assert any specific TTL duration (unlike 2667/2678/2679), so waiting out the confirmed real ~14-min TTL ([[bug-ttl-13min-not-1day]]) doesn't encode the disputed 1-day-vs-14-min value as correct. Blocker is now purely a suite-speed trade-off: the test would need a ~20-min per-test timeout override (the enclosing `US-01.12.01` describe caps at 350000ms, well under even the `API-tests` project's already-generous 900000ms default), adding ~15 min to every Regression run. User's call (2026-09-04): defer — not worth it for one case without first deciding whether a slow/nightly suite should exist for cases like this and 2727. Left `Not Automated` for this stated reason, not the old "no testability hook" one. |
| 2678 | After TTL expiry the request is processed as a first attempt | Same TTL bug as 2667 — same blocker, same fix needed first. |
| 2679 | Manually verify that the cached response is deleted after 1 day (TTL expiry) | **Manual by design** (own title says "Manually verify") — compounded by the same TTL bug. |
| 2727 | Duplicate found with OVERRIDE, not confirmed -> session expires (30 min) | **Technically possible, practically expensive.** The "30 min" figure isn't in the Confluence Story text at all — it's only an empirically-observed QA fact (TB-3031). No fast-forward/expire-early mechanism exists anywhere in Bruno. A real 30-minute wait would work but doesn't belong in the fast Smoke/Regression suite — needs a decision on whether a slow/nightly suite is worth building for this one case. |

**Resolved this session (2026-08-28), not just linked:**
- **2674** "OVERRIDE continuation: accept uses a different scoped key" — was `Not Automated` with a
  stale QA-sheet comment ("OVERRIDE is still in implementing"); official QA Compliance Check TB-3029
  (2026-08-19) confirms this flow works on QA, and Bruno confirms it reuses the exact same
  `Execute Accept Override` endpoint already used and proven in US-01.12.03's own OVERRIDE tests — so
  it was written using the same pattern, added as a flat test inside the existing
  `US-01.12.01 | Technical Idempotency` describe (extending the Story's shared `beforeAll` with one
  more table, matching how US-01.12.03's own `beforeAll` already provisions multiple tables — no new
  nested describe needed, corrected after user pushback on an initial draft that had one).
- **2734** "Date normalization to ISO format" — Allure case rewritten (at the user's explicit
  request) to describe the real, tested behavior (exact CBS format required, `400` for anything
  else) instead of the BR-3.5-contradicting "dates are normalized" text it had before; the existing
  `TC-11` test relinked to it (`allureCaseId(2734)`, prefix dropped).
- **2740** "OVERRIDE approver vs initiator (4-eyes)" — deleted by the user after a live 3-probe
  diagnostic (see [[tc07-override-accept-no-permission-200]]) proved its premise doesn't exist in
  the system at all.
- **2726** "Duplicate found with OVERRIDE, then accepted -> record saved" (smoke) — while
  cross-checking it against 2726's own stored Allure steps, found the test only asserted the `422`
  status at Step 1 but not the response body content Allure's Expected Result also requires
  ("contains details of the detected duplicate along with the InputSession / override metadata").
  Added an assertion on `RecordInputResponse.overrides` (already-typed field, `api/types/table-registry.types.ts`)
  being present and non-empty. Re-ran just this test live — passes.

**Live run confirmed (2026-08-28): all 39 automated Idempotency tests pass, 0 failures** (full suite
run before the 2734/2726 changes above; 2726 individually re-verified passing after its change) —
`idempotency-smoke.spec.ts` and `idempotency-regression.spec.ts` run against the real QA environment
(`npx playwright test --project=API-tests`, ~11 min for the full pair). Along the way: fixed a live
failure the user hit on first run of the new 2674 test — `generateCustomId('ACC_OVRCONT')` (11
chars) overflowed `ACCOUNT_NUMBER`'s `maxLength: 32` (generator adds `22 + prefix.length` chars);
shortened to `'ACC_OVR'`. Also worth noting: case 2711 ("Missing required property is rejected")
passed cleanly today despite the original Excel sheet recording a `Fail` state against bug
TB-2526 — that bug looks resolved now (not re-verified against the Jira ticket itself, just an
observation from this run).

No further tests were added beyond 2674 — every remaining gap (2667, 2675, 2678, 2679, 2727, see
table above) is genuinely blocked for a stated reason, not just unautomated by oversight. Forcing
any of them through now would either encode a live bug as "expected" (the TTL cases) or require
infrastructure/timeout-budget decisions (2675's missing cache-flush hook, 2727's real 30-minute wait
exceeding the suite's per-test timeout) that are the user's/BA's call, not this role's to make
unilaterally.

## Patterns & Predictive Rules (use these to predict, then verify — don't just cite the facts above)

- **Don't assume "normalize before matching" is implemented uniformly across field types just
  because the spec states one rule.** Confirmed inconsistent within this module's own stated
  business rules: `AMOUNT` fails to normalize despite BR2's explicit `BigDecimal.toPlainString`
  requirement (a real bug), while dates are correctly *not* normalized by intentional design
  (BR-3.5). **Predict**: for a new match-field type you haven't specifically tested, verify its
  actual hashing behavior empirically — a sibling field type's confirmed behavior, or the spec's
  general statement, is not evidence for how a *different* type actually behaves in this system.
- **A multi-step flow with one broken step usually hides another broken step behind it.** The
  accept-override path was found broken three times in sequence — a wrong URL, then a `500` once
  the URL was fixed, then a silent `duplicate_registry` non-update once the `500` was fixed.
  **Predict**: when a blocked flow finally clears one failure, don't assume the rest of the flow
  now works end-to-end — re-verify every subsequent step's actual side effects (not just its status
  code) before calling the flow proven.
- **An endpoint whose name suggests "override"/"approve" does not necessarily implement genuine
  four-eyes just because the platform has a maker-checker convention elsewhere.** Resolved
  definitively (2026-08-28, live 3-probe diagnostic): `.../INPUT/accept` has **no identity check at
  all** — same actor or different actor makes no difference; the only real gate is whether the
  accepting actor has the plain `INPUT` permission on the target table. **Predict**: for any new
  "approve"/"override"-shaped endpoint in this system, don't assume four-eyes from the name or from
  this platform's maker-checker convention on other flows (FIN AUTH) — test the same-actor case AND
  the different-actor-without-permission case independently, and expect "generic operation
  permission, no identity check" as the more likely default unless proven otherwise.
- **`generateCustomId(prefix)` has a fixed, computable character budget — verify any new literal
  prefix against the target field's `x-config.maxLength` before using it, don't eyeball it.**
  Confirmed twice now: the 2674 test originally used `'ACC_OVRCONT'` (11 chars) against
  `ACCOUNT_NUMBER maxLength: 32` and overflowed (fixed to `'ACC_OVR'`, 7 chars — see the "Live run
  confirmed" note above); `idempotency-smoke.spec.ts`'s `US-01.12.03` cases 2724/2726 independently
  repeated the exact same mistake with `'ACC_TC01'`/`'ACC_TC03'` (8 chars each), first caught live on
  UAT on 2026-09-24 (`vm-results-api-20260924-122140`, both failing `400: "ACCOUNT_NUMBER - maxLength
  must be <= 32"`). Diagnosis confirmed live: temporarily bumping the schema's `maxLength` to 35 made
  both tests pass, proving the account-number *value* — not the backend — was at fault. **Fixed for
  real 2026-09-24** (user-approved, applied to both `idempotency-smoke.spec.ts` AND
  `idempotency-regression.spec.ts` — the audit found 7 more identical 8-char-prefix instances in the
  regression file alone, all silently sharing the same 33-char overflow: `'ACC_TC02'`, `'ACC_TC07'`,
  `'ACC_TC08'`, `'ACC_TC12'`, `'ACC_TC13'`, `'ACC_TC14'`, `'ACC_TC15'`, plus `'ACC_NOCA'` (8 chars,
  also overflowing) and the already-fixed `'ACC_OVR'` (7 chars — safe only for a *single-digit*
  worker index, re-shortened to `'ACCOVR'`/6 chars for double-digit safety too). All renamed to
  5-6-char prefixes (`'ACC01'`..`'ACC15'`, `'ACCOVR'`, `'ACCNC'`) verified by direct execution of
  `dynamic-name-generator.ts`'s own template to stay ≤32 chars even past a 2-digit
  `TEST_PARALLEL_INDEX`. The exact formula (verified by direct
  Node execution of `dynamic-name-generator.ts`'s own code): total generated length =
  `25 + prefix.length` for a single-digit `TEST_PARALLEL_INDEX` worker, `26 + prefix.length` for a
  double-digit one (`AQA_` + `<prefix>` + `_w<N>` + `_<13-digit epoch ms>` + `_<3-hex>`, all fixed
  except `prefix` and the worker-index digit count). **Predict**: before assigning any literal prefix
  to `generateCustomId`/`generateCustomRecordId` whose result feeds a field carrying a declared
  `x-config.maxLength`, compute `budget = maxLength - 26` (using 26 to stay safe past a double-digit
  worker) and keep the prefix at or under that many characters — this is a **deterministic** overflow
  that reproduces identically on every environment and every run once the prefix is too long; it is
  never a flaky or environment-specific failure, so don't diagnose it as one (see the run note below).
  `ID` fields in this module's schemas (`maxLength: 64`) have enough headroom that this has never bitten
  them — it only shows up on the tighter `ACCOUNT_NUMBER`/`DEBIT_ACCOUNT`-style 32-char fields.
  **2026-09-24: closed at the source, not just at the call sites.** At the user's suggestion, added
  `generateBoundedCustomId(prefix, maxLength)` next to `generateCustomId` in
  `api/utils/helpers/dynamic-name-generator.ts`. Went through 2 revisions the same day on user
  feedback: v1 threw on overflow; v2 truncated the prefix instead but measured the overhead by
  generating a throwaway id first (double `randomBytes`/`Date.now()` call — "наляписто"); **v3
  (final)** builds the `_w<worker>_<epoch>_<hex>` suffix exactly once, computes the remaining budget
  for the prefix by plain arithmetic, truncates, and assembles the id directly — one generation,
  no indirection through `generateCustomId`/`buildAqaId`. Uniqueness comes entirely from that
  suffix, never from the prefix, so truncating it is free (only a `console.warn` when it happens);
  it only throws in the pathological case where `maxLength` is too small to fit even an empty
  prefix. All `ACCOUNT_NUMBER`-feeding calls in both `idempotency-smoke.spec.ts` and
  `idempotency-regression.spec.ts` (11 total, listed above) use it with `maxLength=32` explicit at
  the call site — callers no longer need to hand-compute a prefix budget at all.
  **Extended to every schema-bound id in both files same day** (user's explicit follow-up ask,
  "чтобы точно все ок было"): every `recordId`/`firstRecordId`/`secondRecordId`/etc.-style variable
  feeding a projection's `ID` field now uses `generateBoundedCustomId(..., 64)` (46 call sites: 4 in
  smoke, 42 in regression — converted with a small one-off Node script matching on variable name,
  not by hand), and `FUNC_DUP_HASH_SCHEMA`'s `FIELD_A`/`FIELD_B` calls (7, in regression, previously
  flagged as an at-the-boundary risk) now use `..., 32`. **Deliberately left as plain
  `generateCustomId`**: duplicate-config `id` values (`configId`, `errorConfigId`, `firstConfigId`,
  the inline `id:` fields in `DUPCFG_TC05_A/B/C` etc.) and the `X-Correlation-Id` header value
  (`'CID'`) — neither is a projection schema field with a declared `x-config.maxLength` anywhere in
  these two files, so wrapping them would mean inventing a limit with no source to justify it
  ([[feedback_justify-additions-before-making]]). Revisit only if a real length constraint on
  duplicate-config ids or correlation ids ever turns up (Bruno, a schema, a live `400`).
  **Open question, checked 2026-09-24, no answer found:** the user recalled this exact scenario used
  to pass on bankuat and still passes on bankstg today, raising whether backend-side `maxLength`
  enforcement on `ALPHANUMERIC` fields for `INPUT` was recently added/changed. Searched Jira (both
  `bank-proj`/TB and `innowise-group`/CBSA) and Confluence (both sites) for any ticket/page documenting
  this — found nothing confirming a recent addition; the one close hit, TB-3045 ("[DOC GAP] No
  maxLength enforced on DESCRIPTION", Closed 2026-09-09, Document Management module), documents the
  *opposite* gap (enforcement missing) in an unrelated module. Checked `proj-bruno-api` (fresh
  `origin/main`) for the same: field-registry/operation collection docs describe `maxLength` as a
  supported ALPHANUMERIC `x-config` option but never document enforcement timing or a
  bankstg-vs-bankuat difference; `bankstg.yml`/`bankuat.yml` are identical apart from base URLs (no
  validation feature flag). Recent `proj-bruno-api` commit history since 2026-06-01 does show several
  "validation plugin" tickets (TB-3970, TB-3983) and mandatory-field-validation fixes (TB-3283,
  TB-3397, TB-3588), plus one 2026-09-03 commit dropping an inconsistent `maxLength:5` off a NUMERIC
  field (`ADM_EXTENSION_DAYS`) — none explicitly about ALPHANUMERIC/INPUT length enforcement, but the
  validation-plugin tickets are the most plausible place a real behavior change could hide. **This
  needs a direct answer from Dev/BA, not further doc search** — neither research path confirms or
  rules out a recent backend change; don't re-run the same Jira/Confluence/Bruno search next time,
  ask the backend team directly and record the answer here once received.

- **"null" in a `matchFields[]` field means the key is OMITTED from the payload, not sent as an
  empty string.** Confirmed 2026-09-25 two ways: (1) the working sibling case 2728 ("All matchFields
  are null -> duplicate check is skipped") represents "null" by leaving every matchField key out of
  the request body entirely, and passes; (2) case 2729 ("Partial null in matchFields -> hash uses a
  sentinel") sent `FIELD_B: ''` (explicit empty string) instead, and its precondition failed with
  `400 "FIELD_B - Value must not be blank"` before ever reaching the sentinel-hash logic the case is
  meant to prove — a test bug, not a backend bug. The Story's own AC (US-01.12.03, "Partial Null in
  matchFields – Hash With Sentinel": "WHEN some (but not all) fields in matchFields[] are null...
  THEN the System replaces null values with a sentinel...") confirms the sentinel behavior is real
  and intended; the test's own representation of "null" was wrong. Fixed in
  `idempotency-regression.spec.ts` by dropping the `FIELD_B: ''` key from `partialNullData` instead
  of sending it blank. This is the same distinction already seen on `CURRENCY.ORDER.UNIT`
  (TB-3588, a different module) — treat "field omitted" and "field explicitly sent blank" as two
  different, independently-validated states anywhere in this system, never assume they're
  interchangeable ways to express "no value."
  **2026-09-25, added but not yet verified**: `idempotency-regression.spec.ts`'s case 2729 test now
  has a diagnostic `STEP 2` — a third record with the same `FIELD_A`/`AMOUNT`/`VALUE_DATE` but a
  real (non-null) `FIELD_B`, expecting `200` (not a duplicate). This distinguishes genuine sentinel
  substitution from the alternative, also-AC-compliant-looking bug where the backend simply drops a
  null matchField from the hash instead of substituting a sentinel for it — the original PRECONDITION/
  STEP 1 pair alone can't tell the two apart, since both null-FIELD_B records would collide either
  way. Pending a live run: `200` confirms real sentinel behavior; `422` would mean FIELD_B is being
  ignored, not sentinel-substituted, and needs escalating to BA/dev, not encoding as expected.
  **Not yet wired to an Allure step/TC change** — kept as a plain code-only diagnostic until the
  live result is known.

## Don't re-litigate these

- **BR-3.5 has no date normalization** — dev-confirmed intentional (2026-08-07): CBS requires one
  specific DateTime format; alternates get `400`, not silent normalization (see
  `docs/test-cases/TB-1860/analysis.md`, BR-3.5). Unlike the AMOUNT bug above, this one is *not* a
  defect — don't treat it as one just because it looks structurally similar.
- **`duplicate-config` has no `targetTable` in its response** — confirmed by the user directly; the
  Bruno collection and `docs/test-cases/TB-1860/analysis.md` were stale on this specific point at
  the time it was raised — this is not a regression to re-flag if seen again.
- **`.../INPUT/accept` has no identity-based four-eyes check** — closed 2026-08-28 by a live 3-probe
  diagnostic (see [[tc07-override-accept-no-permission-200]]). Don't re-open this as an "open
  question" from an old QA sheet or an old TB-1860 note — it's settled: same actor succeeds, a
  different actor succeeds too as long as they hold the generic `INPUT` permission on the table.
