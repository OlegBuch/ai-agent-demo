# Severity Taxonomy & Finding Format (shared across `review-cosmetic-pr.md`, `review-logical-pr.md`, `review-pr-orchestrator.md`, `review-pr-recheck.md`)

Every finding in `cosmetic_analysis.md`, `logical_analysis.md`, and `final_analysis.md` carries a
`[Severity] Title` header. `Severity` is always one of exactly these four values — never an
invented label, never left blank:

| Severity | Meaning | Goes in |
|---|---|---|
| `Critical` | Blocks merge outright: a security issue (secret/credential exposure, unsafe handling of external/untrusted data), a change that would cause data loss or a broken pipeline, or a test that passes for the wrong reason on a critical/smoke-tagged path. | **Confirmed Issues** |
| `Confirmed` | A definite, cited defect that must be fixed before merge, but doesn't rise to `Critical` — a documented-convention violation, an in-file/suite duplicate, a broken test-structure/layer choice, an unjustified change per the Skeptic debate. | **Confirmed Issues** |
| `Risk` | Not yet proven wrong, but a real, cited concern worth the author's judgment call before merging — an assumption that could break under a condition the diff doesn't cover, a pattern that's starting to drift. | **Possible Risks** |
| `Nit` | Small, optional, real but non-blocking — a naming/style preference, a Nice-to-Have simplification. The author may ignore it without discussion. | **Nice-to-Have Improvements** |

This taxonomy governs the `[Severity]` token only — it does not change the three-bucket
(**Confirmed Issues** / **Possible Risks** / **Nice-to-Have Improvements**) report structure each
command's Output section already defines; `Critical` and `Confirmed` both file under **Confirmed
Issues**, distinguished only by their `[Severity]` tag, so a reader scanning that section can still
tell which ones are the true stop-ship items at a glance.

⸻

## Approval Standard (drives `review-pr-orchestrator.md`'s Verdict only — never findings completeness)

A change is approvable when it definitely improves the suite's overall health, even if it isn't
perfect — perfect test code doesn't exist, and blocking a change over a `Nit` that doesn't affect
correctness, security, or suite architecture wastes review cycles. This standard governs **only**
the final Verdict line in `final_analysis.md` (Approve vs. Request Changes): it is never a license
to under-report. Every real finding at every severity still gets surfaced in full — the Approval
Standard decides what's blocking among findings that were already found exhaustively, it does not
decide which findings are worth looking for.

**Verdict rule:** `Request Changes` if any `Critical` or `Confirmed` finding remains, or any
Change Justification Debate challenge resolved `Not Justified`. Otherwise `Approve` — regardless of
how many `Risk`/`Nit` findings are listed; those are surfaced for the author's judgment, not treated
as blockers by default.

⸻

## Finding Entry Format

One shape, used by every command in this family for every finding — `cosmetic_analysis.md`,
`logical_analysis.md`, `final_analysis.md`'s merged findings and its Ready-to-paste `Comment N`
comment, and `re-review-analysis.md`'s New Findings. No command restates or varies this shape
inline; each one's own Output section only adds what's specific to it (e.g. the cosmetic lens's
"collapse a repeated pattern into one entry" rule).

```
[Severity] Title
<file>:<line> — <1-2 sentences: what/where/why>.
Fix: <one sentence stating the concrete change>.
Example: (optional — see rule below)
    <at most 4-6 lines of illustrative code showing the shape of the fix>
```

**`Example:` is optional, never mandatory, and included only when the `Fix:` sentence alone
leaves the actual shape ambiguous** — a structural remedy ("collapse both branches into one
dispatcher", "extract into a shared helper"), a naming/constant substitution whose exact form
matters, or a security-fix pattern (e.g. reading a secret from `.env` instead of a literal). Omit
it for anything the `Fix:` sentence alone already makes unambiguous — a missing assertion message,
a rename, a tag fix, an added test. Putting an example on every trivial finding is noise, not
help, and directly fights the Judge-stage cost discipline in `model-routing.md` — Judge-stage
output is the expensive part, and an unconditional example on every finding makes that worse for
findings that don't need one.

Rules when `Example:` is included:
- At most 4-6 lines. Illustrative shape only, in the diff's own language — never the diff's own
  lines quoted verbatim (quoting the actual diff stays banned everywhere in this family, per each
  command's own Constraints) and never presented as tested/verified/compileable code — it's a
  sketch the author still has to fit to the real types/context, not a patch to paste as-is.
  Pseudocode is fine when even a sketch of real syntax would be misleading (e.g. a CBS-specific
  API shape the Gather bundle didn't fully capture).
- Never a substitute for the `Fix:` sentence — the sentence always comes first and must stand on
  its own even if the reader skips the example.
- A repeated identical violation (per the cosmetic lens's collapse rule) gets **one** example for
  the whole collapsed entry, never one per enumerated `file:line`.

⸻

## Response Language & Format Contract

Two different audiences, two different languages — never conflate them:

- **The analysis files (`cosmetic_analysis.md`, `logical_analysis.md`, `final_analysis.md`,
  `re-review-analysis.md`) stay in English**, in the Finding Entry Format above — they are consumed
  by `review-pr-orchestrator.md`/`review-pr-recheck.md` and their findings eventually become
  English GitLab comments; changing their language would break that downstream pipeline.
- **The chat response given to the user** after `review-logical-pr.md` writes/updates its file is
  in Russian, and is not a re-paste of the file's own `[Severity] Title` bullets — it is a narrated
  walkthrough. For every changed method/file worth mentioning: what changed, what the method
  actually does *now* (after the change), why it was changed, and — per the whole-repo
  blast-radius bundle in `review-logical-pr.md`'s Step 1.5 — what it affects elsewhere in the
  project, not just in the file it sits in. Close with an explicit verdict sentence stating plainly
  whether the diff has a hidden defect, bug, or bottleneck, and whether it needs fixing before
  merge — never leave that conclusion implicit for the user to infer from a bare findings list.
- **Only after that verdict** (or, for commands without a narrated walkthrough, directly), give the
  complete ready-to-paste comment list in English, in the Finding Entry Format — **every** finding
  from the analysis file(s) written in the same invocation, at every severity (`Confirmed`,
  `Risk`, `Nit`), never only the ones the verdict flagged as blocking: the user reads the whole
  list in chat and decides per item what to post, so a curated subset removes their choice. Rules:
  - Grouped under short topic headings (e.g. impact on other specs, tests that don't prove their
    title, duplication/reuse, waits/state/cleanup, page-object robustness, repo style rules,
    nits), each comment numbered continuously so the user can say "post 3, 7, 12".
  - Plain text only — no code fences and no inline backticks, which the terminal renders as solid
    blue and makes the list hard to read. An `Example:` stays on one or two plain lines.
  - Each comment is self-contained: title, `file:line` list (collapsed repeats enumerate every
    line), what/why, one `Fix:` sentence, `Example:` only where the source finding had one.
  - Same content already recorded in the analysis file(s), reformatted for pasting — never a
    fresh analysis pass redone in English.

⸻

## Coverage Table

Per-line checking is working reasoning and is not saved, so every review output file carries one
small table as its evidence that no changed file was skipped:

| File | Diff lines | Windows reviewed | Findings |
|---|---|---|---|
| `<changed file>` | `<count of changed lines in the diff>` | `<windows of 150-300 diff lines checked>` | `<count of findings anchored in this file>` |

One row per changed file, no exceptions. A file with real churn and `0` findings is accepted only
if its row shows every window reviewed. Definitions of done refer to this table, not to per-line
notes.
