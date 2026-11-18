@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-update-test-case

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to keep a ticket's Allure TestOps test cases in sync after the
ticket, its Acceptance Criteria, or a linked Confluence page changes.

You never delete test cases outright — obsolete cases are moved to the `Outdated` workflow
status with a reason recorded in `description`, preserving the audit trail (Allure's native
version history additionally records every field-level change).

You never create a parallel "next version" record the way the xlsx pipeline creates a new file
— per `rules/allure.md` §5, updating a case in place via `testops_update_testcase` *is* the
correct reconciliation action; Allure's own version history is the changelog.

---

## Mission

Reconcile a ticket's live Allure test cases with its current state: add cases for new/changed
requirement items, update cases whose requirement changed, mark removed items' cases
`Outdated`, and record exactly what changed and why.

---

## Argument Format

```
/execution:allure-commands:allure-native-update-test-case <TICKET-KEY>
/execution:allure-commands:allure-native-update-test-case <TICKET-KEY> types:+e2e
```

`<TICKET-KEY>` is the actual Jira issue key the analysis file was written for. No `types:` —
reconcile using the existing Required Test Types, re-evaluating the Test Type Selection Matrix
only against the delta (a changed AC might newly trigger Regression, for example). `types:+<type>`
adds a type not previously required; `types:-<type>` removes one — flag it as a risk if the
matrix would still require it.

## Examples

```
/execution:allure-commands:allure-native-update-test-case TB-1306
```
→ An AC changed on the ticket since the last run. Diffs the ticket/Confluence against
`docs/test-cases/TB-1306/analysis.md`, classifies every BR/ALT/AC as Unchanged/Changed/New/Removed,
shows the full diff (patch / create / mark `Outdated`) for confirmation, then applies it to the
live Allure cases and records the change in `analysis.md`'s Changelog.

```
/execution:allure-commands:allure-native-update-test-case TB-1306 types:+e2e
```
→ The ticket's scope grew to include a new critical journey. Adds E2E as a newly-required type on
top of the existing reconciliation — designs and creates the new E2E case(s) alongside whatever
the ticket delta itself triggers.

```
/execution:allure-commands:allure-native-update-test-case TB-1532 types:-regression
```
→ Explicitly drops Regression from this reconciliation. If the Test Type Selection Matrix would
still require it given the current ticket content, that's surfaced as a flagged risk rather than
silently honored.

---

## Preconditions

- `docs/test-cases/<TICKET-KEY>/analysis.md` must exist **in the resolved `proj-ai-agentic` git
  working tree** (per base-agent.md's "Repository & Persistence Model" — never
  `${CLAUDE_PLUGIN_ROOT}`, the plugin cache, which won't have a file written mid-session; never
  the consuming repo's own tree), and at least one Allure test case must already carry the
  `<TICKET-KEY>` tag (per `rules/allure.md` §6). If the analysis file is missing, stop and point
  to `/execution:mqa-commands:mqa-review-story`. If no tagged case exists yet, stop and point to
  `/execution:allure-commands:allure-native-create-test-case` — this command reconciles, it does not
  create a suite from scratch.
- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2 (no field IDs to resolve — MCP takes Feature/Component/Story/Suite by
  name).

### Step 0 — Load the current baseline

`testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"",
expand:["scenario","tags","custom_fields","status"])` — one call gets the full current baseline
for every case tagged `<TICKET-KEY>`, not just their ids. Every one of these cases is live and gets patched in place, never
copied into a new file — Allure has no version-file scheme to manage.

---

## Update Protocol

### Step 1 — Re-fetch current state

Fetch the ticket's current Acceptance Criteria, comments (for what changed and when — an AC
edit, a linked Bug, a reopened status), and any newly linked Confluence/specification pages
(read-only, via the `claude-proj-agent:atlassian-routing` skill — MCP `atlassian-innowise` / `atlassian-bank`), for every module recorded in the analysis file.

### Step 2 — Diff against the analysis file

Classify every `BR-*`, `ALT-*`, `AC-*` (per module) as:

- **Unchanged** — no action.
- **Changed** — text or implied behavior differs from the analysis file's record.
- **New** — not present in the analysis file at all.
- **Removed** — present in the analysis file but no longer in the current ticket/Confluence
  source.

### Step 3 — Update the Analysis document

For **Changed**/**New** items, re-run the relevant part of the Requirement Analysis Protocol
from `mqa-review-story` (re-extract the Business Flow/BR/Alt/AC text, re-check for gaps/conflicts
against this project's own documented rules and sibling tickets — never a different project's
invariants). For **Removed** items, mark them removed in the analysis file with the reason and
date. Repeat the Test Type Selection if the delta changes the signals. `docs/test-cases/<TICKET-KEY>/analysis.md`
is still the source of truth and is still edited in place, with its own `## Changelog` section.
**Before writing anything to `analysis.md`, show the user the diff of the intended edits (what is
replaced, added, marked removed) and wait for an explicit yes** — this confirmation precedes every
write in this command, including the Step 5 Changelog entry.

### Step 4 (Allure-specific) — Apply the delta to live Allure cases

- **Unchanged** requirement items: leave the linked case(s) untouched.
- **Changed** requirement items: find the case(s) tracing to that item (via the `Rule&AC` block
  trailing the Preconditions block in `description`, per `rules/allure.md` §4) — already in hand
  from Step 0's baseline fetch. Follow `rules/allure.md` §3a's read-modify-write pattern: edit the
  already-fetched `scenario.steps[]` array for the affected step(s) — one action per step node, one
  Expected Result per step node, per `docs/allure-test-case-design-standard.md` §4; split a case's
  existing bundled step into separate nodes while you're in there if it isn't already, don't
  perpetuate the shape — then `testops_update_testcase({id, description, scenario: {steps:
  <complete edited array>}})` — there is no surgical single-step tool anymore, so the array sent
  must always be the complete, current tree, not just the changed step. Apply the same
  Atomicity/Step Explicitness/Verified Behavior bar as first authoring, and the content bar in
  `docs/allure-test-case-design-standard.md` (Title/Description/Steps/Comments/Custom Fields) — a
  case touched during reconciliation must meet the current bar even if it didn't when first
  written. If the change is substantial enough that the case no longer
  represents a coherent scenario, set it `Outdated` (with reason) and create a new case instead of
  patching around an incoherent shape. Whenever this reconciliation (including a `types:+/-`
  override) changes what tags an already-existing case needs, follow the same read-modify-write
  discipline for `tags[]` per `rules/allure.md` §3b: fetch the case's current tags
  (`testops_find_testcases(aql:"id = <id>", expand:["tags"])` — already in hand from Step 0's
  baseline fetch) and send the full union in `testops_update_testcase`, never just the tags being
  added or dropped, so the `<TICKET-KEY>` ticket-tracking tag and other existing tags are never
  silently dropped.
- **New** requirement items: design cases following `allure-native-create-test-case.md`'s Step 3
  (materialize), continuing the same tagging convention, tagged `<TICKET-KEY>` the same as the
  original suite.
- **Removed** requirement items: `testops_update_testcase({id, status:"Outdated", description: <existing description +
  "\n\n**Deprecated <date>:** <reason> — superseded by ticket update.">})` — `description` is a full
  replace on this tool too, so fetch the case's current `description` first (already in hand from
  Step 0) and append to it in memory before sending, never send just the new line. Never
  `testops_delete_testcase` for this reason.
- Re-run the Traceability Check: every current `BR-*`/`ALT-*`/`AC-*` maps to at least one
  non-`Outdated` case.

**Confirmation gate:** before calling `testops_update_testcase`/`testops_create_testcase` for any case in this
reconciliation, show the user the full diff — which
cases will be patched (and how), which will be created, which will be marked `Outdated` (and
why) — and get explicit confirmation. Same reasoning as `allure-native-create-test-case.md`: this
mutates live, shared infrastructure.

### Step 5 — Record what changed

Since there's no per-version `Changelog` sheet in Allure, add the equivalent entry to
`docs/test-cases/<TICKET-KEY>/analysis.md`'s own `## Changelog` section: what changed, why,
which requirement item IDs and Allure case ids were added/patched/deprecated. Allure's own
per-case version history additionally captures the field-level diff for each patched case
automatically — no further action needed there, it's automatic.

Set every newly-created case's `status` to `Draft` (same as `allure-native-create-test-case.md`); for
patched cases, reset `status` to `Draft` too if the prior status was `Active` — a reconciled
case has not yet been re-reviewed, regardless of what it was before.

---

## Output

- Live Allure cases updated per Step 4 (patched / created / marked `Outdated`) — nothing written
  to a new file, since Allure has no file to version.
- `analysis.md` updated in place (in the resolved `proj-ai-agentic` working tree) with a new
  Changelog entry.
- Jira is never written by this framework: prepare the text of a comment summarizing what was
  reconciled (which case ids were patched/created/deprecated) and whether re-review is required,
  show it in the chat, and let the user publish it.
- Leave the updated `analysis.md` as an uncommitted change in `proj-ai-agentic` — don't commit or
  push it here. Committing happens only via the `/create-pr` skill, run explicitly by the user
  once for everything the session changed.

---

## Constraints

Never delete a case to reflect a requirement change — use `Outdated`. Never silently patch a
case without recording why in `analysis.md`'s Changelog. Never touch **Unchanged** items. Never
skip re-running Test Type Selection on the delta. Never leave a current requirement item unmapped
to a non-`Outdated` case after reconciliation. Never leave a case at `Active` status after its
content just changed — reset to `Draft`. Never issue a mutating call, or write `analysis.md`, before the user has
confirmed the full diff. Never invent a parallel version-numbering scheme — Allure's
own history is the changelog for field-level detail. Never print the API token.

---

## Definition of Done (for this command's own output)

- Every requirement delta (Changed/New/Removed), across every module, was classified and handled
- Every current `BR-*`/`ALT-*`/`AC-*` maps to at least one non-`Outdated` Allure case
- `analysis.md` was updated in place with a Changelog entry recording what changed, why, and
  which case ids were touched
- Every patched or newly-created case's `status` is `Draft`, correctly signaling re-review is
  required
- No case was deleted for a requirement-change reason
- Each `testops_update_testcase` / `testops_create_testcase` result is quoted in the report (case
  id, or the failure); a check that could not run is labelled `UNVERIFIED` per
  `verification-protocol.md`
- The text of the Jira comment is prepared and shown in the chat (the user publishes it)
