# MR 194 — Fail-closed VM runner, per-run roots, and ownership-bound cleanup

- **Branch:** `fix/vm-runner-and-cleanup-hardening` (Aliaksei Babko)
- **Ticket:** none recoverable from branch name or commit subjects — no `TB-XXXX` prefix anywhere
  in 14 commits. Goal taken from the MR description the user pasted (matches the commit trail).
- **Diff scope (merge-base `4496074`, not `origin/main` HEAD which has diverged further):** 14
  files, +2193/-97. Note: an earlier pass in this review mistakenly diffed against `origin/main`'s
  current tip (two-dot `git diff`) instead of the merge-base (three-dot), which pulled in 3
  unrelated files (`dm-payload-builder.ts`, `dm-helper.ts`, `constants-keeper.ts`) changed
  independently on `main` after this branch forked. Those are **not** part of MR 194 and are
  excluded below.

## Summary

The MR reworks how the bankstg Azure "tools VM" runs the suite and cleans up after itself, driven
by three real incidents cited with evidence: (1) a silently-swallowed sync/bootstrap failure
(`A && B || true` returning 0 regardless of `B`) let a run launch against a stale/corrupted `.env`
and report green; (2) a hand-maintained file allowlist for VM sync went stale and stranded fixes,
most recently blocking `leads/TB-2832`; (3) cleanup selected resources by name/age convention
rather than ownership, leaving 27 stale table groups on the shared VM with no record of whose they
were. The fix replaces the sync with per-run roots built from `git archive <commit>` (sha256
verified, atomically renamed, `READY`-gated), adds a `run-identity.ts` module that stamps every
tracked resource with `(workstream, runId, revision, actor)` at creation so cleanup can act only on
what it owns, adds a VM-wide `mkdir`-based lock shared with the performance-test workstream
(`proj-devops`), and reclassifies Keycloak auth failures (disabled / temporarily-locked /
incomplete-profile / wrong-password) so a locked account is never retried into deeper lockout. It
also inherits `bootstrap_env` (Vault → local `.env.bankstg-local` credential delivery) verbatim from
`main`'s independent, already-merged change, deliberately re-injecting `LOCAL_CLEANUP` so that
merge doesn't silently revert this branch's own cleanup fix. The commit trail documents four rounds
of adversarial review (credited to "CODEX") that already found and fixed a live-lock, an ABA race
on lock-breaking, an ownership boundary that was asserted but not enforced in three places, and a
detached-process lock-ownership bug — the residual issues below are new findings past that.

## Confirmed Issues

**[Medium] Unquoted `$dirty_files` word-splits on filenames containing spaces, including in the
actual `tar` append.** `scripts/run-on-vm.sh:300` — `printf '%s\n' $dirty_files | tar -rf
"$tarball" -T -` — and the same pattern at lines 265, 270, 351 — expands `$dirty_files` unquoted, so
bash word-splits it on whitespace before `tar -T -`/`printf` ever see it. A tracked file with a
space in its name (a fixture, a doc asset — not guaranteed absent from this repo) that is locally
modified and shipped via `--allow-dirty` gets split into bogus multi-word "filenames," which `tar
-T -` cannot find — producing either a tar error or a silently-incomplete archive. This is exactly
the class of defect this branch exists to eliminate (a file quietly failing to travel to the VM).
**Fix:** quote the expansions, or read `$dirty_files` line-by-line into an array (`mapfile -t`) and
iterate that instead of relying on word-splitting.

## Possible Risks

**[Medium] None of the four new regression suites are wired into CI.** `.gitlab-ci.yml` (unchanged
by this diff) only defines `validate`/`test` stages built around Playwright's `TEST_TYPE` scoped
suites (health-check/smoke/regression/e2e/ui-*); there is no generic `npm test` catch-all. The three
new `npm run test:*` scripts (`package.json:28-30`) and `scripts/tests/run-on-vm-failclosed.test.sh`
are therefore only ever run by a human remembering to type the command — confirmed by grepping the
MR's own `.gitlab-ci.yml` for these script names (no matches). Given the whole point of this branch
is preventing a *repeat* of silent regressions in this exact code, leaving the guard-rail itself
outside the CI gate is a gap worth closing (or at minimum confirming is intentional/tracked
elsewhere) before the protection value erodes on the next touch to these files.

**[Low] The VM lock may now over-serialize two same-workstream AQA runs, not just cross-workstream
contention.** `scripts/run-on-vm.sh` acquires `/opt/perftest/.run-lock` and holds it across sync +
bootstrap + launch. The MR description frames this as needed because the *performance* runner
(`proj-devops`) shares the VM — a legitimate resource-contention argument for measurement validity.
But per-run roots already give two *AQA* engineers fully isolated file trees, so it's not obvious
two concurrent AQA-only runs still need to queue behind each other's entire
sync-through-launch window on the same coarse lock. If that's intended (e.g. deliberately capping
total concurrent load on the VM), fine — but it reads as a possible unintended throughput cost for
same-workstream users worth a one-line confirmation from the author.

**[Low] `describeAccountState`'s re-entrancy guard is a process-wide mutex, not a per-call guard.**
`api/utils/services/auth-service.ts` — the module-level `let describingAccountState = false` flag is
shared across all concurrent invocations within one Node process. The code's own comment scopes the
intent to self-recursion prevention ("today it cannot recurse... a diagnosis able to invoke what it
diagnoses would turn one failed login into unbounded failed logins"), which is a real and correctly
identified risk — but the implementation as written also silently drops the diagnostic for a second,
*unrelated* concurrent auth failure in the same worker process (e.g. two users authenticated via
`Promise.all` in one test file, both rejected around the same time). Impact is bounded: the failure
is still thrown with its code and remedy text, only the supplementary "Account state: ..." line is
lost for whichever call loses the race. Worth a comment noting this broader-than-stated scope, or
scoping the guard per-username instead of globally, if concurrent multi-user auth failures are a
realistic scenario in this suite.

**[Low] `bootstrap_env()`'s own `LOCAL_CLEANUP` line is not exercised by any hermetic test.** The MR
is transparent about this ("bootstrap_env itself is NOT verified live") and the fail-closed test
harness deliberately captures only the source archive, not the generated `.env` (documented reason:
an earlier version's scp-capture bug). The `LOCAL_CLEANUP` ordering assertion in
`cleanup-manifest.test.ts`'s `bootstrapChecks()` covers the sibling `scripts/bankstg-bootstrap-env.sh`
file, not `run-on-vm.sh`'s own inline `bootstrap_env()` function where the same line was also added.
Not a defect — just a disclosed gap worth tracking rather than assuming covered by proximity to a
similar, tested file.

## Nice-to-Have Improvements

**[Low] Dead-but-intentional check: `mine !== ''` in `getTrackedResourcesByOwnership`.**
`api/utils/helpers/resource-tracker.ts:168` — `getRunIdentity()`'s `read()` helper never returns an
empty string (it falls back to the literal `'unknown'` via `||`), so this guard can never evaluate
false and is effectively inert. Not a live bug — the real protection is
`cleanupTrackedResources()`'s upstream `isFullyIdentified()` gate, which does the actual fail-closed
check before any destructive path is reached — but the inert condition reads as if it's doing
something it isn't. **Fix (optional):** either drop the clause, or make the intent explicit by
checking `mine !== UNKNOWN_IDENTITY_FIELD` instead.

**[Low] `run-on-vm.ps1`'s `Sync-Sources`/`Start-Run` keep their full pre-change bodies as dead code
after an early `throw`.** Deliberate per the MR description (porting per-run roots to PowerShell is
future work), and the `throw` message already explains why and points at the bash runner — but a
short comment marking the retained body as "kept for when per-run roots are ported here" would save
a future reader the trip through the diff to confirm it's intentional.

**[Low] The `vm-sync-whitelist-silently-stranded-fixes.md` doc in this repo (`proj-ai-agentic`) will
go stale once this MR lands.** That doc's "The Fix (2026-09-07)" describes the *previous* baseline
this MR replaces (whole-tree `tar` over ssh into a shared root) as the current fix; MR 194 supersedes
it with per-run `git archive` roots for the reasons in its own description (untracked-file leakage,
partial-overwrite-on-failure, no ownership boundary). Not a defect in the diff — a follow-up doc
update once this merges, so the next engineer chasing a similar VM-sync symptom isn't pointed at a
solution this branch replaced.

**[Low] `run-on-vm-failclosed.test.sh` has no `npm run test:*` wrapper**, unlike its three TypeScript
siblings — purely a consistency nit, not required.

## Necessity Citations

- **`ATTACK_DETECTION_USER` path (`api/utils/paths/keycloak-admin-api-paths.ts`) +
  `getBruteForceStatus()` (`api/utils/services/keycloak-admin-api-client.ts`).** Not a CBS/Bruno
  endpoint — it's Keycloak's own documented Admin REST API surface
  (`attack-detection/brute-force/users/{id}`), consistent with this client's existing path style.
  Justified directly by the 2026-09-07 incident (`internal_user` disabled, cause unattributable for
  six hours) cited in the commit message and mirrored by the behavioral test in
  `auth-public-path.test.ts`.
- **`run-identity.ts` (new module, no external endpoint).** Justified by the 27-stale-table-groups
  incident, cited with the specific investigation gap it existed to close (no record of which run
  owned what). No Bruno citation applicable — internal test-infra only.
- **New `KeycloakAuthErrorCode` variants + `NON_RETRYABLE_AUTH_CODES`.** Justified by Keycloak's own
  `error_description` wording for the three account states, verified against the pre-fix classifier
  transcribed in `auth-error-classification.test.ts` and driven end-to-end in
  `auth-public-path.test.ts`. Real production wording, not invented.
- **`LOCAL_CLEANUP=${LOCAL_CLEANUP:-true}` added to both `run-on-vm.sh`'s `bootstrap_env()` and
  `scripts/bankstg-bootstrap-env.sh`.** Cited against `scripts/bankstg-provision.sh:183`, which already
  set this — the commit frames it as restoring a dropped variable, not introducing new policy.
  Appears twice because it's two independent code paths (Vault-driven bootstrap vs. the Vault-free
  `.env.bankstg-local` path this MR's runner now uses) that both need it; not duplication.
- **VM mutex path `/opt/perftest/.run-lock` (parent of both `/opt/perftest/aqa` and the perf
  workstream's own directory).** Justified by an explicit cross-repo pairing: "The matching change
  for the performance runner is proj-devops@127d806; both sides must lock the same path or the lock
  excludes nobody." Not independently verifiable from this repo alone — take on trust pending
  confirmation that `proj-devops@127d806`/`7e9af65` actually landed with the matching path.

## Changelog

- 2026-09-08 — initial review.
