# `createTestUserSession` ignored `companyCodes` for the actual session auth header

**Found:** 2026-09-11, while debugging TB-3851 ("deleted record never appears in the DEL segment").

## The bug

`createTestUser`/`createTestUserSession` accept `options.companyCodes: string[]` — but that array
only ever reached the created user's CBS profile (`COMPANY_CODES` field in the internal/external
profile payload). The actual authenticated `APIRequestContext` built by `createTestUserSession`
(the thing whose `X-Company-Code` header every subsequent request carries) ignored
`options.companyCodes` entirely and always used `process.env.COMPANY_CODE` (`'MOCK'` in this
repo's `.env`).

Net effect: any caller that built a session expecting to operate under a *different* company than
the env default — e.g. `setupFinTableWithFourEyesDynamic` (`api/system_core/helpers/
table-registry-helper.ts`) passing `companyCodes: ['MOCK', 'MOCK_1']` to get a maker/checker
session for `MOCK_1` — silently got a `MOCK`-scoped session instead. The user's CBS profile
correctly listed both companies (so permission checks passed), but every record the maker/checker
touched was written under `MOCK`, not the intended `MOCK_1`. A test polling the `MOCK_1` schema for
that record saw `COUNT = 0` forever and looked exactly like "the record never got created/purged" —
a live DB check by a developer (querying `MOCK`'s schema directly) found the record present and
correct the whole time.

**This makes TB-3851 (as originally filed — "deleted UNAU record never reaches DEL") very likely a
test-side company-context bug, not a CBS backend regression.** The backend behavior needs no fix;
the test/helper does.

## The fix (2026-09-11)

Kept a single field — no new option — and defined its semantics precisely instead:

```ts
// CreateTestUserOptions (api/utils/services/test-user-service.ts)
/** Companies granted on the created user's CBS profile. `createTestUserSession` also logs the
 * session in under `companyCodes[0]` (`X-Company-Code`) when provided — list the intended
 * active company first; any further entries are additional profile-only grants. Omitted
 * entirely falls back to `process.env.COMPANY_CODE`, same as before this field affected auth. */
companyCodes?: string[];
```

`createTestUserSession` now does `companyCode: options.companyCodes?.[0] ?? process.env.COMPANY_CODE`.
Truth table:

| `companyCodes` passed | Profile grants | Active session company |
|---|---|---|
| omitted | default `['MOCK','MOCK_1']` (`createTestUser`'s own fallback, unchanged) | `process.env.COMPANY_CODE` — unchanged |
| `['X']` (single) | `['X']` | `X` — unambiguous |
| `['X','Y', ...]` (multiple) | all of them, unchanged | `X` (the first element) |

`setupFinTableWithFourEyesDynamic`'s maker/checker calls changed from `companyCodes: ['MOCK',
companyCode]` to `companyCodes: [companyCode, 'MOCK']` — target company first — to get the intended
active company under this rule, while keeping the same two profile grants.

**Why first-element, not last-element:** no "last element is active" convention actually exists
anywhere in the codebase — a superficially similar comment in `audit-fields-regression.spec.ts`
("`COMPANY = last company`") is about a CBS audit-trail business rule for sequential per-request
`X-Company-Code` header *overrides*, unrelated to this array. First-element was chosen because it
is a no-op for every existing multi-element caller found in a repo-wide survey (e.g.
`ui/field-registry/tests/field-registry.spec.ts:62-67`, which spreads
`USER_PROFILE_VALUES.COMPANY_CODES.DEFAULT` = `['MOCK','MOCK_1']` — first element `'MOCK'` matches
the old env-default behavior exactly), whereas last-element would have silently changed it.

## Discoverability follow-up (2026-09-11, same day)

The positional rule ("first element wins") is easy to get backwards silently — exactly the mistake
this whole incident started from (`['MOCK', companyCode]` instead of `[companyCode, 'MOCK']`), and
a future caller has no way to know the convention just by looking at a raw array literal. Rather
than a comment or a second field, added a small named helper (`test-user-service.ts`) so the intent
reads from the call site itself:

```ts
export function activeCompany(active: string, ...otherGrants: string[]): string[] {
  return [active, ...otherGrants];
}
```

`setupFinTableWithFourEyesDynamic`'s two calls now write `companyCodes: activeCompany(companyCode,
'MOCK')` instead of a bare `[companyCode, 'MOCK']`. Existing single-element-array callers
(`COMPANY_CODES_MOCK`, `COMPANY_CODES_MOCK_1`, etc.) don't need this — there's no ordering
ambiguity when there's only one element. Not retrofitted onto other already-correct multi-element
callers (e.g. `field-registry.spec.ts`'s `[...USER_PROFILE_VALUES.COMPANY_CODES.DEFAULT]`) since
their current behavior is already right under the positional rule — but any *new* multi-company
`companyCodes` call site should use `activeCompany(...)` rather than a raw array literal.

**Known behavior change to verify manually (the owner runs all tests manually):**
`api/integration_chapter/tests/pf-sc-sms.spec.ts` creates two sessions specifically to test
cross-company isolation, passing single-element `COMPANY_CODES_MOCK`/`COMPANY_CODES_MOCK_1` to
each. Before this fix both sessions were silently `MOCK` (the bug affected every caller, not just
the FIN one) — the isolation test could have been passing vacuously. After this fix the two
sessions are genuinely different companies for the first time; re-run this spec to confirm the
isolation logic itself actually holds, since a failure here would be a real bug surfacing, not a
regression from this change.

## Pattern

**Any option on a shared test-framework helper that writes to two different places (a business
profile payload vs. an actual auth/session mechanism) needs to be checked at *both* destinations,
not assumed to reach both just because it's accepted in one options bag.** Before reusing an
existing multi-purpose field to fix a narrow gap, grep every call site first — a plausible-looking
convention elsewhere in the codebase (like the "last company" audit comment here) can be about a
completely different concept and lead to a wrong, broader fix than the bug needs.
