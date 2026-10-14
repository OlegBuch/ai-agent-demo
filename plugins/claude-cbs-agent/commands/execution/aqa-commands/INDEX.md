# commands/execution/aqa-commands/ Index

Senior Full Stack AQA Engineer persona (`../../team/fullstack-aqa-agent.md`) turning approved
Allure cases into automation and keeping automation in sync.

| File | Invocation | Read this when you need... |
|---|---|---|
| `aqa-automate.md` | `/execution:aqa-commands:aqa-automate <allure-case-id>`, `tag:<TICKET-KEY>`, `module:<name>` or `story:<name>` (also: a case pasted inline in the chat, no slash syntax) | Automate one (or every tagged / module- / story-matched, not-yet-automated, `Approved`) Allure case into real test code. |
| `aqa-review-test.md` | `/execution:aqa-commands:aqa-review-test <allure-case-id>` or `tag:<TICKET-KEY>` | Read-only: does the existing automation still prove what the case says and match the real API contract? |
| `aqa-update-test.md` | `/execution:aqa-commands:aqa-update-test <allure-case-id>` or `tag:<TICKET-KEY>` | Patch existing automation back in sync after its Allure case changed. |
| `aqa-delete-test.md` | `/execution:aqa-commands:aqa-delete-test <allure-case-id>` | Remove automation whose Allure case was deprecated/deleted — code-side cleanup, always with confirmation. |

GitLab merge-request review (`review-cosmetic-pr` / `review-logical-pr` / `review-pr-orchestrator`)
moved out to its own `../review-pr-commands/` package — see that folder's `INDEX.md`. It is no
longer part of this folder.
