import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHAT_MODEL, DEFAULT_RESPONSES_MODEL, createDefaultOpenAIProfile } from './apiProfiles'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from './amazonPrompt'
import {
  buildAmazonAPlusPlanPrompt,
  buildAmazonDspPlanPrompt,
  buildAmazonPlanPrompt,
  buildAmazonStyleCandidatePrompt,
  formatAPlusModuleText,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleSpecs,
  getDspAssetDisplayName,
  getDspAssetGenerationSize,
  getDspAssetUploadSize,
  getDspImageAssetSpecs,
  isAmazonListingMainSlot,
  withDspGenerationSizes,
} from './listingPlanner'
import { callAmazonPlannerApi } from './listingPlannerApi'

const SAMPLE_LISTING = [
  'Title: 40 oz Stainless Steel Insulated Tumbler with Handle and Straw Lid, Matte Black',
  '',
  'About this item',
  '- Keeps drinks cold for 24 hours and hot for 8 hours with double wall vacuum insulation',
  '- Ergonomic handle and slim base fit most car cup holders for commuting and travel',
  '- Leak resistant straw lid and splash proof design for daily use',
  '- Durable 18/8 stainless steel with matte powder coated finish',
  '- Includes reusable straw and cleaning brush, BPA free materials',
].join('\n')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Amazon prompt builders', () => {
  it('uses LLM prompt content, series style guide, density guidance, negative prompt, and optional style guard', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Professional Amazon main image of the exact product.',
      negativePrompt: 'text, logo, extra accessories',
      seriesStyleGuide: 'Use warm studio light and refined charcoal typography across the set.',
      styleReferenceAttached: true,
      styleDensityMode: 'rich',
    })

    expect(prompt).toContain('Professional Amazon main image of the exact product.')
    expect(prompt).toContain('Series style guide:')
    expect(prompt).toContain('Use warm studio light')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('text, logo, extra accessories')
    expect(prompt).toContain('Layout density:')
    expect(prompt).toContain('information-rich Amazon gallery layout')
    expect(prompt).toContain('multiple well-spaced callouts')
    expect(prompt).not.toContain('The last input image is a hidden style reference')
    expect(prompt).toContain('Use the Series style guide text for color palette, lighting, contrast')
    expect(prompt).toContain('color palette, lighting, contrast')
    expect(prompt).toContain('typography feel')
    expect(prompt).toContain('Do not copy any placeholder words, fixed layout')
    expect(prompt).not.toContain('Render only the copy specified below')
    expect(prompt).not.toContain('A+ module requirements:')
  })

  it('adds a confirmed six-view product reference guard for downstream generation', () => {
    const listingPrompt = buildAmazonPlanPrompt({
      prompt: 'Create an Amazon secondary image.',
      negativePrompt: 'wrong product shape',
      sixViewReferenceAttached: true,
    })
    const aPlusPrompt = buildAmazonAPlusPlanPrompt({
      prompt: 'Create an A+ module image.',
      negativePrompt: 'wrong product shape',
      sixViewReferenceAttached: true,
    })
    const dspPrompt = buildAmazonDspPlanPrompt({
      prompt: 'Create a DSP image.',
      negativePrompt: 'wrong product shape',
      sixViewReferenceAttached: true,
    })

    for (const prompt of [listingPrompt, aPlusPrompt, dspPrompt]) {
      expect(prompt).toContain('confirmed standardized six-view product reference')
      expect(prompt).toContain('Preserve the exact product geometry')
      expect(prompt).toContain('Do not invent, bend, warp, tilt, or redesign the product')
      expect(prompt).toContain('If the image task asks for a movable or temporary state')
      expect(prompt).toContain('Treat every other input image as style-only')
      expect(prompt).toContain('Preserve real on-product brand logos')
      expect(prompt).toContain('remove only floating logo overlays')
      expect(prompt).toContain('When the generated image shows a front or top control-panel surface')
      expect(prompt).toContain('keep the real brand wordmark visible on that surface')
    }
  })

  it('builds minimal density guidance when requested', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Create an Amazon secondary image.',
      negativePrompt: 'price, reviews',
      seriesStyleGuide: 'Refined kitchen styling.',
      styleReferenceAttached: true,
      styleDensityMode: 'minimal',
    })

    expect(prompt).toContain('Layout density:')
    expect(prompt).toContain('refined minimal Amazon layout')
    expect(prompt).toContain('fewer callouts')
    expect(prompt).not.toContain('information-rich Amazon gallery layout')
  })

  it('builds MAIN prompts without series style guide or style reference guard when style is disabled', () => {
    const prompt = buildAmazonPlanPrompt({
      prompt: 'Amazon compliant MAIN image on a pure white background.',
      negativePrompt: 'text, props, non-white background',
      seriesStyleGuide: null,
      styleReferenceAttached: false,
    })

    expect(prompt).toContain('Amazon compliant MAIN image')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('text, props, non-white background')
    expect(prompt).not.toContain('Series style guide:')
    expect(prompt).not.toContain('Layout density:')
    expect(prompt).not.toContain('The last input image is a hidden style reference')
  })

  it('identifies the Amazon listing MAIN slot regardless of casing or spacing', () => {
    expect(isAmazonListingMainSlot('MAIN')).toBe(true)
    expect(isAmazonListingMainSlot(' main ')).toBe(true)
    expect(isAmazonListingMainSlot('PT01')).toBe(false)
    expect(isAmazonListingMainSlot(undefined)).toBe(false)
  })

  it('builds A+ prompts with the same LLM-led structure', () => {
    const prompt = buildAmazonAPlusPlanPrompt({
      prompt: 'Premium A+ banner with the product in a refined kitchen setting.',
      negativePrompt: 'pricing, reviews, clutter',
      seriesStyleGuide: 'Bright ceramic editorial style.',
      styleReferenceAttached: false,
    })

    expect(prompt).toContain('Premium A+ banner')
    expect(prompt).toContain('Bright ceramic editorial style')
    expect(prompt).toContain('pricing, reviews, clutter')
    expect(prompt).not.toContain('Layout density:')
    expect(prompt).not.toContain('The last input image is a hidden style reference')
  })

  it('builds style candidate prompts as reusable visual reference boards', () => {
    const prompt = buildAmazonStyleCandidatePrompt({
      label: '极简信息图',
      description: '干净的字体和浅色背景',
      prompt: 'Create a refined information-design style for the product.',
      negativePrompt: 'Chinese characters, QR code, price badge',
    }, 'Use warm off-white backgrounds and charcoal typography.')

    expect(prompt).toContain('Create a refined information-design style for the product.')
    expect(prompt).toContain('visual style reference board')
    expect(prompt).not.toContain('1024x1024 visual style reference board')
    expect(prompt).toContain('typography samples')
    expect(prompt).toContain('color palette swatches')
    expect(prompt).toContain('lighting/material samples')
    expect(prompt).toContain('Do not include a full product hero render')
    expect(prompt).toContain('icon/callout treatment')
    expect(prompt).toContain('PRODUCT TITLE')
    expect(prompt).toContain('Series style guide:')
    expect(prompt).toContain('warm off-white backgrounds')
    expect(prompt).toContain('Negative prompt:')
    expect(prompt).toContain('Chinese characters, QR code, price badge')
  })
})

describe('A+ module helpers', () => {
  it('returns local Chinese module names while preserving English labels', () => {
    const highlightSpec = getAPlusModuleSpecs('standard')[4]!
    const premiumSpec = getAPlusModuleSpecs('premium')[0]!

    expect(getAPlusModuleDisplayName(highlightSpec)).toBe('卖点方块 1')
    expect(getAPlusModuleEnglishName(highlightSpec)).toBe('Highlight Tile 1')
    expect(getAPlusModuleDisplayName(premiumSpec)).toBe('高级首屏横幅')
    expect(getAPlusModuleEnglishName(premiumSpec)).toBe('Hero Banner')
    expect(getAPlusContentTypeLabel('standard-large')).toBe('大图版')
  })

  it('formats external A+ module copy from the LLM', () => {
    expect(formatAPlusModuleText({
      textTitle: 'Organized in Seconds',
      textBody: 'Elastic loops keep pens, pencils, and small tools easy to find.',
    })).toBe('Organized in Seconds\n\nElastic loops keep pens, pencils, and small tools easy to find.')
  })
})

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
    expect(prompt).not.toContain('The last input image is a hidden style reference')
    expect(prompt).toContain('Use the Series style guide text for color palette, lighting, contrast')
  })
})

function createStyleCandidates() {
  return [1, 2, 3].map((index) => ({
    label: `风格 ${index}`,
    description: `第 ${index} 个视觉方向`,
    prompt: `Create style reference ${index} for this product.`,
    negativePrompt: `negative style ${index}`,
  }))
}

function createApiPlans() {
  return ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06'].map((slot) => ({
    slot,
    label: `${slot} 方案`,
    planMarkdown: `## ${slot} 主图方案\n\n中文策划说明。`,
    prompt: `Create Amazon listing image ${slot} for the product.`,
    negativePrompt: `negative ${slot}`,
  }))
}

function createApiPayload(title = 'AI planned tumbler') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand: '',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive warm commercial style across the set.',
    styleCandidates: createStyleCandidates(),
    imagePlans: createApiPlans(),
  }
}

function createAPlusPlans(prefix: 'A+S' | 'A+L' | 'A+P', brand = '') {
  const slots = prefix === 'A+S'
    ? ['A+S01', 'A+S02', 'A+S03', 'A+S04', 'A+S05', 'A+S06', 'A+S07', 'A+S08']
    : prefix === 'A+L'
      ? ['A+L01', 'A+L02', 'A+L03', 'A+L04', 'A+L05']
      : ['A+P01', 'A+P02', 'A+P03', 'A+P04', 'A+P05', 'A+P06']

  return slots.map((slot, index) => ({
    slot,
    label: `${slot} 模块`,
    moduleType: prefix === 'A+S'
      ? index === 0 ? 'header-banner' : index < 4 ? 'single-image' : 'highlight-tile'
      : prefix === 'A+L'
        ? index === 0 ? 'header-banner' : 'single-image'
        : index === 0 ? 'hero-banner' : index < 4 ? 'feature-image' : 'brand-story',
    planMarkdown: `## ${slot} 模块方案\n\n中文 A+ 策划说明。`,
    textTitle: prefix === 'A+S' && index >= 4 ? `Benefit ${slot}` : '',
    textBody: prefix === 'A+S' && index >= 4 ? `External A+ copy for ${slot}.` : '',
    prompt: brand && index === 0
      ? `Create A+ module ${slot} for ${brand}, using the brand name as a small headline line.`
      : `Create A+ module ${slot} for the product.`,
    negativePrompt: `negative ${slot}`,
  }))
}

function createAPlusPayload(prefix: 'A+S' | 'A+L' | 'A+P', title = 'AI planned A+ tumbler', brand = '') {
  return {
    product: {
      title,
      category: 'Kitchen / Drinkware',
      brand,
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive A+ visual style across the module set.',
    styleCandidates: createStyleCandidates(),
    aPlusPlans: createAPlusPlans(prefix, brand),
  }
}

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

describe('callAmazonPlannerApi', () => {
  it('uses Responses API planning with JSON schema and attached reference images', async () => {
    const apiPayload = createApiPayload()
    const controller = new AbortController()
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(apiPayload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      referenceImageDataUrls: ['data:image/png;base64,ref'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      signal: controller.signal,
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/v1/responses')
    expect(init?.signal).toBe(controller.signal)
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe(DEFAULT_RESPONSES_MODEL)
    expect(body.reasoning).toEqual({ effort: 'xhigh' })
    expect(body.instructions).toContain('The application only fixes the slot count and order')
    expect(body.instructions).toContain('Amazon Listing reference material for the planner')
    expect(body.instructions).toContain('pure white background RGB 255,255,255')
    expect(body.instructions).toContain('product fills about 85%')
    expect(body.instructions).toContain('no text, logo, watermark')
    expect(body.instructions).toContain('Do not use Amazon, Prime, Alexa, Amazon Choice')
    expect(body.instructions).toContain('visual style reference board')
    expect(body.instructions).toContain('typography samples')
    expect(body.instructions).toContain('color palette swatches')
    expect(body.instructions).toContain('lighting/material samples')
    expect(body.instructions).toContain('icon/callout treatment')
    expect(body.instructions).toContain('fully plan the finished Amazon image')
    expect(body.instructions).toContain('complete information design')
    expect(body.instructions).not.toContain('sparse copy')
    expect(body.instructions).not.toContain('leave enough whitespace')
    expect(body.instructions).not.toContain('Embedded Amazon Listing knowledge rules')
    expect(body.instructions).not.toContain('mandatory phrase')
    expect(body.text.format.type).toBe('json_schema')
    expect(body.text.format.schema.required).toContain('seriesStyleGuide')
    expect(body.text.format.schema.required).toContain('styleCandidates')
    expect(body.text.format.schema.required).not.toContain('visualSystem')
    expect(body.text.format.schema.properties.product.properties).toHaveProperty('brand')
    expect(body.text.format.schema.properties.imagePlans.items.properties).toHaveProperty('planMarkdown')
    expect(body.text.format.schema.properties.imagePlans.items.properties).toHaveProperty('negativePrompt')
    expect(body.input[0].content[0].text).toContain('Parse this Amazon listing copy')
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,ref' })
    expect(result.parsed.title).toBe('AI planned tumbler')
    expect(result.seriesStyleGuide).toContain('cohesive warm')
    expect(result.styleCandidates).toHaveLength(3)
    expect(result.plans[0]).toMatchObject({
      slot: 'MAIN',
      planMarkdown: expect.stringContaining('MAIN 主图方案'),
      negativePrompt: 'negative MAIN',
    })
  })

  it('uses Chat Completions planning with multimodal user content when references are present', async () => {
    const apiPayload = createApiPayload('DeepSeek planned tumbler')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(apiPayload),
          },
          finish_reason: 'stop',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      referenceImageDataUrls: ['data:image/png;base64,ref-chat'],
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'deepseek-key',
        apiMode: 'chat',
        model: DEFAULT_CHAT_MODEL,
      }),
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body.messages[0].content).toContain('Return a valid JSON object only')
    expect(body.messages[0].content).toContain('product { title, category, brand, color, material, audience, packageIncludes }')
    expect(body.messages[0].content).toContain('styleCandidates array of exactly 3')
    expect(body.messages[0].content).toContain('Amazon Listing reference material for the planner')
    expect(body.messages[0].content).toContain('visual style reference board')
    expect(body.messages[1].content[0]).toMatchObject({ type: 'text' })
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,ref-chat' },
    })
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(result.parsed.title).toBe('DeepSeek planned tumbler')
    expect(result.plans).toHaveLength(7)
  })

  it('fails fast when Listing output repeats a slot and misses a required slot', async () => {
    const payload = createApiPayload()
    const missingSlot = payload.imagePlans[1].slot
    payload.imagePlans[1] = { ...payload.imagePlans[1], slot: payload.imagePlans[0].slot }
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
    })).rejects.toThrow(`AI 策划结果缺少 ${missingSlot} 的图片方案`)
  })

  it('surfaces successful HTTP planner error payloads before reading output text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'insufficient_quota',
        message: '<html><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></html>',
        type: 'permission_error',
      },
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
    })).rejects.toThrow('AI 策划接口返回错误：insufficient_quota；上游返回 Cloudflare 验证页，请检查中转站 Codex OAuth/header 配置')
  })

  it('parses Standard A+ output and fills fixed module sizes without deciding content locally', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(createAPlusPayload('A+S', 'Standard A+ tumbler', 'ExampleBrand')),
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
      mode: 'aplus',
      aPlusType: 'standard',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.text.format.name).toBe('amazon_aplus_image_plan')
    expect(body.text.format.schema.properties.product.properties).toHaveProperty('brand')
    expect(body.text.format.schema.properties.product.required).toContain('brand')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('planMarkdown')
    expect(body.text.format.schema.properties.aPlusPlans.items.properties).toHaveProperty('negativePrompt')
    expect(body.text.format.schema.required).toContain('seriesStyleGuide')
    expect(body.text.format.schema.required).not.toContain('visualSystem')
    expect(body.instructions).toContain('The application only fixes the module order, module type, upload size, and generation size')
    expect(body.instructions).toContain('Amazon A+ reference material for the planner')
    expect(body.instructions).toContain('Header Banner 970x300')
    expect(body.instructions).toContain('Single Image 970x600')
    expect(body.instructions).toContain('Highlight Tile 220x220')
    expect(body.instructions).toContain('Comparison Thumbnail 150x300')
    expect(body.instructions).toContain('QR codes')
    expect(body.instructions).toContain('mobile-readable')
    expect(body.instructions).toContain('visual style reference board')
    expect(body.instructions).toContain('typography samples')
    expect(body.instructions).toContain('color palette swatches')
    expect(body.instructions).toContain('lighting/material samples')
    expect(body.instructions).toContain('fully plan the finished Amazon image')
    expect(body.instructions).toContain('complete information design')
    expect(body.instructions).toContain('Known brand/model: ExampleBrand')
    expect(body.instructions).toContain('small brand line, headline prefix, or subline')
    expect(body.instructions).toContain('Do not invent logo artwork')
    expect(body.instructions).not.toContain('sparse copy')
    expect(body.instructions).not.toContain('leave enough whitespace')
    expect(body.instructions).not.toContain('A+ compliance:')
    expect(result.mode).toBe('aplus')
    expect(result.parsed.inferred.brand).toBe('ExampleBrand')
    expect(result.aPlusPlans).toHaveLength(8)
    expect(result.aPlusPlans[0]).toMatchObject({
      slot: 'A+S01',
      moduleType: 'header-banner',
      uploadSize: '970x300',
      planMarkdown: expect.stringContaining('A+S01 模块方案'),
      prompt: expect.stringContaining('ExampleBrand'),
    })
    expect(result.aPlusPlans[4]).toMatchObject({
      slot: 'A+S05',
      moduleType: 'highlight-tile',
      uploadSize: '220x220',
      textTitle: 'Benefit A+S05',
      textBody: 'External A+ copy for A+S05.',
    })
  })

  it('fails fast when A+ output repeats a slot and misses a required slot', async () => {
    const payload = createAPlusPayload('A+S')
    const missingSlot = payload.aPlusPlans[1].slot
    payload.aPlusPlans[1] = { ...payload.aPlusPlans[1], slot: payload.aPlusPlans[0].slot }
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
      mode: 'aplus',
      aPlusType: 'standard',
    })).rejects.toThrow(`AI A+ 策划结果缺少 ${missingSlot} 的模块方案`)
  })

  it('does not include empty A+ brand output in parsed inferred fields', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(createAPlusPayload('A+S', 'Standard A+ tumbler')),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: { ...DEFAULT_AMAZON_PROMPT_DRAFT, brand: 'ExistingBrand' },
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'user-api-key',
        apiMode: 'responses',
        model: 'gpt-planner-profile',
      }),
      mode: 'aplus',
      aPlusType: 'standard',
      aPlusGenerationTier: '2K',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.instructions).toContain('Known brand/model: ExistingBrand')
    expect(result.parsed.inferred).not.toHaveProperty('brand')
  })

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
    expect(body.instructions).toContain('concise Simplified Chinese')
    expect(body.instructions).toContain('2-4 bullets')
    expect(body.instructions).not.toContain('detailed agent-style plan similar to a ChatGPT web response')
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

  it('includes brand in the DSP Chat Completions schema guide', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(createDspPayload('Chat planned DSP tumbler')),
          },
          finish_reason: 'stop',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createDefaultOpenAIProfile({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'chat-key',
        apiMode: 'chat',
        model: DEFAULT_CHAT_MODEL,
      }),
      mode: 'dsp',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.messages[0].content).toContain('product { title, category, brand, color, material, audience, packageIncludes }')
    expect(body.messages[0].content).toContain('dspPlans must contain exactly')
    expect(result.mode).toBe('dsp')
    expect(result.dspPlans).toHaveLength(getDspImageAssetSpecs().length)
  })

  it('fails fast when DSP output repeats a slot and misses a required slot', async () => {
    const payload = createDspPayload()
    const missingSlot = payload.dspPlans[1].slot
    payload.dspPlans[1] = { ...payload.dspPlans[1], slot: payload.dspPlans[0].slot }
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
    })).rejects.toThrow(`AI DSP 策划结果缺少 ${missingSlot} 的素材方案`)
  })

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
})
