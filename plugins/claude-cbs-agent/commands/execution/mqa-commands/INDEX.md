# commands/execution/mqa-commands/ Index

Senior Manual QA Engineer persona (`../../team/manual-qa-agent.md`). Always the pipeline's first step.

| File | Invocation | Read this when you need... |
|---|---|---|
| `mqa-review-story.md` | `/execution:mqa-commands:mqa-review-story <TICKET-KEY>` | Resolve a Jira ticket's full context (Epic/Tasks/Confluence) and write/update `docs/test-cases/<TICKET-KEY>/analysis.md` — Business Flows, Rules, Alt Flows, ACs, gaps, required test types. Runs for every ticket regardless of which test-case path follows. |
| `mqa-create-local-test-case.md` | `/execution:mqa-commands:mqa-create-local-test-case <TICKET-KEY> [types:...]` | The local-only counterpart to `allure-commands/allure-native-create-test-case.md` — design the same traceable suite from a completed `analysis.md`, but persist it as `.xlsx`/`.csv` instead of Allure. Use only when this ticket intentionally skips Allure (offline review, client handoff, no Allure project configured). |

After `mqa-review-story`, the suite takes **one** of `allure-native-create-test-case` or
`mqa-create-local-test-case` — never both for the same ticket (see `../../../rules/allure.md`).
