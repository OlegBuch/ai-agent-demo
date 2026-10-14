---
name: bruno-validate
description: User-invoked audit of Bruno API request `.yml` files against organization-specific API design rules — pagination shape, RFC 7807 errors, `x-correlation-id` headers, no audit timestamps in headers, projection paths, PUT semantics, `type`+`config` pairing, property grouping, field-name vs URL collisions, and `version` vs `seqNo`. Accepts a list of `.yml` files (e.g. pre-commit on staged files) or a single workspace path; defaults to the current workspace.
argument-hint: "[file1.yml file2.yml ... | workspace-path]"
user-invocable: true
disable-model-invocation: true
---

# bruno-validate

Audit a Bruno collection (OpenCollection YAML) against the organization's API design rules. Report findings grouped by severity (**ERROR / WARN / INFO**) with file paths, line numbers when available, and remediation suggestions.

## When to run this skill

Only when the user explicitly types `/claude-proj-agent:bruno-validate ...`. Model auto-invocation is disabled via frontmatter — do not run this skill in response to natural-language conversation, even if the user mentions "validate" or "audit". The user must invoke the slash command.

If the user just wants generic YAML syntax checking, this is not that skill — the goal here is **content-level API design review**, not format validation.

## Procedure

### Step 1 — Resolve targets

Parse the arguments passed after `/claude-proj-agent:bruno-validate`:

- **No arguments** → target = the current workspace. Walk up from the current working directory until you find a directory containing `opencollection.yml`. That directory is the workspace root; enumerate every request file under it with `Glob` pattern `**/*.yml`.
- **One argument that is a directory** → walk up from it (if needed) until `opencollection.yml` is found; enumerate all request files under that workspace root.
- **One or more arguments that are `.yml` file paths** → validate **only** the listed files. Locate the enclosing workspace by walking up from any one of them; the workspace root is used only so the report can display paths relative to it.

Common pre-commit invocation:
```
/claude-proj-agent:bruno-validate $(git diff --cached --name-only --diff-filter=ACM | grep '\.yml$')
```

If no `opencollection.yml` can be located anywhere, stop and tell the user: "No `opencollection.yml` found — not a Bruno workspace."

### Step 2 — Filter

From the resolved file list, exclude non-request files and the `Tables` collection:

- `opencollection.yml`
- `collection.yml`
- `folder.yml`
- Anything under `environments/`
- Anything under a `Tables/` directory at any depth (the `Tables` collection is intentionally exempt from API design rules — its requests follow a different shape and would produce spurious findings)

If after filtering no files remain, tell the user "No Bruno request files to validate." and stop.

### Step 3 — For each request, apply the rules below

Read each request file and parse it as YAML in your head. The fields you need are:

- `http.method`, `http.url`, `http.headers[].name`, `http.headers[].value`
- `http.body.data` (JSON string — parse it)
- `runtime.scripts[]` blocks (especially `type: tests` — scan the `code` for `expect(res.body.…)` patterns)
- `docs.content` if present

When a rule depends on data that simply isn't in the file (e.g. no response sample exists, so pagination shape cannot be verified), **skip that rule for that file** rather than emit a guess.

### Step 4 — Emit the report

Use the **Output report format** specified below.

## Rules

### Rule 1 — Pagination response shape (ERROR)

Paginated list endpoints **must** wrap items in a top-level `data` array, alongside a `page` object with `size`, `totalElements`, `totalPages`, `number`. No alternative wrapper key is permitted (`items`, `results`, `records`, `content`, …).

**Correct:**
```json
{
  "data": [...],
  "page": { "size": 5, "totalElements": 50, "totalPages": 10, "number": 0 }
}
```

**Detection:**
- A request is a likely list endpoint if `http.method: GET` and the URL's final path segment is **not** an `{id}`/path variable (i.e. no `{` or no trailing parameterized segment).
- Inspect `runtime.scripts` of `type: tests`. If you find `res.body.items`, `res.body.results`, `res.body.records`, `res.body.content`, `res.body.list`, or a top-level array assertion on `res.body` itself (`expect(res.body).to.be.an("array")`) — flag.
- Also inspect any sample JSON in `docs.content` for the same.

### Rule 2 — `x-correlation-id` header on POST (INFO)

Every `POST` request should include a header `x-correlation-id` with value `{{$randomUUID}}`.

**Detection:** for each `http.method: POST`, check that `http.headers[]` contains an entry with name (case-insensitive) `x-correlation-id`. Missing → INFO. Present but value is not `{{$randomUUID}}` → INFO (different message, "value should be `{{$randomUUID}}`").

### Rule 3 — No audit timestamps in headers (WARN)

The HTTP headers must not include `createdAt`, `updatedAt`, `createdBy`, or `updatedBy`. Audit metadata belongs in the response/request body, not as transport-level headers.

**Detection:** for each request, scan `http.headers[].name` (case-insensitive). Match any of: `createdat`, `updatedat`, `createdby`, `updatedby`, `created-at`, `updated-at`, `created-by`, `updated-by`, `x-created-at`, `x-updated-at`, `x-created-by`, `x-updated-by`. Flag each hit.

> **Severity note:** the source spec did not specify a severity for this rule; defaulted to **WARN**. Tell the user this in the report's first emission of Rule 3 so they can adjust.

### Rule 4 — Projections via `/operations/{operation}` (WARN)

Projections are created the same way as records: through the `/operations/{operation}` path. A direct path like `POST /projections` (or `PUT /projections/{id}`) for creation/mutation is incorrect.

**Detection:** `http.method` is `POST` or `PUT`, `http.url` contains `/projections` (as a path segment), and the URL does **not** contain `/operations/`. Flag.

### Rule 5 — PUT semantics (WARN)

For `http.method: PUT` requests, all of the following must hold:

1. The URL ends with an identifier segment (e.g. `/users/{id}`, `/projections/{projectionId}`). A PUT to a collection path like `/users` with no trailing identifier is wrong.
2. The request body must **not** contain an `id` field at the top level. The identifier comes from the URL, never the body.
3. Clearing a field is done by setting it to explicit `null` (informational note when `null` values are present in the body — don't flag this as a problem, just point it out so the reviewer can confirm intent).

**Detection:**
- Parse `http.url`. The last non-query path segment should look like a variable (`{...}`) or contain a placeholder pattern. If it's a static plural noun, flag (1).
- Parse `http.body.data` as JSON. If `id` exists at top level, flag (2).
- If any value in the parsed body is literal `null`, emit a Rule 5 INFO note about the clear-via-null contract.

### Rule 6 — RFC 7807 error format (ERROR)

Error responses (HTTP 4xx/5xx) must use `application/problem+json` with at minimum the keys `type`, `title`, `status`, `detail`. The legacy wrappers `{ data, error }`, `{ success, message }`, `{ code, error }` are forbidden.

**Detection:** in `runtime.scripts` of `type: tests`, look for assertion blocks that condition on a non-2xx status (e.g. `if (res.status === 400)`, `expect(res.status).to.equal(404)`). Within those blocks, if the test asserts on `res.body.error`, `res.body.message`, `res.body.success`, `res.body.data`, or `res.body.code` — flag. The correct assertions would target `res.body.type`, `res.body.title`, `res.body.status`, `res.body.detail`.

Also check the response `Content-Type` if asserted: error responses should be `application/problem+json`, not `application/json`.

### Rule 7 — `type` field requires a sibling config object (WARN)

Any body shape with a `type` field must also have a sibling object that carries the type-specific configuration. Common name: `config`, but `settings`, `params`, `options` are also acceptable.

**Correct:**
```json
{
  "id": "ACCOUNT_NUMBER",
  "title": "ACCOUNT_NUMBER",
  "type": "ANY",
  "config": { "maxLength": 100 },
  "origin": "CORE"
}
```

**Detection:** parse `http.body.data` and any JSON sample in `docs.content`. For each object literal that contains a `type` field, check it also contains at least one sibling object-typed field. If only scalar siblings exist alongside `type`, flag.

### Rule 8 — Group properties with shared prefix into a nested object (WARN)

When two or more fields share a common camelCase prefix (`selectionFixed`, `selectionUser`), group them under a nested object:

```json
{ "selection": { "fixed": "...", "user": "..." } }
```

**Detection:** parse `http.body.data` and any JSON in `docs.content`. For each JSON object, group its keys by first camelCase word. If a group has ≥ 2 keys and the shared prefix is not a stop-word (`id`, `name`, `is`, `has`, `total`, `max`, `min`), flag with a suggested grouping.

### Rule 9 — Don't repeat path segments in field names (WARN)

For an endpoint at `/v1/projections`, request/response body fields should not include `projection` (or close variants — singular, plural, snake_case) as a prefix or suffix. The path already supplies the context.

**Example violation** (URL `/v1/projections`):
```json
{ "associations_projection_ids": {} }
```

**Should be:**
```json
{ "associations": {} }
```

**Detection:** extract the last static (non-variable) path segment from `http.url`, singularize it (drop trailing `s` if present), lower-case it. For each top-level field name in `http.body.data` (and in `expect(res.body.…)` test assertions), check whether the field name contains the singularized token as a substring (snake_case or camelCase). If yes, flag.

### Rule 10 — Use `version`, not `seqNo`/`sequenceNumber` (INFO)

For numeric versioning of a record, the field must be named `version` (numeric). Names like `seqNo`, `sequenceNumber`, `seq`, `revision`, `rev`, `versionNumber` are discouraged.

**Detection:** scan `http.body.data` and any test assertions about `res.body.*`. Match field names (case-insensitive): `seqno`, `sequencenumber`, `seq`, `revision`, `rev`, `versionnumber`. Flag each hit and suggest `version`.

## Output report format

Print directly to the user (no file write unless asked). Use this exact layout:

```
# Bruno workspace audit — <workspace_path>

**<E> errors, <W> warnings, <I> infos across <N> files**

## Errors
- **Rule 1** — `users/Get Users.yml` — list endpoint wraps items under `results`, not `data`
  *Suggestion:* rename `results` → `data` and add `page: { size, totalElements, totalPages, number }`
- ...

## Warnings
- ...

## Infos
- ...

## Notes
- Rule 3 severity defaulted to WARN (not specified in source spec).
```

If the workspace is clean, emit a single line:

```
✅ All <N> request files pass.
```

## Implementation tips

- For larger workspaces, batch reads: use `Glob` to enumerate, then `Read` files in groups of ~5–10.
- Use `Grep` with `output_mode: files_with_matches` first to narrow which files actually contain triggers for each rule (e.g. grep for `res.body.results` across all files to find Rule 1 candidates), then read those files in detail.
- Keep findings deduplicated: if the same file violates the same rule twice, list it once with a count.
- Do **not** run the Bruno CLI or hit any live endpoint — this is purely static analysis.
- If a request file is malformed YAML, emit a single ERROR with rule label `parse` and skip the rest of its rules.
