import type { AmazonImageKind, AmazonPromptDraft } from './amazonPrompt'
import type { AmazonStyleDensityMode } from '../types'
import { calculateImageSize, type SizeTier } from './size'

export type AmazonPlannerMode = 'listing' | 'aplus' | 'dsp'
export type { AmazonStyleDensityMode } from '../types'
export type APlusContentType = 'standard' | 'standard-large' | 'premium'
export type APlusModuleKind =
  | 'header-banner'
  | 'single-image'
  | 'highlight-tile'
  | 'hero-banner'
  | 'feature-image'
  | 'brand-story'
  | 'logo'
  | 'comparison-thumbnail'

export interface ListingParseResult {
  title: string
  bullets: string[]
  inferred: Partial<AmazonPromptDraft>
}

export interface AmazonStyleCandidate {
  label: string
  description: string
  prompt: string
  negativePrompt: string
}

export interface AmazonImagePlan {
  slot: string
  label: string
  kind?: AmazonImageKind
  planMarkdown: string
  prompt: string
  negativePrompt: string
}

export interface AmazonAPlusModuleSpec {
  contentType: APlusContentType | 'optional'
  slot: string
  label: string
  displayLabel: string
  moduleType: APlusModuleKind
  uploadWidth: number
  uploadHeight: number
  objective: string
}

export interface AmazonAPlusPlan {
  slot: string
  label: string
  moduleType: APlusModuleKind
  uploadSize: string
  generationSize: string
  planMarkdown: string
  textTitle: string
  textBody: string
  prompt: string
  negativePrompt: string
}

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

export const STANDARD_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'standard',
    slot: 'A+S01',
    label: 'Header Banner',
    displayLabel: '顶部横幅',
    moduleType: 'header-banner',
    uploadWidth: 970,
    uploadHeight: 300,
    objective: '用横幅建立品牌质感和核心产品利益点。',
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: 'standard' as const,
    slot: `A+S0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: 'single-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用单图模块讲清一个关键卖点或使用场景。',
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: 'standard' as const,
    slot: `A+S0${index + 5}`,
    label: `Highlight Tile ${index + 1}`,
    displayLabel: `卖点方块 ${index + 1}`,
    moduleType: 'highlight-tile' as const,
    uploadWidth: 220,
    uploadHeight: 220,
    objective: '用方形图块快速呈现一个产品亮点。',
  })),
]

export const STANDARD_LARGE_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'standard-large',
    slot: 'A+L01',
    label: 'Header Banner',
    displayLabel: '顶部横幅',
    moduleType: 'header-banner',
    uploadWidth: 970,
    uploadHeight: 300,
    objective: '用横幅建立品牌质感和核心产品利益点。',
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    contentType: 'standard-large' as const,
    slot: `A+L0${index + 2}`,
    label: `Single Image ${index + 1}`,
    displayLabel: `大图模块 ${index + 1}`,
    moduleType: 'single-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用整张大图讲清一个关键卖点、使用场景或细节证据。',
  })),
]

export const PREMIUM_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'premium',
    slot: 'A+P01',
    label: 'Hero Banner',
    displayLabel: '高级首屏横幅',
    moduleType: 'hero-banner',
    uploadWidth: 1464,
    uploadHeight: 600,
    objective: '用高级横幅建立首屏视觉冲击和品牌氛围。',
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    contentType: 'premium' as const,
    slot: `A+P0${index + 2}`,
    label: `Feature Image ${index + 1}`,
    displayLabel: `高级大图模块 ${index + 1}`,
    moduleType: 'feature-image' as const,
    uploadWidth: 970,
    uploadHeight: 600,
    objective: '用大图模块展示核心功能、材质或真实场景。',
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    contentType: 'premium' as const,
    slot: `A+P0${index + 5}`,
    label: `Brand Story ${index + 1}`,
    displayLabel: `品牌故事 ${index + 1}`,
    moduleType: 'brand-story' as const,
    uploadWidth: 463,
    uploadHeight: 625,
    objective: '用竖版品牌故事模块强化信任和使用想象。',
  })),
]

export const OPTIONAL_A_PLUS_MODULE_SPECS: AmazonAPlusModuleSpec[] = [
  {
    contentType: 'optional',
    slot: 'A+LOGO',
    label: 'Logo Image',
    displayLabel: '品牌 Logo',
    moduleType: 'logo',
    uploadWidth: 600,
    uploadHeight: 180,
    objective: '用于已有品牌标志素材，不默认生成虚构 Logo。',
  },
  {
    contentType: 'optional',
    slot: 'A+CMP',
    label: 'Comparison Thumbnail',
    displayLabel: '对比缩略图',
    moduleType: 'comparison-thumbnail',
    uploadWidth: 150,
    uploadHeight: 300,
    objective: '用于同品牌 SKU 对比，不默认生成不确定对比信息。',
  },
]

const CUSTOM_DSP_COMMON_RULES = [
  'Include a clear specific CTA such as Shop now, Add to Cart, or Learn more.',
  'Do not use vague CTA copy such as Click Here.',
  'Shop now must be plain text only, not a button.',
  'Include a clear brand logo or reserved logo area; logo and product image must be sharp.',
  'Use no more than two fonts.',
  'Keep on-image copy within 10 English words.',
  'Avoid overly strong exclamation marks, urgency, or aggressive punctuation.',
  'Use a visible 1px border or high-contrast background; do not use a pure white border, black is preferred.',
  'Do not mimic Amazon website content and do not use a pure white background.',
]

const SEMI_AUTO_DSP_RULES = [
  'Do not include a CTA.',
  'Logo and product image must be sharp.',
  'Use no more than two fonts.',
  'Keep on-image copy within 10 English words.',
  'Avoid overly strong exclamation marks, urgency, or aggressive punctuation.',
  'Use a visible 1px border or high-contrast background; do not use a pure white border, black is preferred.',
]

const CUSTOM_DSP_IMAGE_SIZES: Array<{ width: number; height: number; fileLimit: string }> = [
  { width: 300, height: 250, fileLimit: '50KB' },
  { width: 728, height: 90, fileLimit: '50KB' },
  { width: 160, height: 600, fileLimit: '50KB' },
  { width: 300, height: 600, fileLimit: '50KB' },
  { width: 970, height: 250, fileLimit: '200KB' },
  { width: 980, height: 55, fileLimit: '50KB' },
  { width: 320, height: 50, fileLimit: '50KB' },
  { width: 600, height: 500, fileLimit: '200KB' },
  { width: 1242, height: 375, fileLimit: '200KB' },
  { width: 640, height: 100, fileLimit: '200KB' },
]

export const DSP_ASSET_SPECS: AmazonDspAssetSpec[] = [
  {
    group: 'rec',
    slot: 'DSP-REC-LOGO',
    label: 'REC Logo',
    displayLabel: 'REC Logo',
    assetType: 'logo',
    minimumWidth: 600,
    minimumHeight: 100,
    fileLimit: '1000KB',
    formats: ['JPG', 'PNG'],
    ctaPolicy: 'not-applicable',
    objective: '用于 DSP REC 自动素材的品牌 Logo。',
    rules: [
      'Logo must be 600x100 or larger.',
      'Logo file must be 1000KB or smaller.',
      'Use JPG or PNG.',
    ],
  },
  {
    group: 'rec',
    slot: 'DSP-REC-SLOGAN',
    label: 'REC Slogan',
    displayLabel: 'REC Slogan',
    assetType: 'slogan',
    fileLimit: '50 characters',
    ctaPolicy: 'not-applicable',
    objective: '用于 DSP REC 自动素材的短 Slogan。',
    rules: [
      'Slogan must be 50 characters or fewer.',
      'Keep slogan concise and brand-safe.',
    ],
  },
  ...CUSTOM_DSP_IMAGE_SIZES.map(({ width, height, fileLimit }) => ({
    group: 'custom-image' as const,
    slot: `DSP-CUSTOM-${width}x${height}`,
    label: `Custom Image ${width}x${height}`,
    displayLabel: `Custom Image ${width}x${height}`,
    assetType: 'image' as const,
    uploadWidth: width,
    uploadHeight: height,
    fileLimit,
    ctaPolicy: 'required' as const,
    objective: `DSP Custom Image ${width}x${height} 广告素材。`,
    rules: [
      ...(width === 970 && height === 250
        ? ['For 970x250, use plain text or underlined text CTA, not a button.']
        : ['CTA may use button styling when composition allows.']),
      ...CUSTOM_DSP_COMMON_RULES,
    ],
  })),
  {
    group: 'semi-auto-rec',
    slot: 'DSP-REC-600x600',
    label: 'Semi-auto REC 600x600',
    displayLabel: '半自动 REC 600x600',
    assetType: 'image',
    uploadWidth: 600,
    uploadHeight: 600,
    fileLimit: '5MB',
    ctaPolicy: 'forbidden',
    objective: '优先使用的 DSP 半自动 REC 图片素材。',
    rules: SEMI_AUTO_DSP_RULES,
  },
]

const CJK_ON_IMAGE_TEXT_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/
const STYLE_REFERENCE_GUARD = [
  'Style reference rule:',
  '- The last input image is a hidden style reference selected by the user.',
  '- Use it only for color palette, lighting, contrast, material finish, typography feel, and overall visual polish.',
  '- Do not copy any placeholder words, fixed layout, color swatch positions, exact composition, product arrangement, product count, props, scene, or information density from the style reference board.',
  '- Follow the image task, layout density, and negative prompt sections for the actual content and arrangement.',
].join('\n')

const STYLE_DENSITY_GUIDES: Record<AmazonStyleDensityMode, string> = {
  rich: [
    'Layout density:',
    '- Use a polished, information-rich Amazon gallery layout when the selected image type benefits from explanation.',
    '- Build clear hierarchy with mobile-readable US-English copy, multiple well-spaced callouts, detail crops, comparison areas, measurement arrows, or use-case zones as appropriate.',
    '- Keep the composition premium and organized; information-rich should still be readable, balanced, and uncluttered.',
  ].join('\n'),
  minimal: [
    'Layout density:',
    '- Use a refined minimal Amazon layout with fewer callouts, generous balanced spacing, light icon or line treatment, and restrained US-English copy.',
    '- Keep the product and one or two strongest messages dominant, with clean hierarchy and no clutter.',
  ].join('\n'),
}

const STYLE_REFERENCE_BOARD_REQUIREMENTS = [
  'Style reference board requirements:',
  '- Create a visual style reference board, not a final Amazon product image.',
  '- The board must visibly include typography samples: a large headline, a smaller subheading, numeric callout samples, short label/caption samples, and icon/callout treatment.',
  '- Use generic English placeholder typography only, such as PRODUCT TITLE, KEY BENEFIT, DETAIL CALLOUT, 01, 02, 03. Do not use Chinese characters, real product claims, brand logos, Amazon marks, prices, promotions, QR codes, contact details, or external URLs.',
  '- The board must visibly include color palette swatches, background/material texture samples, lighting/material samples, and a small product-finish or product-detail style sample derived from the uploaded product references.',
  '- Keep this as a reusable style guide image for later generations, with clear examples of font feeling, color tone, lighting, material finish, icon/callout language, and visual polish.',
].join('\n')

export function isAmazonListingMainSlot(slot?: string | null): boolean {
  return slot?.trim().toUpperCase() === 'MAIN'
}

export function normalizeOnImageCopy(copy: string): string {
  return copy
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !CJK_ON_IMAGE_TEXT_RE.test(line))
    .join('\n')
}

function formatPromptBlock(options: {
  prompt: string
  negativePrompt?: string
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
}) {
  const sections = [
    options.prompt.trim(),
    options.seriesStyleGuide?.trim()
      ? `Series style guide:\n${options.seriesStyleGuide.trim()}`
      : '',
    options.styleReferenceAttached ? STYLE_DENSITY_GUIDES[options.styleDensityMode ?? 'rich'] : '',
    options.negativePrompt?.trim()
      ? `Negative prompt:\n${options.negativePrompt.trim()}`
      : '',
    options.styleReferenceAttached ? STYLE_REFERENCE_GUARD : '',
  ].filter(Boolean)

  return sections.join('\n\n')
}

export function buildAmazonPlanPrompt(plan: Pick<AmazonImagePlan, 'prompt' | 'negativePrompt'> & {
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
}): string {
  return formatPromptBlock(plan)
}

export function buildAmazonStyleCandidatePrompt(candidate: AmazonStyleCandidate, seriesStyleGuide?: string | null) {
  return [
    candidate.prompt.trim(),
    STYLE_REFERENCE_BOARD_REQUIREMENTS,
    seriesStyleGuide?.trim() ? `Series style guide:\n${seriesStyleGuide.trim()}` : '',
    candidate.negativePrompt.trim() ? `Negative prompt:\n${candidate.negativePrompt.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

function formatAPlusUploadSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>): string {
  return `${spec.uploadWidth}x${spec.uploadHeight}`
}

function getSafeAPlusRatio(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 3) return '3:1'
  if (ratio < 1 / 3) return '1:3'
  return `${width}:${height}`
}

function getAPlusGenerationSizeFromDimensions(width: number, height: number, tier: SizeTier): string {
  return calculateImageSize(tier, getSafeAPlusRatio(width, height)) ?? (tier === '4K' ? '2880x2880' : '2048x2048')
}

export function getAPlusModuleSpecs(type: APlusContentType): AmazonAPlusModuleSpec[] {
  switch (type) {
    case 'premium':
      return PREMIUM_A_PLUS_MODULE_SPECS
    case 'standard-large':
      return STANDARD_LARGE_A_PLUS_MODULE_SPECS
    default:
      return STANDARD_A_PLUS_MODULE_SPECS
  }
}

export function findAPlusModuleSpec(slot: string): AmazonAPlusModuleSpec | undefined {
  return [...STANDARD_A_PLUS_MODULE_SPECS, ...STANDARD_LARGE_A_PLUS_MODULE_SPECS, ...PREMIUM_A_PLUS_MODULE_SPECS, ...OPTIONAL_A_PLUS_MODULE_SPECS]
    .find((spec) => spec.slot === slot)
}

export function getAPlusContentTypeLabel(type: APlusContentType): string {
  switch (type) {
    case 'premium':
      return 'Premium'
    case 'standard-large':
      return '大图版'
    default:
      return 'Standard'
  }
}

export function getAPlusModuleDisplayName(module: Pick<AmazonAPlusPlan, 'slot' | 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'slot' | 'moduleType'>): string {
  const spec = findAPlusModuleSpec(module.slot)
  if (spec) return spec.displayLabel

  switch (module.moduleType) {
    case 'header-banner':
      return '顶部横幅'
    case 'single-image':
      return '大图模块'
    case 'highlight-tile':
      return '卖点方块'
    case 'hero-banner':
      return '高级首屏横幅'
    case 'feature-image':
      return '高级大图模块'
    case 'brand-story':
      return '品牌故事'
    case 'logo':
      return '品牌 Logo'
    case 'comparison-thumbnail':
      return '对比缩略图'
    default:
      return 'A+ 模块'
  }
}

export function getAPlusModuleEnglishName(module: Pick<AmazonAPlusPlan, 'slot' | 'label' | 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'slot' | 'label' | 'moduleType'>): string {
  return findAPlusModuleSpec(module.slot)?.label ?? module.label ?? module.moduleType
}

export function isAPlusTextModule(module: Pick<AmazonAPlusPlan, 'moduleType'> | Pick<AmazonAPlusModuleSpec, 'moduleType'>): boolean {
  return module.moduleType === 'highlight-tile'
}

export function formatAPlusModuleText(plan: Pick<AmazonAPlusPlan, 'textTitle' | 'textBody'>): string {
  return [plan.textTitle.trim(), plan.textBody.trim()].filter(Boolean).join('\n\n')
}

export function getAPlusModuleUploadSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>): string {
  return formatAPlusUploadSize(spec)
}

export function getAPlusModuleGenerationSize(spec: Pick<AmazonAPlusModuleSpec, 'uploadWidth' | 'uploadHeight'>, tier: SizeTier): string {
  return getAPlusGenerationSizeFromDimensions(spec.uploadWidth, spec.uploadHeight, tier)
}

export function getAPlusPlanGenerationSize(plan: Pick<AmazonAPlusPlan, 'slot' | 'uploadSize'>, tier: SizeTier): string {
  const spec = findAPlusModuleSpec(plan.slot)
  if (spec) return getAPlusModuleGenerationSize(spec, tier)

  const match = plan.uploadSize.match(/^(\d+)x(\d+)$/)
  if (!match) return tier === '4K' ? '2880x2880' : '2048x2048'
  return getAPlusGenerationSizeFromDimensions(Number(match[1]), Number(match[2]), tier)
}

export function withAPlusGenerationSizes(plans: AmazonAPlusPlan[], tier: SizeTier): AmazonAPlusPlan[] {
  return plans.map((plan) => ({
    ...plan,
    generationSize: getAPlusPlanGenerationSize(plan, tier),
  }))
}

export function getDspImageAssetSpecs(): AmazonDspAssetSpec[] {
  return DSP_ASSET_SPECS.filter((spec) => spec.assetType === 'image')
}

export function findDspAssetSpec(slot: string): AmazonDspAssetSpec | undefined {
  return DSP_ASSET_SPECS.find((spec) => spec.slot === slot)
}

export function getDspAssetDisplayName(asset: Pick<AmazonDspPlan, 'slot' | 'label'> | Pick<AmazonDspAssetSpec, 'slot' | 'label' | 'displayLabel'>): string {
  const spec = findDspAssetSpec(asset.slot)
  return spec?.displayLabel ?? ('displayLabel' in asset ? asset.displayLabel : asset.label)
}

export function getDspAssetUploadSize(spec: Pick<AmazonDspAssetSpec, 'uploadWidth' | 'uploadHeight' | 'minimumWidth' | 'minimumHeight' | 'assetType'>): string {
  if (spec.uploadWidth && spec.uploadHeight) return `${spec.uploadWidth}x${spec.uploadHeight}`
  if (spec.minimumWidth && spec.minimumHeight) return `${spec.minimumWidth}x${spec.minimumHeight}+`
  if (spec.assetType === 'slogan') return '50 characters'
  return ''
}

export function getDspAssetGenerationSize(spec: Pick<AmazonDspAssetSpec, 'uploadWidth' | 'uploadHeight'>, tier: SizeTier): string {
  if (!spec.uploadWidth || !spec.uploadHeight) return ''
  return getAPlusGenerationSizeFromDimensions(spec.uploadWidth, spec.uploadHeight, tier)
}

export function getDspPlanGenerationSize(plan: Pick<AmazonDspPlan, 'slot' | 'uploadSize'>, tier: SizeTier): string {
  const spec = findDspAssetSpec(plan.slot)
  if (spec) return getDspAssetGenerationSize(spec, tier)

  const match = plan.uploadSize.match(/^(\d+)x(\d+)$/)
  if (!match) return tier === '4K' ? '2880x2880' : '2048x2048'
  return getAPlusGenerationSizeFromDimensions(Number(match[1]), Number(match[2]), tier)
}

export function withDspGenerationSizes(plans: AmazonDspPlan[], tier: SizeTier): AmazonDspPlan[] {
  return plans.map((plan) => {
    const spec = findDspAssetSpec(plan.slot)
    return {
      ...plan,
      ...(spec ? {
        label: plan.label || spec.label,
        group: spec.group,
        assetType: spec.assetType,
        uploadSize: getDspAssetUploadSize(spec),
        fileLimit: spec.fileLimit,
        ctaPolicy: spec.ctaPolicy,
      } : {}),
      generationSize: getDspPlanGenerationSize(plan, tier),
    }
  })
}

export function buildAmazonAPlusPlanPrompt(plan: Pick<AmazonAPlusPlan, 'prompt' | 'negativePrompt'> & {
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
}): string {
  return formatPromptBlock(plan)
}

export function buildAmazonDspPlanPrompt(plan: Pick<AmazonDspPlan, 'prompt' | 'negativePrompt'> & {
  seriesStyleGuide?: string | null
  styleReferenceAttached?: boolean
  styleDensityMode?: AmazonStyleDensityMode
}): string {
  return formatPromptBlock(plan)
}
