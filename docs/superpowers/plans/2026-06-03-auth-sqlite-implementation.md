# Auth SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-admin login from `.env` and move browser IndexedDB persistence behind a local SQLite-backed API.

**Architecture:** Add a small Node HTTP server under `server/` with HMAC-signed httpOnly sessions and `better-sqlite3` storage. Keep the React app intact by preserving `src/lib/db.ts` exports and changing their implementation to call `/api/*`. Gate `App` behind `/api/auth/me` and show a compact login screen before loading the store.

**Tech Stack:** Node ESM, `better-sqlite3`, Vite proxy, React 19, Zustand, Vitest.

---

## File Map

- Create `server/auth.mjs`: signed session cookie creation and verification.
- Create `server/database.mjs`: SQLite schema and CRUD methods for tasks, images, thumbnails, and planner sessions.
- Create `server/app.mjs`: native Node HTTP request handler for auth and data APIs.
- Create `server/server.mjs`: load `.env`, create storage, serve API and built frontend.
- Create `scripts/dev-app.mjs`: cross-platform launcher for API server plus Vite.
- Create `.env.example`: admin and SQLite environment template.
- Modify `.gitignore`: ignore local SQLite data.
- Modify `vite.config.ts`: proxy `/api` to the local API server in dev.
- Modify `package.json` / `package-lock.json`: add `better-sqlite3` and server scripts while preserving existing package changes.
- Modify `src/lib/db.ts`: replace IndexedDB low-level access with `/api` calls and keep thumbnail generation/hash helpers.
- Create `src/lib/auth.ts`: frontend auth API helpers.
- Create `src/lib/auth.test.ts`: auth helper tests with mocked `fetch`.
- Create `src/lib/serverDb.test.ts`: db helper tests with mocked `fetch`.
- Create `src/components/LoginPage.tsx`: login screen.
- Modify `src/App.tsx`: check session before `initStore`, render login/loading/workspace states.
- Modify `src/components/Header.tsx` and `src/components/icons.tsx`: show current admin and logout action.
- Create `server/*.test.mjs`: server auth, API auth gate, and SQLite CRUD tests.
- Modify `README.md`: document `.env`, `npm run dev:app`, login, and SQLite storage.

## Task 1: Server Auth

**Files:**
- Test: `server/auth.test.mjs`
- Create: `server/auth.mjs`

- [ ] Write failing tests for signed cookie login/logout behavior.
- [ ] Run `npm test -- server/auth.test.mjs` and verify it fails because `server/auth.mjs` is missing.
- [ ] Implement HMAC-signed session token helpers and cookie parsing.
- [ ] Run `npm test -- server/auth.test.mjs` and verify it passes.

## Task 2: SQLite Store

**Files:**
- Test: `server/database.test.mjs`
- Create: `server/database.mjs`

- [ ] Write failing tests for task, image, thumbnail, and planner-session CRUD against a temporary SQLite file.
- [ ] Run `npm test -- server/database.test.mjs` and verify it fails because storage is missing.
- [ ] Add `better-sqlite3` and implement schema plus CRUD methods.
- [ ] Run `npm test -- server/database.test.mjs` and verify it passes.

## Task 3: HTTP API

**Files:**
- Test: `server/app.test.mjs`
- Create: `server/app.mjs`
- Create: `server/server.mjs`

- [ ] Write failing tests for `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, 401 data gating, and one task API round trip.
- [ ] Run `npm test -- server/app.test.mjs` and verify it fails because HTTP app is missing.
- [ ] Implement native Node request handler and route the auth/data APIs.
- [ ] Run `npm test -- server/app.test.mjs` and verify it passes.

## Task 4: Frontend API Clients

**Files:**
- Test: `src/lib/auth.test.ts`
- Test: `src/lib/serverDb.test.ts`
- Create: `src/lib/auth.ts`
- Modify: `src/lib/db.ts`

- [ ] Write failing tests for auth helper calls and `db.ts` calls using mocked `fetch`.
- [ ] Run `npm test -- src/lib/auth.test.ts src/lib/serverDb.test.ts` and verify it fails because helpers still do not call the server.
- [ ] Implement auth helpers and replace IndexedDB transactions with `/api` requests while keeping existing exported function names.
- [ ] Run `npm test -- src/lib/auth.test.ts src/lib/serverDb.test.ts` and verify it passes.

## Task 5: Login UI And App Gate

**Files:**
- Create: `src/components/LoginPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/icons.tsx`

- [ ] Add a compact login page with username/password fields and submit state.
- [ ] Gate `App` initialization on `/api/auth/me`; only call `initStore()` after authentication.
- [ ] Add logout to Header and return to login state after `/api/auth/logout`.
- [ ] Run `npm test` to catch regressions.

## Task 6: Dev Runtime And Docs

**Files:**
- Create: `scripts/dev-app.mjs`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] Add scripts for API server and combined dev startup.
- [ ] Add `/api` Vite proxy to the API server.
- [ ] Add `.env.example` and ignore local SQLite data.
- [ ] Document login and SQLite behavior.
- [ ] Run `npm test` and `npm run build`.
- [ ] Start `npm run dev:app`, open the in-app browser, log in, log out, and verify the real page flow.

## Self-Review

- Spec coverage: single-admin `.env` login, httpOnly cookie sessions, `/api/*` auth gate, SQLite task/image/thumbnail/planner storage, startup scripts, docs, tests, and browser validation are covered.
- Placeholder scan: no task uses TBD/TODO/fill-in placeholders.
- Type consistency: frontend exports stay compatible with existing `store.ts`; server modules are ESM `.mjs`; tests use Vitest.
