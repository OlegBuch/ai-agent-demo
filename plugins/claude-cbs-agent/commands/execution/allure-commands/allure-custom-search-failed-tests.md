# /execution:allure-commands:allure-custom-search-failed-tests

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: find failed/broken tests in the most recent launch for a
project, via `allure-testops-custom`'s direct REST call.

---

## Mission

Given a project, surface every failed and broken test result in its most recent launch, as a
quick "what's currently broken" check.

---

## Argument Format

```
/execution:allure-commands:allure-custom-search-failed-tests [size:<n>]
```

`size:` defaults to 50 per status if omitted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_search_failed_tests(project_id, size=<size or 50>)`.

### Step 2 — No launches exist

If `launch_id` comes back `null` (no launches for this project), say so plainly rather than
reporting an empty failed/broken list as if a launch was actually checked.

### Step 3 — Render

Two tables, `Failed` and `Broken`, each `id | name | duration | message`, plus the launch id they
came from.

---

## Output

Two rendered tables (or an explicit "no launches exist" message) in chat. No file is written.

---

## Constraints

Never mutate anything. Never invent a result not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The report quotes the call's response (id/count) or states plainly that the call failed for both the Failed and Broken sets
- A "no launches" case is reported explicitly, never silently shown as "0 failed, 0 broken"
