# TB-3468: Test User Provisioning Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a composable Keycloak+CBS test-user provisioning service for
`proj-test-automation`, wire it into the framework's existing resource-tracking/teardown
mechanism, and prove it end-to-end by retiring the one place the framework currently mutates a
shared static user (`PARTIALLY_ACCESS_USER`) with no locking.

**Architecture:** A new `api/utils/services/test-user-service.ts` composes the existing Keycloak
layer (`auth-service.ts`'s `createKeycloakUser`/`deleteKeycloakUser`) with the existing CBS
permission layer (`UserProfileApiClient`/`UserGroupApiClient` + `payload-builder.ts`), generalizing
the two-layer pattern `ui/utils/helpers/dashboard-user.ts`'s `provisionDashboardUser` already
proved, but parameterized and usable from `api/`. `api/utils/helpers/resource-tracker.ts` gains
Keycloak-user tracking so `global-teardown.ts`'s existing safety-net sweep also catches leaked
users. One worker-scoped fixture and one small live spec migration prove the whole thing works.

**Tech Stack:** Playwright Test (TypeScript), existing `api/utils/services/auth-service.ts`
(Keycloak Admin REST), existing `api/system_core/client/user-profile-api-client.ts` /
`user-group-api-client.ts` (CBS System Core REST).

**Spec:** `docs/questions/framework-updates/2026-08-31-tb-3468-test-user-provisioning-service-design.md`
(this plan's spec — read it for the full problem statement, verified facts, and decision
rationale; this plan only restates what's needed to implement each task).

## Global Constraints

- No new Keycloak-user creation is added to `global-setup.ts` (design D3) — the only
  process-wide-shared archetype (`provisionUserWithoutPermissions`) lives in a **worker-scoped**
  Playwright fixture instead, mirroring the existing `workerGroupId` fixture.
- `test-user-service.ts`'s functions are self-contained (each opens and disposes its own CBS admin
  `APIRequestContext` internally, via `createAuthenticatedApiContext`) — exactly like
  `provisionDashboardUser`/`createUiAdminAuthContext` today. No function in this service accepts a
  caller-supplied admin context.
- Default Keycloak creation path is `createKeycloakUser` (service-account), not
  `createMasterAdminKeycloakUser` (design D5) — confirmed working against `proj-qa` (2026-08-31).
- Keycloak-user safety-net cleanup in `resource-tracker.ts` runs **unconditionally** (both CI and
  local runs), unlike the existing table/group cleanup which is skipped locally unless
  `LOCAL_CLEANUP=true` — there is no "preserve for local reuse" rationale for a throwaway Keycloak
  identity the way there is for a DB schema (design §1/§2).
- **This project's convention: nobody but the user runs the actual Playwright test suite.** Every
  step below that would normally say "run the test, expect PASS/FAIL" instead says "hand off to
  the user to run it and report the result" — the implementer writes the test code and verifies it
  **statically** (`npx tsc --noEmit`, ESLint) but does not execute `npx playwright test` itself.
  Only the user decides when a test has actually passed against the live `proj-qa` environment.
- `provisionMakerCheckerPair` (mentioned in the design doc's D8/D4 as a future primitive) is **not**
  built by this plan — nothing in this pilot's actual migration target calls it yet (see design
  doc's Open Questions). Scope trimmed to the four primitives this pilot's real call sites need:
  `provisionUser`, `provisionUserContext`, `provisionUserWithoutPermissions`, `deprovisionUser`.
  Building an untested, uncalled primitive "for later" contradicts the design's own D7 rationale
  (small, fully-proven blast radius) — add it in the follow-up ticket alongside its first real
  caller.

---

## Task 1: Extend `resource-tracker.ts` with Keycloak-user tracking + safety-net sweep

**Files:**
- Modify: `api/utils/helpers/resource-tracker.ts`
- Test: Create `api/utils/tests/resource-tracker.spec.ts`

**Interfaces:**
- Consumes: `createKeycloakUser`, `deleteKeycloakUser`, `generateTemporaryPassword` from
  `api/utils/services/auth-service.ts` (all already exist, unchanged); `generateCustomId` from
  `api/utils/helpers/dynamic-name-generator.ts` (already exists, unchanged).
- Produces (for Task 2 to consume): `trackCreatedUser(user: { userId: string; username: string;
  realm: string }): void`, `untrackUser(userId: string): void`, and `getTrackedResources()`'s
  return type gaining a `users: { userId: string; username: string; realm: string }[]` field
  alongside its existing `tables`/`groups` fields.

The current file (verbatim, for reference — the exact base this task edits):

```typescript
import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import {
  createDbClient,
  deleteTableRegistryMetadata,
  dropTestSchemas,
  getRegistryDbName,
  shouldRunCleanup,
} from './db-helper';
import { deleteKafkaTopicsForTableIds } from './kafka-cleanup-helper';
import { createAuthenticatedApiContext } from '../services/auth-service';
import { deleteGroupViaApiWithRetry } from './group-cleanup-helper';
import { ensureDir } from './group-helper';

const TRACKING_FILE = path.resolve(__dirname, '../../test-results/tracked-resources.jsonl');

function ensureDirExists(filePath: string) {
  ensureDir(path.dirname(filePath));
}

export function trackCreatedTable(tableId: string) {
  ensureDirExists(TRACKING_FILE);
  fs.appendFileSync(TRACKING_FILE, JSON.stringify({ type: 'table', id: tableId }) + '\n');
}

export function trackCreatedGroup(groupId: string) {
  ensureDirExists(TRACKING_FILE);
  fs.appendFileSync(TRACKING_FILE, JSON.stringify({ type: 'group', id: groupId }) + '\n');
}

export function untrackTables(tableIds: string[]): void {
  // ... unchanged, see repo ...
}

export function getTrackedResources(): { tables: string[]; groups: string[] } {
  if (!fs.existsSync(TRACKING_FILE)) {
    return { tables: [], groups: [] };
  }
  const content = fs.readFileSync(TRACKING_FILE, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const tables: string[] = [];
  const groups: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'table') {
        tables.push(entry.id);
      } else if (entry.type === 'group') {
        groups.push(entry.id);
      }
    } catch {
      // Ignore malformed lines
    }
  }
  return { tables: [...new Set(tables)], groups: [...new Set(groups)] };
}

export function clearTrackedResources() {
  // ... unchanged, see repo ...
}

export async function cleanupTrackedResources() {
  if (!shouldRunCleanup()) {
    console.log(
      '[resource-tracker] Non-CI run and Local CleanUp is disabled: Skipping global resource cleanup to preserve schemas for local group reuse.',
    );
    clearTrackedResources();
    return;
  }
  // ... table/group/kafka cleanup, unchanged ...
  clearTrackedResources();
  console.log('[resource-tracker] Cleanup completed.');
}
```

- [ ] **Step 1: Write the failing pure-logic test (no live API needed)**

Create `api/utils/tests/resource-tracker.spec.ts`:

```typescript
import { test, expect } from '../fixtures/api-fixtures';
import { createKeycloakUser, generateTemporaryPassword } from '../services/auth-service';
import { generateCustomId } from '../helpers/dynamic-name-generator';
import {
  trackCreatedUser,
  untrackUser,
  getTrackedResources,
  cleanupTrackedResources,
} from '../helpers/resource-tracker';

test.describe('resource-tracker | Keycloak user tracking', () => {
  test('trackCreatedUser registers a user and untrackUser removes it', () => {
    const fakeUser = {
      userId: generateCustomId('FAKE_USER_ID'),
      username: generateCustomId('fake-username'),
      realm: 'proj-qa',
    };

    trackCreatedUser(fakeUser);
    const afterTrack = getTrackedResources();
    expect(afterTrack.users.some((u) => u.userId === fakeUser.userId)).toBe(true);

    untrackUser(fakeUser.userId);
    const afterUntrack = getTrackedResources();
    expect(afterUntrack.users.some((u) => u.userId === fakeUser.userId)).toBe(false);
  });

  test('cleanupTrackedResources deletes and logs a leaked Keycloak user', async ({ playwright }) => {
    const user = await createKeycloakUser(playwright.request, {
      firstName: 'QA',
      lastName: 'TrackerSweepTest',
      email: `${generateCustomId('tracker-sweep-test')}@example.com`,
      password: generateTemporaryPassword(),
      temporary: false,
    });
    trackCreatedUser({ userId: user.userId, username: user.username, realm: user.realm });

    const logLines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
      originalLog(...args);
    };

    try {
      await cleanupTrackedResources();
    } finally {
      console.log = originalLog;
    }

    expect(
      logLines.some((line) => line.includes(user.userId) && line.includes(user.username)),
      "Expected the sweep to log the deleted user's userId and username for transparency",
    ).toBe(true);

    const { users } = getTrackedResources();
    expect(users.find((u) => u.userId === user.userId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify it fails statically first, then hand off to the user**

Run `npx tsc --noEmit` — expect compile errors: `trackCreatedUser`/`untrackUser` don't exist yet on
`resource-tracker.ts`, and `getTrackedResources()`'s return type has no `users` field. Do not run
`npx playwright test` yourself — once compilation is fixed by Step 3, hand this spec off to the
user to run and confirm.

- [ ] **Step 3: Implement `trackCreatedUser`/`untrackUser`, extend `getTrackedResources`**

In `api/utils/helpers/resource-tracker.ts`, add the import and three changes:

```typescript
// Add to the top-level imports:
import { deleteKeycloakUser } from '../services/auth-service';
import { request } from '@playwright/test'; // already imported — no change needed here
```

Add after `trackCreatedGroup`:

```typescript
export function trackCreatedUser(user: { userId: string; username: string; realm: string }) {
  ensureDirExists(TRACKING_FILE);
  fs.appendFileSync(
    TRACKING_FILE,
    JSON.stringify({ type: 'user', userId: user.userId, username: user.username, realm: user.realm }) +
      '\n',
  );
}

export function untrackUser(userId: string): void {
  if (!fs.existsSync(TRACKING_FILE)) return;
  try {
    const content = fs.readFileSync(TRACKING_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const remaining = lines.filter((line) => {
      try {
        const entry = JSON.parse(line);
        return !(entry.type === 'user' && entry.userId === userId);
      } catch {
        return true;
      }
    });
    fs.writeFileSync(TRACKING_FILE, remaining.length > 0 ? remaining.join('\n') + '\n' : '');
  } catch (err) {
    console.warn('[resource-tracker] Failed to untrack cleaned-up user:', err);
  }
}
```

Replace `getTrackedResources` entirely with:

```typescript
export function getTrackedResources(): {
  tables: string[];
  groups: string[];
  users: { userId: string; username: string; realm: string }[];
} {
  if (!fs.existsSync(TRACKING_FILE)) {
    return { tables: [], groups: [], users: [] };
  }
  const content = fs.readFileSync(TRACKING_FILE, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const tables: string[] = [];
  const groups: string[] = [];
  const users: { userId: string; username: string; realm: string }[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'table') {
        tables.push(entry.id);
      } else if (entry.type === 'group') {
        groups.push(entry.id);
      } else if (entry.type === 'user') {
        users.push({ userId: entry.userId, username: entry.username, realm: entry.realm });
      }
    } catch {
      // Ignore malformed lines
    }
  }
  return { tables: [...new Set(tables)], groups: [...new Set(groups)], users };
}
```

- [ ] **Step 4: Verify statically**

Run `npx tsc --noEmit` — expect no errors related to `trackCreatedUser`/`untrackUser`/
`getTrackedResources`. The first test in Step 1 (`trackCreatedUser registers a user and
untrackUser removes it`) should now compile and be ready for the user to run — it needs no live
API.

- [ ] **Step 5: Add the unconditional user-sweep to `cleanupTrackedResources`**

Add this new private function above `cleanupTrackedResources`:

```typescript
async function cleanupTrackedUsers(): Promise<void> {
  const { users } = getTrackedResources();
  if (users.length === 0) return;

  console.log(
    `[resource-tracker] Sweeping ${users.length} tracked Keycloak user(s) left over from this run...`,
  );
  for (const user of users) {
    try {
      await deleteKeycloakUser(request, user.userId, { realm: user.realm });
      console.log(
        `[resource-tracker] Deleted orphaned Keycloak user: userId=${user.userId}, username=${user.username}, realm=${user.realm}`,
      );
    } catch (err) {
      console.error(
        `[resource-tracker] Failed to delete orphaned Keycloak user userId=${user.userId}, username=${user.username}:`,
        err,
      );
    }
  }
}
```

Then edit `cleanupTrackedResources` so the user-sweep runs **before** the existing
`shouldRunCleanup()` early return (so it always runs, unlike the table/group/kafka cleanup below
it, which stays skipped locally unless `LOCAL_CLEANUP=true`):

```typescript
export async function cleanupTrackedResources() {
  await cleanupTrackedUsers();

  if (!shouldRunCleanup()) {
    console.log(
      '[resource-tracker] Non-CI run and Local CleanUp is disabled: Skipping global resource cleanup to preserve schemas for local group reuse.',
    );
    clearTrackedResources();
    return;
  }
  // ... rest of the function is unchanged from here down ...
```

Everything else in `cleanupTrackedResources` (the table-groups-restore block, DB cleanup, API group
cleanup, Kafka cleanup, final `clearTrackedResources()` + completion log) stays exactly as it is
today — do not reorder or remove anything past this point.

- [ ] **Step 6: Verify statically, then hand off to the user**

Run `npx tsc --noEmit` — expect no errors. Hand off both tests in
`api/utils/tests/resource-tracker.spec.ts` to the user to run (`npx playwright test
api/utils/tests/resource-tracker.spec.ts`) and report back whether both pass — the second test
needs the live `proj-qa` Keycloak realm.

- [ ] **Step 7: Commit**

```bash
git add api/utils/helpers/resource-tracker.ts api/utils/tests/resource-tracker.spec.ts
git commit -m "Track Keycloak users for teardown safety-net cleanup"
```

---

## Task 2: `test-user-service.ts` — the provisioning service

**Files:**
- Create: `api/utils/services/test-user-service.ts`
- Test: Create `api/utils/tests/test-user-service.spec.ts`

**Interfaces:**
- Consumes: `trackCreatedUser`, `untrackUser` from Task 1's `api/utils/helpers/resource-tracker.ts`;
  `createKeycloakUser`, `deleteKeycloakUser`, `createUserAuthenticatedApiContext`,
  `createAuthenticatedApiContext`, `generateTemporaryPassword` from
  `api/utils/services/auth-service.ts` (all pre-existing, unchanged); `UserProfileApiClient` from
  `api/system_core/client/user-profile-api-client.ts`; `UserGroupApiClient` from
  `api/system_core/client/user-group-api-client.ts`; `createUserGroup` from
  `api/system_core/helpers/user-group-helper.ts`; `buildInternalUserProfilePayload`,
  `buildExternalUserProfilePayload` from `test-data/payload-builder.ts`; `USER_PROFILE_VALUES` from
  `api/utils/constants/user-profile.values.ts`; `HTTP_STATUS` from
  `api/utils/constants/http-status.ts`; `generateCustomId` from
  `api/utils/helpers/dynamic-name-generator.ts`; types `KeycloakTestUser` from
  `api/types/keycloak-user.types.ts` and `UserGroupPermission` from `api/types/user-group.types.ts`.
- Produces (for Task 3 and Task 4 to consume): `export type TestUser = KeycloakTestUser & {
  password: string }`; `provisionUser(apiRequest: APIRequest, options?: ProvisionUserOptions):
  Promise<TestUser>`; `provisionUserContext(apiRequest: APIRequest, options?:
  ProvisionUserOptions): Promise<{ user: TestUser; context: APIRequestContext }>`;
  `provisionUserWithoutPermissions(apiRequest: APIRequest): Promise<TestUser>`;
  `deprovisionUser(apiRequest: APIRequest, user: KeycloakTestUser): Promise<void>`, where
  `ProvisionUserOptions = { permissions?: UserGroupPermission[]; companyCodes?: string[];
  profileType?: 'INTERNAL' | 'EXTERNAL'; temporary?: boolean; password?: string }`.

- [ ] **Step 1: Write the failing test for `provisionUser` + `deprovisionUser`**

Create `api/utils/tests/test-user-service.spec.ts`:

```typescript
import { test, expect } from '../fixtures/api-fixtures';
import { provisionUser, deprovisionUser } from '../services/test-user-service';

test.describe('test-user-service | provisionUser / deprovisionUser', () => {
  test('provisionUser creates a Keycloak identity with a granted CBS permission, deprovisionUser removes it', async ({
    playwright,
  }) => {
    const user = await provisionUser(playwright.request, {
      permissions: [{ TABLE: 'SM.USER', FUNCTION: 'SEE' }],
    });

    expect(user.userId).toBeTruthy();
    expect(user.username).toBeTruthy();
    expect(user.password).toBeTruthy();

    await deprovisionUser(playwright.request, user);
  });
});
```

- [ ] **Step 2: Verify it fails statically, then hand off to the user**

Run `npx tsc --noEmit` — expect a module-not-found error for `../services/test-user-service`
(the file doesn't exist yet).

- [ ] **Step 3: Implement `provisionUser` and `deprovisionUser`**

Create `api/utils/services/test-user-service.ts`:

```typescript
import type { APIRequest, APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  createKeycloakUser,
  createUserAuthenticatedApiContext,
  deleteKeycloakUser,
  generateTemporaryPassword,
} from './auth-service';
import { UserProfileApiClient } from '../../system_core/client/user-profile-api-client';
import { UserGroupApiClient } from '../../system_core/client/user-group-api-client';
import { createUserGroup } from '../../system_core/helpers/user-group-helper';
import { USER_PROFILE_VALUES } from '../constants/user-profile.values';
import { HTTP_STATUS } from '../constants/http-status';
import { generateCustomId } from '../helpers/dynamic-name-generator';
import { trackCreatedUser, untrackUser } from '../helpers/resource-tracker';
import {
  buildExternalUserProfilePayload,
  buildInternalUserProfilePayload,
} from '../../../test-data/payload-builder';
import type { KeycloakTestUser } from '../../types/keycloak-user.types';
import type { UserGroupPermission } from '../../types/user-group.types';

export type TestUser = KeycloakTestUser & { password: string };

export interface ProvisionUserOptions {
  permissions?: UserGroupPermission[];
  companyCodes?: string[];
  profileType?: 'INTERNAL' | 'EXTERNAL';
  temporary?: boolean;
  password?: string;
}

function withMaskedPassword(user: KeycloakTestUser, password: string): TestUser {
  const result = { ...user } as TestUser;
  Object.defineProperty(result, 'password', {
    value: password,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(result, Symbol.for('nodejs.util.inspect.custom'), {
    value(this: TestUser) {
      return { ...this, password: '***HIDDEN***' };
    },
    enumerable: false,
    configurable: true,
  });
  return result;
}

async function withAdminContext<T>(
  apiRequest: APIRequest,
  fn: (adminContext: APIRequestContext) => Promise<T>,
): Promise<T> {
  const adminContext = await createAuthenticatedApiContext(apiRequest, {
    baseURL: process.env.BASE_URL,
    companyCode: process.env.COMPANY_CODE,
    realm: process.env.KEYCLOAK_REALM,
    userContext: process.env.CBS_USER_CONTEXT_HEADER,
  });
  try {
    return await fn(adminContext);
  } finally {
    await adminContext.dispose();
  }
}

export async function deprovisionUser(apiRequest: APIRequest, user: KeycloakTestUser): Promise<void> {
  await deleteKeycloakUser(apiRequest, user.userId, { realm: user.realm });
  untrackUser(user.userId);
}

export async function provisionUser(
  apiRequest: APIRequest,
  options: ProvisionUserOptions = {},
): Promise<TestUser> {
  const password = options.password ?? generateTemporaryPassword();
  const user = await createKeycloakUser(apiRequest, {
    firstName: 'QA',
    lastName: 'TestUser',
    email: `${generateCustomId('aqa-test-user')}@example.com`,
    temporary: options.temporary ?? false,
    password,
  });
  trackCreatedUser({ userId: user.userId, username: user.username, realm: user.realm });

  try {
    await withAdminContext(apiRequest, async (adminContext) => {
      let groups: string[] = [];
      if (options.permissions?.length) {
        const groupClient = new UserGroupApiClient(adminContext);
        const groupId = generateCustomId('AQA.USER.GROUP');
        await createUserGroup(groupClient, groupId, { PERMISSIONS: options.permissions });
        groups = [groupId];
      }

      const profileClient = new UserProfileApiClient(adminContext);
      const isExternal = options.profileType === 'EXTERNAL';
      const projection = isExternal
        ? USER_PROFILE_VALUES.PROJECTION.EXTERNAL
        : USER_PROFILE_VALUES.PROJECTION.INTERNAL;
      const companyCodes = options.companyCodes ?? [...USER_PROFILE_VALUES.COMPANY_CODES.SINGLE];
      const payload = isExternal
        ? buildExternalUserProfilePayload(user.userId, { GROUPS: groups, COMPANY_CODES: companyCodes })
        : buildInternalUserProfilePayload(user.userId, { GROUPS: groups, COMPANY_CODES: companyCodes });

      const response = await profileClient.inputUserDetails(projection, payload);
      if (response.status() !== HTTP_STATUS.OK) {
        throw new Error(
          `Failed to set up CBS profile for user ${user.userId}: ${response.status()} ${await response.text()}`,
        );
      }
    });
  } catch (error) {
    await deprovisionUser(apiRequest, user).catch((cleanupError) => {
      console.error(
        `[test-user-service] Failed to clean up user ${user.userId} after a provisioning error:`,
        cleanupError,
      );
    });
    throw error;
  }

  return withMaskedPassword(user, password);
}
```

- [ ] **Step 4: Verify statically, then hand off to the user**

Run `npx tsc --noEmit` — expect no errors. Hand `api/utils/tests/test-user-service.spec.ts` off to
the user to run and confirm it passes against `proj-qa`.

- [ ] **Step 5: Write the failing test for `provisionUserWithoutPermissions` and `provisionUserContext`**

Append to `api/utils/tests/test-user-service.spec.ts`:

```typescript
import { provisionUserContext, provisionUserWithoutPermissions } from '../services/test-user-service';
import { TableRegistryApiClient } from '../../system_core/client/table-registry-api-client';
import { TEST_CONSTS } from '../constants/constants-keeper';

test.describe('test-user-service | provisionUserWithoutPermissions / provisionUserContext', () => {
  test('provisionUserWithoutPermissions creates a user with no CBS permissions granted', async ({
    playwright,
  }) => {
    const user = await provisionUserWithoutPermissions(playwright.request);
    expect(user.userId).toBeTruthy();
    await deprovisionUser(playwright.request, user);
  });

  test('provisionUserContext returns a ready-to-use authenticated context for the new user', async ({
    playwright,
  }) => {
    const { user, context } = await provisionUserContext(playwright.request, {
      permissions: [{ TABLE: 'SM.USER', FUNCTION: 'SEE' }],
    });

    try {
      const client = new TableRegistryApiClient(context);
      const res = await client.performRecordOperation('SM.USER~INTERNAL', TEST_CONSTS.OPERATION.SEE, {
        recordId: user.userId,
      });
      expect(res.status()).toBe(200);
    } finally {
      await context.dispose();
      await deprovisionUser(playwright.request, user);
    }
  });
});
```

- [ ] **Step 6: Verify it fails statically, then implement**

Run `npx tsc --noEmit` — expect errors for the two missing exports. Add to
`api/utils/services/test-user-service.ts`:

```typescript
export async function provisionUserWithoutPermissions(apiRequest: APIRequest): Promise<TestUser> {
  return provisionUser(apiRequest, { permissions: [] });
}

export async function provisionUserContext(
  apiRequest: APIRequest,
  options: ProvisionUserOptions = {},
): Promise<{ user: TestUser; context: APIRequestContext }> {
  const user = await provisionUser(apiRequest, options);
  const context = await createUserAuthenticatedApiContext(apiRequest, user.username, user.password, {
    baseURL: process.env.BASE_URL,
    companyCode: process.env.COMPANY_CODE,
    realm: process.env.KEYCLOAK_REALM,
    userContext: process.env.CBS_USER_CONTEXT_HEADER,
  });
  return { user, context };
}
```

- [ ] **Step 7: Verify statically, then hand off to the user**

Run `npx tsc --noEmit` — expect no errors. Hand `api/utils/tests/test-user-service.spec.ts` off to
the user to run in full and confirm all four tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/utils/services/test-user-service.ts api/utils/tests/test-user-service.spec.ts
git commit -m "Add composable Keycloak+CBS test user provisioning service"
```

---

## Task 3: Worker-scoped `noPermissionUser` fixture

**Files:**
- Modify: `api/utils/fixtures/api-fixtures.ts`
- Test: Create `api/utils/tests/no-permission-user-fixture.spec.ts`

**Interfaces:**
- Consumes: `provisionUserWithoutPermissions`, `deprovisionUser`, `TestUser` from Task 2's
  `api/utils/services/test-user-service.ts`.
- Produces (for any future spec to consume): a new `noPermissionUser: TestUser` worker-scoped
  fixture, importable the same way `workerGroupId` is today, from `api/utils/fixtures/api-fixtures.ts`.

The current file's fixture block (verbatim, for reference — the exact base this task edits):

```typescript
type ApiFixtures = {
  authenticatedApiContext: APIRequestContext;
  kafkaService: KafkaService;
};

type ApiWorkerFixtures = {
  workerGroupId: string;
};

const apiTest = base.extend<ApiFixtures, ApiWorkerFixtures>({
  workerGroupId: [
    async ({ playwright }, use) => {
      void playwright;
      const groupId = requireDynamicGroupId();
      await use(groupId);
    },
    { scope: 'worker' },
  ],

  authenticatedApiContext: async ({ playwright, extraHTTPHeaders }, use) => {
    // ... unchanged ...
  },

  kafkaService: async ({ playwright }, use) => {
    // ... unchanged ...
  },
});
```

- [ ] **Step 1: Write the failing test**

Create `api/utils/tests/no-permission-user-fixture.spec.ts`:

```typescript
import { test, expect } from '../fixtures/api-fixtures';
import { TableRegistryApiClient } from '../../system_core/client/table-registry-api-client';
import { createUserAuthenticatedApiContext } from '../services/auth-service';
import { TEST_CONSTS } from '../constants/constants-keeper';

test('noPermissionUser fixture provides a user whose writes are denied', async ({
  noPermissionUser,
  playwright,
}) => {
  expect(noPermissionUser.userId).toBeTruthy();

  const context = await createUserAuthenticatedApiContext(
    playwright.request,
    noPermissionUser.username,
    noPermissionUser.password,
    {
      baseURL: process.env.BASE_URL,
      companyCode: process.env.COMPANY_CODE,
      realm: process.env.KEYCLOAK_REALM,
      userContext: process.env.CBS_USER_CONTEXT_HEADER,
    },
  );

  try {
    const client = new TableRegistryApiClient(context);
    const res = await client.performRecordOperation('SM.USER~INTERNAL', TEST_CONSTS.OPERATION.SEE, {
      recordId: noPermissionUser.userId,
    });
    expect(res.status()).not.toBe(200);
  } finally {
    await context.dispose();
  }
});
```

- [ ] **Step 2: Verify it fails statically**

Run `npx tsc --noEmit` — expect an error: `noPermissionUser` is not a known property of the
fixtures type (the fixture doesn't exist yet).

- [ ] **Step 3: Add the worker-scoped fixture**

In `api/utils/fixtures/api-fixtures.ts`, add the import:

```typescript
import {
  deprovisionUser,
  provisionUserWithoutPermissions,
  type TestUser,
} from '../services/test-user-service';
```

Extend the fixture type and registration:

```typescript
type ApiWorkerFixtures = {
  workerGroupId: string;
  noPermissionUser: TestUser;
};

const apiTest = base.extend<ApiFixtures, ApiWorkerFixtures>({
  workerGroupId: [
    async ({ playwright }, use) => {
      void playwright;
      const groupId = requireDynamicGroupId();
      await use(groupId);
    },
    { scope: 'worker' },
  ],

  noPermissionUser: [
    async ({ playwright }, use) => {
      const user = await provisionUserWithoutPermissions(playwright.request);
      try {
        await use(user);
      } finally {
        await deprovisionUser(playwright.request, user);
      }
    },
    { scope: 'worker' },
  ],

  // ... authenticatedApiContext, kafkaService unchanged ...
});
```

- [ ] **Step 4: Verify statically, then hand off to the user**

Run `npx tsc --noEmit` — expect no errors. Hand `api/utils/tests/no-permission-user-fixture.spec.ts`
off to the user to run and confirm it passes.

- [ ] **Step 5: Commit**

```bash
git add api/utils/fixtures/api-fixtures.ts api/utils/tests/no-permission-user-fixture.spec.ts
git commit -m "Add worker-scoped no-permission test user fixture"
```

---

## Task 4: Migrate `enquiry-regression.spec.ts` off `PARTIALLY_ACCESS_USER` mutation

**Files:**
- Modify: `api/system_core/tests/enquiry-regression.spec.ts` (3 call sites: TC-1016 line ~5615,
  TC-1803 line ~5833, TC-1797 line ~5959 — line numbers approximate, locate by the `allureCaseId`
  values 1016/1803/1797)

**Interfaces:**
- Consumes: `provisionUserContext`, `deprovisionUser` from Task 2's
  `api/utils/services/test-user-service.ts`.
- Produces: nothing new — this task retires 3 call sites of
  `api/system_core/helpers/user-group-helper.ts`'s `asUserWithGroups` in favor of the new service.
  `asUserWithGroups` itself is **not deleted** (still used by `asUserRestrictedToSmUser` and any
  spec not yet migrated) — see design doc §5.

This is a refactor of already-passing tests, not new behavior — the TDD cycle here is "confirm the
baseline passes, make the substitution, confirm it still passes with identical assertions."

- [ ] **Step 1: Baseline — hand off to the user before touching anything**

Ask the user to run `npx playwright test api/system_core/tests/enquiry-regression.spec.ts -g
"TC-1016|TC-1803|TC-1797"` and confirm all three currently pass, before any change in this task.

- [ ] **Step 2: Add the import**

At the top of `api/system_core/tests/enquiry-regression.spec.ts`, add alongside the existing
`asUserWithGroups`/`createUserGroup` import (line 19):

```typescript
import { deprovisionUser, provisionUserContext } from '../../utils/services/test-user-service';
```

- [ ] **Step 3: Migrate TC-1016 (around line 5615)**

Replace this block:

```typescript
          await test.step(
            'STEP: U2 (a different user, generic REPORT.SPOOL access, not the creator) cannot ' +
              'see REP_1 in the report list, and a direct SEE-by-id is denied',
            async () => {
              expect(
                USERS_DATA.PARTIALLY_ACCESS_USER.ID,
                'PRECONDITION: the PARTIALLY_ACCESS_USER env var must be set to a real ' +
                  'SM.USER~INTERNAL recordId for this fixture user to be reusable here',
              ).toBeTruthy();
              await asUserWithGroups(
                authenticatedApiContext,
                playwright.request,
                [nonOwnerGroup],
                async (u2Context) => {
                  const u2EnquiryClient = new EnquiryApiClient(u2Context);
                  // ... body unchanged ...
                  const u2TableClient = new TableRegistryApiClient(u2Context);
                  // ... body unchanged ...
                },
              );
            },
          );
```

With:

```typescript
          await test.step(
            'STEP: U2 (a different user, generic REPORT.SPOOL access, not the creator) cannot ' +
              'see REP_1 in the report list, and a direct SEE-by-id is denied',
            async () => {
              const { user: u2, context: u2Context } = await provisionUserContext(
                playwright.request,
                { permissions: [{ TABLE: 'REPORT.SPOOL', FUNCTION: 'ALL' }] },
              );
              try {
                const u2EnquiryClient = new EnquiryApiClient(u2Context);
                // ... body unchanged from here down, keep every line as-is ...
                const u2TableClient = new TableRegistryApiClient(u2Context);
                // ... body unchanged ...
              } finally {
                await u2Context.dispose();
                await deprovisionUser(playwright.request, u2);
              }
            },
          );
```

Keep every line of the test.step's inner body (the `u2EnquiryClient`/`u2TableClient` calls and
their assertions) exactly as they are today — only the outer wrapper changes from
`asUserWithGroups(...)` to `provisionUserContext(...)` + `try`/`finally`. Note this test site
grants `[{ TABLE: 'REPORT.SPOOL', FUNCTION: 'ALL' }]` directly rather than the pre-existing
`nonOwnerGroup` (created earlier in the same test via `createUserGroup(userGroupClient,
nonOwnerGroup, { PERMISSIONS: [{ TABLE: 'REPORT.SPOOL', FUNCTION: 'ALL' }] })`) — since
`provisionUserContext` creates its own throwaway group internally with that same permission set,
the pre-existing `createUserGroup(...)`/`nonOwnerGroup` call earlier in this test's
`PRECONDITION 1` step becomes dead code and should be deleted too (it was only ever used to feed
`asUserWithGroups`).

- [ ] **Step 4: Migrate TC-1803 (around line 5833) and TC-1797 (around line 5959) the same way**

Both follow the identical shape — replace:

```typescript
              expect(
                USERS_DATA.PARTIALLY_ACCESS_USER.ID,
                'PRECONDITION: the PARTIALLY_ACCESS_USER env var must be set to a real ' +
                  'SM.USER~INTERNAL recordId for this fixture user to be reusable here',
              ).toBeTruthy();
              await asUserWithGroups(
                authenticatedApiContext,
                playwright.request,
                [accessGroup],
                async (restrictedContext) => {
                  // ... body unchanged ...
                },
              );
```

With:

```typescript
              const { user: restrictedUser, context: restrictedContext } = await provisionUserContext(
                playwright.request,
                { permissions: [{ TABLE: 'REPORT.SPOOL', FUNCTION: 'SEE' }] },
              );
              try {
                // ... body unchanged from here down, keep every line as-is ...
              } finally {
                await restrictedContext.dispose();
                await deprovisionUser(playwright.request, restrictedUser);
              }
```

Same note as Step 3: each test's own `createUserGroup(userGroupClient, accessGroup, { PERMISSIONS:
[{ TABLE: 'REPORT.SPOOL', FUNCTION: 'SEE' }] })` call in its `PRECONDITION 1` step becomes dead
code (that group was only ever fed to `asUserWithGroups`) and should be deleted in each of the two
tests. `accessGroup`'s declaration (`const accessGroup = generateCustomId('RPT_GRP_1803' /
'RPT_GRP_1797')`) is likewise no longer used and should be removed.

- [ ] **Step 5: Verify statically**

Run `npx tsc --noEmit` and ESLint — expect no errors. Confirm `asUserWithGroups`/`createUserGroup`
and `USERS_DATA` are still used elsewhere in the file (they are, by other tests) so their imports
on line 19-20 stay; do not remove those imports. If ESLint flags `authenticatedApiContext` as an
unused destructured parameter in any of the three migrated tests' `async ({ authenticatedApiContext,
playwright }) => {` signatures (each test's own body may no longer reference it once
`asUserWithGroups(authenticatedApiContext, ...)` is gone), drop it from that test's own
destructuring — `async ({ playwright }) => {` — do not touch the other two tests' signatures if
they still use it.

- [ ] **Step 6: Hand off to the user for the real regression check**

Ask the user to run `npx playwright test api/system_core/tests/enquiry-regression.spec.ts -g
"TC-1016|TC-1803|TC-1797"` again and confirm all three still pass — using fresh per-test users
instead of the shared `PARTIALLY_ACCESS_USER` mutation. Also ask them to eyeball the console output
for the new `[test-user-service]`/`[resource-tracker]` log lines if a run happens to hit the
teardown sweep, and to roughly compare run time against the Step 1 baseline (expected delta:
≈1.5s × 3 ≈ 4.5s added, per the design doc's benchmark — flag if it's noticeably more).

- [ ] **Step 7: Commit**

```bash
git add api/system_core/tests/enquiry-regression.spec.ts
git commit -m "Migrate enquiry-regression PARTIALLY_ACCESS_USER mutation to fresh per-test users"
```
