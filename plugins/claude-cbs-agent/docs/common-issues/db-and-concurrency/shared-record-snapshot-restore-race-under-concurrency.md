# Snapshot-then-restore of a shared/singleton record races under concurrent test execution

Applies to: any test/helper that `SEE`s a shared, environment-wide record (a `COMPANY` config, a
`SYSTEM.PARAMETER`, or any other singleton not created/owned by the test itself), captures it as
"original", mutates one field for the test's own duration, and restores the captured snapshot in a
`finally`/`afterAll`. First confirmed in Currency (`COMPANY.TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY`
in `currency-regression.spec.ts`) on `group-3/TB-3468`, 2026-09-02 — suspected as a likely cause
since 2026-08-26 (see the Currency `US-01.13.03` README's "shared-singleton-mutation pattern" note)
but only confirmed once deliberate concurrent load reproduced it.

## The rule

This pattern is not safe under any concurrent execution against the same environment — two
processes (or two workers) each doing `SEE → mutate → restore` on the same record can interleave:
process A captures the true original and mutates it to its own temporary value; process B's own
"capture original" step reads process A's *temporary* value and treats it as the baseline; when B
restores, it writes A's temporary value back — permanently, since A's temporary value (e.g. a
dynamically-created dependent record) is typically deleted by A's own cleanup shortly after. The
shared record is left holding a dangling reference. If the target system validates the whole record
on every update (not just the changed field), this single dangling reference then blocks *every*
future `INPUT` to that record until it's cleared — including runs that have nothing to do with the
original race, days later, on a completely different (even single-process) run.

**This corruption survives past the incident that caused it.** A clean, single-suite, non-concurrent
run can still fail because of damage a concurrent run left behind earlier — don't assume a shared
record's current state is trustworthy just because *this* run didn't mutate it.

**Fix pattern (defense in depth, doesn't require avoiding the shared record entirely):** before
reusing a captured snapshot as the base for a mutate-`INPUT` or a restore-`INPUT`, validate any
field in it that references another entity (a currency id, a foreign key, anything with its own
lifecycle) still resolves, and strip it if it doesn't. This makes the snapshot self-healing against
this exact corruption class regardless of what caused it, without needing to guess or hand-restore
the "real" original value.

## The incident (2026-09-02)

User ran 3 `proj-test-automation` suites concurrently against the same local/QA environment. Two (or
more) of `currency-regression.spec.ts`'s tests that mutate the shared `COMPANY` record's
`TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` fields raced exactly as described above, leaving
`TRIANGULATION_CURRENCY` pointing at a dynamically-created currency that one process had already
deleted in its own cleanup. A later, completely clean, single-suite run then failed with
`"TRIANGULATION_CURRENCY - target table='CURRENCY' does not contain record with ID='<dead id>' in
LIV space"` on an unrelated test's `COMPANY.LOCAL_CURRENCY` update — the failure had nothing to do
with that test's own logic; it inherited stale corruption from the earlier concurrent run.

**Fix:** `sanitizeCompanyCurrencyReferences(client, companyData)` in `currency-helper.ts` — `SEE`s
any `TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` value in a freshly-captured `COMPANY` snapshot and
strips it if the referenced currency no longer exists, applied immediately after every `SEE` of the
shared record (5 call sites in this Story) before that snapshot is used as an `INPUT` base. Also
self-healed the already-corrupted QA state with no manual data fix needed. See the Currency
`US-01.13.03` README's 2026-09-02 entry for the full incident write-up.

**Predict:** any other module with a similar "shared config record, `SEE`-mutate-restore in a test's
own setup/teardown" pattern is a candidate for the same corruption class under concurrent execution
— check for it before assuming a shared record's captured snapshot is trustworthy.

## 2026-09-02, same day — the race corrupted a second, non-reference field too (`MANDATORY_TRIANGULATION`); a fix for the first symptom introduced a second bug; both now resolved

The dangling `TRIANGULATION_CURRENCY` above was only half the corruption. Live `SEE
COMPANY/MOCK` after `sanitizeCompanyCurrencyReferences` shipped showed
`MANDATORY_TRIANGULATION: true` **also** stuck on the shared record — set only by the
`MANDATORY_TRIANGULATION=YES...` test (`allureCaseId(3210)`) for its own duration and meant to be
reset in its `finally`, left `true` by the same class of restore race, just hitting a boolean flag
this fix's field-existence check has no way to validate (there's nothing to `SEE` for a boolean).
**Effect:** with `MANDATORY_TRIANGULATION: true` stuck and `TRIANGULATION_CURRENCY` dangling, the
Currency Engine is forced to triangulate through a currency that doesn't exist on **every** resolve
call for that company — not just triangulation-specific tests — which is what took down the first 4
previously-100%-reliable tests in a from-scratch `US-01.13.03` run (direct base/quote pairs, amount-
band boundaries) that have nothing to do with triangulation at all.

**A second, self-inflicted bug compounded this while fixing the first.** The initial
`sanitizeCompanyCurrencyReferences` fix assigned its *sanitized* (stripped) snapshot to the same
`originalCompanyData` variable used later to restore the record in `finally`/`afterAll` — meaning
any field the sanitizer stripped (because it referenced a now-dead currency) got **permanently
cleared** on restore instead of "left as it originally was," since CBS's `INPUT` replaces the whole
record, not a partial patch. Caught before it did further live damage (this session's own live
diagnostic showed `LOCAL_CURRENCY` was still intact, `XAF`, not the empty value this bug could have
produced) but it was a live risk. **Fix:** keep the raw captured snapshot for the eventual restore;
build a *separate* sanitized copy only for the immediate mutate-`INPUT`'s spread base. Applied at
all 5 call sites in `currency-regression.spec.ts`.

**Lesson for the general pattern above:** a "strip anything unverifiable" sanitizer only covers
fields it knows how to validate (a currency reference, checkable via `SEE`) — a stuck boolean/enum
flag from the same race is invisible to it. Don't assume fixing the referential-integrity half of a
corrupted shared record means the record is now trustworthy as a whole; a live `SEE` of the actual
record is the only way to confirm, which is exactly what caught this one.

**Live remediation, 2026-09-02:** `COMPANY/MOCK` fixed directly via a one-off diagnostic spec (same
pattern as `keycloak-transient-login-401.md`'s precedent — created, run once, deleted): `INPUT` with
`MANDATORY_TRIANGULATION: false` and `TRIANGULATION_CURRENCY` omitted, `LOCAL_CURRENCY` left
untouched (`XAF`). Confirmed via a follow-up `SEE`.

**Structural hardening, same day — user asked "make our tests self-heal instead of staying this
fragile."** The user correctly pushed back that per-field sanitizing (the fix above) only covers
what it knows how to validate — a stuck boolean like `MANDATORY_TRIANGULATION` needed a different
answer, and one-off live fixes don't survive the next concurrent-run recurrence. Two additions,
both in `currency-helper.ts`:

1. **`ensureCompanyTriangulationBaseline(client, companyCode)`** — an active guard, not a passive
   sanitizer: `SEE`s the shared `COMPANY` record, and if `MANDATORY_TRIANGULATION` is `true` or a
   `TRIANGULATION_CURRENCY`/`LOCAL_CURRENCY` reference is dangling, resets it to the known-good
   baseline (`MANDATORY_TRIANGULATION: false`, dangling references stripped) via `INPUT`, logging
   why. Called once from the single top-level `beforeAll` in **both**
   `currency-regression.spec.ts` and `currency-smoke.spec.ts` (each file has exactly one, covering
   every Story inside it) — right after the existing `ensureCurrencyMasterHasBaseRankAndPreciousMetal`
   self-heal call, same shape/spirit. This is what actually explains why *smoke* tests broke too on
   the same incident even though nothing in the smoke file ever mutates `COMPANY`: they're pure
   consumers of `resolveRate`, which reads this same shared record. Now both files self-correct any
   inherited corruption before their first test runs, regardless of what left it that way.
2. **Verified restore** on the one test that ever sets `MANDATORY_TRIANGULATION: true`
   (`MANDATORY_TRIANGULATION=YES...`, `allureCaseId(3210)`, `currency-regression.spec.ts`) — its
   cleanup now does a follow-up `SEE` after the restore `INPUT` and, if `MANDATORY_TRIANGULATION`
   is still `true`, logs it loudly and force-corrects it right there instead of silently leaving the
   corruption for whatever test happens to run next in the same file/session.

**What this does and doesn't fix:** stops a single corrupted `COMPANY` record from cascading across
an entire suite/session (self-heals at the boundary, verified at the one known source) and gives an
explicit, loud signal instead of a silent 27-test cascade. It does **not** eliminate the underlying
concurrent-run race itself — two processes racing the exact same snapshot-restore window at the same
instant can still corrupt the record mid-window. The practical mitigation for that remains "don't run
multiple suites concurrently against the same environment" (see
`keycloak-transient-login-401.md`'s 2026-09-02 entry). `SYSTEM.PARAMETER` (mutated by both spec
files' own top-level `beforeAll`/`afterAll` for `CCY_ORDER_CUTOFF`) has the identical
snapshot-restore shape and was flagged as the same risk class but not hardened this pass — worth the
same treatment if it's ever seen stuck.

**2026-09-02, confirmed live (test-order audit)** — re-read both call sites end to end:
`currency-regression.spec.ts:86-160` and `currency-smoke.spec.ts:266-306`/`333+` (both top-level
`beforeAll`/`afterAll`, one per file). Same shape as the `COMPANY` case: capture, mutate
`CCY_ORDER_CUTOFF`, restore. Confirmed this and the `COMPANY` case are the *only* two shared-record
mutation points across `currency-regression.spec.ts`/`currency-smoke.spec.ts` — every other
`beforeAll` in both files (`US-01.13.02`, `US-01.13.04`, the nested `National Bank rate resolution`
block, the shared `CCY_ORDER_TEST_MARKET_ID`/`DIFF_UNIT_MARKET_ID` market setup) either uses its own
dedicated/idempotent data or seeds the two test markets with the same flags at every call site, so
none of it depends on **intra-run** test order — Playwright's `workers:1`/`fullyParallel:false` for
the `API-tests` project already serializes everything within one invocation. The risk class here is
exclusively **inter-process**: two `npx playwright test` invocations (two terminals, two concurrent
CI jobs) racing the same `COMPANY`/`SYSTEM.PARAMETER` record at the same instant, never a same-run
ordering/subset/`--grep` change.

**2026-09-16 — the "intra-run is safe" assumption above was about to become false, and a
parallelization-readiness audit caught it before `workers` was ever raised.** Raising `API-tests`'s
worker count above 1 (see `docs/frame-specs/parallelization-readiness.md`) would have made the
inter-process risk class above happen **within a single invocation** too — different worker
processes, same environment, same `COMPANY`/`SYSTEM.PARAMETER` record. A dedicated audit found the
full set: this file's own two mutation points, plus `SYSTEM.PARAMETER` mutated the same way by 7
*other* files across `fin_accounting`, `integration_chapter`, `security_management`, and
`system_core` (~268 tests total depending on correct restore). **Fix shipped the same day**: all 9
files now run in a dedicated `API-tests-singleton` Playwright project pinned to `workers: 1`
(`playwright.config.ts`'s `SINGLETON_RECORD_SPECS`), so Playwright never schedules two of them
concurrently regardless of how high `API-tests`'s own worker count goes. This closes the
**intra-invocation** variant of this risk class. It does **not** touch the **inter-process** variant
already on record above (two separate `npx playwright test` invocations against the same shared
environment) — that mitigation is still "don't do that," unchanged by this fix.
