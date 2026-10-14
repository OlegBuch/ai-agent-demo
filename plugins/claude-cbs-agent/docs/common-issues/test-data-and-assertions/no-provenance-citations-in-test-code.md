# Test code (`test.step` titles, `expect()` messages) must never cite where a requirement/fact came from

## The pattern/symptom

A `test.step(...)` title or `expect(actual, message)` failure message that embeds a ticket number,
Allure case id, doc reference, or a "confirmed live on <date>" provenance note — e.g. `per TB-3588's
Expected Result (...)`, `per allureCaseId(3440)'s own Expected Result: "..."`, `STEP 3: TB-2978
re-submitting...`, `(confirmed via TB-2440: ...)`, `(re-confirmed live via a standalone Bruno probe
on a fresh ...)`. This reads as thorough when writing it, but it's wrong: whoever triages a failing
CI run reads the step/message text directly in the Allure report, and does not need — and should
never see — the research trail behind an assertion. That story belongs in `proj-ai-agentic`'s
`docs/module-theory/`/`docs/chat-history/`, not in code the harness renders to a human.

## The rule

Before finalizing any `test.step` title or `expect()` message, scan it for a citation token: a
ticket number (`TB-\d+`), `allureCaseId(...)`, "per <source>", a bare date, "confirmed"/"re-confirmed
live". If removing that token would change what the string claims, it's a citation and must go —
keep only the plain factual claim it was attached to (`per TB-3588's Expected Result ("UNIT can be
null or missed")` → just `UNIT can be null or missed`). This is distinct from a structural
cross-reference that helps a reader navigate the test itself (e.g. labeling which Allure Step a
given `test.step` maps to, when a single Allure step is split across multiple code steps) — that's
not a provenance citation and doesn't need stripping.

## The incident(s)

**Currency Definition and Logic, `currency-regression.spec.ts`, 2026-09-03 (recurring — flagged
twice in the same session, on the same file).** First occurrence (2026-08-24, TB-1989/US-01.13.03):
a step titled `STEP 2 (hardening beyond the sheet's single step, per Bruno's "Resolve Rate
(Unordered Pair)" doc note — "both orders resolve identically"): ...`. Second occurrence
(2026-09-03), self-inflicted in the same file during a same-session edit: `per TB-3588's Expected
Result ("UNIT can be null or missed")` and `per allureCaseId(3440)'s own Expected Result: "the
single band must start from 0 (AMT_FROM=0)"` in `expect()` messages, plus a pre-existing `STEP 3:
TB-2978 re-submitting the same unchanged BASE_RANK is still accepted` step title predating that
session. All fixed by stripping the citation, keeping the fact.

**Cross-module sweep, 2026-09-03**: the same pattern (ticket numbers, bare dates, "confirmed
live"/"re-confirmed live" phrasing) also found in `idempotency-regression.spec.ts`,
`enquiry-regression.spec.ts`, `image-capture-regression.spec.ts`,
`validation-engine-regression.spec.ts`, `customer-party-integration.spec.ts`.

**`idempotency-regression.spec.ts` fixed same day, on explicit user request.** Two real instances
(both `expect()` messages, lines ~1741/1803 as of this writing): `"...(confirmed with the team
2026-08-07), so the row is never recomputed"` and `"...confirmed with the team 2026-08-07 that
duplicate_registry is not updated on accept, contrary to this case's stated expectation"` — both
stripped to the plain fact (`duplicate_registry is not updated on accept, ...`), no attribution.
Note: `idempotency-regression.spec.ts`/`idempotency-smoke.spec.ts` also contain several instances
of the phrase **"the confirmed override"** — that is a legitimate domain term (an override
accepted via `acceptOperationOverride`, a real business state), not a provenance citation; don't
mistake it for this pattern and strip it.

`enquiry-regression.spec.ts`, `image-capture-regression.spec.ts`,
`validation-engine-regression.spec.ts`, `customer-party-integration.spec.ts` are still unfixed —
worth a dedicated sweep before those modules' next non-trivial touch.
