# /execution:allure-commands:allure-native-list-test-cases

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: list test cases from Allure TestOps, optionally filtered,
as a coverage/overview aid. You never write to Allure from this command.

This command is project-agnostic in method: it resolves project/field IDs live per
`rules/allure.md` §2, never assuming a numeric ID from a previous session.

---

## Mission

Answer "what test cases exist" and "what test cases exist for X" (X = a ticket or a status)
without requiring the caller to know Allure's internal tree/id structure — for X = a Feature/
Component/Story/Suite, see `allure-custom-search-test-cases` instead.

---

## Argument Format

```
/execution:allure-commands:allure-native-list-test-cases
/execution:allure-commands:allure-native-list-test-cases status:<Draft|Review|Active|Outdated>
/execution:allure-commands:allure-native-list-test-cases ticket:<TICKET-KEY>
```

Filters may combine (e.g. `status:Draft ticket:TB-1306`). No filters means "every test case
in the project" — warn if the result is large (this project currently has ~1915) rather than
silently truncating; page through and report the true total, per Allure's own pagination.

## Examples

```
/execution:allure-commands:allure-native-list-test-cases
```
→ No filter — pages through the entire project (warns since ~1915 cases exist) and reports the
true total, not just page 1.

```
/execution:allure-commands:allure-native-list-test-cases ticket:TB-1306
```
→ Every case tagged `TB-1306`, rendered as `id | name | Feature | Story | status | tags` — the
form used most often to check what already exists before `allure-native-create-test-case`/
`aqa-automate`.

For Feature/Component/Story/Suite group search, use
`/execution:allure-commands:allure-custom-search-test-cases` instead — this command only handles
what `allure-testops-native`'s own AQL can filter server-side (`tag:`/`status:`/`ticket:`).

---

## Preconditions

- The MCP server is configured per `.mcp.json` (token stored there, never printed directly).
  Confirm `projectId` per `rules/allure.md` §2.

---

## Protocol

### Step 1 — Resolve filter to an MCP call

- No filter: `testops_find_testcases(projectId, expand:["custom_fields","tags","status"])`,
  paging through every page (`page`/`size`) rather than reporting only page 1 as if it were
  everything.
- `status:<name>`: `testops_find_testcases(projectId, aql:"status = \"<name>\"",
  expand:["custom_fields","tags"])` — confirmed AQL-filterable directly (`rules/allure.md` §3).
- `ticket:<TICKET-KEY>`: `testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"",
  expand:["custom_fields","tags","status"])` — confirmed AQL-filterable directly.
- Filters may combine: apply any AQL-capable filters (`status:`/`ticket:`) as one `aql` expression
  joined with `and`.

### Step 2 — Render

A table: `id | name | Feature | Story | status | tags`. State the total count and, if filtered,
what the filter was. Never invent a count — state exactly what the API returned, including if
it's `0`.

---

## Output

A rendered table (and total count) in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything — no mutating MCP tool calls in this command, ever. Never silently
cap or truncate a large result set without saying so explicitly — page through and report the
true total. Never print the API token.

---

## Definition of Done (for this command's own output)

- Every requested filter was actually applied against Allure, not approximated
- The report quotes the call's response (count, ids) — paged through fully, not just page 1 — or states plainly that the call failed
- An empty result is reported as empty, not silently omitted or mistaken for an error
- No mutating API call was made
