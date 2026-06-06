# Image Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the image hot path away from large data URL JSON payloads, reduce gallery/detail rendering work, and keep export/upload paths bounded.

**Architecture:** Store newly written original images and thumbnails as SQLite BLOB resources with metadata in JSON, expose raw blob endpoints, and keep legacy JSON/data URL reads for compatibility. Frontend reads display images through object URLs, renders only visible gallery cards, loads detail images on demand, and exports images one by one instead of materializing every image record.

**Tech Stack:** Node HTTP server, better-sqlite3, React 19, Zustand, Vitest, Vite, fflate.

---

### Task 1: Backend Binary Image Resource API

**Files:**
- Modify: `server/database.mjs`
- Modify: `server/app.mjs`
- Test: `server/database.test.mjs`
- Test: `server/app.test.mjs`

- [ ] **Step 1: Write failing storage tests**

Add tests proving `putImage()` stores binary content separately from `data_url`, `getImageContent()` returns `{ bytes, mimeType }`, old data URL rows remain readable, and deleting images deletes thumbnails.

- [ ] **Step 2: Run storage tests red**

Run: `npm test -- server/database.test.mjs`

Expected before implementation: FAIL because `getImageContent` and BLOB columns do not exist.

- [ ] **Step 3: Implement storage BLOB columns and helpers**

Add nullable BLOB/content metadata columns to `images` and `thumbnails`, migrate existing databases with `alter table`, parse incoming data URLs into `Buffer`, store new rows with empty `data_url`, and reconstruct data URLs only for legacy JSON reads.

- [ ] **Step 4: Run storage tests green**

Run: `npm test -- server/database.test.mjs`

Expected after implementation: PASS.

- [ ] **Step 5: Write failing HTTP blob endpoint tests**

Add tests for `GET /api/images/:id/blob` and `GET /api/thumbnails/:id/blob` after login. Assert status 200, image content type, and raw bytes. Assert missing image returns 404.

- [ ] **Step 6: Run HTTP tests red**

Run: `npm test -- server/app.test.mjs`

Expected before route implementation: FAIL with 404.

- [ ] **Step 7: Implement raw blob HTTP routes**

Add binary response helper in `server/app.mjs`; match `/api/images/:id/blob` and `/api/thumbnails/:id/blob` before generic `/api/images/:id` and `/api/thumbnails/:id`.

- [ ] **Step 8: Run HTTP tests green**

Run: `npm test -- server/app.test.mjs`

Expected after implementation: PASS.

### Task 2: Frontend Object URL Image Client

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/store.ts`
- Modify: `src/lib/downloadImages.ts`
- Test: `src/lib/serverDb.test.ts`
- Test: `src/store.test.ts`

- [ ] **Step 1: Write failing tests for blob-first image reads**

Assert image display helpers fetch `/api/images/:id/blob`, create object URLs, reuse cached URLs, and revoke evicted URLs.

- [ ] **Step 2: Implement object URL helpers**

Add `getImageBlob()`, `getThumbnailBlob()`, and store-level `ensureImageUrlCached()` helpers. Keep `ensureImageCached()` for paths that still require data URLs.

- [ ] **Step 3: Replace display/download callers**

Use blob/object URLs for card thumbnails, detail images, lightbox images, and direct downloads. Convert to data URL only for API payloads, canvas editing, mask validation, and import compatibility.

### Task 3: Gallery Virtualization And Detail On-Demand Loading

**Files:**
- Modify: `src/components/TaskGrid.tsx`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/DetailModal.tsx`
- Modify: `src/components/Lightbox.tsx`
- Test: `src/components/TaskCard.test.tsx`
- Test: `src/components/DetailModal.test.tsx`

- [ ] **Step 1: Write failing virtualization test**

Render a large task list and assert only the visible window plus overscan creates `TaskCard` DOM nodes.

- [ ] **Step 2: Implement fixed-row virtual window**

Keep filtering/sorting semantics, calculate column count and row range from container width and scroll offset, render spacer blocks, and leave selection behavior tied to task ids.

- [ ] **Step 3: Write failing detail loading test**

Open a task with many output images and assert only current, previous, and next output ids are requested.

- [ ] **Step 4: Implement detail/lightbox on-demand loading**

Load the current output image and adjacent ids when selected index changes. Do not loop over every `task.outputImages` on modal open.

### Task 4: Thumbnail, Upload, And Export Memory Bounds

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/referenceImagePayload.ts`
- Modify: `src/lib/maskPreprocess.ts`
- Modify: `src/lib/downloadImages.ts`
- Modify: `src/store.ts`
- Test: `src/lib/serverDb.test.ts`
- Test: `src/lib/referenceImagePayload.test.ts`
- Test: `src/lib/maskPreprocess.test.ts`
- Test: `src/store.test.ts`

- [ ] **Step 1: Write failing thumbnail test**

Assert thumbnail creation uses `canvas.toBlob()` and does not call `canvas.toDataURL()` directly.

- [ ] **Step 2: Implement thumbnail `toBlob` path**

Generate thumbnail blobs with WebP quality, convert only the small thumbnail blob to a data URL for the current thumbnail compatibility field, and persist it.

- [ ] **Step 3: Write failing upload resize test**

Assert oversized reference/upload images are reduced to the configured max working edge before being sent into image payload preparation.

- [ ] **Step 4: Implement upload/reference working-size cap**

Reuse existing canvas image helpers where possible and keep the max edge constant explicit.

- [ ] **Step 5: Write failing export test**

Assert export no longer calls `getAllImages()` and instead reads only image ids referenced by tasks/planner sessions, one image at a time.

- [ ] **Step 6: Implement referenced-image export**

Collect referenced image ids from tasks, conversations, and planner sessions, call per-image blob/data helpers sequentially, and add files to the ZIP map without loading unrelated images.

### Task 5: Verification, Browser Acceptance, Commit, Deploy

**Files:**
- No new product files expected.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- server/database.test.mjs server/app.test.mjs src/lib/serverDb.test.ts src/store.test.ts src/components/DetailModal.test.tsx src/components/TaskCard.test.tsx src/lib/referenceImagePayload.test.ts src/lib/maskPreprocess.test.ts`

- [ ] **Step 2: Run full test suite**

Run: `npm test`

- [ ] **Step 3: Build**

Run: `npm run build`

- [ ] **Step 4: Browser acceptance**

Run dev app, open `http://127.0.0.1:5173/` in the in-app browser, verify login/gallery/detail/lightbox/upload/export paths, and inspect that image display requests use `/blob`.

- [ ] **Step 5: Git and deployment**

Stage only intended files, commit, push the current branch, run `npm run deploy:prod`, and verify the deployed service health and image blob route.
