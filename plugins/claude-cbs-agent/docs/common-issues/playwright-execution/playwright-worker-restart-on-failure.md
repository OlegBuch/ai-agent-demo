# Playwright restarts the worker after a failing test — cascading, misleading later failures

**The pattern/symptom.** After any test in a spec file fails, Playwright restarts the worker
process before running the next test in that file (documented Playwright behavior, distinct from
this repo's own `fullyParallel` override in `playwright.config.ts`). The restarted worker re-runs
that file's `test.beforeAll` and re-lists its tests from disk. Two misleading symptoms follow, both
in files with more than one failure:

- **`Test not found in the worker process. Make sure test title does not change.`** — surfaces when
  the spec file's test titles changed on disk (e.g. mid-refactor, or between a list phase and a run
  phase) between when the run's reporter built its original list and when a later worker restart
  re-lists from the now-different file. Not a product bug — a file-vs-reporter title mismatch.
- **Unrelated-looking failures later in the same file**, especially around any shared/singleton test
  fixture (a shared `COMPANY` record, a shared currency pair, anything captured once in
  `beforeAll`/mutated-then-restored by several tests). A restart lands mid-mutation of that shared
  state, and the fresh worker's new context doesn't know the prior worker left it non-default.

**The rule.** When several failures show up in one run and the later ones look structurally
unrelated to the earlier ones (different table, different error shape, a shared-fixture 403/404 with
no obvious cause in that specific test's own code), check whether an earlier failure in the same file
could have triggered a worker restart before concluding the later ones are independent new defects.
Re-run just the suspect later test in isolation (`--grep`) before filing it as a new bug — if it
passes alone, the cluster was very likely a restart cascade, not a distinct issue.

**The incident(s).** `currency-regression.spec.ts`, 2026-08-20 (TC-17's `beforeAll` re-invocation
after TC-07/TC-16 failures drew an already-used 3-letter currency id) and 2026-08-26 (a 9-failure
regression run where 4 failures matched newly-filed Jira bugs and the remaining 5 — a stale-title
"test not found" plus a 3-test `403 User does not have access to table: CURRENCY.ORDER` cluster
around a shared `COMPANY` record — were guessed as this same cascade, unconfirmed at the time). Full
detail: `docs/module-theory/Currency Definition and Logic/US-01.13.02/README.md` ("Third live run"
and "Fourth live run" sections) and
`docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md` ("Fifth live run" section).

**Correction, 2026-08-26 (same day, clean re-run).** The 403 cluster's guessed cascade explanation
was wrong — a clean re-run reproduced the same `403 does not have access to table` symptom on
unrelated tests again, ruling out a one-off worker-restart artifact. Real root cause: a genuine bug
in `BaseApiClient`'s retry logic — see `US-01.13.02/README.md`'s "Sixth live run" section
(`defaultIsTransientClientError` gated the retry on `status === 400`, but this specific message
actually returns `403`, so the built-in retry for exactly this scenario never fired). The stale-title "test not found" symptom is still believed to be
a genuine worker-restart artifact — that part of the guess stands.
