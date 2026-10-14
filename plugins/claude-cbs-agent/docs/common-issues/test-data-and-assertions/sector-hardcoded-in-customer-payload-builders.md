# `SECTOR` hardcoded into `dm-payload-builder.ts`'s customer builders — API now requires it omitted (`NO_INPUT`)

## The pattern/symptom

`CM.CUSTOMER~RETAIL.INPUT` and `CM.CUSTOMER~CORPORATE.INPUT` now reject any INPUT payload that
contains a `SECTOR` key at all, with `400 Field 'SECTOR' with behavior NO_INPUT must not be
supplied by the caller`. This is a schema-level "key must be absent" check, not a value check —
sending `SECTOR: <anything>`, including an override meant to replace a hardcoded default, still
trips it.

## The rule

`buildRetailCustomerInputPayload` and `buildCorporateCustomerInputPayload`
(`api/document_management/dm-payload-builder.ts`) both hardcode
`SECTOR: DM_CONSTS.RETAIL_CUSTOMER_DEFAULTS.SECTOR` directly into their `data` object, with
`...overrides` spread last — so a caller can change the *value* (e.g. `prepareCustomerWithoutMatchingRule`
passing `SECTOR: sectorId` to select a rule-free sector) but can never omit the *key*, because the
literal is always present before the spread. Every caller of either builder — direct or via a
helper that layers its own overrides on top (`buildDmCustomerRoleInputPayload`,
`prepareCustomerWithoutMatchingRule`, `createAuthorisedRetailCustomer`, etc.) — fails the same way
until the key itself is removed from the builder's unconditional defaults.

Fixing this needs more than deleting the two hardcoded lines: at least one caller
(`prepareCustomerWithoutMatchingRule` in `dm-regression-helper.ts:817-840`) relies on setting a
specific `SECTOR` to select a customer that matches no `BUSINESS.RULE` — if the API no longer
accepts `SECTOR` on INPUT at all, that scenario needs a different mechanism (a sector-independent
"no matching rule" fixture, or confirmation from Confluence/dev on how sector-based rule matching is
now meant to be driven) before its test can be rewritten, not just have the field stripped.

## The incident (2026-09-16, bankstg e2e runs)

Reproduced identically in two same-day runs (`vm-results-e2e-20260916-093211` and
`vm-results-e2e-20260916-110804`) across every `customer-party-integration.spec.ts` test that
creates a customer through either builder:

- `US-03.01.01 | Client Onboarding` (line 134) — `CM.CUSTOMER~RETAIL.INPUT`, via
  `prepareCustomerChecklist` → `buildRetailCustomerInputPayload`.
- `Customer to External User Linkage` (line 208) — same path.
- `Customer Profile Defaulting (CM.CUSTOMER.DEFAULT)` (line 496) — `CM.CUSTOMER~CORPORATE.INPUT`,
  via `buildCorporateCustomerInputPayload`.
- `US-03.01.06 | Automated Reverse Relationship Generation` (line 633) — via
  `prepareCustomerWithoutMatchingRule` → `buildRetailCustomerInputPayload({ SECTOR: sectorId, ... })`;
  confirms the override-the-value approach doesn't help, since the key is still present.

Not yet automated: whether this is a genuine, intentional API contract change (Confluence/dev not
yet checked) or a environment regression. Until confirmed, treat as blocking — do not silently strip
`SECTOR` from the builders without checking whether any positive-path test actually needs to set it
to a non-default value for a reason other than the now-broken rule-matching scenario above.
