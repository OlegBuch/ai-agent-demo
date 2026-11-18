@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:mqa-commands:mqa-create-local-test-case

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

This is the **local-only, explicit-opt-in counterpart** to
`/execution:allure-commands:allure-native-create-test-case` — same requirement source, same Test Design
Protocol, same granularity/atomicity rules, but the resulting suite is written to local
`.xlsx`/`.csv` files instead of created as Allure TestOps entities. Use this command instead of
`allure-native-create-test-case` only when `<TICKET-KEY>` is intentionally **not** going through Allure
for this piece of work (offline review, a client handoff package, an ad-hoc analysis pass with no
Allure project configured for this engagement) — never run both commands for the same ticket. See
`rules/allure.md`'s note on this and `manual-qa-agent.md`'s "Output Format — Allure TestOps" /
"Versioning" sections for how the two paths coexist.

You never write automation code here. You never modify the ticket or its Acceptance Criteria — a
gap found while designing cases is an open question, not a silent fix. This command never calls
Allure TestOps or any Jira/Confluence write endpoint — it is a pure local-filesystem skill inside
the resolved `proj-ai-agentic` git working tree (per base-agent.md's "Repository & Persistence
Model").

This command is project-agnostic and works from whatever `docs/test-cases/<TICKET-KEY>/analysis.md`
says, regardless of which Jira project or Confluence space produced it.

---

## Mission

Design the full manual test case suite for `<TICKET-KEY>` — using the exact same protocol
`allure-native-create-test-case` uses — and persist it as a new, immutable
`docs/test-cases/<TICKET-KEY>/<TICKET-KEY>-test-cases-v<N>.xlsx` and the same revision's
`<TICKET-KEY>-test-cases-v<N>.csv`, then append the resulting Coverage Matrix into
`docs/test-cases/<TICKET-KEY>/analysis.md` so the requirement-analysis document stays the single
place a reader finds both *what* was analyzed and *what proves it*, even without Allure access.

There is no separate "delete a local case" command: since revisions are immutable and
append-only, removing a case means editing `docs/test-cases/<TICKET-KEY>/analysis.md` to drop the
requirement/case it traced to, then re-running this command — the next revision (`v<N+1>`) is
produced without it, exactly like any other requirement-driven change (see the Preconditions
section's revision-numbering step and Example 3 above, which already demonstrates this via a
content change; dropping a case entirely follows the same mechanism).

---

## Argument Format

```
/execution:mqa-commands:mqa-create-local-test-case <TICKET-KEY>
/execution:mqa-commands:mqa-create-local-test-case <TICKET-KEY> types:integration,smoke,regression
```

`<TICKET-KEY>` is the actual Jira issue key the analysis file was written for. `types:` behaves
**exactly** as documented in `allure-native-create-test-case.md`'s "Argument Format" section — same
override semantics, same "a level-shaped value like `types:integration` changes *how* cases are
verified, never *which* requirements are in scope" rule. Apply that section verbatim; it is not
restated here to avoid the two files drifting apart.

## Examples

```
/execution:mqa-commands:mqa-create-local-test-case TB-1306
```
→ No `types:` override — designs cases for every Required Test Type computed by
`mqa-review-story` in `docs/test-cases/TB-1306/analysis.md`. No `<TICKET-KEY>-test-cases-v*.xlsx`
exists yet for TB-1306, so this writes `v1` (`.xlsx` + `.csv`) and appends the Coverage Matrix to
`analysis.md`.

```
/execution:mqa-commands:mqa-create-local-test-case TB-1306 types:api
```
→ Single-type override. If the analysis file's matrix also required `Regression`, that gets
flagged explicitly as dropped coverage rather than silently skipped (same rule as
`allure-native-create-test-case`).

```
/execution:mqa-commands:mqa-create-local-test-case TB-1860
```
→ `TB-1860-test-cases-v4.xlsx`/`.csv` already exist. This run designs the suite fresh from the
*current* `analysis.md` (re-running the full protocol, not a patch) and writes the result as `v5`
— `v1`–`v4` are left untouched. State plainly what changed between `v4` and `v5` in the chat
summary and in `analysis.md`'s own `## Changelog`.

---

## Preconditions

- `docs/test-cases/<TICKET-KEY>/analysis.md` exists in the resolved `proj-ai-agentic` git working
  tree (never `${CLAUDE_PLUGIN_ROOT}`, never the consuming repo's own tree). If it doesn't exist,
  stop and run `/execution:mqa-commands:mqa-review-story` first — do not re-derive Business
  Flows/BRs/ACs from scratch here. If it exists with `Status: Draft`, proceed but flag every open
  question in that file as a risk to case accuracy, same as `allure-native-create-test-case`.
- If you already know — from this session, or because the user says so — that `<TICKET-KEY>` has
  (or will have) test cases in Allure TestOps, stop and confirm with the user that a local suite
  is intentional before proceeding; don't silently create a second, diverging suite for the same
  ticket. This command never queries Allure itself to check (that would blur the "fully local, no
  Allure calls" boundary) — the check is based on session context/explicit confirmation only.
- List `docs/test-cases/<TICKET-KEY>/` for existing `<TICKET-KEY>-test-cases-v*.xlsx` files to
  determine the next revision number `N` (highest existing `+1`, or `1` if none exist). Confirm
  the matching `.csv` for the highest existing `.xlsx` also exists at the same `N` — if the two
  formats' highest `N` ever disagree (a prior run wrote one format but not the other), treat that
  as a defect to fix at the *next* revision, never by silently overwriting the mismatched file.

---

## Test Design Protocol

### Steps 1–2 — identical to `allure-native-create-test-case`

Apply `allure-native-create-test-case.md`'s `## Test Design Protocol`: **Step 1 (Load traceable requirement items, including
Cross-Module Discovery when Integration is in scope)** and **Step 2 (Design cases per required
test type, under the Granularity/Decomposition/Story-scoping rules)** exactly as written there —
same source (`analysis.md`'s `BR-*`/`ALT-*`/`AC-*` per module), same test design techniques, same
hard rules on combining/decomposing/atomicity from `manual-qa-agent.md`. This file does not
restate them; re-reading them here as if this were a different protocol is how the two commands'
rules would silently drift apart.

The only divergence starts at Step 3 below — instead of building Allure DTOs, build the same
designed cases into the local table format.

### Step 3 — Assemble the 13-column table

Every module's cases get one shared, fixed row shape — the 12 columns from `manual-qa-agent.md`'s
"Required Test Case Table Format" plus one additive `Automation Status` column (this is the local
counterpart's own file, not Allure, so `Automation Status` is a genuine 13th column here — unlike
the Allure mapping in `rules/allure.md` §4, where it lives in a dedicated field instead):

| No. | Story | Test level | Test type | Short Description | Preconditions | Steps to reproduce | Test Data | Expected Results | Rule&AC | State | Modules / Sub-Modules | Automation Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- **No.** — `TC-01`, `TC-02`, ... sequential within the *whole* document (not restarting per
  module), matching whatever numbering the designed cases from Step 2 used.
- Every other column through `Modules / Sub-Modules` — exactly as defined in
  `manual-qa-agent.md`'s "Required Test Case Table Format", including the "Numbered-content
  formatting" rule (each numbered Steps/Test Data/Expected Results item is its own visually
  separated block — in a spreadsheet cell, an embedded newline between items, never `1) X 2) Y`
  run together).
- **State** — left empty, exactly as in the Allure path; never pre-filled by this command.
- **Automation Status** — `Not Automated` for every case at authoring time (never pre-set to
  `Automated`/`Not Automatable` by this command — that's this suite's counterpart to
  `aqa-automate`'s job, which for a local suite means hand-updating this column when automation
  work happens against it).

Group the assembled rows by module/linked user-story unit (the same units `analysis.md` and Step
2 used) — this grouping becomes the per-module sheet split in Step 4.

### Step 4 — Write the local files

Build both files for revision `v<N>` (resolved in Preconditions) inside
`docs/test-cases/<TICKET-KEY>/`:

**`<TICKET-KEY>-test-cases-v<N>.xlsx`** — multi-sheet workbook:

- **`Info`** sheet (first sheet): `Ticket: <TICKET-KEY>`, `Related Epic: <EPIC-KEY, or "none">`,
  `Source Analysis: docs/test-cases/<TICKET-KEY>/analysis.md`, `Revision: v<N>`,
  `Suite Status: Draft` (never pre-set to `Approved` by this command — reviewed and flipped by
  hand later, the same principle as Allure's `status: Draft` on create), `Owner: Manual QA`,
  `Required Test Types: <list from analysis.md, with the types: override noted if one was given>`.
  Name this field `Suite Status`, not `Status` — `analysis.md`'s own metadata block already has a
  `Status: Draft | Reviewed` field for the *analysis document itself*; keep the two distinct so a
  reader never conflates "is the analysis reviewed" with "is this test suite approved."
- One sheet **per module/linked user-story unit**, in the same order as `analysis.md`'s "Modules
  Touched" list. Sheet name = the module's short name, sanitized to Excel's 31-character limit and
  stripped of `: \ / ? * [ ]` (Excel-illegal in sheet names) — put the module's full, exact `Story`
  title inside every row's own `Story` column regardless of how the sheet name had to be
  shortened, so the row itself is never ambiguous even if the sheet tab is truncated.
  Header row = the 13 columns above, followed by that module's case rows in `No.` order.

**`<TICKET-KEY>-test-cases-v<N>.csv`** — one flat table, same 13 columns, same header row, **all**
modules' rows concatenated in `No.` order (the `Story` column is what disambiguates which module a
row belongs to, since CSV has no sheets). Do not duplicate the `Info` sheet's metadata into the
CSV — `Suite Status` and the rest of that metadata live only on the `.xlsx`'s `Info` sheet;
consumers who need it read that sheet, not the CSV. Use standard RFC 4180 quoting (a cell
containing a comma, quote, or newline is wrapped in `"..."` with internal `"` doubled) — never
hand-roll escaping that breaks on a step/data cell containing a comma.

Use whichever locally available scripting runtime can actually produce valid `.xlsx`/`.csv` output
for this data — Python's stdlib `csv` module plus `openpyxl` for the workbook is the
already-demonstrated approach in this repository's own history (see
`docs/chat-history/2026-07-17_14-07_tb-1860-idempotency-integration-test-cases.md`'s
`md_to_xlsx_v5.py`); there is no single blessed script checked into this repo, so write a small
one-off script (in the scratchpad, not committed) that takes the Step 3 table and emits both files
directly at their target paths. After writing, verify: the `.xlsx` opens with `1 + <module count>`
sheets and the right per-sheet row counts, and the `.csv`'s row count (minus its header) equals the
sum of every module's case count in the `.xlsx` — a mismatch means a case was dropped or
duplicated during generation, not a design defect from Step 2, and must be fixed before proceeding
to Step 5.

Never overwrite an existing `v<N>` file. If a bug is found in a just-written `v<N>` before moving
on, show the user which file would be deleted and rewritten, wait for an explicit yes, then delete
and rewrite that same `v<N>` (it was never committed/shared yet) rather than leaving a
broken revision behind — but once the user has seen and accepted a revision, any further change is
a new `v<N+1>`, never an edit to the file they already reviewed.

### Step 5 — Coverage Matrix, appended to `analysis.md`

Build the same Coverage Matrix `allure-native-create-test-case.md`'s Step 5 builds — every
`BR-*`/`ALT-*`/`AC-*` from every module in `analysis.md` → local case No.(s) (`TC-01`, ...) → Test
level/Test type — with the same presence checks (no requirement item mapped to zero cases, no case
over the two-`AC-*` cap outside the lifted Integration exception, no case naming more than one
Story, every multi-dimensional rule decomposed one-case-per-dimension, every `Integration`-level
case reaching a second real module with a persistence-layer verification step).

Present it in chat as a table. Before writing to `analysis.md`, show the user the section and
Changelog entry to be added — and, if an earlier `## Coverage Matrix (local suite v<N>)` section
would be replaced, show what is replaced — and wait for an explicit yes. Then append it into `docs/test-cases/<TICKET-KEY>/analysis.md`
as a new (or replaced, if this ticket already has one from an earlier local revision) `## Coverage
Matrix (local suite v<N>)` section placed after `## Required Test Types` and before `##
Changelog`, referencing the case numbers exactly as they appear in `v<N>`'s files. Add a
`## Changelog` entry in `analysis.md` noting the new revision was created and, if this isn't `v1`,
a one-line summary of what changed since the previous revision (same spirit as
`mqa-review-story.md`'s own Changelog convention). This is what keeps `analysis.md` the single
place a reader finds both the requirement analysis and its current traceability, even though the
cases themselves live in a spreadsheet, not in Allure.

---

## Output

- `docs/test-cases/<TICKET-KEY>/<TICKET-KEY>-test-cases-v<N>.xlsx` and the matching `.csv`, both
  new, neither overwriting a prior revision.
- `docs/test-cases/<TICKET-KEY>/analysis.md` updated in place with the new/replaced `## Coverage
  Matrix (local suite v<N>)` section and a `## Changelog` entry.
- The Coverage Matrix presented in chat (Step 5).
- Leave every changed/created file as an uncommitted change in the resolved `proj-ai-agentic`
  working tree and say so plainly — committing/pushing happens only via the `/create-pr` skill,
  per base-agent.md's "Repository & Persistence Model." Never commit here.
- Unlike `allure-native-create-test-case`, prepare no Jira comment linking to these files — a
  local filesystem path on this machine's `proj-ai-agentic` checkout is not a reachable link for
  anyone else viewing the ticket (and Jira is never written by this framework). If the suite needs to be shared, that's a manual step for the
  user (attach the file, or run `/create-pr` and share the PR), not something this command does.

---

## Constraints

Never write a case that doesn't trace to a specific `BR-*`/`ALT-*`/`AC-*` ID. Never skip a
required test type without recording a reason. Never author Unit test cases as prose — track them
per `manual-qa-agent.md`, same as the Allure path. Never invent behavior not present in
`analysis.md`. Never name more than one Story in a case's `Story` column. Never combine more than
two `AC-*` IDs into one case unless it's a genuine cross-module Integration case per the lifted
cap, and never use that exception to shrink the document. Never skip Cross-Module Discovery before
designing Integration cases. Never overwrite an existing `<TICKET-KEY>-test-cases-v<N>.xlsx`/`.csv`
— always the next `N`. Never let the `.xlsx` and `.csv` for the same run disagree in row count or
content. Never pre-set `Suite Status` to `Approved` or `Automation Status` to anything but
`Not Automated` at authoring time. Never run this command for a ticket you have reason to believe
already has an Allure suite without first confirming the local path is intentional. Never call any
Allure, Jira write, or Confluence write endpoint from this command — it is local-filesystem only
(reading the ticket/Confluence during Steps 1–2 happens only insofar as `analysis.md` already
captured what's needed; this command itself does not re-fetch Jira/Confluence).

---

## Definition of Done (for this command's own output)

- Every `BR-*`, `ALT-*`, and `AC-*` from every module in `analysis.md` maps to at least one local
  test case, at the same granularity `allure-native-create-test-case` would require
- The `.xlsx` has an `Info` sheet (`Suite Status: Draft`, ticket/epic/revision metadata) plus one
  sheet per module, and the `.csv` has the same cases flattened into one table — same row count,
  same content, same revision number `N`
- No case names more than one Story; no case traces to more than two `AC-*` IDs except a genuine
  cross-module Integration case under the lifted-cap exception
- Every `Integration`-level case includes a persistence-layer verification step and actually
  reaches a second real module/sub-module
- Every case has a concrete, verifiable Expected Result and is fully self-contained
- `docs/test-cases/<TICKET-KEY>/analysis.md` has an up-to-date `## Coverage Matrix (local suite
  v<N>)` section and a new `## Changelog` entry for this revision
- No prior revision's `.xlsx`/`.csv` was overwritten or deleted
- Every changed/created file is left as an uncommitted change, with that stated plainly to the
  user — nothing was committed, pushed, or posted to Jira/Allure by this command
