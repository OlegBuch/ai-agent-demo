# An explicit file-whitelist sync to a shared VM silently strands any fix to an unlisted file

**The pattern/symptom.** A code fix made locally and confirmed correct (tsc/eslint/prettier clean)
still fails identically on a re-run against the Azure `bankstg` tools VM, with the stack trace
pointing at line numbers/functions that no longer exist in the local file. The run genuinely
executed — it is not a stale report — the VM is just running an **older copy** of that file.

**The rule.** When `scripts/test-scripts/shell-scripts/run-on-vm.sh`'s sync step only copies an explicit list of file paths
(as it did before 2026-09-07) rather than the whole source tree, any file not on that list never
gets updated on the VM by a normal run — it only reflects whatever the last full manual sync (or
the list's own maintainers) put there. Two separate incidents already came from exactly this before
`sync_sources()` was rewritten to stream the whole tree (`tar` piped over `ssh`, excluding
`node_modules`/`.git`/reports/`.env*`) instead: first a helper (`api/utils/constants/db-query-keeper.ts`
and siblings) the suite imports but the whitelist didn't name, then a full spec-file +
`auth-service.ts` fix that kept failing on Azure with the pre-fix stack trace after being "fixed"
locally and even after a first VM re-sync — because the fix touched two files
(`customer-party-integration.spec.ts`, `auth-service.ts`) that were never in the 9-file whitelist,
so every run since one earlier ad hoc manual full-tree sync had silently kept re-copying only those
9 files and leaving everything else exactly as it was that one time. **Before trusting a "this
should be fixed now" re-run against a shared VM whose sync step is anything less than the whole
source tree, verify the fix actually landed there** (`ssh ... grep -c <removed-symbol>
<remote-path>`), don't just re-run and trust the stack trace's own file/line numbers to be current.

**The fix (2026-09-07).** `sync_sources()` in `scripts/test-scripts/shell-scripts/run-on-vm.sh` now tars the whole repo root
(excluding `node_modules`, `.git`, `.husky`, `playwright-report`, `allure-results`,
`allure-report`, `test-results`, `.env*`, `vm-results-*`) and streams it over `ssh` into
`$REMOTE_ROOT` on every run, instead of `scp`-ing 9 named files. Measured cost: 5.6s for a ~46MB
tree (excluding `node_modules`) — negligible next to the run itself, so there was no real
correctness/speed tradeoff being protected by the narrower whitelist. `rsync` exists on the VM but
not on the engineer's own Git-for-Windows/Git-Bash workstation (checked: not on `PATH`, no binary
anywhere under the Git for Windows install) — an incremental (only-changed-files) sync was
considered and intentionally not built, since it would reintroduce the same class of
silently-stale-copy risk (a manifest/diff bug undercounts what changed) for a few seconds of
savings that don't matter at this suite's actual run durations.

**The incident.** `vm-results-e2e-20260907-174157` (2026-09-07) surfaced the `KEYCLOAK_ADMIN_*`
finding (see `keycloak-master-admin-creds-missing-on-bankstg.md`); the fix for it
(`customer-party-integration.spec.ts` + `auth-service.ts`) was made and verified locally, but a
re-run (`vm-results-e2e-20260907-181022`) failed with the byte-identical old stack trace because
neither file was in `sync_sources()`'s whitelist. Confirmed via `ssh ... grep -c
MasterAdminKeycloakUser <remote path>` returning nonzero before the sync-mechanism fix, zero after.

**Related, separate symptom found the same day: `watch_run()`'s live stream can lag minutes behind
the VM's actual log, looking like a hang.** `grep` defaults to full block-buffering (not
line-buffering) when its own stdout is a pipe rather than a terminal — exactly the case for the
`sed -n ... | grep -vE ... | grep -E ...` pipeline inside `watch_run()`'s polling loop, run over
`ssh` with no pty allocated. The remote test process keeps running and writing to `vm-run.log`
completely normally; only the *visible* stream to the engineer's terminal stalls, so a genuine
multi-minute gap in the console looks identical to the suite actually hanging, until something
forces a flush (interrupting the watch and re-fetching, or the pipeline's own eventual exit). Fixed
by adding `--line-buffered` to both `grep` calls. **Before concluding the suite/environment itself
is hung from a `run-on-vm.sh` console gap, check `--status`'s test count against the actual
`run.log` on the VM** — a live-tail display lag and a genuinely stuck backend look the same from
the console alone.

**Second related incident (2026-09-07, same evening): a colleague's run looked like it was still
on the pre-fix script/files even though the fix was already committed and pushed
(`3b3367da`, `origin/group-3/TB-3587`).** Two independent, compounding causes, not one:
(1) their local checkout can simply predate the push - `git pull`/re-checkout before assuming a
script bug; (2) their `.env.bankstg-local`'s `CBS_VM_ROOT` was copied from a teammate's own file
verbatim, pointing at `/home/<that teammate>/aqa` instead of their own login's home - and that
directory is `750` (owner-only rwx, group r-x, others none), so a different Linux user literally
cannot traverse into it. **`CBS_VM_ROOT` is per-engineer and must resolve to a path *that
engineer's own SSH login* can write - either omit it entirely to use the shared default
(`/opt/perftest/aqa`), or point it at that engineer's own home directory - never copy a teammate's
literal value out of their `.env.bankstg-local`.**

**Third related incident, same evening: after fixing the two above, the colleague's first real run
against their own fresh `CBS_VM_ROOT` failed immediately with `Cannot find module 'dotenv'`.**
`sync_sources()` deliberately never copies `node_modules` (it is a linux-x64 build; copying one
from a Windows workstation would be wrong even if it existed there) - but nothing filled that gap
for a brand-new personal `$REMOTE_ROOT` that has never had a `node_modules` at all. Earlier the
same day this had been solved by hand for a first per-user directory (`cp -a
/opt/perftest/aqa/node_modules $REMOTE_ROOT/`, plus its `package.json`/`package-lock.json`) but
that manual step was never folded into the script - so it silently didn't help the next engineer
who hit the same first-run gap. Fixed by adding `ensure_node_modules()`, called right after
`sync_sources()`: checks whether `$REMOTE_ROOT/node_modules` exists, and if not, seeds it
server-side from `/opt/perftest/aqa` (the shared canonical build) before the suite ever runs. A
real dependency change still needs `scripts/build-offline-bundle.sh` - this only covers "this
`$REMOTE_ROOT` has never had a `node_modules` at all" on an otherwise-unchanged `package.json`.

**Fourth related incident (2026-09-17): the full-tree `tar` sync's OWN fix for the whitelist
problem above creates a different, harder-to-diagnose risk — it ships whatever's on disk, dirty or
not, never a specific git ref.** `sync_sources()` (per the 2026-09-07 fix above) `tar`s the raw
local working tree, uncommitted changes included — there is no `git archive`/`git stash`/clean-tree
check anywhere in the sync path. `vm-results-smoke-m2-20260916-202906` /
`vm-results-regression-m2-20260917-004121` showed `currency-helper.ts`'s
`grantCheckerAccessToCurrencyOrder` sending a non-empty `UNIT` on a `DIFF_UNIT=false` market despite
the committed code unconditionally nulling it (`git log -p` confirmed every committed version,
since 2026-09-03, does this correctly) — two full trace passes plus a live empirical check of the
exact code pattern found no mechanism in the codebase capable of reintroducing it. A same-day
re-run from (presumably) a clean tree passed all 6 `currency-smoke` tests with the identical probe
now correctly omitting `UNIT` — see
`docs/module-theory/Currency Definition and Logic/INDEX.md`'s 2026-09-17 entry for the full
resolution. Since nothing in git history could produce the bad behavior, the only explanation
consistent with the evidence is a transient, never-committed edit sitting on the syncing engineer's
disk at that specific sync moment — which, once overwritten, leaves no trace to confirm after the
fact. **Predict**: before spending real effort root-causing a live bankstg/VM failure whose behavior
contradicts what the current `git show HEAD:<file>` says the code does, check (or ask the person who
ran it to check) whether `git status` was clean on their machine at sync time — this sync mechanism
cannot guarantee it ran what's committed, and a "the code clearly does X but the run shows Y"
contradiction is this failure mode's own signature, not necessarily a deeper bug.

**Retraction, same day.** Asked again later on 2026-09-17 ("isolated `currency-smoke` run passes,
full-suite run fails, `UNIT` appears in the wire payload despite the code `delete`-ing it"), this
entry was initially cited as the explanation. **The user then refuted that directly** with a
controlled `smoke_m2` → standalone `currency-smoke` → `smoke_m2` sequence run from the same branch
with no edits between the three runs — dirty-tree sync cannot explain a result that depends on which
suite is chosen if the on-disk code never changed across all three invocations. Re-investigation
(`run-suite.sh`/`playwright.config.ts` git history) found the real cause was unrelated to this entry's
mechanism: `CURRENCY.MARKET~MASTER` is a fixed CBS system table whose records persist across separate
runs on the shared `bankstg` environment (not scoped to a run's own table group), so a market's
`DIFF_UNIT` flag is genuinely ambient, cross-run state — see
`docs/module-theory/Currency Definition and Logic/US-01.13.03/README.md`'s later 2026-09-17 entry for
the full correction. This entry's own mechanism (dirty working-tree `tar` sync) remains valid and
well-evidenced for the incidents it was originally written for (stack traces pointing at removed
symbols, etc.) — it just was not the explanation for this particular currency symptom. **Lesson worth
keeping**: a plausible-sounding, evidenced mechanism from a related past incident is not automatically
the right explanation for a new symptom that merely resembles it — verify against the specific
evidence (here, the actual recorded `+ exec` command lines) before citing it as confirmed.

**Fifth related incident (2026-09-21): the full-tree `tar` sync's own additive-only extraction left
a moved file's old copy on the VM forever, and playwright ran both.** `vm-results-api-*` showed
`teller-smoke` executing twice from two different paths; `vm-results-smoke-m2-*` (same VM, same
branch) showed it only once. `tar xzf` only adds/overwrites — it never deletes a path that dropped
out of the archive — so once `sync_sources()` switched to full-tree `tar` (2026-09-07 fix above), any
file *moved or removed* locally stopped being cleaned up on the VM the same way the whitelist-era fix
already handled *files that changed content*. `git log --all --diff-filter=A -- '**/teller-smoke*'`
confirmed the file used to live at `api/system_core/tests/teller-smoke.spec.ts` and was later moved to
`api/teller/tests/teller-smoke.spec.ts`; the VM still had both. **The rule generalizes**: any
additive-only sync mechanism (this `tar` pipe, or `scp`/`cp` without `--delete`) accumulates dead
files under renames/moves/deletions indefinitely — a whole separate failure class from "sync forgot to
update a file's *contents*" (the original whitelist bug this file was written for).

**The fix (2026-09-21).** `sync_sources()` in `scripts/test-scripts/shell-scripts/run-on-vm.sh` now clears the VM's previous
source tree before extracting the fresh one: `find $REMOTE_ROOT -mindepth 1 -maxdepth 1 ! -name
node_modules ! -name .git ! -name .husky ! -name playwright-report ! -name allure-results ! -name
allure-report ! -name test-results ! -name '.env*' ! -name 'vm-results-*' ! -name offline-bundle -exec
rm -rf {} +`, run over `ssh` right before the `tar xzf`. This removes every top-level entry except the
seeded/generated state that must survive between runs (`node_modules`, `.env`, results/report dirs),
so each sync mirrors the local tree exactly — a moved/deleted file's old path can no longer linger.
Confirmed `bash -n` clean; not yet verified against a live VM run.

**Sixth related incident (2026-09-24): a normal `console.log` added inside a helper can be
completely absent from `watch_run()`'s live terminal stream even though sync/build are both fine
and the log line genuinely executed on the VM.** Distinct from the buffering-lag bug above (that
one delays lines; this one drops them from the *stream* permanently, though they still land in the
full `vm-run.log`/fetched `run.log`). `watch_run()`'s pipeline (`run-on-vm.sh:292`) is a content
*allow-list*, not a passthrough: `grep -E 'passed|failed|did not run|exit code:|started:|finished:
|group-health|Error:|28P01|42501|^[[:space:]]+(ok|[0-9]+|.)[[:space:]]+[0-9]+|^\[.*\]|^(suite|base
url|keycloak|user|reachability|workers)[[:space:]]*:|^Running [0-9]+ tests? using'` — any log line
that doesn't match one of those patterns (e.g. a plain `Group has been created successfully with ID:
${groupId}`, which starts with neither `[` nor a known keyword) is silently discarded from the
terminal view. **Before concluding a newly-added log line "isn't showing up because of a stale
sync/build," check two things in order: (1) confirm the code path that contains it actually ran at
all — an auto worker fixture that depends on another auto fixture (e.g. `workerGroupId` depends on
`workerSuperAdmin` in `api-fixtures.ts`) never starts its own body if the dependency's setup throws,
so a log line deep inside `provisionWorkerTableGroup` never executes if an earlier step like
`createSuperAdminTestUser`'s own `SM.USER.GROUP~MAIN` call already failed and aborted the chain —
check the fetched `run.log`/Playwright error for what actually threw first; (2) only if the line
provably ran, check whether it matches `watch_run()`'s allow-list regex before assuming the log
plumbing itself is broken.** Confirms, from this same investigation, that `sync_sources()` (see
above) has no whitelist on *files* — the full local working tree, uncommitted changes included, is
synced every run unless `--no-sync` is passed — so "did the build pick up my new folder/file" is not
the failure mode here; the two mechanisms above are.

**Seventh related incident (2026-09-25): the "only one run at a time" guard never actually worked, so a stuck/orphaned earlier launch silently kept writing into `allure-results` underneath a brand-new run for hours.** `run_state()` detected an in-progress run with `pgrep -f '[c]li.js test'` — a pattern that matches `node .../playwright/cli.js test`, but `npx playwright test` on this VM resolves through `npm exec` → `node_modules/.bin/playwright` → `node .../playwright/lib/worker/workerProcessEntry.js`, none of which contain the literal substring `cli.js test`. The check therefore always reported `IDLE`, even while a previous launch was still actively running (confirmed live: a `currency-regression`/`idempotency-*` run from ~2h11m earlier the same day, apparently stuck on the `no healthy upstream`/`table-registry-helper` retries documented elsewhere, was still executing and still writing new `allure-results/*-result.json` files while a brand-new invocation of the same command ran concurrently). `allure-results` accumulated results from spec files (`customization-regression.spec.ts`, `dates-holidays-*`, `document-management-*`, etc.) that were never in the current command's file list, inflating one fetched report from an expected 123 tests to 894 — but `playwright-report` stayed correct, because its HTML reporter overwrites its output atomically per-process (whichever run finishes last simply replaces it), while `allure-playwright`'s file-per-test writer is append-only and both processes shared the same directory with nothing to prevent the collision. Ctrl+C during `--follow`/streaming only stops the local watch loop (documented, intentional — this is what lets a closed laptop survive), which is what left the stuck run undetected in the first place: the engineer had Ctrl+C'd an earlier attempt believing it stopped the remote run.

**The fix (2026-09-25).** `run_state()` now reads `$REMOTE_ROOT/.run.pid` and checks `kill -0 <pid>` instead of pattern-matching a process's command line — robust to however `npx` happens to resolve the binary. `start_run()`'s launcher runs `run-suite.sh` via `setsid` (its own process group) and records `$!` into `.run.pid`, removing it on completion. A new `--stop` flag (`stop_run()`) sends `SIGTERM -- -PGID` to that recorded group, waits 5s, escalates to `SIGKILL` if still alive, and clears the pid file — the first way to actually abort a detached remote run on purpose. Two more flags cover the case `--stop` can't (a pid this script never tracked): `--ps` lists just each running suite's root process (its own `npm exec playwright test ...` line - pid, elapsed time, command; a second "full tree" section below it keeps the raw `ps` output including workers and unrelated node/npm daemons like `node_exporter` or a leftover `playwright show-report` server, for debugging only), and `--kill <pid>` terminates one specific pid's whole process group (same `terminate_pgid()` logic `--stop` uses) without touching any other, unrelated process — this is exactly how to kill one stuck/orphaned launch while a different, legitimate run keeps going in another process group. (Filtering to roots-only was added same day after the raw full-tree listing proved genuinely hard to read live - a real 2-run VM printed 11 rows across 2 unrelated daemons and 2 run trees.) **`--stop`/`--kill` only protect runs launched after this fix** — an already-orphaned process from before it has no `.run.pid`, so it won't show as `RUNNING` in `--status` either; `--ps` is the only way to find it. `show-current-runs.sh` and `scripts/delete-run-by-id.sh <pid>` (both since replaced by the `.ts` versions below) were zero-flag wrappers over `run-on-vm.sh --ps`/`--kill` for the common case of "what's running" / "kill this one" without remembering the flag names.

**Same-day follow-up: replaced with interactive `.ts` versions so the stage doesn't have to be remembered/typed either.** `scripts/test-scripts/npm-scripts/show-current-runs.ts` and `scripts/test-scripts/npm-scripts/delete-run-by-id.ts <pid>` (superseding the `.sh` wrappers above, deleted) prompt for which stage (bankstg/bankuat/two.bankuat) via the same `prompts`-library picker `find-test.ts`/`find-suite.ts` already use for their own "where to run it" prompt (the shared choice list is now `pickEnv()` in `find-shared.ts`, factored out of that pair's existing `pickRunTarget()`), then `spawnSync`s `run-on-vm.sh --env <picked> --ps`/`--kill <pid>` with `stdio: 'inherit'` so output streams live — unlike `find-test.ts`/`find-suite.ts` themselves, which only ever build and clipboard-copy a command, these two actually execute (listing processes is read-only, and killing one is exactly the point of running the script at all). `npm run show-current-runs` / `npm run delete-run-by-id -- <pid>` added as aliases (named after the script file, same as `find-test`/`find-suite`'s own convention — renamed same day from an initial `vm-runs`/`vm-kill` to match that convention exactly). `tsc --noEmit`/`eslint` both clean.

**Same-day correction: `--kill`/`--stop` silently killed nothing at all against a pre-fix orphan, and reported "stopped" anyway.** `terminate_pgid()`'s first version sent `kill -- -$pid` on the assumption that `$pid` is its own process group leader — true for anything launched by the `setsid`-based fix above, but **not** for an orphan process that predates it: its pgid is whatever it inherited from the session that originally launched it, not its own pid. Confirmed live: orphan pid `4189091` (the same one from the incident above, still running) had pgid `4189081` — `kill -- -4189091` targeted an empty process group and did nothing, `2>/dev/null; true` swallowed the resulting error, and the function printed "stopped" unconditionally without ever re-checking `kill -0 $pid` after the final `SIGKILL`. A second `--ps` right after showed the same pid still running with the same elapsed time trajectory, proving no signal had reached it. **Fixed** by resolving the real pgid first (`ps -o pgid= -p $pid`) and killing `-$pgid` instead of `-$pid`, and by re-checking `kill -0 $pid` after the final `SIGKILL` and returning failure (both callers now only clear `.run.pid` on confirmed success, and `--kill`'s exit code reflects it). Verified against the same live orphan: with the fix, `--kill 4189091` correctly resolved pgid `4189081`, and the process was gone on the very next `--ps`. **The general lesson: never assume `pid == pgid` for a process this tooling didn't itself launch with `setsid`/`setpgid`, and never report a kill as successful without re-checking liveness afterward** — a swallowed `2>/dev/null` on a signal command hides exactly this kind of silent no-op.

**Superseded 2026-10-01: `run-on-vm.ps1` was deleted (TB-4197), so the paragraph below no longer applies; only `run-on-vm.sh` exists.** Historical text: `run-on-vm.ps1` still had BOTH bugs, unfixed as of 2026-09-21. Its `Sync-Sources` was never
updated for the 2026-09-07 full-tree rewrite above — it still `scp`s an explicit ~8-file whitelist
(the pre-2026-09-07 mechanism this file's main entry documents), so most spec files including
`teller-smoke.spec.ts` never reach the VM via `.ps1` at all, and the 2026-09-21 stale-file fix has no
`.ps1` equivalent to add yet either. Left as-is at the engineer's explicit request (separate task).
