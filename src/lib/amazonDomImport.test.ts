import { describe, expect, it, vi } from 'vitest'
import extensionPopupSource from '../../public/amazon-import-extension/popup.js?raw'
import {
  AMAZON_DOM_TRANSFER_EVENT,
  AMAZON_DOM_TRANSFER_STORAGE_KEY,
  AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE,
  buildAmazonDomListingText,
  cleanAmazonBulletText,
  encodeAmazonImportPayload,
  extractAmazonAsinFromUrl,
  fetchAmazonDomHtml,
  parseAmazonImportPayload,
  parseAmazonDomDocument,
  parseAmazonDomTransferPayload,
} from './amazonDomImport'

const FULL_AMAZON_URL = 'https://www.amazon.com/EGGKITPO-Commercial-Stainless-Countertop-Restaurant/dp/B0G1MSW4RW/ref=fabric-ww-slds-dp-fsdpnewarrivals-fa-xcat-unreg_d_sccl_2_3/134-0736988-0770416?pd_rd_w=f3JcG&content-id=amzn1.sym.e25a62e2-5204-48a4-8389-3767244711a3&pf_rd_p=e25a62e2-5204-48a4-8389-3767244711a3&pf_rd_r=WEG8GTSASH1S9NF158Y0&pd_rd_wg=BEAz8&pd_rd_r=5254f4ab-9ff5-469b-9984-07f9eadd54f1&pd_rd_i=B0G1MSW4RW&th=1'

interface TestElement {
  textContent: string
  value?: string
  attributes?: Record<string, string>
  querySelector: (selector: string) => TestElement | null
  getAttribute: (name: string) => string | null
}

function testElement(textContent: string, children: Record<string, TestElement> = {}, value?: string, attributes: Record<string, string> = {}): TestElement {
  return {
    textContent,
    ...(value ? { value } : {}),
    attributes,
    querySelector: (selector) => children[selector] ?? null,
    getAttribute: (name) => attributes[name] ?? null,
  }
}

function testRow(key: string, value: string): TestElement {
  return testElement('', {
    th: testElement(key),
    td: testElement(value),
  })
}

function testDocument(input: {
  elements?: Record<string, TestElement>
  lists?: Record<string, TestElement[]>
}): Document {
  return {
    querySelector: (selector: string) => input.elements?.[selector] ?? null,
    querySelectorAll: (selector: string) => input.lists?.[selector] ?? [],
  } as unknown as Document
}

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

  it('parses product facts from saved Amazon pages that use newer detail sections', () => {
    const document = testDocument({
      elements: {
        '#productTitle': testElement('Typhur Fast Nugget Ice Maker Countertop'),
        '#bylineInfo': testElement(''),
        '#pqv-byline': testElement('From Typhur'),
        '#inline-twister-expanded-dimension-text-color_name': testElement('Piano Black'),
        'input[name="asin"], input#asin, input[name="ASIN"], input#ASIN': testElement('', {}, 'B0FNCXMBBG'),
      },
      lists: {
        '#imgTagWrapperId img, #landingImage, #main-image-container img, #altImages img': [
          testElement('', {}, undefined, { src: 'https://m.media-amazon.com/images/I/main._AC_US40_.jpg', 'data-old-hires': 'https://m.media-amazon.com/images/I/main.jpg', alt: 'main product image' }),
          testElement('', {}, undefined, { src: 'https://m.media-amazon.com/images/I/side._AC_US40_.jpg', alt: 'side detail image' }),
        ],
        '#feature-bullets li span': [
          testElement('FAST ICE PRODUCTION: Produces up to 35 lbs of chewable pebble ice daily.'),
          testElement('ONE-TOUCH DEEP CLEANING WITH HIGH-PRESSURE PUMP: Press Clean to start a 7-minute cycle.'),
          testElement('NEXT-LEVEL CHEWABLE NUGGET ICE: Produces soft crunchy pebble ice.'),
          testElement('COMPACT & QUIET COUNTERTOP DESIGN: Fits apartments, RVs, and small kitchens.'),
          testElement('MODERN STAINLESS-STEEL DESIGN WITH INTUITIVE LED DISPLAY: Easy to monitor.'),
          testElement('Note: Please kindly note that water stains may remain after testing.'),
        ],
        '#productDetails_feature_div tr': [
          testRow('Brand Name', 'Typhur'),
          testRow('Included Components', 'Ice maker x1, Cleaner&Descaler x8, User manual x1, Ice scoop x2, Ice basket x1'),
          testRow('Material Type', 'Plastic, Stainless Steel'),
          testRow('Best Sellers Rank', '#123 in Appliances (See Top 100 in Appliances) #72 in Ice Makers'),
        ],
        '#wayfinding-breadcrumbs_feature_div a': [
          testElement('Appliances'),
          testElement('Refrigerators, Freezers & Ice Makers'),
          testElement('Ice Makers'),
        ],
      },
    })

    const result = parseAmazonDomDocument(document)

    expect(result.asin).toBe('B0FNCXMBBG')
    expect(result.title).toBe('Typhur Fast Nugget Ice Maker Countertop')
    expect(result.bullets).toHaveLength(5)
    expect(result.bullets[0]).toContain('FAST ICE PRODUCTION')
    expect(result.bullets[1]).toContain('ONE-TOUCH DEEP CLEANING')
    expect(result.draft.brand).toBe('Typhur')
    expect(result.draft.category).toBe('Ice Makers')
    expect(result.draft.color).toBe('Piano Black')
    expect(result.draft.material).toBe('Plastic, Stainless Steel')
    expect(result.draft.packageIncludes).toBe('Ice maker x1, Cleaner&Descaler x8, User manual x1, Ice scoop x2, Ice basket x1')
    expect(result.draft.sellingPoints).not.toContain('Note:')
    expect(result.imageCandidates).toEqual([
      { url: 'https://m.media-amazon.com/images/I/main.jpg', label: 'main product image' },
      { url: 'https://m.media-amazon.com/images/I/side._AC_US40_.jpg', label: 'side detail image' },
    ])
    expect(result.listingText).toContain('About this item')
  })

  it('parses visible Amazon bullets and prioritizes the current product image', () => {
    const document = testDocument({
      elements: {
        '#productTitle': testElement('STANLEY IceFlow Stainless Steel Tumbler'),
        '#bylineInfo': testElement('Visit the STANLEY Store'),
        '#variation_color_name .selection': testElement('Rose Quartz'),
        'input[name="asin"], input#asin, input[name="ASIN"], input#ASIN': testElement('', {}, 'B0FAKESTAN'),
        '#landingImage': testElement('', {}, undefined, {
          alt: 'Rose Quartz tumbler current image',
          src: 'https://m.media-amazon.com/images/I/current._AC_SX679_.jpg',
          'data-old-hires': 'https://m.media-amazon.com/images/I/current.jpg',
        }),
      },
      lists: {
        '#feature-bullets li span': [],
        '#feature-bullets .a-list-item': [
          testElement('LEAKPROOF, WORRY-FREE HYDRATION: The locking lid prevents accidental openings.'),
          testElement('COLD THAT KEEPS UP WITH YOU: Double-wall vacuum insulation keeps drinks cold.'),
        ],
        '#productOverview_feature_div tr': [
          testRow('Brand', 'STANLEY'),
          testRow('Material', 'Stainless Steel'),
          testRow('Color', 'Rose Quartz'),
        ],
        '#imgTagWrapperId img, #landingImage, #main-image-container img, #altImages img': [
          testElement('', {}, undefined, {
            alt: 'Rose Quartz tumbler current image',
            src: 'https://m.media-amazon.com/images/I/current._AC_SX679_.jpg',
            'data-old-hires': 'https://m.media-amazon.com/images/I/current.jpg',
          }),
          testElement('', {}, undefined, {
            alt: 'detail image',
            src: 'https://m.media-amazon.com/images/I/detail._AC_US40_.jpg',
          }),
        ],
      },
    })

    const result = parseAmazonDomDocument(document, 'https://www.amazon.com/dp/B0FAKESTAN?th=1')

    expect(result.title).toBe('STANLEY IceFlow Stainless Steel Tumbler')
    expect(result.bullets).toEqual([
      'LEAKPROOF, WORRY-FREE HYDRATION: The locking lid prevents accidental openings.',
      'COLD THAT KEEPS UP WITH YOU: Double-wall vacuum insulation keeps drinks cold.',
    ])
    expect(result.draft.brand).toBe('STANLEY')
    expect(result.draft.color).toBe('Rose Quartz')
    expect(result.draft.material).toBe('Stainless Steel')
    expect(result.imageCandidates[0]).toEqual({
      url: 'https://m.media-amazon.com/images/I/current.jpg',
      label: '当前商品图片',
      isCurrent: true,
    })
  })

  it('parses DOM transfer payloads from the browser extension without changing the source URL', () => {
    const payload = parseAmazonDomTransferPayload({
      sourceUrl: FULL_AMAZON_URL,
      html: '<!doctype html><html><body><h1 id="productTitle">Commercial Ice Maker</h1></body></html>',
    })

    expect(payload.sourceUrl).toBe(FULL_AMAZON_URL)
    expect(payload.html).toContain('Commercial Ice Maker')
  })

  it('sends Amazon DOM through the browser extension instead of encoding product fields in the URL', () => {
    const functionStart = extensionPopupSource.indexOf('function captureDomFromPage()')
    const functionEnd = extensionPopupSource.indexOf('function normalizeStudioUrl')
    const injectedFunctionSource = extensionPopupSource.slice(functionStart, functionEnd)

    expect(extensionPopupSource).not.toContain('#amazon-import=')
    expect(extensionPopupSource).toContain('#amazon-dom-import=1')
    expect(extensionPopupSource).toContain(AMAZON_DOM_TRANSFER_EVENT)
    expect(extensionPopupSource).toContain(AMAZON_DOM_TRANSFER_STORAGE_KEY)
    expect(extensionPopupSource).toContain('window.postMessage')
    expect(injectedFunctionSource).toContain('document.documentElement.cloneNode(true)')
    expect(injectedFunctionSource).toContain('script, style, noscript, iframe')
  })

  it('opens the deployed workbench by default and migrates the old Pages URL', () => {
    expect(extensionPopupSource).toContain("const DEFAULT_STUDIO_URL = 'https://lovafeng.github.io/amazon-image-studio/'")
    expect(extensionPopupSource).toContain("const LEGACY_STUDIO_URLS = ['https://ali-aria.github.io/amazon-image-studio/']")
    expect(extensionPopupSource).toContain('LEGACY_STUDIO_URLS.includes(normalizeStudioUrl(saved.studioUrl)) ? DEFAULT_STUDIO_URL : saved.studioUrl')
  })

  it('parses structured payloads from the browser extension', () => {
    const encoded = encodeAmazonImportPayload({
      asin: 'B0G1MSW4RW',
      title: 'Commercial Ice Maker',
      bullets: ['Produces clear ice quickly'],
      details: {
        Brand: 'EGGKITPO',
        Color: 'Silver',
        Material: 'Stainless Steel',
        'Included Components': 'Ice maker, scoop',
      },
      imageCandidates: [
        { url: 'https://m.media-amazon.com/images/I/main.jpg', label: '当前商品图片', isCurrent: true },
      ],
    })

    const result = parseAmazonImportPayload(encoded)

    expect(result.asin).toBe('B0G1MSW4RW')
    expect(result.title).toBe('Commercial Ice Maker')
    expect(result.draft.brand).toBe('EGGKITPO')
    expect(result.draft.color).toBe('Silver')
    expect(result.draft.material).toBe('Stainless Steel')
    expect(result.draft.packageIncludes).toBe('Ice maker, scoop')
    expect(result.imageCandidates).toEqual([{ url: 'https://m.media-amazon.com/images/I/main.jpg', label: '当前商品图片', isCurrent: true }])
    expect(result.listingText).toContain('- Produces clear ice quickly')
  })
})
