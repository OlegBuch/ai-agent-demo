@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-create-shared-step

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to extract a sequence of steps that's repeated across multiple test
cases into one reusable Shared Step in Allure TestOps — updating a shared step automatically
updates every test case that references it, so this is the tool for genuine repetition, not a
place to park a one-off sequence that happens to look reusable.

---

## Mission

Create one Shared Step in Allure TestOps from a named, reusable step sequence, using the
`allure-testops-native` MCP server (`testops_create_sharedstep`, per `rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-native-create-shared-step <name>
```

`<name>` is the shared step's own name (e.g. "Log in as a Teller with valid credentials"). The
step content itself is gathered interactively in Step 1 of the Protocol below, not passed as a
command argument — a step sequence is too structured to fit on one line.

## Examples

```
/execution:allure-commands:allure-native-create-shared-step Authenticate as System Administrator
```
→ Asks for the concrete steps (and any per-step expected results), shows the assembled scenario
for confirmation, then creates it and reports the new shared step's id — ready to be referenced
from any test case's `scenario.steps[]` via a `{"type":"shared","sharedStepId":<id>}` entry.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2.
- Before creating, check whether an existing shared step with the same or near-identical purpose
  already exists — `testops_find_sharedsteps(projectId, aql:"name = \"<name>\"")` — if a name
  match or an obviously-equivalent existing shared step is found, point to it instead of creating
  a duplicate (use `allure-native-update-shared-step` if it needs changing).

---

## Protocol

### Step 1 — Gather the step sequence

Ask for (or derive from the test case(s) currently duplicating this sequence) the ordered list of
steps, each as a `{"type":"body","body":"..."}` step, with any inline expected results as
`{"type":"expected_body","body":"..."}` entries under `expectedResultSteps` on the relevant step.
This is the same scenario step shape a regular test case uses (`rules/allure.md` §3a), except a
shared step's own scenario may only contain `body`/`attachment` steps — it cannot reference
another shared step inside itself.

### Step 2 — Confirm, then create

Show the user the assembled `name` + `scenario` and get explicit confirmation (per
`rules/allure.md` §7 item 3) before calling
`testops_create_sharedstep({projectId, name, scenario: {steps: [...]}})`. Report the new shared
step's id.

### Step 3 — Verify

`testops_find_sharedsteps(projectId, aql:"id = <new id>", expand:["scenario"])` and confirm the
returned scenario matches what was sent.

---

## Output

The new shared step's id and name. No file is written — this lives entirely in Allure.

---

## Constraints

Never create a shared step without first checking for an existing equivalent
(`testops_find_sharedsteps`). Never create a shared step without explicit user confirmation of
its full content. Never nest a `shared`-type step inside a shared step's own scenario (not
supported by this tool). Never print the API token.

---

## Definition of Done (for this command's own output)

- An existing-equivalent check was run before creating
- The user confirmed the full step sequence before creation
- The new shared step's id/name was reported and verified by re-fetch
