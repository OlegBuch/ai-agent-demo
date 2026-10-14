# Shared test helper used by an out-of-scope module — don't edit in place, add a parallel function

## The pattern/symptom

A helper function slated for TB-3587 hardcoded-user migration (e.g.
`table-registry-helper.ts`'s `setupFinTableWithFourEyes()`, `user-group-helper.ts`'s
`asUserWithGroups()`) turns out to be called not only by the module currently being migrated, but
also by a module that is explicitly **out of scope** (Audit Fields, Enquiry — reverted back to
hardcoded users at the user's own request per their module-ownership boundary, per the owner's module-ownership boundary: a module outside one's own ownership stays untouched even if already reviewed clean). Editing the shared helper in
place to use `test-user-service` would silently change behavior for the out-of-scope caller too —
exactly the kind of unrequested cross-module change the owner's scope-to-own-module rule forbids, just one level removed (via a helper, not a direct file edit).

A second, related trap: a spec file can look "fully migrated" by a shallow check (imports
`test-user-service`, zero direct `USERS_DATA` references in its own body) while still calling a
**shared helper** that itself hardcodes `USERS_DATA` internally. `customization-regression.spec.ts`
was recorded as fully migrated on exactly this basis, but its "Safe Deletion Policy" describe block
called `setupFinTableWithFourEyes()`, which still built its maker/checker identities from
`USERS_DATA.MAKER_USER`/`CHECKER_USER`. A file-level `grep USERS_DATA` + `grep test-user-service`
check on the spec alone is **not sufficient** — it misses hardcoding one call away.

## The rule

Before editing any shared helper as part of a migration:

1. Grep for every caller of the function across the **whole `api/` tree**, not just the module
   currently in scope (`grep -rn functionName api/`) — a helper living in one module's
   `helpers/` folder is not proof it's only consumed by that module.
2. If every caller is in-scope, safe to edit in place.
3. If any caller belongs to an out-of-scope module, do **not** edit the shared function — add a new
   parallel function (e.g. `setupFinTableWithFourEyesDynamic` alongside the untouched
   `setupFinTableWithFourEyes`) and migrate only the in-scope callers to it. The old function stays
   exactly as it was for the out-of-scope caller.
4. When declaring a spec file "fully migrated," also grep it for calls into any shared helper that
   hasn't itself been fully migrated yet — "imports `test-user-service` + zero direct `USERS_DATA`
   refs" is necessary but not sufficient; transitively-hardcoded helper calls slip through that
   check.

## The incident(s)

2026-09-04, TB-3587, `system_core` module: `table-registry-helper.ts`'s
`setupFinTableWithFourEyes()` was shared by `table-registry-smoke/regression.spec.ts` (in scope),
`customization-regression.spec.ts` (in scope, but incorrectly marked "done") and
`enquiry-regression.spec.ts` (out of scope, 5 call sites). `performOperationAsUserWithRetry()` in
the same file turned out to be used *only* by `audit-fields-smoke.spec.ts` (out of scope) — not by
table-registry itself at all. Similarly `user-group-helper.ts`'s `asUserWithGroups()` is used only
by `enquiry-regression.spec.ts`. Fix: added `setupFinTableWithFourEyesDynamic()` +
`teardownFinTableFourEyesUsers()` as new functions (old one untouched), migrated only the three
in-scope call sites; left `performOperationAsUserWithRetry()` and `asUserWithGroups()`/
`restorePartialAccessUserProfile()` completely untouched.

**Counter-example, same day, `customer` module — a shared helper is NOT always this trap.**
`customer-party-helper.ts`'s `configureCustomerPartyHelpers(checkerContext, dbClient)` is called
from `api/fin_accounting/tests/parametrisation-smoke.spec.ts` too (a module not yet in TB-3587's
turn order), but it's a pure *setter* — it accepts an already-built `APIRequestContext` and stores
it in a module-scoped variable; it does not itself construct the checker's credentials. Each
calling spec file (`customer-party-data-regression/smoke.spec.ts`, and fin_accounting's own file)
independently builds its own checker context in its own `beforeAll` before calling the setter. So
migrating each in-scope spec file's own context-construction code to `createTestUserSession` is
zero-risk to fin_accounting, which never sees the change. **The distinguishing question**: does
the shared function build/hardcode the credential itself (risky, needs the parallel-function
treatment above), or does it just accept a pre-built context/client as a parameter (safe to leave
alone, migrate each caller's own construction code independently)?
