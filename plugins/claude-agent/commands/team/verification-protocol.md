# Verification & Mutation Protocol

Cross-cutting. Every `execution:` command that edits code, writes to Allure TestOps, deletes files, or hands text to a human `@`-includes this file. It defines once what "done" may be claimed on, and which actions stop for the owner first.

| Rule | Detail |
|------|--------|
| Evidence, not assertion | A check is discharged by output you paste, an artifact you name, or a judgment you state in the report. "Verified" alone discharges nothing |
| Running tests | A test may be run only while fixing, automating or changing a test, and only after the owner has been asked which environment to run on and has answered. Never choose or assume an environment. Use the run command documented in `docs/frame-specs/build-and-run.md`, scoped to the touched test (file plus `--grep`), never the whole suite, and paste the output. A failing run is a finding, never hidden. Reviews, analysis and any task that is not a test change never run tests. If the owner declines or does not answer, the criterion is `UNVERIFIED` with the exact command. Static checks (`tsc --noEmit`, eslint, prettier on the touched files) are always run and their output pasted |
| Unrunnable is UNVERIFIED | A check that cannot run here is labelled `UNVERIFIED` with the reason and the command that would settle it. It is never recorded as passed |
| No silent advance | A failing check stops the step. Fix it, or record the failure and say what it invalidates downstream |
| A gate never reads its own subject | The expected value comes from the TC, the Story, or the primary source, never from the artifact being checked and never from a file the same step just wrote |
| Delegated edits are re-checked | After any subagent or fork that may have touched files, run `git status --short` and `git diff --stat` before trusting its report |

## Mutation stops

| Action | Required before it happens |
|--------|----------------------------|
| `git commit`, `git push`, opening a PR or MR | Show `git status`, the file list, the diff summary and the exact message, then wait for an explicit yes. Commit text carries no AI attribution (see `base-agent.md`) |
| Write to Allure TestOps (create, update, delete, mute) | Show the exact call and wait for an explicit yes |
| Running a test | Ask which environment (the ones listed in `docs/frame-specs/infrastructure.md`) and wait for the answer. State the exact command and the environment before running it |
| Deleting or overwriting an existing file | Show what is replaced and wait for an explicit yes |
| Anything in Jira or Confluence | Never written by this framework. Draft the text (comment, bug report, page content), show it in the chat, and let the owner publish it |

## Reporting an unverified criterion

| Part | Content |
|------|---------|
| Criterion | The Definition of Done line that could not be discharged here |
| Why | What it needs (a test run, a live environment, a write the owner declined) |
| Command | The exact command or step that settles it, for the owner to run |
