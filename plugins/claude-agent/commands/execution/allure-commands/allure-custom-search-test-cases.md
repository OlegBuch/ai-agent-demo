# /execution:allure-commands:allure-custom-search-test-cases

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: find every test case matching a Feature/Component/Story/
Suite/tag/status/automation-status combination, using the `allure-testops-custom` MCP server's
in-memory per-session index — never a full-project client-side scan. You never write to Allure
from this command.

This is the command that replaces `allure-native-list-test-cases.md`'s old, retired
`feature:`/`suite:`/`story:` filters (`allure-testops-native` has no server-side custom-field
predicate — see `rules/allure.md` §8).

---

## Mission

Given any combination of Feature/Component/Story/Suite/tag/status/automated filters, return every
matching test case as a compact summary (id/name/status/layer/tags/customFields) — never full
scenario/description content, which stays a separate, explicit `allure-native-get-test-case` call
per matched id.

---

## Argument Format

```
/execution:allure-commands:allure-custom-search-test-cases feature:<name>
/execution:allure-commands:allure-custom-search-test-cases component:<name>
/execution:allure-commands:allure-custom-search-test-cases story:<name>
/execution:allure-commands:allure-custom-search-test-cases suite:<name>
/execution:allure-commands:allure-custom-search-test-cases tag:<name>
/execution:allure-commands:allure-custom-search-test-cases status:<Draft|Review|Active|Outdated>
/execution:allure-commands:allure-custom-search-test-cases automated:<true|false>
```

Filters combine (AND semantics) — e.g. `feature:"System Core" component:Idempotency tag:Regression`.
At least one filter is required; if none is given, ask which filter was meant rather than
returning the entire project.

## Examples

```
/execution:allure-commands:allure-custom-search-test-cases feature:"System Core" component:"Idempotency & Duplicate Prevention"
```
→ Every case under that Feature/Component pair, rendered as a compact table.

```
/execution:allure-commands:allure-custom-search-test-cases story:"US-01.12.03 | Functional Duplicate Detection (ERROR + OVERRIDE)"
```
→ Every case for that exact Story value.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session (confirm via a tool
  listing if unsure) — if it isn't, say so and stop rather than falling back to a slow
  full-project native scan.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the search tool

Call `allure_search_test_cases(project_id, feature=?, component=?, story=?, suite=?, tag=?,
status=?, automated=?)` with exactly the filters given as arguments — omit any not provided
(never pass an empty string as a "no filter" signal).

### Step 2 — Zero matches

If `count` is `0`, call `allure_list_field_values(project_id, field="Feature")` (or whichever
field was actually filtered on) and show the closest existing values, so the user can tell if the
filter name was a near-miss (casing/typo) rather than a genuine "nothing exists" result — never
report zero silently.

### Step 3 — Render

A table: `id | name | status | layer | tags`. State the total count and the exact filters applied.

---

## Output

A rendered table (and total count) in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything — this command has no access to any mutating tool. Never guess a
Feature/Component/Story/Suite value when zero results come back — use
`allure_list_field_values` to check for a near-miss first. Never fetch full case detail here —
that's `allure-native-get-test-case`'s job, one id at a time.

---

## Definition of Done (for this command's own output)

- Every filter given was actually passed to `allure_search_test_cases`, none silently dropped
- The report quotes the call's response (id/count) or states plainly that the call failed
- A zero-result search checked `allure_list_field_values` before being reported as empty
- No mutating call was made
