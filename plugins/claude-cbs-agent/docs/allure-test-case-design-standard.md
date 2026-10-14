# Allure TestOps — Test Case Design Standard

Owned by the AI Architect (`${CLAUDE_PLUGIN_ROOT}/commands/team/ai-architect-agent.md`), content
authored from direct examples/corrections given by the team's Senior Manual QA Engineer
(vadym.udaltsov) on 2026-08-27. Read by the Senior Manual QA Engineer
(`commands/team/manual-qa-agent.md`) and the Senior Full Stack AQA Engineer
(`commands/team/fullstack-aqa-agent.md`) — and every skill under `commands/execution/allure-commands/`
and `commands/execution/aqa-commands/` that creates, updates, reads, or deletes an Allure TestOps
test case.

**Scope split with `rules/allure.md`:** that file owns the *mechanics* — which MCP tool to call,
how the step tree is shaped as JSON, how tags/custom-field-values are resolved and confirmed. This
file owns the *content bar* — what a well-formed case actually contains in each field, and the
recurring mistakes that keep showing up when that bar isn't followed. Read both; neither replaces
the other.

## Why this document exists

Manual QA and Full Stack AQA repeatedly hit the same handful of mistakes when creating, updating,
or reading Allure TestOps test cases — not because the mechanics (`rules/allure.md`) are unclear,
but because nothing previously spelled out what a *correctly shaped* case's Tags/Title/Description/
Steps/Comments/Custom Fields actually look like, with real examples. This document is that
reference. Every rule below is illustrated with a real case from this project's own Allure
instance (project `TB CBS`, `projectId=2`).

---

## 1. Tags

A test case's tags typically combine up to three independent axes — match the **exact casing**
already used by sibling cases in the same Component, don't invent a new casing for an axis that
already has an established one (a differently-cased tag creates a *new*, disconnected tag rather
than reusing the existing one — see `rules/allure.md` §7 item 4):

| Axis | Casing observed | Examples |
|---|---|---|
| Layer | ALL CAPS | `API`, `UI` |
| Content category / test type | Title Case | `Regression`, `Smoke`, `Positive`, `Negative`, `Edge`, `E2E` |
| Milestone-scoped variant (Smoke/Regression only) | lowercase, `_m1`/`_m2` suffix | `smoke_m1`, `smoke_m2`, `regression_m1`, `regression_m2` |
| Test level (mechanics-only, see `rules/allure.md` §4) | lowercase | `component`, `integration` |

The milestone suffix is **additive**, not a replacement for the Title Case content-category tag —
a real case carries both together, e.g. case id 2706's tags are `["API", "Regression",
"regression_m2"]`. `m1` = Milestone-1 modules, `m2` = the active milestone's modules (the `proj-test-automation` repo's
`README.md`; mirrors the Playwright `@smoke_m1`/`@regression_m2` axis documented in
`docs/frame-specs/testing-standards.md`). Determine which milestone a Component belongs to by
checking sibling cases already filed under that same Component/Story — never guess, and never
default to `m2` just because it's "the active one" without checking.

**A missing tag is not a defect signal.** A pre-existing case created by a human, or one where a
tag was simply forgotten, must never be read as a sign the case's content is wrong, unfinished, or
untrustworthy — proceed by reading Description/Steps/Custom Fields on their own merits, the same
as any properly tagged case. Don't let a missing tag derail the point of reviewing the case.

---

## 2. Title (`name`)

Short, plain, human language — a reader should understand exactly what's being verified from the
title alone, without opening the case.

**Good** (real example, case id 2706):
> An expired CURRENCY.RATES row stays in LIV and is never archived into HIS

States the subject, the condition, and the verified outcome in one plain sentence. Shorter is fine
too, as long as the behavior under test stays unambiguous.

**Avoid:**
- Vague/generic phrasing that says nothing about the actual behavior (`"Test case for CURRENCY.RATES"`, `"Check expiry works"`)
- Burying the outcome behind ticket/module jargon a reader would have to decode
- A title so compressed it drops the condition or the outcome and leaves only the subject

---

## 3. Description

Content: a **Preconditions** block — the starting state and conditions required before the case's
steps can run, in plain declarative language — followed, as a separate block underneath, by a
`**Rule&AC:**` line citing the requirement item(s) this case proves (short native label from the
source Story/page — `AC1`, `BR 1`, `Alt 2` — per `manual-qa-agent.md`'s Rule&AC convention), kept
here for traceability continuity with `analysis.md`'s Coverage Matrix. Preconditions always comes
first; the Rule&AC line is always a separate trailing block, never interleaved into the
Preconditions prose.

**Real example** (case id 2706):
> Preconditions:
> An active rate exists in CURRENCY.RATES with a known END_DATETIME. CURRENCY, CURRENCY.MARKET,
> CURRENCY.ORDER populated. There is currently no scheduled job or engine-side process that
> touches an expired CURRENCY.RATES row or its originating CURRENCY.ORDER — the row is only ever
> superseded (moved to HIS) by a later write to the same key.

**Never write into Description:**
- Technical implementation detail that isn't itself a precondition (internals, code paths)
- Analysis findings, chat/session discussion, or any trace of how the case was produced
- Notes, TODOs, or open questions — those belong in `analysis.md`, not on the live case
- The *why* behind a design decision — Description states conditions and facts about this case
  only, never the reasoning that led to it

---

## 4. Steps — the scenario tree

One action = one step node = one Expected Result. **Never** bundle two actions as free text inside
a single step body (`"1. Do X. 2. Do Y."`) — split them into two separate nodes in the step tree,
each with its own Expected Result, even when a human-authored case bundles them this way (it
happens, and it's the single most common structural mistake in this project's existing cases).

Keep each step short: the endpoint/action, the specific unique parameter/condition/value this step
depends on, a short payload if relevant. Keep each Expected Result short: the status code and the
concrete message/behavior expected — never "works correctly."

**Anti-pattern, taken from a real live case (id 2706's own step tree, before this rule existed):**

```json
{
  "body": "1. Let an active CURRENCY.RATES row's END_DATETIME pass (or set it into the past directly).\n2. Query the CURRENCY.RATES table directly for that row, and the CURRENCY.ORDER table for its originating order.",
  "expectedResultId": "<one shared Expected Result for both actions>"
}
```

Two distinct actions, one step node, one shared Expected Result — the exact pattern this section
exists to stop. Even a case with an otherwise excellent Title/Description can still carry this
defect in its Steps; grade each section independently.

**Correct shape for the same content** — two step nodes, each its own Expected Result (per
`rules/allure.md` §3a's tree shape):

```json
{
  "root": { "children": ["<step-1-id>"] },
  "scenarioSteps": {
    "<step-1-id>": {
      "body": "Let an active CURRENCY.RATES row's END_DATETIME pass (or set it into the past directly).",
      "expectedResultId": "<er-1-id>",
      "children": ["<step-2-id>"]
    },
    "<er-1-id>": { "body": "The row remains ACTIVE-shaped in CURRENCY.RATES; nothing archives it automatically." },
    "<step-2-id>": {
      "body": "Query CURRENCY.RATES for that row, and CURRENCY.ORDER for its originating order.",
      "expectedResultId": "<er-2-id>"
    },
    "<er-2-id>": { "body": "Both rows are still physically present in LIV; neither was moved into HIS." }
  }
}
```

(`<step-N-id>`/`<er-N-id>` are placeholders — Allure assigns real numeric ids on write. See
`rules/allure.md` §3a for the actual read-modify-write MCP mechanics that produce this shape.)

---

## 5. Comments

Use a case's Comments for supplementary material that helps someone execute or understand it but
doesn't belong in Description/Steps — a real request/payload example, or an important caveat tied
specifically to this case.

**Real example** (case id 1871's comment):
> ```json
> {
>   "recordId": "XAG",
>   "data": {
>     "NUMERIC_CODE": "962",
>     "NO_OF_DECIMALS": 2,
>     "QUOTATION_CODE": 1,
>     "INTEREST_DAY_BASIS": "ACT.360",
>     "PRECIOUS_METAL": true,
>     "BASE_RANK": 88
>   }
> }
> ```
> Change "NUMERIC_CODE", "NO_OF_DECIMALS", "QUOTATION_CODE", send with the same

**Never write into Comments:**
- Analysis output, technical rationale, or any trace of how the case was produced
- Discussion, back-and-forth, or open questions — that belongs in Jira/analysis.md, not here

---

## 6. Custom Fields — Feature / Component / Story

Three fields, three different levels of the same tree — get all three right or the case files in
the wrong place in Allure's own case tree, independent of how well-written its other fields are.

| Field | What it holds | Real example (case id 2706) |
|---|---|---|
| **Feature** | The broadest tree bucket — the top-level module. Check sibling cases already filed under the same Component for the value actually in use; don't infer one from the ticket alone. Known values as of 2026-08-14 (`rules/allure.md` §2): Accounts, Customer (Party), Document Management, Financial Accounting, Financial Reporting, Interest and Charges, Limits, Product Factory Core, Security Management, System Core, Teller, Transfers | `System Core` |
| **Component** | The specific module the Story lives under, one level narrower than Feature. **Always populate this** — it is not optional, and a case with a real Story but no Component is filed incompletely. | `Currency Definition and Logic` |
| **Story** | The **bare** Story title only — never the `US-XX.YY.ZZ | ` id prefix used in Jira/Confluence/this repo's own folder names (confirmed pitfall, see `docs/common-issues/allure-testops/allure-story-field-no-id-prefix.md`) | `Static Currency & Market Configuration Registry` |

**Method:** before setting any of the three on a new or reconciled case, scan cases already filed
under the same area (`testops_find_testcases(projectId, expand:["custom_fields"])`, per
`rules/allure.md` §7 item 4's near-duplicate scan) and match their exact stored values — a
plausible-looking Feature/Component name that doesn't exactly match what siblings already use
creates a second, disconnected value in the tree instead of filing alongside the real one.

---

## Common mistakes checklist

Quick reference — the recurring errors this document exists to stop:

- [ ] Treating a case with no tag as suspect/wrong instead of just reading its content (§1)
- [ ] Wrong or mismatched tag casing across the three axes (§1)
- [ ] A title that's technical jargon or too vague to convey the behavior under test (§2)
- [ ] Description containing rationale, analysis output, or anything beyond Preconditions + Rule&AC (§3)
- [ ] Preconditions and Rule&AC interleaved instead of two separate blocks (§3)
- [ ] Two or more actions crammed into one step's body text instead of split into separate step nodes (§4)
- [ ] An Expected Result that's vague ("works correctly") instead of a concrete status/behavior (§4)
- [ ] Comments used for discussion/rationale instead of payload examples or case-specific facts (§5)
- [ ] Component left empty (§6)
- [ ] Story field carrying the `US-XX.YY.ZZ | ` id prefix (§6)
- [ ] Feature/Component/Story set from a guess instead of matching an already-filed sibling case (§6)
