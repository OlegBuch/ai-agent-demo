# Idempotency & Duplicate Prevention Engine — Allure linking + coverage audit

**Date/time:** 2026-08-28 09:53 · **Branch:** group-3/TB-3400 (proj-test-automation) · **Ticket(s):** TB-3400

## Discussed

- User asked for a full inventory of Allure TestOps' "Idempotency & Duplicate Prevention Engine"
  component (grouped by Story), then to strip `TC-N:` prefixes and wire `allureCaseId(...)` into
  every automated Idempotency test (Smoke + Regression), and to produce an automated-vs-not list.
- Mid-session, unrelated to the Allure task: user confirmed TB-3399 had merged to `main` and asked
  to fetch `origin/main` and branch `group-3/TB-3400` off it — done first, before returning to the
  Allure work.

## Implemented

- Queried Allure TestOps directly via `curl` (MCP tools load but can't reach
  `allure.proj.local` from this session, confirmed again — see
  `reference_allure-testops-rest-access-from-proj-test-automation` memory). Paged the full 2864-case
  `TB CBS` project (id 2), then fetched `cfv` for the id range 2665–2740 to resolve Story/Component.
- Edited `api/system_core/tests/idempotency-smoke.spec.ts` and
  `api/system_core/tests/idempotency-regression.spec.ts`: added the `allureCaseId` import, stripped
  `TC-N: ` from every automated test's title, and added `allureCaseId(<id>)` as the second `test()`
  argument for 37 of the 38 automated tests. Verified with `tsc --noEmit`, `eslint`, and
  `prettier --write` (no manual test execution, per user's standing "never run tests" preference).
- `git fetch origin main` + `git checkout -b group-3/TB-3400 origin/main` (TB-3399 confirmed merged,
  commit `4826dea2`).
- Wrote two new dev-facing bug files and updated
  `docs/module-theory/Idempotency/INDEX.md` in `proj-ai-agentic` (see below).

## Learned

- The "Idempotency & Duplicate Prevention Engine" Allure component holds **46** cases across 3
  Stories: US-01.12.01 (15), US-01.12.02 (16), US-01.12.03 (15, after excluding 3 interspersed
  unrelated cases that share the same id range). **37 are now automated** (9 + 16 + 12), **9 are
  not** — full breakdown in `docs/module-theory/Idempotency/INDEX.md`'s new "Allure Linking"
  section.
- Two new Allure data-quality/contract issues found and documented (not resolved silently, per
  `feedback_no-automate-on-contract-mismatch` / `feedback_escalate-dont-ship-mismatched-automation`):
  - Case **2734** ("Date normalization to ISO format") contradicts the dev-confirmed BR-3.5 (no date
    normalization). The existing `TC-11` test was deliberately left unlinked (still carries its
    `TC-11:` prefix) rather than forced onto 2734.
  - Case **2672** is titled "X-Company-Code..." but its actual steps are a verbatim duplicate of
    case 2671's ":operation" scenario — left `Not Automated`, not linked to either sibling test.
  - Full detail in `docs/module-theory/Idempotency/US-01.12.03/bug-allure-2734-*.md` and
    `docs/module-theory/Idempotency/US-01.12.01/bug-allure-2672-*.md`.
- Confirmed (again) that this project's `.mcp.json` now sources `ALLURE_TOKEN` from an environment
  variable rather than a hardcoded token — the curl fallback still works the same way, just read the
  token from `$ALLURE_TOKEN` instead of a literal.

## Open Items / Follow-ups

- Case 2734 vs BR-3.5: needs a BA/Manual QA decision (fix the Allure case, or confirm the spec
  changed) before `TC-11` can be linked either way.
- Case 2672: needs Manual QA to fix its steps or retire it as an accidental duplicate of 2671.
- Case 2679 ("Manually verify... TTL expiry") looks like it should be `Not Automatable` rather than
  just unautomated — flagged for Manual QA to confirm and set the status.
- Not yet automated, no blocker identified: 2667 (TTL commit cache), 2674 (OVERRIDE continuation
  scoped key), 2675 (cache lost in both tiers), 2678 (TTL expiry reprocess), 2727 (OVERRIDE
  30-minute session expiry), 2740 (four-eyes approver vs initiator — same open ambiguity as
  TC-03/TC-07 noted in the module's existing "Patterns" section).

## References

- Allure TestOps: `https://allure.proj.local:8443`, project id 2 ("TB CBS"), cases 2665–2740
  (component "Idempotency & Duplicate Prevention Engine").
- `proj-test-automation` branch `group-3/TB-3400` (created off `origin/main` commit `4826dea2`,
  which merged `group-3/TB-3399`).
