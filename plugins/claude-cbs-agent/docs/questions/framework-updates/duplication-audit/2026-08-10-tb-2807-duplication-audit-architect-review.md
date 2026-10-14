# TB-2807: Architect review of the framework-wide duplication audit

**Ticket:** TB-2807 (sub-task of TB-2798 "Current code condition refactoring", sibling of
TB-2799 which is done). Status: In Progress. Description: "Our framework has a lot of
duplicate logic and classes. We should improve it and standardize the overall approach across
the entire project."
**Input reviewed:** `framework-wide-duplication-audit.md` (62 findings, 4 tiers, discovery
only, nothing changed yet).
**Method:** spot-verified 8 of the highest-leverage findings directly against the current code
on `group-3/TB-2807` (Read/Grep, no assumptions from the document's line numbers).

## Verdict on the audit itself

The document holds up. All 8 spot-checked findings (#1, #3, #4, #14, #18/#19, #23, #29/#30,
#38) are real and current — none were stale, none were false positives. Two were actually
**undercounted**: `delay`/`wait` is reimplemented in 9 places, not "5+" (missing
`field-registry-setup.ts`, `global-setup.ts`), and `getClientInternals` exists in 3 places, not
2 (missing `global-setup.ts:40-41`, byte-identical to the other two). `users-data-builder.ts`
has 8 importers, not the stated 9. None of this changes any tier or confidence rating — if
anything it means the real duplication surface is slightly larger than reported, not smaller.
No TB-2799 spillover: only `base-api-client.ts`'s path changed (now under `services/`), the
duplicate `delay` copy inside it is untouched and still duplicate.

This means the document is trustworthy enough to execute against directly — no re-audit needed
before starting implementation.

## Architectural judgment on the two hardest calls

**#3 — two field-registry clients.** Confirmed both are live: `FieldRegistryClient` (full CRUD,
8 consumers spanning API specs, UI fixtures, and `field-registry.spec.ts`) vs.
`FieldDefinitionApiClient` (`createField` only, 3 consumers, but correctly extends
`BaseApiClient`). This is not "delete the smaller one" — it's a migration: port
`FieldRegistryClient`'s CRUD surface onto a `BaseApiClient`-derived class, then repoint 11
files total. `BaseApiClient` inheritance is the pattern every other client in the repo follows
(auth-header handling, retry hook, etc. — see #5's `isTransientClientError` hook), so the
*shape* that should survive is `FieldDefinitionApiClient`'s, carrying over
`FieldRegistryClient`'s methods. Touches both API and UI layers — treat as its own scoped
task with a dedicated regression pass, exactly as the audit's sequencing already proposes.
Needs sign-off from whoever owns Field Registry test coverage before merging, since a
regression here is silent (wrong client picked up by a spec that still passes but exercises
different code).

**#18/#19 — PF client doing Security Management's job.** Two problems bundled together, worth
splitting for sequencing purposes even though the audit lists them adjacently:

- **#19 (safety gap) is a real defect, not a style issue, and should not wait for #18.**
  `cleanupDbRecord` (`pf-api-client.ts:109-156`) deletes across a hardcoded 10-recordId ×
  8-schema × 3-space (`liv`/`nau`/`his`) matrix using only `createDbClient()` — confirmed it
  calls none of `isTestOwnedName`, `isProtectedSystemName`, or `shouldRunCleanup`, all three of
  which exist in `db-helper.ts` specifically to gate destructive cleanup and are honored by
  every other cleanup path (`cleanupTables`, `dropTestSchemas`). Today it's scoped to a fixed
  allow-list, so the blast radius is small — but that's incidental safety, not designed safety.
  If that allow-list is ever extended without someone remembering this path skips the guards
  every other path has, it becomes a real data-loss vector. Fix is small (wire the same three
  gates in) and doesn't require deciding where SM logic ultimately lives — do it first,
  independently.
- **#18 (move SM logic out of PF)** is architecturally straightforward (target endpoints already
  exist generically via `SYS_CORE_API_PATHS` per #46) but has a dependency: `security_management`
  is currently empty scaffolding (Tier 3 #44) — this is the one place in the audit where "move
  it to where it belongs" means "build out a currently-stub module," not just relocate a file.
  Slightly bigger than its neighbors in the sequencing list; don't let it block on #19.

## Everything else in Tier 1/2

The remaining audit findings are, as categorized, mechanical: same-shape duplicate consolidations
(delete the poorer copy, repoint callers, `tsc`/`eslint` verify) following the exact playbook
TB-2799 already validated for `date-helper`/`date-converter`/`day-helper`. No architectural
decision is needed for the bulk of them (#1, #4, #6, #7, #9, #10, #12, #13, #14, #16, #17, #20,
#23, #25, #27-32, #38) — they're ready to execute as-is.

Two items the audit itself flagged as needing outside input, which I'm not resolving here per
role boundaries:
- **#19's fix belongs with #18's owner decision** on whether PF keeping any SM-adjacent surface
  is intentional — confirmed technically as described, but "should PF ever call SM" is a product
  question, not an architecture one.
- **#26 (dotted vs. underscore key casing in PF types)** — audit is right that this needs
  verification against the actual PF API wire format before merging, per this project's
  "verify contract before adding/merging" convention. Not spot-checked here; flagging it stays
  open rather than guessing.

## Recommended sequencing for TB-2807

TB-2807 is *the* subtask covering this whole remaining scope (TB-2798 has no other open
children) — no need to fragment it into further Jira sub-subtasks. Track execution as a
sequence of small, independently reviewable PRs on this branch, same shape as TB-2799's two-step
pattern (mechanical move, then logic consolidation):

1. **#19 safety-gate fix** — smallest, highest-risk-if-skipped, no dependencies. Do first.
2. **Tier 1 mechanical consolidations** (the ~18 items listed above) — one PR per cluster
   (constants, client-layer helpers, `system_core/helpers`, scripts, types), verified by
   `tsc --noEmit` + `eslint`, no test run per project convention (user runs tests manually).
3. **Field-registry client consolidation (#3)** — scoped task, own PR, needs the 11-file repoint
   plus manual regression confirmation from the user.
4. **PF/SM relocation (#18, #45, #46)** — one PR, after #19 is already in.
5. **Types consolidation (#20-27, #42-43, #54-57)** — one pass, since these types cross-reference
   each other; #26 stays blocked on API-contract verification.
6. **UI flow consolidation (#29-32, #39-41)** — mirrors the `first-login-flow.ts` pattern already
   proven in `ui/utils/`.
7. **Tier 3/4 cleanup** — folded into whichever PR above touches that file; no dedicated pass.

This matches the audit's own "Recommended sequencing" with two changes: #19 pulled out and moved
to first (risk-driven, not value-driven), and no new Jira subtasks recommended since TB-2807
already is the container for this work.

## Open questions (not resolved by this review)

- Whether PF should retain any SM-adjacent capability at all (#18/#19) — product decision.
- PF type casing (#26) — needs wire-format verification against the actual PF API, not a code
  read.
- #53 (two dropdown-selection strategies) — audit itself says "may be legitimately different
  widgets," not re-verified here; treat as Tier 3, confirm only if picked up.
