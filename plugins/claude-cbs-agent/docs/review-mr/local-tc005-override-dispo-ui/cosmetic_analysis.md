# Cosmetic Review — TC-005 UI diff (ui/override-dispo/, eslint.config.mjs)

No real GitLab MR exists for this diff (uncommitted local change) — this is an ad-hoc run of
`review-cosmetic-pr`'s protocol against the local diff directly, per the user's explicit choice.

## Summary

Reviewed 7 new files (216 lines) under `ui/override-dispo/` plus the 2-line addition to
`eslint.config.mjs`'s `assertFunctionNames` array — every line checked, no sampling. Comment
hygiene passes (zero `//`/`/*` occurrences across all 7 new files, verified by grep). Tag taxonomy
(`@ui`, `@smoke_m2`) and every `expect(...)` message are present and correct. Two Confirmed dead-code
findings (unused constants, unused Locators), two Possible Risks (a cleanup-on-failure gap and an
unresolved Story-describe formatting inconsistency already flagged as an open question in
`testing-standards.md`), and two Nice-to-Have naming/magic-number notes. `override-dispo-ui-paths.ts`,
`override-dispo-ui-test.ts`, and `override-dispo.types.ts` had zero findings — confirmed line-by-line
against the `field-registry/` reuse surface with no violation on any line. No commits exist yet for
this diff (uncommitted local changes), so Commit Message Quality has nothing to check.

## Confirmed Issues

**[Confirmed] Dead constants in `OVERRIDE_DISPO_UI_CONSTS`**
`ui/override-dispo/constants/override-dispo.values.ts:3,7,10` — `FIELD_IDS.ROUTE_TO` (line 3),
`FIELD_IDS.REPORTING_TO` (line 7), and `DATE_DISPLAY_FORMAT` (line 10) are exported but never
referenced anywhere in the diff. Violates the Line-Level Checklist's "no unused exported constant."
Fix: remove the three unused entries.
Resolution: **Fixed** — all three removed; `DATE_FIELD_KEYSTROKE_DELAY_MS` added in their place
(actually consumed by `fillDateField`).

**[Confirmed] Dead Locators on `OverrideDispoPage`**
`ui/override-dispo/pages/override-dispo-page.ts:13-16,25-28` — `recordIdSelect`, `inputOpButton`,
`seeOpButton`, and `saveDraftButton` are declared and initialized but never read anywhere.
Fix: delete the four unused Locators.
Resolution: **Fixed** — all four removed.

## Possible Risks

**[Risk] `provisionOverrideDispoUiPreconditions` has no cleanup-on-failure path**
`ui/override-dispo/fixtures/override-dispo-setup.ts:7-28` — if `ensureInternalSmUserForDispoOfficer`
throws, `validationUsers.cleanup()` is never called, leaking two Keycloak users.
`field-registry-setup.ts:163-179` handles the equivalent shape with a `catch`/cleanup/rethrow.
Fix: wrap the body in `try`/`catch`, calling `validationUsers.cleanup()` before rethrowing.
Resolution: **Fixed** — wrapped as suggested.

**[Risk] Story-`describe` title format diverges from the direct UI sibling**
`ui/override-dispo/tests/override-dispo.spec.ts:12` uses the API-style
`'US-02.05.05 | Disposition Officer Configuration'` pipe format. `testing-standards.md`'s own
"Known gaps" section documents this exact UI-vs-API inconsistency as unresolved and says to confirm
the convention before adding the next UI spec, rather than silently picking one.
Resolution: **Not fixed, flagged to the user** — this is a genuine open repo-wide convention
question, not something one test should unilaterally resolve. Left as the pipe-delimited form
(matches the API side's own convention and doesn't contradict `field-registry.spec.ts`, which nests
Story-scoped `describe` too, just without the pipe).

## Nice-to-Have Improvements

**[Nit] `TC-005` uses 3-digit padding, inconsistent with this module's two closest siblings**
`ui/override-dispo/tests/override-dispo.spec.ts:13`.
Resolution: **Not fixed, by design** — `TC-005` is the case's assigned identifier from the original
request, not an arbitrarily chosen number; renaming it would desync it from the id it's actually
tracked under.

**[Nit] Unnamed magic number for the date-field keystroke delay**
`ui/override-dispo/pages/override-dispo-page.ts:50` — bare `20`.
Resolution: **Fixed** — extracted to `OVERRIDE_DISPO_UI_CONSTS.DATE_FIELD_KEYSTROKE_DELAY_MS`.
