# Next.js App Router client-side navigation reports as Playwright `resourceType() === 'fetch'`, never `'document'`

**The pattern/symptom.** Once the CBS UI's Next.js App Router shell has loaded (any post-login page),
navigating to a *different* route inside it — clicking through the app, submitting a form that
redirects, selecting an option that changes the active page — does **not** produce a new
`resourceType() === 'document'` network event for the destination URL. Next.js does this via a
client-side RSC (React Server Component) fetch instead: the request carries a `_rsc=<hash>` query
param and a `next-router-state-tree` header, and Playwright classifies it as `resourceType() ===
'fetch'`. A `page.waitForResponse(r => r.url().includes(path) && r.request().resourceType() ===
'document')` written against such a transition times out deterministically — not flakily — because
the event it's waiting for structurally cannot occur for a client-routed transition. The only
`'document'`-typed response in a full login→dashboard flow is the *first* one, right after the
Keycloak redirect lands the browser back on the app shell (e.g. `/proj-web/en`) — everything the SPA
routes to after that is `'fetch'`.

**Second trap once you switch to `'fetch'`.** The same destination URL also matches on its redirect
hops on the way there (Next.js's RSC routing does its own internal 307 redirects, e.g.
`.../tableRegistry` → `.../tableRegistry?_rsc=<hash>`), and those redirect responses are `'fetch'`
too but carry none of the destination's real headers (no `cache-control`, etc.). A predicate that
only fixes the `resourceType` will now resolve early against one of these redirects instead of the
final content response. Add `response.status() === 200` (or `response.ok()`) to the predicate to
skip past the redirect hops to the actual content response.

**The rule.** Never assert `resourceType() === 'document'` for a same-app client-side route
transition in this UI. Use `resourceType() === 'fetch'` and filter by `status() === 200` (or
`response.ok()`) to land on the real content response, not an internal RSC redirect. Only the very
first navigation after an external redirect (Keycloak → app shell) is genuinely `'document'`.

**The incident.** `ui/auth/tests/back-button-after-logout.spec.ts` (TC-212, EP-02.01.06) waited for
a `'document'`-typed response to `/proj-web/en/tableRegistry` right after `selectCompanyPage.
selectCompany()` to check its `Cache-Control` header — a guaranteed 15s timeout on every run, since
that transition is RSC-routed. Confirmed by extracting `test-results/.../trace.zip`'s `*.network`
JSONL and finding every matching-URL entry tagged `"_resourceType":"fetch"`. The underlying security
property under test (`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`) was
already present the whole time — on the `fetch`-typed response, not a `document`-typed one — so this
was a test-technical defect, not a product regression. Fixed 2026-09-09 by switching the predicate to
`resourceType() === 'fetch' && status() === 200`.
