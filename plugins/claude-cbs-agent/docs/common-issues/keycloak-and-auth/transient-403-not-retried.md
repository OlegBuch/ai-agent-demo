# `403 does not have access to table` never retries — status-code gap in `defaultIsTransientClientError`

## The pattern/symptom

A freshly-granted permission (a checker/authoriser user just added to a group with table access)
intermittently gets `403 User does not have access to table: <TABLE>` on its very next call, even
though the grant was already confirmed working moments earlier (e.g. via a `pollUntilReady` probe).
Re-running the same test alone, with no code change, usually passes — a strong flaky-not-broken
signal, not a logic bug in the test.

## The rule

`BaseApiClient` (`api/utils/services/base-api-client.ts`) already has a purpose-built retry path for
exactly this message — `defaultIsTransientClientError` checks `bodyText.includes('does not have
access to table')` — but gates it on `status === HTTP_STATUS.BAD_REQUEST` (400). The real response
for a permission-propagation race on an `AUTH`/authoriser call comes back as **403**, not 400, so the
retry never fires and the very first race loses outright.

**Do not broaden the global default to also treat 403 as transient** — a dozen+ other spec files
(`user-groups-api-regression.spec.ts`, `customization-regression.spec.ts`,
`table-registry-smoke.spec.ts`, etc.) assert a **persistent** 403 "does not have access to table" for
a deliberately-unpermissioned user; retrying those for up to `API_CLIENT_DEFAULTS.RETRIES` (80) ×
`RETRY_DELAY_MS` (3000ms) would silently slow every legitimate negative-permission test by minutes.

Instead, scope the fix to the specific client instance that's expected to always have access (e.g. a
checker/authoriser client minted right after granting it a group): construct it with a custom
`isTransientClientError` that composes the exported `defaultIsTransientClientError` with the missing
403 case, e.g.:

```ts
new TableRegistryApiClient(context, {}, {
  isTransientClientError: (status, bodyText) =>
    defaultIsTransientClientError(status, bodyText) ||
    (status === HTTP_STATUS.FORBIDDEN && bodyText.includes('does not have access to table')),
})
```

Before doing this for a new client, grep the suite for that client variable to confirm it's never
used to assert a legitimate denied-access scenario — if it is, this fix would mask that assertion
too.

## Candidate second occurrence (2026-09-07, unconfirmed — needs a live re-run to close)

`currency-smoke.spec.ts`'s `beforeAll` failed with a **403, empty response body**, on
`ensureCurrencyMasterHasBaseRankAndPreciousMetal`'s `setupClient.seeProjectionDefinition
(CURRENCY_TABLE_ID, CURRENCY_PROJECTION_ID)` (`currency-helper.ts:329-337`). `setupClient` there is
a bare `new TableRegistryApiClient(setupContext)` — no `isTransientClientError` override, same gap
this file documents. `setupContext` comes from `createAuthenticatedApiContext()` with no explicit
username/password, which (per
`authenticatedapicontext-already-covered-by-super-admin.md` in this folder)
resolves to the super-admin bootstrap user (at the time created fresh once per run in
`global-setup.ts`, now once per worker) — a freshly-provisioned identity, same shape as the original `checkerClient`
incident (see `authenticatedapicontext-already-covered-by-super-admin.md`). `SUPER_ADMIN_PERMISSIONS` does include `{TABLE:'TABLE_REGISTRY', FUNCTION:'ALL'}` (added
2026-09-04 specifically because table-registry-style operations aren't covered by the `TABLE:'ALL'`
wildcard), so the grant itself should be sufficient once fully propagated — this reads as the same
propagation race, not a missing grant. **Not yet confirmed**: the test was not re-run live to check
whether a second attempt passes (only static diagnosis was done; the owner runs all tests manually). If a re-run confirms this is transient, the fix is the same shape as
the original: give this specific `setupClient` a scoped `isTransientClientError` that also treats a
403 (with an empty or `does not have access to table` body) as transient, or wait for a
super-admin-permission-propagation probe (mirroring `grantCheckerAccessToCurrencyOrder`'s
`pollUntilReady` pattern) before this beforeAll's first definitions call. Do not apply either fix
speculatively — confirm the race reproduces first, since an empty 403 body could also mean
something else entirely (e.g. an Istio/gateway-level rejection unrelated to CBS permissions).

## Third occurrence — cluster of empty-body 403s in one ~45s window (2026-09-16, bankstg e2e run, vm-results-e2e-20260916-093211)

Five distinct call sites, all going through `test-user-service.ts`'s `withAdminContext` (fresh
`getGlobalAdminContext()` per call — a real, always-fully-permissioned global admin, not a
just-granted checker) or a `noRetry: true` `SEE`, all failed with a **403 and an empty response
body** inside one ~45-second window on the same Playwright worker
(`customer-party-integration.spec.ts` AllureID 1842/1843/1844, `product-factory-e2e-m2.spec.ts`
AllureID 2124, and 2263's final retry after two prior 500/503s):

- `dm-regression-helper.ts`'s `ensureSector` (`SECTOR~MASTER` `SEE`) — explicitly passes
  `{ noRetry: true }`, so even if the general 403 gap above were fixed, this call would still not
  retry.
- `user-group-helper.ts`'s `createUserGroup`/`submitAndExpectSuccess` (`SM.USER.GROUP~MAIN`
  `INPUT`) — no `noRetry`, but the default `isTransientClientError` doesn't cover a 403 at all
  (only a 400 body-text match), so this is the same structural gap as the original incident, on a
  different projection/operation.

**Why this reads as environment-transient, not a real admin permission gap**: earlier in the same
file/run, the identical `withAdminContext` → `SM.USER.GROUP~MAIN`/`SM.USER~INTERNAL` `INPUT` path
succeeded with 200 for AllureID 1839/1840/1841 (moments before), using the exact same
`getGlobalAdminContext()` admin identity. A genuine missing-permission grant would fail
deterministically on every call, not only after ~30-40 tests already exercised the same path
successfully in the same run. All Keycloak token requests in this window returned 200 — the
account itself was never locked out or rejected at the Keycloak layer, only at the CBS/gateway
layer after a valid token, which points at Istio/mesh-level rejection or backend overload under
this specific E2E suite's load, not a Keycloak or permission-grant problem. Not yet root-caused on
the infra side — flagging so a future occurrence isn't re-diagnosed as "admin lacks permission"
from scratch.

**Confirmed transient, not persistent**: a second same-day run roughly 17 minutes later
(`vm-results-e2e-20260916-110804`) re-executed the identical suite and none of these five call sites
failed — `Draft Customer Deletion`, `Expired Document Blocks Contract`, `#2124 Automatic fee
calculation`, and `#2263 Product onboarding` all passed cleanly on the same `SM.USER.GROUP~MAIN`/
`SM.USER~INTERNAL` INPUT path. This is strong confirmation the empty-body 403 cluster is
infra/load-transient, not a real admin permission gap — no code change happened between the two
runs. (`ensureSector`'s own occurrence didn't reproduce either, but for a different reason: in the
110804 run, `US-03.01.06 | Automated Reverse Relationship Generation` failed earlier in the same
scenario on the unrelated `SECTOR` `NO_INPUT` payload-builder bug — see
`../test-data-and-assertions/sector-hardcoded-in-customer-payload-builders.md` — before its flow
ever reached the `ensureSector` call this file documents.)

## The incident (2026-08-26)

`currency-regression.spec.ts`'s `checkerClient` (built in `currency-helper.ts`'s
`grantCheckerAccessToCurrencyOrder`) hit this on 4 different tests across two describe blocks in a
single clean regression run, previously mis-attributed to a Playwright worker-restart cascade (see
`../playwright-execution/playwright-worker-restart-on-failure.md`'s "Correction" section) before the actual status-code gap
was found by reading `base-api-client.ts` directly. Fixed by passing a scoped
`isTransientClientError` when constructing `checkerClient` — see
`docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md`'s "Sixth live run" section
for the full write-up. Not yet re-run live to confirm the fix holds.
