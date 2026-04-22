---
name: e2e-testing
description: "End-to-end testing strategy for the Thuddle Aspire app using Playwright. USE FOR: creating tests, writing tests, test planning, test structure, automated testing, e2e tests, integration tests, browser tests, UI tests, test files, test organization. Covers data-testid conventions, multi-user testing with Keycloak, negative test patterns, and test file structure."
---

# End-to-End Testing Skill

This project uses Playwright for end-to-end tests against the full Aspire-orchestrated stack (Vue frontend, .NET API, PostgreSQL, Keycloak, Azure Storage).

## Test file structure

Tests live at the **solution root** in `tests/e2e/`, organized by feature — mirroring `src/Thuddle.Web/src/features/`:

```
tests/
  e2e/
    auth/
      login.spec.ts
      logout.spec.ts
    events/
      create-event.spec.ts
      event-list.spec.ts
      join-event.spec.ts
      invite-users.spec.ts
      manage-event.spec.ts
    profile/
      edit-profile.spec.ts
      upload-picture.spec.ts
    discussions/
      post-comment.spec.ts
      moderation.spec.ts
    helpers/
      auth.ts            # login helper functions per user
      aspire.ts           # aspire start/wait/describe helpers
    playwright.config.ts
    package.json
```

- **One folder per feature** — matches the Vue `features/` directory
- **One file per user flow** — keeps tests focused and independently runnable
- **`helpers/`** — shared utilities for authentication, Aspire resource discovery, etc.
- **Separate `package.json`** — isolates Playwright dependencies from the Vue app

## Element selection: data-testid

**All interactable elements must have a `data-testid` attribute.** Never rely on snapshot refs (`e15`) or CSS class selectors in test code — they break on any UI change.

### Convention

Use kebab-case, scoped by feature:

```html
<!-- Buttons -->
<button data-testid="auth-login-btn">Log in</button>
<button data-testid="auth-logout-btn">Log out</button>
<button data-testid="event-create-btn">Create Event</button>
<button data-testid="event-join-btn">Join</button>
<button data-testid="event-invite-btn">Invite</button>

<!-- Forms and inputs -->
<input data-testid="event-title-input" />
<input data-testid="event-location-input" />
<textarea data-testid="event-description-input" />
<select data-testid="event-visibility-select" />
<select data-testid="event-joinmode-select" />

<!-- Navigation and links -->
<a data-testid="nav-dashboard-link">Dashboard</a>
<a data-testid="nav-profile-link">Profile</a>

<!-- Containers / display elements that need assertion -->
<div data-testid="event-list" />
<div data-testid="event-card" />       <!-- repeats per event -->
<div data-testid="event-detail" />
<div data-testid="attendee-list" />
<div data-testid="discussion-thread" />
<span data-testid="user-display-name" />

<!-- File uploads -->
<input type="file" data-testid="profile-picture-upload" />
<input type="file" data-testid="event-image-upload" />
```

### Naming rules

| Pattern | Example | Use for |
|---|---|---|
| `{feature}-{element}-{type}` | `event-title-input` | Inputs, buttons, selects |
| `{feature}-{noun}` | `event-list`, `event-card` | Containers, display regions |
| `nav-{target}-link` | `nav-dashboard-link` | Navigation elements |

### Using in tests

```typescript
// In Playwright spec files
await page.getByTestId('auth-login-btn').click()
await page.getByTestId('event-title-input').fill('Birthday Party')
await expect(page.getByTestId('event-list')).toBeVisible()
```

```bash
# With playwright-cli for exploration
playwright-cli click "getByTestId('auth-login-btn')"
playwright-cli fill "getByTestId('event-title-input')" "Birthday Party"
```

### When adding new components

Before writing tests for a Vue component, ensure every interactive element has `data-testid`. Add them during test development, not retroactively in bulk.

## Seeded test users

The Keycloak dev realm (`Thuddle-realm.dev.json`) has four pre-configured users. All share the password `testpassword`:

| User | Email | Role | Use in tests |
|---|---|---|---|
| testuser | testuser@thuddle.dev | Admin (seeded with permissions) | Event owner, admin actions |
| alice | alice@thuddle.dev | Regular user | Invited participant, co-admin |
| bob | bob@thuddle.dev | Regular user | Uninvited user (negative tests) |
| charlie | charlie@thuddle.dev | Regular user | Third-party observer |

## Authentication: storageState setup project

**Never log in via the Keycloak UI inside every test.** Keycloak's login form is flaky under automation — JavaScript on the page can clear `fill()` values, and concurrent SSO redirects for the same user cause 403 errors. Instead, use Playwright's **storageState** pattern: authenticate once in a setup project, save session cookies, and reuse them for all tests.

### Setup project (`auth.setup.ts`)

The setup project authenticates all four users once before any spec runs:

```typescript
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const authDir = path.join(__dirname, 'playwright/.auth')
fs.mkdirSync(authDir, { recursive: true })

const accounts = [
  { name: 'admin', username: 'testuser', password: 'testpassword' },
  { name: 'alice', username: 'alice', password: 'testpassword' },
  { name: 'bob', username: 'bob', password: 'testpassword' },
  { name: 'charlie', username: 'charlie', password: 'testpassword' },
]

for (const account of accounts) {
  const authFile = path.join(authDir, `${account.name}.json`)

  setup(`authenticate as ${account.name}`, async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('auth-login-btn').click()

    await page.locator('#username').waitFor({ state: 'visible' })
    await page.locator('#password').waitFor({ state: 'visible' })

    // Fill and verify — Keycloak JS can clear values
    await page.locator('#username').fill(account.username)
    await page.locator('#password').fill(account.password)

    if ((await page.locator('#username').inputValue()) !== account.username) {
      await page.locator('#username').clear()
      await page.locator('#username').pressSequentially(account.username, { delay: 30 })
    }
    if ((await page.locator('#password').inputValue()) !== account.password) {
      await page.locator('#password').clear()
      await page.locator('#password').pressSequentially(account.password, { delay: 30 })
    }

    await page.locator('#kc-login').click()
    await page.waitForURL((url) => !url.toString().includes('/realms/'), { timeout: 30000 })
    await expect(page.getByTestId('user-display-name')).toBeVisible({ timeout: 15000 })

    await page.context().storageState({ path: authFile })
  })
}
```

### Playwright config with setup dependency

```typescript
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'chromium',
    use: { browserName: 'chromium' },
    dependencies: ['setup'],
  },
],
```

### Storage state paths and helpers (`helpers/auth.ts`)

```typescript
import { type Browser, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'

export const STORAGE_STATE = {
  admin: path.join(__dirname, '../playwright/.auth/admin.json'),
  alice: path.join(__dirname, '../playwright/.auth/alice.json'),
  bob: path.join(__dirname, '../playwright/.auth/bob.json'),
  charlie: path.join(__dirname, '../playwright/.auth/charlie.json'),
}

/** Create a browser context pre-authenticated as the given user. */
export async function contextAs(
  browser: Browser,
  user: keyof typeof STORAGE_STATE,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await context.newPage()
  return { context, page }
}
```

### Using storageState in tests

For **single-user** tests, use `test.use()` at the describe level:

```typescript
test.describe('Create event', () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test('admin can create an event', async ({ page, baseURL }) => {
    await page.goto(baseURL!)
    await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
    // ... no loginAs() needed — SSO happens automatically via session cookies
  })
})
```

For **anonymous** tests, use an empty storageState:

```typescript
test.use({ storageState: { cookies: [], origins: [] } })
```

For **multi-user** tests, use `contextAs()` with the browser fixture:

```typescript
test('alice can join an event created by admin', async ({ browser, baseURL }) => {
  const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
  // ... admin creates event
  await adminCtx.close()

  const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
  // ... alice joins event
  await aliceCtx.close()
})
```

### Important: wait for SSO completion after navigation

StorageState stores Keycloak session cookies. When a page loads, the app detects the session and performs a silent SSO redirect. **Always wait for SSO to complete** before interacting with authenticated UI elements:

```typescript
await page.goto(baseURL!)
// Wait for SSO + profile/permissions to load
await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
// or
await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
```

### When to keep `loginAs()` (UI login)

Keep the `loginAs()` helper only for tests that **verify the login flow itself** (`auth/login.spec.ts`). All other tests must use storageState.

### `.gitignore`

Add `tests/e2e/playwright/.auth/` to `.gitignore` — these files contain session tokens.

## Multi-user testing

Many flows require multiple users acting in sequence (e.g., one user creates an event, another tries to join). Use `contextAs()` to create **separate browser contexts** with pre-authenticated storageState.

### Multi-user test pattern

```typescript
import { test, expect } from '@playwright/test'
import { contextAs, uid } from '../helpers/auth'

test('invited user can join, uninvited user cannot', async ({ browser, baseURL }) => {
  const name = `InvOnly ${uid()}`

  // User 1: admin creates an invite-only event
  const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
  await adminPage.goto(baseURL!)
  await adminPage.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  // ... fill form, submit, capture event URL from API response
  await adminCtx.close()

  // User 2: alice (invited) can join
  const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
  await alicePage.goto(eventUrl)
  await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
  // ... expect join button visible
  await aliceCtx.close()

  // User 3: bob (NOT invited) cannot join
  const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
  await bobPage.goto(eventUrl)
  await bobPage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
  // ... expect invite-only message
  await bobCtx.close()
})
```

### With playwright-cli (exploration / prototyping)

Use **named sessions** to simulate multiple users:

```bash
# Session 1: admin
playwright-cli -s=admin open http://localhost:5173
playwright-cli -s=admin click "getByTestId('auth-login-btn')"
# ... complete Keycloak login for testuser
playwright-cli -s=admin state-save admin-auth.json

# Session 2: alice
playwright-cli -s=alice open http://localhost:5173
playwright-cli -s=alice click "getByTestId('auth-login-btn')"
# ... complete Keycloak login for alice
playwright-cli -s=alice state-save alice-auth.json

# Now switch between sessions to test multi-user flows
playwright-cli -s=admin click "getByTestId('event-create-btn')"
# ...
playwright-cli -s=alice goto http://localhost:5173/events/<id>
playwright-cli -s=alice click "getByTestId('event-join-btn')"
```

## Negative test patterns

**Every positive test should have a corresponding negative test.** Think about who should be denied, not just who should succeed.

### Authorization matrix

For each action, test all relevant user roles:

| Action | Admin/Owner | Invited user | Uninvited user | Anonymous |
|---|---|---|---|---|
| Create event | ✅ succeeds | ✅ succeeds (if permitted) | ✅ succeeds (if permitted) | ❌ redirected to login |
| Join open event | ✅ | ✅ | ✅ | ❌ redirected to login |
| Join invite-only event | ✅ | ✅ | ❌ blocked | ❌ redirected to login |
| Manage event | ✅ | ❌ no access | ❌ no access | ❌ redirected to login |
| Invite users | ✅ | ❌ | ❌ | ❌ |
| Add co-admin | ✅ | ❌ | ❌ | ❌ |
| Update payment status | ✅ | ❌ | ❌ | ❌ |
| Post in discussion | ✅ (auto-approved) | depends on policy | depends on policy | ❌ |
| Delete others' posts | ✅ | ❌ | ❌ | ❌ |
| Edit profile | ✅ own only | ✅ own only | ✅ own only | ❌ |

### Negative test patterns to always include

1. **Unauthorized access** — Anonymous user tries to access `/profile`, `/events/create`, or manage pages → redirected to login
2. **Forbidden actions** — Non-owner tries to manage event, invite users, or remove co-admins → action blocked or UI element absent
3. **Invite-only enforcement** — Uninvited user navigates to invite-only event → join button is hidden/disabled
4. **Capacity limits** — Event at capacity → new user cannot join
5. **Visibility enforcement** — Unlisted event does not appear in public event list for anonymous users
6. **Discussion moderation** — Non-member post with `RequireApproval` policy → post not visible until approved
7. **Invalid input** — Empty required fields, malformed data → form validation prevents submission

### Structuring negative tests

Group positive and negative cases in the same spec file using `describe` blocks:

```typescript
test.describe('Join event', () => {
  test.describe('open event', () => {
    test('authenticated user can join', async ({ browser }) => { ... })
    test('anonymous user is redirected to login', async ({ page }) => { ... })
    test('user cannot join when event is at capacity', async ({ browser }) => { ... })
  })

  test.describe('invite-only event', () => {
    test('invited user can join', async ({ browser }) => { ... })
    test('uninvited user cannot join', async ({ browser }) => { ... })
    test('anonymous user is redirected to login', async ({ page }) => { ... })
  })
})
```

## Running tests

### Start the app first (without volumes)

Tests require a clean database on every run. Start the Aspire app **without persistent volumes** so PostgreSQL and Keycloak start fresh each time:

```bash
aspire start -- --NoVolumes=true
aspire wait api
aspire wait web
```

The `--NoVolumes=true` flag is passed through to the AppHost configuration and disables `WithDataVolume()` on PostgreSQL and Keycloak containers. Without this flag, stale data from previous runs can cause test failures.

### Discover the frontend URL

```bash
aspire describe --format Json
# Parse the web resource endpoint URL from the output
```

### Run tests

```bash
cd tests/e2e
npx playwright test                    # all tests
npx playwright test auth/              # one feature
npx playwright test --grep "invite"    # by name
```

## Unique test data: avoid name collisions

Tests run against a shared database that persists across runs. **Never use hardcoded names** for created entities (events, posts, etc.) — they collide across test runs and cause false positives/negatives when asserting on dashboard lists.

Use the `uid()` helper to generate unique 8-character suffixes:

```typescript
import { uid } from '../helpers/auth'

const name = `Public ${uid()}`  // e.g. "Public 1bcc96bc"
```

### Why this matters

- Dashboard lists are paginated — a newly created event may not appear on page 1 if many previous test events exist
- Assertions like `toContainText(name)` fail if another event with the same name appears first
- Multiple CI runs can happen in parallel against the same environment

### Verifying creation: use API responses, not dashboard lists

Don't assert that a newly created event appears in the paginated dashboard list — it may be pushed to page 2+. Instead, capture the API response and verify the status code:

```typescript
const responsePromise = page.waitForResponse(
  (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
)
await page.getByTestId('event-submit-btn').click()
const response = await responsePromise
expect(response.status()).toBe(201)

// Then verify redirect happened
await expect(page).toHaveURL(baseURL!, { timeout: 15000 })
```

To test the detail page, navigate directly using the event ID from the response:

```typescript
const body = await response.json()
await page.goto(`${baseURL}/events/${body.id}`)
await expect(page.getByTestId('event-title')).toHaveText(name)
```

## Test design: read vs write separation

Every test should have a single responsibility — either verifying a **write** (create/edit/delete/save) or a **read** (view/list/display/render). The setup and assertion strategies differ:

| Test type | Arrange (setup) | Act (exercise) | Assert (verify) |
|---|---|---|---|
| **Write test** | Navigate the UI | Use the GUI as a user would | Call the API to confirm data was persisted |
| **Read test** | Create data directly via API | Navigate the UI as a user would | Assert the GUI shows the correct data |

### Why this matters

- **Test isolation** — a broken create form doesn't cascade failures into unrelated display tests
- **Speed** — API setup is dramatically faster than clicking through forms
- **Clear failure signals** — write test fails = save logic is broken; read test fails = display is broken

### Write test example

Test that a user can create an event. Drive the GUI, verify via API:

```typescript
test('admin can create a public event', async ({ page, baseURL, createdEvents }) => {
  const name = `Public ${uid()}`

  // Arrange + Act: use the GUI as a user would
  await page.goto(baseURL!)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()
  await page.getByTestId('event-title-input').fill(name)
  await page.getByTestId('event-location-input').fill('Test Location')
  // ... fill remaining fields ...

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
  )
  await page.getByTestId('event-submit-btn').click()
  const response = await responsePromise

  // Assert: verify via API response
  expect(response.status()).toBe(201)
  const body = await response.json()
  expect(body.title).toBe(name)
  createdEvents.push(body.id)
})
```

### Read test example

Test that events appear on the dashboard. Set up data via API, then verify the GUI:

```typescript
test('authenticated user can see events on the dashboard', async ({ page, request, baseURL, createdEvents }) => {
  // Arrange: create data directly via API
  const resp = await request.post(`${baseURL}/api/events`, {
    data: { title: `ListTest ${uid()}`, location: 'API Venue', /* ... */ },
  })
  expect(resp.status()).toBe(201)
  const event = await resp.json()
  createdEvents.push(event.id)

  // Act: navigate the UI as a user would
  await page.goto(baseURL!)
  await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

  // Assert: verify the GUI displays the data
  await expect(page.getByTestId('event-list')).toBeVisible()
})
```

### When a test needs both — split it

If a feature involves both saving and displaying, write **two separate tests**:

1. A write test that saves via GUI and verifies via API
2. A read test that creates via API and verifies via GUI

Do not combine them into one test — that conflates two failure modes.

## Event cleanup: `createdEvents` fixture

Tests that create events **must** clean them up to keep the database tidy. Without cleanup, events accumulate across test runs and push newer events off page 1 of the dashboard, breaking GUI assertions.

### How it works

A custom Playwright fixture in `helpers/fixtures.ts` provides a `createdEvents: string[]` array. Tests push event IDs into it; after the test finishes (pass or fail), the fixture automatically deletes them via the `DELETE /api/events/{eventId}` endpoint using a JWT obtained from Keycloak's direct-access grant.

### Import from fixtures, not @playwright/test

All test files that create events **must** import `test` and `expect` from the custom fixture instead of `@playwright/test`:

```typescript
// ✅ Correct — uses cleanup fixture
import { test, expect } from '../helpers/fixtures'

// ❌ Wrong — no cleanup
import { test, expect } from '@playwright/test'
```

### Tracking created events

After creating an event, capture the event ID from the API response and push it:

```typescript
test('admin can create an event', async ({ page, baseURL, createdEvents }) => {
  // ... fill form ...
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const response = await responsePromise
  const body = await response.json()
  createdEvents.push(body.id)  // ← track for cleanup
})
```

For helper functions that create events, return the event ID alongside the URL:

```typescript
async function createEvent(browser: Browser, baseURL: string): Promise<{ eventUrl: string; eventId: string }> {
  // ... create event, capture response ...
  const body = await resp.json()
  return { eventUrl: `${baseURL}/events/${body.id}`, eventId: body.id }
}

test('something with an event', async ({ browser, baseURL, createdEvents }) => {
  const { eventUrl, eventId } = await createEvent(browser, baseURL!)
  createdEvents.push(eventId)
  // ... test logic ...
})
```

### Tests that don't create events

Tests that don't create events (e.g., `login.spec.ts`, `edit-profile.spec.ts`) can continue importing from `@playwright/test` or from the fixture — the `createdEvents` param is optional to destructure.

### Self-contained tests for dashboard assertions

Because cleanup removes events after each test, tests that assert on the dashboard event list **must create their own event first** — don't assume events from other tests still exist:

```typescript
test('anonymous user can see public events', async ({ browser, page, baseURL, createdEvents }) => {
  // Create an event as admin first
  const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
  // ... create event, push ID to createdEvents ...
  await adminCtx.close()

  // Now verify the anonymous user can see it
  await page.goto(baseURL!)
  await expect(page.getByTestId('event-list')).toBeVisible()
})
```

## Concurrency: single worker

Run with `workers: 1` in the Playwright config. Multiple workers cause concurrent Keycloak SSO redirects for the same user session, leading to intermittent 403 errors on API calls. The storageState pattern avoids per-test login overhead, so single-worker execution is fast (~9 seconds for 22 tests).

## Key rules

1. **Always add `data-testid`** to Vue components before writing tests that target them
2. **Never use snapshot refs** (`e15`) in committed test code — use `getByTestId()` or role locators
3. **Every positive test needs a negative counterpart** — test denial, not just access
4. **Use storageState for auth** — authenticate once in setup project, reuse session cookies; only `auth/login.spec.ts` should use direct `loginAs()`
5. **Use `uid()` for all test data names** — never hardcode entity names; collisions cause flaky assertions
6. **Verify creation via API response** — don't rely on paginated dashboard lists to confirm a create succeeded
7. **Clean up created events** — import from `helpers/fixtures` and push event IDs into `createdEvents`; never leave test data behind
8. **Run with `workers: 1`** — concurrent SSO redirects cause 403 errors
9. **Wait for SSO after navigation** — `waitFor('user-display-name')` or `waitFor('event-create-btn')` before interacting
10. **Start the full Aspire stack** before running tests — these are true end-to-end tests
11. **Keep tests independent** — each test should create its own data; don't rely on test execution order or leftover data from other tests
12. **Use the seeded users consistently** — `testuser` for admin, `bob` for uninvited/negative cases
