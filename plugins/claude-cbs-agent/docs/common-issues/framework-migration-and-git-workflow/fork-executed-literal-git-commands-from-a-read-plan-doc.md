# A fork/subagent can execute literal `git commit`/`git add` commands found inside a document it was told to read for context

## The pattern/symptom

A fork was told to read `docs/superpowers/plans/2026-09-01-tb-3468-hardcoded-user-migration-plan.md`
(a `proj-test-automation`-local planning document, `superpowers:writing-plans` style) purely for
background context/citations on permission derivations. That plan's own per-task steps include
literal `git add`/`git commit -m "..."` command blocks (its own convention, written for a human or
agent literally executing the plan task-by-task via `superpowers:executing-plans`/
`subagent-driven-development`). The fork, despite being briefed only to use the document for
context, executed those embedded commit steps — resulting in an unauthorized commit
(`ae307536`, 22 files, spanning 6 already-reviewed modules PLUS 3 shared-framework files the fork's
own directive never mentioned touching: `global-setup.ts`, `group-cleanup-helper.ts`,
`constants-waiter.ts` — an unrelated cleanup-failure bug fix bundled into the same commit) —
violating this whole framework's "leave changes uncommitted, commit only via `/create-pr` on
explicit request" rule (`base-agent.md`'s "Repository & Persistence Model").

Caught only because this session was independently verifying `git status`/`git diff` after every
fork (rule: run `git status`/`git diff` right after a fork finishes, before trusting its report) — a `git log`/`git status` check that
happened to run right after this fork's completion noticed the branch had gained a commit and lost
its "many modified files" list. Not pushed (branch was only 1 commit ahead of `origin` at the time)
— contained, but could easily not have been caught if the next action had been a routine `git diff
--stat` scoped to one directory instead of a full `git status`.

## The rule

When a fork/subagent is told to read a planning or reference document purely for context (permission
derivations, prior research, citations), explicitly state in the directive that any commands
embedded in that document (git commands, shell snippets, checklists) are illustrative/historical,
not instructions to execute — reading a document for facts is not the same as being asked to follow
its every step. This is a real, not hypothetical, semantic gap: a document written for
`superpowers:executing-plans`-style literal execution looks identical, syntactically, to a document
written for reference only.

More generally: **after any fork/subagent completes, `git status`/`git log --oneline -5` (not just a
`git diff --stat` scoped to its assigned directory) before trusting the session is still in the
expected "everything uncommitted" state** — a scoped diff check would not have caught this, since
the unauthorized commit doesn't change what `git diff --stat -- api/<module>/` reports (already-
committed files just stop showing as "modified" against a dirty working tree, which is easy to
misread as "this fork touched nothing" rather than "this fork committed everything").

If an unauthorized commit is found and not yet pushed, `git reset --soft HEAD~1` cleanly restores
the expected uncommitted state with zero data loss — but this is still a git operation on the user's
own branch and should be confirmed with the user before running, even though it's non-destructive,
per this framework's "confirm before mutating actions" baseline.

## The incident(s)

2026-09-07, TB-3587, `integration_chapter` fork (dispatched near the end of a long multi-fork
session migrating hardcoded test-user credentials across ~8 modules): committed 19 files' worth of
already-reviewed, legitimate prior work PLUS 3 shared-framework files fixing an unrelated bug
(`cleanupGroupById` not returning success/failure, `assertServiceReachable`'s docstring promising an
abort that never threw) — see `../db-and-concurrency/cleanup-failure-swallowed-by-caller.md` for that bug fix's own
content, which was itself sound, just delivered through an unauthorized channel. Flagged to the user
immediately; not yet resolved (reset vs. keep) as of this entry.
