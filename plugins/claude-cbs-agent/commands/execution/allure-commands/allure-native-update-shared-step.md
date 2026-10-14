@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-update-shared-step

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to reconcile an existing Shared Step's content when the sequence it
represents changes — every test case referencing it picks up the change automatically, so a
mistake here has a wider blast radius than editing one test case.

---

## Mission

Update one Shared Step's `name`/`scenario` in place, using the `allure-testops-native` MCP server
(`testops_update_sharedstep`, per `rules/allure.md` §3), following the same read-modify-write
pattern as test case scenario edits (`rules/allure.md` §3a — no single-step tool exists for
shared steps either).

---

## Argument Format

```
/execution:allure-commands:allure-native-update-shared-step <shared-step-id>
```

---

## Examples

```
/execution:allure-commands:allure-native-update-shared-step 17
```
→ Fetches shared step `17`'s current scenario, asks what changed, shows the full revised scenario
for confirmation, then updates it — every test case referencing shared step `17` now shows the new
content on next view.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_sharedsteps(projectId, aql:"id = <shared-step-id>", expand:["scenario"])` first —
  confirm it exists and show its current content. If it doesn't resolve, say so and stop.
- Before proceeding, tell the user how many/which test cases reference this shared step if that's
  discoverable (there is no direct "find test cases using shared step X" MCP tool — if asked,
  note this is not currently answerable via MCP and would need a manual check in the Allure UI),
  so the blast radius of the change is not a surprise.

---

## Protocol

### Step 1 — Read-modify-write the scenario

Take the current `scenario.steps[]` from the Preconditions fetch, apply the requested edit in
memory (same mechanics as `rules/allure.md` §3a for test cases — the array sent must be the
complete, current tree, not just the changed step).

### Step 2 — Confirm, then update

Show the user the full before/after scenario diff and get explicit confirmation (per
`rules/allure.md` §7 item 3) before calling
`testops_update_sharedstep({id, name, scenario: {steps: [...]}})`.

### Step 3 — Verify

Re-fetch and confirm the change landed and nothing else in the scenario moved/dropped.

---

## Output

Confirmation that the shared step was updated, with a before/after summary. No file is written.

---

## Constraints

Never update a shared step without showing the full before/after diff and getting explicit
confirmation. Never send a partial scenario array (always the complete, current tree). Never
print the API token.

---

## Definition of Done (for this command's own output)

- The current scenario was fetched and shown before any edit
- The user confirmed the full before/after diff
- A re-fetch confirmed the update landed correctly and completely
