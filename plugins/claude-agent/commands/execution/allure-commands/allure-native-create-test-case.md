@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-create-test-case

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is to turn a completed Requirement Analysis into a full, traceable set
of test cases across every required test type, created directly in Allure TestOps. You never
write automation code here. You never modify the ticket or its Acceptance Criteria — a gap
found while designing cases is an open question, not a silent fix.

This command is project-agnostic and works from whatever `docs/test-cases/<TICKET-KEY>/analysis.md`
says, regardless of which Jira project or Confluence space produced it, and resolves Allure's
own project id live per `rules/allure.md` §2 (field values are passed by name directly to the
MCP tools, no ID resolution needed).

---

## Mission

Design the full manual test case suite for `<TICKET-KEY>` and create every case directly in
Allure TestOps (mapped per `rules/allure.md` §4), tagged so the suite can be found and
reconciled later by `allure-native-update-test-case`.

---

## Argument Format

```
/execution:allure-commands:allure-native-create-test-case <TICKET-KEY>
/execution:allure-commands:allure-native-create-test-case <TICKET-KEY> types:integration,smoke,regression
```

`<TICKET-KEY>` is the actual Jira issue key the analysis file was written for.

## Examples

```
/execution:allure-commands:allure-native-create-test-case TB-1306
```
→ No `types:` override — designs and creates cases for every Required Test Type computed by
`mqa-review-story` in `docs/test-cases/TB-1306/analysis.md` (in the resolved `proj-ai-agentic`
working tree) (e.g. API, Integration, Positive,
Negative, Smoke), tagged `TB-1306`, then presents the Coverage Matrix for confirmation before the
first `testops_create_testcase` call.

```
/execution:allure-commands:allure-native-create-test-case TB-1306 types:integration,smoke,regression
```
→ Explicit override narrowing to three types. Still produces Positive **and** Negative/blocked
cases for every AC/BR/Alt in scope at the Integration level — `types:integration` changes *how*
cases are verified, not which requirements need a case. Any Required Test Type this override drops
(e.g. `E2E`) is called out as a flagged risk, not silently omitted.

```
/execution:allure-commands:allure-native-create-test-case TB-1532 types:api
```
→ Single-type override. If the analysis file's matrix also required `Regression` for this ticket,
that gets flagged explicitly as dropped coverage rather than silently skipped.

- No `types:` argument — use the **Required Test Types** computed by
  `/execution:mqa-commands:mqa-review-story` in `docs/test-cases/<TICKET-KEY>/analysis.md`.
- With `types:` — treat it as an explicit override. If it narrows coverage below what the
  analysis file's Required Test Types lists, call out every dropped type as a flagged risk in
  the output (do not silently drop it). If it adds types beyond the default, honor the
  addition.
- **`types:integration` (and level-shaped values generally) select *how* cases are verified,
  not *which* requirements are in scope.** `Integration` means: real API call + an explicit
  persistence-layer/DB verification step, as opposed to `Component` (isolated, mocked). It does
  **not** mean "skip Negative/Edge content" — every AC/BR/Alt for the modules in scope still
  needs a case, covering both its success and blocked/failure behavior, just verified at the
  Integration level.

---

## Preconditions

- `docs/test-cases/<TICKET-KEY>/analysis.md` lives in the resolved `proj-ai-agentic` git working
  tree (per base-agent.md's "Repository & Persistence Model" — never `${CLAUDE_PLUGIN_ROOT}`,
  the plugin cache, which won't have a file `mqa-review-story` wrote earlier this session; never
  the consuming repo's own tree). It must exist with `Status: Reviewed` (or at least
  exist — if `Status: Draft`, proceed but flag every open question in that file as a risk to
  case accuracy). If the analysis file does not exist at all, stop and run
  `/execution:mqa-commands:mqa-review-story` first — do not re-derive Business Flows/BRs/ACs
  from scratch here.
- **Stop condition:** `testops_find_testcases(projectId, aql:"tag = \"<TICKET-KEY>\"")` (per
  `rules/allure.md` §3/§6). If any exist, stop and point to
  `/execution:allure-commands:allure-native-update-test-case` instead — this command only ever creates
  the first suite for a ticket, and never overwrites/duplicates an existing one.
- The token lives in your local `.mcp.json` — never read or print it. Confirm `projectId` per
  `rules/allure.md` §2 (no field IDs to resolve — MCP takes Feature/Component/Story/Suite by
  name).

---

## Test Design Protocol

### Step 1 — Load traceable requirement items

From the analysis file, list every `BR-*`, `ALT-*`, and `AC-*` ID, per module. These are the
only items cases may trace to — if a case doesn't trace to one of them, either the analysis is
incomplete (go back to `mqa-review-story`) or the case shouldn't exist.

**When `Integration` is a required (or requested) test type, also run Cross-Module Discovery
before designing anything** (`manual-qa-agent.md`'s "Cross-Module Discovery" section): explicitly
enumerate which other modules/sub-modules the ticket's feature actually interacts with — read the
Epic/Story text for stated dependencies and invoked services, check sibling Tasks/Tickets under
the same Epic for which modules already wire the feature in, and check this repo's own module map
(`docs/project-spec/domain-model.md`, `docs/frame-specs/testing-standards.md`, both in the
resolved `proj-ai-agentic` working tree) for which of those
modules have real, non-stub coverage today. Write this list down before Step 2 — every Integration
case's Preconditions/Steps must draw an actual dependency from it. A Story with no identified
cross-module dependency is an open question to the Business Analyst/Architect, not license to
write Component-flavored cases under an `Integration` label.

### Step 2 — Design cases per required test type

**Granularity is not optional — read `manual-qa-agent.md`'s "Test Case Granularity & Story
Scoping" section before writing anything, and apply it here:**

- Default to **one Test Case per `AC-*`**. Every `BR-*`/`ALT-*` not already exercised by an
  AC-level case gets its own case too.
- You may combine **at most two** `AC-*` IDs into one case, only when they are trivially the
  same scenario from two angles, and only within the **same Story**. Never merge more than two,
  and never merge across Stories. **This two-AC cap is lifted for a genuine Integration-level
  case** whose actions and verifications actually reach a second real module/sub-module (per the
  Cross-Module Discovery step above and `manual-qa-agent.md`'s "Combining criteria is more
  permissive for genuine Integration cases") — such a case may cite as many `AC-*`/`BR-*`/`ALT-*`
  items as the one continuous cross-module flow actually spans, provided every one of those items
  still also gets its own dedicated, narrower per-Story case elsewhere in the suite. This is never
  a shortcut to a smaller document — it only adds a broader case on top of full granular coverage.
- **Decompose multi-dimensional rules — one case per dimension.** When a single BR/AC/Alt spans
  several independent equivalence classes or entity states, write **one Test Case per
  dimension**, all citing the same Rule&AC — never one "representative" case for the whole
  rule. This is usually where the majority of a document's case count comes from.
- If you find yourself writing noticeably fewer cases than the AC/BR/Alt count in scope, stop
  and check whether you're silently merging distinct requirements, or collapsing a
  multi-dimensional rule into one case, instead of covering each unit.
- This granularity rule holds even when `types:` narrows the document by test level: narrowing
  changes *how* the cases in scope are verified, never *which* ACs/BRs/Alts are in scope, and
  never licenses merging the ones that remain.

For each required test type, design cases using the manual test design techniques in
`manual-qa-agent.md` (equivalence partitioning, boundary value analysis, decision tables, state
transition, scenario-based). Content categories (what's being tested) and verification level
(how it's proven, i.e. the `Test level` field) are two different axes — a Negative scenario can
and often should be verified at the Integration level, not excluded by it:

- **Positive** — happy path per Business Flow and AC.
- **Negative** — invalid input, unauthorized actor, violated precondition, per Alternative Flows.
- **Edge/Boundary** — min/max/zero/empty/oversized values, wherever a BR states a bound.
- **Integration** (as a required-type signal from the analysis matrix) — the *same*
  requirements verified **across module/sub-module boundaries**, with real dependent modules
  involved (not mocked) — this is what should push a case's `Test level` to `Integration`
  rather than `Component`. Different lens from Smoke/Regression below, not a replacement for
  them: Smoke/Regression prove the feature works within its own module; Integration proves it
  still works at the handoff to the modules it depends on. **The primary goal is that handoff
  itself** — a case's actions and DB/API verifications must actually reach a second real
  module/sub-module identified in this Story's Cross-Module Discovery (Step 1), not just the
  Story's own table/service with a persistence check bolted on. If a designed case cannot name a
  second real module it touches, it belongs in Positive/Negative/Regression coverage, not here.
- **API** — request/response contract correctness per the actual API spec (consult the `bruno`
  plugin against the `proj-bruno-api` sibling-repo collection — see
  `docs/frame-specs/api-conventions.md`), or per general REST/HTTP correctness practice
  (status codes, error shapes, pagination) if no such convention is documented.
- **Regression** — existing behavior this ticket modifies, verified **within the feature's own
  module scope** — write the case against the *existing* flow, not just the new addition.
- **Smoke** — the single most critical scenario **within the feature's own module scope**,
  tagged for the smoke suite.
- **E2E** — the full user journey across the relevant layers (UI/API/data as applicable), only
  for multi-step or critical journeys per the matrix.

For **Unit**: do not write a case. Note it for tracking, not authoring — see Step 3.

### Step 3 — Materialize each designed case in Allure

For each case designed above, build:

- `name` = the case's Short Description — short, plain, human-readable statement of the behavior
  under test (e.g. `An expired CURRENCY.RATES row stays in LIV and is never archived into HIS`),
  not ticket/module jargon a reader would have to decode. See
  `docs/allure-test-case-design-standard.md` §2.
- `description` = a `Preconditions:` block (exact starting state, using concrete example entity IDs
  **unique to this case** — a per-case fixture ID, not one shared/reused with another case, styled
  after this project's own real examples, e.g. `sm_invoice`, `sys_user` — whatever convention the
  `proj-bruno-api` collection demonstrates via the `bruno` plugin, not placeholders; state facts
  fully — never a cross-case pointer like "same table as case X"), followed by a separate trailing
  `**Rule&AC:** <citations>` block (per `rules/allure.md` §4). Never write rationale, analysis
  output, or scenario/technical narrative into `description` — only Preconditions facts and the
  Rule&AC citation. Steps/Expected Results always go in their own dedicated `scenario` fields
  below, never restated here (per `rules/allure.md` §4's "Legacy data note" — never reproduce the
  pre-existing cases' style of also cramming Steps into `description`). See
  `docs/allure-test-case-design-standard.md` §3 for the full rule and a worked example. Also set a
  `links: [{"name":"Jira","url":"<ticket URL>"}]` entry on `testops_create_testcase` for the Jira
  ticket if its URL is known (per `rules/allure.md` §3/§4).
- `scenario.steps` = **one action per step node, one Expected Result per step node** (per
  `rules/allure.md` §3a's tree shape and `docs/allure-test-case-design-standard.md` §4) — never two
  actions crammed as free text into one step's body (`"1. X 2. Y"`), even if a case being
  reconciled already has this shape; split it into separate nodes. Each step names *the action
  only* (exact endpoint, exact method, or the non-API action like "query the DB for X") —
  detailed enough to execute without re-reading the ticket or any other case. The exact JSON
  request body lives in that same step's `body` field / the local doc's sibling `Test Data` column
  (per `manual-qa-agent.md`'s Required Test Case Table Format), never inlined into the action
  text and never a paraphrase of intent. Pull the exact contract from the `bruno` plugin against
  the `proj-bruno-api` collection — never invent a payload. **If reaching this case's starting
  state requires setup actions, write those as this case's own first step nodes, in full** — never
  "assume case X already ran". Each step's own Expected Result (its `expectedResultSteps[]` entry)
  is concrete and verifiable — status code plus the concrete message/behavior, never "works
  correctly" — and, for an `Integration`-level case's persistence-verification step, the exact
  persisted-state/DB outcome that step should observe (e.g. "Query the Table Registry DB for
  `:tableId`" as its own step, expecting the persisted row back — a re-fetch through the same API
  alone does not prove a persisted effect). Before citing any cross-cutting mechanism (locking,
  four-eyes/authorization buffering) in a step, confirm from the actual spec that its documented
  scope covers the specific resource this case exercises.
- `status` = Draft (per `rules/allure.md` §2)
- Tags = `<TICKET-KEY>` (always) + Test level tag (`component`/`integration`/...) + Test type /
  content-category tags (`API`, `Positive`, `Negative`, `Edge`, `Regression`, `Smoke`, `E2E` as
  applicable) + for Smoke/Regression, the matching milestone-scoped tag (`smoke_m1`/`smoke_m2`/
  `regression_m1`/`regression_m2`, determined by checking sibling cases in the same Component,
  never guessed) — per `rules/allure.md` §4 and `docs/allure-test-case-design-standard.md` §1
- Custom fields: Story = the case's source page's own **bare title**, copied verbatim, **never**
  with a `US-XX.YY.ZZ | ` id prefix (per `docs/common-issues/allure-testops/allure-story-field-no-id-prefix.md`
  and `docs/allure-test-case-design-standard.md` §6) — always exactly one module, the one whose
  flow is primarily under test; Feature = the top-level tree module the Story belongs to (match
  what a sibling case already filed in the same Component uses, ask if it genuinely can't be
  determined rather than guessing); Component = the specific module the Story lives under —
  **always populate this, never left empty**. `**Rule&AC:**` cites the short native label from the source page (`AC1`, `BR 1`, `Alt 2`,
  `MSS A`) — not a cross-module-prefixed ID. For a genuine `Integration`-level case citing items
  from more than one Story, name the owning Story alongside each citation (e.g.
  `AC5 (US-01.04.03), BR2 (US-01.04.02)`).
- `Modules / Sub-Modules` custom field (per `manual-qa-agent.md`'s Required Test Case Table
  Format) = every real module/sub-module this case's actions/verifications actually reach,
  comma-separated with each module's own recognizable name — populated straight from the
  Cross-Module Discovery list (Step 1), never guessed at case-authoring time, and never just a
  restatement of the `Story` field. Check which values already exist with
  `/execution:allure-commands:allure-custom-list-field-values` (`rules/allure.md` §7 item 4, §8)
  before first use. For an `Integration`-level case, if this field would
  only repeat the Story's own module, that's a signal the case hasn't actually gone cross-module
  — fix the case (or its Test level tag) before creating it, per the Definition of Done below.

Do not skip Unit cases' handling: per `manual-qa-agent.md`, Unit coverage is tracked, not
authored — do not create an Allure test case for it; instead note it in the summary you present
in Step 5 below ("Unit coverage expected in `<implementing component>` — confirm with the
implementing lead at implementation").

### Step 4 — Confirm, then create

Before calling `testops_create_testcase` even once, show the user the full list of cases about
to be created (name, Story, Feature, tags, and the requirement item(s) each traces to) and get
explicit confirmation. This is a live, shared Allure project — a mistake here is a real record
someone else will see, not a throwaway file.

Once confirmed, for each case, one `testops_create_testcase` call carries everything: `name`,
`description` (the `Preconditions:` block plus the `Rule&AC:` line, per `rules/allure.md` §4),
`expectedResult`, `status:"Draft"`,
`tags` (`<TICKET-KEY>` + Test level + Test type/content-category tags), `customFields`
(`Story`/`Feature`/`Component`/`Modules / Sub-Modules` by name), and `scenario` (the full step tree, per `rules/allure.md`
§3a's shape) — no separate follow-up calls needed, unlike the old multi-step REST flow. If a call
fails, report exactly which cases succeeded (with their new ids) and which didn't — never
silently retry with different data.

Verify each case's steps actually saved by re-fetching it
(`testops_find_testcases(aql:"id = <new id>", expand:["scenario","tags","custom_fields"])`) and
diffing the response against what was sent.

### Step 5 — Traceability Check

Build the Coverage Matrix: every `BR-*`/`ALT-*`/`AC-*` from every module in the analysis file →
Allure case id(s) → Test level/Test type. Present it in chat as a table. Any requirement item
mapped to zero cases is a defect in this command's own output — return to Step 2, not the next
step. Also check, same as any presence check: no case traces to more than two `AC-*` IDs (except
a genuine cross-module Integration case per the lifted-cap exception, and only when every cited
item still also has its own narrower case), no case names more than one Story, every
multi-dimensional rule got one case per dimension, every `Integration`-level case has a
persistence-layer verification step **and** actually reaches a second real module/sub-module
(not just its own Story's module with a DB check attached).

---

## Output

- Every designed case created in Allure TestOps per Step 4, tagged `<TICKET-KEY>`.
- A Coverage Matrix presented in chat (Step 5) — every requirement item mapped to the Allure
  case id(s) that prove it.
- Jira is never written by this framework: prepare the text of a comment linking the created
  Allure test cases (their ids/URLs), show it in the chat, and let the user publish it.
- Do not transition the ticket's status — this is not an approval step.

---

## Constraints

Never write a case that doesn't trace to a specific `BR-*`/`ALT-*`/`AC-*` ID. Never skip a
required test type without recording a reason. Never author Unit test cases as prose. Never
invent behavior not present in the analysis file — if a gap surfaces here that the analysis
missed, re-run `/execution:mqa-commands:mqa-review-story` for that item rather than guessing.
Never name more than one Story in a case's Story field. Never combine more than two `AC-*` IDs
into a single Test Case **unless it is a genuine cross-module Integration case** (per the lifted
cap in Step 2) **and** every cited item still also has its own dedicated narrower case elsewhere
— never use the exception to shrink the document. Never skip Cross-Module Discovery before
designing Integration cases, and never label a case `Integration` when its actions/verifications
never leave the Story's own module. Never collapse a rule that spans multiple dimensions into one
case for the whole rule. Never write an `Integration`-level case without a persistence-layer
verification step. Never treat a level-shaped `types:` value as license to drop Negative/Edge
content. Never
create a case without the `<TICKET-KEY>` tag. Never issue a mutating call before the user has
explicitly confirmed the full case list in Step 4. Never create a Feature/Suite/Story custom
field value without first checking existing values via `allure-custom-list-field-values`. Never create a
case for this ticket if one already exists (tagged `<TICKET-KEY>`) — use
`allure-native-update-test-case` instead. Never print the API token.

---

## Definition of Done (for this command's own output)

- Every `BR-*`, `ALT-*`, and `AC-*` from every module in the analysis file maps to at least one
  Allure test case
- Case count is proportionate to requirement count — at least one Test Case per `AC-*` in
  scope, and more once multi-dimensional rules are decomposed one-case-per-dimension
- No case names more than one Story; no case traces to more than two `AC-*` IDs, except a genuine
  cross-module Integration case under the lifted-cap exception; every AC/BR/Alt still has its own
  granular per-Story case in addition to any broader Integration case
- Cross-Module Discovery was run before designing Integration cases, and its module list is
  reflected in the Preconditions/Steps of every Integration case created
- Every `Integration`-level case includes an explicit persistence-layer verification step **and**
  actually reaches a second real module/sub-module — none are Component coverage relabeled
- Every required test type has at least one case, or an explicit reason it doesn't apply
- Every case has a concrete, verifiable Expected Result and is fully self-contained (zero
  references to another case's number)
- Every API-touching step names the exact method, endpoint, and JSON body
- `Rule&AC` citations use each source page's own native numbering
- Unit coverage is tracked (not authored) with a named owner
- Every created case carries the `<TICKET-KEY>` tag, and its Feature/Story/tags were set, not
  left at Allure's defaults
- The Coverage Matrix was presented and every requirement item maps to at least one real,
  now-existing Allure case id
- The text of a Jira comment linking the created cases is prepared and shown in the chat (the
  user publishes it)
- Each `testops_create_testcase` / re-fetch result is quoted in the report (case id, or the
  failure); a check that could not run is labelled `UNVERIFIED` per `verification-protocol.md`
