# Logical Analysis — MR !156 (TB-1740: Customer Flow Integration)

## Summary

MR !156 (branch `group-7/TB-1740-Customer-Flow-Integration`) adds the repo's first Customer/Party
integration suite, `api/customer/tests/customer-party-integration.spec.ts` (6 Allure-linked cases,
1839–1844), covering: retail customer onboarding + 4-eyes AUTH, Customer→`SM.USER~EXTERNAL`
linkage with role-driven document obligations and `ACTIVATE` gating, corporate customer profile
defaulting (`CM.CUSTOMER.DEFAULT`), automated reverse-relationship generation
(`CM.CUSTOMER.RELATIONSHIP`), draft-customer deletion/document-checklist archival to `HIS`, and an
expired-document AUTH block. TB-1740's own Jira ticket carries no description beyond a link to an
external Google Sheet of TC designs (not fetchable by this review — flagged as a research-source
gap, not a defect). The MR bundles two supporting changes: a `TEST_CONSTS.OPERATION.VIEW_HISTORY`
field-name fix (`version` → `seqNo`, citing the closed bug TB-3309) applied at its two call sites,
and a refactor + extension of `auth-service.ts`'s Keycloak user provisioning to add a
master-realm-admin path (`createMasterAdminKeycloakUser`/`deleteMasterAdminKeycloakUser`), since
the existing service-account path is stated to be unusable on `proj-qa`.

⸻

## Confirmed Issues

**[Major] Four of six `test.describe` blocks skip the mandatory `US-XX.YY.ZZ |` Story prefix**
`customer-party-integration.spec.ts:215` (`'Customer to External User Linkage Raises a
Role-Specific Document Obligation'`), `:474` (`'Customer Profile Defaulting
(CM.CUSTOMER.DEFAULT)'`), `:960` (`'Draft Customer Deletion & Document Checklist Archival'`), and
`:1053` (`'Expired Document Blocks Contract Authorisation'`) are nested `describe` titles with no
`US-XX.YY.ZZ | ` prefix, unlike the file's own `:140` (`'US-03.01.01 | Customer Creation'`) and
`:637` (`'US-03.01.06 | Automated Reverse Relationship Generation'`). `testing-standards.md`'s
"Naming & Nesting Conventions" section states every case belongs inside a
`test.describe('US-XX.YY.ZZ | <Story title>', ...)` copying the Story title verbatim, with no
carve-out for cases lacking a US-code.
**Fix:** add the Story's `US-XX.YY.ZZ` prefix (from the corresponding Allure case's `Story` field)
to the four bare `describe` titles.

**[Major] New `api/customer/` test folder owns none of its own client/helper infrastructure**
`customer-party-integration.spec.ts:25-59` imports every API-calling and DB helper it uses —
`dm-helper.ts`, `dm-regression-helper.ts`, `dm-payload-builder.ts` (all `document_management`),
plus `system_core/client/table-registry-api-client.ts` — with zero exports of its own module.
`architecture.md`'s "Module Organization" section defines the per-module shape as
`client/`+`helpers/`+`tests/`+`<module>-api-paths.ts`, and separately documents `integration_chapter`
as the one module built for exactly this shape ("cross-module only, no client/paths of its own;
end-to-end scenarios") — which is what this suite actually is, given it exists to prove Customer
actions trigger Document Management obligations, 4-eyes AUTH, and Keycloak linkage.
**Fix:** either file this suite under `api/integration_chapter/tests/` (the module architecture.md
already defines for this shape of test), or give `api/customer/` its own client/helpers per the
standard shape rather than wholesale-importing `document_management`'s.

⸻

## Possible Risks

**[Medium] Shared `RETAIL_CUSTOMER_DEFAULTS.LANGUAGE` default changed suite-wide, unexplained**
`api/utils/constants/constants-keeper.ts:1101` changes `LANGUAGE: 'EN'` → `LANGUAGE: 'en-GB'`
inside `DM_CONSTS.RETAIL_CUSTOMER_DEFAULTS`, which `dm-payload-builder.ts:276`
(`buildRetailCustomerInputPayload`) consumes; that builder is called from
`dm-regression-helper.ts:333,747,832,1298` — pre-existing call sites outside this MR's own spec, so
every existing regression test that creates a retail customer through those helpers now gets
`en-GB` instead of `EN`. No commit message or code comment explains why this default needed to
change for a Customer-flow ticket, and no in-repo assertion was found pinning the old `'EN'`
literal (verified via `git grep`), so no confirmed breakage — but it is an unscoped, suite-wide
default change riding along with TB-1740.
**Fix:** confirm with the team whether `en-GB` is the platform's actual expected language code
(consistent with `en-GB` used elsewhere, e.g. Bruno's own `name.en-GB` fields) and, if so, call
that out explicitly in the commit message as an intentional suite-wide correction rather than an
incidental default tweak.

**[Medium] `INDUSTRY` field added to `RetailCustomerInputData` may not exist on the real retail INPUT schema**
`api/types/document-management.types.ts:120` adds `INDUSTRY?: string` to `RetailCustomerInputData`
alongside `TARGET?: string`. A Bruno search of `CM.CUSTOMER~RETAIL.INPUT`'s schema
(`collections/Tables/Customer Management/00 - Seeding/06 - Bind Hooks and Events/01 - Create
Projections/Create projection CM.CUSTOMER~RETAIL.INPUT.yml`) found `TARGET` as a real property but
no `INDUSTRY` property. STEP 4 of the `CM.CUSTOMER.DEFAULT` test (Allure 1841,
`customer-party-integration.spec.ts:604-632`) inputs a retail customer omitting `INDUSTRY` and
asserts `SEE` returns `INDUSTRY: undefined` — a comment at `:72` notes the defaulting plugin "moved
off RETAIL 2026-08-24." If the field genuinely doesn't exist on the retail schema at all (rather
than existing-but-no-longer-defaulted), the assertion is trivially true regardless of whether the
plugin fires, and doesn't actually exercise the regression this case is meant to guard.
**Fix:** confirm with Dev/Bruno whether `INDUSTRY` is a real (if merely undefaulted) field on
`CM.CUSTOMER~RETAIL.INPUT`; if it isn't, STEP 4 needs a different assertion to prove the intended
business rule (e.g. against the corporate/bank projection where the field does exist).

⸻

## Nice-to-Have Improvements

**`buildCorporateCustomerPayload` duplicates the shared payload-builder pattern locally**
`customer-party-integration.spec.ts:74-94` defines a file-local `buildCorporateCustomerPayload`
helper, while the same file already imports the sibling `buildRetailCustomerInputPayload` from
`document_management/dm-payload-builder.ts` — the file `testing-standards.md` calls "the single
source of request-payload factories across almost every module." No corporate-customer equivalent
exists there yet.
**Fix:** move `buildCorporateCustomerPayload` into `dm-payload-builder.ts` as
`buildCorporateCustomerInputPayload`, mirroring `buildRetailCustomerInputPayload`'s shape.

⸻

## Necessity Citations

- **`SM.USER~EXTERNAL` projection + `EXTERNAL.USER.SYNC` operation** — cited:
  `collections/Tables/SMS/SM.USER/proj-table-template/projections/Execute Projections Operation
  EXTERNAL.yml` and `collections/Tables/Customer Management/CM.CUSTOMER/proj-table-template/Operations/Execute
  Records Operation EXTERNAL-USER-SYNC.yml`.
- **`SM.USER~ACTIVATE` profile constant** (`user-profile.values.ts`) — cited: `collections/Tables/SMS/SM.USER/proj-table-template/projections/Execute
  Projection Operation ACTIVATE.yml`.
- **AUTH check on `CM.RELATION.TYPE`** (commit "Fix #1842 STEP 3 to check AUTH, not
  `CM.RELATION.TYPE~INPUT`") — not a new endpoint, a test-logic bugfix; AUTH is the platform's
  standard record operation, no dedicated Bruno doc exists or is needed for it.
- **`TARGET` field on `RetailCustomerInputData`** — cited: same `CM.CUSTOMER~RETAIL.INPUT`
  projection file above, confirms `TARGET` as a real schema property.
- **`INDUSTRY` field on `RetailCustomerInputData`** — **no citation found**; see Possible Risks
  above.
- **`createMasterAdminKeycloakUser`/`deleteMasterAdminKeycloakUser`/`resolveMasterAdminKeycloakContext`**
  (`auth-service.ts`, ~90 new lines) — no Bruno citation applies, since Keycloak's own Admin REST
  API sits outside CBS's Bruno-documented surface entirely. The only justification is the author's
  own live-environment note in `.env.example:12-14` ("Public client not allowed to retrieve
  service account" on `proj-qa`) — accepted as the best available citation for infrastructure
  outside CBS's own API contract, not treated as a gap in research effort.
- **`authorizeAsInputter`** (`dm-regression-helper.ts`) — not a new endpoint; pattern-matches the
  existing sibling `authorizeAsChecker`, differing only in which actor's client
  (`context.registryClient` vs `context.checkerClient`) calls the shared
  `authorizeWithCheckerClient`.
- **`VIEW_HISTORY` request field `seqNo` (not `version`)** — cited: closed bug TB-3309, whose
  repro steps match this fix exactly (`DM.CUST.DOCUMENT~BASIC` VIEW_HISTORY rejecting `version`
  with `400 unknown field 'version'`).
