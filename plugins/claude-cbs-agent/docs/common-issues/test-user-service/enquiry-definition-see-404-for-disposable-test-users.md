# Executing a UI-wizard-created Enquiry 404s ("Enquiry definition not found") for `createTestUser`-provisioned users, but works fine for a real admin account

**TL;DR:** `POST .../tables/{tableId}/definitions/enquiry/operation/SEE` (and the `execute`
endpoint behind it) 404s with `"Enquiry definition not found for id: ..."` for any
`createTestUser`-provisioned disposable user trying to open an Enquiry that was just created
through the Enquiry creation wizard — **even with `{TABLE: tableId, FUNCTION: 'ALL'}`**, and even
for the same user who created it. A real admin account, doing the exact same UI steps by hand,
hits no error at all (the Execute grid renders normally — empty only because the table has no data
records, which is expected). This is very likely the same class of gap as
[`dashboard-user-never-sets-workspace-menu-root-id.md`](dashboard-user-never-sets-workspace-menu-root-id.md)
— a `SEE` check that resolves against a specific "root" record the disposable user's profile never
gets wired up to — **not a table-permission grant problem**, so don't try to fix it by adding more
`FUNCTION`s to the user's `permissions` array; that was tried (`SEE`, then `ALL`, then adding
`TABLE_REGISTRY_READ`/`LANGUAGE:SEE`) and made zero difference to the error.

## The symptom

In `ui/enquiry/tests/enquiry-regression.spec.ts`'s TC-3123 ("Expression Builder rule is visually
applied to the matching records"):

1. `enquiryCreatorUser` (a `createTestUser`-provisioned disposable user, `{TABLE: tableId,
   FUNCTION: 'ALL'}` + registry/language grants) logs in via the UI, completes the full Create
   Enquiry wizard (Basic → Virtual Fields → Designer with a field + Expression Builder rule →
   Selection Rules → Drill-down → Create), and sees the "Enquiry created successfully." toast.
2. Immediately navigating to that same Enquiry's Execute URL — **same session, same user, no
   logout in between** — shows "Unable to execute this enquiry."
3. Network trace shows the actual failing calls:
   - `POST /tables/api/v1/tables/{tableId}/definitions/enquiry/operation/SEE` with body
     `{"id": "{enquiryId}"}` (and separately with `{"id": "{tableId}~{enquiryId}"}`) → `404`,
     body `{"detail": "Enquiry definition not found for id: ...", "status": 404, "title": "Not
     Found"}`.
   - `POST /tables/api/v1/tables/{tableId}/enquiries/{enquiryId}/execute?page=0&size=10` → `404`.
4. Retrying with backoff (`expect(...).toPass({ timeout: 60_000, intervals: [3_000, 5_000,
   10_000] })`) never resolves it — ruling out ordinary backend/indexing propagation lag.
5. **Manually reproducing the identical wizard flow in a real browser, logged in as a genuine
   admin account, on the same bankstg environment: no error at all.** The Execute page renders the
   grid with the correct columns (including the configured field) immediately after creation;
   it's empty only because the freshly-created table has no data records yet (expected, not a
   bug).

## The rule

**A `POST .../definitions/enquiry/operation/SEE` 404 ("Enquiry definition not found") for a
`createTestUser`-provisioned user is very unlikely to mean the Enquiry Definition doesn't exist,
and near-certainly not fixable by changing that user's `permissions` array.** Confirm first
whether a real (non-disposable) account can execute the same Enquiry without error — if it can,
the 404 is a test-user-provisioning gap in this same family as `WORKSPACE_MENU_ROOT_ID` (some
root/pointer field on the user's profile that `createTestUser` never populates, which a real
admin account has by virtue of not being a bare-bones disposable profile), not a CBS backend bug
and not a missing grant.

## Open question — not yet resolved

Which specific root/pointer field is missing on the `createTestUser` profile (mirroring
`WORKSPACE_MENU_ROOT_ID` for `WORKSPACE.MENU~NAVIGATION`) that the Enquiry Definition `SEE` check
resolves against has **not** been identified yet — this entry documents the symptom and rules out
the permission-grant and propagation-lag explanations, not the fix. Don't spend further time
widening `enquiryCreatorUser`/`enquiryViewerUser`'s `permissions` array in
`ui/enquiry/fixtures/enquiry-expression-builder-setup.ts` chasing this; the next step is either a
dev-side answer on what provisions that root for a real user, or finding the equivalent of
`inputWorkspaceMenuRecord({ isRoot: true, ... })` (`api/system_core/helpers/
workspace-menu-helper.ts`) for Enquiry Definitions. Until then, TC-3123 is blocked by this gap
(marked accordingly in the spec, 2026-09-23).

## Incident

2026-09-23, while trying to fix TC-3123's regression failure (which started as a suspected
double-`clickNextStep()` race condition — that race **was** real and fixed separately, see
`playwright-execution/` — but fixing it only uncovered this unrelated, deeper blocker underneath).
Two full permission-escalation attempts on `enquiryViewerUser` (`SEE` → `TABLE ALL` +
`TABLE_REGISTRY_READ` + `LANGUAGE:SEE`) produced byte-identical 404 responses; a 60s backoff retry
produced the same result; a from-scratch manual repro by the user with a real admin account in
Chrome hit no error at all, isolating the cause to the test user's provisioning rather than the
enquiry, the permissions, or the CBS backend itself.
