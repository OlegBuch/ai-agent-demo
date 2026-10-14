# `DISPO_OFFICER_SECOND/THIRD` are Vault-provisioned infra fixtures, not scoped test hardcoding

> **Superseded 2026-10-01 (TB-4197) — historical reference only.** `bankstg-provision.sh` and
> `bankstg-bootstrap-env.sh` (the whole Vault bootstrap, `scripts/bankstg-scripts/`,
> `scripts/bankuat-scripts/`) were deleted. Manual VM runs now use `.env.<env>-local` copied verbatim
> to the VM's `.env` (see `docs/frame-specs/infrastructure.md`), and `DISPO_OFFICER_*` is no longer
> read from `.env` anywhere in `api/`: the officers are provisioned dynamically per run. The text
> below describes the pre-removal pipeline and is kept for the decision trail.

## The pattern/symptom

TB-3587's hardcoded-user migration left `security_management/helpers/override-dispo-helper.ts`'s
`DISPO_OFFICER_FIRST/SECOND/THIRD` (`process.env[\`DISPO_OFFICER_${role}_ID/_USERNAME/_PASSWORD\`]`)
as its one remaining open item. A first pass assumed this was solvable the same way as
`PARTIALLY_ACCESS_USER` — just grant a disposable test-user-service user
`{TABLE:'DISPO.ITEM', FUNCTION:'ALL'}` — but that assumption doesn't survive actually reading the
consuming spec file or the staging environment's bootstrap scripts.

## The rule

Before assuming a `.env`-configured identity can be swapped for a disposable per-test user, check
two things, not just "what permission does it need":

1. **How many call sites reuse the same identity, and do they mutate it in place across tests?**
   `override-dispo-smoke.spec.ts` declares `DISPO_OFFICER_SUPERIOR`/`DISPO_OFFICER_UNDER_TEST` as
   module-level consts reused across **47 call sites / ~20 test cases**, mutated in place per test
   (`configureDispoOfficerUnderTest`) and restored afterward
   (`restoreDispoOfficerUnderTestBaseline`) — these are `DISPO.ITEM` PRECEDENCE/escalation/routing
   tests that need a *stable 3-level hierarchy* across test cases, not 4 independently-provable
   cases like `PARTIALLY_ACCESS_USER`'s TC-15/16/100/131. The helper's own WHY comment already says
   this explicitly: "`DISPO_OFFICER_FIRST/SECOND/THIRD` are real, `.env`-configured officers ...
   reused for the whole suite ... mutate them in place by design, not isolated per test."
2. **Is there a deployment/provisioning script outside the test repo's own `api/` tree that
   depends on the exact same identity?** `bankstg-provision.sh` creates and rotates the
   Keycloak accounts `dispo_officer_second`/`dispo_officer_third` specifically for this purpose,
   storing their credentials in Vault (`secret/data/proj/bankstg/aqa-test-users`).
   `bankstg-bootstrap-env.sh` resolves their current Keycloak user ids at every staging
   bootstrap and writes `DISPO_OFFICER_SECOND/THIRD_ID/_USERNAME/_PASSWORD` into `.env`. This is a
   real, deliberately-built infrastructure pipeline, not an ad hoc hardcode — migrating away from it
   is an infra-spanning decision (test file + deployment scripts), not a scoped code fix.

Interesting side-fact confirmed by the same bootstrap script: **`DISPO_OFFICER_FIRST` is never
actually authenticated as** — only its id is read (it needs to exist as a `DISPO.OFFICER` record's
`id`, not to log in) — so in this environment it simply reuses `internal_user`'s Keycloak id
(`# FIRST is never authenticated as - only its id is read - so it reuses internal_user.`). FIRST
alone was never really the hard part of this migration question; SECOND/THIRD (with their own
dedicated Vault pipeline) are.

## The incident

2026-09-07 (TB-3587): after resolving `PARTIALLY_ACCESS_USER`'s equivalent open question (see
`../keycloak-and-auth/partially-access-user-standing-permission-resolved.md`), assumed the same fix shape would apply
to `DISPO_OFFICER_SECOND/THIRD` and told the user so — corrected within the same session after
actually reading `override-dispo-smoke.spec.ts` and the two `bankstg-*.sh` scripts. No code was
changed. Reported back to the user, precisely: does the team want to invest in redesigning both the
Vault pipeline and the 20-test shared-fixture file for disposable per-test officers, or is this an
accepted, working, intentional exception (same category as the global `KEYCLOAK_USERNAME`
credential)? Left open pending that answer.

## Resolution (2026-09-08) — migrated for LOCAL runs; staging's Vault pipeline is a separate,
untouched concern

The user clarified the two environments are distinct: the Vault-backed `bankstg-provision.sh`/
`bankstg-bootstrap-env.sh` pipeline is a **staging-only** concern and plays no role in a local run —
locally, `DISPO_OFFICER_SECOND/THIRD_ID/_USERNAME/_PASSWORD` were just plain `.env` values, not
Vault-fed. That removes the "infra pipeline" blocker for the local-run migration this doc's original
"the rule" section (§2) worried about — §1 (the shared/mutate-in-place 3-level hierarchy across the
whole file) still applies and had to be designed around, not bypassed.

**What shipped**: `override-dispo-helper.ts` gained `provisionDynamicDispoOfficersForSuite`
(replacing `resolveDispoOfficerIdentity`, now deleted) — confirmed via the Bruno collection first
(`SM.USER.GROUP~MAIN`'s `PERMISSIONS` entries are plain `{TABLE, FUNCTION}`, `FUNCTION` supports
`'ALL'`, `DISPO.ITEM` is a real registered `FIN` table, and `DISPO.OFFICER~BASIC`'s record id must
be an existing `SM.USER` with `classification=INTERNAL` — exactly what `createTestUser` already
provisions for every other migrated identity in this framework):

- **MAJOR** (FIRST) never authenticates as itself — confirmed again this session (zero call sites
  pass it to `createDispoOfficerReviewContext`) — so it's provisioned as a fresh id
  (`generateCustomId`) plus a backing `INTERNAL SM.USER` profile via the existing
  `ensureInternalSmUserForDispoOfficer`. No Keycloak login, no permission needed.
- **SUPERIOR** (SECOND) *and* **UNDER_TEST** (THIRD) both call `createDispoOfficerReviewContext`
  (SUPERIOR at 2 call sites, UNDER_TEST at 1 — this was the one correction to earlier assumptions:
  UNDER_TEST does authenticate as itself in one test, not only via admin context) — both are
  created via `createTestUser(apiRequest, {permissions:[{TABLE:'DISPO.ITEM',FUNCTION:'ALL'}]})`.
  This ad-hoc per-user group **replaces** the one-time manual `SM-USER-GROUP-USER-MANAGEMENT` grant
  entirely — there is no manual environment setup step left for local runs.
- THIRD's baseline `DISPO.OFFICER~BASIC` record (previously assumed pre-seeded, never created by
  `ensureTopLevelDispoOfficersProvisioned`) turned out not to need a new provisioning function at
  all — the existing `restoreDispoOfficerUnderTestBaseline(client, officerId, superiorId, majorId)`
  is itself an idempotent `INPUT` (confirmed via Bruno: `SM.USER.GROUP~MAIN`'s `INPUT` operation
  handles both create and update with the same payload shape — the same holds for
  `DISPO.OFFICER~BASIC`), so calling it once at suite setup for a fresh `underTest.id` both creates
  and baselines the record in one call.
- The whole-file shared/mutate-in-place architecture (§1 above) was preserved as-is: the officers
  are still created **once per suite run** (in the file's existing `test.beforeAll`, which the
  `API-tests` Playwright project already runs with `fullyParallel:false` — confirmed before adding
  this, since a naive top-level `beforeAll` under `fullyParallel:true` would have recreated a fresh
  officer per test, since the top-level `fullyParallel:true` reruns `beforeAll` per test) and
  deleted in the existing `afterAll` — only the *provisioning source* changed (dynamic vs. `.env`),
  not the test file's per-test mutate/restore flow.

**Bonus: this incidentally fixes a real, independently-reported stage-only test failure.**
A second engineer traced 8 failing `US-02.05.05 | Disposition Officer Configuration` tests
(TC-35/36/38-43) on the `bankstg` stage environment to `resolveInternalOfficerUserId()`
(`process.env.INTERNAL_USER_ID`) coincidentally equaling `DISPO_OFFICER_FIRST_ID` there — confirmed
by `bankstg-bootstrap-env.sh`'s own comment, `# FIRST is never authenticated as - only its id is read
- so it reuses internal_user`. Since MAJOR's `DISPO.OFFICER~BASIC` record gets provisioned LIVE
earlier in the file (`TC-03`/`TC-18`), by the time TC-35+ run their `assertDispoOfficerInputRejected`
SEE-expects-404 check, the record already exists under that same id (200, not 404) — a false
negative from an environment-bootstrap coincidence, not a product bug. Since this session's refactor
makes MAJOR's id **always freshly generated** (`generateCustomId`), it can structurally never again
collide with `INTERNAL_USER_ID` on any environment.

**One real design gap found and fixed on the first live run (QA env):** the initial version of
`provisionDynamicDispoOfficersForSuite` gave MAJOR a bare `generateCustomId()` string (no Keycloak
identity at all, reasoning "it never logs in so it doesn't need one") and called
`ensureInternalSmUserForDispoOfficer` directly on that string. This 400s: `SM.USER~INTERNAL`'s
`INPUT` hook validates the record id against a **real Keycloak identity**
(`"Keycloak identity not found: aqa_dispo_officer_major_..."`), even though nothing ever
authenticates as that id. Fixed by giving MAJOR a real disposable identity via
`createTestUser(apiRequest, {label:'dispo-major'})` too (no `DISPO.ITEM` permission needed, just a
real Keycloak-backed `SM.USER`) — `createTestUser` already provisions the backing
`SM.USER~INTERNAL` profile itself, so the separate `ensureInternalSmUserForDispoOfficer` call became
unneeded for MAJOR entirely. **Lesson: "this identity never authenticates" does not mean "this
identity doesn't need to be a real Keycloak user" — CBS's `SM.USER~INTERNAL` hook validates against
Keycloak on INPUT regardless of whether the record is ever used to log in.**

**LIVE-VERIFIED 2026-09-08, QA environment, full file run (not `--grep` — TC-03/TC-18 must run
before TC-35+ so MAJOR's record actually exists LIVE by then): all 38 tests in
`override-dispo-smoke.spec.ts` passed**, including TC-35/36/38-43 (the id-collision-sensitive
negative cases — passed cleanly with no collision, as expected) and TC-52/TC-53 (SUPERIOR/UNDER_TEST
actually authenticating via `createDispoOfficerReviewContext` and reviewing/approving `DISPO.ITEM`
tickets with the `createTestUser`-granted `DISPO.ITEM:ALL` permission). All three dynamic officers
(`dispo-major`/`dispo-superior`/`dispo-under-test`) were created and cleanly deleted in the file's
own `afterAll`. Not yet re-verified on the `bankstg` stage environment itself (only QA was run this
session) — the fix is environment-agnostic by construction, but the stage engineer who reported the
original TC-35+ failures should confirm on their next stage run.

Full transcript of that diagnosis is in this session's `docs/chat-history/` entry (once written).
