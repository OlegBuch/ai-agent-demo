# commands/execution/allure-commands/ Index

Commands that drive Allure TestOps, grouped by the persona that runs them. The `allure-native-*`
test-case, shared-step and mute commands are run by the Senior Manual QA Engineer
(`../../team/manual-qa-agent.md`) — the default (non-local) test-case path, following
`mqa-commands/mqa-review-story.md` — through `allure-testops-native`. The `allure-custom-*`
group-search, launch/results/statistics and metadata commands run through the self-owned
`allure-testops-custom` server (`rules/allure.md` §8); each file's own `Role` names its persona
(Manual QA for `search-test-cases`/`list-field-values`/`refresh-index`, the AQA Lead
(`../../team/aqa-lead-agent.md`) for the launch/results/statistics/metadata ones).
`allure-review-report` is run by the Senior Full Stack AQA Engineer
(`../../team/fullstack-aqa-agent.md`).

| File | Invocation | Read this when you need... |
|---|---|---|
| `allure-native-create-test-case.md` | `/execution:allure-commands:allure-native-create-test-case <TICKET-KEY> [types:...]` | Design and create the full test case suite in Allure TestOps from a completed `analysis.md`. |
| `allure-native-update-test-case.md` | `/execution:allure-commands:allure-native-update-test-case <TICKET-KEY> [types:+/-...]` | Reconcile existing Allure cases after the ticket/AC/Confluence changed — patch in place, mark `Outdated`, never delete for a requirement change. |
| `allure-native-get-test-case.md` | `/execution:allure-commands:allure-native-get-test-case <id>` or `tag:<TICKET-KEY>` | Fetch and render one Allure test case using the column set defined in `manual-qa-agent.md`. Read-only. |
| `allure-native-list-test-cases.md` | `/execution:allure-commands:allure-native-list-test-cases [status:\|ticket:...]` | List/filter Allure test cases as a coverage overview. Read-only. |
| `allure-native-delete-test-case.md` | `/execution:allure-commands:allure-native-delete-test-case <id>` | Remove a genuinely mistaken/duplicate Allure case (soft-delete) — never for a requirement change, that's `allure-native-update-test-case`'s `Outdated` path. |
| `allure-native-create-shared-step.md` | `/execution:allure-commands:allure-native-create-shared-step <name>` | Extract a repeated step sequence into a reusable Shared Step. |
| `allure-native-update-shared-step.md` | `/execution:allure-commands:allure-native-update-shared-step <shared-step-id>` | Reconcile an existing Shared Step's content — propagates to every referencing test case. |
| `allure-native-find-shared-steps.md` | `/execution:allure-commands:allure-native-find-shared-steps [name:...]` | Check for an existing Shared Step before creating a near-duplicate. Read-only. |
| `allure-native-create-mute.md` | `/execution:allure-commands:allure-native-create-mute <test-case-id> <reason>` | Suppress a known-flaky/broken-for-unrelated-reasons automated test's failures, with a stated reason. |
| `allure-native-delete-mute.md` | `/execution:allure-commands:allure-native-delete-mute <mute-id>` | Remove a mute once its cause is fixed or no longer justified. |
| `allure-custom-search-test-cases.md` | `/execution:allure-commands:allure-custom-search-test-cases feature:\|component:\|story:\|suite:\|tag:\|status:\|automated:<value>` | Find cases by Feature/Component/Story/Suite/tag/status/automated via the in-memory index — compact summary, no scenario content. Read-only. |
| `allure-custom-list-field-values.md` | `/execution:allure-commands:allure-custom-list-field-values field:<Feature\|Component\|Story\|Suite>` | List every distinct value of one custom field, to catch a near-duplicate before creating a new one. Read-only. |
| `allure-custom-refresh-index.md` | `/execution:allure-commands:allure-custom-refresh-index` | Rebuild the in-memory index after cases changed mid-session. |
| `allure-custom-list-launches.md` | `/execution:allure-commands:allure-custom-list-launches [size:<n>]` | Recent launches, newest first, with pass/fail counts. Read-only. |
| `allure-custom-get-test-results.md` | `/execution:allure-commands:allure-custom-get-test-results <launch-id> [status:<...>]` | Test results of one launch, optionally filtered by status. Read-only. |
| `allure-custom-search-failed-tests.md` | `/execution:allure-commands:allure-custom-search-failed-tests [size:<n>]` | Failed and broken results of the most recent launch. Read-only. |
| `allure-custom-get-project-statistics.md` | `/execution:allure-commands:allure-custom-get-project-statistics` | Total/automated counts, automation rate, last closed launch breakdown. Read-only. |
| `allure-custom-project-metadata.md` | `/execution:allure-commands:allure-custom-project-metadata what:<projects\|categories\|category-matchers\|layers\|statuses>` | Project metadata lookups. Read-only. |
| `allure-review-report.md` | `/execution:allure-commands:allure-review-report <path> [focus:...]` | Senior Full Stack AQA Engineer command: visually review the **rendered** local Allure HTML report via the `playwright` MCP (tabs, step tree, request/response attachments), report usability/structure/architecture findings, and implement a fix in `proj-test-automation` when explicitly asked. Backed by neither `allure-testops-native` nor `-custom` — see `rules/allure.md` §9. Read-only against Allure TestOps unless a mutating call is separately confirmed. |

`aqa-commands/aqa-automate.md` consumes the test-case commands next (by Allure case ID, `tag:`,
`module:`/`story:`, or an inline-pasted case — see its own file).
