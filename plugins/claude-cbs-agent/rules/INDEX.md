# rules/ Index

Process rules for Jira, Confluence, and Allure TestOps work. The framework works with
Jira/Confluence read-only; `jira.md`/`confluence.md` describe the format of the text a role
prepares and a human publishes. Read the relevant file before analysing or drafting anything for
those systems, or before touching Allure — don't guess the format from memory.

| File | Read this when you need... |
|---|---|
| `confluence.md` | Space structure, page naming, required metadata block, ADR/FR page templates, pre-draft checklist. Read before analysing a Confluence page or preparing a page draft for a human to publish. |
| `jira.md` | Issue hierarchy (Epic→Story→Task), naming formats, required fields, story point scale, labels, linking rules. Read before analysing a Jira issue or preparing an Epic/Story draft for a human to create. |
| `allure.md` | Allure TestOps MCP integration: the `allure-testops-native` tool reference (§3), token sourcing (`ALLURE_TOKEN` env var, expanded into `.mcp.json`), column→field mapping, ticket-tag convention, native versioning, (§8) the self-owned `allure-testops-custom` MCP server for group search/launches/results/statistics/metadata, and (§9) the `playwright` MCP's boundary as a visual-inspection-only tool, never a third data path. Read before ANY `execution/allure-commands/allure-*.md` or `execution/aqa-commands/aqa-*.md` command runs. For what each field should actually *contain* (not just which MCP param carries it), see `docs/allure-test-case-design-standard.md` instead. |
| `definition-of-ready.md` | Checklist a Story must satisfy before entering a sprint. Validate every new Story against this. |
| `definition-of-done.md` | Checklist a Story must satisfy before moving to Done — implementation, tests, security, API, docs, review. |

`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md` and `commands/execution/mqa-commands/`/`allure-commands/`
draw on `jira.md`, `confluence.md`, and `allure.md` together for requirement analysis and test
case work; `definition-of-ready.md`/`definition-of-done.md` gate Story drafting/closure for
whichever persona is acting on a Story at the time.
