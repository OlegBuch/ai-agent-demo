# /execution:allure-commands:allure-custom-project-metadata

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: look up one kind of Allure TestOps project metadata
(projects/categories/category matchers/layers/statuses), via `allure-testops-custom`'s direct
REST calls. One combined command instead of five near-identical ones, since each is a single,
simple lookup with no distinct workflow.

---

## Mission

Given a `what:` argument, call the matching metadata tool and render its result.

---

## Argument Format

```
/execution:allure-commands:allure-custom-project-metadata what:projects
/execution:allure-commands:allure-custom-project-metadata what:categories
/execution:allure-commands:allure-custom-project-metadata what:category-matchers
/execution:allure-commands:allure-custom-project-metadata what:layers
/execution:allure-commands:allure-custom-project-metadata what:statuses
```

`what:projects` needs no project id (it lists every project in the instance). The other four use
the project id already resolved this session (`rules/allure.md` §2).

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Resolve `what:` to a tool call

- `what:projects` → `allure_list_projects()`
- `what:categories` → `allure_list_categories(project_id)`
- `what:category-matchers` → `allure_list_category_matchers(project_id)`
- `what:layers` → `allure_list_layers(project_id)`
- `what:statuses` → `allure_list_statuses(project_id)`

If `what:` is missing or doesn't match one of these five, list the five valid values and ask
rather than guessing.

### Step 2 — Render

A table of whatever the tool returned (fields vary by kind — `id`/`name` at minimum for every
kind, plus `color`/`description` for categories, `messageRegex`/`traceRegex`/`category` for
category matchers).

---

## Output

A rendered table in chat. No file is written — this command is read-only.

---

## Constraints

Never mutate anything. Never invent a row not actually returned by the tool.

---

## Definition of Done (for this command's own output)

- The correct tool was called for the given `what:` value
- The report quotes the call's response (id/count) or states plainly that the call failed for the rendered rows
