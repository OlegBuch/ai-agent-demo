# /execution:allure-commands:allure-native-get-test-case

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: fetch exactly one test case from Allure TestOps and present
it in the same mental model as the Excel pipeline's "Required Test Case Table Format"
(`manual-qa-agent.md`) so it reads the same way regardless of which backend it came from. You
never write to Allure from this command — that's `allure-native-create-test-case`/`allure-native-update-test-case`.

This command is project-agnostic in method: it resolves project/field IDs live per
`rules/allure.md` §2, never assuming a numeric ID from a previous session.

---

## Mission

Given an ID or a `<TICKET-KEY>` tag, retrieve the full test case record from Allure TestOps and
render it readably, with every field mapped per `rules/allure.md` §4.

---

## Argument Format

```
/execution:allure-commands:allure-native-get-test-case <id>
/execution:allure-commands:allure-native-get-test-case tag:<TICKET-KEY>
```

- A bare numeric argument is treated as the Allure test case `id`.
- `tag:<value>` searches by tag instead (e.g. `tag:TB-1306` to find every case for a ticket, or
  `tag:TC-20` if that's how the case is otherwise identified) — if more than one case matches,
  list all matches' `id`/`name` and ask which one, rather than guessing.

## Examples

```
/execution:allure-commands:allure-native-get-test-case 245
```
→ Fetches case `245` directly, renders every field of the Step 3 record (marking any empty ones
`— not set —`), including steps from the MCP tool response.

```
/execution:allure-commands:allure-native-get-test-case tag:TB-1306
```
→ Multiple cases carry the `TB-1306` tag. Lists every match's `id`/`name` and asks which one to
render in full, rather than guessing which case was meant.

```
/execution:allure-commands:allure-native-get-test-case tag:TC-20
```
→ Exactly one case matches the legacy `TC-20` identifier tag. Renders it directly; if it's a
legacy-imported case with everything crammed into `description`, prints that raw description as
an extra line instead of showing misleadingly empty Preconditions/Steps/Expected Results fields.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it (`rules/allure.md` §1/§7).
  Confirm `projectId` per `rules/allure.md` §2 if not already known this session.

---

## Protocol

### Step 1 — Resolve the target

- Bare ID: skip to Step 2 with that `id`.
- `tag:<value>`: `testops_find_testcases(projectId, aql:"tag = \"<value>\"")` (per `rules/allure.md`
  §3's confirmed-working AQL). If zero matches, say so plainly — do not fall back to a fuzzy
  guess. If more than one matches, list every match's `id`/`name` and ask which one.

### Step 2 — Fetch full detail

`testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags","custom_fields",
"status","layer"])` — a single call returns the core record, tags, custom fields (Feature/
Component/Story/Suite), and the full step tree together. Read the step tree straight off the
returned `scenario.steps[]` array (flat, with nested `steps`/`expectedResultSteps` for grouped/
multi-part steps) — see `rules/allure.md` §3a. There is no separate deprecated-endpoint pitfall
to avoid anymore; this is the only read path.

### Step 3 — Render

Present the case with the columns defined once in `manual-qa-agent.md`'s "Required Test Case
Table Format" (12 columns — never restate or reorder them here), one field per line (not a
cramped table) since this is a single-record view, followed by the Allure-only extras:

```
No.:                <Allure id / test key>
Story:               <Story custom field value, or "— not set —">
Test level:          <tag matching component/integration, or "— not set —">
Test type:           <tags matching API/UI/etc., or "— not set —">
Short Description:  <name>
Preconditions:       <the "Preconditions:" block parsed from description (rules/allure.md §4)>
Steps to reproduce:  <steps from the MCP tool response's scenario.steps[] array, in order>
Test Data:           <the body of each step, numbered to match the step>
Expected Results:    <top-level expectedResult field, if set> plus, per step, any result
                     reached via that step's expectedResultSteps[] entries (attach each one to
                     that step's number, don't list it as an unnumbered extra step)
Rule&AC:             <parsed from the "Rule&AC:" line in description, plus any Jira link>
State:               — out of scope (execution result, not a Test Case field, see rules/allure.md §4) —
Modules / Sub-Modules: <Modules / Sub-Modules custom field value, or "— not set —">
Feature / Component: <Feature / Component custom field values>
Status (workflow):   <Draft/Review/Active/Outdated>
```

If any field is empty in Allure, say so explicitly (`— not set —`) rather than omitting the
line — a missing field is itself useful signal (e.g. a case authored outside this pipeline that
still needs Rule&AC traceability added).

**Legacy fallback:** if `precondition`/`expectedResult` are both empty and the response's
`scenario.steps` array is empty (genuinely no steps) but `description` is non-empty, this is very likely one of the
pre-existing legacy-imported cases
(see `rules/allure.md` §4's "Legacy data note" — content crammed into `description` instead of
the dedicated fields). In that case, print the raw `description` verbatim as an additional
`Description (legacy — see rules/allure.md §4):` line instead of showing three misleadingly
empty field lines, so the reader isn't told the case has no preconditions/steps when it
actually does, just not in the field this command normally reads them from.

---

## Output

A single rendered record as above. No file is written — this command is read-only.

---

## Constraints

Never mutate anything — no mutating MCP tool calls in this command, ever. Never invent a
field value that Allure didn't actually return. Never guess which case a `tag:` search meant
when more than one matches. Never print the API token.

---

## Definition of Done (for this command's own output)

- The exact requested case (by id or unambiguous tag match) was fetched, not a guess
- Every field of the Step 3 record is shown, explicitly marked `— not set —` where empty
- The report quotes the fetch response (id/count) or states that the call failed
- Steps were read from the MCP tool response, walked
  per `rules/allure.md` §3a's tree structure, and rendered in the same numbered order/grouping Allure
  itself displays — including any per-step Expected Result reached via `expectedResultSteps[]`
- No mutating API call was made
