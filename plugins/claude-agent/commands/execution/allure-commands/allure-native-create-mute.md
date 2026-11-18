@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-create-mute

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: suppress a known-flaky or currently-broken-for-unrelated-
reasons automated test's failures in Allure TestOps, without touching the test case's own
content. A mute is a triage/tracking action, not a fix — it exists so a flaky test doesn't mask
other real failures in a launch while the actual fix is pending.

---

## Mission

Create a mute on exactly one test case, with a stated reason, using the `allure-testops-native`
MCP server (`testops_create_mute`, per `rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-native-create-mute <test-case-id> <reason>
```

`<test-case-id>` is the Allure test case's numeric id (not the mute's own id — that's returned
after creation). `<reason>` is free text (markdown supported) explaining why this test is muted
right now — never a placeholder like "flaky", always specific enough that a future reader knows
whether the mute is still justified (e.g. "Fails intermittently under CI load — tracked in
TB-2201, ETA 2026-08-20").

## Examples

```
/execution:allure-commands:allure-native-create-mute 1985 Intermittent timeout waiting on the payment-hub mock — tracked in TB-2201
```
→ Shows case `1985`'s name/current automation status, confirms with the user, then calls
`testops_create_mute({testCaseId: 1985, name: "Muted per TB-2201", reason: "Intermittent timeout
waiting on the payment-hub mock — tracked in TB-2201"})`.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_testcases(projectId, aql:"id = <test-case-id>")` first — confirm the case exists
  and show its `name`/`automated`/`status` to the user. If it doesn't resolve, say so and stop.
- The stated reason must name a concrete cause or a tracking ticket — if the user gives a vague
  reason ("it's flaky"), ask for the specific cause/ticket before proceeding rather than muting
  blind.

---

## Protocol

### Step 1 — Confirm

Show the user the exact case (id, name) and the exact `testops_create_mute` call (including the
`name`/`reason` fields as they'll be sent) and get explicit confirmation before calling — per
`rules/allure.md` §7 item 3, this is a live, shared Allure project.

### Step 2 — Create the mute

Call `testops_create_mute({testCaseId, name, reason})`. Report the new mute's returned id.

---

## Output

Confirmation that the mute was created, its id, and the test case it applies to. No file is
written.

---

## Constraints

Never mute a case without a concrete, specific reason (a vague "flaky" is not sufficient — ask
for the real cause or a tracking ticket). Never mute more than one case per invocation. Never
create a mute without explicit user confirmation naming the case by id and name. Never print the
API token.

---

## Definition of Done (for this command's own output)

- The exact case (by id) was shown before muting, not muted blind
- The reason recorded is specific (a cause or a tracking ticket), not a vague placeholder
- The user explicitly confirmed before the mute was created
- The new mute's id was reported back to the user
