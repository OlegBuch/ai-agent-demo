Status: Draft
Related Ticket: TB-2083
Related Epic: not confirmed as a distinct Jira Epic key in this repo's prior session artifacts —
the spec-level grouping is `EP-02.05 | Override and Dispo Processing (Exception Management)`
(Confluence, `US-02.05` story family under it). Flag to the Business Analyst if a dedicated TB
Epic key should be recorded here instead.
Source Project: TB (bank-proj.atlassian.net) — spec/stories on Confluence
Owner: Manual QA

# Requirement Analysis: TC-EP0205-004, TC-EP0205-020, TC-EP0205-026 — manual-precondition
false-negative investigation and fix (Override/Dispo UI)

## Ticket Summary

TB-2083 covers Override and Dispo (Exception Management) automation and manual UI verification,
spanning `US-02.05.01`–`US-02.05.07` (Confluence spec family `EP-02.05`). This document does not
re-author that suite's requirements or its full test-case set — those already exist as an
externally-tracked Google Sheet ("EP-02.05 | Override_Dispo_UI.xlsx", fileId
`1iH9tBTSh2zJnp8LwNlPdLAk1CiZLAgyv`, tab "Test Cases", live tab `gid=219176037`) plus the automated
`api/security_management/tests/override-dispo-smoke.spec.ts` /
`override-dispo-regression.spec.ts` suites in `proj-test-automation`, both already reconciled in
prior sessions (see `docs/chat-history/2026-08-19_21-39_tb-2083-override-dispo-fixes.md` and
`docs/review-mr/138-tb-2083-override-and-dispo-processing-smoke/`).

This document instead reconciles a **manual UI re-verification pass** run against three specific
sheet-tracked cases — `TC-EP0205-004`, `TC-EP0205-020`, `TC-EP0205-026` — that had previously been
recorded with findings implicating the CBS product itself. Developer feedback on all three
disputed that framing. Investigating each led to root-causing the actual defect in each case's
**manual-precondition provisioning code** (`api/security_management/helpers/
override-dispo-ui-preconditions-helper.ts`), not the product, and — for TC-026 — to a reclassified,
narrower finding than originally recorded. See
`docs/chat-history/2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md` for the full
session narrative this document distills.

## Modules Touched

| Case | Story | Projection(s) under test |
|---|---|---|
| TC-EP0205-004 | `US-02.05.0X` (AUTH-time DISPO.ITEM gate — "Decoupled authorization") | source record's own projection (parent), `DISPO.ITEM~SYSTEM`/`~REVIEW` |
| TC-EP0205-020 | `US-02.05.0X` (FORWARD / absence-redirect loop-back) | `DISPO.OFFICER~BASIC`, `DISPO.ITEM~REVIEW` |
| TC-EP0205-026 | `US-02.05.0X` (localization / non-English `LANGUAGE_ID`) | `SM.USER~INTERNAL`, `DISPO.OFFICER~BASIC`, `LANGUAGE~BASIC` |

Exact `US-02.05.0X` sub-story numbers for these three cases were not re-confirmed against
Confluence live in this session (the session worked from the Google Sheet and prior chat-history,
not a fresh Confluence read) — left unresolved below as an open item rather than guessed.

## Per-Case Analysis

### TC-EP0205-004 — AUTH should be blocked while a linked DISPO.ITEM is PENDING

**Prior finding (superseded):** recorded as if the product failed to block AUTH on a record with a
pending override ticket.

**Developer feedback:** the precondition script's data shape was wrong. Per the `TI-02.05 |
Override and Dispo Processing (Exception Management)` architecture page (Confluence page
`1499856902`), AUTH-time gating ("Decoupled authorization") works by the core reading `dispoItemId`
entries out of the **parent record's own `audit.ST_OVERRIDES` array**
(`{overrideId, status, approvedBy, approvedAt, params, targetFieldId, dispoItemId}`), fetching each
referenced DISPO.ITEM ticket, and blocking with 403 unless every one is `APPROVED`. The prior
precondition created a standalone DISPO.ITEM record that cross-referenced the parent via
`SOURCE_RECORD_ID`/`OVERRIDE_ID` fields on the ticket itself — a shape the AUTH gate never reads.

**Root cause (confirmed):** `provisionRecordAwaitingAuthWithPendingDispoItem` never wrote anything
into the parent's own `audit.ST_OVERRIDES`, so the AUTH gate had nothing to find and (correctly, by
its own logic) let AUTH proceed — a false negative in the test's own setup, not a product gap.

**Fix:** added a real `{recordId}-{overrideId}-{attempt}`-shaped `ticketId` (truncated to fit the
64-char column limit) and a direct DB write of a `ST_OVERRIDES` entry onto the parent NAU record's
`audit` column (new query `RECORD_SPACE.SET_AUDIT_FIELD_BY_ID` in
`api/utils/constants/db-query-keeper.ts`), resolving the correct physical schema first via
`COMPANY_SCHEMA_SUFFIXES_CORE` probing (dynamic tables aren't always at the bare table-id schema).
Developer confirmed a direct DB write is acceptable here since DISPO.ITEM can currently only be
spawned "for real" through the accept-flow plugin, not a public API.

**Manual UI re-verification:** logged in, opened AUTH on the provisioned record, clicked
Authorize — blocked with 403 "Failed to authorise record / Forbidden", record remained in NAU.
Matches expected result. **Status: Passed.**

### TC-EP0205-020 — FORWARD should be blocked on an absence-redirect loop-back

**Prior finding (superseded):** recorded as if FORWARD incorrectly succeeded when it should have
been blocked by the target officer's own absence redirect.

**Developer feedback:** three hypotheses offered — (1) the precondition script wipes the target's
absence fields, (2) the absence date window doesn't cover "today" (`isAbsent` requires both bounds
and `start <= today <= end`), (3) absence was set on the wrong officer (FORWARD checks only the
*target's* absence, i.e. SUPERIOR for a THIRD-officer ticket).

**Root cause (confirmed — hypothesis 1):** `provisionForwardLoopBackToSubmitterDispoItem` set the
SUPERIOR officer's absence fields (`ROUTE_TO`/`ABSENT_START`/`ABSENT_END`) *before* calling
`provisionPendingDispoItemForOfficer`, which internally re-invokes
`ensureTopLevelDispoOfficersProvisioned` — a payload that sets only
`DISPO_AMOUNT`/`OVERDRAFT_AMT`/`REPORTING_TO` and, because `DISPO.OFFICER~BASIC` INPUT is a
full-record replace, silently wiped the just-set absence fields back to null before the actual
FORWARD attempt ever ran.

**Fix:** reordered the function so the SUPERIOR absence INPUT runs *last*, after
`provisionPendingDispoItemForOfficer` completes.

**Manual UI re-verification:** filled the FORWARD form and submitted — blocked ("Failed to update
record"); SEE confirmed the ticket's `OFFICER` and `DISPO.STATUS` (PENDING) were unchanged. Matches
expected result. **Status: Passed.**

**Related — TC-EP0205-023:** this ticket's prior caveat referenced TC-020's now-invalidated
original finding and has been superseded/resolved in the sheet accordingly (see row 24).

### TC-EP0205-026 — UI localization under a non-English `SM.USER.LANGUAGE_ID`

**Prior finding (partially superseded):** recorded as "the UI does not localize its chrome/toasts
under a non-English `LANGUAGE_ID`, regardless of locale" — factually reproduced, but originally
framed without the underlying mechanism, and initially exercised via a `fr-FR` locale that doesn't
exist in this environment's `LANGUAGE` table (`en-GB`/`sk-SK`/`pl`/`vi-VN` only, confirmed by direct
DB inspection) — `sk-SK` was promoted from a temporary diagnostic substitute to the standing choice
for this case.

**Developer clarification (this session):** CBS UI localization is **data-driven** — the
`DICTIONARY` table plus each screen's multilanguage fields/labels must be populated per
`LANGUAGE_ID` for the UI to render translated text; the mechanism is not a URL segment or in-app
switcher (already established in a prior session) and, per the developer, most likely nobody has
populated non-English `DICTIONARY` entries in this environment at all.

**Reclassified finding:** the observed all-English UI is **not a platform/rendering defect** — it
is an **environment data gap** (no non-English translations seeded), consistent with a working but
untested localization mechanism. Re-verified independently under a second identity,
`INTERNAL_USER_AQA_TS` (the `.env`-configured internal test fixture, substituted for the shared
`proj-admin` account per the tester's request), with the same result.

**Incidental findings surfaced while re-verifying under `INTERNAL_USER_AQA_TS`** (not part of
TC-026 itself, but required to complete this re-verification — see "Gaps & Conflicts Found"):
`SM-USER-GROUP-USER-MANAGEMENT` (the group `INTERNAL_USER_AQA_TS` and the three `.env`
`DISPO_OFFICER_FIRST/SECOND/THIRD` fixtures all share) was missing `DISPO.OFFICER/ALL`,
`TABLE_REGISTRY/TABLE_REGISTRY_READ`, and `LANGUAGE/SEE` — each found live via a real 403 in the
browser and fixed by extending `OFFICER_GROUP_REQUIRED_PERMISSIONS` in the same helper file.

**Status: Passed**, with the actual-result text updated to state the DICTIONARY-driven mechanism
and the environment-data-gap conclusion rather than an unqualified "localization is broken."

## Gaps & Conflicts Found

- **G1 (test-automation defect, resolved):** TC-EP0205-004's precondition script wrote override
  linkage data in a shape the product's AUTH gate never reads (`SOURCE_RECORD_ID`/`OVERRIDE_ID` on
  a standalone ticket, instead of a `ST_OVERRIDES` entry on the parent's own `audit` column). Fixed
  this session — see "Implemented" in the linked chat-history entry.
- **G2 (test-automation defect, resolved):** TC-EP0205-020's precondition script set the target
  officer's absence fields before a later internal call silently wiped them via
  `DISPO.OFFICER~BASIC`'s full-record-replace-on-INPUT behavior. Fixed this session by reordering.
  This is the same class of bug previously seen on `SM.USER.GROUP.PERMISSIONS` (documented in an
  earlier session) — worth flagging as a recurring pattern risk for any future precondition helper
  that INPUTs a projection more than once in sequence.
- **G3 (environment data gap, not a defect):** this environment's `DICTIONARY` table has no
  non-English translations seeded, so `SM.USER.LANGUAGE_ID`'s localization effect cannot currently
  be observed for any screen, in any non-English locale. TC-EP0205-026 is closed against this
  understanding rather than as an open defect.
- **G4 (environment data gap, undiagnosed, not pursued):** `fr-FR` does not exist in this
  environment's `LANGUAGE` table's LIV space — an INPUT to create it returns 200 OK but the record
  never becomes visible to SEE even after polling. Superseded by using `sk-SK` (already present) as
  the standing locale for exercising the `LANGUAGE_ID` mechanism; root cause of the `fr-FR` gap
  itself was not investigated further.
- **G5 (permission-model gap on a shared fixture, resolved):** `SM-USER-GROUP-USER-MANAGEMENT` —
  shared by `INTERNAL_USER_AQA_TS` and the three `.env` dispo-officer fixtures — was missing
  `DISPO.OFFICER/ALL`, `TABLE_REGISTRY/TABLE_REGISTRY_READ`, and `LANGUAGE/SEE`. Each was found live
  (real 403s in the browser) while re-verifying TC-026 under this identity instead of `proj-admin`,
  and granted via the existing idempotent `ensureDispoItemPermissionOnOfficerGroup` "ONE-TIME ENV
  FIX" mechanism, extended with these three entries.

## Open Questions

**Q1 (to the Business Analyst / whoever owns the Google Sheet):** should TC-EP0205-026's expected
result be reworded to explicitly require DICTIONARY-seeded translation data as a stated
precondition, so a future run of this case doesn't re-report "UI doesn't localize" as a fresh
product defect against an environment that was simply never seeded with translations?

**Q2:** should someone seed at least a partial `sk-SK` translation in `DICTIONARY` for one or two
screens, so TC-EP0205-026 (or a follow-up case) can positively demonstrate the localization
mechanism actually renders translated text end-to-end, rather than only proving the negative
(no translation data → falls back to English)?

**Q3:** is there a dedicated TB Jira Epic for `EP-02.05 | Override and Dispo Processing (Exception
Management)`, or does this work sit directly under a different/umbrella Epic? Not confirmed in this
session — see the header block above.

## Reconciliation Note (existing suite, not re-authored here)

The full `TC-EP0205-001`…`053`-range case set for this epic already exists in the externally-tracked
Google Sheet named above, cross-referenced by the automated
`override-dispo-smoke.spec.ts`/`override-dispo-regression.spec.ts` suites (see
`docs/review-mr/138-tb-2083-override-and-dispo-processing-smoke/review.md` for the automation-side
review). This document does not restate or duplicate that inventory — it exists only to capture the
investigation, root cause, fix, and reclassification for the three cases (`TC-EP0205-004/020/026`)
this session's manual re-verification pass touched.

## Changelog

- **2026-09-10 — v1 created.** First local `analysis.md` for TB-2083 (no prior local test-case
  doc existed — this ticket's coverage had previously been tracked only in the external Google
  Sheet and in `docs/chat-history/`). Documents the manual-precondition root causes for
  TC-EP0205-004 and TC-EP0205-020 (both fixed in
  `api/security_management/helpers/override-dispo-ui-preconditions-helper.ts`), and TC-EP0205-026's
  reclassification from "platform localization defect" to "environment data gap" per direct
  developer feedback. See
  `docs/chat-history/2026-09-10_12-54_tb-2083-override-dispo-tc004-tc020-tc026-fixes.md` for the
  full session narrative and the complete list of code/sheet changes made.
