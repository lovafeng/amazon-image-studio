# Admin Operations Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin operations statistics panel that reports the project's north-star production metrics from existing workspaces, tasks, and usage data.

**Architecture:** The backend exposes `GET /api/admin/operations` and computes an aggregate payload from all users' product workspaces, tasks, and usage summaries. The frontend adds a new AdminPanel tab and renders cards for north-star, funnel, efficiency, stability, cost, and quality metrics. No new event table is introduced in this first version.

**Tech Stack:** Node HTTP server, SQLite storage wrapper, React 19, TypeScript, Vitest.

---

### Task 1: Backend Operations Summary

**Files:**
- Modify: `server/database.mjs`
- Modify: `server/app.mjs`
- Test: `server/app.test.mjs`

- [ ] **Step 1: Write failing API test**

Add a test that seeds two users, product workspaces, tasks, and usage events, then asserts `/api/admin/operations` returns aggregate counts such as `northStar.completedImageSets`, `funnel.workspaces`, `stability.imageTaskSuccessRate`, and `cost.totalTokens`.

- [ ] **Step 2: Run backend test to verify RED**

Run: `npm test -- server/app.test.mjs -t "returns admin operations statistics"`

Expected: FAIL with 404 or missing endpoint.

- [ ] **Step 3: Implement minimal backend**

Add storage method `getAllUserProductWorkspaces()` mirroring `getAllUserTasks()`. Add `buildAdminOperationsSummary(storage)` in `server/app.mjs`, then wire `GET /api/admin/operations`.

- [ ] **Step 4: Run backend test to verify GREEN**

Run: `npm test -- server/app.test.mjs -t "returns admin operations statistics"`

Expected: PASS.

### Task 2: Frontend API Types

**Files:**
- Modify: `src/lib/admin.ts`
- Test: `src/lib/admin.test.ts`

- [ ] **Step 1: Write failing helper test**

Assert `getAdminOperations()` fetches `/api/admin/operations` with same-origin credentials.

- [ ] **Step 2: Run helper test to verify RED**

Run: `npm test -- src/lib/admin.test.ts --runInBand`

Expected: FAIL because `getAdminOperations` is not exported.

- [ ] **Step 3: Implement minimal helper**

Add `AdminOperationsSummary` interfaces and `getAdminOperations()`.

- [ ] **Step 4: Run helper test to verify GREEN**

Run: `npm test -- src/lib/admin.test.ts --runInBand`

Expected: PASS.

### Task 3: Admin Panel Tab

**Files:**
- Modify: `src/components/AdminPanel.tsx`
- Test: `src/components/AdminPanel.test.tsx`

- [ ] **Step 1: Write failing render test**

Assert static markup includes the new `运营统计` tab and key labels such as `北极星指标`, `生产漏斗`, and `可上架商品图套`.

- [ ] **Step 2: Run component test to verify RED**

Run: `npm test -- src/components/AdminPanel.test.tsx --runInBand`

Expected: FAIL because the tab does not exist.

- [ ] **Step 3: Implement minimal tab UI**

Load operations data with the existing admin data fetch, add tab value `operations`, and render metric cards/tables with empty-state-safe values.

- [ ] **Step 4: Run component test to verify GREEN**

Run: `npm test -- src/components/AdminPanel.test.tsx --runInBand`

Expected: PASS.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
或分别运行：
npm test -- server/app.test.mjs -t "operations|usage|tasks"
npm test -- src/lib/admin.test.ts src/components/AdminPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.
