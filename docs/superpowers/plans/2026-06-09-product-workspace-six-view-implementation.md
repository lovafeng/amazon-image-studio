# Product Workspace Six-View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit product workspaces with mandatory confirmed six-view references before Amazon image generation.

**Architecture:** Add a user-owned `product_workspaces` JSON record store parallel to existing planner sessions. Add focused workspace/six-view helper functions, then adapt Amazon Planner to load/save workspaces and submit downstream generation with the confirmed six-view image only.

**Tech Stack:** React 19, Zustand store helpers, TypeScript, Vitest, Node server with better-sqlite3.

---

### Task 1: Product Workspace Storage

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `server/database.mjs`
- Modify: `server/app.mjs`
- Test: `server/database.test.mjs`
- Test: `server/app.test.mjs`
- Test: `src/lib/serverDb.test.ts`

- [ ] Write failing tests for product workspace CRUD and owner isolation.
- [ ] Add `ProductWorkspace` and `ProductWorkspaceSixViewVersion` types.
- [ ] Add client DB helpers: `getAllProductWorkspaces`, `putProductWorkspace`, `deleteProductWorkspace`, `clearProductWorkspaces`.
- [ ] Add `product_workspaces` table, statements, storage methods, and `/api/product-workspaces` route.
- [ ] Run the focused server and client DB tests.

### Task 2: Six-View Helper Module

**Files:**
- Create: `src/lib/productWorkspace.ts`
- Test: `src/lib/productWorkspace.test.ts`
- Modify: `src/lib/listingPlanner.ts`
- Test: `src/lib/listingPlanner.test.ts`

- [ ] Write failing tests for six-view prompt text, version creation, confirmed image lookup, and downstream prompt guard.
- [ ] Implement helpers for six-view prompt building, version creation, confirmed version lookup, and workspace image collection.
- [ ] Add six-view product reference guard text to Listing, A+, and DSP prompt builders.
- [ ] Run focused helper and prompt tests.

### Task 3: Store Import/Export and Image Retention

**Files:**
- Modify: `src/store.ts`
- Test: `src/store.test.ts`

- [ ] Write failing tests proving workspace image ids are retained and exported.
- [ ] Include product workspaces in export/import and image reference retention.
- [ ] Clear product workspaces when task/history data is cleared.
- [ ] Run focused store tests.

### Task 4: Amazon Planner Workspace UI

**Files:**
- Modify: `src/components/AmazonPlanner.tsx`
- Test: `src/components/AmazonPlanner.test.tsx`

- [ ] Write failing tests for workspace terminology, explicit new workspace controls, six-view panel copy, and generation gate copy.
- [ ] Replace planner-session loading/saving UI with product workspace loading/saving UI.
- [ ] Show an entry state when no workspace is active.
- [ ] Add workspace header, save/close controls, and source material persistence.
- [ ] Add six-view version panel with generate/edit/confirm actions.
- [ ] Run focused Amazon Planner tests.

### Task 5: Generation Gating and Submission References

**Files:**
- Modify: `src/components/AmazonPlanner.tsx`
- Modify: `src/types.ts`
- Test: `src/components/AmazonPlanner.test.tsx`

- [ ] Write failing tests proving draft and batch generation require confirmed six-view copy and source text says original references are not submitted by default.
- [ ] Add `productWorkspaceId` and `sixViewVersionId` task category metadata.
- [ ] Disable single and batch generation until a confirmed six-view exists.
- [ ] Submit drafts with the confirmed six-view image as the only product reference, preserving hidden style board behavior.
- [ ] Run focused Amazon Planner tests.

### Task 6: Verification

**Files:**
- No production files expected.

- [ ] Run `npm test -- src/lib/productWorkspace.test.ts src/lib/listingPlanner.test.ts src/components/AmazonPlanner.test.tsx src/store.test.ts src/lib/serverDb.test.ts`.
- [ ] Run `npm test -- server/database.test.mjs server/app.test.mjs`.
- [ ] Run `npm run build`.
- [ ] Start the local app.
- [ ] Use the in-app browser to verify real UI flow: login, create workspace, confirm that generation is gated before six-view confirmation, and inspect that the six-view panel renders correctly.
