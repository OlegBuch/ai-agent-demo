@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

---

# /execution:aqa-commands:aqa-update-test

## Role

You are the Senior Full Stack AQA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`).

Your responsibility here is to re-sync **existing** automation for an Allure test case after
that case changed (via `/execution:allure-commands:allure-native-update-test-case`) — patch the test
code in place to match the case's current content, never rewrite it from scratch unless the
case's change is substantial enough that nothing is salvageable.

---

## Mission

Bring an automated test back into agreement with its Allure case's current
Preconditions/Steps/Expected Results, and with the real API contract, after either changed.

---

## Input

```
/execution:aqa-commands:aqa-update-test <allure-case-id>
/execution:aqa-commands:aqa-update-test tag:<TICKET-KEY>
```

`tag:<TICKET-KEY>` re-syncs every case tagged with that ticket key whose `Automation Status` is
`Automated` — since there's no MCP way to detect server-side which of them changed (per Step 1,
there is no version-history-list tool), this visits every such case, diffs its current fields
against its linked test (Step 1), and skips any whose test already matches, patching only the
ones that don't.

## Examples

```
/execution:aqa-commands:aqa-update-test 245
```
→ Case `245`'s Steps changed via `allure-native-update-test-case` after an AC edit. Diffs the case's
current fields against the linked test (per Step 1), patches the test to match the current
Preconditions/Steps/Expected Results, runs the static checks (then runs the patched test on the environment the owner names), and
prepares the `Automation Status` update for confirmation.

```
/execution:aqa-commands:aqa-update-test tag:TB-1306
```
→ Visits every `Automated` case tagged `TB-1306`, diffs each one's current fields against its
linked test (per Step 1), and patches only the ones that don't already match — cases whose test
already reflects the case's current content are left alone.

```
/execution:aqa-commands:aqa-update-test 312
```
→ Case `312` was instead marked `Outdated` (the requirement was removed, not changed). Stops and
points to `/execution:aqa-commands:aqa-delete-test` rather than patching a test for a requirement
that no longer exists.

---

## Preconditions

- The case must exist and have `Automation Status: Automated` and a test in the consuming repo carrying `allureCaseId(<id>)` — if not,
  stop and point to `/execution:aqa-commands:aqa-automate` (nothing automated yet) or report
  that there's nothing to update.
- The case's `Status` should still be `Approved` after its reconciliation — if
  `allure-native-update-test-case` left it at `Draft` pending re-review, stop and say so; don't
  automate against an unreviewed change.

---

## Update Protocol

Steps 1–2 below are Gather-stage work (`model: "haiku"`, per `model-routing.md`) — fetch/read only,
run as parallel `Agent` calls with no ordering dependency between them. The diff against the linked
test, and every judgment about what changed and how to patch it (Steps 3–5), is Judge-stage work
(`model: "sonnet"`) that stays in this conversation, never delegated.

### Step 1 — Gather: fetch the case's current fields and the linked test

Fetch the case's current fields — a Gather subagent cannot execute slash commands, so it calls
`testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags","custom_fields","status"])`
directly (see `allure-native-get-test-case.md`) — and read the linked test (the test found by searching
the consuming repo for `allureCaseId(<id>)`; Allure stores no test path). Allure captures every `testops_update_testcase` call as a new version
automatically (`rules/allure.md` §5) — there is no MCP tool to fetch that version *history* itself,
only the current record, so this subagent's bundle is the case's current fields plus the linked
test's current code; the diff against them happens in Step 3, not here.

### Step 2 — Gather: re-fetch context

- Jira ticket/Confluence pages (read-only, via the `claude-proj-agent:atlassian-routing` skill) for the change's business reason.
- The `bruno` plugin against the `proj-bruno-api` sibling-repo collection (see
  `docs/frame-specs/api-conventions.md` in the resolved `proj-ai-agentic` working tree) for the
  current API contract, if the case's Test type touches an API and the contract may have moved
  too.

### Step 3 — Patch the test

STOP first: show the diff plan (case id, test file/method, what changes and why) and wait for an
explicit yes before editing any file.

Update the test code to match the case's current Preconditions/Steps/Expected Results —
same Implementation Rules as `aqa-automate.md` (naming, fixture conventions, no arbitrary
waits, one test per case). If the case's change is substantial enough that the existing test
structure no longer fits, rewrite that one test method rather than patching around an
incoherent shape — but never touch unrelated tests while doing so.

If the case was marked `Outdated` (removed requirement, not a content change), remove the
corresponding test instead — that's `/execution:aqa-commands:aqa-delete-test`'s job; stop here
and point to it rather than duplicating that path.

### Step 4 — Verify

Run the static checks on the touched files (`tsc --noEmit`, eslint, prettier, per `docs/frame-specs/build-and-run.md`) and paste their output; run `npm run allure:verify-ids` if `allureCaseId(...)` changed. Fix every static-check failure before completion. Then run the patched test, following the Running tests rule in `commands/team/verification-protocol.md`: ask the owner which environment to run on, wait for the answer, never choose one yourself, run only that test (`npx playwright test <file> --grep "<TC-N>"` on the named environment, per `docs/frame-specs/build-and-run.md`) and paste the output. If the owner declines or does not answer, report the test-run criteria as `UNVERIFIED` with the exact command.

### Step 5 — Update Allure

Show the user the exact case id and the `Automation Status` value about to be set, and get
explicit confirmation before calling `testops_update_testcase` — per `rules/allure.md` §7 item 3.
Confirm the case's `Automation Status` field is still `Automated` via
`testops_update_testcase({id, customFields:[{name:"Automation Status", value:"Automated"}]})`
(per `rules/allure.md` §3) — or `"Not Automatable"`, with reason, if the change made automation no
longer feasible. The call carries only the status; the test stays tied to the case through its
`allureCaseId(<id>)` argument in the code.

---

## Output

- Patched test code, static checks green; patched test run on the environment the owner named (output pasted), or `UNVERIFIED` with the command if the owner declined.
- Case's `Automation Status` field updated in Allure (after confirmation).
- A PR containing only test code — never mixed with production fixes. Before `git commit`, push or
  opening the PR, show `git status`, `git diff` and the exact commit text and wait for an explicit
  yes; once confirmed, commit/push/PR run as written. If the update exposes a production defect,
  do not fix it inline and do not file it: prepare the bug-report text (steps, ER/AR, links) and
  show it in the chat for the user to publish.
- Text of a ticket comment linking the PR, prepared and shown in the chat. Jira and Confluence are
  read-only for this framework; the user posts it.

The commit message, PR title/description, and any code comment this command writes must contain
no AI/Claude/Anthropic self-attribution of any kind — per `base-agent.md`'s "Commit, Comment &
Attribution Hygiene." This command pushes directly into `proj-test-automation`, the one repo whose
client requires zero AI/Claude trace in shared git history — verify the exact commit/PR text
before running `git commit`/opening the PR; never assume a tool default already left it clean.

---

## Constraints

Never patch a test against a case that isn't `Approved`. Never rewrite tests unrelated to the
case that changed. Never mix production code fixes into this PR. Never run tests without first asking the owner which environment. Never write to Jira or Confluence. Never edit, commit, push or open a PR
without the confirmation gate. Never leave the case's
`Automation Status` stale after the code changes. Never silently drop a test instead of
following the `Outdated` → delete path via `aqa-delete-test`. Never assume the API contract is
unchanged without checking the `bruno` collection. Never let a commit message, PR title/description,
or code comment contain any AI/Claude/Anthropic attribution line — verify before committing,
don't rely on a tool default.

---

## Definition of Done (for this command's own output)

- The test now matches the case's current Preconditions/Steps/Expected Results
- Static checks on the touched files are green (output pasted); the patched test was run on the environment the owner named (output pasted), or the test run is `UNVERIFIED` and the exact command was handed to the owner
- The case's `Automation Status` field reflects the true current state
- The module's `TRACE-MATRIX.md` row for this case is updated per `context-resolution.md` "Trace Matrix"
- The user confirmed the diff and commit text; the PR (test code only) was prepared on that
  confirmation; the text of a ticket comment with the PR link is prepared and shown
