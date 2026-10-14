# /execution:allure-commands:allure-custom-refresh-index

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: force `allure-testops-custom`'s in-memory per-project index to
rebuild, for the rare case where test cases changed mid-session (created/updated/deleted via
`allure-native-*` commands) and a subsequent `allure-custom-search-test-cases`/
`allure-custom-list-field-values` call needs to see that change immediately, rather than the
stale cached view from earlier in the session.

---

## Mission

Given a project, drop and rebuild its lightweight search index.

---

## Argument Format

```
/execution:allure-commands:allure-custom-refresh-index
```

Uses the project id already resolved this session (`rules/allure.md` §2) — no argument needed
beyond that.

---

## Preconditions

- The `allure-testops-custom` MCP server must be connected this session.

---

## Protocol

### Step 1 — Call the tool

Call `allure_refresh_index(project_id)`.

### Step 2 — Confirm

State that the index was refreshed for this project — no further rendering needed.

---

## Output

A one-line confirmation in chat. No file is written.

---

## Constraints

Never call this reflexively before every search — it re-fetches the whole project's lightweight
index, which is the exact cost `allure-custom-search-test-cases` exists to avoid paying per
query. Use it only when you know cases actually changed mid-session.

---

## Definition of Done (for this command's own output)

- The refresh was actually performed for the correct project id, not assumed; the report quotes the call's response (id/count) or states plainly that the call failed
