# Currency Definition and Logic — full component Allure audit

**Date/time:** 2026-08-27 14:37 · **Branch:** group-3/TB-2960 (proj-test-automation) · **Ticket(s):** TB-2960, TB-1987, TB-1988, TB-1989, TB-1990

## Discussed

User asked (as fullstack-aqa-agent): go to Allure TestOps, pull every Test Case for the "Currency
Definition and Logic" module (a separate list per Story), and check whether everything is
automated — flag anything missing or excess.

## Implemented

No test code changed this session — pure audit/reconciliation. Read the module's existing
`docs/module-theory/Currency Definition and Logic/` (`INDEX.md`, `BUSINESS-OVERVIEW.md`, all 4
`US-01.13.0{1..4}/README.md`) plus the prior audit memory (`project_currency-definition-and-logic-full-audit`,
2026-08-26) to establish the baseline. Grepped `api/system_core/tests/currency-smoke.spec.ts` and
`currency-regression.spec.ts` for every `allureCaseId(...)` in the current working tree (branch
`group-3/TB-2960`, clean — everything already committed through `db569cb8`). Dispatched a
subagent to independently re-fetch the live Allure TestOps state (direct REST, project id 2,
paged the full 2824-case project and fetched `/cfv` for every plausible id — no MCP available from
this repo) rather than trust the one-day-old doc snapshot.

Cross-checked the live Allure list against the code's `allureCaseId` set 1:1 (not by count alone).
Result: **68 Allure cases total** (25/19/21/3 per Story), **67/68 automated**, one gap (case 3207,
US-01.13.03/TC-25 — blocked on a BA/Confluence clarification already tracked from the prior
session, not new). No orphan `allureCaseId` links found in either spec file — every id in code maps
to a real case under the correct Story, and vice versa for every case except 3207.

Updated docs to reflect this (all in `proj-ai-agentic`, uncommitted):
- `docs/module-theory/Currency Definition and Logic/INDEX.md` — added the 2026-08-27 audit summary
  (68 total, 67/68 automated) and corrected the US-01.13.04 bullet (was "not automated", now "3
  cases, 3/3 automated").
- `docs/module-theory/Currency Definition and Logic/US-01.13.04/README.md` — Automation status
  section updated: the 3 pre-existing local tests (TC-01/TC-03/TC-05) now have real Allure cases
  (3229/3230/3231, created by Manual QA 2026-08-27) and are linked via `allureCaseId(...)`
  (commit `db569cb8`, already in the working tree before this session started).
- `memory/project_currency-definition-and-logic-full-audit.md` (session persistent memory) —
  rewritten with the 2026-08-27 numbers and the new US-01.13.04 finding; `MEMORY.md` index line
  updated to match.

## Learned

- **Allure's own `automated` boolean field is not maintained on this instance at all** — the live
  fetch confirmed it reads `false` for all 68 cases in this Component, including every one already
  proven automated by a real linked test. This isn't new (already flagged once for case 3153) but
  is now confirmed as a blanket, not case-specific, gap — don't use this field as a coverage signal
  for this project; `allureCaseId(...)` presence in the test code is the only reliable source of
  truth.
- US-01.13.04 went from 0 Allure cases (as of 2026-08-26) to 3 in one day (Manual QA created them
  2026-08-27T08:16–08:18 UTC) — this Story can gain cases quickly; worth re-checking again soon
  rather than assuming it stays empty.
- Independently confirmed the module's existing `docs/module-theory` write-up (case counts, TC↔id
  mappings, the 3207/TC-25 gap) was accurate as of yesterday — no discrepancy found in the parts
  that were supposed to be stable, only the parts that had genuinely changed (US-01.13.04's new
  cases).

## Open Items / Follow-ups

- Case 3207 (US-01.13.03/TC-25) still blocked: its Expected Result ("Engine does NOT read
  SYSTEM.PARAMETER for transit") contradicts this Story's own Confluence-documented 3-level
  fallback chain. Needs the Confluence page re-read for the Excel source's cited "p.19
  clarification" before this can be automated — not actioned this session (pure audit, no new
  research on this specific item beyond confirming it's unchanged).
- Consider whether Allure's `automated` field should be raised to Manual QA/whoever owns Allure
  process as a standing gap (it appears structurally unmaintained on this instance, not just
  overlooked per-case).

## References

Allure TestOps: `https://allure.proj.local:8443`, project id 2 ("TB CBS"), cases 3229/3230/3231
(new), 3207 (open gap). Jira: TB-2960 (automation branch), TB-1987/1988/1989/1990 (the 4 Stories).
