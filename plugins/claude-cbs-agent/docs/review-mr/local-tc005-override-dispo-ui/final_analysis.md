# Final Review — TC-005 UI diff (ui/override-dispo/)

No real GitLab MR exists — run ad-hoc against the local uncommitted diff, per the user's explicit
choice, merging `cosmetic_analysis.md`, `logical_analysis.md`, and this command family's own
Change Justification Debate stage into one report.

## Summary

TC-005 (the UI equivalent of the API's TC-36) adds `ui/override-dispo/`, following
`field-registry/`'s established module shape and reusing the API-side `override-dispo-helper.ts`
provisioning. Two Confirmed Issues (a provisioning cleanup gap, a bare-timeout flake risk) and
three fixable cosmetic/structural Nits were found and fixed during this review. Two Risks were
resolved with a defensive code change (RBAC GROUPS override) or shown to already be moot via this
task's own live browser verification (raw API text rendering, DOM/selector provenance). Two Risks
remain genuinely open and are not this diff's to fix (a repo-wide pre-existing bug, an unresolved
UI `describe`-nesting convention question) — both are called out explicitly below for the user's
awareness rather than silently left for someone to rediscover.

## Confirmed Issues

All Confirmed Issues from both lenses were fixed during this review — none remain open:

1. **[Confirmed] Dead code** (unused `FIELD_IDS.ROUTE_TO`/`.REPORTING_TO`, `DATE_DISPLAY_FORMAT`,
   four unused Locators, `SEE_PATH`/`INPUT_PATH`) — removed.
2. **[Confirmed] Provisioning failure leak** in `override-dispo-setup.ts` — wrapped in
   `try`/`catch`, calling `validationUsers.cleanup()` before rethrowing.
3. **[Confirmed] Bare-timeout assertion** in `assertRecordNotPersisted` — given an explicit
   `UI_MODAL_VISIBLE_TIMEOUT_MS`, matching the sibling method's pattern.

## Possible Risks

**[Risk] Story-`describe` title format (pipe-delimited, API style) vs. `field-registry.spec.ts`'s unpunctuated style**
Genuinely open, repo-wide convention question per `testing-standards.md`'s own "Known gaps"
section — not resolved by this review, flagged for the team to decide.

**[Risk] Pre-existing `WORKSPACE_MENU_ROOT_ID` gap can bounce any `dashboardUser` session**
Documented, repo-wide, pre-existing — out of scope for this diff, inherited exposure only.

## Nice-to-Have Improvements

- `TC-005`'s 3-digit padding — kept as-is (assigned case id, not a free naming choice).
- `externalOfficerId` provisioned-but-unused — accepted as intentional parity with the shared API
  helper.
- `fillAbsence`'s internal fill order (END before START) vs. its parameter order (start, end) —
  kept as the empirically-verified-working order; not changed to avoid trading working behavior
  for cosmetic symmetry.

## Change Justification Debate

**Challenge 1 — Every DOM selector/testid/URL-shape/field-id this diff introduces carries "no
citation found" in `logical_analysis.md`'s Necessity Citations.**
Skeptic: a change with no cited existing alternative is, by this framework's own default,
unjustified until demonstrated otherwise — and normally the remedy is "go find the Bruno file/doc
section that already covers this."
Full Stack AQA rebuttal: no such file/doc exists to find — confirmed via `architecture.md`'s own
note that the only prior attempt at this exact surface (a generic Table Registry runtime UI) was
an abandoned, never-merged branch, and via a direct repo-wide grep turning up zero hits for any of
these testids/ids/paths outside this diff's own two files. In place of a doc citation, every one of
these values was verified directly against the live bankstg environment in this same task (real
`data-testid`/`id` attributes read via the browser's own DOM, real notification text observed after
a real rejected save, real URL structure observed after real navigation) — the same evidentiary
weight a Bruno-file citation carries for API work, just sourced from the live UI instead of a
contract document, because no contract document for this UI surface exists yet.
Resolution: **Justified.** Live verification against the actual environment is an acceptable
citation when no doc/Bruno equivalent exists — the alternative (refusing to automate any first-of-
its-kind UI surface until a doc is written first) would block all new UI coverage in undocumented
territory, which is a worse outcome than a live-verified value with no doc backing yet. Recorded as
a residual gap: no `docs/module-theory/` entry captures this surface's selector conventions yet;
offered to the user as optional follow-up, not written unprompted in this pass.

**Challenge 2 — Registering two new function names in `eslint.config.mjs`'s shared
`assertFunctionNames` array is a change to a shared/framework file (a Presumptive Escalation
Trigger) for a single new test module.**
Skeptic: could the same lint requirement have been satisfied without touching shared config, e.g.
by calling `expect(...)` directly at least once in the test body instead, as several existing specs
do?
AQA Lead rebuttal: the array already carries ~20 entries of exactly this shape (`assertStatus`,
`assertDispoOfficerInputRejected`, etc.), including one for this same module family on the API
side — this is the established, repeatedly-used extensibility mechanism for exactly this need, not
a one-off. Forcing a redundant direct `expect()` call in the test body purely to dodge editing this
list would fight the page object's own design (keeping the test body declarative via named
`assert*` methods, consistent with `test.step` narration) for no real benefit.
Resolution: **Justified.** Two lines appended to an already-established, repeatedly-extended list
is proportionate; not a case of feature logic leaking into a shared module.

**Challenge 3 — `OverrideDispoPage` is the first page object to automate the generic Table
Registry runtime screen; is it a near-duplicate of the abandoned
`UI-Test-implementation--Table-Registry---Regression` branch's work (`architecture.md`)?**
Skeptic: that branch was building exactly this surface — a bespoke near-duplicate is a Presumptive
Escalation Trigger even against unmerged prior art, if it's discoverable.
Full Stack AQA rebuttal: that branch was never merged and, per `architecture.md`'s own account,
hand-rolled divergent base classes (`base-modal-page.ts`/`searchable-select.ts`) rather than using
the current canonical `BasePage`/`BaseComponent`. `OverrideDispoPage` extends `BasePage` directly
and introduces no parallel base-class hierarchy — there is no current, mergeable alternative this
diff bypassed.
Resolution: **Justified.** Not a duplicate of anything currently reusable; flagged in Possible
Risks as historical context, not a defect.

**Challenge 4 — Was the default `dashboardUser` (no `dashboardUserOptions` override) actually
checked against an existing alternative before being used, or just assumed sufficient?**
Skeptic: `field-registry.spec.ts` is a directly comparable precedent that explicitly didn't use the
default for a similar Administration-family screen — using the default here without checking that
precedent first is exactly the kind of unverified assumption this lens exists to catch.
AQA Lead: concedes — the default was used without checking the comparable precedent first.
Resolution: **Not Justified**, as originally written. **Fixed during this review**: added
`test.use({ dashboardUserOptions: { profileOverrides: { GROUPS: undefined } } })`, mirroring
`field-registry.spec.ts`'s own citation for the same need. Promoted finding, now closed by a code
change rather than left open.

## Verdict

**Approve.**

No `Critical`/`Confirmed` finding remains open — both were fixed during this review — and the one
Change Justification Debate challenge that resolved `Not Justified` (Challenge 4) was also closed
with a code fix before this report was finalized, not merely noted. The remaining Possible Risks
are genuine, cited, and worth the author's/team's judgment (the `describe`-nesting convention
question, the pre-existing `WORKSPACE_MENU_ROOT_ID` gap), but neither blocks this specific diff per
`severity-taxonomy.md`'s Approval Standard.

## Ready-to-paste comment

```
Пункт 1
[Risk] Story-describe title format (pipe-delimited) vs. field-registry.spec.ts's unpunctuated style
`ui/override-dispo/tests/override-dispo.spec.ts:12` — testing-standards.md's own "Known gaps" section
flags this exact UI-vs-API describe-nesting inconsistency as unresolved and asks to confirm the
convention before adding the next UI spec, rather than silently picking one.
Как исправить: team decision on which shape ui/ specs should use going forward; align this file (or
field-registry.spec.ts) once decided — no urgency to block on it now.

Пункт 2
[Risk] Pre-existing WORKSPACE_MENU_ROOT_ID gap can bounce this test's dashboardUser session
docs/common-issues/test-user-service/dashboard-user-never-sets-workspace-menu-root-id.md — every
dashboardUser is missing WORKSPACE_MENU_ROOT_ID, previously observed to bounce a Table-Registry-
reaching page back to /selectCompany. Inherited by this new test, not introduced by it.
Как исправить: fix at the shared test-user-service level (out of scope for this diff); until then,
a flaky-looking failure on this test may actually be this known issue, not a real regression.
```
