# /execution:allure-commands:allure-custom-list-launches

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: list recent Allure TestOps launches for a project, newest
first, via `allure-testops-custom`'s direct REST call (no `allure-testops-native` equivalent
exists for launch-level data — `rules/allure.md` §3).

---

## Mission

Given a project, return its recent launches (id, name, status, created date, pass/fail/broken/
skipped counts) as a release-readiness overview.

---

## Argument Format

```
/execution:allure-commands:allure-custom-list-launches [size:<n>]
```

`size:` defaults to 20 if omitted.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.
- Resolve `project_id` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_list_launches(project_id, size=<size or 20>)`.

### Step 2 — Render

A table: `id | name | status | createdDate | passed | failed | broken | skipped`, newest first.

---

## Output

A rendered table in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a launch not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The launches are listed in the order returned; the report quotes the call's response (id/count) or states plainly that the call failed
