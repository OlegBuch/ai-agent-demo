# /execution:allure-commands:allure-custom-list-field-values

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: list every distinct value currently used for one custom field
(Feature/Component/Story/Suite) in the project, via `allure-testops-custom`'s in-memory index.
Use this before creating a new value with `allure-native-create-test-case`/
`allure-native-update-test-case`, to catch a near-duplicate (`rules/allure.md` §7 item 4).

---

## Mission

Given a field name, return every distinct value currently assigned to it across the project, so a
new value isn't created next to an existing near-duplicate (`"Login"` vs `"login"` vs `"Log In"`).

---

## Argument Format

```
/execution:allure-commands:allure-custom-list-field-values field:<Feature|Component|Story|Suite>
```

## Examples

```
/execution:allure-commands:allure-custom-list-field-values field:Component
```
→ Every distinct Component value currently used in the project, sorted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_list_field_values(project_id, field=<field>)`.

### Step 2 — Render

A plain sorted list of values, with the total count. If the list is long (>30), still show all of
it — this command exists specifically to catch near-duplicates, and truncating defeats that.

---

## Output

A rendered list in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a value not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The exact requested field's values are shown, not truncated; the report quotes the call's response (id/count) or states plainly that the call failed
- No mutating call was made
