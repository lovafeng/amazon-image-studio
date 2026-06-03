# Amazon DOM Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amazon product URL and saved DOM / HTML import to the existing Amazon Planner flow while preserving the exact user-pasted URL for fetching.

**Architecture:** Add a focused `src/lib/amazonDomImport.ts` module for URL validation, raw URL fetching, DOM parsing, field mapping, and `listingText` formatting. Wire it into `src/components/AmazonPlanner.tsx` as a compact import block above the existing listing text input. Keep image auto-download out of scope.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, browser `DOMParser`, existing Zustand toast and planner state patterns.

---

## File Structure

- Create `src/lib/amazonDomImport.ts`: pure front-end import helpers and exported constants for UI messages.
- Create `src/lib/amazonDomImport.test.ts`: Vitest tests for ASIN extraction, exact URL preservation, text cleaning, and `listingText` formatting.
- Modify `src/components/AmazonPlanner.tsx`: add URL/file controls, import state, and handlers that call the new module and merge results into existing `listingText` and `draft`.
- No dependency changes. Do not add React test libraries or HTML parser packages.

## Task 1: Parser And URL Import Module

**Files:**
- Create: `src/lib/amazonDomImport.test.ts`
- Create: `src/lib/amazonDomImport.ts`

- [ ] **Step 1: Write failing tests for URL and formatting behavior**

Create `src/lib/amazonDomImport.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE,
  buildAmazonDomListingText,
  cleanAmazonBulletText,
  extractAmazonAsinFromUrl,
  fetchAmazonDomHtml,
  importAmazonDomFromUrl,
} from './amazonDomImport'

const FULL_AMAZON_URL = 'https://www.amazon.com/EGGKITPO-Commercial-Stainless-Countertop-Restaurant/dp/B0G1MSW4RW/ref=fabric-ww-slds-dp-fsdpnewarrivals-fa-xcat-unreg_d_sccl_2_3/134-0736988-0770416?pd_rd_w=f3JcG&content-id=amzn1.sym.e25a62e2-5204-48a4-8389-3767244711a3&pf_rd_p=e25a62e2-5204-48a4-8389-3767244711a3&pf_rd_r=WEG8GTSASH1S9NF158Y0&pd_rd_wg=BEAz8&pd_rd_r=5254f4ab-9ff5-469b-9984-07f9eadd54f1&pd_rd_i=B0G1MSW4RW&th=1'

describe('amazon DOM import helpers', () => {
  it('extracts ASIN from Amazon product URLs without changing the original URL', () => {
    expect(extractAmazonAsinFromUrl(FULL_AMAZON_URL)).toBe('B0G1MSW4RW')
    expect(extractAmazonAsinFromUrl('https://www.amazon.com/gp/product/B0G1MSW4RW?th=1')).toBe('B0G1MSW4RW')
  })

  it('uses the exact user-pasted URL for fetching', async () => {
    const fetchMock = vi.fn(async () => new Response('<html><body>ok</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }))

    await fetchAmazonDomHtml(FULL_AMAZON_URL, fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(FULL_AMAZON_URL, { cache: 'no-store' })
  })

  it('cleans Amazon bullet UI copy', () => {
    expect(cleanAmazonBulletText(' Make sure this fits by entering your model number. ')).toBe('')
    expect(cleanAmazonBulletText(' 【FAST ICE MAKING】Produces clear ice quickly. ')).toBe('FAST ICE MAKING Produces clear ice quickly.')
  })

  it('formats listing text for the existing AI planner input', () => {
    expect(buildAmazonDomListingText({
      title: 'Commercial Ice Maker',
      bullets: ['Produces ice quickly', 'Stainless steel countertop body'],
    })).toBe([
      'Title: Commercial Ice Maker',
      '',
      'About this item',
      '- Produces ice quickly',
      '- Stainless steel countertop body',
    ].join('\n'))
  })

  it('uses the upload-DOM message when URL fetching fails', async () => {
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }))

    await expect(fetchAmazonDomHtml(FULL_AMAZON_URL, fetchMock)).rejects.toThrow(AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test -- src/lib/amazonDomImport.test.ts
```

Expected: FAIL because `src/lib/amazonDomImport.ts` does not exist.

- [ ] **Step 3: Implement minimal module**

Create `src/lib/amazonDomImport.ts` with:

```ts
import type { AmazonPromptDraft } from './amazonPrompt'

export const AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE = 'URL 导入失败，可能被跨域或反爬拦截；请上传该页面保存下来的 DOM 文件。'
export const AMAZON_DOM_PARSE_FAILURE_MESSAGE = 'DOM 中未识别到商品标题或五点描述，请确认文件来自 Amazon 商品详情页。'

export interface AmazonDomImportResult {
  asin?: string
  title: string
  bullets: string[]
  details: Record<string, string>
  draft: Partial<AmazonPromptDraft>
  listingText: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function extractAmazonAsinFromUrl(value: string): string | undefined {
  const trimmed = value.trim()
  const match = trimmed.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)
  return match?.[1]?.toUpperCase()
}

export function cleanAmazonText(value: string): string {
  return value
    .replace(/\u200e|\u200f/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanAmazonBulletText(value: string): string {
  const text = cleanAmazonText(value)
    .replace(/[【】]/g, '')
    .replace(/^[-•]+/, '')
    .trim()
  if (/^make sure this fits/i.test(text)) return ''
  return text
}

export function buildAmazonDomListingText(input: { title: string; bullets: string[] }): string {
  return [
    input.title.trim() ? `Title: ${input.title.trim()}` : '',
    '',
    input.bullets.length ? 'About this item' : '',
    ...input.bullets.map((item) => `- ${item}`),
  ].filter((line, index, lines) => line || lines[index - 1]).join('\n').trim()
}

function getElementText(document: Document, selector: string): string {
  return cleanAmazonText(document.querySelector(selector)?.textContent ?? '')
}

function getElementsText(document: Document, selector: string): string[] {
  return Array.from(document.querySelectorAll(selector))
    .map((element) => cleanAmazonBulletText(element.textContent ?? ''))
    .filter(Boolean)
}

function readDetailRows(document: Document): Record<string, string> {
  const details: Record<string, string> = {}
  const rows = Array.from(document.querySelectorAll('#productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr'))
  for (const row of rows) {
    const key = cleanAmazonText(row.querySelector('th')?.textContent ?? '').replace(/:$/, '')
    const value = cleanAmazonText(row.querySelector('td')?.textContent ?? '')
    if (key && value) details[key] = value
  }

  for (const item of Array.from(document.querySelectorAll('#detailBullets_feature_div li'))) {
    const text = cleanAmazonText(item.textContent ?? '')
    const [key, ...rest] = text.split(':')
    const value = rest.join(':').trim()
    const normalizedKey = key?.replace(/^[^A-Za-z\u3400-\u9fff]+/, '').trim()
    if (normalizedKey && value) details[normalizedKey] = value
  }

  return details
}

function findDetail(details: Record<string, string>, patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(details)) {
    if (patterns.some((pattern) => pattern.test(key))) return value
  }
  return ''
}

export function parseAmazonDomDocument(document: Document, sourceUrl = ''): AmazonDomImportResult {
  const title = getElementText(document, '#productTitle')
  const bullets = getElementsText(document, '#feature-bullets li span').slice(0, 5)
  const details = readDetailRows(document)
  const byline = getElementText(document, '#bylineInfo').replace(/^Visit the\s+/i, '').replace(/\s+Store$/i, '')
  const color = getElementText(document, '#variation_color_name .selection') || findDetail(details, [/^colou?r$/i])
  const material = findDetail(details, [/material/i])
  const packageIncludes = findDetail(details, [/included components/i, /package includes/i])
  const brand = findDetail(details, [/^brand$/i]) || byline
  const category = findDetail(details, [/best sellers rank/i]).split(' in ')[1]?.split('(')[0]?.trim() ?? ''

  if (!title && bullets.length === 0) throw new Error(AMAZON_DOM_PARSE_FAILURE_MESSAGE)

  return {
    ...(extractAmazonAsinFromUrl(sourceUrl) ? { asin: extractAmazonAsinFromUrl(sourceUrl) } : {}),
    title,
    bullets,
    details,
    draft: {
      productTitle: title,
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
      ...(color ? { color } : {}),
      ...(material ? { material } : {}),
      ...(packageIncludes ? { packageIncludes } : {}),
      ...(bullets.length ? { sellingPoints: bullets.join('\n') } : {}),
    },
    listingText: buildAmazonDomListingText({ title, bullets }),
  }
}

export function parseAmazonDomHtml(html: string, sourceUrl = ''): AmazonDomImportResult {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return parseAmazonDomDocument(document, sourceUrl)
}

export async function fetchAmazonDomHtml(rawUrl: string, fetcher: FetchLike = fetch): Promise<string> {
  const response = await fetcher(rawUrl, { cache: 'no-store' })
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().includes('html')) {
    throw new Error(AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE)
  }
  return response.text()
}

export async function importAmazonDomFromUrl(rawUrl: string, fetcher: FetchLike = fetch): Promise<AmazonDomImportResult> {
  return parseAmazonDomHtml(await fetchAmazonDomHtml(rawUrl, fetcher), rawUrl)
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npm test -- src/lib/amazonDomImport.test.ts
```

Expected: PASS.

## Task 2: AmazonPlanner UI Integration

**Files:**
- Modify: `src/components/AmazonPlanner.tsx`

- [ ] **Step 1: Add imports and local state**

Modify imports:

```ts
import {
  AMAZON_DOM_PARSE_FAILURE_MESSAGE,
  AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE,
  importAmazonDomFromUrl,
  parseAmazonDomHtml,
  type AmazonDomImportResult,
} from '../lib/amazonDomImport'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, EyeIcon, HistoryIcon, ImportIcon, PhotoIcon, PlusIcon, TrashIcon } from './icons'
```

Add refs/state near existing file refs and `listingText`:

```ts
const amazonDomFileInputRef = useRef<HTMLInputElement>(null)
const [amazonImportUrl, setAmazonImportUrl] = useState('')
const [amazonImportStatus, setAmazonImportStatus] = useState('')
const [isAmazonImporting, setIsAmazonImporting] = useState(false)
```

- [ ] **Step 2: Add import helper handlers**

Add handlers before `createAiPlan`:

```ts
const applyAmazonDomImportResult = (result: AmazonDomImportResult) => {
  setListingText(result.listingText)
  setDraft((current) => ({
    ...current,
    ...result.draft,
    productTitle: result.draft.productTitle ?? result.title ?? current.productTitle,
    sellingPoints: result.draft.sellingPoints ?? result.bullets.join('\n') ?? current.sellingPoints,
  }))
  setPlannerError('')
  setAmazonImportStatus(result.asin ? `已导入亚马逊商品信息（ASIN ${result.asin}）` : '已导入亚马逊商品信息')
  showToast('已导入亚马逊商品信息', 'success')
}

const importAmazonUrl = async () => {
  const rawUrl = amazonImportUrl.trim()
  if (!rawUrl) {
    setAmazonImportStatus('请先粘贴亚马逊商品 URL。')
    showToast('请先粘贴亚马逊商品 URL', 'error')
    return
  }

  setIsAmazonImporting(true)
  setAmazonImportStatus('正在读取亚马逊页面...')
  try {
    applyAmazonDomImportResult(await importAmazonDomFromUrl(rawUrl))
  } catch {
    setAmazonImportStatus(AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE)
    showToast('URL 导入失败，请上传 DOM 文件', 'error')
  } finally {
    setIsAmazonImporting(false)
  }
}

const importAmazonDomFile = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  setIsAmazonImporting(true)
  setAmazonImportStatus('正在解析 DOM 文件...')
  try {
    applyAmazonDomImportResult(parseAmazonDomHtml(await file.text(), amazonImportUrl))
  } catch {
    setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
    showToast('DOM 文件解析失败', 'error')
  } finally {
    setIsAmazonImporting(false)
  }
}
```

- [ ] **Step 3: Add compact import UI above the existing textarea**

Insert before the existing `label` that wraps `listingText`:

```tsx
<div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
    <label className="min-w-0 flex-1">
      <span className={LABEL_CLASS}>亚马逊 URL / DOM 导入</span>
      <input
        value={amazonImportUrl}
        onChange={(event) => setAmazonImportUrl(event.target.value)}
        className={FIELD_CLASS}
        placeholder="粘贴完整 Amazon 商品 URL，参数会原样保留"
      />
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void importAmazonUrl()}
        disabled={isAmazonImporting}
        className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white transition ${isAmazonImporting ? 'cursor-wait bg-gray-400' : 'bg-gray-800 hover:bg-gray-700 dark:bg-white/12 dark:hover:bg-white/20'}`}
      >
        <ImportIcon className="h-4 w-4" />
        {isAmazonImporting ? '导入中...' : '导入 URL'}
      </button>
      <button
        type="button"
        onClick={() => amazonDomFileInputRef.current?.click()}
        disabled={isAmazonImporting}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-wait disabled:text-gray-400 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
      >
        <ImportIcon className="h-4 w-4" />
        上传 DOM
      </button>
    </div>
  </div>
  {amazonImportStatus && (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
      {amazonImportStatus}
    </div>
  )}
  <input ref={amazonDomFileInputRef} type="file" accept=".html,.htm,.txt,text/html,text/plain" className="hidden" onChange={importAmazonDomFile} />
</div>
```

- [ ] **Step 4: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. Fix any type or JSX issues in `AmazonPlanner.tsx`.

## Task 3: Full Verification And Browser Acceptance

**Files:**
- Verify: `src/lib/amazonDomImport.ts`
- Verify: `src/components/AmazonPlanner.tsx`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/amazonDomImport.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: PASS or identify unrelated pre-existing failures from dirty workspace changes.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 5: Use in-app browser for acceptance**

Open the local URL in the in-app browser. Verify:

- The Amazon Planner panel shows `亚马逊 URL / DOM 导入`.
- Pasting the full Amazon URL leaves the field unchanged.
- Clicking `导入 URL` shows either a successful import or the anti-scraping/CORS upload-DOM hint.
- Uploading a saved Amazon DOM / HTML sample fills the listing textarea and product fields.
- Clicking the existing `AI策划` button remains available after import.

- [ ] **Step 6: Review diff**

Run:

```bash
git diff -- src/lib/amazonDomImport.ts src/lib/amazonDomImport.test.ts src/components/AmazonPlanner.tsx
```

Expected: Only scoped parser, tests, and AmazonPlanner UI integration changes.
