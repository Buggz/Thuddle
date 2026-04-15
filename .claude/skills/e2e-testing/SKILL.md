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

## Multi-user testing

Many flows require multiple users acting in sequence (e.g., one user creates an event, another tries to join). Use **separate browser contexts** — not separate browser instances — to manage multiple authenticated sessions.

### Login helper

Create a reusable helper that logs in via Keycloak and returns an authenticated browser context:

```typescript
// tests/e2e/helpers/auth.ts
import { type Browser, type BrowserContext, type Page } from '@playwright/test'

interface TestUser {
  username: string
  password: string
}

export const users = {
  admin: { username: 'testuser', password: 'testpassword' },
  alice: { username: 'alice', password: 'testpassword' },
  bob:   { username: 'bob',   password: 'testpassword' },
  charlie: { username: 'charlie', password: 'testpassword' },
} as const

export async function loginAs(
  browser: Browser,
  user: TestUser,
  baseURL: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.getByTestId('auth-login-btn').click()

  // Keycloak login form
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.locator('#kc-login').click()

  // Wait for redirect back to the app
  await page.waitForURL(url => !url.toString().includes('/realms/'))

  return { context, page }
}
```

### Multi-user test pattern

```typescript
import { test, expect } from '@playwright/test'
import { loginAs, users } from '../helpers/auth'

test('invited user can join, uninvited user cannot', async ({ browser }) => {
  const baseURL = '...' // from Aspire describe

  // User 1: admin creates an invite-only event and invites alice
  const admin = await loginAs(browser, users.admin, baseURL)
  await admin.page.getByTestId('event-create-btn').click()
  // ... fill form, set JoinMode to InviteOnly, submit
  // ... invite alice@thuddle.dev

  // User 2: alice (invited) can join
  const alice = await loginAs(browser, users.alice, baseURL)
  // ... navigate to event, click join — expect success

  // User 3: bob (NOT invited) cannot join
  const bob = await loginAs(browser, users.bob, baseURL)
  // ... navigate to event — join button should be absent or disabled

  // Cleanup contexts
  await admin.context.close()
  await alice.context.close()
  await bob.context.close()
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

### Start the app first

```bash
aspire start
aspire wait api
aspire wait web
```

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

## Key rules

1. **Always add `data-testid`** to Vue components before writing tests that target them
2. **Never use snapshot refs** (`e15`) in committed test code — use `getByTestId()` or role locators
3. **Every positive test needs a negative counterpart** — test denial, not just access
4. **Use separate browser contexts** for multi-user tests, not separate browser instances
5. **Start the full Aspire stack** before running tests — these are true end-to-end tests
6. **Keep tests independent** — each test should create its own data; don't rely on test execution order
7. **Use the seeded users consistently** — `testuser` for admin, `bob` for uninvited/negative cases
