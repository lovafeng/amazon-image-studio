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
  const asin = extractAmazonAsinFromUrl(sourceUrl)

  if (!title && bullets.length === 0) throw new Error(AMAZON_DOM_PARSE_FAILURE_MESSAGE)

  return {
    ...(asin ? { asin } : {}),
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
