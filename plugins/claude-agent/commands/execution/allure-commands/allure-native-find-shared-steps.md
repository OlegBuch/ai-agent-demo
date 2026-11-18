# /execution:allure-commands:allure-native-find-shared-steps

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow: list/search existing Shared Steps, primarily so
`allure-native-create-test-case`/`allure-native-create-shared-step` can check for an existing equivalent before
authoring a new one. Read-only.

---

## Mission

Answer "does a shared step for X already exist" and "what shared steps exist", using
`testops_find_sharedsteps` (`rules/allure.md` §3).

---

## Argument Format

```
/execution:allure-commands:allure-native-find-shared-steps
/execution:allure-commands:allure-native-find-shared-steps name:<text>
```

No filter lists every shared step in the project (paged). `name:<text>` searches by name
(`aql:"name = \"<text>\""` for an exact match; if zero results, retry as a broader client-side
`contains` scan over a full, paged fetch rather than assuming no near-match exists — shared step
names may vary in phrasing).

## Examples

```
/execution:allure-commands:allure-native-find-shared-steps name:Authenticate as Teller
```
→ Exact AQL match found — returns `id`/`name`. If none, falls back to a full scan for anything
containing "Teller" or "Authenticate" and lists close candidates instead of reporting zero.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2.

---

## Protocol

### Step 1 — Query

`testops_find_sharedsteps(projectId, aql:<derived from name: filter, or omitted>, page, size)`,
paging through all results if unfiltered.

### Step 2 — Render

A table: `id | name`. State the total count. If a `name:` filter found zero exact matches, run the
broader client-side scan described above and present any close candidates found, or state plainly
that none exist.

---

## Output

A rendered table (and total count) in chat. No file is written — read-only.

---

## Constraints

Never mutate anything. Never report zero results without first trying the broader client-side
scan when a `name:` filter was given. Never print the API token.

---

## Definition of Done (for this command's own output)

- The requested filter (or lack of one) was applied against Allure, not approximated; the report quotes the call's response (ids/count) or states that the call failed
- A `name:` filter that found zero exact AQL matches was followed by a broader scan before
  reporting empty
- No mutating call was made
