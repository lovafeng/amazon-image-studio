import { describe, expect, it, vi } from 'vitest'
import {
  AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE,
  buildAmazonDomListingText,
  cleanAmazonBulletText,
  extractAmazonAsinFromUrl,
  fetchAmazonDomHtml,
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
