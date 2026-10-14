# commands/execution/ Index

The Manual QA → Allure TestOps → AQA automation pipeline, one package per domain:

| Folder | Read this when you need... |
|---|---|
| `mqa-commands/` — see `mqa-commands/INDEX.md` | Requirement analysis and local (non-Allure) test-case authoring. |
| `allure-commands/` — see `allure-commands/INDEX.md` | Creating/updating/reading/removing test cases, shared steps and mutes in Allure TestOps (`allure-native-*`), read-only search/launch/statistics/metadata lookups (`allure-custom-*`), and the rendered-report review (`allure-review-report`). |
| `aqa-commands/` — see `aqa-commands/INDEX.md` | Turning approved cases into automation and keeping automation in sync. |
| `review-pr-commands/` — see `review-pr-commands/INDEX.md` | Reviewing a GitLab merge request: cosmetic lens, logical lens, the adversarial orchestrator that merges both into a final report, and the post-fix recheck once the author pushes. |

## Pipeline order

```
mqa-review-story  →  (allure-native-create-test-case  OR  mqa-create-local-test-case, never both)  →  aqa-automate
```

`aqa-review-test` (fidelity check against an existing Allure case) and the `review-pr-commands`
family (GitLab merge-request review) sit outside this linear order — they're read-only checks
invoked whenever their own trigger applies, not a pipeline step.

For the full invocation table with descriptions and examples, see the root `README.md`.

## This pipeline is a reference implementation, not a portable abstraction

Unlike `commands/team/*.md` personas (which resolve tool/stack facts fresh from `docs/frame-specs/`
every engagement — see `context-resolution.md`), `allure-commands/` and `aqa-commands/aqa-automate.md`
don't just *describe* a tool, they call one directly: `allure-commands/` talks to the real Allure
TestOps API, `aqa-automate.md` generates actual Playwright code. This is a deliberate, accepted
choice — building a genuinely pluggable multi-TMS/multi-framework abstraction here would be a large
undertaking for a benefit no current engagement needs — but it means this pipeline **does not**
travel to a new project whose test-management system or automation framework differs from this
one's. `mqa-create-local-test-case.md` already exists as the documented Allure-free fallback for
authoring test cases specifically because this gap is expected; no equivalent fallback exists yet
for the automation-framework side. `/bootstrap-project`'s "Tier 2 — executable-layer coupling"
report is the intended mechanism for surfacing this precisely (which family, which persona section)
on a new engagement — the fix in that case is writing a new `<domain>-commands/` package for the
actual stack, not editing this one's prose.
