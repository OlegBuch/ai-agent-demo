Title: [ALLURE DATA ISSUE] Case 2672 is titled "X-Company-Code" but its steps test ":operation" instead

Module: Idempotency / Technical Idempotency (US-01.12.01)
Found: 2026-08-28, during the Allure `allureCaseId` linking pass over the whole
"Idempotency & Duplicate Prevention Engine" component (see INDEX.md "Allure Linking" section).
Status: Open — Allure data-quality issue, not resolved here.

Context

Allure TestOps cases **2672** and **2673** both carry the exact same name, "Same key + different
X-Company-Code => different scoped key", under Story US-01.12.01. Their actual scenario content
disagrees:

- **2673** — real X-Company-Code content: "1. POST :operation=INPUT with X-Company-Code=MOCK and
  KEY-1. 2. POST :operation=INPUT with X-Company-Code=MOCK2 and the same KEY-1." Expected: "Different
  X-Company-Code => different scoped key; no collision; both execute." This matches its title and was
  linked to `proj-test-automation`'s existing `'Same key + different X-Company-Code...'` test
  (`allureCaseId(2673)`).
- **2672** — title says X-Company-Code, but its actual steps are: "1. POST .../operations/INPUT with
  KEY-1. 2. POST .../operations/REVERSE with the same KEY-1." Expected: "Different :operation =>
  different scoped key; both operations run independently." This is word-for-word a duplicate of
  case **2671**'s ("Same key + different :operation => different scoped key") actual scenario — 2672
  looks like a copy-paste of 2671 that had its title edited but not its steps.

What's needed

Manual QA to either fix 2672's steps to genuinely test X-Company-Code (making it a real second case
alongside 2673 — unclear what it would add), or retire it as an accidental duplicate of 2671. Left
`Not Automated` in this pass — it must not be linked to the existing X-Company-Code test (that's
already correctly linked to 2673), nor to the `:operation` test (already linked to 2671), since doing
either would misrepresent which case an automated test proves.
