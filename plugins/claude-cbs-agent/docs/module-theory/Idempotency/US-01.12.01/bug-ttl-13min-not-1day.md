Title: [BUG, confirmed by official QA Compliance Check] Idempotency cache TTL is ~14 minutes on QA, not the documented 1 day

Module: Idempotency / Technical Idempotency (US-01.12.01)
Related tickets: TB-1549 (Story, Done), TB-3029 (QA Compliance Check, Done, verdict "Partially
  compliant")
Found: 2026-08-28, while assessing automatability of the 3 currently-Manual TTL-dependent cases
  (Allure 2667, 2678, 2679 — "Successful commit caches the response for 1 day", "After TTL expiry
  the request is processed as a first attempt", "Manually verify that the cached response is
  deleted after 1 day"), triggered by the user supplying the original manual-QA Excel test-design
  sheet for cross-checking.
Status: Confirmed bug, needs a BA/Dev decision (raise deployed TTL to match the Story, or correct
  the Story's documented TTL) before these 3 cases can be automated on a fixed, sensible schedule.

Context

Confluence `US-01.12.01 | Technical Idempotency` (pageId 1500184580, TB space) states TTL = 1 day in
three places (Happy Path step 7, AC5, Post-Conditions "Cache State on Success"). TB-3029's QA
Compliance Check comment (2026-08-19, ticket status Done) found:

> "US-01.12.01 requires successful-commit markers to be retained for TTL = 1 day. On QA, a marker
> created via `X-Idempotency-Key` was confirmed **expired after ~13m49s** — consistent with the
> table-template's default cache TTLs (a few minutes), with no environment override found... Needs
> a decision: raise the deployed TTL to match the US, or correct the US."

What this changes for automation

The 3 cases above were marked `Manual` in the original QA test-design sheet specifically because
proving a 1-day TTL in an automated run is impractical. With the real TTL confirmed at ~14 minutes,
these become technically automatable within a single (slow) test run — but only in a way that
encodes the *current buggy value*, not the *documented* 1-day requirement:

- Automating "cache hit persists for 1 day" cannot be done at all without a fast-forward/flush
  mechanism (none found — see [[reference_allure-testops-rest-access-from-proj-test-automation]]
  sibling investigation; the Bruno collection and this Confluence page have no test-only cache
  control documented or found).
- Automating "cache hit still works after ~14 minutes, gone after ~15" would only prove the *bug's*
  current behavior, not the Story's stated 1-day requirement — this is the same
  [[feedback_no-automate-on-contract-mismatch]] situation as the BR-3.5-vs-2734 date-normalization
  conflict: don't silently automate against the wrong side of a live contract disagreement.

Recommendation (not decided here — needs the user's/BA's call)

1. If the team confirms 1 day is still the intended value and the ~14-minute TTL is the bug to fix:
   these 3 cases stay `Manual`/blocked until the fix ships, then can be automated against the
   corrected 1-day value (still likely requiring a >1-day slow/scheduled test, or a fast-forward
   hook if one gets built).
2. If ~14 minutes (or whatever the platform's default table-template cache TTL actually is) is
   accepted as the real, intended value and the Story text is stale: the Story should be corrected,
   and a ~15-minute-runtime test could then be written and placed in a slow/nightly suite (not the
   fast Smoke/Regression path) to catch regressions of that value.

Either way, this is not something to resolve by guessing which side is "right" — flagged for the
user/BA to decide before any of the 3 TTL cases move off `Manual`.
