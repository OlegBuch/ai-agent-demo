@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /create-hrm-template

## Role

You are acting as the Project Manager (`${CLAUDE_PLUGIN_ROOT}/commands/team/pm-agent.md`), applied
to one specific, recurring task: turning a day's freeform description of work into a correctly
structured HRM logworks entry, with a best-effort hour split you compute yourself from real
signals. Callable standalone at any point in a conversation, like `/session-summary`/`/create-pr`
— it carries no fixed persona context beyond `pm-agent.md`.

## Mission

Given a date and a freeform description of what the user worked on (or plans to work on) that
day, resolve the Jira Parent/Epic for every ticket mentioned, **estimate an hour split** from
real signals (ticket lifecycle timestamps, git/GitLab activity, Google Calendar events), group
the day's activities under those Parents per the org's mandated template below, and:

1. Print the rendered entry back to the chat, in English — the primary deliverable, ready to
   paste into HRM.
2. Upsert it into a running per-month draft file in the resolved `proj-ai-agentic` working tree, so
   the whole month accumulates in one place across sessions.

Every hour figure is either (a) stated explicitly by the user, or (b) computed from a named
signal and marked `(est.)` with that signal stated alongside it. Never present a number without
saying which of the two it is, and never invent an hour figure with no signal and no user
statement behind it — fall back to an even split across that day's active Parents in that case,
still marked `(est., even split — no activity signal found)`.

## Input

```
/create-hrm-template <DD.MM.YYYY>
<freeform description: task progress, blockers, meetings, hours if already known>
```

Ticket keys are recognized directly in the description (e.g. `TB-1306`). Hours the user states
explicitly (e.g. "TB-1306 — 3h") always win over any computed estimate for that item.

## Output language

The rendered template — every activity description, meeting name, and note — is always written
in **English**, regardless of the language the user's own description was written in. Translate
freely; keep ticket keys, person names, and proper nouns as-is. Only the persisted
`docs/hrm-logs/<yyyy-MM>.md` file and the chat response need to be in English — this command's
own conversation with the user about it (clarifying questions, flags) can stay in whatever
language the user is using.

## The org's HRM template (canonical — apply exactly as given)

```
Day X:
Global Meetings - <h>h

Parent: <Epic name> (<h>h)
Code review
<TICKET-KEY> — <short English description>
<TICKET-KEY> — <short English description>
Dedicated meeting (<name>)

Parent: <Epic name 2> (<h>h)
<TICKET-KEY> — <short English description>
```

Rules that come with this template — do not deviate from these without the user explicitly
overriding them for a specific day:

* Every Parent block's line items are the tickets/activities worked on that day for that Epic;
  hours are stated once, at the Parent level, in parentheses next to its name — not per line item.
* Every ticket's Parent/Epic must be resolved live (read-only, via the `claude-proj-agent:atlassian-routing` skill) before it's placed
  in a block — never guessed from the ticket title, project, or a prior day's placement.
* If a ticket has **no** Parent/Epic in Jira, do not place it under any Parent. Flag it explicitly
  in the response (`⚠ <TICKET-KEY> has no Parent/Epic — ask your PM before logging this`), per the
  org's own instruction.
* **Daily standup** time is folded into whichever Parent got the most hours that day — it never
  gets its own line or its own Parent.
* **Global Meetings** is reserved for calls not tied to any specific module/Epic (company-wide,
  cross-team) — it is not a catch-all for anything you couldn't otherwise place. If an activity
  doesn't fit a resolved Parent and isn't obviously a global/cross-cutting meeting, ask the user
  rather than defaulting it into either bucket.
* Retroactive days (any date since the 1st of the current month) use the exact same template and
  the exact same rules — this command works identically for "today" and for "three weeks ago."
* All free text in the rendered output is in English (see "Output language" above).

## Steps

### Step 1 — Resolve the working tree

Resolve the actual `proj-ai-agentic` git working tree, per `base-agent.md`'s "Repository &
Persistence Model" (never `${CLAUDE_PLUGIN_ROOT}`, the read-only plugin cache).

### Step 2 — Extract ticket keys and any stated hours

Scan the user's description for ticket keys (`[A-Z]+-\d+`) and for any hours the user explicitly
attached to a ticket, a Parent, or the day as a whole. Anything the user stated explicitly always
wins over a later computed estimate for that same item.

### Step 3 — Resolve each ticket's Parent/Epic (read-only, via the `claude-proj-agent:atlassian-routing` skill)

For every extracted ticket key, fetch the ticket live (`parent` field, plus `status`,
`statuscategorychangedate`, and `changelog` for Step 4) — the `claude-proj-agent:atlassian-routing` skill
picks the right site connection (`atlassian-innowise` / `atlassian-bank`) automatically. Record the Parent's name for grouping. If a ticket
has no `parent`, mark it as flagged per the template rules above — do not proceed to place it
under a Parent.

### Step 4 — Gather signals and estimate the hour split

Pull every signal below that's available; missing ones just narrow what you can estimate, they
never block the command.

**4a. Google Calendar** (`mcp__claude_ai_Google_Calendar__*` tools — if not yet authenticated,
say so once and continue without it rather than blocking the command). List the user's events for
the given date:
- An event that's clearly company-wide/cross-team (not tied to one module) → its real duration
  goes straight into **Global Meetings** hours — this is exact, not estimated.
- An event tied to a specific module/ticket/Epic (named after one, or matching a "Dedicated
  meeting" the user mentioned) → its real duration is added to that Parent's total, listed as
  `Dedicated meeting (<name>)`.
- An event named/looking like the team's Daily/standup → its duration is set aside and added to
  the Parent that ends up with the largest share after Step 4d, per the template's own rule —
  never given its own line.
- Everything else calendar-derived is exact time, not `(est.)` — only the ticket-work split in
  4d is ever marked as an estimate.

**4b. Ticket lifecycle signal** (from the Jira changelog already fetched in Step 3): a ticket is
"active" on any day between its transition *into* `In Progress` and its transition *into* the
next state (`In Review`/`In Code Review`/`Done`). A status transition landing on the day itself is
a strong same-day signal, not just a window membership.

**4c. Git/GitLab activity signal**: in the consuming repo's working directory (resolve it the
same way any session working directory is resolved — do not assume a fixed path), run
`git log --all --author=<resolved git user> --since=<date> --until=<date>+1day --pretty=format:"%h %ad %s" --date=iso`
for commit count and messages that reference a ticket key that day. Also check each ticket's
linked Merge Request via `getJiraIssueRemoteIssueLinks` (the `RemoteWorkItemLink` changelog
entries already show MR titles/links) — an MR opened, updated, or merged that day is another
same-day signal for that ticket's Parent. No direct GitLab REST/API call is assumed here; this
relies on the already-cloned repo's own git history plus Jira's own record of the MR link.

**4d. Compute the split**:
1. Total workday hours: default **8h**, unless Calendar (4a) shows a clearly different total span
   (first event start to last event end) for that date — never invent a number far from a
   standard workday without a stated reason.
2. Subtract exact Calendar-derived Global Meetings and Dedicated-meeting hours (4a) from the
   total. Set the Daily's duration aside separately (added back in step 4).
3. The remainder is split across every Parent with same-day activity (from 4b/4c) proportional to
   signal strength: commit count that day, whether the ticket's status changed that day, and
   whether it's the day the ticket was picked up or wrapped up. If exactly one Parent has same-day
   signal, it gets the entire remainder. If several, split proportionally (equal split if signals
   tie or none are available beyond "mentioned that day"), rounded to the nearest 0.5h, with any
   rounding remainder absorbed by the Parent with the strongest signal.
4. Add the Daily's duration (from 4a, or a default 15–30 min if Calendar isn't connected and the
   user's description mentions a Daily happened) into the Parent with the largest resulting share.
5. If no signal exists at all for a day (no Calendar, no commits, no status transition, nothing
   dated) — fall back to an even split of the remainder across the Parents mentioned in the
   user's own description, marked `(est., even split — no activity signal found)`.

Every Parent-level hour figure derived from 4d gets a one-line justification in the chat response
("TB-1532 (est.): 3 commits + moved to In Progress that day") so the user can correct it before
pasting into HRM — never present a computed number silently as if the user had stated it.

### Step 5 — Group and render

Group resolved tickets by Parent. Route unresolvable-Parent tickets and any activity that doesn't
clearly belong to a Parent or to Global Meetings into an explicit call-out rather than guessing.
Render the day using the canonical template above, in English, using the user's stated hours
verbatim where given and the Step 4 estimates (marked `(est.)`) everywhere else.

### Step 6 — Persist the month's running draft

Upsert a `## Day <D> (<DD.MM.YYYY>)` section into
`<proj-ai-agentic working tree>/plugins/claude-proj-agent/docs/hrm-logs/<YYYY-MM>.md` (create the
file, with a top-level `# HRM Logworks Draft — <Month YYYY>` heading, if this is the first day
logged that month). If a section for that exact date already exists (the command was re-run for
the same day), show the user the existing section that would be replaced and wait for an explicit
yes before replacing it in place; otherwise insert in date order. This file is a personal
working draft, not the HRM system itself — it exists so the whole month's entries accumulate
across sessions instead of living only in chat scrollback.

Leave the file as an uncommitted change in `proj-ai-agentic` and say so — this command does not
commit/push; that only happens via `/create-pr`, run explicitly by the user.

### Step 7 — Report back

Print the rendered day block in the chat (English), list any `⚠` flags (no-Parent tickets,
unplaced activities), and list the signal behind every `(est.)` figure so the user can correct
any of them before submitting.

## Constraints

Never assign a Parent/Epic without a live Jira lookup for that specific ticket. Never fold a
genuinely Global/cross-cutting meeting into a ticket's Parent, or vice versa, when the user's
description and Calendar both leave it ambiguous — ask instead. Never silently drop an activity
that didn't fit a bucket. Never present a computed hour figure without marking it `(est.)` and
stating the signal behind it. Never render the template in any language other than English.
Never restate this template anywhere else — this file is its single source; `pm-agent.md` only
references it.

## Definition of Done

- Every ticket key mentioned has a live-resolved Parent, or is explicitly flagged as having none
- Every hour figure in the output is either the user's own stated number, or a signal-justified
  `(est.)` figure with that signal named in the chat response
- Daily-meeting time is folded into the day's largest Parent, never given its own line
- The rendered output (chat and persisted file) is entirely in English
- The day's entry is printed in chat and upserted into
  `docs/hrm-logs/<YYYY-MM>.md` in the resolved `proj-ai-agentic` working tree
- The file is left as an uncommitted change, and the user is told so
