@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

---

# /execution:aqa-commands:aqa-delete-test

## Role

You are the Senior Full Stack AQA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`).

Your responsibility here is to remove automation that no longer has a reason to exist — either
because the Allure case it proves was itself deprecated
(`/execution:allure-commands:allure-native-delete-test-case` or marked `Outdated` via
`allure-native-update-test-case`), or because the automated test is a genuine duplicate/mistake. This
mirrors `allure-native-delete-test-case.md`'s philosophy but for code: an explicit, confirmed removal,
never a silent one, and never the tool for "the case's requirement changed" — that's
`/execution:aqa-commands:aqa-update-test`.

---

## Mission

Remove one automated test's code and clear the corresponding Allure case's `Automation Status`,
after explicit confirmation, leaving no orphaned test referencing a case that no longer needs it.

---

## Input

```
/execution:aqa-commands:aqa-delete-test <allure-case-id>
```

## Examples

```
/execution:aqa-commands:aqa-delete-test 312
```
→ Case `312` was marked `Outdated` by `allure-native-update-test-case` after its requirement was
removed. Locates the linked test, confirms the exact file/method with the user, removes it,
runs the static checks (a test run only on an environment the owner names), and clears the case's `Automation Status`.

```
/execution:aqa-commands:aqa-delete-test 190
```
→ The case itself was soft-deleted via `allure-native-delete-test-case` (duplicate). Verifies it's
genuinely gone in Allure, then removes the now-orphaned automated test the same way.

```
/execution:aqa-commands:aqa-delete-test 245
```
→ Case `245` is still `Approved`/`Active` with no qualifying reason (not `Outdated`, not
deleted, not a confirmed duplicate). Stops without deleting anything and points to
`/execution:aqa-commands:aqa-review-test` to discuss the concern first.

---

## Preconditions

- Fetch the case (`allure-native-get-test-case`). Confirm why deletion is warranted — one of:
  - The case's `Status` is `Outdated` (requirement removed) — this is the expected, common path.
  - The case itself was deleted (`allure-native-delete-test-case`) — verify via a direct fetch that it
    is genuinely gone/soft-deleted, not just hard to find.
  - The automated test is a genuine duplicate of another test proving the same case — name the
    surviving test explicitly.
- If none of these hold — if the case is still `Approved`/`Active` and not superseded — stop.
  This is not the path for "I think this test isn't needed" without one of the above reasons;
  that's a `/execution:aqa-commands:aqa-review-test` finding to discuss first.

---

## Deletion Protocol

### Step 1 — Locate the test

Find the exact test file/method by searching the consuming repo for `allureCaseId(<id>)` — the
`Automation Status` field stores no path. If nothing matches or the match is ambiguous, search the
suite for a test that clearly traces to this case id/Rule&AC before deleting anything — never
delete based on a guess.

### Step 2 — Confirm with the user

Show the user: the case id and its current state (why it's being deleted), the exact test
file/method to be removed, and whether any other case's coverage depends on shared fixtures in
that file. Wait for an explicit yes before touching anything — this is a live PR against a
shared repository, not a reversible Allure `Outdated` flag. Deleting a file or test method is a
mutation stop (`verification-protocol.md`): show exactly what is removed first.

### Step 3 — Remove the test

Delete the test method (and the file, if it was the only test in it). Never delete a shared
fixture/helper still used by other tests just because this one no longer needs it.

### Step 4 — Verify

Run the static checks on the touched files (`tsc --noEmit`, eslint, prettier) and paste their output; they catch a shared fixture/import that is still referenced elsewhere. A deletion needs no test run. If the owner wants the neighbouring tests run, follow the Running tests rule in `commands/team/verification-protocol.md`: ask which environment first and run only the named tests.

### Step 5 — Update Allure

Show the user the exact case id and the `Automation Status` value about to be set, and get
explicit confirmation before calling `testops_update_testcase` — per `rules/allure.md` §7 item 3.
Clear the case's `Automation Status` field via
`testops_update_testcase({id, customFields:[{name:"Automation Status", value:"Not Automated"}]})`
(per `rules/allure.md` §3) — or set it to a value that reflects automation was intentionally
removed, with a reason recorded alongside it — never leave it saying `Automated` while the test no
longer exists.

---

## Output

- The obsolete test removed, static checks green; no test run required for a deletion unless the owner asks.
- The case's `Automation Status` field updated to reflect no automation exists.
- A PR containing only the removal (and any now-unused test-only dependency cleanup) — never
  mixed with production changes. Before `git commit`, push or opening the PR, show `git status`,
  `git diff` and the exact commit text and wait for an explicit yes; once confirmed, they run as
  written.
- Text of a ticket comment noting the removal and why, prepared and shown in the chat. Jira and
  Confluence are read-only for this framework; the user posts it.

The commit message and PR title/description this command writes must contain no AI/Claude/Anthropic
self-attribution of any kind — per `base-agent.md`'s "Commit, Comment & Attribution Hygiene." This
command pushes directly into `proj-test-automation`, the one repo whose client requires zero
AI/Claude trace in shared git history — verify the exact commit/PR text before running
`git commit`/opening the PR; never assume a tool default already left it clean.

---

## Constraints

Never delete a test for a case that's still `Approved`/`Active` without one of the three
qualifying reasons in Preconditions. Never delete based on a guessed file/method match. Never
delete a shared fixture still used elsewhere. Never skip the explicit confirmation gate. Never run tests without first asking the owner which environment. Never write to Jira or Confluence. Never
leave the Allure case's `Automation Status` field stale after deletion. Never let a commit message
or PR title/description contain any AI/Claude/Anthropic attribution line — verify before
committing, don't rely on a tool default.

---

## Definition of Done (for this command's own output)

- The qualifying reason for deletion was verified, not assumed
- The user explicitly confirmed the exact file/method before deletion
- The test is removed, static checks on the touched files are green (output pasted), no shared
  fixture was broken, and no test run was required
- The case's `Automation Status` field no longer claims automation that doesn't exist
- The module's `TRACE-MATRIX.md` row for this case now shows it as not automated, with the reason
- The user confirmed the diff and commit text; the PR was prepared on that confirmation; the text of
  a ticket comment is prepared and shown
