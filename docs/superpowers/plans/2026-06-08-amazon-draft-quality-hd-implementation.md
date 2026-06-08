# Amazon Draft Quality HD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Amazon image production into medium-quality draft generation and high-quality final generation while preserving original Listing / A+ / DSP dimensions and compressing AI reference images by stage.

**Architecture:** Add a small Amazon generation helper module for stage, quality, and category predicates. Extend the existing reference-image compression pipeline with a `draft` / `final` stage option, then route Amazon draft/final tasks through it in `store.ts`. Update Amazon Planner to submit drafts by default and add a “制作高清” action for completed Amazon draft tasks through the existing task reuse menu.

**Tech Stack:** React 19, Zustand store, TypeScript, Vitest, existing image API wrappers.

---

## File Structure

- Create `src/lib/amazonGeneration.ts`
  - Owns Amazon generation stage constants, default draft/final params, category predicates, and final-category construction.
  - Keeps stage logic out of UI components and avoids duplicating Amazon workflow checks.

- Create `src/lib/amazonGeneration.test.ts`
  - Tests stage predicates and final category construction.

- Modify `src/types.ts`
  - Adds optional `generationStage` and `draftSourceImageId` fields to `TaskRecord.category`.

- Modify `src/lib/referenceImagePayload.ts`
  - Adds `stage?: 'draft' | 'final'` to payload preparation options.
  - Uses draft compression preset `768/0.72 -> 640/0.65`.
  - Keeps final/default preset `1024/0.82 -> 768/0.72`.

- Modify `src/lib/referenceImagePayload.test.ts`
  - Adds stage-specific compression tests for normal and mask payloads.

- Modify `src/store.ts`
  - Passes reference compression stage from task category to `prepareReferenceImageAndMaskPayload`.
  - Exports `createAmazonFinalImageFromDraft(task, outputImageId?)`.
  - Final generation reuses prompt/category/params, switches stage to final, sets quality high, and appends the selected draft output as reference when possible.

- Modify `src/store.test.ts`
  - Tests draft reference compression stage and final generation setup.

- Modify `src/components/AmazonPlanner.tsx`
  - Uses `quality: medium` for style boards, single draft submit, and batch draft submit.
  - Writes `category.generationStage = 'draft'` for Planner draft jobs.
  - Updates primary labels and progress copy from generic submit to draft/final semantics.
  - Keeps all target sizes unchanged.

- Modify `src/components/AmazonPlanner.test.tsx`
  - Verifies draft quality is medium and target sizes still come from current dimension logic.

- Modify `src/lib/listingPlanner.ts`
  - Removes fixed `1024x1024` wording from style-board prompt requirements.

- Modify `src/lib/listingPlannerApi.ts`
  - Removes fixed `1024x1024` wording from planner schema/instructions.

- Modify `src/lib/listingPlanner.test.ts`
  - Updates style-board prompt copy assertions.

- Modify `src/components/TaskReuseMenu.tsx`
  - Adds optional “制作高清” action.

- Modify `src/components/TaskReuseMenu.test.tsx`
  - Tests the new action visibility/disabled behavior.

- Modify `src/components/TaskCard.tsx`
  - Accepts and forwards final-generation props into `TaskReuseMenu`.

- Modify `src/components/TaskGrid.tsx`
  - Detects Amazon draft tasks and wires `createAmazonFinalImageFromDraft`.

- Modify `src/components/TaskGrid.test.tsx`
  - Verifies the task grid wires Amazon draft tasks to final generation.

- Modify `src/components/DetailModal.tsx`
  - Adds the same final-generation action in the detail modal reuse menu.

- Modify `src/lib/taskHistory.ts`
  - Includes generation stage in search text and exposes a small stage label helper.

- Modify `src/lib/taskHistory.test.ts`
  - Tests stage label/search behavior.

---

## Task 1: Add Amazon Generation Stage Helpers

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/amazonGeneration.ts`
- Create: `src/lib/amazonGeneration.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `src/lib/amazonGeneration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import {
  AMAZON_DRAFT_QUALITY,
  AMAZON_FINAL_QUALITY,
  createAmazonFinalCategory,
  getAmazonGenerationStage,
  getReferencePayloadStageForTask,
  isAmazonDraftTask,
} from './amazonGeneration'

const task = (patch: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 'task-a',
  prompt: 'prompt',
  params: { size: '1024x1024', quality: 'medium', output_format: 'jpeg', output_compression: 70, moderation: 'auto', n: 1 },
  inputImageIds: [],
  outputImages: [],
  status: 'done',
  error: null,
  createdAt: 1,
  finishedAt: 2,
  elapsed: 1,
  ...patch,
})

describe('amazonGeneration', () => {
  it('recognizes Amazon draft tasks and resolves reference compression stage', () => {
    const draftTask = task({
      category: {
        workflow: 'amazon-listing',
        amazonSlot: 'PT01',
        generationStage: 'draft',
      },
    })

    expect(AMAZON_DRAFT_QUALITY).toBe('medium')
    expect(AMAZON_FINAL_QUALITY).toBe('high')
    expect(getAmazonGenerationStage(draftTask)).toBe('draft')
    expect(getReferencePayloadStageForTask(draftTask)).toBe('draft')
    expect(isAmazonDraftTask(draftTask)).toBe(true)
  })

  it('treats old Amazon and non-Amazon tasks as final/reference-default', () => {
    expect(getAmazonGenerationStage(task({ category: { workflow: 'amazon-aplus' } }))).toBe('final')
    expect(getReferencePayloadStageForTask(task({ category: { workflow: 'gallery' } }))).toBe('final')
    expect(isAmazonDraftTask(task({ category: { workflow: 'gallery', generationStage: 'draft' } }))).toBe(false)
  })

  it('builds final category from a draft category and source image', () => {
    expect(createAmazonFinalCategory({
      workflow: 'amazon-dsp',
      productTitle: 'Probe',
      amazonSlot: 'DSP-CUSTOM-300x250',
      plannerSessionId: 'planner-a',
      plannerBatchId: 'batch-a',
      styleReferenceImageId: 'style-a',
      styleReferenceLabel: 'Clean',
      generationStage: 'draft',
    }, 'draft-image-a')).toEqual({
      workflow: 'amazon-dsp',
      productTitle: 'Probe',
      amazonSlot: 'DSP-CUSTOM-300x250',
      plannerSessionId: 'planner-a',
      plannerBatchId: 'batch-a',
      styleReferenceImageId: 'style-a',
      styleReferenceLabel: 'Clean',
      generationStage: 'final',
      draftSourceImageId: 'draft-image-a',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/amazonGeneration.test.ts
```

Expected: FAIL because `src/lib/amazonGeneration.ts` does not exist and `TaskRecord.category` has no `generationStage` / `draftSourceImageId` fields.

- [ ] **Step 3: Add optional task category fields**

Modify `src/types.ts` inside `TaskRecord.category`:

```typescript
    generationStage?: 'draft' | 'final'
    draftSourceImageId?: string
```

The category block should become:

```typescript
  category?: {
    productTitle?: string
    workflow?: TaskWorkflow
    amazonSlot?: string
    aPlusType?: 'standard' | 'standard-large' | 'premium'
    styleReferenceImageId?: string
    plannerSessionId?: string
    plannerBatchId?: string
    styleReferenceLabel?: string
    generationStage?: 'draft' | 'final'
    draftSourceImageId?: string
  }
```

- [ ] **Step 4: Add the helper module**

Create `src/lib/amazonGeneration.ts`:

```typescript
import type { TaskRecord, TaskWorkflow } from '../types'

export type AmazonGenerationStage = 'draft' | 'final'
export type ReferencePayloadStage = AmazonGenerationStage

export const AMAZON_DRAFT_QUALITY = 'medium' as const
export const AMAZON_FINAL_QUALITY = 'high' as const

type TaskCategory = NonNullable<TaskRecord['category']>

function isAmazonWorkflow(workflow: TaskWorkflow | undefined): workflow is 'amazon-listing' | 'amazon-aplus' | 'amazon-dsp' {
  return workflow === 'amazon-listing' || workflow === 'amazon-aplus' || workflow === 'amazon-dsp'
}

export function getAmazonGenerationStage(task: Pick<TaskRecord, 'category'>): AmazonGenerationStage {
  if (!isAmazonWorkflow(task.category?.workflow)) return 'final'
  return task.category?.generationStage === 'draft' ? 'draft' : 'final'
}

export function getReferencePayloadStageForTask(task: Pick<TaskRecord, 'category'>): ReferencePayloadStage {
  return getAmazonGenerationStage(task)
}

export function isAmazonDraftTask(task: Pick<TaskRecord, 'status' | 'category' | 'outputImages'>): boolean {
  return task.status === 'done' &&
    isAmazonWorkflow(task.category?.workflow) &&
    task.category?.generationStage === 'draft' &&
    Boolean(task.outputImages?.length)
}

export function createAmazonFinalCategory(category: TaskCategory, draftSourceImageId: string): TaskCategory {
  return {
    ...category,
    generationStage: 'final',
    draftSourceImageId,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
npm test -- src/lib/amazonGeneration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/amazonGeneration.ts src/lib/amazonGeneration.test.ts
git commit -m "feat: add amazon generation stage helpers"
```

---

## Task 2: Add Stage-Specific Reference Image Compression

**Files:**
- Modify: `src/lib/referenceImagePayload.ts`
- Modify: `src/lib/referenceImagePayload.test.ts`

- [ ] **Step 1: Write failing tests for stage presets**

Add these tests to `describe('prepareReferenceImagePayload', ...)` in `src/lib/referenceImagePayload.test.ts`:

```typescript
  it('uses the draft compression preset when preparing draft reference images', async () => {
    const requests: PlannerReferenceImageCompressionRequest[] = []
    const compressor = vi.fn(async (_dataUrl: string, request: PlannerReferenceImageCompressionRequest) => {
      requests.push(request)
      return dataUrlOfLength(request.maxEdge === 768 ? 90 : 40, 'data:image/webp;base64,')
    })

    const result = await prepareReferenceImagePayload([dataUrlOfLength(200)], {
      stage: 'draft',
      maxPayloadBytes: 80,
      compressor,
    })

    expect(result.pass).toBe('fallback')
    expect(requests).toEqual([
      { maxEdge: 768, quality: 0.72 },
      { maxEdge: 640, quality: 0.65 },
    ])
  })

  it('keeps the final compression preset as the default', async () => {
    const requests: PlannerReferenceImageCompressionRequest[] = []
    const compressor = vi.fn(async (_dataUrl: string, request: PlannerReferenceImageCompressionRequest) => {
      requests.push(request)
      return dataUrlOfLength(40, 'data:image/webp;base64,')
    })

    await prepareReferenceImagePayload([dataUrlOfLength(200)], {
      compressor,
    })

    expect(requests).toEqual([{ maxEdge: 1024, quality: 0.82 }])
  })
```

Add this test to `describe('prepareReferenceImageAndMaskPayload', ...)`:

```typescript
  it('uses the draft compression preset for matched image and mask payloads', async () => {
    const maskRequests: PlannerReferenceImageCompressionRequest[] = []
    const compressor = vi.fn(async () => dataUrlOfLength(40, 'data:image/webp;base64,'))
    const maskCompressor = vi.fn(async (_imageDataUrl: string, _maskDataUrl: string, request: PlannerReferenceImageCompressionRequest) => {
      maskRequests.push(request)
      return {
        imageDataUrl: dataUrlOfLength(50, 'data:image/webp;base64,'),
        maskDataUrl: dataUrlOfLength(30, 'data:image/png;base64,'),
      }
    })

    await prepareReferenceImageAndMaskPayload([dataUrlOfLength(200)], dataUrlOfLength(160), {
      stage: 'draft',
      compressor,
      maskCompressor,
    })

    expect(maskRequests).toEqual([{ maxEdge: 768, quality: 0.72 }])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/lib/referenceImagePayload.test.ts
```

Expected: FAIL because `stage` is not a recognized option and the module always uses `1024/768`.

- [ ] **Step 3: Implement stage presets**

Modify `src/lib/referenceImagePayload.ts`.

Add the stage type and pass-preset type near the top:

```typescript
export type PlannerReferenceImagePayloadStage = 'draft' | 'final'

interface PlannerReferenceImageCompressionPreset {
  primary: PlannerReferenceImageCompressionRequest
  fallback: PlannerReferenceImageCompressionRequest
}
```

Update `PreparePlannerReferenceImagePayloadOptions`:

```typescript
export interface PreparePlannerReferenceImagePayloadOptions {
  signal?: AbortSignal
  maxPayloadBytes?: number
  stage?: PlannerReferenceImagePayloadStage
  compressor?: PlannerReferenceImageCompressor
  maskCompressor?: PlannerReferenceImageMaskCompressor
}
```

Replace the current constants with:

```typescript
const FINAL_PRIMARY_MAX_EDGE = 1024
const FINAL_PRIMARY_QUALITY = 0.82
const FINAL_FALLBACK_MAX_EDGE = 768
const FINAL_FALLBACK_QUALITY = 0.72
const DRAFT_PRIMARY_MAX_EDGE = 768
const DRAFT_PRIMARY_QUALITY = 0.72
const DRAFT_FALLBACK_MAX_EDGE = 640
const DRAFT_FALLBACK_QUALITY = 0.65
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024

const COMPRESSION_PRESETS: Record<PlannerReferenceImagePayloadStage, PlannerReferenceImageCompressionPreset> = {
  draft: {
    primary: { maxEdge: DRAFT_PRIMARY_MAX_EDGE, quality: DRAFT_PRIMARY_QUALITY },
    fallback: { maxEdge: DRAFT_FALLBACK_MAX_EDGE, quality: DRAFT_FALLBACK_QUALITY },
  },
  final: {
    primary: { maxEdge: FINAL_PRIMARY_MAX_EDGE, quality: FINAL_PRIMARY_QUALITY },
    fallback: { maxEdge: FINAL_FALLBACK_MAX_EDGE, quality: FINAL_FALLBACK_QUALITY },
  },
}

function getCompressionPreset(stage: PlannerReferenceImagePayloadStage | undefined): PlannerReferenceImageCompressionPreset {
  return COMPRESSION_PRESETS[stage ?? 'final']
}
```

In `prepareReferenceImagePayload`, after `const compressor = ...`, add:

```typescript
  const compressionPreset = getCompressionPreset(options.stage)
```

Then replace:

```typescript
    { maxEdge: PRIMARY_MAX_EDGE, quality: PRIMARY_QUALITY },
```

with:

```typescript
    compressionPreset.primary,
```

and replace:

```typescript
    { maxEdge: FALLBACK_MAX_EDGE, quality: FALLBACK_QUALITY },
```

with:

```typescript
    compressionPreset.fallback,
```

Do the same inside `prepareReferenceImageAndMaskPayload`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- src/lib/referenceImagePayload.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/referenceImagePayload.ts src/lib/referenceImagePayload.test.ts
git commit -m "feat: compress reference images by generation stage"
```

---

## Task 3: Route Store Submissions Through Draft/Final Stages

**Files:**
- Modify: `src/store.ts`
- Modify: `src/store.test.ts`

- [ ] **Step 1: Write failing tests**

Add imports near the top of `src/store.test.ts` if missing:

```typescript
import { createAmazonFinalImageFromDraft, submitTask, useStore } from './store'
```

Add this test near the existing submit-task tests:

```typescript
it('uses draft reference compression for Amazon draft task submissions', async () => {
  const referencePayload = await import('./lib/referenceImagePayload')
  const prepareSpy = vi.spyOn(referencePayload, 'prepareReferenceImageAndMaskPayload').mockResolvedValue({
    dataUrls: ['data:image/webp;base64,compressed'],
    originalBytes: 1,
    payloadBytes: 1,
    compressedCount: 1,
    pass: 'primary',
    notice: '',
  })

  await putImage({ id: 'image-a', dataUrl: 'data:image/png;base64,YQ==', source: 'upload' })
  useStore.setState({
    prompt: 'Amazon draft prompt',
    inputImages: [{ id: 'image-a', dataUrl: 'data:image/png;base64,YQ==' }],
    params: { ...DEFAULT_PARAMS, size: '1024x1024', quality: 'medium' },
    pendingTaskCategory: {
      mode: 'prompt-match',
      prompt: 'Amazon draft prompt',
      category: {
        workflow: 'amazon-listing',
        amazonSlot: 'PT01',
        generationStage: 'draft',
      },
    },
  })

  await submitTask()

  expect(prepareSpy).toHaveBeenCalledWith(
    expect.any(Array),
    undefined,
    expect.objectContaining({ stage: 'draft' }),
  )
})
```

Add this test for final creation:

```typescript
it('creates a high-quality Amazon final task from a draft output', async () => {
  const submitSpy = vi.spyOn(await import('./store'), 'submitTask').mockResolvedValue(true)
  await putImage({ id: 'reference-a', dataUrl: 'data:image/png;base64,cmVm', source: 'upload' })
  await putImage({ id: 'style-a', dataUrl: 'data:image/png;base64,c3R5bGU=', source: 'generated' })
  await putImage({ id: 'draft-output-a', dataUrl: 'data:image/png;base64,ZHJhZnQ=', source: 'generated' })
  const draftTask = {
    id: 'draft-task-a',
    prompt: 'Amazon draft prompt',
    params: { ...DEFAULT_PARAMS, size: '1024x1024', quality: 'medium' as const },
    inputImageIds: ['reference-a', 'style-a'],
    outputImages: ['draft-output-a'],
    status: 'done' as const,
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    category: {
      workflow: 'amazon-listing' as const,
      amazonSlot: 'PT01',
      styleReferenceImageId: 'style-a',
      plannerSessionId: 'planner-a',
      generationStage: 'draft' as const,
    },
  }

  await createAmazonFinalImageFromDraft(draftTask)

  const state = useStore.getState()
  expect(state.prompt).toBe('Amazon draft prompt')
  expect(state.params).toMatchObject({ size: '1024x1024', quality: 'high' })
  expect(state.inputImages.map((image) => image.id)).toEqual(['reference-a', 'draft-output-a'])
  expect(state.pendingTaskCategory).toMatchObject({
    mode: 'prompt-match',
    category: {
      workflow: 'amazon-listing',
      amazonSlot: 'PT01',
      styleReferenceImageId: 'style-a',
      generationStage: 'final',
      draftSourceImageId: 'draft-output-a',
    },
  })
  expect(submitSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/store.test.ts
```

Expected: FAIL because store does not pass `stage` and `createAmazonFinalImageFromDraft` does not exist.

- [ ] **Step 3: Import helpers**

Modify `src/store.ts` imports:

```typescript
import {
  AMAZON_FINAL_QUALITY,
  createAmazonFinalCategory,
  getReferencePayloadStageForTask,
  isAmazonDraftTask,
} from './lib/amazonGeneration'
```

- [ ] **Step 4: Pass the compression stage into task execution**

In `executeTask`, replace:

```typescript
    const preparedPayload = await prepareReferenceImageAndMaskPayload(inputDataUrls, maskDataUrl)
```

with:

```typescript
    const preparedPayload = await prepareReferenceImageAndMaskPayload(inputDataUrls, maskDataUrl, {
      stage: getReferencePayloadStageForTask(task),
    })
```

- [ ] **Step 5: Export final-generation action**

Add this function near `reuseConfig` / `editOutputs` in `src/store.ts`:

```typescript
export async function createAmazonFinalImageFromDraft(task: TaskRecord, selectedOutputImageId?: string) {
  const {
    setPrompt,
    setParams,
    setInputImages,
    clearMaskDraft,
    setPendingTaskCategory,
    showToast,
  } = useStore.getState()

  if (!isAmazonDraftTask(task)) {
    showToast('只有已完成的 Amazon 草稿任务可以制作高清', 'error')
    return false
  }

  const draftImageId = selectedOutputImageId || task.outputImages[0]
  if (!draftImageId) {
    showToast('草稿图不存在，请重新生成草稿', 'error')
    return false
  }

  const draftDataUrl = await ensureImageCached(draftImageId)
  if (!draftDataUrl) {
    showToast('草稿图不存在，请重新生成草稿', 'error')
    return false
  }

  const hiddenStyleReferenceImageId = task.category?.styleReferenceImageId?.trim()
  const inputImages: InputImage[] = []
  for (const imageId of task.inputImageIds) {
    if (hiddenStyleReferenceImageId && imageId === hiddenStyleReferenceImageId) continue
    const dataUrl = await ensureImageCached(imageId)
    if (dataUrl) inputImages.push({ id: imageId, dataUrl })
  }

  const effectiveStyleReferenceCount = hiddenStyleReferenceImageId && !inputImages.some((image) => image.id === hiddenStyleReferenceImageId) ? 1 : 0
  const canAppendDraft = inputImages.length + effectiveStyleReferenceCount + 1 <= API_MAX_INPUT_IMAGES
  if (canAppendDraft && !inputImages.some((image) => image.id === draftImageId)) {
    inputImages.push({ id: draftImageId, dataUrl: draftDataUrl })
  } else if (!canAppendDraft) {
    showToast('参考图数量已达上限，将不附加草稿图，继续制作高清', 'info')
  }

  clearMaskDraft()
  setInputImages(inputImages)
  setPrompt(task.prompt)
  setParams({
    ...task.params,
    quality: AMAZON_FINAL_QUALITY,
    n: 1,
  })
  setPendingTaskCategory({
    mode: 'prompt-match',
    prompt: task.prompt,
    category: createAmazonFinalCategory(task.category!, draftImageId),
  })

  return submitTask({ apiProfileId: task.apiProfileId })
}
```

- [ ] **Step 6: Run the store tests**

Run:

```bash
npm test -- src/store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store.ts src/store.test.ts
git commit -m "feat: create amazon final tasks from drafts"
```

---

## Task 4: Convert Amazon Planner Submission to Draft Semantics

**Files:**
- Modify: `src/components/AmazonPlanner.tsx`
- Modify: `src/components/AmazonPlanner.test.tsx`

- [ ] **Step 1: Write failing tests**

Add this test to `src/components/AmazonPlanner.test.tsx`:

```typescript
  it('submits Amazon Planner drafts at medium quality without changing target sizes', () => {
    expect(amazonPlannerSource).toContain("generationStage: 'draft'")
    expect(amazonPlannerSource).toContain("quality: AMAZON_DRAFT_QUALITY")
    expect(amazonPlannerSource).toContain('targetSize: listingTargetSize')
    expect(amazonPlannerSource).toContain('targetSize: plan.generationSize')
    expect(amazonPlannerSource).not.toContain("quality: DEFAULT_PARAMS.quality,\n      output_format: DEFAULT_PARAMS.output_format")
  })
```

Add this test:

```typescript
  it('labels the primary Planner action as draft generation', () => {
    expect(amazonPlannerSource).toContain('生成草稿')
    expect(amazonPlannerSource).toContain('草稿已提交')
    expect(amazonPlannerSource).toContain('最终清晰度')
    expect(amazonPlannerSource).not.toContain('提交生成')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/components/AmazonPlanner.test.tsx
```

Expected: FAIL because Planner still uses default quality and generic submit labels.

- [ ] **Step 3: Import draft quality**

Modify imports in `src/components/AmazonPlanner.tsx`:

```typescript
import { AMAZON_DRAFT_QUALITY } from '../lib/amazonGeneration'
```

- [ ] **Step 4: Set draft stage in batch jobs**

In every `category` object returned by `buildBatchGenerateJobs`, add:

```typescript
            generationStage: 'draft',
```

For Listing jobs, the category should include:

```typescript
        category: {
          productTitle: draft.productTitle.trim(),
          workflow: 'amazon-listing',
          amazonSlot: plan.slot,
          plannerSessionId: currentPlannerSessionId ?? undefined,
          generationStage: 'draft',
          ...(plannerBatchId ? { plannerBatchId } : {}),
          ...(requiresStyle ? selectedStyleReferenceCategory : {}),
        },
```

- [ ] **Step 5: Set draft stage and quality for single submit**

In `applyPrompt`, update the pending category:

```typescript
      category: {
        productTitle: draft.productTitle.trim(),
        workflow: plannerMode === 'aplus' ? 'amazon-aplus' : plannerMode === 'dsp' ? 'amazon-dsp' : 'amazon-listing',
        amazonSlot: plannerMode === 'aplus' ? selectedAPlusPlan?.slot : plannerMode === 'dsp' ? selectedDspPlan?.slot : selectedPlan?.slot,
        plannerSessionId: currentPlannerSessionId ?? undefined,
        generationStage: 'draft',
        ...(plannerMode === 'aplus' ? { aPlusType } : {}),
        ...(usesStyleReferenceForActivePlan ? selectedStyleReferenceCategory : {}),
      },
```

Update params:

```typescript
    setParams({
      size: targetSize,
      quality: AMAZON_DRAFT_QUALITY,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      n: 1,
    })
```

- [ ] **Step 6: Set draft quality for batch submit**

Inside `submitAllPlannedImages`, update `setParams`:

```typescript
      setParams({
        size: job.targetSize,
        quality: AMAZON_DRAFT_QUALITY,
        output_format: DEFAULT_PARAMS.output_format,
        output_compression: DEFAULT_PARAMS.output_compression,
        n: 1,
      })
```

- [ ] **Step 7: Set medium quality for style boards**

In `generateStyleImages`, update `styleParams`:

```typescript
    const styleParams = normalizeParamsForSettings({
      size: '1024x1024',
      quality: AMAZON_DRAFT_QUALITY,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      moderation: params.moderation,
      n: 1,
    }, imageRequestSettings, { hasInputImages: false })
```

- [ ] **Step 8: Update labels and action copy**

Update user-facing strings in `src/components/AmazonPlanner.tsx`:

```typescript
const generationParamLabel = `${DEFAULT_PARAMS.output_format.toUpperCase()} / 草稿 ${AMAZON_DRAFT_QUALITY} / 压缩率${DEFAULT_PARAMS.output_compression}`
```

Change the top segmented-control label area so the resolution control has a visible label:

```tsx
<div className="flex items-center gap-2">
  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">最终清晰度</span>
  <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
    {(['1k', '2k', '4k'] as const).map((item) => (
      <button
        key={item}
        type="button"
        onClick={() => setResolution(item)}
        className={`h-8 min-w-14 rounded-lg px-3 text-sm font-medium transition ${resolution === item ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
      >
        {item.toUpperCase()}
      </button>
    ))}
  </div>
</div>
```

Update submit labels:

```typescript
const submitButtonLabel = currentActionSubmitted ? '草稿已提交' : '生成草稿'
```

Update batch button:

```tsx
{isBatchSubmitting ? '提交草稿中...' : '提交未提交草稿'}
```

Update success toast:

```typescript
showToast(`已提交 ${jobs.length} 张草稿任务`, 'success')
```

- [ ] **Step 9: Run tests**

Run:

```bash
npm test -- src/components/AmazonPlanner.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/AmazonPlanner.tsx src/components/AmazonPlanner.test.tsx
git commit -m "feat: submit amazon planner drafts at medium quality"
```

---

## Task 5: Remove Fixed 1024 Style-Board Wording

**Files:**
- Modify: `src/lib/listingPlanner.ts`
- Modify: `src/lib/listingPlannerApi.ts`
- Modify: `src/lib/listingPlanner.test.ts`
- Modify: `src/components/AmazonPlanner.test.tsx`

- [ ] **Step 1: Write failing assertions for generic style-board wording**

Update `src/lib/listingPlanner.test.ts` where it currently checks `1024x1024 visual style reference board`:

```typescript
    expect(prompt).toContain('visual style reference board')
    expect(prompt).not.toContain('1024x1024 visual style reference board')
```

Add to `src/components/AmazonPlanner.test.tsx`:

```typescript
  it('does not present style boards as fixed final-resolution images', () => {
    expect(amazonPlannerSource).not.toContain('1024x1024 visual style reference board')
    expect(amazonPlannerSource).toContain('视觉风格参考板')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts src/components/AmazonPlanner.test.tsx
```

Expected: FAIL because source still contains `1024x1024 visual style reference board`.

- [ ] **Step 3: Update prompt text in `listingPlanner.ts`**

Replace:

```typescript
  '- Create a 1024x1024 visual style reference board, not a final Amazon product image.',
```

with:

```typescript
  '- Create a visual style reference board, not a final Amazon product image.',
```

- [ ] **Step 4: Update planner API instruction strings**

In `src/lib/listingPlannerApi.ts`, replace each occurrence of:

```typescript
1024x1024 visual style reference board
```

with:

```typescript
visual style reference board
```

Keep the rest of each sentence intact.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts src/components/AmazonPlanner.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/listingPlanner.ts src/lib/listingPlannerApi.ts src/lib/listingPlanner.test.ts src/components/AmazonPlanner.test.tsx
git commit -m "chore: generalize style board resolution wording"
```

---

## Task 6: Add “制作高清” to the Reuse Menu and Task Cards

**Files:**
- Modify: `src/components/TaskReuseMenu.tsx`
- Modify: `src/components/TaskReuseMenu.test.tsx`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/TaskGrid.tsx`
- Modify: `src/components/TaskGrid.test.tsx`
- Modify: `src/components/DetailModal.tsx`

- [ ] **Step 1: Write failing menu tests**

Update `src/components/TaskReuseMenu.test.tsx` with:

```tsx
  it('renders a high-quality final action for completed drafts', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages
        canCreateFinalFromDraft
        onCreateFinalFromDraft={() => {}}
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).toContain('制作高清')
  })

  it('does not show high-quality final action when a task is not a draft', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).not.toContain('制作高清')
  })
```

Add this source test in `src/components/TaskGrid.test.tsx`:

```typescript
  it('wires Amazon draft tasks to final generation from the task grid', () => {
    expect(taskGridSource).toContain('createAmazonFinalImageFromDraft')
    expect(taskGridSource).toContain('isAmazonDraftTask(task)')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/components/TaskReuseMenu.test.tsx src/components/TaskGrid.test.tsx
```

Expected: FAIL because the new props/action do not exist.

- [ ] **Step 3: Extend `TaskReuseMenu` props and UI**

Modify `src/components/TaskReuseMenu.tsx`:

```typescript
interface TaskReuseMenuProps {
  hasOutputImages: boolean
  canRestorePlannerSession?: boolean
  canCreateFinalFromDraft?: boolean
  onCreateFinalFromDraft?: () => void
  onReuseConfig: () => void
  onUseOutputAsReference: () => void
  onUseAsStyle: () => void
  onRestorePlannerSession: () => void
  onEditOutputs: () => void
}
```

Update destructuring:

```typescript
  canCreateFinalFromDraft = false,
  onCreateFinalFromDraft = () => {},
```

Add this menu action after `输出图作参考`:

```tsx
        {canCreateFinalFromDraft && (
          <MenuAction disabled={!hasOutputImages} onClick={onCreateFinalFromDraft}>制作高清</MenuAction>
        )}
```

- [ ] **Step 4: Forward props through `TaskCard`**

Modify `src/components/TaskCard.tsx` props:

```typescript
  canCreateFinalFromDraft?: boolean
  onCreateFinalFromDraft?: () => void
```

Update destructuring defaults:

```typescript
  canCreateFinalFromDraft = false,
  onCreateFinalFromDraft = () => {},
```

Pass into `TaskReuseMenu`:

```tsx
                canCreateFinalFromDraft={canCreateFinalFromDraft}
                onCreateFinalFromDraft={onCreateFinalFromDraft}
```

- [ ] **Step 5: Wire TaskGrid**

Modify imports in `src/components/TaskGrid.tsx`:

```typescript
import { useStore, reuseConfig, editOutputs, removeTask, ensureImageCached, createAmazonFinalImageFromDraft } from '../store'
import { isAmazonDraftTask } from '../lib/amazonGeneration'
```

Pass props into `TaskCard`:

```tsx
              canCreateFinalFromDraft={isAmazonDraftTask(task)}
              onCreateFinalFromDraft={() => void createAmazonFinalImageFromDraft(task)}
```

- [ ] **Step 6: Wire DetailModal**

Modify imports in `src/components/DetailModal.tsx`:

```typescript
import { useStore, getCachedImage, ensureImageCached, ensureImageUrlCached, reuseConfig, editOutputs, removeTask, updateTaskInStore, showCodexCliPrompt, getCodexCliPromptKey, retryTask, createAmazonFinalImageFromDraft } from '../store'
import { isAmazonDraftTask } from '../lib/amazonGeneration'
```

Add handler:

```typescript
  const handleCreateFinalFromDraft = async () => {
    if (!task) return
    await createAmazonFinalImageFromDraft(task, currentOutputImageId || undefined)
    setDetailTaskId(null)
  }
```

Pass into `TaskReuseMenu`:

```tsx
                canCreateFinalFromDraft={isAmazonDraftTask(task)}
                onCreateFinalFromDraft={() => void handleCreateFinalFromDraft()}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/components/TaskReuseMenu.test.tsx src/components/TaskGrid.test.tsx src/components/DetailModal.test.tsx src/components/TaskCard.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/TaskReuseMenu.tsx src/components/TaskReuseMenu.test.tsx src/components/TaskCard.tsx src/components/TaskGrid.tsx src/components/DetailModal.tsx src/components/TaskGrid.test.tsx
git commit -m "feat: add amazon draft high quality action"
```

---

## Task 7: Surface Draft/Final Status in History

**Files:**
- Modify: `src/lib/taskHistory.ts`
- Modify: `src/lib/taskHistory.test.ts`
- Modify: `src/components/TaskCard.tsx`
- Modify: `src/components/DetailModal.tsx`

- [ ] **Step 1: Write failing history tests**

Add to `src/lib/taskHistory.test.ts`:

```typescript
import { getTaskGenerationStageLabel, matchesTaskHistoryFilters } from './taskHistory'
```

Add tests:

```typescript
it('labels Amazon draft and final generation stages', () => {
  expect(getTaskGenerationStageLabel({ category: { workflow: 'amazon-listing', generationStage: 'draft' } } as any)).toBe('草稿')
  expect(getTaskGenerationStageLabel({ category: { workflow: 'amazon-listing', generationStage: 'final' } } as any)).toBe('高清')
  expect(getTaskGenerationStageLabel({ category: { workflow: 'gallery' } } as any)).toBe('')
})

it('matches history search by draft and final stage labels', () => {
  const draftTask = task({
    category: { workflow: 'amazon-listing', generationStage: 'draft' },
  })

  expect(matchesTaskHistoryFilters(draftTask, {
    searchQuery: '草稿',
    filterStatus: 'all',
    filterFavorite: false,
    filterProductTitle: '',
    filterWorkflow: 'all',
    filterAspect: 'all',
  })).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/taskHistory.test.ts
```

Expected: FAIL because `getTaskGenerationStageLabel` does not exist.

- [ ] **Step 3: Add stage label helper**

Modify `src/lib/taskHistory.ts`:

```typescript
export function getTaskGenerationStageLabel(task: Pick<TaskRecord, 'category'>) {
  if (task.category?.workflow !== 'amazon-listing' && task.category?.workflow !== 'amazon-aplus' && task.category?.workflow !== 'amazon-dsp') return ''
  if (task.category?.generationStage === 'draft') return '草稿'
  if (task.category?.generationStage === 'final') return '高清'
  return ''
}
```

In `matchesTaskHistoryFilters`, add the label into `searchable`:

```typescript
    getTaskGenerationStageLabel(task),
```

- [ ] **Step 4: Surface labels in UI**

In `src/components/TaskCard.tsx`, import:

```typescript
import { getTaskGenerationStageLabel } from '../lib/taskHistory'
```

Near other derived labels, add:

```typescript
  const generationStageLabel = getTaskGenerationStageLabel(task)
```

Render it near the workflow/slot tag area:

```tsx
              {generationStageLabel && (
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  {generationStageLabel}
                </span>
              )}
```

In `src/components/DetailModal.tsx`, import:

```typescript
import { getAspectLabel, getTaskGenerationStageLabel, getTaskHistoryCategory, getWorkflowLabel } from '../lib/taskHistory'
```

Near `historyCategory`, derive:

```typescript
  const generationStageLabel = task ? getTaskGenerationStageLabel(task) : ''
```

Render in the task metadata/tag area:

```tsx
              {generationStageLabel && (
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  {generationStageLabel}
                </span>
              )}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/lib/taskHistory.test.ts src/components/TaskCard.test.tsx src/components/DetailModal.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/taskHistory.ts src/lib/taskHistory.test.ts src/components/TaskCard.tsx src/components/DetailModal.tsx
git commit -m "feat: show amazon draft and final stages"
```

---

## Task 8: End-to-End Verification

**Files:**
- No new files unless fixing failures discovered by verification.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
npm test -- src/lib/amazonGeneration.test.ts src/lib/referenceImagePayload.test.ts src/store.test.ts src/components/AmazonPlanner.test.tsx src/components/TaskReuseMenu.test.tsx src/components/TaskGrid.test.tsx src/components/DetailModal.test.tsx src/lib/taskHistory.test.ts src/lib/listingPlanner.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete. Existing Vite chunk-size warning is acceptable; new type errors are not.

- [ ] **Step 4: Start local app**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: dev server prints a localhost URL.

- [ ] **Step 5: Validate with in-app browser**

Open the local URL in the in-app browser and verify:

- Amazon Planner resolution control is labeled “最终清晰度”.
- Planner primary action says “生成草稿”.
- A draft task created from Planner has `quality: medium` and keeps the original target size.
- Completed draft task menu shows “制作高清”.
- Clicking “制作高清” submits a final task with `quality: high`.
- Existing gallery/Agent tasks do not show “制作高清”.

- [ ] **Step 6: Stop local dev server**

Stop the dev server started in Step 4.

- [ ] **Step 7: Final commit**

If Step 8 required fixes after previous task commits, commit the verification fixes:

```bash
git add src docs
git commit -m "fix: complete amazon draft final workflow verification"
```

If no files changed after verification, do not create an empty commit.
