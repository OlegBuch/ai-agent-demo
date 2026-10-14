# docs/project-spec/

This folder is the **domain source of truth** for this repository's target system. Every role
(persona, skill, execution command) reads from here — and from the current Jira ticket / Confluence
pages — instead of having domain knowledge baked into its own prompt.

This repo (`proj-test-automation`) tests **PKF-CBS**, a Core Banking System platform. Generic CBS
platform terminology and architecture (Table, Projection, the four core services, NAU/LIV/HIS in
the general sense, 4-eyes, multi-marker fields, Plugin API) is owned by the **`proj-context`**
Claude Code plugin — load that first for platform fundamentals. The files in this folder record
what is specific to **this engagement's actual code and test coverage**, grounded in evidence from
`api/**`, not a restatement of the plugin's generic model.

| File | Covers |
|---|---|
| [`project-scope.md`](./project-scope.md) | What this repo tests, for whom, current coverage boundary by module (`cob` is still stub-only — read before assuming coverage exists) |
| [`domain-model.md`](./domain-model.md) | The services and concrete entities this suite exercises (Table Registry, Table Template, Field Registry; PF.*, SM.*, SYSTEM.PARAMETER~MASTER), Table classification/type/origin |
| [`business-rules.md`](./business-rules.md) | Record-lifecycle rules (LIV/NAU/HIS), four-eyes maker-checker, multi-company isolation, origin governance (CORE/LOCAL), field injection rules, the rule engine, RBAC enforcement, system-parameter immutability, Auto-ID policies — all as asserted by this suite's actual tests |
| [`non-functional.md`](./non-functional.md) | Timeouts/retries/provisioning waits observed in the test framework — explicitly flagged as inferred from framework behavior, not committed CBS SLAs |
| [`access-control.md`](./access-control.md) | Actor/user classifications, User Groups and `{TABLE, FUNCTION}` permissions, Data Access Rules, the permission-boundary test pattern, 401 vs. 403 vs. cross-company 404 |
| [`glossary.md`](./glossary.md) | Concrete entity/field/status names observed in code, plus this suite's own test-vocabulary (tracked resource, test-owned schema, inputter/authorizer) |

## What does NOT belong here

- Programming language, framework, build tool, database choice — that's `docs/frame-specs/`.
- Anything that's really just the current state of one specific Jira ticket — link to Jira instead
  of copying it here (see `docs/test-cases/<TICKET-KEY>/analysis.md` for per-ticket analysis); this
  folder is for standing domain knowledge distilled from the actual codebase, not a ticket mirror.
- Generic CBS platform teaching that belongs in the `proj-context` plugin — if a fact is true of
  *any* CBS deployment, it likely belongs there, not here; if it's true of *this test suite's
  observed behavior specifically*, it belongs here.

## A note on `docs/api-bruno-spec/`

Older material in this repo (`docs/INDEX.md`'s history) refers to `docs/api-bruno-spec/` as a
checked-in Bruno collection. **It does not exist on disk inside this repo.** The real API contract
is the `proj-bruno-api` Bruno workspace — a separate git repository cloned as a sibling checkout,
not a folder in `proj-test-automation` — see `docs/frame-specs/api-conventions.md`. Its collections
also cover more CBS services than this repo currently automates — see `domain-model.md`'s
"Services in the Bruno contract not yet automated".
