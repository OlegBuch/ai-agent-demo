# TB-2083 Override/Dispo UI — TC-004, TC-020, TC-026 precondition fixes and manual re-verification

**Date/time:** 2026-09-10 12:54 · **Branch:** N/A · **Ticket(s):** TB-2083

## Discussed

Continued manual UI verification of the "EP-02.05 | Override_Dispo_UI" Google Sheet test cases
(fileId `1iH9tBTSh2zJnp8LwNlPdLAk1CiZLAgyv`, tab "Test Cases"). Discovered mid-session that the
sheet's correct/live tab is `gid=219176037`, not `gid=1363873659` (a stale/duplicate copy that had
been read from for most of the session) — all edits from that point on targeted `219176037`.

Developer feedback drove two re-investigations:

- **TC-020** (FORWARD should be blocked on an absence-redirect loop-back): dev said the behavior
  should work and offered three hypotheses (precondition wipes the target's absence; the absence
  window doesn't cover "today"; absence was set on the wrong officer). Root-caused to the second
  hypothesis's sibling: a field-wipe, not a window/target issue.
- **TC-004** (AUTH should be blocked while a linked DISPO.ITEM is PENDING): dev explained the
  precondition was structured wrong — the core's AUTH gate reads `dispoItemId`s from the parent
  record's own `audit.ST_OVERRIDES` array (per the TI-02.05 Confluence doc's "Decoupled
  authorization"), not from a standalone cross-referencing DISPO.ITEM row.

Also finalized TC-026 (UI localization under a non-English `LANGUAGE_ID`): the user directly
inspected the DB and confirmed the `LANGUAGE` table only has `en-GB`/`sk-SK`/`pl`/`vi-VN` in this
environment, so `sk-SK` was promoted from a temporary diagnostic swap (originally standing in for
`fr-FR`, which doesn't exist here) to the permanent/standing choice for this check.

Separately, the user wanted to stop reusing the shared `proj-admin` Keycloak account for manual
checks ("proj-admin этим юзером пользуются все") and use the `.env`-configured
`INTERNAL_USER_AQA_TS` instead. This surfaced a chain of missing permissions on the shared
`SM-USER-GROUP-USER-MANAGEMENT` group (which `INTERNAL_USER_AQA_TS` and the three
`DISPO_OFFICER_FIRST/SECOND/THIRD` `.env` fixtures all belong to), each found live via browser
DevTools while re-walking the TC-026 UI check under this new identity. After the manual UI
re-check, the developer clarified (relayed by the user) that CBS UI localization is data-driven —
the `DICTIONARY` table + multilanguage fields/labels must be populated per `LANGUAGE_ID`, and this
QA environment simply has no non-English translations seeded — reclassifying TC-026's finding from
"platform defect" to "environment data gap, not a bug."

## Implemented

- `api/utils/constants/db-query-keeper.ts` — added `RECORD_SPACE.SET_AUDIT_FIELD_BY_ID`, a query
  that writes directly into a record's `audit` column (distinct from `SET_DATA_FIELD_BY_ID`, which
  writes `data`), needed for TC-004's fix.
- `api/utils/services/test-user-service.ts` — exported `NEW_USER_LOGIN_PROPAGATION_DELAY_MS` (was
  a local const) so it could be reused by the precondition helper.
- `api/security_management/helpers/override-dispo-ui-preconditions-helper.ts`:
  - **TC-020 fix** (`provisionForwardLoopBackToSubmitterDispoItem`): reordered so the SUPERIOR
    absence-redirect INPUT (`ROUTE_TO`/`ABSENT_START`/`ABSENT_END`) now runs *last*, after
    `provisionPendingDispoItemForOfficer` — which internally re-calls
    `ensureTopLevelDispoOfficersProvisioned` (a payload that omits those three fields) and was
    silently wiping them via `SM.USER.GROUP`-style full-record-replace-on-INPUT. Confirmed fixed by
    manual UI retest: FORWARD correctly blocked, ticket state unchanged.
  - **TC-004 fix** (`provisionRecordAwaitingAuthWithPendingDispoItem`): real
    `{recordId}-{overrideId}-{attempt}`-shaped `ticketId` (truncated to the last 17 chars of each id
    component to fit the 64-char column limit), plus a direct DB write of a `ST_OVERRIDES` entry
    onto the parent NAU record's `audit` column (via the new `SET_AUDIT_FIELD_BY_ID` query),
    resolving the physical schema by probing `COMPANY_SCHEMA_SUFFIXES_CORE` with `EXISTS` before the
    write (dynamic tables aren't always at the bare table-id schema). Confirmed fixed by manual UI
    retest: AUTH correctly blocked with 403 "Failed to authorise record."
  - **TC-026 finalization**: renamed `provisionFrenchLocaleInternalUser` →
    `provisionNonEnglishLocaleInternalUser`; updated its doc comment and log prefixes to state
    `sk-SK` is the standing choice (not a diagnostic swap), since `fr-FR` isn't seeded in this
    environment's `LANGUAGE` table.
  - Extended `OFFICER_GROUP_REQUIRED_PERMISSIONS` (consumed by the existing idempotent
    `ensureDispoItemPermissionOnOfficerGroup` "ONE-TIME ENV FIX") from
    `[{DISPO.ITEM, ALL}, {TABLE_REGISTRY, TABLE_REGISTRY_WRITE}]` to also include
    `{DISPO.OFFICER, ALL}`, `{TABLE_REGISTRY, TABLE_REGISTRY_READ}`, and `{LANGUAGE, SEE}` — each
    added after hitting a real 403/permission-denial live in the browser while re-verifying
    TC-EP0205-026 under `INTERNAL_USER_AQA_TS`. Applied to the live `SM-USER-GROUP-USER-MANAGEMENT`
    group by rerunning the existing ENV FIX test twice this session.
  - Added `setLanguageIdOnExistingInternalUser(userProfileClient, userId, languageId)` — SEEs an
    existing `SM.USER~INTERNAL` record first and reuses `pickInputableProfileFields` to carry over
    every other inputable field unchanged, then INPUTs with only `LANGUAGE_ID` overridden. Needed
    because the web UI's own INPUT form for this projection does not render/preserve
    `PERMISSIONS`/`USER_ACCESS` at all — submitting through the UI on a record that already has
    non-empty values there was rejected with "PERMISSIONS - must have at least 1 items but found 0,
    USER_ACCESS - must have at least 1 items but found 0."
- `api/security_management/tests/override-dispo-ui-preconditions.spec.ts`:
  - Import rename to match the helper rename above; updated the TC-EP0205-026 test's inline
    comments/report strings to state the sk-SK/localization conclusion as final, not open.
  - Added a `ONE-TIME MANUAL FIX` test using `setLanguageIdOnExistingInternalUser` to set
    `INTERNAL_USER_AQA_TS`'s `LANGUAGE_ID` for the manual re-check, then edited it in place to
    revert to `en-GB` afterward (this is a shared `.env` fixture reused elsewhere in the suite, not
    a disposable per-test user).
- `.env` — updated `INTERNAL_USER_PASSWORD` to the real value the user set via Keycloak's
  "Update password" flow (the account had a temporary/forced-reset credential on first interactive
  login; the original `.env` value, which equaled the user's own id, no longer authenticates).
- Google Sheet "EP-02.05 | Override_Dispo_UI" (`gid=219176037`): TC-004 (row 5), TC-020 (row 21),
  TC-023 (row 24, caveat referencing TC-020 superseded), and TC-026 (row 27, two rounds — the
  sk-SK-standing-choice update, then a final round appending the developer's DICTIONARY
  clarification and reclassifying the finding as Passed/environment-data-gap rather than a defect)
  all updated and verified via read-only CSV re-fetch.

## Learned

- The `SM.USER.GROUP.PERMISSIONS` / `SM.USER~INTERNAL` full-replace-on-INPUT behavior is a
  recurring footgun across multiple projections in this system: any INPUT replaces the *entire*
  record, so omitted fields silently revert to defaults/null. This caused the TC-020 bug, and a
  variant of it (the UI form not rendering `PERMISSIONS`/`USER_ACCESS`) blocked a UI-based
  `LANGUAGE_ID` change on `SM.USER~INTERNAL` — resolved by going through the API with the prior SEE
  data preserved instead of the UI form.
- `TABLE_REGISTRY_READ`/`TABLE_REGISTRY_WRITE` are separate metadata-read/lock-acquisition
  permissions, distinct from a table's own `SEE`/`INPUT`/`ALL` functions — confirmed for both
  `DISPO.OFFICER` (this session) and the reserved `TABLE_REGISTRY` pseudo-table (documented
  earlier this engagement).
- The CBS UI's language-picker dropdown widget (e.g. on `SM.USER~INTERNAL`'s INPUT form) makes its
  own `POST /tables/api/v1/tables/LANGUAGE/enquiries/LANGUAGE/execute` call requiring `LANGUAGE/SEE`
  — a group can have full `DISPO.OFFICER` access yet still be unable to populate this one dropdown
  without that separate grant.
- CBS UI localization is confirmed (developer-stated) to be driven by the `DICTIONARY` table plus
  multilanguage fields/labels keyed on `SM.USER.LANGUAGE_ID` — it is not a URL segment or in-app
  switcher, and this environment has no non-English translations seeded there, so any non-English
  `LANGUAGE_ID` will predictably render as English chrome/toasts. This is an environment data gap,
  not a platform defect — TC-026 is closed as Passed with this clarification, not as a bug.
- `.env`-backed test-fixture Keycloak users (e.g. `INTERNAL_USER_AQA_TS`) can carry a
  temporary/forced-password-reset flag that only surfaces on first *interactive* browser login
  (API/password-grant logins bypass it) — when this fires, `.env`'s password value must be updated
  to match whatever new password is set, or every other consumer of that fixture breaks.
- The Google Sheet's `gid=1363873659` (used for most of a prior session) is a stale/duplicate copy;
  `gid=219176037` is the live "Test Cases" tab the tester's own browser is pointed at. All future
  sessions should target `219176037` directly and skip the earlier gid entirely.

## Open Items / Follow-ups

- No `docs/test-cases/TB-2083/analysis.md` exists locally in this repo (this ticket appears to have
  gone through Allure TestOps rather than the local-only opt-in path) — flag to the user if a local
  analysis doc should also be created for TB-2083 to mirror the other ticket folders under
  `docs/test-cases/`.
- `fr-FR` still does not exist in this environment's `LANGUAGE` table's LIV space — an INPUT to
  create it returns 200 OK but the record never becomes visible to SEE even after polling. This
  remains undiagnosed but is no longer being pursued, since `sk-SK` is now the standing substitute
  for exercising the `LANGUAGE_ID` mechanism.
- If the CBS UI's localization needs to be visually demonstrated or verified end-to-end, someone
  needs to seed at least a partial `DICTIONARY` translation for a non-English `LANGUAGE_ID` (e.g.
  `sk-SK`) in this environment first — currently untestable for real because no translated content
  exists to render.

## References

- Google Sheet "EP-02.05 | Override_Dispo_UI.xlsx" — fileId `1iH9tBTSh2zJnp8LwNlPdLAk1CiZLAgyv`,
  tab "Test Cases", `gid=219176037`.
- TI-02.05 | Override and Dispo Processing (Exception Management) — Confluence, "Decoupled
  authorization" section (`audit.ST_OVERRIDES` shape and AUTH-time DISPO.ITEM gating).
- US-02.05 | Override and Dispo Processing (Exception Management) — Confluence (parent
  requirements page).
- Jira TB-2083.
