---
name: bluedot
description: How to query Bluedot meeting data through the Bluedot MCP server, scoped to the CBS workspace. Activates when the user asks about their Bluedot recordings, meetings, transcripts, meeting summaries, action items from a call, who attended a meeting, or to search across past meetings — e.g. "what were the action items from yesterday's standup", "find the meeting where we discussed pricing", "summarize last week's calls", "who was on the Q3 planning call". Always works inside the CBS workspace and guides the user to request access if they are not a member.
user-invocable: false
---

# Bluedot — querying meeting recordings & transcripts

Bluedot is a meeting recording and transcription platform. This plugin registers Bluedot's hosted MCP server, exposing eight **read-only** tools for inspecting workspaces, meetings, transcripts, and participants. Use this skill to choose the right tool and call them in an efficient order.

This integration is scoped to the **CBS** workspace. All meeting work happens there — clear the workspace gate (below) before running any query.

The MCP server name is `bluedot`, so the tools surface as `mcp__bluedot__<tool>` (e.g. `mcp__bluedot__search_meeting`). Below they are named bare for brevity.

## The eight tools

| Tool | Returns | Use it to |
|------|---------|-----------|
| `get_current_user` | Authenticated user id, email, display name | Confirm auth works; identify "me" / "my meetings" |
| `list_workspaces` | The user's workspaces | Pick which workspace to query |
| `get_workspace` | Workspace details incl. members and roles | Resolve who belongs to a workspace |
| `list_collections` | Collections within a workspace | Narrow to a folder/group of meetings |
| `list_meetings` | Recordings, with filtering + sorting | Browse meetings by recency, date, collection |
| `get_meeting` | **Full** meeting data: transcript + summary | Read one meeting in depth |
| `search_meeting` | Matches across transcripts, titles, descriptions | Find meetings by topic/keyword |
| `list_participants` | Participant emails for a meeting | Answer "who attended" |

## Operate in the CBS workspace

This integration is scoped to the **CBS** Bluedot workspace. Before answering any meeting query, confirm the user can access it, and run every subsequent call against it.

1. **Check membership.** Call `list_workspaces` and look for a workspace named **CBS**.
2. **If CBS is present:** capture its workspace id and pass it to `list_collections`, `list_meetings`, and `search_meeting` for the rest of the session. Never silently query a different workspace, even if another one is the user's default.
3. **If CBS is _not_ in the list** (the user is not a member): stop — do not fall back to another workspace. Get the user's email from `get_current_user`, then present this guidance and wait:

   > You're not a member of the **CBS** Bluedot workspace yet, so I can't read its meetings. To get access, email **Siarhei Rehinia** (siarhei.rehinia@innowise.com) and ask to be added. Here's a message you can send:
   >
   > > Subject: Please add me to the CBS Bluedot workspace
   > >
   > > Hi Siarhei, could you add me (`<your email from get_current_user>`) to the **CBS** workspace in Bluedot? I need access to the meeting recordings and transcripts. Thanks!
   >
   > Once Siarhei adds you, just ask me again — no re-authentication needed.

   After delivering this, do not attempt the query against any other workspace.

The CBS workspace groups recordings into collections — currently **Welcome to Bluedot**, **CBS internal**, and **CBS External**. When the user distinguishes internal vs. external meetings, resolve the matching collection with `list_collections` and filter `list_meetings` to it.

## Canonical workflow

Find first, fetch detail last. `get_meeting` returns full transcripts (large) — never loop it over many meetings to "look for" something; narrow with `search_meeting` / `list_meetings` first, then fetch detail only for the meetings that matter.

1. **Confirm the CBS workspace** (see *Operate in the CBS workspace* above) and use its id for every call. Use `list_collections` to narrow to **CBS internal** / **CBS External** when the user distinguishes internal vs. external meetings.
2. **Find the meeting(s).**
   - Topic or keyword ("where we discussed X") → `search_meeting`.
   - Time-based ("yesterday", "last week", "most recent") → `list_meetings` with date filter / recency sort.
3. **Read detail.** Call `get_meeting` for the specific meeting(s) to get the transcript and summary. Pull action items, decisions, or quotes from there.
4. **Attendees.** Use `list_participants` (or `get_meeting`) to answer who was on a call.

## Query recipes

- **"Action items from yesterday's standup"** → `list_meetings` (recent, filtered to yesterday) → identify the standup → `get_meeting` → extract action items from the summary/transcript.
- **"Find the meeting where we talked about pricing"** → `search_meeting "pricing"` → present matches → `get_meeting` on the chosen one.
- **"Who attended the Q3 planning call?"** → `search_meeting "Q3 planning"` (or `list_meetings`) → `list_participants` on the match.
- **"Summarize last week's meetings"** → `list_meetings` filtered to last week → `get_meeting` per meeting → synthesize. If there are many, confirm scope before fetching all transcripts.
- **"What did <person> commit to?"** → `search_meeting` for the topic/name → `get_meeting` → quote the relevant transcript lines.

When you present results, link them to the source meeting (title + date) so the user can verify, and quote transcript text rather than paraphrasing when accuracy matters.

## Authentication

Bluedot uses **OAuth** — there are no API keys or tokens to configure. On first use Claude Code runs the browser auth flow. If a tool call returns an auth/permission error, tell the user to run `/mcp`, select **bluedot**, and complete authentication (the Bluedot account may use a different email than their Claude account). Enterprise workspaces may require admin approval of the connector.

## Scope & limits

These tools are **read-only** — they cannot create, edit, or delete meetings, nor start a recording. If the user asks to change Bluedot data, say it isn't supported by this integration and point them to the Bluedot app.
