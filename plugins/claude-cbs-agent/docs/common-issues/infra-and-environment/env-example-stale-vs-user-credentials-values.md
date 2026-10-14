# .env.example is stale relative to user-credentials.values.ts — grep the real source, don't trust the example file

> **Superseded 2026-09/10 — historical reference only.** `api/utils/constants/user-credentials.values.ts`
> no longer exists (the hardcoded-user migration, TB-3468/TB-3587, removed it), and the Vault staging
> bootstrap `bankstg-bootstrap-env.sh` mentioned below was deleted 2026-10-01 (TB-4197; the VM's
> `.env` is now a direct copy of `.env.<env>-local`). The general lesson, grep the real source of an
> env var rather than trusting `.env.example`, still holds.

**The pattern/symptom.** `api/utils/constants/user-credentials.values.ts`'s `USERS_DATA` object reads
several env vars — `SUCCESSFUL_USER_ID`, `RESTRICTED_USER_ID`, `MAKER_USER_ID`, `CHECKER_USER_ID`,
`TR_MAKER_USER_ID`, `TR_CHECKER_USER_ID`, `PAYMENT_ORDER_MAKER_USER_ID`/`_USERNAME`/`_PASSWORD`,
`PAYMENT_ORDER_CHECKER_USER_ID`/`_USERNAME`/`_PASSWORD` — that do not appear in `.env.example` at all.
Scanning `.env.example` to enumerate "which hardcoded test users exist in this framework" undercounts
the real footprint; a survey built only from it will miss every one of these.

**The rule.** Treat `api/utils/constants/user-credentials.values.ts` (the `USERS_DATA` object) as the
actual source of truth for which static test-user env vars exist and what they're used for —
`.env.example` is documentation that has drifted, not a contract. Before scoping any task that
touches "all hardcoded test users" (an audit, a framework-wide migration), grep for `USERS_DATA\.` and
for `process\.env\.` inside `user-credentials.values.ts` itself, not just `.env.example`'s own
`*_USER*`/`*_CHECKER*` entries.

**The incident.** TB-3587 (2026-09-03), scoping the hardcoded-test-user → `test-user-service`
migration. An initial Haiku-delegated survey grepped for the `.env.example` var list only and reported
just 4 affected spec files framework-wide. A follow-up grep against `user-credentials.values.ts` and
its downstream consumers turned up ~30 files across nearly every module (account, customer,
document_management, fin_accounting, integration_chapter, interest_and_charges, product_factory,
security_management, teller, transfer, plus `system_core`'s non-Currency/Customization/Idempotency
files) — the real scope was an order of magnitude larger than the `.env.example`-only survey found.

**Second layer of the same undercount: a module-local static checker doesn't have to go through
`USERS_DATA` at all.** `customer-party-data-regression/smoke.spec.ts` built their shared checker
from `process.env.CUSTOMER_PARTY_CHECKER_USERNAME`/`PASSWORD` directly (no `USERS_DATA` entry for
it), and `interest_and_charges/charges_calculation_engine/cce-fixtures.ts`'s `cceCheckerClient`
fixture did the identical thing via `process.env.CCE_AUTHORIZER_USERNAME`/`PASSWORD` — both are the
same shared-static-checker anti-pattern TB-3587 exists to remove, just invisible to a `grep
USERS_DATA` scan since they bypass that constant entirely with their own one-off env var pair. When
scoping a not-yet-migrated module, also grep for `createAuthenticatedApiContext(` calls that pass an
explicit `username`/`password` sourced from `process.env.<ANYTHING>` — not only for `USERS_DATA.`
(both found and fixed, 2026-09-04/07).

**Third layer, found 2026-09-08 after TB-3587 was already declared complete: fixing one engine's
checker doesn't mean its sibling engine is fixed too — even when they share a naming convention.**
`interest_and_charges/charges_calculation_engine/cce-fixtures.ts`'s checker (`CCE_AUTHORIZER_*`) was
migrated as noted above, but its sibling `interest_and_charges/interest_calculation_engine/ice-fixtures.ts`'s
`iceCheckerClient` fixture independently hardcoded `process.env.AUTHORIZER_USERNAME`/`PASSWORD` (no
`CCE_`/`ICE_` prefix at all — a *different*, un-prefixed env var pair, easy to miss if you only grep
for the already-known `CCE_AUTHORIZER_*`/`DISPO_OFFICER_*`-style names) — bypassing `test-user-service`
entirely, same as the second-layer cases above. Found by a repo-wide 6-way parallel Haiku module sweep
that re-checked every module post-"completion", not by a targeted grep for a known name. Migrated to
`createTestUserSession({label: TEST_USER_LABELS.CHECKER, permissions: [...]})` mirroring
`cce-fixtures.ts`'s own pattern. **Lesson: "TB-3587 complete" and "module X was in the migration batch"
do not guarantee every nested sub-folder/sibling-engine fixture inside that module was actually swept
— re-verify per-fixture-file, not per-module-directory, especially for modules with multiple
sibling "engine" subfolders (charges_calculation_engine / interest_calculation_engine).** Also found
the same day: `CUSTOMER_PARTY_CHECKER_USERNAME`/`_PASSWORD` had zero remaining code references but
was still declared in `.env.example` — a dead doc entry left over from the 2026-09-04 code fix,
removed from `.env.example` on this pass.

**Fourth layer, found 2026-09-09, one day after TB-3587's own "zero open items, repo-wide" close:
a completely different constants FILE, not just a different var-name pattern inside the known one.**
Every prior sweep (all layers above) greped for `USERS_DATA` or a known-shape env-var pair. None of
them would ever match `api/utils/constants/user-profile.values.ts`'s `USER_PROFILE_VALUES.USERS:
{INTERNAL, EXTERNAL, SYSTEM, NOT_IN_KEYCLOAK, NOT_EXIST_IN_CBS, SYSTEM_NOT_EXIST_IN_CBS}` — a
sibling constants file, unrelated by name to `USERS_DATA`/`user-credentials.values.ts` (which really
is now fully deleted, confirmed), reading `INTERNAL_USER_ID`/`EXTERNAL_USER_ID`/`SYSTEM_USER_ID`/
`AQA_TS_USER_NOT_EXIST_IN_CBS_ID`/`AQA_TS_SYSTEM_USER_NOT_EXIST_IN_CBS_ID` into its own static-user
object, consumed by `sms-system-core.spec.ts`, `user-profile-api-smoke.spec.ts`, and
`security_management/helpers/override-dispo-helper.ts`'s officer-resolution helpers (9 call sites).
Found only because the user asked for the sweep to run in the *opposite* direction — every
`process.env` **usage site** first, classified after, rather than starting from a known
variable-name list (`.env.example`, `USERS_DATA`) and checking whether each is still referenced.
**Generalized rule now confirmed across four independent misses: a name-first sweep (grep a known
constant/pattern name) structurally cannot find a hardcoded-user pattern living under an
as-yet-unknown name — only a usage-first sweep (grep `process\.env` everywhere, then classify each
hit) can claim completeness.** Two of the five fields were migrated same day (a bare Keycloak
identity, same shape as `ui/auth/fixtures/auth-ui-test.ts`'s `temporaryKeycloakUser` fixture); the
other three were initially left as a flagged architecture decision (bootstrap 3 shared users
vs. refactor ~15 call sites) but the user then gave an explicit zero-tolerance directive — migrate
everything, no exceptions, delete every var — resolving that ambiguity.

**Resolved, same day.** All 5 fields migrated: per-suite `beforeAll` bootstrap of a bare Keycloak
identity (`test-user-service.ts`'s new `createBareKeycloakUser`, no pre-baked SM.USER profile — each
consuming test builds that profile itself as the thing under test), not a global-setup process-wide
bootstrap, since the 3 consuming files/helper all mutate the profile themselves. Independently
diff-reviewed (not just the fixing agent's own self-report) against the specific risk this pattern
raises for negative/validation test cases: confirmed `override-dispo-smoke.spec.ts`'s TC-35/36/38-43
DISPO-officer-rejection semantics are untouched, since the id actually asserted "should be rejected"
in those tests is a separately `generateCustomId`-generated ghost id, never the officer id itself —
swapping the officer id's source from a static env var to a dynamic one doesn't change what the test
proves. **`USER_PROFILE_VALUES.USERS` is now, like `USERS_DATA`, fully dead — both hardcoded-user
patterns in this codebase are code-complete.** Only `DISPO_OFFICER_SECOND/THIRD`'s reappearance in
local `.env` remains, sourced from `bankstg-bootstrap-env.sh` (a staging-only Vault
provisioning script, not test code) — out of this pattern's scope, needs its own go-ahead.

**Fifth layer, same day: dispatching several migration agents sequentially, each solving a similar
need independently, can duplicate a helper neither one knew the other had already written.** An
earlier agent this same day (fixing `AQA_TS_USER_NOT_EXIST_IN_CBS_ID`/`AQA_TS_SYSTEM_USER_NOT_EXIST_IN_CBS_ID`
in `user-profile-api-regression.spec.ts`) wrote a private, file-local `provisionBareKeycloakUser`
helper for its own narrow need. The later agent (fixing `INTERNAL_USER_ID`/`EXTERNAL_USER_ID`/
`SYSTEM_USER_ID`, needing the identical "real Keycloak identity, no CBS profile" primitive for 3
*other* files) added its own byte-for-byte-identical `createBareKeycloakUser` to `test-user-service.ts`
instead of noticing the sibling file's private copy from earlier the same session and promoting it.
Caught by the user directly reading the diff and asking "why does this exist, why not use
test-user-service" — not by either agent's own self-report, nor by this session's own independent
diff verification (which checked semantic correctness, not cross-file duplication). Fixed same day:
`user-profile-api-regression.spec.ts`'s private copy deleted, both its call sites switched to import
`createBareKeycloakUser` from `test-user-service.ts`. **When dispatching more than one same-day
agent whose tasks could plausibly need the same small primitive, tell each one to grep for a
same-named/same-shaped helper possibly added earlier the same session before writing its own** —
"no existing shared helper for this" is a claim each fixing agent should verify, not assume, and this
session's own post-hoc diff review should check for cross-file duplication too, not only per-file
correctness.
