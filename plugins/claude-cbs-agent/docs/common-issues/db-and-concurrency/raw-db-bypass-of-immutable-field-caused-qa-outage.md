# Never route around an API validation via raw DB INSERT/UPDATE/DELETE — incident, 2026-09-03

Applies to: `proj-test-automation`'s own framework helpers, any module. Surfaced while
investigating a dev-reported QA outage (`system_parameter.liv` manually `UPDATE`d via DBeaver from
a VPN IP, `application_name` = `DBeaver 26.0.5 - Main <proj_qa>`).

## The rule

If the API rejects a write with a 400, that is very likely a **deliberate, tested business rule**,
not an obstacle to route around. Before writing (or extending) a helper that reaches for raw SQL to
force a value the API just refused:

1. Grep the regression suite for an existing negative test proving the API's rejection is
   intentional (e.g. an "immutable field" or "singleton" test). If one exists, the helper is wrong,
   not the API.
2. Never `DELETE`/`UPDATE` a row directly to defeat a validation and then let the API "recreate"
   it — this only works because the validation lives on the *modify* path, not the *create* path,
   which is exactly why it's a bypass, not a fix.
3. The one legitimate raw-DB write for a singleton config row is a one-time `INSERT` into a
   genuinely **empty** table during environment/global setup (no existing row exists to "modify"),
   never a `DELETE`+recreate or `UPDATE` against a row that's already there.
4. A raw DB helper used by more than one spec file is not a local, disposable hack — check every
   call site (`grep -rn` the helper name across the whole repo, not just the file you're looking
   at) before assuming its blast radius is confined to one test.

## The incident (2026-09-03)

`db-helper.ts`'s `ensureSystemShareCusData(client, requiredValue)` tries to force the
`SYSTEM.PARAMETER` singleton's `SHARE_CUS_DATA` flag to a specific value so Auto-ID tests can
exercise both the `true` (global) and `false` (company-scoped) behavior. Originally written by
Abdulla Karimov (`TB-1102`, 2026-06-23) — from day one it called a companion helper,
`clearSystemParameterInDb`, that `DELETE`s the `system_parameter.liv/nau/his` rows directly via SQL
and then calls the real API (`INPUT` on `SYSTEM.PARAMETER~MASTER`) to recreate the row with the
desired value. A later change (`TB-1525`, 2026-07-21) made this safer — capture-before-delete
and restore-on-failure if the API recreate call fails — but kept the same underlying bypass.

One week after the helper was first written, Hanna Koval's own regression suite
(`system-param-regression.spec.ts`, `TB-936`, 2026-06-30) added **TC-18: "reject attempt to modify
immutable SHARE_CUS_DATA"** (Allure case 459) — a passing negative test proving the API is
*supposed* to `400` any attempt to change `SHARE_CUS_DATA` once it's set. Nobody connected the two:
the helper keeps "fixing" a 400 that the codebase's own regression suite proves is correct,
by deleting the row and recreating it from scratch (the immutability check only guards the
*update* path, not the initial *create*).

This isn't confined to one throwaway test. `ensureSystemShareCusData`/`clearSystemParameterInDb`
are called **9 times across 2 files**:

- `api/integration_chapter/tests/sys-params.spec.ts` (TC-07, TC-08) — tagged only `@api`/
  `@integration`; `test:api:integration` has no CI job (local-only per `.gitlab-ci.yml`), and the
  team currently disclaims ownership/maintenance of it.
- `api/system_core/tests/system-parameterization-smoke.spec.ts` (TC-04, TC-25, TC-51, TC-52,
  TC-54, TC-55, TC-56 — 7 call sites, plus one direct `clearSystemParameterInDb` call in TC-03) —
  tagged `@smoke_m1`, which **is** wired into `.gitlab-ci.yml` (`api:smoke-m1` job, triggerable via
  a manual/scheduled pipeline with `TEST_TYPE=smoke-m1` against `$ENV_TARGET`, which defaults to
  `qa`) — i.e. exactly the environment (`proj_qa`) hit in the incident.

The actual DB write that caused the outage was a single raw `UPDATE ... SET data=$1 WHERE id=$2`
from a human's DBeaver session, not this framework's own `DELETE`+`INSERT` pattern — most likely
someone who hit the (expected, by-design) 400 from `ensureSystemShareCusData` and, not knowing
`SHARE_CUS_DATA` is deliberately immutable, "fixed" it by hand directly in the DB. The pre-existing
`clearSystemParameterInDb` anti-pattern is what normalized "just touch the DB directly" as an
acceptable move for this table in the first place.

**Fix applied (2026-09-03):** both function bodies in `db-helper.ts` are now commented out
in place (not deleted — left as disabled code with a `DO NOT USE`/`DO NOT UNCOMMENT` header aimed
explicitly at AI assistants/agents too, so an import of either name now fails to compile rather than
silently working), and every one of the 9 call sites across `sys-params.spec.ts` and
`system-parameterization-smoke.spec.ts` is commented out with the same warning. TC-03 in the smoke
file (whose entire body was built around `clearSystemParameterInDb`) was commented out wholesale
since it can't function without the banned helper.

This is a stop-the-bleeding fix, not a redesign: TC-03/TC-04/TC-25/TC-51/TC-52/TC-54/TC-55/TC-56 and
TC-07/TC-08 are now either fully disabled or run without any guarantee of the `SHARE_CUS_DATA` value
they assume — real coverage for those Auto-ID scenarios still needs a proper fixture strategy: seed
the value once, correctly, before the singleton row exists (`global-setup.ts` already does this — it
`INSERT`s `SHARE_CUS_DATA: true` only when the table is empty), or run each polarity in its own
freshly-provisioned environment/company scope — not a runtime toggle against a live, shared,
already-initialized environment. That redesign is still open, pending a team decision.
