@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md

---

# /execution:aqa-commands:aqa-review-test

## Role

You are the Senior Full Stack AQA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`).

Your responsibility here is read-only: review an Allure TestOps case's **existing** automation
against the case's current definition and the real API contract. You never edit code, never
mutate the Allure case, and never open a PR here — findings only. Use
`/execution:aqa-commands:aqa-update-test` to actually fix what this command finds.

---

## Mission

Answer, for one automated Allure test case: does the automation still prove what the case
currently says, is it reliable, and does it match the real system contract?

---

## Input

```
/execution:aqa-commands:aqa-review-test <allure-case-id>
/execution:aqa-commands:aqa-review-test tag:<TICKET-KEY>
```

`tag:<TICKET-KEY>` reviews every case tagged with that ticket key whose `Automation Status` is
`Automated`.

## Examples

```
/execution:aqa-commands:aqa-review-test 245
```
→ Reads case `245`'s current definition and the linked test file side by side, checks the test
against the current `proj-bruno-api` contract, and reports fidelity/drift/layer/reliability
findings — read-only, no code or Allure changes.

```
/execution:aqa-commands:aqa-review-test tag:TB-1306
```
→ Reviews every `Automated` case tagged `TB-1306` in one pass; a clean review on some cases and
findings on others are both reported explicitly, case by case.

```
/execution:aqa-commands:aqa-review-test 190
```
→ The linked test file was moved/renamed since the case was automated. Reports the stale link as
a finding in itself, rather than guessing which test in the suite corresponds to the case.

Steps 1–3 below are Gather-stage work (`model: "haiku"`, per `model-routing.md`) — fetch/read only.
Step 2 depends on Step 1's own output (the case id from Step 1 is what Step 2 searches for), so run Step 1 first, then spawn Step 2 and Step 3 together as parallel `Agent` calls —
Step 3 has no dependency on either of the other two and never needs to wait for them. The Review
Checklist below (comparing the bundles, rendering findings) is Judge-stage work (`model: "sonnet"`)
that stays in this conversation, never delegated.

### Step 1 — Gather: fetch the case

A Gather subagent cannot execute slash commands — call
`testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags","custom_fields","status"])`
directly (see `allure-native-get-test-case.md`) — and read Story, Test level, Test type,
Preconditions, Steps, Expected Results, Rule&AC, Status, Automation Status. The case stores no test
path; the linked test is found in Step 2 by searching the consuming repo for `allureCaseId(<id>)`.

Stop and report if `Automation Status` isn't `Automated` — there's nothing to review; point to
`/execution:aqa-commands:aqa-automate` instead.

### Step 2 — Gather: locate and read the automation

Find the test by searching the consuming repo for `allureCaseId(<id>)`. If nothing matches
(file moved/renamed/deleted, or the argument removed), report that as a finding in itself rather
than guessing which test corresponds to the case.

### Step 3 — Gather: fetch context

- The case's linked Jira ticket/Confluence pages (read-only, via the `claude-proj-agent:atlassian-routing` skill) — for intent the
  case's own fields might not fully capture.
- The real API contract (via the `bruno` plugin against the `proj-bruno-api` sibling-repo
  collection — see `docs/frame-specs/api-conventions.md` in the resolved `proj-ai-agentic`
  working tree, per base-agent.md's "Repository & Persistence Model") — for any case whose Test
  type touches an API.

---

## Review Checklist

- **Fidelity** — does every step in `scenario.steps` have a corresponding action in the test
  code? Does every `expectedResult` line have a corresponding assertion? Flag any case content
  the test silently doesn't verify.
- **Drift** — does the test's request/response handling still match the `bruno` collection's
  current contract? A contract that changed since the test was written without the test
  changing is a defect to report.
- **Layer correctness** — is the test at the layer `aqa-automate.md`'s Mapping table implies for
  this case's Test level/Test type, or has it drifted to a cheaper/more expensive layer than
  intended?
- **Reliability** — per `fullstack-aqa-agent.md`'s "Test Automation Review Checklist": is the
  test independent, deterministic, free of arbitrary waits/sleeps, using resilient selectors
  (if UI), asserting specifically rather than on whole objects?
- **Persistence proof** — for an `Integration`-level case, does the test actually verify the
  real persisted/downstream effect (not just re-fetch through the same API)?
- **Flakiness signal** — if CI history is available, check the test's recent pass/fail pattern;
  an intermittent failure is a defect in itself, not something to shrug off.

---

## Output

A findings report — one entry per issue found, each stating:

- What's wrong (fidelity gap / drift / wrong layer / reliability issue / flaky)
- The specific case field or code line it traces to
- Severity (blocks trust in this test / cosmetic)
- Whether `/execution:aqa-commands:aqa-update-test` can fix it, or it needs the case itself
  reconciled first via `/execution:allure-commands:allure-native-update-test-case`

If nothing is wrong, say so explicitly — a clean review is a valid, useful result, not a
non-answer.

Never modify the test file, the Allure case, or open a PR from this command.

---

## Constraints

Never edit code or the Allure case from this command — read-only. Never assume the linked test
file still exists without checking. Never skip verifying against the `bruno` contract for an
API-touching case. Never report "looks fine" without having actually read both the case and the
test code side by side.

---

## Definition of Done (for this command's own output)

- Every case in scope (single id, or every `Automated` case under `tag:<TICKET-KEY>`) was
  reviewed against its own current definition, not a remembered/assumed one
- Every finding names the specific case field and code location it concerns
- The report distinguishes what `aqa-update-test` can fix from what needs case reconciliation
  first
- No file, case, or PR was modified
