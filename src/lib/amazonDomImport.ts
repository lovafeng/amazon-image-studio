import type { AmazonPromptDraft } from './amazonPrompt'

export const AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE = '亚马逊限制了直接读取，请上传保存的商品页面文件。'
export const AMAZON_DOM_PARSE_FAILURE_MESSAGE = 'DOM 中未识别到商品标题或五点描述，请确认文件来自 Amazon 商品详情页。'
export const AMAZON_DOM_TRANSFER_EVENT = 'amazon-image-studio-dom-import'
export const AMAZON_DOM_TRANSFER_STORAGE_KEY = 'amazon-image-studio-dom-import-payload'

export interface AmazonImageCandidate {
  url: string
  label: string
  isCurrent?: boolean
}

export interface AmazonDomImportResult {
  asin?: string
  title: string
  bullets: string[]
  details: Record<string, string>
  draft: Partial<AmazonPromptDraft>
  listingText: string
  imageCandidates: AmazonImageCandidate[]
}

export interface AmazonImportPayload {
  asin?: string
  title: string
  bullets: string[]
  details?: Record<string, string>
  imageUrls?: string[]
  imageCandidates?: Array<{ url: string; label?: string; isCurrent?: boolean }>
}

export interface AmazonDomTransferPayload {
  sourceUrl: string
  html: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function parseAmazonDomTransferPayload(input: unknown): AmazonDomTransferPayload {
  const record = input as Partial<AmazonDomTransferPayload>
  return {
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
    html: typeof record.html === 'string' ? record.html : '',
  }
}

export function extractAmazonAsinFromUrl(value: string): string | undefined {
  const match = value.trim().match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)
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
    .replace(/[【】]/g, ' ')
    .replace(/^[-•]+/, '')
    .replace(/\s+/g, ' ')
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

function getElementValue(document: Document, selector: string): string {
  return cleanAmazonText(document.querySelector<HTMLInputElement>(selector)?.value ?? '')
}

function getMetaContent(document: Document, selector: string): string {
  return cleanAmazonText(document.querySelector<HTMLMetaElement>(selector)?.content ?? '')
}

function getTextList(document: Document, selector: string): string[] {
  return Array.from(document.querySelectorAll(selector))
    .map((element) => cleanAmazonText(element.textContent ?? ''))
    .filter(Boolean)
}

function getElementsText(document: Document, selector: string): string[] {
  return Array.from(document.querySelectorAll(selector))
    .map((element) => cleanAmazonBulletText(element.textContent ?? ''))
    .filter(Boolean)
}

function cleanAmazonTitle(value: string): string {
  return cleanAmazonText(value).replace(/^Product Summary:\s*/i, '')
}

function cleanAmazonByline(value: string): string {
  return cleanAmazonText(value)
    .replace(/^Visit the\s+/i, '')
    .replace(/^From\s+/i, '')
    .replace(/^Brand:\s*/i, '')
    .replace(/\s+Store$/i, '')
}

function getAmazonBullets(document: Document): string[] {
  const selectors = [
    '#feature-bullets li span',
    '#feature-bullets .a-list-item',
    '#featurebullets_feature_div .a-list-item',
    '#pqv-feature-bullets li span',
    '#pqv-feature-bullets .a-list-item',
  ]
  const seen = new Set<string>()
  const bullets: string[] = []
  for (const selector of selectors) {
    for (const item of getElementsText(document, selector)) {
      if (/^Note:/i.test(item) || seen.has(item)) continue
      seen.add(item)
      bullets.push(item)
      if (bullets.length >= 5) return bullets
    }
  }
  return bullets
}

function readDetailRows(document: Document): Record<string, string> {
  const details: Record<string, string> = {}
  const rowSelectors = [
    '#productOverview_feature_div tr',
    '#poExpander tr',
    '#productDetails_detailBullets_sections1 tr',
    '#productDetails_techSpec_section_1 tr',
    '#productDetails_feature_div tr',
  ]
  for (const selector of rowSelectors) {
    for (const row of Array.from(document.querySelectorAll(selector))) {
      const key = cleanAmazonText(
        row.querySelector('th')?.textContent
          ?? row.querySelector('td:nth-child(1)')?.textContent
          ?? '',
      ).replace(/:$/, '')
      const value = cleanAmazonText(
        row.querySelector('td:nth-child(2)')?.textContent
          ?? row.querySelector('td')?.textContent
          ?? '',
      )
      if (key && value) details[key] = value
    }
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

function findBreadcrumbCategory(document: Document): string {
  const breadcrumbs = getTextList(document, '#wayfinding-breadcrumbs_feature_div a')
  return breadcrumbs[breadcrumbs.length - 1] ?? ''
}

function findBestSellerCategory(value: string): string {
  let category = ''
  for (const match of value.matchAll(/\bin\s+([^#()]+?)(?=\s*(?:\(|#|$))/gi)) {
    category = cleanAmazonText(match[1] ?? '')
  }
  return category
}

function isHttpImageUrl(value: string): boolean {
  return /^https?:\/\/.+\.(?:avif|webp|png|jpe?g)(?:[?#].*)?$/i.test(value) || /^https?:\/\/.+\/images\//i.test(value)
}

function getAmazonImageDedupeKey(url: string): string {
  return url
    .split(/[?#]/)[0]
    .replace(/\._[A-Z0-9_,]+_\.(?=[^.]+$)/i, '.')
}

function normalizeImageCandidates(input: Array<{ url: string; label?: string; isCurrent?: boolean }>): AmazonImageCandidate[] {
  const seen = new Set<string>()
  const candidates: AmazonImageCandidate[] = []
  for (const item of input) {
    const url = item.url.trim()
    const dedupeKey = getAmazonImageDedupeKey(url)
    if (!url || !isHttpImageUrl(url) || seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    candidates.push({
      url,
      label: cleanAmazonText(item.label ?? '') || `商品图片 ${candidates.length + 1}`,
      ...(item.isCurrent ? { isCurrent: true } : {}),
    })
    if (candidates.length >= 12) break
  }
  return candidates
}

function readDynamicImageUrls(value: string | null): string[] {
  if (!value) return []
  const urls: string[] = []
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    for (const key of Object.keys(parsed)) urls.push(key)
  } catch {
    return []
  }
  return urls
}

function readSrcSetUrls(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
}

function readImageElementCandidates(image: Element, label: string, isCurrent = false): Array<{ url: string; label?: string; isCurrent?: boolean }> {
  const rawCandidates: Array<{ url: string; label?: string; isCurrent?: boolean }> = []
  const oldHires = image.getAttribute('data-old-hires')
  const dynamicUrls = readDynamicImageUrls(image.getAttribute('data-a-dynamic-image'))
  if (oldHires) rawCandidates.push({ url: oldHires, label, isCurrent })
  for (const url of dynamicUrls) rawCandidates.push({ url, label, isCurrent })
  for (const url of readSrcSetUrls(image.getAttribute('srcset'))) rawCandidates.push({ url, label, isCurrent })
  const src = image.getAttribute('src')
  if (src && !oldHires && dynamicUrls.length === 0) rawCandidates.push({ url: src, label, isCurrent })
  return rawCandidates
}

function getImageCandidates(document: Document): AmazonImageCandidate[] {
  const rawCandidates: Array<{ url: string; label?: string; isCurrent?: boolean }> = []
  const currentImage = document.querySelector('#landingImage')
    ?? document.querySelector('#imgTagWrapperId img')
    ?? document.querySelector('#main-image-container img')
  if (currentImage) {
    rawCandidates.push(...readImageElementCandidates(currentImage, '当前商品图片', true))
  }

  const images = [
    ...Array.from(document.querySelectorAll('#imgTagWrapperId img, #landingImage, #main-image-container img, #altImages img')),
    ...Array.from(document.querySelectorAll('#imageBlockThumbs img')),
  ]
  for (const image of images) {
    const label = image.getAttribute('alt') ?? undefined
    rawCandidates.push(...readImageElementCandidates(image, label ?? '', false))
  }
  return normalizeImageCandidates(rawCandidates)
}

function buildDraftFromProduct(input: {
  title: string
  bullets: string[]
  details: Record<string, string>
  brand?: string
  category?: string
  color?: string
  material?: string
  packageIncludes?: string
}): Partial<AmazonPromptDraft> {
  const brand = input.brand || findDetail(input.details, [/^brand$/i, /^brand name$/i])
  const color = input.color || findDetail(input.details, [/^colou?r$/i])
  const material = input.material || findDetail(input.details, [/material/i])
  const packageIncludes = input.packageIncludes || findDetail(input.details, [/included components/i, /package includes/i])
  return {
    productTitle: input.title,
    ...(brand ? { brand } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(color ? { color } : {}),
    ...(material ? { material } : {}),
    ...(packageIncludes ? { packageIncludes } : {}),
    ...(input.bullets.length ? { sellingPoints: input.bullets.join('\n') } : {}),
  }
}

export function parseAmazonDomDocument(document: Document, sourceUrl = ''): AmazonDomImportResult {
  const title = cleanAmazonTitle(
    getElementText(document, '#productTitle')
      || getElementValue(document, 'input[name="productTitle"], input#productTitle')
      || getElementText(document, '#pqv-title')
      || getMetaContent(document, 'meta[property="og:title"], meta[name="title"]'),
  )
  const bullets = getAmazonBullets(document)
  const details = readDetailRows(document)
  const byline = cleanAmazonByline(getElementText(document, '#bylineInfo') || getElementText(document, '#pqv-byline'))
  const color = getElementText(document, '#variation_color_name .selection')
    || getElementText(document, '#inline-twister-expanded-dimension-text-color_name')
    || findDetail(details, [/^colou?r$/i])
  const material = findDetail(details, [/material/i])
  const packageIncludes = findDetail(details, [/included components/i, /package includes/i])
  const brand = findDetail(details, [/^brand$/i, /^brand name$/i]) || byline
  const category = findBreadcrumbCategory(document) || findBestSellerCategory(findDetail(details, [/best sellers rank/i]))
  const asin = extractAmazonAsinFromUrl(sourceUrl)
    || getElementValue(document, 'input[name="asin"], input#asin, input[name="ASIN"], input#ASIN').toUpperCase()
  const imageCandidates = getImageCandidates(document)

  if (!title && bullets.length === 0) throw new Error(AMAZON_DOM_PARSE_FAILURE_MESSAGE)

  return {
    ...(asin ? { asin } : {}),
    title,
    bullets,
    details,
    draft: buildDraftFromProduct({ title, bullets, details, brand, category, color, material, packageIncludes }),
    listingText: buildAmazonDomListingText({ title, bullets }),
    imageCandidates,
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

export function encodeAmazonImportPayload(payload: AmazonImportPayload): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
}

export function parseAmazonImportPayload(encoded: string): AmazonDomImportResult {
  const payload = JSON.parse(decodeURIComponent(escape(atob(encoded)))) as AmazonImportPayload
  const title = cleanAmazonTitle(payload.title ?? '')
  const bullets = Array.isArray(payload.bullets) ? payload.bullets.map(cleanAmazonBulletText).filter(Boolean).slice(0, 5) : []
  const details = payload.details ?? {}
  if (!title && bullets.length === 0) throw new Error(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
  const imageCandidates = normalizeImageCandidates(payload.imageCandidates?.length
    ? payload.imageCandidates
    : (payload.imageUrls ?? []).map((url, index) => ({
        url,
        label: `商品图片 ${index + 1}`,
        ...(index === 0 ? { isCurrent: true } : {}),
      })))
  return {
    ...(payload.asin ? { asin: payload.asin } : {}),
    title,
    bullets,
    details,
    draft: buildDraftFromProduct({ title, bullets, details }),
    listingText: buildAmazonDomListingText({ title, bullets }),
    imageCandidates,
  }
}
