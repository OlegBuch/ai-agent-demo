# Bug (environment, `two.bankuat`): `WORKSPACE.MENU` INPUT of a root record that links to another menu returns 500

**Status (2026-10-05): server bug still OPEN (needs the environment owners' logs), but WORKED AROUND
in the test code: fixtures now register the Projection through ONE root with a direct `PROJECTION`
item (no `MENU` link). TC-2938, TC-2937, TC-2198 and TC-2205 all pass live with it.**

## TL;DR

On `two.bankuat`, `POST /api/v1/projections/WORKSPACE.MENU/records/operations/INPUT` returns
`500 Internal Server Error` (empty error body) when the record is a **root** (`IS_ROOT: true`)
whose `ITEMS` contain a `MENU_TARGET_TYPE: "MENU"` entry pointing at an **existing** folder
record. The same endpoint accepts a root with an empty `ITEMS` and a folder with a `CUSTOM` item.
The failing pair is exactly what the drill-down fixtures build (a folder holding a `PROJECTION`
leaf, then a root linking to that folder), so every test that registers a Projection in the
workspace menu fails during fixture setup. These tests passed on 2026-10-02, so the environment
changed in between.

## Evidence

**In the test run (2026-10-05, ~06:27-06:33 UTC):** the fixtures for TC-2938
(`enquiry-drilldown-edit-setup.ts`) and TC-2937 (`enquiry-drilldown-display-setup.ts`) call
`inputWorkspaceMenuRecord` for the folder (OK) and then for the root. The root call returns 500 on
all 8 retries (~40 s):

```
POST /api/v1/projections/WORKSPACE.MENU/records/operations/INPUT -> 500
{"timestamp":"2026-10-05T06:28:22.861Z","status":500,"error":"Internal Server Error", ...}
```

**Reproduced in Bruno (`two.bankuat`, request "Table Template -> Operations -> Execute Records
Operation", path `projectionId = WORKSPACE.MENU`, `operation = INPUT`):**

| # | recordId | body `data` | result |
|---|---|---|---|
| 1 | `AQA_PROBE_ROOT_1` | `{ "IS_ROOT": true, "ITEMS": [] }` | **200** |
| 2 | `AQA_PROBE_FOLDER_1` | `{ "IS_ROOT": false, "ITEMS": [ { "MENU_TARGET_TYPE": "CUSTOM", "MENU_TARGET_ID": "TABLE_REGISTRY", "TITLE": { "en-GB": "Probe" } } ] }` | **200** |
| 3 | `AQA_PROBE_ROOT_3` | `{ "IS_ROOT": true, "ITEMS": [ { "MENU_TARGET_TYPE": "MENU", "MENU_TARGET_ID": "AQA_PROBE_FOLDER_1", "TITLE": { "en-GB": "Probe Folder" } } ] }` | **500** (`2026-10-05T06:48:18Z`) |

## Ruled out

- **Wrong projection.** Bruno's own seeds write via `WORKSPACE.MENU~MASTER`, while this repo's helper
  (`api/system_core/helpers/workspace-menu-helper.ts`, `WORKSPACE_MENU_VALUES.PROJECTION.MASTER`)
  writes via the table's default `WORKSPACE.MENU`. Hypothesis: the default projection is now
  blocked/broken. Refuted: request 1 and 2 above go through `WORKSPACE.MENU` and return 200.
- **Credentials/permissions.** The same admin context performs requests 1 and 2 successfully.

## Candidate explanation (unconfirmed)

Bruno's seed docs (`System Core -> 04 - Workspace & Navigation Seeding -> 10 - Seed Data -> 03 Seed
nested menus`) say `MenuTargetResolver` reads menu targets back over HTTP when validating a record.
A failure in that read (or in the `proj-workspace-menu-tree-validation` / `-integrity` plugins, both
uploaded via Bruno's "Plugins Setup") would surface as an unhandled 500 only for records that
reference another menu, which matches the table above. Needs server logs to confirm.

## What to hand to the environment owners

The three requests above, the 500 timestamp `2026-10-05T06:48:18Z`, and the path
`POST /api/v1/projections/WORKSPACE.MENU/records/operations/INPUT` on `two.bankuat`.

## Leftover data

The Bruno probes created `AQA_PROBE_ROOT_1` and `AQA_PROBE_FOLDER_1` on `two.bankuat`
(`AQA_PROBE_ROOT_3` may or may not exist after the 500). Not deleted - cleanup is the user's call.

## Impact on the suite

- Fixtures building "folder -> root with MENU link": `enquiry-drilldown-edit-setup.ts` (TC-2938),
  `enquiry-drilldown-display-setup.ts` (TC-2937), `enquiry-drilldown-projection-config-setup.ts`
  (TC-2198/TC-2205/TC-2199 family). All fail at setup, before any UI step.
- Not affected: TC-2926, TC-2908, TC-2929, TC-2922 (no workspace menu in their fixtures).
- No code workaround planned: dropping the folder -> root link would defeat the fixtures' purpose
  (making a Projection selectable in the Drill-down dropdown).

## Workaround (2026-10-05)

Bruno probe `AQA_PROBE_ROOT_4`: `{IS_ROOT: true, ITEMS: [{MENU_TARGET_TYPE: "PROJECTION",
MENU_TARGET_ID: "AM.ACCOUNT~Test", PROJECTION_OPERATION: "INPUT", RECORD_ID_POLICY: "NEW"}]}` -> **200**.
So only a root with a `MENU` link to another record returns 500. New helper
`registerProjectionInWorkspaceMenuRoot` (`api/system_core/helpers/workspace-menu-helper.ts`) creates
that single root; used by `enquiry-drilldown-edit-setup.ts` (TC-2938), `enquiry-drilldown-display-setup.ts`
(TC-2937) and `enquiry-drilldown-projection-config-setup.ts` (TC-2198/2205/2199). Live: TC-2938 passes
(the Projection is selectable in the Drill-down list). Leftover Bruno probe records: `AQA_PROBE_ROOT_1`,
`AQA_PROBE_FOLDER_1`, `AQA_PROBE_ROOT_4` (user decides cleanup).

Update (2026-10-05): TC-2937, TC-2198, TC-2205 also pass live with the single-root fixtures (10.3m for the three).
