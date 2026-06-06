# DSP Planner Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `DSP 图` planner mode beside `Listing 图` and `A+ 图`, with DSP specs, planner schema, prompt rules, task history classification, and production browser verification.

**Architecture:** Extend the existing planner mode union and keep DSP logic in the same planner modules that already own Listing and A+ planning. DSP gets its own spec and plan types, its own planner API schema, and UI branches in `AmazonPlanner` without reusing A+ semantic fields.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing Zustand store, existing in-app browser verification.

---

## Workspace Note

The worktree already contains pre-existing uncommitted changes, including files this feature must edit. Do not create implementation commits unless the staged diff can be limited to this feature without including prior unrelated edits. The design document was already committed separately.

## File Structure

- Modify `src/lib/listingPlanner.ts`: define DSP spec and plan types, generation size helpers, display helpers, and DSP prompt builder.
- Modify `src/lib/listingPlannerApi.ts`: add DSP payload schema, normalization, instructions, user input text, and mode routing.
- Modify `src/types.ts`: add `amazon-dsp` workflow and DSP session plan fields.
- Modify `src/lib/taskHistory.ts`: show and filter DSP workflow.
- Modify `src/lib/listingPlanner.test.ts`: cover DSP helpers and planner API schema / normalization.
- Modify `src/lib/taskHistory.test.ts`: cover DSP category and workflow filters.
- Create `src/components/AmazonPlanner.test.tsx`: static-render check for the new mode tab.
- Modify `src/components/AmazonPlanner.tsx`: add DSP mode state, plan selection, prompt preview, spec list, single submit, batch submit, session persistence, and copy/fill labels.

## Task 1: DSP Spec Helpers

**Files:**
- Modify: `src/lib/listingPlanner.test.ts`
- Modify: `src/lib/listingPlanner.ts`

- [x] **Step 1: Write failing helper tests**

Add these imports in `src/lib/listingPlanner.test.ts`:

```ts
  buildAmazonDspPlanPrompt,
  getDspAssetDisplayName,
  getDspAssetGenerationSize,
  getDspAssetUploadSize,
  getDspImageAssetSpecs,
  withDspGenerationSizes,
```

Add this test block after `describe('A+ module helpers', ...)`:

```ts
describe('DSP asset helpers', () => {
  it('exposes the fixed DSP image specs and CTA rules', () => {
    const specs = getDspImageAssetSpecs()

    expect(specs).toHaveLength(11)
    expect(specs.map((spec) => spec.slot)).toContain('DSP-CUSTOM-300x250')
    expect(specs.map((spec) => spec.slot)).toContain('DSP-CUSTOM-970x250')
    expect(specs.map((spec) => spec.slot)).toContain('DSP-REC-600x600')

    const banner970 = specs.find((spec) => spec.slot === 'DSP-CUSTOM-970x250')
    expect(banner970).toMatchObject({
      group: 'custom-image',
      uploadWidth: 970,
      uploadHeight: 250,
      fileLimit: '200KB',
      ctaPolicy: 'required',
    })
    expect(banner970?.rules.join('\n')).toContain('970x250')
    expect(banner970?.rules.join('\n')).toContain('underlined text')

    const semiAuto = specs.find((spec) => spec.slot === 'DSP-REC-600x600')
    expect(semiAuto).toMatchObject({
      group: 'semi-auto-rec',
      uploadWidth: 600,
      uploadHeight: 600,
      fileLimit: '5MB',
      ctaPolicy: 'forbidden',
    })
    expect(semiAuto?.rules.join('\n')).toContain('Do not include a CTA')
  })

  it('formats DSP upload and generation sizes', () => {
    const spec = getDspImageAssetSpecs().find((item) => item.slot === 'DSP-CUSTOM-300x250')!

    expect(getDspAssetDisplayName(spec)).toBe('Custom Image 300x250')
    expect(getDspAssetUploadSize(spec)).toBe('300x250')
    expect(getDspAssetGenerationSize(spec, '2K')).toMatch(/^\d+x\d+$/)

    const plan = withDspGenerationSizes([{
      slot: spec.slot,
      label: spec.label,
      group: spec.group,
      assetType: spec.assetType,
      uploadSize: getDspAssetUploadSize(spec),
      generationSize: '',
      fileLimit: spec.fileLimit,
      ctaPolicy: spec.ctaPolicy,
      planMarkdown: '中文 DSP 策划。',
      prompt: 'Create a DSP banner.',
      negativePrompt: 'Amazon UI, Click Here',
    }], '2K')[0]

    expect(plan.generationSize).toBe(getDspAssetGenerationSize(spec, '2K'))
  })

  it('builds DSP prompts with compliance rules and style reference guard', () => {
    const prompt = buildAmazonDspPlanPrompt({
      prompt: 'Create a polished DSP custom banner with product, logo, and Learn more CTA.',
      negativePrompt: 'Amazon UI, Click Here, pure white background',
      seriesStyleGuide: 'Use crisp retail typography and high-contrast product lighting.',
      styleReferenceAttached: true,
      styleDensityMode: 'minimal',
    })

    expect(prompt).toContain('Create a polished DSP custom banner')
    expect(prompt).toContain('Series style guide:')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('refined minimal Amazon layout')
    expect(prompt).toContain('The last input image is a hidden style reference')
  })
})
```

- [x] **Step 2: Run helper tests and verify failure**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts
```

Expected: fails because DSP exports do not exist.

- [x] **Step 3: Implement DSP spec helpers**

In `src/lib/listingPlanner.ts`, change:

```ts
export type AmazonPlannerMode = 'listing' | 'aplus'
```

to:

```ts
export type AmazonPlannerMode = 'listing' | 'aplus' | 'dsp'
```

Add these types after `AmazonAPlusPlan`:

```ts
export type DspAssetGroup = 'rec' | 'custom-image' | 'semi-auto-rec'
export type DspAssetType = 'logo' | 'slogan' | 'image'
export type DspCtaPolicy = 'required' | 'optional' | 'forbidden' | 'not-applicable'

export interface AmazonDspAssetSpec {
  group: DspAssetGroup
  slot: string
  label: string
  displayLabel: string
  assetType: DspAssetType
  uploadWidth?: number
  uploadHeight?: number
  minimumWidth?: number
  minimumHeight?: number
  fileLimit: string
  formats?: string[]
  ctaPolicy: DspCtaPolicy
  objective: string
  rules: string[]
}

export interface AmazonDspPlan {
  slot: string
  label: string
  group: DspAssetGroup
  assetType: DspAssetType
  uploadSize: string
  generationSize: string
  fileLimit: string
  ctaPolicy: DspCtaPolicy
  planMarkdown: string
  prompt: string
  negativePrompt: string
}
```

Add `DSP_ASSET_SPECS`, helper functions, and `buildAmazonDspPlanPrompt` near the A+ helpers. The image specs must include the 10 Custom Image sizes and the `DSP-REC-600x600` semi-auto REC image. REC Logo and Slogan remain in `DSP_ASSET_SPECS` but are excluded by `getDspImageAssetSpecs()`.

- [x] **Step 4: Run helper tests and verify pass**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts
```

Expected: helper tests pass or only later planner API tests fail after Task 2 additions.

## Task 2: DSP Planner API Schema

**Files:**
- Modify: `src/lib/listingPlanner.test.ts`
- Modify: `src/lib/listingPlannerApi.ts`

- [x] **Step 1: Write failing planner API tests**

Add `getDspImageAssetSpecs` to the existing planner imports if not already imported. Add these helpers near `createAPlusPayload`:

```ts
function createDspPlans() {
  return getDspImageAssetSpecs().map((spec) => ({
    slot: spec.slot,
    label: `${spec.displayLabel} 方案`,
    group: spec.group,
    assetType: spec.assetType,
    planMarkdown: `## ${spec.displayLabel}\n\n中文 DSP 策划说明。`,
    prompt: `Create DSP asset ${spec.slot} with compliant branding and product evidence.`,
    negativePrompt: `negative ${spec.slot}, Amazon UI, Click Here`,
  }))
}

function createDspPayload(title = 'AI planned DSP tumbler') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand: 'ExampleBrand',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive DSP retail ad style across the asset set.',
    styleCandidates: createStyleCandidates(),
    dspPlans: createDspPlans(),
  }
}
```

Add this test inside `describe('callAmazonPlannerApi', ...)`:

```ts
it('uses DSP planning schema and fills fixed upload metadata', async () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
    output_text: JSON.stringify(createDspPayload()),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', fetchMock)

  const result = await callAmazonPlannerApi({
    listingText: SAMPLE_LISTING,
    baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExampleBrand' },
    profile: createDefaultOpenAIProfile({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'user-api-key',
      apiMode: 'responses',
      model: 'gpt-planner-profile',
    }),
    mode: 'dsp',
    aPlusGenerationTier: '2K',
  })

  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
  expect(body.text.format.name).toBe('amazon_dsp_image_plan')
  expect(body.text.format.schema.required).toContain('dspPlans')
  expect(body.text.format.schema.properties.dspPlans.minItems).toBe(getDspImageAssetSpecs().length)
  expect(body.instructions).toContain('Amazon DSP advertising image-planning agent')
  expect(body.instructions).toContain('Shop now')
  expect(body.instructions).toContain('Click Here')
  expect(body.instructions).toContain('970x250')
  expect(body.instructions).toContain('Do not mimic Amazon website content')
  expect(body.input[0].content[0].text).toContain('produce the Amazon DSP advertising asset plan')

  expect(result.mode).toBe('dsp')
  expect(result.dspPlans).toHaveLength(getDspImageAssetSpecs().length)
  expect(result.dspPlans[0]).toMatchObject({
    slot: 'DSP-CUSTOM-300x250',
    group: 'custom-image',
    assetType: 'image',
    uploadSize: '300x250',
    fileLimit: '50KB',
    ctaPolicy: 'required',
    planMarkdown: expect.stringContaining('DSP 策划说明'),
  })
  expect(result.dspPlans.find((plan) => plan.slot === 'DSP-REC-600x600')).toMatchObject({
    uploadSize: '600x600',
    fileLimit: '5MB',
    ctaPolicy: 'forbidden',
  })
})
```

Add this failure test:

```ts
it('fails fast when DSP output is missing a prompt', async () => {
  const payload = createDspPayload()
  payload.dspPlans[0] = { ...payload.dspPlans[0], prompt: '' }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    output_text: JSON.stringify(payload),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))

  await expect(callAmazonPlannerApi({
    listingText: SAMPLE_LISTING,
    baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
    profile: createDefaultOpenAIProfile({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'user-api-key',
      apiMode: 'responses',
      model: 'gpt-planner-profile',
    }),
    mode: 'dsp',
  })).rejects.toThrow('AI DSP 策划结果缺少 DSP-CUSTOM-300x250 的提示词')
})
```

- [x] **Step 2: Run planner API tests and verify failure**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts
```

Expected: fails because `dspPlans` schema and normalization do not exist.

- [x] **Step 3: Implement DSP planner API routing**

In `src/lib/listingPlannerApi.ts`:

- Import DSP helpers and `AmazonDspPlan`.
- Add `dspPlans?: Array<Partial<AmazonDspPlan>>` to `PlannerApiPayload`.
- Add `dspPlans: AmazonDspPlan[]` to `PlannerApiResult`.
- Add `createDspPlannerSchema()`, `normalizeDspPlan()`, `normalizeDspPlannerApiPayload()`.
- Add `buildDspPlannerInstructions(baseDraft)` with the user-provided DSP rules.
- Update `buildPlannerInstructions`, `buildPlannerInputText`, `buildChatPlannerSchemaGuide`, schema selection, schema name, and final normalization to branch on `mode === 'dsp'`.
- Keep A+ behavior unchanged.

- [x] **Step 4: Run planner API tests and verify pass**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts
```

Expected: pass.

## Task 3: Types And History

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/taskHistory.ts`
- Modify: `src/lib/taskHistory.test.ts`

- [x] **Step 1: Write failing history tests**

In `src/lib/taskHistory.test.ts`, import `getWorkflowLabel` and add:

```ts
it('uses explicit DSP metadata and workflow label', () => {
  const category = getTaskHistoryCategory(task({
    prompt: 'Create Amazon DSP advertising creative.',
    params: { ...DEFAULT_PARAMS, size: '2448x2040' },
    category: {
      productTitle: 'LED Desk Lamp',
      workflow: 'amazon-dsp',
      amazonSlot: 'DSP-CUSTOM-300x250',
    },
  }))

  expect(category).toMatchObject({
    productTitle: 'LED Desk Lamp',
    workflow: 'amazon-dsp',
    amazonSlot: 'DSP-CUSTOM-300x250',
    aspect: 'landscape',
  })
  expect(getWorkflowLabel('amazon-dsp')).toBe('DSP 图')
})
```

Add this assertion to the existing filter test or as a new test:

```ts
expect(matchesTaskHistoryFilters(task({
  prompt: 'Create Amazon DSP advertising creative.',
  category: {
    productTitle: 'LED Desk Lamp',
    workflow: 'amazon-dsp',
    amazonSlot: 'DSP-REC-600x600',
  },
}), {
  searchQuery: 'DSP',
  filterStatus: 'all',
  filterFavorite: false,
  filterProductTitle: 'LED Desk Lamp',
  filterWorkflow: 'amazon-dsp',
  filterAspect: 'all',
})).toBe(true)
```

- [x] **Step 2: Run history tests and verify failure**

Run:

```bash
npm test -- src/lib/taskHistory.test.ts
```

Expected: TypeScript or test failure because `amazon-dsp` is not in `TaskWorkflow`.

- [x] **Step 3: Implement types and labels**

In `src/types.ts`:

- Change `TaskWorkflow` to include `amazon-dsp`.
- Change `AmazonPlannerSession.mode` to include `dsp`.
- Add `dsp: string` to `AmazonPlannerSession.seriesStyleGuides`.
- Add `AmazonPlannerSessionDspPlan` with the same fields as `AmazonDspPlan`.
- Add `dspPlans: AmazonPlannerSessionDspPlan[]`.
- Add `selectedDspPlanIndex: number | null`.

In `src/lib/taskHistory.ts`, add:

```ts
case 'amazon-dsp':
  return 'DSP 图'
```

to `getWorkflowLabel`.

- [x] **Step 4: Run history tests and verify pass**

Run:

```bash
npm test -- src/lib/taskHistory.test.ts
```

Expected: pass.

## Task 4: AmazonPlanner UI Integration

**Files:**
- Create: `src/components/AmazonPlanner.test.tsx`
- Modify: `src/components/AmazonPlanner.tsx`

- [x] **Step 1: Write failing static UI test**

Create `src/components/AmazonPlanner.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AmazonPlanner from './AmazonPlanner'

describe('AmazonPlanner', () => {
  it('renders DSP as a first-class planner mode', () => {
    const html = renderToStaticMarkup(<AmazonPlanner />)

    expect(html).toContain('Listing 图')
    expect(html).toContain('A+ 图')
    expect(html).toContain('DSP 图')
  })
})
```

- [x] **Step 2: Run static UI test and verify failure**

Run:

```bash
npm test -- src/components/AmazonPlanner.test.tsx
```

Expected: fails because `DSP 图` is not rendered.

- [x] **Step 3: Implement DSP mode state and derived values**

In `src/components/AmazonPlanner.tsx`:

- Import DSP helpers and `AmazonDspPlan`.
- Add `dspPlans` and `selectedDspPlanIndex` state.
- Add `dspPlansWithSizes`, `selectedDspPlan`, `dspSpecs`.
- Add `seriesStyleGuides.dsp`.
- Replace binary `plannerMode === 'aplus' ? ... : ...` derived values with small local helpers that return active plan list, selected index, selected plan, prompt builder, target size, labels, and empty states for `listing`, `aplus`, and `dsp`.
- Keep Listing MAIN style-reference exemption only for `listing`.

- [x] **Step 4: Implement DSP create/apply/submit/session branches**

Update these functions:

- `createPlannerSessionSnapshot`: persist `dspPlans` and `selectedDspPlanIndex`.
- `buildBatchGenerateJobs`: return DSP jobs with `workflow: 'amazon-dsp'`.
- `applyPrompt`: write DSP category and use DSP toast text.
- `copyPrompt`: use DSP missing-plan text.
- `applyPlannerResult`: accept `result.mode === 'dsp'`, set `dspPlans`, clear Listing and A+ plans, save DSP session fields.
- `createAiPlan`: pass `mode: plannerMode`.
- `selectVisiblePlan`: support DSP.
- `changePlannerMode`: clear selected style and action progress without deleting existing plans.
- `clearListingPlan`: clear DSP plans and selected DSP index.
- `restorePlannerSession`: restore DSP plans and selected DSP index.

- [x] **Step 5: Implement DSP rendering**

Update rendering:

- Top tabs include `['dsp', 'DSP 图']`.
- Session cards show DSP label and DSP plan count.
- Planner title becomes `DSP 素材策划`.
- Description says DSP generates REC / Custom Image / semi-auto REC ad assets.
- Textarea label becomes `标题 / 五点描述 / 品牌 / 活动说明`.
- Button label becomes `AI策划DSP`.
- Plan list renders DSP plans with slot, display label, upload size, generation size, file limit, CTA policy, summary, and negative prompt.
- Empty DSP state renders fixed DSP specs, including REC Logo, Slogan, Custom Image sizes, and semi-auto REC `600x600`.
- Prompt Preview fallback says to click `AI策划DSP`.
- Sticky action metadata includes upload size and file limit for selected DSP plan.

- [x] **Step 6: Run static UI test and verify pass**

Run:

```bash
npm test -- src/components/AmazonPlanner.test.tsx
```

Expected: pass.

## Task 5: Verification

**Files:**
- Potentially modify files from Tasks 1-4 if tests reveal regressions.

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/lib/listingPlanner.test.ts src/lib/taskHistory.test.ts src/components/AmazonPlanner.test.tsx
```

Expected: pass.

- [x] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

- [x] **Step 3: Run production preview**

Run:

```bash
npm run preview -- --host 127.0.0.1
```

Expected: Vite preview serves the production build and prints a local URL, usually `http://127.0.0.1:4173/`.

- [x] **Step 4: Verify with production browser**

Use the Browser plugin against the production preview URL when available. If the Browser plugin does not expose callable tools, use Playwright against the same production URL:

- Confirm the workbench loads.
- Confirm top planner tabs show `Listing 图 / A+ 图 / DSP 图`.
- Click `DSP 图`.
- Confirm DSP title, input label, `AI策划DSP` button, and fixed specs are visible.
- Confirm the fixed specs include `300x250`, `970x250`, and `600x600`.
- Check desktop width and a mobile-width viewport for no obvious overlap or truncated controls.

- [x] **Step 5: Final status**

Report:

- Files changed.
- Targeted tests result.
- Build result.
- Production browser verification result.
- Any remaining uncertainty.
