# Production Guidance And Style Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-workflow production guidance, realistic progress expectations, reusable style boards, and clearer gallery reuse actions for Amazon image production.

**Architecture:** Keep the feature frontend-only and reuse existing planner sessions, task records, image cache, and Zustand store. Add small pure modules for stage/ETA derivation and style-board extraction, then connect focused UI components into `AmazonPlanner`, `TaskCard`, and `DetailModal`.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Vite, Tailwind CSS.

---

## File Structure

- Create `src/lib/plannerProductionGuide.ts`: pure stage derivation, ETA text, and batch task summaries.
- Create `src/lib/plannerProductionGuide.test.ts`: unit tests for stage, ETA, and batch aggregation.
- Create `src/lib/styleReferenceLibrary.ts`: pure extraction and ranking of reusable style-board references from planner sessions.
- Create `src/lib/styleReferenceLibrary.test.ts`: unit tests for sorting, dedupe, and limits.
- Create `src/components/PlannerProductionGuide.tsx`: compact production stage rail and primary action card.
- Create `src/components/PlannerProductionGuide.test.tsx`: static rendering test for stage/ETA UI.
- Create `src/components/StyleReferenceLibrary.tsx`: history style-board strip with preview, use-current-style, and restore actions.
- Create `src/components/StyleReferenceLibrary.test.tsx`: static rendering test for reusable style cards.
- Create `src/components/TaskReuseMenu.tsx`: shared explicit reuse action menu for task card and detail modal.
- Create `src/components/TaskReuseMenu.test.tsx`: static rendering test for action availability.
- Modify `src/types.ts`: add optional planner/style metadata fields and selected style reference type.
- Modify `src/store.ts`: add a small gallery-to-planner style reference request and preserve new optional task category metadata.
- Modify `src/components/AmazonPlanner.tsx`: consume selected style reference, render production guide, render style reference library, write planner metadata on submit.
- Modify `src/components/TaskCard.tsx`: render shared reuse menu.
- Modify `src/components/TaskGrid.tsx`: pass reuse handlers that add output images to input references or request current style.
- Modify `src/components/DetailModal.tsx`: render shared reuse menu with the same behavior.

## Execution Notes

- The current branch is `codex-ljj/new-user-onboarding`, not `main` or `master`.
- The worktree already contains many unrelated uncommitted changes. Do not revert them. Stage only files changed by this plan.
- The user requested no intermediate confirmations. Use inline execution rather than subagents.
- Follow the repo's current fail-fast style. Do not add broad fallback paths or defensive wrappers.

---

### Task 1: Pure Production Guide Logic

**Files:**
- Create: `src/lib/plannerProductionGuide.ts`
- Create: `src/lib/plannerProductionGuide.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/plannerProductionGuide.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  deriveProductionGuideState,
  getProductionEstimate,
  summarizePlannerBatchTasks,
} from './plannerProductionGuide'
import type { TaskRecord } from '../types'

function task(status: TaskRecord['status'], batchId = 'batch-1'): TaskRecord {
  return {
    id: `${status}-${Math.random()}`,
    prompt: 'prompt',
    params: { size: '1024x1024', quality: 'auto', output_format: 'png', output_compression: 100, n: 1 },
    apiProvider: 'openai',
    apiMode: 'images',
    inputImageIds: [],
    outputImages: status === 'done' ? ['img-1'] : [],
    status,
    error: status === 'error' ? 'failed' : null,
    createdAt: 1,
    finishedAt: status === 'running' ? null : 2,
    elapsed: status === 'running' ? null : 1000,
    category: { workflow: 'amazon-listing', plannerBatchId: batchId },
  }
}

describe('planner production guide', () => {
  it('derives the next stage from planner state', () => {
    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: false,
      hasListingText: false,
      hasPlanOptions: false,
      needsStyleReference: false,
      hasStyleReference: false,
      hasSelectedPlan: false,
      hasRelatedTasks: false,
    }).currentStageId).toBe('configure-api')

    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: true,
      hasListingText: true,
      hasPlanOptions: true,
      needsStyleReference: true,
      hasStyleReference: false,
      hasSelectedPlan: true,
      hasRelatedTasks: false,
    }).currentStageId).toBe('style')

    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: true,
      hasListingText: true,
      hasPlanOptions: true,
      needsStyleReference: true,
      hasStyleReference: true,
      hasSelectedPlan: true,
      hasRelatedTasks: true,
    }).currentStageId).toBe('review-reuse')
  })

  it('returns realistic ETA text by mode and phase', () => {
    expect(getProductionEstimate({ phase: 'planning', mode: 'listing', resolution: '2k', elapsedSeconds: 65 }).expectedRange).toBe('通常 1-3 分钟')
    expect(getProductionEstimate({ phase: 'planning', mode: 'dsp', resolution: '2k', elapsedSeconds: 181 }).statusTone).toBe('long')
    expect(getProductionEstimate({ phase: 'generation', mode: 'aplus', resolution: '4k', elapsedSeconds: 120 }).expectedRange).toBe('通常 2-5 分钟')
  })

  it('summarizes batch generation tasks by plannerBatchId', () => {
    const summary = summarizePlannerBatchTasks([
      task('running'),
      task('done'),
      task('error'),
      task('done', 'other-batch'),
    ], 'batch-1')

    expect(summary).toEqual({ total: 3, running: 1, done: 1, error: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/plannerProductionGuide.test.ts
```

Expected: FAIL because `src/lib/plannerProductionGuide.ts` does not exist.

- [ ] **Step 3: Implement pure helper**

Create `src/lib/plannerProductionGuide.ts` with exported stage ids, `deriveProductionGuideState`, `getProductionEstimate`, and `summarizePlannerBatchTasks`.

The public signatures must be:

```ts
import type { TaskRecord } from '../types'
import type { AmazonPlannerMode } from './listingPlanner'

export type ProductionStageId =
  | 'configure-api'
  | 'prepare-input'
  | 'plan'
  | 'style'
  | 'select-plan'
  | 'submit'
  | 'review-reuse'

export interface ProductionGuideInput {
  hasUsablePlannerProfile: boolean
  hasListingText: boolean
  hasPlanOptions: boolean
  needsStyleReference: boolean
  hasStyleReference: boolean
  hasSelectedPlan: boolean
  hasRelatedTasks: boolean
}

export interface ProductionEstimateInput {
  phase: 'planning' | 'style' | 'generation' | 'batch'
  mode: AmazonPlannerMode
  resolution: '2k' | '4k'
  elapsedSeconds?: number
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/lib/plannerProductionGuide.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plannerProductionGuide.ts src/lib/plannerProductionGuide.test.ts
git commit -m "feat: add planner production guide logic"
```

---

### Task 2: Pure Style Reference Library

**Files:**
- Create: `src/lib/styleReferenceLibrary.ts`
- Create: `src/lib/styleReferenceLibrary.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/styleReferenceLibrary.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { buildStyleReferenceLibrary } from './styleReferenceLibrary'
import type { AmazonPlannerSession } from '../types'

function session(overrides: Partial<AmazonPlannerSession>): AmazonPlannerSession {
  return {
    id: overrides.id ?? 'session-1',
    title: overrides.title ?? 'Title',
    mode: overrides.mode ?? 'listing',
    aPlusType: 'standard-large',
    resolution: '2k',
    listingText: '',
    referenceImageIds: [],
    draft: {
      productTitle: overrides.draft?.productTitle ?? 'ThermoMaven Probe',
      category: '',
      brand: '',
      color: '',
      material: '',
      audience: '',
      sellingPoints: '',
      packageIncludes: '',
      scene: '',
      forbidden: '',
    },
    seriesStyleGuides: { listing: '', aplus: '', dsp: '' },
    styleCandidates: [
      { label: 'Clean Retail', description: 'bright', prompt: 'prompt', negativePrompt: '' },
      { label: 'Dark Tech', description: 'dark', prompt: 'prompt', negativePrompt: '' },
    ],
    styleImages: overrides.styleImages ?? [{ candidateIndex: 0, imageId: 'style-a' }],
    selectedStyleIndex: overrides.selectedStyleIndex ?? 0,
    imagePlans: [],
    aPlusPlans: [],
    dspPlans: [],
    selectedPlanIndex: null,
    selectedAPlusPlanIndex: null,
    selectedDspPlanIndex: null,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  }
}

describe('style reference library', () => {
  it('prioritizes same product and mode references', () => {
    const items = buildStyleReferenceLibrary({
      sessions: [
        session({ id: 'old', mode: 'dsp', draft: { productTitle: 'Other' } as AmazonPlannerSession['draft'], updatedAt: 10, styleImages: [{ candidateIndex: 0, imageId: 'style-old' }] }),
        session({ id: 'match', mode: 'listing', updatedAt: 2, styleImages: [{ candidateIndex: 1, imageId: 'style-match' }] }),
      ],
      currentMode: 'listing',
      productTitle: 'ThermoMaven Probe',
    })

    expect(items[0]).toMatchObject({ imageId: 'style-match', label: 'Dark Tech', plannerSessionId: 'match' })
  })

  it('dedupes by image id and limits the list', () => {
    const items = buildStyleReferenceLibrary({
      sessions: [
        session({ id: 'new', updatedAt: 3, styleImages: [{ candidateIndex: 0, imageId: 'same-img' }] }),
        session({ id: 'old', updatedAt: 2, styleImages: [{ candidateIndex: 0, imageId: 'same-img' }] }),
      ],
      currentMode: 'listing',
      productTitle: 'ThermoMaven Probe',
      limit: 1,
    })

    expect(items).toHaveLength(1)
    expect(items[0].plannerSessionId).toBe('new')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/styleReferenceLibrary.test.ts
```

Expected: FAIL because `src/lib/styleReferenceLibrary.ts` does not exist.

- [ ] **Step 3: Add selected style reference type**

Modify `src/types.ts`:

```ts
export interface AmazonPlannerSelectedStyleReference {
  imageId: string
  label: string
  description?: string
  source: 'current-candidate' | 'planner-history' | 'gallery'
  candidateIndex?: number
  plannerSessionId?: string
}
```

Also add optional fields inside `TaskRecord['category']`:

```ts
plannerSessionId?: string
plannerBatchId?: string
styleReferenceLabel?: string
```

- [ ] **Step 4: Implement style library**

Create `src/lib/styleReferenceLibrary.ts` with:

```ts
import type { AmazonPlannerSelectedStyleReference, AmazonPlannerSession } from '../types'
import type { AmazonPlannerMode } from './listingPlanner'

export interface StyleReferenceLibraryItem extends AmazonPlannerSelectedStyleReference {
  productTitle: string
  mode: AmazonPlannerMode
  updatedAt: number
}

export function buildStyleReferenceLibrary(options: {
  sessions: AmazonPlannerSession[]
  currentMode: AmazonPlannerMode
  productTitle: string
  limit?: number
}): StyleReferenceLibraryItem[] {
  // implementation in task
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- src/lib/styleReferenceLibrary.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/styleReferenceLibrary.ts src/lib/styleReferenceLibrary.test.ts
git commit -m "feat: add style reference library logic"
```

---

### Task 3: Production Guide UI Component

**Files:**
- Create: `src/components/PlannerProductionGuide.tsx`
- Create: `src/components/PlannerProductionGuide.test.tsx`
- Modify: `src/components/AmazonPlanner.tsx`

- [ ] **Step 1: Write failing component test**

Create `src/components/PlannerProductionGuide.test.tsx` with:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PlannerProductionGuide from './PlannerProductionGuide'

describe('PlannerProductionGuide', () => {
  it('renders current stage, ETA and primary action', () => {
    const html = renderToStaticMarkup(
      <PlannerProductionGuide
        currentStageId="style"
        estimate={{ label: '风格板', expectedRange: '通常 1-3 分钟', statusTone: 'normal', note: '生成 3 张低清风格板' }}
        primaryActionLabel="生成风格板"
        onPrimaryAction={() => {}}
      />,
    )

    expect(html).toContain('生产进度')
    expect(html).toContain('生成风格板')
    expect(html).toContain('通常 1-3 分钟')
    expect(html).toContain('选择风格')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/PlannerProductionGuide.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement component**

Create `PlannerProductionGuide.tsx` using `PRODUCTION_STAGES` from `plannerProductionGuide.ts`. It must render:

- title `生产进度`
- all stage labels
- current stage highlight
- ETA label and note
- one button with `primaryActionLabel`

- [ ] **Step 4: Wire component into AmazonPlanner**

Modify `AmazonPlanner.tsx`:

- Import `PlannerProductionGuide`, `deriveProductionGuideState`, and `getProductionEstimate`.
- Compute `productionGuideState` near existing `guideState`.
- Render the component above the planner body action controls.
- Primary action maps to existing functions: settings, scroll input, `runPlanner`, `generateStyleImages`, focus style, `handlePrimarySubmitAction`, or scroll history.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/components/PlannerProductionGuide.test.tsx src/components/AmazonPlanner.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plannerProductionGuide.ts src/components/PlannerProductionGuide.tsx src/components/PlannerProductionGuide.test.tsx src/components/AmazonPlanner.tsx
git commit -m "feat: show planner production guide"
```

---

### Task 4: Style Reference Library UI And Selected Style Reference

**Files:**
- Create: `src/components/StyleReferenceLibrary.tsx`
- Create: `src/components/StyleReferenceLibrary.test.tsx`
- Modify: `src/components/AmazonPlanner.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing component test**

Create `src/components/StyleReferenceLibrary.test.tsx` with:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StyleReferenceLibrary from './StyleReferenceLibrary'

describe('StyleReferenceLibrary', () => {
  it('renders reusable style references', () => {
    const html = renderToStaticMarkup(
      <StyleReferenceLibrary
        items={[{
          imageId: 'img-1',
          label: 'Clean Retail',
          description: 'Bright retail layout',
          source: 'planner-history',
          plannerSessionId: 'session-1',
          productTitle: 'Probe',
          mode: 'listing',
          updatedAt: 1,
        }]}
        selectedImageId="img-1"
        imageSrcById={{ 'img-1': 'data:image/png;base64,aaa' }}
        onUseStyle={() => {}}
        onPreview={() => {}}
        onRestoreSession={() => {}}
      />,
    )

    expect(html).toContain('复用已生成风格板')
    expect(html).toContain('Clean Retail')
    expect(html).toContain('用作当前风格')
    expect(html).toContain('已使用')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/StyleReferenceLibrary.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement component**

Create `StyleReferenceLibrary.tsx`. Use a compact grid of thumbnail cards, no nested cards. Empty list returns `null`.

- [ ] **Step 4: Add selected style reference state**

Modify `AmazonPlanner.tsx`:

- Add `selectedStyleReference` state.
- When selecting a current candidate, set `selectedStyleReference` with source `current-candidate`.
- Replace `selectedStyleImage?.imageId` checks with `selectedStyleReference?.imageId` where submitting style reference matters.
- Keep `selectedStyleIndex` for existing current-candidate selection and old session restore.
- Save and restore `selectedStyleReference` in planner session when possible.

- [ ] **Step 5: Render historical style library**

Modify `AmazonPlanner.tsx`:

- Build items using `buildStyleReferenceLibrary`.
- Resolve thumbnails already available from restored style image data or `ensureImageThumbnailCached`.
- Render `StyleReferenceLibrary` below current style candidates.
- `onUseStyle` sets `selectedStyleReference` without clearing current candidates.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/styleReferenceLibrary.test.ts src/components/StyleReferenceLibrary.test.tsx src/components/AmazonPlanner.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/styleReferenceLibrary.ts src/components/StyleReferenceLibrary.tsx src/components/StyleReferenceLibrary.test.tsx src/components/AmazonPlanner.tsx
git commit -m "feat: reuse historical style boards"
```

---

### Task 5: Shared Task Reuse Menu

**Files:**
- Create: `src/components/TaskReuseMenu.tsx`
- Create: `src/components/TaskReuseMenu.test.tsx`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/TaskGrid.tsx`
- Modify: `src/components/DetailModal.tsx`
- Modify: `src/store.ts`

- [ ] **Step 1: Write failing component test**

Create `src/components/TaskReuseMenu.test.tsx` with:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TaskReuseMenu from './TaskReuseMenu'

describe('TaskReuseMenu', () => {
  it('shows explicit reuse actions for done tasks', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages
        canRestorePlannerSession
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).toContain('复用')
    expect(html).toContain('复用参数')
    expect(html).toContain('输出图作参考')
    expect(html).toContain('用作当前风格')
    expect(html).toContain('恢复所属策划')
  })

  it('disables output actions without generated images', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages={false}
        canRestorePlannerSession={false}
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).toContain('disabled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/TaskReuseMenu.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Add store request state**

Modify `AppState` in `src/store.ts`:

```ts
galleryStyleReferenceRequest: { imageId: string; label: string; requestedAt: number } | null
setGalleryStyleReferenceRequest: (request: AppState['galleryStyleReferenceRequest']) => void
```

Initialize in the store:

```ts
galleryStyleReferenceRequest: null,
setGalleryStyleReferenceRequest: (galleryStyleReferenceRequest) => set({ galleryStyleReferenceRequest }),
```

- [ ] **Step 4: Implement TaskReuseMenu**

Create `TaskReuseMenu.tsx` as a small dropdown controlled by local state. It renders one visible button labeled `复用` and action buttons inside the menu.

- [ ] **Step 5: Wire TaskGrid handlers**

Modify `TaskGrid.tsx`:

- Add helper `addTaskOutputsAsInputImages(task)`.
- It reads each output image with `ensureImageCached`, appends missing images to `inputImages`, then calls `setInputImages`.
- Add helper `useTaskOutputAsStyle(task)` that sets `galleryStyleReferenceRequest` with first output image id and task category label.
- Pass handlers into `TaskCard`.

- [ ] **Step 6: Wire TaskCard**

Modify `TaskCard.tsx` props to include:

```ts
onUseOutputAsReference: () => void
onUseAsStyle: () => void
onRestorePlannerSession?: () => void
canRestorePlannerSession?: boolean
```

Render `TaskReuseMenu` in the action area and keep existing icon actions for compatibility.

- [ ] **Step 7: Wire DetailModal**

Modify `DetailModal.tsx` to render `TaskReuseMenu` for the current task with the same handlers.

- [ ] **Step 8: Run tests**

Run:

```bash
npm test -- src/components/TaskReuseMenu.test.tsx src/components/TaskCard.test.tsx src/components/DetailModal.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/store.ts src/components/TaskReuseMenu.tsx src/components/TaskReuseMenu.test.tsx src/components/TaskCard.tsx src/components/TaskGrid.tsx src/components/DetailModal.tsx
git commit -m "feat: add explicit task reuse menu"
```

---

### Task 6: Planner Metadata, Batch Progress, And Gallery Style Requests

**Files:**
- Modify: `src/components/AmazonPlanner.tsx`
- Modify: `src/lib/plannerProductionGuide.ts`
- Modify: `src/lib/plannerProductionGuide.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add metadata tests**

Extend `src/components/AmazonPlanner.test.tsx` raw-source tests with assertions that:

```ts
expect(amazonPlannerSource).toContain('plannerSessionId: currentPlannerSessionId')
expect(amazonPlannerSource).toContain('plannerBatchId')
expect(amazonPlannerSource).toContain('galleryStyleReferenceRequest')
expect(amazonPlannerSource).toContain('setGalleryStyleReferenceRequest(null)')
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/AmazonPlanner.test.tsx
```

Expected: FAIL until metadata is wired.

- [ ] **Step 3: Write planner metadata on submit**

Modify all AmazonPlanner `category` construction paths:

- Single submit: include `plannerSessionId: currentPlannerSessionId ?? undefined` and `styleReferenceLabel`.
- Batch submit: create one `plannerBatchId` before building jobs, include it in every batch job category.

- [ ] **Step 4: Consume gallery style requests**

In `AmazonPlanner.tsx`:

- Read `galleryStyleReferenceRequest` and `setGalleryStyleReferenceRequest` from store.
- Add an effect that sets `selectedStyleReference` with source `gallery`, then clears the request.
- Scroll to the style board section and toast `已将图库图片用作当前风格` after consuming the request.

- [ ] **Step 5: Render batch generation summary**

Use `summarizePlannerBatchTasks(tasks, activePlannerBatchId)` to show:

```text
生成进度：运行中 N / 已完成 M / 失败 K
```

Only show this when a batch id exists and at least one task is associated with it.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/plannerProductionGuide.test.ts src/components/AmazonPlanner.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/plannerProductionGuide.ts src/lib/plannerProductionGuide.test.ts src/components/AmazonPlanner.tsx src/components/AmazonPlanner.test.tsx
git commit -m "feat: track planner style and batch metadata"
```

---

### Task 7: Final Verification And Browser QA

**Files:**
- Verify changed files only.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/plannerProductionGuide.test.ts src/lib/styleReferenceLibrary.test.ts src/components/PlannerProductionGuide.test.tsx src/components/StyleReferenceLibrary.test.tsx src/components/TaskReuseMenu.test.tsx src/components/AmazonPlanner.test.tsx src/components/TaskCard.test.tsx src/components/DetailModal.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start local app**

Run:

```bash
npm run dev:app
```

Expected: terminal prints a local Vite URL, normally `http://127.0.0.1:5173/`.

- [ ] **Step 4: Verify in in-app browser**

Open the local URL with the Browser plugin and verify:

- Amazon panel shows `生产进度`.
- Empty input stage points to preparing product information.
- Style-board area shows current candidates and `复用已生成风格板` when history exists.
- A done task card exposes the explicit `复用` menu.
- Detail modal exposes the same `复用` menu.
- The page has no visible overlap or clipped text at desktop width.

- [ ] **Step 5: Commit any verification fixes**

If browser QA requires CSS or wiring fixes:

```bash
git add <changed-files>
git commit -m "fix: polish production guidance UI"
```

If no fixes are needed, do not create an empty commit.
