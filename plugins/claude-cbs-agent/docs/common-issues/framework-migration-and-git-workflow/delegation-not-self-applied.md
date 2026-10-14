# Gather-stage delegation skipped despite the rule already being loaded

**The pattern/symptom.** A persona (any of them — this first surfaced in the AQA role) has
`base-agent.md`'s "Delegation & Model Routing" and `model-routing.md`'s Gather/Judge/Escalate
tiers fully loaded via `@`-include, and still does mechanical fetch/gather work (a REST `curl`
against Allure TestOps, reading many files in a row) inline in the main conversation instead of
spawning a fresh Haiku subagent for it. This is not a missing-information failure — the rule is
right there — it's a self-application failure: nothing forces the model to actually run the
delegation check before reaching for `Bash`/`Read`/`Grep`.

**The rule.** Before touching tools on any non-trivial task, decide out loud whether the first
step is Gather-stage (mechanical fetch/read/condense — delegate to a fresh Haiku `Agent` call) or
Judge-stage (renders a verdict/finding/recommendation — stays on the current model). Don't let
"I can just check this quickly" default to inline execution — that's the exact shape of this
failure. As of 2026-08-26 this is also enforced technically, not just advisory: see
`hooks/delegation-track.ps1` (`PostToolUse` on `Bash|Read|Grep|Agent`) and
`hooks/delegation-check.ps1` (`Stop`) — they track, per session, a raw `curl`/network Bash command
or more than 5 consecutive `Read`/`Grep` calls with no intervening `Agent` call, and block the turn
from ending until either an `Agent` call happens (auto-clears) or an explicit
`echo proj-delegation-ack: <reason>` is run (the documented "I judged this didn't need delegation"
escape hatch), mirroring `closeout-track.ps1`/`closeout-check.ps1`'s own precedent for the Task
Closeout Protocol.

**Known limitation of the hook (unverified as of 2026-08-26):** if a subagent's own tool calls
report through this same hook pipeline under the *same* `session_id` as the parent conversation,
the hook cannot distinguish "the main thread is stalling on inline work" from "a Haiku Gather
subagent is doing exactly the delegated work it was spawned for" — the latter would wrongly
increment the counter right after a correct delegation. Not yet observed either way; check this
first if `delegation-check.ps1` blocks suspiciously often immediately following an `Agent` call.

**The incident(s).** 2026-08-26, `proj-test-automation`, TB-2960 session (fullstack-aqa-agent):
asked to cross-reference an Allure Story's 13 test cases against `allureCaseId` calls already
wired into two spec files. This is textbook Gather-stage work (mechanical Allure REST
fetch/condense, no verdict). The fetch was attempted inline first; the user had to explicitly ask
"why didn't you delegate this to Haiku" before it was corrected. The rule was fully available in
context at the time — this session's own instance of the pattern is what prompted writing the
enforcement hook above.
