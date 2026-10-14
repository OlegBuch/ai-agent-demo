Title: [ALLURE DATA ISSUE] Case 2734 "Date normalization to ISO format" contradicts dev-confirmed BR-3.5

Module: Idempotency / Functional Duplicate Detection (US-01.12.03)
Related docs: [[project_tb-1860-br-3.5-no-date-normalization]] (this repo's memory),
  `docs/test-cases/TB-1860/analysis.md` BR-3.5 (dev-confirmed 2026-08-07: CBS requires one specific
  DateTime format, alternate formats get `400`, no silent normalization)
Found: 2026-08-28, during the Allure `allureCaseId` linking pass over the whole
"Idempotency & Duplicate Prevention Engine" component (see INDEX.md "Allure Linking" section).
Status: Open — needs a Manual QA/BA decision, not resolved here per
[[feedback_no-automate-on-contract-mismatch]] / [[feedback_escalate-dont-ship-mismatched-automation]].

Context

Allure TestOps case **2734** ("Date normalization to ISO format", Story US-01.12.03, Component
"Idempotency & Duplicate Prevention Engine") states:

> Step: "POST INPUTs with VALUE_DATE in different formats representing the same date."
> Expected Result: "Dates are normalized to ISO before hashing -> equivalent dates yield the same
> hash."

This is the **opposite** of BR-3.5, which the team confirmed live on 2026-08-07: CBS accepts only
one exact DateTime format for `VALUE_DATE` and rejects any alternate format with `400` — there is no
backend date normalization at all, so two differently-formatted-but-equal dates can never even both
reach the hashing step (the non-canonical one is rejected outright).

`proj-test-automation`'s existing automated test (`idempotency-regression.spec.ts`, still titled
`'TC-11: VALUE_DATE requires the exact CBS DateTime format'` — deliberately **not** relinked to
Allure case 2734 in this pass) asserts BR-3.5's dev-confirmed behavior: a non-CBS format (`04-04-2026`)
is rejected with `400`, and the canonical format (`2026-04-04`) is accepted. That test and Allure case
2734 describe mutually exclusive behaviors — linking them would ship an automated test that "passes"
while proving the opposite of what the linked case claims.

What's needed

Manual QA/BA to decide, then update Allure case 2734 to match:
1. If BR-3.5 (no normalization, exact format only) is still correct — case 2734 is stale and should
   either be corrected to describe the exact-format-rejection behavior (at which point it can be
   linked to the existing `TC-11` test) or retired if it duplicates another case.
2. If date normalization was later implemented and BR-3.5 is now outdated — the existing automated
   test asserts the wrong behavior and needs to be rewritten against the new contract, and BR-3.5's
   record in `docs/test-cases/TB-1860/analysis.md` needs the same correction.

Until one of those happens, case 2734 stays `Not Automated` and the existing `TC-11` test keeps its
`TC-11:` title prefix (no `allureCaseId`) as a visible marker that it's still unlinked.
