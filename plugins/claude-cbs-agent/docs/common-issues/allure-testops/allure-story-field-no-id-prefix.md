# Allure TestOps `Story` custom field holds the bare title, not `US-XX.YY.ZZ | <title>`

**The pattern/symptom.** This repo's own convention names a Story `US-XX.YY.ZZ | <title>` (Jira/
Confluence page titles, `docs/module-theory/<Module>/US-XX.YY.ZZ/` folder names). It's tempting to
assume the Allure TestOps test case's `Story` custom field carries that same `US-XX.YY.ZZ | `
prefix, and filter/search for it that way. It doesn't. A `testops_find_testcases` (or REST
`/api/testcase`) query for a Story value that includes the id prefix returns **zero matches even
when matching cases exist** — not an error, just a silent empty result, which reads as "no cases
exist yet" and can send you chasing a wrong conclusion (escalating a false "Manual QA hasn't
created these yet" instead of just fixing the query).

**The rule.** Always confirm the *actual* stored `Story` value on at least one known case first —
`testops_find_testcases({projectId, aql: "id = <a-known-id>", expand: ["custom_fields"]})` — before
filtering a search by Story name. Since direct AQL predicates on custom fields fail outright on
this instance (`story = "..."` / `story ~= "..."` → `Tool execution failed: null`, a separate,
already-documented dead end in `rules/allure.md` §3), the only reliable path is: page through the
project with `expand: ["custom_fields"]` and filter client-side on the exact `customFields[].name`
string where `customField === "Story"` — and that string is the bare title only, e.g.
`"Asynchronous Rate Order Staging, Validation, and Scheduling"`, never `"US-01.13.02 | Asynchronous
Rate Order Staging, Validation, and Scheduling"`.

**The incident(s).** 2026-08-26, TB-1989/US-01.13.03 (Currency Definition and Logic): searching for
Story `"US-01.13.03 | Dynamic High-TPS Execution & Hierarchical Rate Resolution"` across all
project-2 pages found nothing. Checking a known US-01.13.02 case (id 3109, already linked via
`allureCaseId(3109)` in `currency-regression.spec.ts` the day before) showed its real `Story` value
is `"Asynchronous Rate Order Staging, Validation, and Scheduling"` — no id prefix at all. Re-running
the scan for the bare title `"Dynamic High-TPS Execution & Hierarchical Rate Resolution"` found 12
cases. Separately confirmed on the same pass: this project's case count was growing live during the
scan (`totalElements` 2769→2772) — Manual QA was actively creating new US-01.13.03 cases while the
scan ran, so a "found nothing" or "found N" result from any one scan is a snapshot, not necessarily
the final set; re-scan before treating a zero/low count as final. Full mapping and context:
`docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md`'s "Allure TestOps linking"
section.
