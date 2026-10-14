# questions/framework-updates/duplication-audit/ — TB-2798/2799/2807 framework duplication audit trail

- [`framework-wide-duplication-audit.md`](framework-wide-duplication-audit.md) — the original
  62-finding, 4-tier discovery-only audit of code duplication across `proj-test-automation`'s
  framework (nothing changed by this document itself, findings only).
- [`2026-08-10-tb-2799-utils-refactor-design.md`](2026-08-10-tb-2799-utils-refactor-design.md) —
  TB-2799 (sibling sub-task of TB-2798, done): scoped reorg of `api/utils/`/`ui/utils/` and
  duplicate-logic removal limited to those files only.
- [`2026-08-10-tb-2807-duplication-audit-architect-review.md`](2026-08-10-tb-2807-duplication-audit-architect-review.md) —
  Architect review spot-verifying 8 of the audit's highest-leverage findings directly against the
  code; verdict: the audit holds up, all 8 real and current.
- [`2026-08-12-tb-2807-round-2-full-framework-review.md`](2026-08-12-tb-2807-round-2-full-framework-review.md) —
  Round-2 deep dive: full framework review with detailed recommendations, going beyond round-1's
  spot-check into comprehensive coverage.
