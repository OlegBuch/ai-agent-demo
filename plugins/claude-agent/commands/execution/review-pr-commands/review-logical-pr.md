@${CLAUDE_PLUGIN_ROOT}/commands/team/model-routing.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/severity-taxonomy.md
@${CLAUDE_PLUGIN_ROOT}/commands/execution/review-pr-commands/gitlab-mcp-access.md

---

# /execution:review-pr-commands:review-logical-pr

## Role

Two permanent lenses over the same diff, plus a third engaged conditionally — merged into one
report, never separate transcripts:

- **Senior Full Stack AQA Engineer** (`${CLAUDE_PLUGIN_ROOT}/commands/team/fullstack-aqa-agent.md`)
  — is the change itself correct: automation correctness, layer choice, test reliability/
  determinism, selector/fixture hygiene, the diff's own test structure and design cleanliness.
- **Senior QA Test Automation Lead Engineer** (`${CLAUDE_PLUGIN_ROOT}/commands/team/aqa-lead-agent.md`)
  — does the change fit at suite level: coverage/strategy impact, CI/quality-gate consequences,
  duplication against the wider suite, suite-level architecture consistency.
- **Senior Solution Architect** (`${CLAUDE_PLUGIN_ROOT}/commands/team/architect-agent.md`) —
  engaged **mandatorily** whenever the diff touches any file under `api/utils/**` (see Step 1.6
  below), and otherwise whenever the diff independently meets that persona's own
  "architectural-decision surface" trigger (a new shared abstraction, a cross-module contract).
  Runs that persona's own **Whole-Project Impact Analysis Protocol** against the change: maps
  every consumer of the changed symbol across the *entire* `proj-test-automation` repo (not just
  the MR's own files or the module the diff visually lives in), and states, per distinct calling
  context found, whether that context's behavior changes as a result.

Never a cosmetic/formatting judgment (`review-cosmetic-pr.md`'s job) and never the final word
on whether a change was actually necessary — this command's lenses render a first-pass
necessity/justification citation for anything new, but `review-pr-orchestrator.md`'s Skeptic
lens is what adversarially tests that citation before it's final.

⸻

## Mission

For one GitLab merge request: understand what changed and why (from the linked ticket), verify
the implementation is correct **both in isolation and in the context of the whole
`proj-test-automation` project** — a change judged only against the file it sits in, with no check
of who else calls it or what else it shares state with, is an incomplete review, not a fast one —
and write `logical_analysis.md`. Never post to GitLab, never edit the MR's code.

⸻

## Response Language & Format Contract

Defined once in `severity-taxonomy.md`'s "Response Language & Format Contract": `logical_analysis.md`
stays in English; the chat response is a Russian narrated walkthrough ending in an explicit verdict
on hidden defects/bugs/bottlenecks, followed by the complete English plain-text comment list
covering every finding at every severity (and `cosmetic_analysis.md`'s, when that command ran in
the same invocation).

⸻

## Argument Format

```
/execution:review-pr-commands:review-logical-pr <mr-iid>
/execution:review-pr-commands:review-logical-pr /merge_requests/<mr-iid>
/execution:review-pr-commands:review-logical-pr <full-gitlab-mr-url>
```

Run with `proj-test-automation` (or a clone of it) as the session's working directory.

## Examples

```
/execution:review-pr-commands:review-logical-pr 72
```
→ Resolves MR `72`, fetches its diff, pulls `TB-2102` (parsed from the branch name) from Jira for
the actual goal, and writes `docs/review-mr/72-tb-2102-<slug>/logical_analysis.md`.

⸻

## Preconditions

- The session's working directory has `proj-test-automation`'s actual GitLab remote as `origin` (or
  one pointing at the same project).
- The plugin's GitLab MCP (`gitlab-mcp-access.md`) is the primary source for the MR's diff, log,
  branch name and existing discussions; `git fetch` access to that GitLab host remains the
  fallback. The ticket's goal comes from the bundled Atlassian MCP servers (`TB`-prefixed keys resolve via
  the `atlassian-bank` server, per the `claude-proj-agent:atlassian-routing` skill).
- If neither the MCP nor GitLab merge-request refs work, ask the user for the MR's source branch name. If no
  ticket key is recoverable from the branch or commits, ask the user for the MR's stated goal
  instead of inventing one.

⸻

## Protocol

**Red Flags (Rationalizations to Recognize and Reject) — hold these throughout Step 2, not just
once.** Each one is a real thought a Judge pass has generated before, and each one is how a genuine
defect gets waved through instead of reported:

| Thought | Reality |
|---|---|
| "This diff is small/simple, a light pass is enough" | Diff size doesn't predict where the one real defect is — the Step 2.0 rationale pass has no size exception. |
| "The tests pass, so this is fine" | Passing tests are necessary, not sufficient — they don't catch a wrong layer choice, a duplicated scenario, an unjustified structural change, or a test that passes for the wrong reason. |
| "This pattern repeats elsewhere in the codebase already" | An existing bad pattern is not a citation for a new instance of it — flag both, don't let precedent silently launder a defect. |
| "It's only a minor addition to this file" | A small diff still pushes a file past its size ceiling or bolts a branch onto an unrelated flow — judge the resulting structure, not the diff's line count. |
| "This is AI-generated code, it's probably fine" | Generated code reads confident and plausible even when wrong — it needs the same scrutiny as any other diff, not less. |
| "I already found a few good issues, that's a solid review" | A handful of headline findings is not the same as every changed line having actually been reasoned about — see the exhaustiveness self-check below. |
| "This is basically the same as what I already flagged, I'll skip it" | A repeated pattern still needs every occurrence enumerated (per each command's Output section) — collapsing into one entry is fine, silently dropping instances is not. |
| "The author clearly knows what they're doing here" | Authors are blind to their own assumptions regardless of seniority — this review exists precisely because a second, independent pass catches what the first one couldn't. |

⸻

### Step 1 — Gather (Haiku, per Model-Routing Convention above)

Spawn Gather subagent(s) to produce one context bundle containing:

1. The MR's diff and commit log (same GitLab-MCP read, with `git fetch` fallback, as
   `review-cosmetic-pr.md`'s Step 1 item 1; also read `mr_discussions` so already-raised threads are
   not re-reported as new) — commits are written `<TICKET-KEY>: <what and why>`,
   read as the primary statement of intent.
2. The ticket's title, description, and Acceptance Criteria, read (read-only) via the
   `claude-proj-agent:atlassian-routing` skill using the key parsed from the source branch/commits — the authoritative "goal of this MR," not
   a summary guessed from the diff.
3. From the resolved `proj-ai-agentic` working tree: `docs/frame-specs/architecture.md` (layering,
   client/fixture/global-setup conventions, per-module automation maturity),
   `docs/project-spec/` (for any diff touching domain/business-rule logic),
   `rules/definition-of-done.md`; sibling files in the same area of `proj-test-automation` as the
   changed files (to spot an existing pattern/helper/fixture that should have been reused); the
   `aqa-automate.md` Mapping table (case-type → layer); and, for every new endpoint/client
   method/type the diff introduces, the exact Bruno collection file/lines or doc section it should
   extend.
4. **Prior-knowledge check, topic-scoped (not a blind full scan).** `docs/common-issues/`'s own
   `INDEX.md` (topic-folder catalog) — open every topic folder whose subject plausibly matches what
   the diff's changed lines actually do (a wait/selector/fixture strategy, an auth/date/amount
   normalization pattern, a specific table/projection the diff touches); `docs/module-theory/
   <Module>/`'s own "Patterns & Predictive Rules" section for every module the diff touches; and
   `docs/review-mr/_pattern-log.md` if it exists (created by the first `review-pr-distill-patterns`
   run; recurring findings it already confirmed across ≥3 past MRs). This is prior, repo-specific evidence of what has already
   gone wrong here before — distinct from `architecture.md`'s general conventions, and often a much
   stronger signal than a generic convention check because it's this exact codebase's own history,
   not a documented rule the diff merely didn't follow.
### Step 1.5 — Whole-Repo Blast-Radius Bundle (mandatory)

Not the same thing as item 3's "sibling files in the same area" — that's a reuse-pattern check
local to the diff's own module; this is a full-repo consumer search. For every function, class,
exported constant, or fixture the diff adds, renames, or changes the signature/behavior of, run
`git grep` across the **entire** `proj-test-automation` working tree — both `api/` and `ui/`, every
module, not just the one the diff visually lives in — for every call site. Report each match's
`file:line`, and mark explicitly which ones sit **outside** the MR's own changed-file list: those
are exactly the callers Step 2's Judge stage (and the Architect lens, when engaged) must reason
about individually, never wave through as "probably fine because the diff looks self-contained." A
changed symbol with zero external callers is itself worth stating plainly ("no consumers outside
this diff") rather than the check being silently skipped.

### Step 1.6 — Mandatory Deep-Impact Rule for `api/utils/**`

If the diff touches **any** file under `api/utils/` — any subfolder (`constants/`, `fixtures/`,
`helpers/`, `services/`) — treat it as shared, high-blast-radius infrastructure, never a
module-local change, regardless of how small or self-contained the diff looks:

- The whole-repo blast-radius bundle (Step 1.5) is not optional for this file — it is the
  primary input to judging it, not a supporting nice-to-have.
- Engage the Senior Solution Architect lens (see Role above) for this specific file, even if
  nothing else in the diff would otherwise trigger that persona's own criteria.
- For every distinct calling context found outside `api/utils/` itself (a different module's
  fixtures, a different Playwright *project* — the API-side projects and the UI-side projects run
  under one shared `workers:` budget in `playwright.config.ts`, they are not isolated runs — a
  different test file entirely), Step 2 must state explicitly, per context: does that context's
  behavior change as a result of this edit? If the answer isn't a confident, evidenced "no," file
  it as at least a `Risk` — never silently cleared because the change "looks like an internal
  implementation detail."
- This rule is not theoretical: it exists because a past `api/utils/helpers/`+
  `api/utils/fixtures/` change that looked like a self-contained fixture tweak turned out to
  activate shared cross-worker/cross-process state (a `process.env.DYNAMIC_GROUP_ID` value and a
  `test-results/dynamic-group-id.txt` file) read by 30+ call sites across both the API and UI test
  suites that the diff itself never touched or listed as changed files — a real incident from this
  command's own use, not a hypothetical risk being guarded against in the abstract.

### Step 2 — Judge (Sonnet, per Model-Routing Convention above)

Over every changed file in the Gather bundle (scope is the MR's changed-file list only — an
unmodified sibling file is supporting evidence, never a finding in its own right):

**Step 2.0 — Per-Line Rationale Pass (mandatory, runs before either lens's checklist).** Work
through the diff in the same bounded windows the cosmetic lens uses (150-300 diff lines at a
time). For **every** changed line — not only brand-new additions — record an explicit answer to
three fixed questions before moving to the next line:

1. Why was this line changed this way, specifically (what did it replace, and what's different)?
2. Why this approach and not an existing alternative already in this file, a sibling file, or the
   reuse surface read in Step 1?
3. Could this be simpler, or could it reuse something that already exists?

This is working reasoning, not prose for the final report, and it is not saved — but every changed
line must actually be reasoned about this way, including lines that turn out fine; the Coverage
table in the output records, per file, the diff lines, windows reviewed and findings. A line that gets no answer because
it "looked obviously fine" is exactly the failure mode this pass exists to close: skimming a
checklist at file level lets small, real defects (a slightly-off condition, a needlessly
duplicated scenario, an unjustified structural choice) survive because nothing forced engagement
with that specific line. Do not summarize this pass away — it is the source material Step 2.1 and
the Necessity pass below draw their findings from. A changed file with zero findings must still
show that this pass ran (its Coverage row), never a silent skip.

**Step 2.1 — AQA lens** — apply `fullstack-aqa-agent.md`'s own **Test Automation Review
Checklist** as the baseline (independence, determinism, naming, mocking boundaries, no arbitrary
waits/resilient selectors), plus:
- **Assertion specificity and honesty** — flag an assertion broader than what the test can
  actually determine (an artificially widened accepted-values list papering over an unresolved
  precondition, or a vague truthy check where a concrete value is already known), and a
  whole-object assertion where only one field is under test.
- **Layer correctness** against the Mapping table read in Step 1.
- **Test structure evaluation** — `describe`/`test` grouping, arrange-act-assert ordering,
  setup/teardown placement, checked against sibling specs and `architecture.md`'s layering. Judge
  only whether the structure is internally sound — whether it was *necessary* in this shape is
  the Skeptic lens's question in `review-pr-orchestrator.md`.
- **In-file duplicate scenario check** — for every test the diff adds or meaningfully modifies,
  read the *entire* file it lives in (not just the diff hunk) and confirm no other test already in
  that file proves an equivalent scenario. A near-duplicate is a Confirmed Issue citing both
  locations (`file:line` of the new/changed test and `file:line` of the existing one) — this is
  narrower than the AQA Lead lens's suite-wide duplicate check below and does not wait for it.
- **Text quality of test-facing prose** — every test/`describe` title, step description, and
  assertion message the diff adds or changes must be logically coherent (it says what is actually
  being verified, not a stale or mismatched description) — a name/description that no longer
  matches what the test body actually does is a Confirmed Issue. (Spelling/grammar mechanics are
  the cosmetic lens's job — see `review-cosmetic-pr.md`; this check is about logical accuracy.)
- **Verification claim consistency** — if a commit message or the ticket states something was
  tested/verified/fixed, confirm the diff itself actually contains the corresponding test
  change; a claimed fix with no new/updated test for the behavior it claims to fix is a Confirmed
  Issue (this command never runs tests itself — it checks the diff's content against its own
  claims, not against a live run).
- **Known-issue cross-check** — for every changed line whose approach (a wait strategy, a selector
  pattern, a date/amount normalization, an auth setup, a fixture/cleanup choice) matches something
  a `docs/common-issues/` entry, a `docs/module-theory/` Pattern, or a `docs/review-mr/
  _pattern-log.md` recurring finding already documented from Step 1's prior-knowledge bundle:
  - If the diff **reintroduces** the documented anti-pattern, this is a Confirmed Issue citing the
    doc directly (`Critical` if that doc describes a regression/flake/outage-class incident, per
    `severity-taxonomy.md`; `Confirmed` otherwise) — a known, previously-diagnosed mistake
    happening again is a stronger finding than a first-time convention violation, say so.
  - If the diff **correctly follows** a documented resolution, cite it as positive supporting
    evidence in the Necessity Citations section below rather than silently passing over it — this
    is exactly the kind of justification the Skeptic lens should accept without a fight.
  - If nothing in the prior-knowledge bundle applies to this diff, say so explicitly rather than
    omitting the check — this confirms the topic-scoped search actually ran.
- **Security hygiene** — per `fullstack-aqa-agent.md`'s own checklist: no hardcoded
  secret/token/password/API key in a changed file that should come from `.env`/
  `constants-keeper.ts`, no sensitive value printed via `console.log`/a test report/an error
  message the diff adds, no disabled TLS/cert verification, no external/API-response data used
  unvalidated in a request path, selector, or assertion. Always `Critical` severity when
  confirmed — see `severity-taxonomy.md`.

**AQA Lead lens** — apply `aqa-lead-agent.md`'s own **Test Review Checklist** as the baseline,
plus:
- CI/CD quality-gate impact — a diff touching `.gitlab-ci.yml` or pipeline stage/tag config is
  this lens's territory specifically.
- Duplicate or near-duplicate tests/helpers against the existing suite, **outside** the file(s) the
  diff itself touches (suite-wide scope — the in-file check above is the AQA lens's job, not
  this one, so neither lens should assume the other already covered it).
- **Suite-level architecture consistency** — whether the diff's approach fits `architecture.md`'s
  layering, independent of whether the change was necessary in the first place.

**Necessity first pass (both lenses, together)** — for every new endpoint, client method, type,
path constant, or non-trivial structural decision **and every non-trivial modification to an
existing line** (per the Step 2.0 rationale pass — not only additions): cite the exact Bruno
file/lines, doc section, or existing pattern that justifies it, per `fullstack-aqa-agent.md`'s own
citation rule. This citation is not final — record it as-is; `review-pr-orchestrator.md`'s Skeptic
lens will try to break it.

**Orphaned code check (both lenses, together)** — if the diff's change leaves anything behind that
is now unused (a helper, import, fixture, or constant no longer called/referenced anywhere after
this change), list it explicitly in the Orphaned Code section below rather than silently ignoring
it or assuming the author will notice. Never delete it yourself — this command never edits the
MR's code (see Constraints) — the finding is a question for the author, not an instruction.

Before finalizing, re-check every finding against the actual diff, ticket, or cited doc — drop or
downgrade anything not directly evidenced. Then run the **exhaustiveness self-check**: for any
changed file with zero findings across all three severities, confirm from its Coverage row that the Step 2.0 pass actually
covered every line of that file (not that the file "looked clean at a glance") — a file with real
churn (more than a handful of changed lines) and zero findings is uncommon enough that it warrants
one re-pass before being accepted, not treated as an automatic sign the file needed no comment.

⸻

## Output

Write to the resolved `proj-ai-agentic` working tree:

```
docs/review-mr/<mr-iid>-<slug-of-ticket-key-or-mr-title>/logical_analysis.md
```

If this file already exists, append a dated entry under an internal `## Changelog`.

`logical_analysis.md` contains:

1. **Summary** — one paragraph: what the MR does and why (from the ticket), not a line-by-line
   diff restatement.
2. **Confirmed Issues** / **Possible Risks** / **Nice-to-Have Improvements** — each entry follows
   `severity-taxonomy.md`'s own Finding Entry Format exactly (header/what-where-why/`Fix:`/optional
   `Example:`). For a structural/architecture finding, `Fix:` names the concrete restructuring
   (e.g. "extract into a shared helper in X", "collapse both branches into one dispatcher"), never
   just restates that the code "should be cleaner" — this is exactly the shape of finding where an
   `Example:` snippet earns its place, per that format's own rule. State explicitly (`No issues
   detected.`) when a category is empty.
3. **Necessity Citations** — one entry per new endpoint/client method/type/path constant, new npm
   dependency, non-trivial structural decision, or non-trivial modification to an existing line:
   the decision, and the cited existing pattern/Bruno file/doc section that justifies it (or, if
   none was found, say so explicitly rather than inventing one) — this is raw input for the
   orchestrator's debate, not a final verdict.
4. **Orphaned Code** — one entry per helper/import/fixture/constant this diff leaves unused: what
   it was, where it now sits unreferenced, and a direct question ("safe to remove?") rather than a
   removal instruction. State explicitly (`None found.`) when empty.
5. **Coverage** — the table defined in `severity-taxonomy.md`'s Coverage Table section.

This file is a working input to `review-pr-orchestrator.md`, not a GitLab-facing artifact.

⸻

## Constraints

- Never post to GitLab or call a GitLab REST API by hand — the read-only rule is in
  `gitlab-mcp-access.md`; never edit the MR's code.
- Never guess the ticket/goal if it can't be resolved from the branch or commits — ask.
- Never render a cosmetic/formatting verdict — that's `review-cosmetic-pr.md`'s scope.
- Every finding cites an actual `file:line`, ticket text, or doc/rule reference — no unfounded
  claims.
- Every finding's defect sits in a file the MR's diff actually changes.
- Fallback branch `_mr-<iid>-review`: created and deleted only after the user's yes, never left
  behind — see `gitlab-mcp-access.md`.

⸻

## Definition of Done

- The MR's full diff, commit history, and the ticket's Acceptance Criteria were fetched — not
  guessed from the diff alone.
- `architecture.md`, relevant `project-spec/` sections, `definition-of-done.md`, and sibling files
  in the changed area were read before judging fit/reuse.
- The Step 2.0 Per-Line Rationale Pass ran over every changed line of every changed file — no line
  skipped because it "looked fine" — and the Coverage table in `logical_analysis.md` has a row for
  every changed file; no file with real churn has zero findings without a row showing every window
  reviewed.
- Every `expect(...)` call's specificity/honesty (not message presence — that's the cosmetic
  lens's job) and every case's layer choice were checked against the Mapping table.
- The diff's test structure and its fit against `architecture.md`'s layering were reviewed.
- Every test the diff adds or meaningfully modifies was checked against the rest of its own file
  for an in-file duplicate scenario, and every test-facing title/description/message the diff
  touches was checked for logical coherence with what the test body actually does.
- Every new endpoint/client method/type/path constant/npm dependency, and every non-trivial
  modification to an existing line, carries a cited justification (or an explicit "no citation
  found") in the Necessity Citations section.
- Every hardcoded secret/token/sensitive-data-logging/disabled-TLS/unvalidated-external-data
  pattern was checked for and, if found, filed as `Critical`.
- `docs/common-issues/`'s `INDEX.md`, the touched modules' `docs/module-theory/` Patterns, and
  `docs/review-mr/_pattern-log.md` (if it exists yet) were searched topic-scoped for this diff's actual
  touched area, and the Known-Issue Cross-Check result (reintroduced / correctly-followed / none
  applicable) is stated explicitly, not silently skipped.
- Any helper/import/fixture/constant orphaned by this diff is listed in Orphaned Code (or the
  section explicitly states none was found) — never silently ignored, never silently deleted.
- The whole-repo blast-radius bundle (Step 1.5) was produced for every new/changed exported
  symbol, and every call site found **outside** the MR's own changed-file list was individually
  reasoned about in Step 2 — never assumed safe because the diff "looks self-contained."
- If the diff touches any `api/utils/**` file, the Mandatory Deep-Impact Rule (Step 1.6) ran in
  full: the Senior Solution Architect lens was engaged for that file, and every distinct calling
  context found outside `api/utils/` got an explicit changed/unchanged-behavior statement, not a
  blanket assumption.
- The chat response given to the user follows `severity-taxonomy.md`'s Response Language & Format Contract: a
  Russian narrated walkthrough (what changed, what the method does now, why, and its
  cross-project impact) ending in an explicit verdict on hidden defects/bugs/bottlenecks and
  whether a fix is needed — with `logical_analysis.md` itself left in English per that same
  contract.
- Every finding (all severities) was also given to the user in chat as an English, numbered,
  topic-grouped, plain-text `[Severity] Title` / `Fix:` / `Example:` comment, per that same contract — not a subset, and not left only in the analysis file or the Russian narrative.
- `logical_analysis.md` was written under the resolved `proj-ai-agentic` repo's
  `docs/review-mr/<mr-iid>-.../` — never GitLab, never `proj-test-automation`'s own tree.
- No GitLab comment, review, or approval was posted anywhere.
