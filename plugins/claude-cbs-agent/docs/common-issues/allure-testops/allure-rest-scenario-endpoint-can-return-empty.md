# Allure REST `/testcase/{id}/scenario` can return an empty step tree even when real Steps/ER exist

## The pattern/symptom

A direct REST call to `GET /api/testcase/{id}/scenario` returns `{"steps":[]}` for a case that
*does* have real, human-written Steps/Expected Result content in Allure's UI — nothing looks wrong
(no error, valid JSON, just an empty array), so it reads as "this case genuinely has no steps
recorded, only a title/precondition" when that's false.

## The rule

Never conclude a case has no Steps/Expected Result from an empty `/scenario` response alone.
Two working paths exist, in preference order:

1. **Preferred**: `allure-testops-native`'s `testops_find_testcases(projectId, aql:"id = <id>",
   expand:["scenario", ...])` MCP tool — its `scenario.steps[]` reads the tree correctly in one
   call (confirmed live, `rules/allure.md` §3a). This is the officially documented path every
   `allure-commands/allure-*.md` command already uses — reach for it first, not raw REST.
2. **Fallback, raw REST only**: if the MCP server is unreachable and you're using `curl`/direct
   REST as a workaround, `GET /api/testcase/{id}/scenario` returning `{"steps":[]}` is **not**
   authoritative — retry via `GET /api/testcase/{id}/step` (the older, denormalized
   `root`+`scenarioSteps` map shape), which frequently *does* carry the real content the `scenario`
   endpoint missed. `allure_get_test_case` (the read-only third-party `allure-testops` MCP, §8 of
   `rules/allure.md`) already implements this exact fallback internally — a further reason to
   prefer a real tool over hand-rolled REST calls when one is available.

**Predict**: any automation session that fetches Allure case content via raw REST instead of the
documented `allure-testops-native` MCP tool is at risk of silently working from title+precondition
only, believing that's the case's full content. If a case's title strongly implies specific
Step/ER content ("X is rejected because Y") but the fetched content is empty or generic, that is a
signal to check the fallback path before writing an automated test from title alone.

## The incident

2026-09-02, Currency Definition and Logic module (`TB-3468`/`US-01.13.02`/`US-01.13.03`): 15 new
Allure cases (ids 3427-3441) were fetched via raw `curl` to `GET /testcase/{id}/scenario` (the
native `allure-testops-native` MCP server was unreachable at the time; the REST fallback is `curl` with the API token taken from the plugin's `.mcp.json`, and `rql`/`aql`/`name` query parameters do not filter) — all 15 returned `{"steps":[]}`,
read as "these cases only have a title/precondition, no real Steps/ER," and 15 tests were written
from that assumption. The user, reviewing one case (3440) in the Allure UI directly, could see it
clearly had real Steps/ER and asked to double-check. Falling back to `GET /testcase/{id}/step`
(and later cross-verified via the proper `testops_find_testcases(expand:["scenario"])` MCP call
once that server reconnected) surfaced real, specific Expected Result text for **all 15 cases**
that materially changed several already-written test assertions — exact error messages (`"Currencies
not found: [XXX]"` vs. an inferred generic message), a wrong assumed HTTP status (`404` vs. an
inferred `400`), a missing verification step (case 3441's ER required confirming the post-daemon
`CURRENCY.RATES` row, not just that `INPUT` succeeded), and one genuine Allure-authoring defect
(case 3427's stored Step/ER is verbatim copy-paste from an unrelated case, contradicting its own
title). See the Currency Definition and Logic audit (`docs/module-theory/Currency Definition and Logic/INDEX.md`) and this module's
`US-01.13.02/README.md`/`US-01.13.03/README.md` "Automation status" sections for the full per-case
detail.
