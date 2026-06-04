# User System Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service user registration, email-or-phone login, admin user management, password reset, and usage statistics to Amazon Image Studio.

**Architecture:** Extend the existing Node ESM server and SQLite store with user and usage tables. Replace config-only account checks with persisted users and signed user-id sessions, while keeping existing `/api/tasks`, `/api/images`, `/api/thumbnails`, and `/api/amazon-planner-sessions` paths. Add focused React management and usage screens controlled by `App` view state rather than introducing a new router.

**Tech Stack:** Node ESM, `better-sqlite3`, Node `crypto.scryptSync`, React 19, Zustand, Tailwind CSS, Vitest.

---

## File Map

- Modify `server/auth.mjs`: password hashing, user-id session payloads, cookie verification through storage.
- Modify `server/database.mjs`: `users` and `usage_events` schema, user CRUD, admin bootstrap, usage recording and summaries.
- Modify `server/app.mjs`: register/login/me, role-aware data owner, API proxy usage recording, admin endpoints.
- Modify `server/server.mjs`: bootstrap admin users into SQLite and pass storage-backed auth config.
- Modify `server/auth.test.mjs`: session and password hashing behavior.
- Modify `server/database.test.mjs`: user and usage storage behavior.
- Modify `server/app.test.mjs`: register/login/admin/usage API behavior.
- Modify `src/lib/auth.ts`: richer session model plus login/register/logout helpers.
- Create `src/lib/admin.ts`: admin and usage API helpers.
- Modify `src/lib/auth.test.ts`: frontend auth helper expectations.
- Create `src/lib/admin.test.ts`: frontend admin helper expectations.
- Modify `src/components/LoginPage.tsx`: login/register toggle with identifier, email, phone, password fields.
- Modify `src/components/LoginPage.test.tsx`: render expectations for new auth page.
- Modify `src/components/Header.tsx`: role-aware management and usage entries.
- Modify `src/components/icons.tsx`: add compact management/statistics icons if needed.
- Create `src/components/AdminPanel.tsx`: admin shell, summary, users, all-usage views, password reset controls.
- Create `src/components/UsagePanel.tsx`: current-user usage summary and recent events.
- Create `src/components/AdminPanel.test.tsx`: admin markup smoke tests.
- Create `src/components/UsagePanel.test.tsx`: usage markup smoke tests.
- Modify `src/App.tsx`: view state for `workspace`, `admin`, and `usage`; pass role-aware session props.
- Modify `.env.example`, `README.md`, and `docs/production-deploy.md`: document registration, admin bootstrap, and usage stats.

## Task 1: User Storage And Password Hashing

**Files:**
- Modify: `server/auth.mjs`
- Modify: `server/database.mjs`
- Test: `server/auth.test.mjs`
- Test: `server/database.test.mjs`

- [ ] **Step 1: Write failing password hash tests**

Add tests to `server/auth.test.mjs`:

```js
import { hashPassword, verifyPassword } from './auth.mjs'

it('hashes and verifies passwords without storing plaintext', () => {
  const hash = hashPassword('secret', 'fixed-salt')
  expect(hash).toMatch(/^scrypt:fixed-salt:/)
  expect(hash).not.toContain('secret')
  expect(verifyPassword('secret', hash)).toBe(true)
  expect(verifyPassword('wrong', hash)).toBe(false)
})
```

- [ ] **Step 2: Run auth tests and verify RED**

Run: `npm test -- server/auth.test.mjs`

Expected: FAIL because `hashPassword` and `verifyPassword` are not exported.

- [ ] **Step 3: Implement minimal password helpers**

In `server/auth.mjs`, add:

```js
import { randomBytes, scryptSync } from 'node:crypto'

export function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  const hash = scryptSync(String(password), salt, 32).toString('base64url')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password, storedHash) {
  const [, salt, expected] = String(storedHash).split(':')
  const actual = scryptSync(String(password), salt, 32).toString('base64url')
  return expected === actual
}
```

- [ ] **Step 4: Run auth tests and verify GREEN**

Run: `npm test -- server/auth.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing database user tests**

Add tests to `server/database.test.mjs`:

```js
it('creates users and finds them by email or phone', () => {
  const user = storage.createUser({
    email: 'user@example.com',
    phone: '13800000000',
    passwordHash: 'hash',
    role: 'user',
    status: 'active',
    createdAt: 1,
  })

  expect(storage.getUserById(user.id)).toMatchObject({ email: 'user@example.com', phone: '13800000000', role: 'user' })
  expect(storage.findUserByIdentifier('user@example.com')).toMatchObject({ id: user.id })
  expect(storage.findUserByIdentifier('13800000000')).toMatchObject({ id: user.id })
})

it('updates user status and password hash', () => {
  const user = storage.createUser({ email: 'user@example.com', phone: '', passwordHash: 'old', role: 'user', status: 'active', createdAt: 1 })

  storage.setUserStatus(user.id, 'disabled')
  storage.setUserPasswordHash(user.id, 'new')

  expect(storage.getUserById(user.id)).toMatchObject({ status: 'disabled', passwordHash: 'new' })
})
```

- [ ] **Step 6: Run database tests and verify RED**

Run: `npm test -- server/database.test.mjs`

Expected: FAIL because user storage methods do not exist.

- [ ] **Step 7: Implement user schema and methods**

In `server/database.mjs`, create `users`, parse rows, and return methods:

```js
create table if not exists users (
  id text primary key,
  email text unique,
  phone text unique,
  password_hash text not null,
  role text not null,
  status text not null,
  created_at integer not null,
  last_login_at integer
);
```

Methods to add:

```js
createUser({ email, phone, passwordHash, role, status, createdAt })
getUserById(id)
findUserByIdentifier(identifier)
setUserStatus(id, status)
setUserPasswordHash(id, passwordHash)
touchUserLogin(id, lastLoginAt)
listUsers()
ensureAdminUser({ email, phone, passwordHash, createdAt })
```

User ids use `crypto.randomUUID()`. Empty email or phone is stored as `null`.

- [ ] **Step 8: Run database tests and verify GREEN**

Run: `npm test -- server/database.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add server/auth.mjs server/auth.test.mjs server/database.mjs server/database.test.mjs
git commit -m "feat: add user storage and password hashing"
```

## Task 2: Storage-Backed Authentication API

**Files:**
- Modify: `server/auth.mjs`
- Modify: `server/app.mjs`
- Modify: `server/server.mjs`
- Test: `server/auth.test.mjs`
- Test: `server/app.test.mjs`

- [ ] **Step 1: Write failing session tests**

Update `server/auth.test.mjs` to expect user-id sessions:

```js
it('verifies a signed token created for an active user id', () => {
  const storage = { getUserById: (id) => id === 'user-a' ? { id, role: 'user', status: 'active' } : undefined }
  const token = createSessionToken(config, { id: 'user-a', role: 'user' }, 1_900_000_000_000)
  expect(verifySessionToken(config, storage, token, 1_800_000_000_000)).toEqual({ userId: 'user-a', role: 'user' })
})

it('rejects a token for a disabled user', () => {
  const storage = { getUserById: () => ({ id: 'user-a', role: 'user', status: 'disabled' }) }
  const token = createSessionToken(config, { id: 'user-a', role: 'user' }, 1_900_000_000_000)
  expect(verifySessionToken(config, storage, token, 1_800_000_000_000)).toBeNull()
})
```

- [ ] **Step 2: Run auth tests and verify RED**

Run: `npm test -- server/auth.test.mjs`

Expected: FAIL because session helpers still use username.

- [ ] **Step 3: Implement user-id session helpers**

Change `createSessionToken`, `verifySessionToken`, `createSessionCookie`, and `getRequestSession` to use `{ id, role }` and storage-backed verification. Preserve cookie name and expiry.

- [ ] **Step 4: Run auth tests and verify GREEN**

Run: `npm test -- server/auth.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing auth API tests**

In `server/app.test.mjs`, use a SQLite storage instance or a memory storage with user methods and add:

```js
it('registers a user and returns an authenticated user session', async () => {
  const response = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
  expect(response.status).toBe(200)
  expect(response.json()).toMatchObject({ authenticated: true, user: { email: 'user@example.com', role: 'user' } })
  expect(response.headers['set-cookie'][0]).toContain('ais_session=')
})

it('logs in with either email or phone', async () => {
  await postJson('/api/auth/register', { email: 'user@example.com', phone: '13800000000', password: 'secret' })
  expect((await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'secret' })).status).toBe(200)
  expect((await postJson('/api/auth/login', { identifier: '13800000000', password: 'secret' })).status).toBe(200)
})

it('rejects disabled users during login', async () => {
  const registered = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
  const userId = registered.json().user.id
  appStorage.setUserStatus(userId, 'disabled')
  const response = await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'secret' })
  expect(response.status).toBe(401)
})
```

- [ ] **Step 6: Run app tests and verify RED**

Run: `npm test -- server/app.test.mjs`

Expected: FAIL because `/api/auth/register` and identifier login are missing.

- [ ] **Step 7: Implement auth API and server bootstrap**

In `server/app.mjs`, update auth handling:

- `GET /api/auth/me` returns `{ authenticated, user }`.
- `POST /api/auth/register` creates an active `user`.
- `POST /api/auth/login` accepts `{ identifier, password }`.
- `POST /api/auth/logout` keeps existing behavior.

In `server/server.mjs`, hash configured admin passwords and call `storage.ensureAdminUser(...)` before creating the handler.

- [ ] **Step 8: Run app tests and verify GREEN**

Run: `npm test -- server/auth.test.mjs server/app.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add server/auth.mjs server/auth.test.mjs server/app.mjs server/app.test.mjs server/server.mjs
git commit -m "feat: add registration and identifier login"
```

## Task 3: Usage Recording And Summaries

**Files:**
- Modify: `server/database.mjs`
- Modify: `server/app.mjs`
- Test: `server/database.test.mjs`
- Test: `server/app.test.mjs`

- [ ] **Step 1: Write failing usage storage tests**

Add to `server/database.test.mjs`:

```js
it('records usage events and summarizes them by user', () => {
  const user = storage.createUser({ email: 'user@example.com', phone: '', passwordHash: 'hash', role: 'user', status: 'active', createdAt: 1 })
  storage.recordUsageEvent({ userId: user.id, eventType: 'ai_proxy', status: 'ok', endpoint: '/api-proxy/v1/responses', model: 'gpt-image-1', generatedImages: 2, totalTokens: 1569, createdAt: 10 })
  storage.recordUsageEvent({ userId: user.id, eventType: 'ai_proxy', status: 'error', endpoint: '/api-proxy/v1/responses', model: 'gpt-image-1', generatedImages: 0, totalTokens: 0, createdAt: 11 })

  expect(storage.getUsageSummary(user.id)).toMatchObject({ calls: 2, successes: 1, failures: 1, generatedImages: 2, totalTokens: 1569, lastUsedAt: 11 })
  expect(storage.getUsageEvents(user.id)).toHaveLength(2)
})
```

- [ ] **Step 2: Run database tests and verify RED**

Run: `npm test -- server/database.test.mjs`

Expected: FAIL because usage methods are missing.

- [ ] **Step 3: Implement usage schema and methods**

Add `usage_events` table and methods:

```js
recordUsageEvent(event)
getUsageSummary(userId)
getUsageEvents(userId, limit = 50)
getAllUsageSummaries()
getAllUsageEvents(limit = 100)
```

Use SQL aggregation for counts and sums.

- [ ] **Step 4: Run database tests and verify GREEN**

Run: `npm test -- server/database.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing proxy usage tests**

Add to `server/app.test.mjs`:

```js
it('records successful proxy usage with generated image and token counts', async () => {
  const upstream = await createUpstreamServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }], usage: { total_tokens: 42 } }))
  })
  await restartApp({ aiApiBaseUrl: `${upstream.baseUrl}/v1`, aiApiKey: 'env-api-key' })
  const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
  await request('/api-proxy/v1/images/generations', { method: 'POST', headers: { cookie: login.headers['set-cookie'][0], 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1' }) })

  expect(appStorage.getUsageSummary(login.json().user.id)).toMatchObject({ calls: 1, successes: 1, generatedImages: 1, totalTokens: 42 })
  await upstream.close()
})
```

- [ ] **Step 6: Run app tests and verify RED**

Run: `npm test -- server/app.test.mjs`

Expected: FAIL because proxy usage recording is missing.

- [ ] **Step 7: Implement proxy usage recording**

In `handleApiProxy`, buffer JSON responses for non-stream JSON responses, forward the same body to the browser, and record:

- `status: 'ok'` for 2xx responses, `status: 'error'` otherwise.
- `generatedImages` from `data.length`, `output` image-generation items, or completed event parsing when practical.
- token values from `usage` when present.

- [ ] **Step 8: Run app tests and verify GREEN**

Run: `npm test -- server/database.test.mjs server/app.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add server/database.mjs server/database.test.mjs server/app.mjs server/app.test.mjs
git commit -m "feat: record ai usage statistics"
```

## Task 4: Admin And Usage APIs

**Files:**
- Modify: `server/app.mjs`
- Test: `server/app.test.mjs`

- [ ] **Step 1: Write failing admin API tests**

Add to `server/app.test.mjs`:

```js
it('allows admin to list users and reset a user password', async () => {
  const userRegister = await postJson('/api/auth/register', { email: 'user@example.com', password: 'old-secret' })
  const userId = userRegister.json().user.id
  const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
  const adminCookie = adminLogin.headers['set-cookie'][0]

  expect((await request('/api/admin/users', { headers: { cookie: adminCookie } })).json().items[0]).toMatchObject({ id: userId, email: 'user@example.com' })
  expect((await postJson(`/api/admin/users/${userId}/reset-password`, { password: 'new-secret' }, adminCookie)).status).toBe(200)
  expect((await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'new-secret' })).status).toBe(200)
})

it('prevents ordinary users from admin APIs', async () => {
  const register = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
  const response = await request('/api/admin/users', { headers: { cookie: register.headers['set-cookie'][0] } })
  expect(response.status).toBe(403)
})

it('returns current-user usage and admin all-user usage', async () => {
  const user = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
  const admin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
  appStorage.recordUsageEvent({ userId: user.json().user.id, eventType: 'ai_proxy', status: 'ok', endpoint: '/api-proxy/v1/responses', model: 'gpt-image-1', generatedImages: 1, totalTokens: 10, createdAt: 10 })

  expect((await request('/api/usage/me', { headers: { cookie: user.headers['set-cookie'][0] } })).json().summary).toMatchObject({ calls: 1 })
  expect((await request('/api/admin/usage', { headers: { cookie: admin.headers['set-cookie'][0] } })).json().summaries[0]).toMatchObject({ calls: 1, email: 'user@example.com' })
})
```

- [ ] **Step 2: Run app tests and verify RED**

Run: `npm test -- server/app.test.mjs`

Expected: FAIL because admin and usage endpoints are missing.

- [ ] **Step 3: Implement admin and usage endpoints**

Add helpers:

```js
function requireAdmin(res, session) {
  if (session.role !== 'admin') {
    sendJson(res, 403, { error: '需要管理员权限' })
    return false
  }
  return true
}
```

Routes:

- `GET /api/usage/me`
- `GET /api/admin/summary`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/reset-password`
- `GET /api/admin/usage`

- [ ] **Step 4: Run app tests and verify GREEN**

Run: `npm test -- server/app.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add server/app.mjs server/app.test.mjs
git commit -m "feat: add admin and usage APIs"
```

## Task 5: Frontend Auth, Admin, And Usage UI

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/admin.ts`
- Modify: `src/lib/auth.test.ts`
- Create: `src/lib/admin.test.ts`
- Modify: `src/components/LoginPage.tsx`
- Modify: `src/components/LoginPage.test.tsx`
- Modify: `src/components/Header.tsx`
- Create: `src/components/AdminPanel.tsx`
- Create: `src/components/UsagePanel.tsx`
- Create: `src/components/AdminPanel.test.tsx`
- Create: `src/components/UsagePanel.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing frontend API tests**

In `src/lib/auth.test.ts`, expect login/register shape:

```ts
await login('user@example.com', 'secret')
expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
  body: JSON.stringify({ identifier: 'user@example.com', password: 'secret' }),
}))
```

Create `src/lib/admin.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { getAdminUsers, getMyUsage, resetUserPassword, setUserStatus } from './admin'

afterEach(() => vi.restoreAllMocks())

describe('admin api helpers', () => {
  it('loads admin users', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await expect(getAdminUsers()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users', { credentials: 'same-origin' })
  })

  it('resets user password', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await resetUserPassword('user-a', 'new-secret')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/user-a/reset-password', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run frontend API tests and verify RED**

Run: `npm test -- src/lib/auth.test.ts src/lib/admin.test.ts`

Expected: FAIL because helper signatures and `admin.ts` are missing.

- [ ] **Step 3: Implement frontend API helpers**

Update `AuthSession`:

```ts
export interface AuthUser {
  id: string
  email?: string
  phone?: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
}

export interface AuthSession {
  authenticated: boolean
  user?: AuthUser
}
```

Add `register`, update `login(identifier, password)`, and create `src/lib/admin.ts` with usage/admin helpers.

- [ ] **Step 4: Run frontend API tests and verify GREEN**

Run: `npm test -- src/lib/auth.test.ts src/lib/admin.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing component tests**

Update `LoginPage.test.tsx` to expect:

```ts
expect(html).toContain('邮箱或电话')
expect(html).toContain('创建账号')
expect(html).toContain('name="identifier"')
```

Create `AdminPanel.test.tsx` and `UsagePanel.test.tsx` render-to-static-markup smoke tests that check titles `管理总览`, `用户管理`, `使用统计`, and `我的统计`.

- [ ] **Step 6: Run component tests and verify RED**

Run: `npm test -- src/components/LoginPage.test.tsx src/components/AdminPanel.test.tsx src/components/UsagePanel.test.tsx`

Expected: FAIL because components are not updated or missing.

- [ ] **Step 7: Implement login/register UI and panels**

Build:

- `LoginPage` with mode toggle, login form, register form.
- `AdminPanel` with tabs for summary/users/usage, loading state, user rows, status button, reset password input.
- `UsagePanel` with metric cards and recent event list.
- `Header` buttons for workspace/admin/usage.
- `App` view state and role-aware rendering.

- [ ] **Step 8: Run component tests and verify GREEN**

Run: `npm test -- src/components/LoginPage.test.tsx src/components/AdminPanel.test.tsx src/components/UsagePanel.test.tsx`

Expected: PASS.

- [ ] **Step 9: Run app-related tests**

Run: `npm test -- src/lib/auth.test.ts src/lib/admin.test.ts src/components/LoginPage.test.tsx src/components/AdminPanel.test.tsx src/components/UsagePanel.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

Run:

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/lib/admin.ts src/lib/admin.test.ts src/components/LoginPage.tsx src/components/LoginPage.test.tsx src/components/Header.tsx src/components/AdminPanel.tsx src/components/AdminPanel.test.tsx src/components/UsagePanel.tsx src/components/UsagePanel.test.tsx src/App.tsx
git commit -m "feat: add user and admin frontend"
```

## Task 6: Documentation, Full Verification, Browser Acceptance

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/production-deploy.md`

- [ ] **Step 1: Update docs**

Document:

- Registration is enabled for ordinary users.
- Login accepts email or phone plus password.
- First configured admin is bootstrapped into SQLite.
- Admin can manage users, reset passwords, and view all usage.
- Ordinary users can view their own usage.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Start local app**

Run: `npm run dev:app`

Expected: Vite and API server print local URLs.

- [ ] **Step 5: Validate with in-app browser**

Use in-app browser to verify:

- Register with email and password; user enters workspace.
- Logout, then login with email.
- Register or update a user with phone, then login with phone.
- Normal user opens `统计` and sees personal stats.
- Admin opens `管理`, sees users and usage.
- Admin resets user password; user can log in with the new password.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add .env.example README.md docs/production-deploy.md
git commit -m "docs: describe user system admin workflow"
```

## Self-Review

- Spec coverage: registration, email-or-phone login, immediate active users, admin management, reset password, all-user usage, own usage, API permissions, docs, tests, and browser acceptance are covered.
- Placeholder scan: no placeholder markers or unspecified implementation steps remain.
- Type consistency: frontend `AuthSession.user.id` maps to server session `userId`; roles use `admin | user`; statuses use `active | disabled`; usage summaries use `calls`, `successes`, `failures`, `generatedImages`, `totalTokens`, and `lastUsedAt`.
