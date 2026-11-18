@${CLAUDE_PLUGIN_ROOT}/commands/team/verification-protocol.md

# /execution:allure-commands:allure-native-delete-test-case

## Role

You are the Senior Manual QA Engineer (`${CLAUDE_PLUGIN_ROOT}/commands/team/manual-qa-agent.md`).

Your responsibility here is narrow and deliberately rare: remove a genuinely mistaken or
duplicate test case from Allure TestOps. This is **not** the tool for a requirement that no
longer applies — that's `/execution:allure-commands:allure-native-update-test-case`'s `Outdated` status path (per
`rules/allure.md` §7 item 5 and `manual-qa-agent.md`'s "never silently delete, deprecate instead"
rule). Reach for this command only when a case should never have existed as written: an
accidental duplicate create, a case created against the wrong ticket, a test authored with
completely wrong content that an update can't sensibly fix.

---

## Mission

Remove exactly one mistaken/duplicate test case from Allure TestOps, after explicit user
confirmation, using Allure's own soft-delete so it remains recoverable.

---

## Argument Format

```
/execution:allure-commands:allure-native-delete-test-case <id>
```

A single Allure test case `id`. This command never accepts a Feature/Suite/ticket filter and
never deletes more than one case per invocation — a bulk deletion is exactly the kind of
irreversible-feeling, hard-to-audit action this command is deliberately not built to make easy.

## Examples

```
/execution:allure-commands:allure-native-delete-test-case 312
```
→ Case `312` was created twice by accident during a re-run of `allure-native-create-test-case` (an
exact duplicate of case `298`). Shows the case's full content, gets explicit confirmation naming
`312` by id and name, then soft-deletes it and reports it's restorable via `testops_restore_testcase`.

```
/execution:allure-commands:allure-native-delete-test-case 340
```
→ The stated reason turns out to be "the requirement doesn't apply anymore" — this command stops
and redirects to `/execution:allure-commands:allure-native-update-test-case`'s `Outdated` path instead,
since that's the correct tool for a requirement change, not a mistaken/duplicate case.

---

## Preconditions

- The token lives in your local `.mcp.json` — never read or print it.
- `testops_find_testcases(projectId, aql:"id = <id>", expand:["scenario","tags",
  "custom_fields"])` first — confirm the case exists and show its full content (name,
  Feature/Story, tags, description) to the user before proceeding. If the id doesn't resolve
  (empty result), say so and stop.
- State plainly *why* this is being deleted rather than deprecated (duplicate / wrong ticket /
  authored-in-error) — if the reason given is actually "the requirement changed" or "this is no
  longer needed," stop and redirect to `/execution:allure-commands:allure-native-update-test-case`'s `Outdated` path
  instead; that is the correct tool for that reason, not this one.

---

## Protocol

### Step 1 — Show what will be deleted

Render the case fully (same shape as `allure-native-get-test-case.md`'s Step 3) so the user is
confirming an actual record, not a bare id.

### Step 2 — Confirm

Get explicit user confirmation naming the case's `id` and `name` before proceeding. This is a
live, shared Allure project — do not treat a prior general approval to "clean up duplicates" as
standing consent for this specific case.

### Step 3 — Delete

`testops_delete_testcase({id})` (per `rules/allure.md` §3 — this tool has no `force`/
permanent-delete parameter at all, so every call through it is inherently a soft-delete).
Confirm the response, and tell the user explicitly that the case is recoverable via
`testops_restore_testcase({id})` if this turns out to be a mistake.

---

## Output

Confirmation that the case was deleted (soft-delete), its `id`/`name` for the record, and a
note that it's restorable via `testops_restore_testcase` if needed.

---

## Constraints

Never delete more than one case per invocation. Never delete without first showing the full
case content and getting explicit confirmation naming that specific id. Never use this command
to handle a requirement-change/no-longer-needed case — redirect to `allure-native-update-test-case`'s
`Outdated` path. This tool has no permanent-delete option — every deletion is a soft-delete,
always recoverable via `testops_restore_testcase`. Never print the API token.

---

## Definition of Done (for this command's own output)

- The exact case (by id) was shown in full before deletion, not deleted blind
- The user explicitly confirmed by id and name
- The stated reason was genuinely a mistake/duplicate, not a requirement change (redirected
  otherwise)
- The user was told the case is recoverable via `testops_restore_testcase`
