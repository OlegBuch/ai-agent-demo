# /execution:allure-commands:allure-custom-get-project-statistics

## Role

You are the Senior QA Test Automation Lead Engineer
(`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`).

Your responsibility here is narrow: report a project's automation rate, total/automated test-case
counts, and the last closed launch's pass/fail breakdown, via `allure-testops-custom`'s direct
REST calls — the data source for the "Release Readiness Checklist."

---

## Mission

Given a project, return its total test-case count, automated count (and rate), and the last
closed launch's status breakdown.

---

## Argument Format

```
/execution:allure-commands:allure-custom-get-project-statistics
```

Uses the project id already resolved this session (`rules/allure.md` §2).

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_get_project_statistics(project_id)`.

### Step 2 — Render

State: total test cases, automated test cases, automation rate (`automated / total`, computed
here — the tool itself doesn't compute a ratio), the last closed launch id (or "no closed launch
found" if `null`), and its pass/fail/broken/skipped breakdown as a short table.

---

## Output

A short summary plus a breakdown table in chat. No file is written.

---

## Constraints

Never mutate anything. Compute the automation rate from the two counts the tool returns — never
invent a rate the tool didn't provide the inputs for.

---

## Definition of Done (for this command's own output)

- The report quotes the call's response (id/count) or states plainly that the call failed (total/automated counts, launch id)
- The automation rate is correctly computed from those two counts (automated/total, as a
  percentage), not fabricated
