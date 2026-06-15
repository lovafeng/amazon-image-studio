import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { addImageFromFile, addImageFromUrl, ensureImageCached, ensureImageThumbnailCached, subscribeImageThumbnail, submitTask, submitTaskAndGetTask, useStore } from '../store'
import { createOpenAIInputImageProfile, getAmazonPlannerProfile, getDefaultImageProfile, normalizeSettings, validateApiProfile } from '../lib/apiProfiles'
import {
  DEFAULT_AMAZON_PROMPT_DRAFT,
  type AmazonPromptDraft,
} from '../lib/amazonPrompt'
import {
  buildAmazonAPlusPlanPrompt,
  buildAmazonDspPlanPrompt,
  buildAmazonPlanPrompt,
  buildAmazonStyleCandidatePrompt,
  DSP_ASSET_SPECS,
  formatAPlusModuleText,
  getAPlusContentTypeLabel,
  getAPlusModuleDisplayName,
  getAPlusModuleEnglishName,
  getAPlusModuleGenerationSize,
  getAPlusModuleSpecs,
  getAPlusModuleUploadSize,
  getDspAssetDisplayName,
  getDspAssetGenerationSize,
  getDspAssetUploadSize,
  getDspImageAssetSpecs,
  isAmazonListingMainSlot,
  isAPlusTextModule,
  withAPlusGenerationSizes,
  withDspGenerationSizes,
  type APlusContentType,
  type AmazonAPlusPlan,
  type AmazonDspPlan,
  type AmazonImagePlan,
  type AmazonPlannerMode,
  type AmazonStyleCandidate,
  type AmazonStyleDensityMode,
} from '../lib/listingPlanner'
import { callAmazonPlannerApi, type PlannerApiResult } from '../lib/listingPlannerApi'
import { deriveProductionGuideState, getProductionEstimate, summarizePlannerBatchTasks, type ProductionStageId } from '../lib/plannerProductionGuide'
import { buildStyleReferenceLibrary, type StyleReferenceLibraryItem } from '../lib/styleReferenceLibrary'
import { callImageApi } from '../lib/api'
import { AMAZON_DRAFT_QUALITY } from '../lib/amazonGeneration'
import { deleteProductWorkspace, getAllProductWorkspaces, putProductWorkspace, storeImage } from '../lib/db'
import { normalizeParamsForSettings } from '../lib/paramCompatibility'
import { prepareReferenceImagePayload, type PlannerReferenceImagePayload } from '../lib/referenceImagePayload'
import { buildStandardSixViewPrompt, createEmptyProductWorkspace, createProductWorkspaceSixViewVersion, getConfirmedSixViewVersion, getStandardSixViewSourceImageIds } from '../lib/productWorkspace'
import { ACTIVE_PRODUCT_WORKSPACE_REFERENCES_CLEAR_EVENT } from '../lib/productWorkspaceEvents'
import {
  AMAZON_DOM_TRANSFER_EVENT,
  AMAZON_DOM_TRANSFER_STORAGE_KEY,
  AMAZON_DOM_PARSE_FAILURE_MESSAGE,
  AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE,
  importAmazonDomFromUrl,
  parseAmazonImportPayload,
  parseAmazonDomHtml,
  parseAmazonDomTransferPayload,
  type AmazonDomImportResult,
} from '../lib/amazonDomImport'
import { DEFAULT_PARAMS } from '../types'
import type { AmazonPlannerSelectedStyleReference, ApiProfile, InputImage, ProductWorkspace, ProductWorkspaceSixViewVersion, TaskRecord } from '../types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, DownloadIcon, EyeIcon, HistoryIcon, ImportIcon, PhotoIcon, PlusIcon, TrashIcon } from './icons'
import PlannerProductionGuide from './PlannerProductionGuide'
import StyleReferenceLibrary from './StyleReferenceLibrary'

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const PLAN_LIST_CLASS = 'grid max-h-[420px] gap-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar sm:max-h-[480px]'
const GUIDE_HINT_CLASS = 'mb-3 rounded-lg border border-blue-200 bg-white/85 px-3 py-2 text-xs font-medium leading-relaxed text-blue-800 shadow-sm dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100'
const API_MAX_IMAGES = 16
const STYLE_PREVIEW_WIDTH = 420
const STYLE_PREVIEW_HEIGHT = 500
const STYLE_PREVIEW_OFFSET = 16
const AMAZON_IMPORT_EXTENSION_ZIP = 'amazon-image-studio-amazon-importer.zip'
const SIX_VIEW_CELL_CROP_STYLES = {
  leftSide: '100% 0%',
  rightSide: '0% 100%',
  top: '50% 100%',
  bottom: '100% 100%',
}
const SIX_VIEW_CELL_CROP_TRANSFORMS = {
  leftSide: 'translate(-66.666667%, 0)',
  rightSide: 'translate(0, -50%)',
  top: 'translate(-33.333333%, -50%)',
  bottom: 'translate(-66.666667%, -50%)',
}
const STYLE_DENSITY_OPTIONS: Array<{ value: AmazonStyleDensityMode; label: string }> = [
  { value: 'rich', label: '信息丰富' },
  { value: 'minimal', label: '简约' },
]
const SIX_VIEW_REFERENCE_GUIDANCE = [
  '建议上传 3-6 张同一产品多视角参考图',
  '优先包含正面、背面、左右侧、顶部/俯视、底部/结构细节',
  'logo/文字区域清晰无遮挡',
  '顶部或底部缺图时，确认前重点检查第 5/6 格',
  '同一颜色和同一型号，不混用竞品或旧版结构',
]
const SIX_VIEW_CONFIRMATION_CHECKS = [
  '正视图 logo/品牌字样可见',
  '第 5 格（底部中间）是真正垂直俯视，不是前上方透视',
  '第 6 格（底部右侧）是真正底视，脚垫/通风口方向可信',
  '可见面的 logo、标贴、图标、文字没有丢失或移位',
  '颜色、材质、金属/塑料/透明件质感与参考图一致',
  '机身比例、侧面把手、通风口、脚垫一致',
  '盖子/门板/把手/铰链等可动结构保持一致',
]
const SIX_VIEW_REPAIR_PRESETS = [
  {
    label: '修正俯视',
    prompt: '只修正第 5 格（底部中间）的 top view：必须是真正从正上方垂直看的正交俯视，只显示顶部轮廓、顶部表面、边唇/开口、上方可见的把手或控制件投影；禁止出现前脸高度、后脸高度、侧墙高度、正面控制面板、抽屉正面、向下悬挂的把手、三分之四或前上方透视。其他 5 格尽量保持不变。',
  },
  {
    label: '修正底视',
    prompt: '只修正第 6 格（底部右侧）的 bottom view：必须是真正从正下方垂直看的底部正交视图，清楚保留底部轮廓、脚垫、通风口、底盖、螺丝位或底部结构；禁止后下方、侧下方或三分之四透视。其他 5 格尽量保持不变。',
  },
  {
    label: '补回 logo',
    prompt: '补回所有可见产品表面的真实品牌 logo/wordmark、型号字样、控制面板印刷、标贴和贴纸，不要把它画成浮动 logo、额外贴纸或角落装饰。',
  },
  {
    label: '锁定结构',
    prompt: '综合正面、背面、左右侧、俯视和底视来锁定机身比例、厚度、顶部轮廓、侧面把手、通风口、脚垫和底部结构，保持与参考图一致，禁止方盒化、拉伸、歪斜、扭转或结构变形。',
  },
  {
    label: '锁定可动结构',
    prompt: '锁定所有可开合或可移动结构，包括盖子、门板、翻盖、面板、铰链、卡扣、把手、篮筐、托盘、边唇、圆角、斜面、厚度、透明度和开合角度，保持参考图真实几何，禁止拉直、方形化、简化或替换成通用平板。',
  },
  {
    label: '修正使用状态',
    prompt: '修正开盖、冰篮、托盘等使用状态，只调整临时状态，不改变产品永久结构和外壳轮廓。',
  },
]
type ComplianceStatus = 'ready' | 'warning' | 'missing'
type WorkflowStepStatus = 'done' | 'current' | 'todo'
type PlannerGuideTarget = 'planner-api' | 'planner-input' | 'planner-action' | 'style' | 'style-choice' | 'plan-list' | 'action-bar'
type PlannerGuideState = {
  target: PlannerGuideTarget
  message: string
}
type GuidePanelTone = 'white' | 'muted'
type PlannerActionProgress = 'filled' | 'submitted'
type PlannerActionProgressMap = Record<string, PlannerActionProgress>
type PlannerRunStage = 'idle' | 'reference' | 'planning' | 'saving'
type BatchGenerateJob = {
  actionKey: string
  slot: string
  prompt: string
  targetSize: string
  category: NonNullable<TaskRecord['category']>
}
type AmazonPlannerResolution = '1k' | '2k' | '4k'
type StyleImageState = {
  candidateIndex: number
  status: 'running' | 'done' | 'error'
  imageId?: string
  dataUrl?: string
  error?: string
}
type StylePreviewState = {
  dataUrl: string
  label: string
  description: string
  left: number
  top: number
}
const PLANNER_HISTORY_LIMIT = 30
type PlannerSeriesStyleGuides = {
  listing: string
  aplus: string
  dsp: string
}

function getDraftPlannerActionGuidance(options: {
  plannerMode: AmazonPlannerMode
  hasSelectedPlan: boolean
  currentActionSubmitted: boolean
  currentActionFilled: boolean
  canGoNext: boolean
  actionSlot?: string | null
  actionKindLabel: string
  styleReferenceRequired: boolean
  hasStyleReference: boolean
  styleReferenceLimitExceeded: boolean
  effectiveReferenceCount: number
  apiMaxImages: number
}) {
  const slot = options.actionSlot ?? '当前'
  if (!options.hasSelectedPlan) return options.plannerMode === 'aplus' ? '先选择一个 A+ 模块' : options.plannerMode === 'dsp' ? '先选择一个 DSP 素材' : '先选择一个图片位'
  if (options.currentActionSubmitted) return `已提交 ${slot} ${options.actionKindLabel}草稿，${options.canGoNext ? '点击下一张继续' : '已是最后一张'}`
  if (options.styleReferenceRequired && !options.hasStyleReference) return `请先生成并选择一张风格板，${slot} ${options.actionKindLabel}才能生成草稿`
  if (options.styleReferenceLimitExceeded) return `实际发送参考图共 ${options.effectiveReferenceCount} 张，超过上限 ${options.apiMaxImages} 张，请调整原始参考图或风格板后再提交草稿。`
  if (options.currentActionFilled) return '已填入右侧输入框，下一步提交草稿'
  return `可生成当前 ${slot} ${options.actionKindLabel}草稿，也可先填入提示词检查`
}

function getDraftBatchSubmitStatusText(options: {
  isBatchSubmitting: boolean
  batchSubmittedCount: number
  visiblePlanCount: number
  visibleUnsubmittedPlanCount?: number
  submittedVisiblePlanCount: number
  seriesStyleReferenceNeeded: boolean
  hasStyleReference: boolean
}) {
  const unsubmittedCount = options.visibleUnsubmittedPlanCount ?? Math.max(0, options.visiblePlanCount - options.submittedVisiblePlanCount)
  if (options.isBatchSubmitting) return `已提交 ${options.batchSubmittedCount}/${unsubmittedCount} 张草稿`
  if (options.seriesStyleReferenceNeeded && !options.hasStyleReference) {
    return options.submittedVisiblePlanCount > 0
      ? `已提交 ${options.submittedVisiblePlanCount}/${options.visiblePlanCount} 张草稿；先选择风格板后可继续提交未提交草稿`
      : '先选择风格板后可提交未提交草稿'
  }
  if (unsubmittedCount === 0 && options.visiblePlanCount > 0) return `已全部提交 ${options.visiblePlanCount}/${options.visiblePlanCount} 张草稿`
  if (options.submittedVisiblePlanCount > 0) return `已提交 ${options.submittedVisiblePlanCount}/${options.visiblePlanCount} 张草稿`
  return `准备提交 ${unsubmittedCount} 张未提交草稿`
}

function normalizeSeriesStyleGuides(value?: Partial<PlannerSeriesStyleGuides> | null): PlannerSeriesStyleGuides {
  return {
    listing: value?.listing ?? '',
    aplus: value?.aplus ?? '',
    dsp: value?.dsp ?? '',
  }
}

function getPlannerModeLabel(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return 'A+ 图'
    case 'dsp':
      return 'DSP 图'
    default:
      return 'Listing 图'
  }
}

export function formatPlannerElapsedLabel(elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')
  const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function getPlannerRunningMessage(mode: AmazonPlannerMode, elapsedSeconds: number, stage: PlannerRunStage = 'planning') {
  const elapsed = `已用 ${formatPlannerElapsedLabel(elapsedSeconds)}`
  const stageText = stage === 'reference'
    ? '正在处理参考图'
    : stage === 'saving'
      ? '正在保存策划结果'
      : mode === 'dsp'
        ? '正在生成 11 个 DSP 素材方案'
        : mode === 'aplus'
          ? '正在生成 A+ 模块方案'
          : '正在生成 Listing 图片方案'
  const notes = mode === 'dsp'
    ? ['DSP 会一次规划 11 个图片素材，xhigh 策划通常需要数分钟。']
    : []
  if (elapsedSeconds >= 90) notes.push('模型仍在输出，请保持页面打开。')
  if (elapsedSeconds >= 180) notes.push('可继续等待，或点击停止后重试。')
  return [stageText, elapsed, ...notes].join(' · ')
}

export function getStyleGenerationStatusText(options: {
  isGeneratingStyleImages: boolean
  candidateCount: number
  generatedCount: number
  failedCount: number
  hasGeneratedStyleImages: boolean
}) {
  if (options.isGeneratingStyleImages) return `已完成 ${options.generatedCount}/${options.candidateCount} 张风格板`
  if (options.failedCount > 0) return `已完成 ${options.generatedCount}/${options.candidateCount} 张，${options.failedCount} 张失败`
  if (options.hasGeneratedStyleImages) return `已完成 ${options.generatedCount}/${options.candidateCount} 张风格板`
  return ''
}

export function getSubmittedReferenceImageCount(options: {
  sourceImageIds: string[]
  usesStyleReference: boolean
  styleReferenceImageId?: string | null
}) {
  const submittedImageIds = options.sourceImageIds.map((id) => id.trim()).filter(Boolean)
  const styleReferenceImageId = options.styleReferenceImageId?.trim()
  if (options.usesStyleReference && styleReferenceImageId && !submittedImageIds.includes(styleReferenceImageId)) {
    submittedImageIds.push(styleReferenceImageId)
  }
  return new Set(submittedImageIds).size
}

function getPlannerModeTitle(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return 'A+ 图片策划'
    case 'dsp':
      return 'DSP 素材策划'
    default:
      return 'Listing 智能策划'
  }
}

function getPlannerModeDescription(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return '粘贴标题、五点描述或品牌说明，生成 Standard / 大图版 / Premium A+ 模块编排和英文提示词。'
    case 'dsp':
      return '粘贴标题、五点描述、品牌或活动说明，生成 REC、Custom Image 与半自动 REC 的 DSP 广告素材方案。'
    default:
      return '粘贴标题、五点描述或产品说明，生成 Main + PT01-PT06 的完整方案和英文提示词。'
  }
}

function getPlannerInputLabel(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return '标题 / 五点描述 / 品牌说明'
    case 'dsp':
      return '标题 / 五点描述 / 品牌 / 活动说明'
    default:
      return '标题 / 五点描述'
  }
}

function getPlannerInputPlaceholder(mode: AmazonPlannerMode) {
  if (mode === 'aplus') {
    return 'Title: ...\n\nAbout this item\n- Bullet 1...\n- Bullet 2...\n\nBrand story / tone: ...'
  }
  if (mode === 'dsp') {
    return 'Title: ...\n\nAbout this item\n- Bullet 1...\n- Bullet 2...\n\nBrand / campaign notes: logo, slogan, CTA preference, audience...'
  }
  return 'Title: ...\n\nAbout this item\n- Bullet 1...\n- Bullet 2...\n- Bullet 3...\n- Bullet 4...\n- Bullet 5...'
}

function getCreatePlanButtonLabel(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return 'AI策划A+'
    case 'dsp':
      return 'AI策划DSP'
    default:
      return 'AI策划'
  }
}

function getPlanMissingMessage(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return '请先 AI 策划并选择一个 A+ 模块'
    case 'dsp':
      return '请先 AI 策划并选择一个 DSP 素材'
    default:
      return '请先 AI 策划并选择一个图片位'
  }
}

function getPromptPreviewFallback(mode: AmazonPlannerMode) {
  switch (mode) {
    case 'aplus':
      return '请先点击 AI策划A+，再在右侧选择一个 A+ 模块。'
    case 'dsp':
      return '请先点击 AI策划DSP，LLM 会生成 DSP 素材策划、英文 Prompt 和 Negative Prompt。'
    default:
      return '请先粘贴 Listing 并点击 AI策划，LLM 会生成中文策划、英文 Prompt 和 Negative Prompt。'
  }
}

function getDspCtaPolicyLabel(policy: AmazonDspPlan['ctaPolicy']) {
  switch (policy) {
    case 'required':
      return '必须 CTA'
    case 'optional':
      return '可选 CTA'
    case 'forbidden':
      return '禁止 CTA'
    default:
      return '不适用 CTA'
  }
}

function createPlannerSessionId() {
  return `amazon-planner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createPlannerBatchId() {
  return `amazon-planner-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getAmazonPlannerResolutionTier(resolution: AmazonPlannerResolution) {
  if (resolution === '4k') return '4K'
  if (resolution === '2k') return '2K'
  return '1K'
}

export function getListingTargetSizeForResolution(resolution: AmazonPlannerResolution) {
  if (resolution === '4k') return '4096x4096'
  if (resolution === '2k') return '2048x2048'
  return '1024x1024'
}

function waitForPlannerTaskCompletion(taskId: string) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || task.status !== 'running') return Promise.resolve()

  return new Promise<void>((resolve) => {
    const unsubscribe = useStore.subscribe((state) => {
      const nextTask = state.tasks.find((item) => item.id === taskId)
      if (!nextTask || nextTask.status === 'running') return
      unsubscribe()
      resolve()
    })
  })
}

function normalizeHistoryTitle(value: string) {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim())
  if (chars.length <= 40) return chars.join('')
  return `${chars.slice(0, 37).join('')}...`
}

function getPlannerSessionTitle(draft: AmazonPromptDraft, listingText: string) {
  return normalizeHistoryTitle(draft.productTitle) || normalizeHistoryTitle(listingText) || '未命名策划'
}

function formatPlannerSessionTime(value: number) {
  if (!Number.isFinite(value)) return ''
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toSessionDraft(draft: AmazonPromptDraft): ProductWorkspace['draft'] {
  return {
    kind: draft.kind,
    productTitle: draft.productTitle,
    category: draft.category,
    brand: draft.brand,
    color: draft.color,
    material: draft.material,
    audience: draft.audience,
    sellingPoints: draft.sellingPoints,
    packageIncludes: draft.packageIncludes,
    scene: draft.scene,
    forbidden: draft.forbidden,
  }
}

function fromSessionDraft(draft: ProductWorkspace['draft']): AmazonPromptDraft {
  return {
    ...DEFAULT_AMAZON_PROMPT_DRAFT,
    ...draft,
    kind: (draft.kind as AmazonPromptDraft['kind']) || DEFAULT_AMAZON_PROMPT_DRAFT.kind,
  }
}

function getSessionStyleImages(styleImages: StyleImageState[]): ProductWorkspace['styleImages'] {
  return styleImages
    .filter((image): image is StyleImageState & { imageId: string } => image.status === 'done' && Boolean(image.imageId))
    .map((image) => ({ candidateIndex: image.candidateIndex, imageId: image.imageId }))
}

function sortPlannerSessions(sessions: ProductWorkspace[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PLANNER_HISTORY_LIMIT)
}

function getActionStepClass(status: WorkflowStepStatus) {
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
  if (status === 'current') return 'border-blue-200 bg-blue-50 text-blue-800 ring-1 ring-blue-500/10 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200'
  return 'border-gray-200 bg-white text-gray-500 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-400'
}

function getPlanSubmitStatus(options: {
  actionProgress: PlannerActionProgress | undefined
  requiresStyleReference: boolean
  hasStyleReference: boolean
}) {
  if (options.actionProgress === 'submitted') {
    return {
      label: '已提交',
      className: 'bg-emerald-600 text-white',
    }
  }
  if (options.requiresStyleReference && !options.hasStyleReference) {
    return {
      label: '缺风格',
      className: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
    }
  }
  return {
    label: '待提交',
    className: 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300',
  }
}

function getGuidePanelClass(isActive: boolean, tone: GuidePanelTone = 'white') {
  if (isActive) return 'border-blue-300 bg-blue-50/60 ring-2 ring-blue-500/15 dark:border-blue-400/60 dark:bg-blue-500/10'
  if (tone === 'muted') return 'border-gray-200 bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950'
  return 'border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-950'
}

function getGuideFocusClass(isActive: boolean) {
  return isActive ? 'ring-2 ring-blue-500/20 dark:ring-blue-400/20' : ''
}

function getPlannerActionKey(mode: AmazonPlannerMode, planIndex: number | null, slot: string | undefined | null) {
  if (planIndex == null || !slot) return ''
  return `${mode}:${planIndex}:${slot}`
}

function getPlannerFailureDetail(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err)
  const message = rawMessage.trim() || '未知错误'
  const lower = message.toLowerCase()
  const hints: string[] = []

  if (/401|invalid api key|incorrect api key|unauthorized|forbidden|权限|认证|鉴权/.test(lower)) {
    hints.push('请检查 AI 策划配置里的 API Key 是否正确，并确认该 Key 有所选聊天/策划接口权限。')
  }
  if (/404|not found|responses|endpoint|route|路径|不存在/.test(lower)) {
    hints.push('请确认 AI 策划配置的 API URL 支持当前接口：DeepSeek 请使用 Chat Completions（/chat/completions），不要使用只开放 /v1/images 的图片中转。')
  }
  if (/model|does not exist|unsupported|not supported|模型/.test(lower)) {
    hints.push('请确认 AI 策划配置使用的是文本/多模态模型，而不是 gpt-image-2。')
  }
  if (/json_schema|schema|structured|text\.format|response_format|strict/.test(lower)) {
    hints.push('该接口可能不支持当前 JSON 输出参数；Chat Completions 需要支持 response_format=json_object。')
  }
  if (/failed to fetch|network|cors|load failed|连接|网络|跨域/.test(lower)) {
    hints.push('浏览器未能连接到策划接口；请检查网络、跨域设置，或开启应用里的 API 代理。')
  }

  return [message, ...hints].join('\n\n')
}

function updateDraft<K extends keyof AmazonPromptDraft>(
  draft: AmazonPromptDraft,
  key: K,
  value: AmazonPromptDraft[K],
) {
  return { ...draft, [key]: value }
}

function getCurrentAmazonImportImage(result: AmazonDomImportResult) {
  return result.imageCandidates.find((image) => image.isCurrent) ?? result.imageCandidates[0] ?? null
}

function isAbortError(err: unknown): boolean {
  return (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
}

function getStylePreviewPosition(clientX: number, clientY: number) {
  if (typeof window === 'undefined') {
    return { left: clientX + STYLE_PREVIEW_OFFSET, top: clientY + STYLE_PREVIEW_OFFSET }
  }
  const viewportPadding = 12
  const rightLeft = clientX + STYLE_PREVIEW_OFFSET
  const left = rightLeft + STYLE_PREVIEW_WIDTH <= window.innerWidth - viewportPadding
    ? rightLeft
    : Math.max(viewportPadding, clientX - STYLE_PREVIEW_WIDTH - STYLE_PREVIEW_OFFSET)
  const maxTop = Math.max(viewportPadding, window.innerHeight - STYLE_PREVIEW_HEIGHT - viewportPadding)
  const top = Math.min(Math.max(viewportPadding, clientY - 160), maxTop)
  return { left, top }
}

function getPlanSummary(planMarkdown: string) {
  const lines = planMarkdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
  return lines[0] ?? ''
}

function getAmazonAPlusComplianceChecks(
  draft: AmazonPromptDraft,
  plan: AmazonAPlusPlan | null,
  aPlusType: APlusContentType,
  referenceImageCount: number,
  hasStyleReference: boolean,
): Array<{ label: string; status: ComplianceStatus; detail: string }> {
  return [
    {
      label: '商品名称',
      status: draft.productTitle.trim() ? 'ready' : 'missing',
      detail: draft.productTitle.trim() ? '已填写' : '需要填写准确商品名',
    },
    {
      label: 'A+ 类型',
      status: 'ready',
      detail: `${getAPlusContentTypeLabel(aPlusType)} A+ 编排`,
    },
    {
      label: 'A+ 尺寸',
      status: plan ? 'ready' : 'warning',
      detail: plan ? `${plan.generationSize} 生成，上传建议 ${plan.uploadSize}` : '请选择一个 A+ 模块',
    },
    {
      label: '参考图',
      status: referenceImageCount > 0 ? 'ready' : 'warning',
      detail: referenceImageCount > 0 ? `${referenceImageCount} 张参考图` : '建议上传产品实拍参考图',
    },
    {
      label: '风格板',
      status: hasStyleReference ? 'ready' : 'warning',
      detail: hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格',
    },
  ]
}

function getAmazonListingPlannerChecks(
  draft: AmazonPromptDraft,
  size: string,
  referenceImageCount: number,
  hasStyleReference: boolean,
  styleReferenceRequired: boolean,
): Array<{ label: string; status: ComplianceStatus; detail: string }> {
  return [
    {
      label: '商品名称',
      status: draft.productTitle.trim() ? 'ready' : 'missing',
      detail: draft.productTitle.trim() ? '已填写' : '等待 AI 从 Listing 解析',
    },
    {
      label: '图片规格',
      status: /^(1024x1024|2048x2048|4096x4096)$/.test(size) ? 'ready' : 'warning',
      detail: /4096x4096/.test(size) ? '4K 方图' : /2048x2048/.test(size) ? '2K 方图' : /1024x1024/.test(size) ? '1K 方图' : size || '未选择 1K/2K/4K',
    },
    {
      label: '参考图',
      status: referenceImageCount > 0 ? 'ready' : 'warning',
      detail: referenceImageCount > 0 ? `${referenceImageCount} 张产品参考图` : '建议上传产品实拍参考图',
    },
    {
      label: '风格板',
      status: !styleReferenceRequired || hasStyleReference ? 'ready' : 'warning',
      detail: !styleReferenceRequired
        ? 'MAIN 主图不使用隐藏风格参考'
        : hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格',
    },
  ]
}

function getAmazonDspComplianceChecks(
  draft: AmazonPromptDraft,
  plan: AmazonDspPlan | null,
  referenceImageCount: number,
  hasStyleReference: boolean,
): Array<{ label: string; status: ComplianceStatus; detail: string }> {
  return [
    {
      label: '商品名称',
      status: draft.productTitle.trim() ? 'ready' : 'missing',
      detail: draft.productTitle.trim() ? '已填写' : '等待 AI 从素材说明解析',
    },
    {
      label: 'DSP 素材',
      status: plan ? 'ready' : 'warning',
      detail: plan ? `${plan.uploadSize} · ${plan.fileLimit} · ${getDspCtaPolicyLabel(plan.ctaPolicy)}` : `${getDspImageAssetSpecs().length} 个图片素材位`,
    },
    {
      label: '参考图',
      status: referenceImageCount > 0 ? 'ready' : 'warning',
      detail: referenceImageCount > 0 ? `${referenceImageCount} 张参考图` : '建议上传产品或 Logo 参考图',
    },
    {
      label: '风格板',
      status: hasStyleReference ? 'ready' : 'warning',
      detail: hasStyleReference ? '已选择隐藏风格参考' : '正式生成前请选择风格',
    },
  ]
}

export default function AmazonPlanner() {
  const prompt = useStore((s) => s.prompt)
  const params = useStore((s) => s.params)
  const inputImages = useStore((s) => s.inputImages)
  const settings = useStore((s) => s.settings)
  const tasks = useStore((s) => s.tasks)
  const galleryStyleReferenceRequest = useStore((s) => s.galleryStyleReferenceRequest)
  const setPrompt = useStore((s) => s.setPrompt)
  const setParams = useStore((s) => s.setParams)
  const setPendingTaskCategory = useStore((s) => s.setPendingTaskCategory)
  const setGalleryStyleReferenceRequest = useStore((s) => s.setGalleryStyleReferenceRequest)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const removeInputImage = useStore((s) => s.removeInputImage)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const setInputImages = useStore((s) => s.setInputImages)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setActiveProductWorkspaceId = useStore((s) => s.setActiveProductWorkspaceId)
  const showToast = useStore((s) => s.showToast)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const amazonDomFileInputRef = useRef<HTMLInputElement>(null)
  const plannerAbortControllerRef = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState<AmazonPromptDraft>(DEFAULT_AMAZON_PROMPT_DRAFT)
  const [resolution, setResolution] = useState<AmazonPlannerResolution>('1k')
  const [plannerMode, setPlannerMode] = useState<AmazonPlannerMode>('listing')
  const [aPlusType, setAPlusType] = useState<APlusContentType>('standard-large')
  const [listingText, setListingText] = useState('')
  const [amazonImportUrl, setAmazonImportUrl] = useState('')
  const [amazonImportStatus, setAmazonImportStatus] = useState('')
  const [isAmazonImporting, setIsAmazonImporting] = useState(false)
  const [amazonImportPreview, setAmazonImportPreview] = useState<AmazonDomImportResult | null>(null)
  const [addingAmazonImageUrl, setAddingAmazonImageUrl] = useState('')
  const [imagePlans, setImagePlans] = useState<AmazonImagePlan[]>([])
  const [aPlusPlans, setAPlusPlans] = useState<AmazonAPlusPlan[]>([])
  const [dspPlans, setDspPlans] = useState<AmazonDspPlan[]>([])
  const [seriesStyleGuides, setSeriesStyleGuides] = useState<PlannerSeriesStyleGuides>({
    listing: '',
    aplus: '',
    dsp: '',
  })
  const [styleCandidates, setStyleCandidates] = useState<AmazonStyleCandidate[]>([])
  const [styleImages, setStyleImages] = useState<StyleImageState[]>([])
  const [selectedStyleIndex, setSelectedStyleIndex] = useState<number | null>(null)
  const [selectedStyleReference, setSelectedStyleReference] = useState<AmazonPlannerSelectedStyleReference | null>(null)
  const [cachedStyleReferenceImageSrcById, setCachedStyleReferenceImageSrcById] = useState<Record<string, string>>({})
  const [styleDensityMode, setStyleDensityMode] = useState<AmazonStyleDensityMode>('rich')
  const [stylePreview, setStylePreview] = useState<StylePreviewState | null>(null)
  const [isGeneratingStyleImages, setIsGeneratingStyleImages] = useState(false)
  const [styleError, setStyleError] = useState('')
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null)
  const [selectedAPlusPlanIndex, setSelectedAPlusPlanIndex] = useState<number | null>(null)
  const [selectedDspPlanIndex, setSelectedDspPlanIndex] = useState<number | null>(null)
  const [plannerSessions, setPlannerSessions] = useState<ProductWorkspace[]>([])
  const [currentPlannerSessionId, setCurrentPlannerSessionId] = useState<string | null>(null)
  const [showPlannerHistory, setShowPlannerHistory] = useState(false)
  const [newWorkspaceId, setNewWorkspaceId] = useState('')
  const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('')
  const [sixViewInstruction, setSixViewInstruction] = useState('')
  const [isGeneratingSixView, setIsGeneratingSixView] = useState(false)
  const [sixViewError, setSixViewError] = useState('')
  const [sixViewImageSrcById, setSixViewImageSrcById] = useState<Record<string, string>>({})
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannerRunStage, setPlannerRunStage] = useState<PlannerRunStage>('idle')
  const [planningStartedAt, setPlanningStartedAt] = useState<number | null>(null)
  const [planningElapsedSeconds, setPlanningElapsedSeconds] = useState(0)
  const [plannerError, setPlannerError] = useState('')
  const [isPreparingReferencePayload, setIsPreparingReferencePayload] = useState(false)
  const [referencePayloadNotice, setReferencePayloadNotice] = useState('')
  const [actionProgress, setActionProgress] = useState<PlannerActionProgressMap>({})
  const actionProgressRef = useRef<PlannerActionProgressMap>({})
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false)
  const [batchSubmittedCount, setBatchSubmittedCount] = useState(0)
  const [activePlannerBatchId, setActivePlannerBatchId] = useState<string | null>(null)
  const resolutionTier = getAmazonPlannerResolutionTier(resolution)
  const aPlusSpecs = useMemo(() => getAPlusModuleSpecs(aPlusType), [aPlusType])
  const dspSpecs = useMemo(() => getDspImageAssetSpecs(), [])
  const aPlusPlansWithSizes = useMemo(() => withAPlusGenerationSizes(aPlusPlans, resolutionTier), [aPlusPlans, resolutionTier])
  const dspPlansWithSizes = useMemo(() => withDspGenerationSizes(dspPlans, resolutionTier), [dspPlans, resolutionTier])
  const selectedPlan = selectedPlanIndex == null ? null : imagePlans[selectedPlanIndex] ?? null
  const selectedAPlusPlan = selectedAPlusPlanIndex == null ? null : aPlusPlansWithSizes[selectedAPlusPlanIndex] ?? null
  const selectedDspPlan = selectedDspPlanIndex == null ? null : dspPlansWithSizes[selectedDspPlanIndex] ?? null
  const selectedAPlusText = selectedAPlusPlan ? formatAPlusModuleText(selectedAPlusPlan) : ''
  const selectedStyleImage = selectedStyleIndex == null ? null : styleImages.find((image) => image.candidateIndex === selectedStyleIndex && image.status === 'done') ?? null
  const selectedStyleCandidate = selectedStyleIndex == null ? null : styleCandidates[selectedStyleIndex] ?? null
  const styleLightboxImageIds = useMemo(() => styleImages.flatMap((image) => image.status === 'done' && image.imageId ? [image.imageId] : []), [styleImages])
  const styleReferenceLibraryItems = useMemo(() => buildStyleReferenceLibrary({
    sessions: plannerSessions,
    currentMode: plannerMode,
    productTitle: draft.productTitle || listingText,
    currentWorkspaceId: currentPlannerSessionId,
  }), [currentPlannerSessionId, draft.productTitle, listingText, plannerMode, plannerSessions])
  const currentStyleImageSrcById = useMemo(() => Object.fromEntries(
    styleImages.flatMap((image) => image.status === 'done' && image.imageId && image.dataUrl ? [[image.imageId, image.dataUrl]] : []),
  ), [styleImages])
  const styleReferenceImageSrcById = useMemo(() => ({
    ...cachedStyleReferenceImageSrcById,
    ...currentStyleImageSrcById,
  }), [cachedStyleReferenceImageSrcById, currentStyleImageSrcById])
  const styleReferenceLightboxImageIds = useMemo(() => Array.from(new Set([
    ...styleLightboxImageIds,
    ...styleReferenceLibraryItems.map((item) => item.imageId),
  ])), [styleLightboxImageIds, styleReferenceLibraryItems])
  const currentWorkspace = currentPlannerSessionId ? plannerSessions.find((session) => session.id === currentPlannerSessionId) ?? null : null
  const confirmedSixViewVersion = currentWorkspace ? getConfirmedSixViewVersion(currentWorkspace) : null
  const latestSixViewVersion = currentWorkspace?.sixViewVersions.length ? currentWorkspace.sixViewVersions[currentWorkspace.sixViewVersions.length - 1] : null
  const canGenerateStandardSixView = currentWorkspace ? getStandardSixViewSourceImageIds(currentWorkspace).length > 0 : false
  const selectedStyleReferenceImageId = selectedStyleReference?.imageId ?? selectedStyleImage?.imageId
  const selectedStyleReferenceLabel = selectedStyleReference?.label ?? selectedStyleCandidate?.label
  const selectedStyleReferenceCategory = selectedStyleReferenceImageId
    ? {
        styleReferenceImageId: selectedStyleReferenceImageId,
        ...(selectedStyleReferenceLabel ? { styleReferenceLabel: selectedStyleReferenceLabel } : {}),
      }
    : {}
  const activeSeriesStyleGuide = seriesStyleGuides[plannerMode]
  const isMainListingPlan = plannerMode === 'listing' && isAmazonListingMainSlot(selectedPlan?.slot)
  const styleReferenceRequired = !isMainListingPlan
  const hasStyleReference = Boolean(selectedStyleReferenceImageId)
  const usesStyleReferenceForActivePlan = styleReferenceRequired && hasStyleReference
  const inputImageIds = inputImages.map((image) => image.id)
  const currentWorkspaceReferenceImageIds = currentWorkspace?.referenceImageIds.map((id) => id.trim()).filter(Boolean) ?? []
  const structureReferenceImageIds = currentWorkspaceReferenceImageIds.length ? currentWorkspaceReferenceImageIds : inputImageIds
  const hasStructureReferences = structureReferenceImageIds.length > 0
  const effectiveReferenceCount = getSubmittedReferenceImageCount({
    sourceImageIds: structureReferenceImageIds,
    usesStyleReference: usesStyleReferenceForActivePlan,
    styleReferenceImageId: selectedStyleReferenceImageId,
  })
  const styleReferenceLimitExceeded = usesStyleReferenceForActivePlan && effectiveReferenceCount > API_MAX_IMAGES
  const activePrompt = plannerMode === 'aplus'
    ? selectedAPlusPlan ? buildAmazonAPlusPlanPrompt({ ...selectedAPlusPlan, seriesStyleGuide: activeSeriesStyleGuide, styleReferenceAttached: usesStyleReferenceForActivePlan, structureReferenceAttached: hasStructureReferences, styleDensityMode }) : ''
    : plannerMode === 'dsp'
      ? selectedDspPlan ? buildAmazonDspPlanPrompt({ ...selectedDspPlan, seriesStyleGuide: activeSeriesStyleGuide, styleReferenceAttached: usesStyleReferenceForActivePlan, structureReferenceAttached: hasStructureReferences, styleDensityMode }) : ''
      : selectedPlan ? buildAmazonPlanPrompt({
        ...selectedPlan,
        seriesStyleGuide: isMainListingPlan ? null : activeSeriesStyleGuide,
        styleReferenceAttached: usesStyleReferenceForActivePlan,
        structureReferenceAttached: hasStructureReferences,
        styleDensityMode,
      }) : ''
  const activePlanMarkdown = plannerMode === 'aplus'
    ? selectedAPlusPlan?.planMarkdown ?? ''
    : plannerMode === 'dsp'
      ? selectedDspPlan?.planMarkdown ?? ''
      : selectedPlan?.planMarkdown ?? ''
  const activePlanPreview = activePlanMarkdown
    ? [
        activePlanMarkdown,
        '',
        '英文生图提示词 Prompt',
        activePrompt,
      ].join('\n')
    : activePrompt
  const plannerProfile = getAmazonPlannerProfile(settings)
  const plannerProfileValidation = plannerProfile ? validateApiProfile(plannerProfile) : '未选择支持 Chat Completions 或 Responses API 的 AI 策划配置'
  const plannerApiLabel = plannerProfile?.apiMode === 'chat' ? 'Chat Completions' : 'Responses API'
  const imageProfile = getDefaultImageProfile(settings)
  const imageProfileValidation = imageProfile ? validateApiProfile(imageProfile) : '未选择 Images API 生图配置'
  const listingTargetSize = getListingTargetSizeForResolution(resolution)
  const targetSize = plannerMode === 'aplus' && selectedAPlusPlan
    ? selectedAPlusPlan.generationSize
    : plannerMode === 'dsp' && selectedDspPlan
      ? selectedDspPlan.generationSize
      : listingTargetSize
  const generationParamLabel = `${DEFAULT_PARAMS.output_format.toUpperCase()} / 草稿 ${AMAZON_DRAFT_QUALITY} / 压缩率${DEFAULT_PARAMS.output_compression}`
  const visiblePlans = plannerMode === 'aplus' ? aPlusPlansWithSizes : plannerMode === 'dsp' ? dspPlansWithSizes : imagePlans
  const visiblePlanCount = visiblePlans.length
  const visiblePlanIndex = plannerMode === 'aplus' ? selectedAPlusPlanIndex : plannerMode === 'dsp' ? selectedDspPlanIndex : selectedPlanIndex
  const actionSlot = plannerMode === 'aplus' ? selectedAPlusPlan?.slot : plannerMode === 'dsp' ? selectedDspPlan?.slot : selectedPlan?.slot
  const actionLabel = plannerMode === 'aplus' ? selectedAPlusPlan?.label : plannerMode === 'dsp' ? selectedDspPlan?.label : selectedPlan?.label
  const showStickyActions = visiblePlanCount > 0
  const actionDisabled = plannerMode === 'aplus' ? !selectedAPlusPlan : plannerMode === 'dsp' ? !selectedDspPlan : !activePrompt.trim()
  const submitNeedsStyleReference = styleReferenceRequired && !hasStyleReference
  const submitDisabled = actionDisabled || styleReferenceLimitExceeded || !hasStructureReferences
  const hasPlanOptions = visiblePlanCount > 0
  const hasSelectedPlan = plannerMode === 'aplus' ? Boolean(selectedAPlusPlan) : plannerMode === 'dsp' ? Boolean(selectedDspPlan) : Boolean(selectedPlan)
  const canGoPrev = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex > 0
  const canGoNext = visiblePlanCount > 0 && visiblePlanIndex != null && visiblePlanIndex < visiblePlanCount - 1
  const actionPositionLabel = visiblePlanCount > 0 && visiblePlanIndex != null
    ? `${visiblePlanIndex + 1}/${visiblePlanCount}`
    : plannerMode === 'aplus'
      ? `${aPlusSpecs.length} 个待策划模块`
      : plannerMode === 'dsp'
        ? `${dspSpecs.length} 个待策划素材`
        : '未选择'
  const currentActionKey = getPlannerActionKey(plannerMode, visiblePlanIndex, actionSlot)
  const currentActionProgress = currentActionKey ? actionProgress[currentActionKey] ?? null : null
  const currentActionFilled = currentActionProgress === 'filled' || currentActionProgress === 'submitted'
  const currentActionSubmitted = currentActionProgress === 'submitted'
  const actionKindLabel = plannerMode === 'aplus' ? '模块' : plannerMode === 'dsp' ? '素材' : isMainListingPlan ? '主图' : '图片'
  const actionGuidance = getDraftPlannerActionGuidance({
    plannerMode,
    hasSelectedPlan,
    currentActionSubmitted,
    currentActionFilled,
    canGoNext,
    actionSlot,
    actionKindLabel,
    styleReferenceRequired,
    hasStyleReference,
    styleReferenceLimitExceeded,
    effectiveReferenceCount,
    apiMaxImages: API_MAX_IMAGES,
  })
  const gatedActionGuidance = !hasStructureReferences ? '请先上传产品结构参考图，后续生图直接发送这些参考图；只能复用用户提供的视角或对称反转视角' : actionGuidance
  const mainStyleGuidance = isMainListingPlan
    ? hasStyleReference
      ? 'MAIN 主图不附加风格板；附图、A+ 和 DSP 会使用已选风格。'
      : 'MAIN 主图不附加风格板；附图、A+ 和 DSP 可先生成并选择风格板。'
    : ''
  const actionProgressSteps = [
    {
      label: '1 填入',
      detail: currentActionFilled ? '已填入' : '待填入',
      status: currentActionFilled ? 'done' : 'current',
    },
    {
      label: '2 提交草稿',
      detail: currentActionSubmitted ? '已提交' : currentActionFilled ? '下一步' : '待提交',
      status: currentActionSubmitted ? 'done' : currentActionFilled ? 'current' : 'todo',
    },
    {
      label: '3 下一张',
      detail: currentActionSubmitted ? (canGoNext ? '继续下一张' : '最后一张') : '提交后继续',
      status: currentActionSubmitted ? (canGoNext ? 'current' : 'done') : 'todo',
    },
  ] satisfies Array<{ label: string; detail: string; status: WorkflowStepStatus }>
  const hasListingText = Boolean(listingText.trim())
  const hasUsablePlannerProfile = Boolean(plannerProfile && !plannerProfileValidation)
  const hasGeneratedStyleImages = styleImages.some((image) => image.status === 'done')
  const hasRunningStyleImages = styleImages.some((image) => image.status === 'running')
  const generatedStyleImageCount = styleImages.filter((image) => image.status === 'done').length
  const failedStyleImageCount = styleImages.filter((image) => image.status === 'error').length
  const styleGenerationStatusText = getStyleGenerationStatusText({
    isGeneratingStyleImages,
    candidateCount: styleCandidates.length,
    generatedCount: generatedStyleImageCount,
    failedCount: failedStyleImageCount,
    hasGeneratedStyleImages,
  })
  const seriesStyleReferenceNeeded = plannerMode === 'listing'
    ? imagePlans.some((plan) => !isAmazonListingMainSlot(plan.slot))
    : hasPlanOptions
  const batchEffectiveReferenceCount = getSubmittedReferenceImageCount({
    sourceImageIds: structureReferenceImageIds,
    usesStyleReference: seriesStyleReferenceNeeded && hasStyleReference,
    styleReferenceImageId: selectedStyleReferenceImageId,
  })
  const batchStyleReferenceLimitExceeded = seriesStyleReferenceNeeded && hasStyleReference && batchEffectiveReferenceCount > API_MAX_IMAGES
  const submittedVisiblePlanCount = visiblePlans.filter((plan, index) =>
    actionProgress[getPlannerActionKey(plannerMode, index, plan.slot)] === 'submitted',
  ).length
  const visibleUnsubmittedPlanCount = Math.max(0, visiblePlanCount - submittedVisiblePlanCount)
  const activePlannerBatchSummary = summarizePlannerBatchTasks(tasks, activePlannerBatchId)
  const hasActivePlannerBatchSummary = activePlannerBatchSummary.total > 0
  const batchSubmitStatusText = getDraftBatchSubmitStatusText({
    isBatchSubmitting,
    batchSubmittedCount,
    visiblePlanCount,
    visibleUnsubmittedPlanCount,
    submittedVisiblePlanCount,
    seriesStyleReferenceNeeded,
    hasStyleReference,
  })
  const submitButtonLabel = currentActionSubmitted ? '草稿已提交' : '生成草稿'
  const batchSubmitDisabled = isBatchSubmitting || !hasPlanOptions || isPlanning || isGeneratingStyleImages || !hasStructureReferences || (seriesStyleReferenceNeeded && !hasStyleReference) || batchStyleReferenceLimitExceeded
    || visibleUnsubmittedPlanCount === 0
  const guideState: PlannerGuideState = !hasUsablePlannerProfile
    ? {
        target: 'planner-api',
        message: plannerProfileValidation ? `下一步：先配置 AI 策划 API（${plannerProfileValidation}）` : '下一步：先配置 AI 策划 API',
      }
    : !hasListingText
      ? {
          target: 'planner-input',
          message: plannerMode === 'aplus' ? '下一步：粘贴标题、五点描述或品牌说明' : plannerMode === 'dsp' ? '下一步：粘贴标题、五点描述、品牌或活动说明' : '下一步：粘贴标题和五点描述',
        }
      : !hasPlanOptions
        ? {
            target: 'planner-action',
            message: plannerMode === 'aplus' ? '下一步：点击 AI策划A+ 生成模块方案' : plannerMode === 'dsp' ? '下一步：点击 AI策划DSP 生成素材方案' : '下一步：点击 AI策划生成完整方案',
          }
        : seriesStyleReferenceNeeded && !hasStyleReference
          ? {
              target: hasGeneratedStyleImages ? 'style-choice' : 'style',
              message: hasGeneratedStyleImages
                ? '下一步：选择一张风格板作为附图、A+ 和 DSP 的隐藏参考'
                : hasRunningStyleImages
                  ? '正在生成风格板，完成后选择一张作为隐藏参考'
                  : '下一步：生成 3 张低清风格板，选定后可生成草稿',
            }
          : !hasSelectedPlan
            ? {
                target: 'plan-list',
                message: plannerMode === 'aplus' ? '下一步：选择要生成的 A+ 模块' : plannerMode === 'dsp' ? '下一步：选择要生成的 DSP 素材' : '下一步：选择要生成的图片位',
              }
            : {
                target: 'action-bar',
                message: currentActionSubmitted
                  ? canGoNext ? '下一步：点击下一张继续处理' : '当前图片已提交，已是最后一张'
                  : currentActionFilled
                    ? '下一步：生成当前图片草稿'
                    : `下一步：提交当前 ${actionSlot ?? '当前'} ${actionKindLabel}草稿，或使用“提交未提交草稿”处理剩余计划`,
              }
  const plannerGuideActive = guideState.target === 'planner-api' || guideState.target === 'planner-input' || guideState.target === 'planner-action'
  const styleGuideActive = guideState.target === 'style' || guideState.target === 'style-choice'
  const planListGuideActive = guideState.target === 'plan-list'
  const actionBarGuideActive = guideState.target === 'action-bar'
  const checks = plannerMode === 'aplus'
    ? getAmazonAPlusComplianceChecks(draft, selectedAPlusPlan, aPlusType, inputImages.length, hasStyleReference)
    : plannerMode === 'dsp'
      ? getAmazonDspComplianceChecks(draft, selectedDspPlan, inputImages.length, hasStyleReference)
      : getAmazonListingPlannerChecks(draft, targetSize, inputImages.length, hasStyleReference, styleReferenceRequired)
  const atImageLimit = inputImages.length >= API_MAX_IMAGES

  useEffect(() => {
    setActiveProductWorkspaceId(currentPlannerSessionId)
    return () => setActiveProductWorkspaceId(null)
  }, [currentPlannerSessionId, setActiveProductWorkspaceId])

  useEffect(() => {
    const previewDomTransferPayload = (payload: unknown) => {
      const transferPayload = parseAmazonDomTransferPayload(payload)
      const result = parseAmazonDomHtml(transferPayload.html, transferPayload.sourceUrl)
      setAmazonImportPreview(result)
      setAmazonImportStatus(result.asin ? `已从浏览器插件读取当前页面 DOM（ASIN ${result.asin}），请确认后应用。` : '已从浏览器插件读取当前页面 DOM，请确认后应用。')
      showToast('已从浏览器插件读取当前页面 DOM', 'success')
    }

    const previewStoredDomTransferPayload = () => {
      const storedPayload = window.sessionStorage.getItem(AMAZON_DOM_TRANSFER_STORAGE_KEY)
      if (!storedPayload) return false
      window.sessionStorage.removeItem(AMAZON_DOM_TRANSFER_STORAGE_KEY)
      previewDomTransferPayload(JSON.parse(storedPayload))
      return true
    }

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const payload = params.get('amazon-import')
    if (payload) {
      try {
        const result = parseAmazonImportPayload(payload)
        setAmazonImportPreview(result)
        setAmazonImportStatus('已从浏览器插件读取商品信息，请确认后应用。')
        showToast('已从浏览器插件读取商品信息', 'success')
      } catch {
        setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
        showToast('插件导入内容解析失败', 'error')
      }
      params.delete('amazon-import')
    }

    if (params.has('amazon-dom-import')) {
      setAmazonImportStatus('正在接收浏览器插件传来的当前页面 DOM...')
      params.delete('amazon-dom-import')
    }

    const nextHash = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`)

    try {
      previewStoredDomTransferPayload()
    } catch {
      setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
      showToast('插件 DOM 导入内容解析失败', 'error')
    }

    const handleAmazonDomTransferMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; payload?: unknown }
      if (data?.type !== AMAZON_DOM_TRANSFER_EVENT) return
      try {
        previewDomTransferPayload(data.payload)
      } catch {
        setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
        showToast('插件 DOM 导入内容解析失败', 'error')
      }
    }

    const handleAmazonDomTransferReady = () => {
      try {
        previewStoredDomTransferPayload()
      } catch {
        setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
        showToast('插件 DOM 导入内容解析失败', 'error')
      }
    }

    window.addEventListener('message', handleAmazonDomTransferMessage)
    window.addEventListener(AMAZON_DOM_TRANSFER_EVENT, handleAmazonDomTransferReady)
    return () => {
      window.removeEventListener('message', handleAmazonDomTransferMessage)
      window.removeEventListener(AMAZON_DOM_TRANSFER_EVENT, handleAmazonDomTransferReady)
    }
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    getAllProductWorkspaces()
      .then((sessions) => {
        if (!cancelled) setPlannerSessions(sortPlannerSessions(sessions))
      })
      .catch((err) => {
        if (!cancelled) showToast(`工作区加载失败：${err instanceof Error ? err.message : String(err)}`, 'error')
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    return () => {
      plannerAbortControllerRef.current?.abort()
      plannerAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (planningStartedAt == null) return
    const updateElapsed = () => setPlanningElapsedSeconds(Math.floor((Date.now() - planningStartedAt) / 1000))
    updateElapsed()
    const intervalId = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(intervalId)
  }, [planningStartedAt])

  useEffect(() => {
    setReferencePayloadNotice('')
  }, [inputImages])

  useEffect(() => {
    const versions = currentWorkspace?.sixViewVersions ?? []
    if (versions.length === 0) {
      setSixViewImageSrcById({})
      return
    }
    let cancelled = false
    for (const version of versions) {
      void ensureImageThumbnailCached(version.imageId).then((thumbnail) => {
        if (!cancelled && thumbnail?.dataUrl) {
          setSixViewImageSrcById((current) => ({ ...current, [version.imageId]: thumbnail.dataUrl }))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [currentWorkspace?.id, currentWorkspace?.sixViewVersions])

  useEffect(() => {
    const missingPreviewImages = styleImages.filter((image) => image.status === 'done' && image.imageId && !image.dataUrl)
    if (missingPreviewImages.length === 0) return

    let cancelled = false
    const applyThumbnail = (imageId: string, dataUrl: string) => {
      if (cancelled) return
      setStyleImages((current) => current.map((image) => (
        image.status === 'done' && image.imageId === imageId && !image.dataUrl
          ? { ...image, dataUrl }
          : image
      )))
    }

    const unsubscribers = missingPreviewImages.map((image) => (
      subscribeImageThumbnail(image.imageId!, (thumbnail) => applyThumbnail(image.imageId!, thumbnail.dataUrl))
    ))
    for (const image of missingPreviewImages) {
      void ensureImageThumbnailCached(image.imageId!).then((thumbnail) => {
        if (thumbnail?.dataUrl) applyThumbnail(image.imageId!, thumbnail.dataUrl)
      })
    }

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [styleImages])

  useEffect(() => {
    if (!galleryStyleReferenceRequest) return
    setSelectedStyleIndex(null)
    setSelectedStyleReference({
      imageId: galleryStyleReferenceRequest.imageId,
      label: galleryStyleReferenceRequest.label,
      source: 'gallery',
    })
    setGalleryStyleReferenceRequest(null)
    document.querySelector<HTMLElement>('[data-amazon-style-board]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    showToast('已将图库图片用作当前风格', 'success')
  }, [galleryStyleReferenceRequest, setGalleryStyleReferenceRequest, showToast])

  useEffect(() => {
    const missingItems = styleReferenceLibraryItems.filter((item) => !styleReferenceImageSrcById[item.imageId])
    if (missingItems.length === 0) return

    let cancelled = false
    const applyThumbnail = (imageId: string, dataUrl: string) => {
      if (cancelled) return
      setCachedStyleReferenceImageSrcById((current) => ({ ...current, [imageId]: dataUrl }))
    }

    const unsubscribers = missingItems.map((item) => (
      subscribeImageThumbnail(item.imageId, (thumbnail) => applyThumbnail(item.imageId, thumbnail.dataUrl))
    ))
    for (const item of missingItems) {
      void ensureImageThumbnailCached(item.imageId).then((thumbnail) => {
        if (thumbnail?.dataUrl) applyThumbnail(item.imageId, thumbnail.dataUrl)
      })
    }

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [styleReferenceImageSrcById, styleReferenceLibraryItems])

  const upsertPlannerSessionList = (session: ProductWorkspace) => {
    setPlannerSessions((current) => sortPlannerSessions([
      session,
      ...current.filter((item) => item.id !== session.id),
    ]))
  }

  const createPlannerSessionSnapshot = (overrides: Partial<ProductWorkspace> = {}): ProductWorkspace => {
    const now = Date.now()
    const existing = !overrides.id && currentPlannerSessionId ? plannerSessions.find((session) => session.id === currentPlannerSessionId) : null
    const snapshotDraft = overrides.draft ? fromSessionDraft(overrides.draft) : draft
    const snapshotListingText = overrides.listingText ?? listingText
    const hasSelectedStyleIndexOverride = Object.prototype.hasOwnProperty.call(overrides, 'selectedStyleIndex')
    const hasSelectedStyleReferenceOverride = Object.prototype.hasOwnProperty.call(overrides, 'selectedStyleReference')
    const hasConfirmedSixViewVersionIdOverride = Object.prototype.hasOwnProperty.call(overrides, 'confirmedSixViewVersionId')
    return {
      id: overrides.id ?? currentPlannerSessionId ?? createPlannerSessionId(),
      title: overrides.title ?? getPlannerSessionTitle(snapshotDraft, snapshotListingText),
      mode: overrides.mode ?? plannerMode,
      aPlusType: overrides.aPlusType ?? aPlusType,
      resolution: overrides.resolution ?? resolution,
      listingText: snapshotListingText,
      referenceImageIds: overrides.referenceImageIds ?? existing?.referenceImageIds ?? inputImages.map((image) => image.id),
      draft: overrides.draft ?? toSessionDraft(draft),
      sixViewVersions: overrides.sixViewVersions ?? existing?.sixViewVersions ?? [],
      confirmedSixViewVersionId: hasConfirmedSixViewVersionIdOverride ? overrides.confirmedSixViewVersionId ?? null : existing?.confirmedSixViewVersionId ?? null,
      seriesStyleGuides: normalizeSeriesStyleGuides(overrides.seriesStyleGuides ?? seriesStyleGuides),
      styleCandidates: overrides.styleCandidates ?? styleCandidates,
      styleImages: overrides.styleImages ?? getSessionStyleImages(styleImages),
      selectedStyleIndex: hasSelectedStyleIndexOverride ? overrides.selectedStyleIndex ?? null : selectedStyleIndex,
      selectedStyleReference: hasSelectedStyleReferenceOverride ? overrides.selectedStyleReference ?? null : selectedStyleReference,
      styleDensityMode: overrides.styleDensityMode ?? styleDensityMode,
      imagePlans: overrides.imagePlans ?? imagePlans,
      aPlusPlans: overrides.aPlusPlans ?? aPlusPlansWithSizes,
      dspPlans: overrides.dspPlans ?? dspPlansWithSizes,
      selectedPlanIndex: overrides.selectedPlanIndex ?? selectedPlanIndex,
      selectedAPlusPlanIndex: overrides.selectedAPlusPlanIndex ?? selectedAPlusPlanIndex,
      selectedDspPlanIndex: overrides.selectedDspPlanIndex ?? selectedDspPlanIndex,
      actionProgress: overrides.actionProgress ?? actionProgressRef.current,
      createdAt: overrides.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  const savePlannerSession = async (overrides: Partial<ProductWorkspace> = {}) => {
    const session = createPlannerSessionSnapshot(overrides)
    await putProductWorkspace(session)
    setCurrentPlannerSessionId(session.id)
    upsertPlannerSessionList(session)
    return session
  }

  const updateCurrentPlannerSession = (overrides: Partial<ProductWorkspace>) => {
    if (!currentPlannerSessionId) return
    void savePlannerSession(overrides).catch((err) => {
      showToast(`工作区保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    })
  }

  const markActionProgress = (key: string, progress: PlannerActionProgress) => {
    if (!key) return
    const nextProgress = {
      ...actionProgressRef.current,
      [key]: progress,
    }
    actionProgressRef.current = nextProgress
    setActionProgress(nextProgress)
    updateCurrentPlannerSession({ actionProgress: nextProgress })
  }

  const resetActionProgress = (nextProgress: PlannerActionProgressMap = {}) => {
    actionProgressRef.current = nextProgress
    setActionProgress(nextProgress)
  }

  const changedReferenceWorkspacePatch = (referenceImageIds: string[]): Partial<ProductWorkspace> => ({
    referenceImageIds,
    confirmedSixViewVersionId: null,
  })

  useEffect(() => {
    const handleClearActiveWorkspaceReferences = (event: Event) => {
      const workspaceId = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId
      if (workspaceId && workspaceId !== currentPlannerSessionId) return
      updateCurrentPlannerSession(changedReferenceWorkspacePatch([]))
    }
    window.addEventListener(ACTIVE_PRODUCT_WORKSPACE_REFERENCES_CLEAR_EVENT, handleClearActiveWorkspaceReferences)
    return () => window.removeEventListener(ACTIVE_PRODUCT_WORKSPACE_REFERENCES_CLEAR_EVENT, handleClearActiveWorkspaceReferences)
  })

  const applyPlannerSessionState = (
    session: ProductWorkspace,
    restoredReferences: InputImage[],
    restoredStyleImages: StyleImageState[],
    restoredStyleReference: AmazonPlannerSelectedStyleReference | null,
    selectedStyleRestored: boolean,
  ) => {
    setPlannerMode(session.mode ?? 'listing')
    setAPlusType(session.aPlusType)
    setResolution(session.resolution)
    setListingText(session.listingText)
    setInputImages(restoredReferences)
    setDraft(fromSessionDraft(session.draft))
    setSeriesStyleGuides(normalizeSeriesStyleGuides(session.seriesStyleGuides))
    setStyleCandidates(session.styleCandidates)
    setStyleImages(restoredStyleImages)
    setSelectedStyleIndex(selectedStyleRestored ? session.selectedStyleIndex : null)
    setSelectedStyleReference(restoredStyleReference)
    setStyleDensityMode(session.styleDensityMode ?? 'rich')
    setStylePreview(null)
    setImagePlans(session.imagePlans as AmazonImagePlan[])
    setAPlusPlans(session.aPlusPlans as AmazonAPlusPlan[])
    setDspPlans((session.dspPlans ?? []) as AmazonDspPlan[])
    setSelectedPlanIndex(session.selectedPlanIndex != null && session.imagePlans[session.selectedPlanIndex] ? session.selectedPlanIndex : null)
    setSelectedAPlusPlanIndex(session.selectedAPlusPlanIndex != null && session.aPlusPlans[session.selectedAPlusPlanIndex] ? session.selectedAPlusPlanIndex : null)
    setSelectedDspPlanIndex(session.selectedDspPlanIndex != null && session.dspPlans?.[session.selectedDspPlanIndex] ? session.selectedDspPlanIndex : null)
    setPlannerError('')
    setStyleError(session.selectedStyleIndex != null && !selectedStyleRestored
      ? '工作区中的风格板图片不存在，请重新生成并选择风格板。策划文本已恢复。'
      : '')
    setCurrentPlannerSessionId(session.id)
    setShowPlannerHistory(false)
    resetActionProgress(session.actionProgress ?? {})
  }

  const getImageProfileForSubmit = () => {
    const profile = getDefaultImageProfile(settings)
    if (!profile) {
      showToast('未找到 Images API 生图配置，请先在设置中添加生图配置。', 'error')
      setShowSettings(true, 'api')
      return null
    }
    const validation = validateApiProfile(profile)
    if (validation) {
      showToast(`请先完善生图 API 配置：${validation}`, 'error')
      setShowSettings(true, 'api')
      return null
    }
    return profile
  }

  const createImageRequestSettings = (profile: ApiProfile) => {
    const normalizedSettings = normalizeSettings(settings)
    return normalizeSettings({
      ...normalizedSettings,
      profiles: normalizedSettings.profiles.some((item) => item.id === profile.id)
        ? normalizedSettings.profiles.map((item) => item.id === profile.id ? profile : item)
        : [profile, ...normalizedSettings.profiles],
      activeProfileId: profile.id,
    })
  }

  const buildBatchGenerateJobs = (plannerBatchId?: string): BatchGenerateJob[] => {
    if (plannerMode === 'aplus') {
      return aPlusPlansWithSizes.map((plan, index) => {
        const prompt = buildAmazonAPlusPlanPrompt({
          ...plan,
          seriesStyleGuide: activeSeriesStyleGuide,
          styleReferenceAttached: hasStyleReference,
          structureReferenceAttached: hasStructureReferences,
          styleDensityMode,
        })
        return {
          actionKey: getPlannerActionKey('aplus', index, plan.slot),
          slot: plan.slot,
          prompt,
          targetSize: plan.generationSize,
          category: {
            productTitle: draft.productTitle.trim(),
            workflow: 'amazon-aplus',
            amazonSlot: plan.slot,
            aPlusType,
            plannerSessionId: currentPlannerSessionId ?? undefined,
            productWorkspaceId: currentPlannerSessionId ?? undefined,
            generationStage: 'draft',
            ...(plannerBatchId ? { plannerBatchId } : {}),
            ...selectedStyleReferenceCategory,
          },
        }
      })
    }
    if (plannerMode === 'dsp') {
      return dspPlansWithSizes.map((plan, index) => {
        const prompt = buildAmazonDspPlanPrompt({
          ...plan,
          seriesStyleGuide: activeSeriesStyleGuide,
          styleReferenceAttached: hasStyleReference,
          structureReferenceAttached: hasStructureReferences,
          styleDensityMode,
        })
        return {
          actionKey: getPlannerActionKey('dsp', index, plan.slot),
          slot: plan.slot,
          prompt,
          targetSize: plan.generationSize,
          category: {
            productTitle: draft.productTitle.trim(),
            workflow: 'amazon-dsp',
            amazonSlot: plan.slot,
            plannerSessionId: currentPlannerSessionId ?? undefined,
            productWorkspaceId: currentPlannerSessionId ?? undefined,
            generationStage: 'draft',
            ...(plannerBatchId ? { plannerBatchId } : {}),
            ...selectedStyleReferenceCategory,
          },
        }
      })
    }

    return imagePlans.map((plan, index) => {
      const requiresStyle = !isAmazonListingMainSlot(plan.slot)
      const prompt = buildAmazonPlanPrompt({
        ...plan,
        seriesStyleGuide: requiresStyle ? activeSeriesStyleGuide : null,
        styleReferenceAttached: requiresStyle && hasStyleReference,
        structureReferenceAttached: hasStructureReferences,
        styleDensityMode,
      })
      return {
        actionKey: getPlannerActionKey('listing', index, plan.slot),
        slot: plan.slot,
        prompt,
        targetSize: listingTargetSize,
        category: {
          productTitle: draft.productTitle.trim(),
          workflow: 'amazon-listing',
          amazonSlot: plan.slot,
          plannerSessionId: currentPlannerSessionId ?? undefined,
          productWorkspaceId: currentPlannerSessionId ?? undefined,
          generationStage: 'draft',
          ...(plannerBatchId ? { plannerBatchId } : {}),
          ...(requiresStyle ? selectedStyleReferenceCategory : {}),
        },
      }
    })
  }

  const applyPrompt = (options: { requireStyle?: boolean } = {}) => {
    if (plannerMode === 'aplus' && !selectedAPlusPlan) {
      showToast('请先 AI 策划并选择一个 A+ 模块', 'error')
      return false
    }
    if (plannerMode === 'dsp' && !selectedDspPlan) {
      showToast('请先 AI 策划并选择一个 DSP 素材', 'error')
      return false
    }
    if (!activePrompt.trim()) {
      showToast(getPlanMissingMessage(plannerMode), 'error')
      return false
    }
    if (!hasStructureReferences) {
      showToast('请先上传产品结构参考图', 'error')
      return false
    }
    const shouldRequireStyle = options.requireStyle && styleReferenceRequired
    if (shouldRequireStyle && !selectedStyleReferenceImageId) {
      showToast('请先生成并选择一张风格参考板', 'error')
      return false
    }
    if (shouldRequireStyle && styleReferenceLimitExceeded) {
      showToast(`实际发送参考图数量不能超过 ${API_MAX_IMAGES} 张；请调整原始参考图或风格板后再提交。`, 'error')
      return false
    }

    setPrompt(activePrompt)
    setPendingTaskCategory({
      mode: 'prompt-match',
      prompt: activePrompt,
      category: {
        productTitle: draft.productTitle.trim(),
        workflow: plannerMode === 'aplus' ? 'amazon-aplus' : plannerMode === 'dsp' ? 'amazon-dsp' : 'amazon-listing',
        amazonSlot: plannerMode === 'aplus' ? selectedAPlusPlan?.slot : plannerMode === 'dsp' ? selectedDspPlan?.slot : selectedPlan?.slot,
        plannerSessionId: currentPlannerSessionId ?? undefined,
        productWorkspaceId: currentPlannerSessionId ?? undefined,
        generationStage: 'draft',
        ...(plannerMode === 'aplus' ? { aPlusType } : {}),
        ...(usesStyleReferenceForActivePlan ? selectedStyleReferenceCategory : {}),
      },
    })
    setParams({
      size: targetSize,
      quality: AMAZON_DRAFT_QUALITY,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      n: 1,
    })
    markActionProgress(currentActionKey, 'filled')
    showToast(plannerMode === 'aplus' ? '已填入 A+ 图片提示词' : plannerMode === 'dsp' ? '已填入 DSP 素材提示词' : '已填入亚马逊图片提示词', 'success')
    return true
  }

  const useSixViewRepairPreset = (preset: (typeof SIX_VIEW_REPAIR_PRESETS)[number]) => {
    setSixViewInstruction((current) => current.trim() ? `${current.trim()}\n${preset.prompt}` : preset.prompt)
  }

  const generateSixViewVersion = async () => {
    if (!currentWorkspace) return
    const sourceImageIds = getStandardSixViewSourceImageIds(currentWorkspace)
    if (!sourceImageIds.length) {
      showToast('请先上传产品参考图', 'error')
      return
    }

    const imageProfile = getImageProfileForSubmit()
    if (!imageProfile) return

    const styleImageProfile = createOpenAIInputImageProfile(imageProfile)
    const imageRequestSettings = createImageRequestSettings(styleImageProfile)
    const sourceImages: InputImage[] = []
    for (const imageId of sourceImageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) sourceImages.push({ id: imageId, dataUrl })
    }
    if (!sourceImages.length) {
      showToast('工作区参考图不存在，请重新上传', 'error')
      return
    }

    setIsGeneratingSixView(true)
    setSixViewError('')
    const prompt = buildStandardSixViewPrompt(createPlannerSessionSnapshot(), sixViewInstruction)
    const sixViewParams = normalizeParamsForSettings({
      size: '1024x1024',
      quality: AMAZON_DRAFT_QUALITY,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      moderation: params.moderation,
      n: 1,
    }, imageRequestSettings, { hasInputImages: sourceImages.length > 0 })
    try {
      const result = await callImageApi({
        settings: imageRequestSettings,
        prompt,
        params: sixViewParams,
        inputImageDataUrls: sourceImages.map((image) => image.dataUrl),
      })
      const dataUrl = result.images[0]
      if (!dataUrl) throw new Error('标准 6 视图接口没有返回图片')
      const imageId = await storeImage(dataUrl, 'generated')
      const version: ProductWorkspaceSixViewVersion = createProductWorkspaceSixViewVersion({
        id: `six-view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageId,
        prompt,
        inputImageIds: sourceImageIds,
        createdAt: Date.now(),
      })
      await savePlannerSession({
        sixViewVersions: [...(currentWorkspace.sixViewVersions ?? []), version],
      })
      setSixViewInstruction('')
      showToast('标准 6 视图已生成，请检查后设为已确认 6 视图', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSixViewError(message)
      showToast('标准 6 视图生成失败', 'error')
    } finally {
      setIsGeneratingSixView(false)
    }
  }

  const confirmSixViewVersion = (version: ProductWorkspaceSixViewVersion) => {
    updateCurrentPlannerSession({ confirmedSixViewVersionId: version.id })
    showToast('已确认标准 6 视图', 'success')
  }

  const getStructureImagesForSubmit = async () => {
    const sourceImageIds = currentWorkspace?.referenceImageIds.map((id) => id.trim()).filter(Boolean) ?? []
    const submitImageIds = sourceImageIds.length ? sourceImageIds : inputImages.map((image) => image.id)
    const restoredImages: InputImage[] = []
    for (const imageId of submitImageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) restoredImages.push({ id: imageId, dataUrl })
    }
    if (restoredImages.length !== submitImageIds.length) {
      showToast('工作区结构参考图不完整，请重新打开工作区或重新上传参考图。', 'error')
      return null
    }
    return restoredImages
  }

  const applyAndSubmit = async () => {
    if (!hasStructureReferences) {
      showToast('请先上传产品结构参考图', 'error')
      return
    }
    const structureInputImages = await getStructureImagesForSubmit()
    if (!structureInputImages) return
    setInputImages(structureInputImages)
    if (!applyPrompt({ requireStyle: true })) return
    const imageProfile = getImageProfileForSubmit()
    if (!imageProfile) return
    const submittedActionKey = currentActionKey
    queueMicrotask(() => {
      void submitTask({ apiProfileId: imageProfile.id, inputImages: structureInputImages }).then((submitted) => {
        if (submitted) markActionProgress(submittedActionKey, 'submitted')
      })
    })
  }

  const focusStyleStep = () => {
    document.querySelector<HTMLElement>('[data-amazon-style-board]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  const handlePrimarySubmitAction = () => {
    if (styleReferenceRequired && !hasStyleReference) {
      focusStyleStep()
      return
    }
    void applyAndSubmit()
  }

  const submitAllPlannedImages = async () => {
    if (!hasPlanOptions) {
      showToast('请先完成 AI 策划', 'error')
      return
    }
    if (!hasStructureReferences) {
      showToast('请先上传产品结构参考图', 'error')
      return
    }
    if (seriesStyleReferenceNeeded && !selectedStyleReferenceImageId) {
      showToast('请先生成并选择一张风格参考板', 'error')
      return
    }
    if (batchStyleReferenceLimitExceeded) {
      showToast(`实际发送参考图数量不能超过 ${API_MAX_IMAGES} 张；请调整原始参考图或风格板后再提交。`, 'error')
      return
    }

    const imageProfile = getImageProfileForSubmit()
    if (!imageProfile) return
    const structureInputImages = await getStructureImagesForSubmit()
    if (!structureInputImages) return
    setInputImages(structureInputImages)

    const plannerBatchId = createPlannerBatchId()
    const jobs = buildBatchGenerateJobs(plannerBatchId).filter((job) => actionProgress[job.actionKey] !== 'submitted')
    if (!jobs.length) {
      showToast('当前没有未提交的图片方案', 'error')
      return
    }

    setActivePlannerBatchId(plannerBatchId)
    setIsBatchSubmitting(true)
    setBatchSubmittedCount(0)
    for (const job of jobs) {
      setPrompt(job.prompt)
      setPendingTaskCategory({
        mode: 'prompt-match',
        prompt: job.prompt,
        category: job.category,
      })
      setParams({
        size: job.targetSize,
        quality: AMAZON_DRAFT_QUALITY,
        output_format: DEFAULT_PARAMS.output_format,
        output_compression: DEFAULT_PARAMS.output_compression,
        n: 1,
      })
      markActionProgress(job.actionKey, 'filled')
      const submittedTask = await submitTaskAndGetTask({ apiProfileId: imageProfile.id, inputImages: structureInputImages })
      if (!submittedTask) {
        setIsBatchSubmitting(false)
        showToast(`批量提交已停止：${job.slot} 未提交`, 'error')
        return
      }
      markActionProgress(job.actionKey, 'submitted')
      setBatchSubmittedCount((count) => count + 1)
      await waitForPlannerTaskCompletion(submittedTask.id)
    }

    setIsBatchSubmitting(false)
    showToast(`已提交 ${jobs.length} 张草稿任务`, 'success')
  }

  const copyPrompt = async () => {
    if (plannerMode === 'aplus' && !selectedAPlusPlan) {
      showToast('请先 AI 策划并选择一个 A+ 模块', 'error')
      return
    }
    if (plannerMode === 'dsp' && !selectedDspPlan) {
      showToast('请先 AI 策划并选择一个 DSP 素材', 'error')
      return
    }
    if (!activePrompt.trim()) {
      showToast(getPlanMissingMessage(plannerMode), 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(activePrompt)
      showToast('提示词已复制', 'success')
    } catch {
      showToast('复制失败，请手动选择提示词', 'error')
    }
  }

  const copyAPlusText = async () => {
    if (!selectedAPlusText.trim()) {
      showToast('当前 A+ 模块没有可复制文案', 'error')
      return
    }

    try {
      await navigator.clipboard.writeText(selectedAPlusText)
      showToast('A+ 文案已复制', 'success')
    } catch {
      showToast('复制失败，请手动选择文案', 'error')
    }
  }

  const prepareReferencePayloadForRequest = async (dataUrls: string[], signal?: AbortSignal): Promise<PlannerReferenceImagePayload> => {
    if (!dataUrls.length) {
      setReferencePayloadNotice('')
      return prepareReferenceImagePayload([], { signal })
    }

    setIsPreparingReferencePayload(true)
    setReferencePayloadNotice('')
    try {
      const payload = await prepareReferenceImagePayload(dataUrls, { signal })
      if (payload.notice) setReferencePayloadNotice(payload.notice)
      return payload
    } finally {
      setIsPreparingReferencePayload(false)
    }
  }

  const updateStyleImageState = (nextImage: StyleImageState) => {
    setStyleImages((current) => current.map((image) => image.candidateIndex === nextImage.candidateIndex ? nextImage : image))
  }

  const generateStyleImages = async () => {
    if (!styleCandidates.length) {
      showToast('请先完成 AI 策划，再生成风格板', 'error')
      return
    }

    const imageProfile = getImageProfileForSubmit()
    if (!imageProfile) {
      return
    }
    const styleImageProfile = createOpenAIInputImageProfile(imageProfile)
    const imageRequestSettings = createImageRequestSettings(styleImageProfile)

    setIsGeneratingStyleImages(true)
    setStyleError('')
    setSelectedStyleIndex(null)
    setSelectedStyleReference(null)
    setStylePreview(null)
    setStyleImages(styleCandidates.map((_, index) => ({ candidateIndex: index, status: 'running' })))

    const styleParams = normalizeParamsForSettings({
      size: '1024x1024',
      quality: AMAZON_DRAFT_QUALITY,
      output_format: DEFAULT_PARAMS.output_format,
      output_compression: DEFAULT_PARAMS.output_compression,
      moderation: params.moderation,
      n: 1,
    }, imageRequestSettings, { hasInputImages: false })

    const nextStyleImages = await Promise.all(styleCandidates.map(async (candidate, candidateIndex): Promise<StyleImageState> => {
      try {
        const result = await callImageApi({
          settings: imageRequestSettings,
          prompt: buildAmazonStyleCandidatePrompt(candidate, activeSeriesStyleGuide),
          params: styleParams,
          inputImageDataUrls: [],
        })
        const dataUrl = result.images[0]
        if (!dataUrl) throw new Error('风格板接口没有返回图片')
        const imageId = await storeImage(dataUrl, 'generated')
        const nextImage: StyleImageState = { candidateIndex, status: 'done', imageId, dataUrl }
        updateStyleImageState(nextImage)
        return nextImage
      } catch (err) {
        const nextImage: StyleImageState = {
          candidateIndex,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }
        updateStyleImageState(nextImage)
        return nextImage
      }
    }))
    setStyleImages(nextStyleImages)
    setIsGeneratingStyleImages(false)

    const failed = nextStyleImages.filter((image) => image.status === 'error')
    updateCurrentPlannerSession({
      styleImages: getSessionStyleImages(nextStyleImages),
      selectedStyleIndex: null,
      selectedStyleReference: null,
    })
    if (failed.length === styleCandidates.length) {
      const message = failed[0]?.error || '风格板生成失败'
      setStyleError(message)
      showToast('风格板生成失败，请查看详情', 'error')
      return
    }
    if (failed.length > 0) {
      setStyleError(`${failed.length} 张风格板生成失败，可先选择已成功的风格板。`)
      showToast('部分风格板生成失败', 'error')
      return
    }
    showToast('风格板已生成，请选择一个视觉风格', 'success')
  }

  const applyPlannerResult = (result: PlannerApiResult, sourceLabel: string) => {
    const firstPlan = result.plans[0]
    const nextDraft = {
      ...draft,
      ...result.parsed.inferred,
      productTitle: result.parsed.title || draft.productTitle,
      sellingPoints: result.parsed.bullets.length ? result.parsed.bullets.join('\n') : draft.sellingPoints,
      ...(firstPlan?.kind ? { kind: firstPlan.kind } : {}),
    }
    const nextSeriesStyleGuides = {
      ...seriesStyleGuides,
      [result.mode]: result.seriesStyleGuide,
    }
    const nextImagePlans = result.mode === 'listing' ? result.plans : []
    const nextAPlusPlans = result.mode === 'aplus' ? withAPlusGenerationSizes(result.aPlusPlans, resolutionTier) : []
    const nextDspPlans = result.mode === 'dsp' ? withDspGenerationSizes(result.dspPlans, resolutionTier) : []
    const nextSelectedPlanIndex = result.mode === 'listing' && result.plans.length ? 0 : null
    const nextSelectedAPlusPlanIndex = result.mode === 'aplus' && result.aPlusPlans.length ? 0 : null
    const nextSelectedDspPlanIndex = result.mode === 'dsp' && result.dspPlans.length ? 0 : null

    setDraft(nextDraft)
    if (result.mode === 'aplus') {
      setAPlusPlans(nextAPlusPlans)
      setImagePlans([])
      setDspPlans([])
      setSelectedAPlusPlanIndex(nextSelectedAPlusPlanIndex)
      setSelectedPlanIndex(null)
      setSelectedDspPlanIndex(null)
    } else if (result.mode === 'dsp') {
      setDspPlans(nextDspPlans)
      setImagePlans([])
      setAPlusPlans([])
      setSelectedDspPlanIndex(nextSelectedDspPlanIndex)
      setSelectedPlanIndex(null)
      setSelectedAPlusPlanIndex(null)
    } else {
      setImagePlans(nextImagePlans)
      setAPlusPlans([])
      setDspPlans([])
      setSelectedPlanIndex(nextSelectedPlanIndex)
      setSelectedAPlusPlanIndex(null)
      setSelectedDspPlanIndex(null)
    }
    setSeriesStyleGuides(nextSeriesStyleGuides)
    setStyleCandidates(result.styleCandidates)
    setStyleImages([])
    setSelectedStyleIndex(null)
    setSelectedStyleReference(null)
    setStylePreview(null)
    setStyleError('')
    setPlannerError('')
    resetActionProgress()
    void savePlannerSession({
      mode: result.mode,
      draft: toSessionDraft(nextDraft),
      seriesStyleGuides: nextSeriesStyleGuides,
      styleCandidates: result.styleCandidates,
      styleImages: [],
      selectedStyleIndex: null,
      selectedStyleReference: null,
      styleDensityMode,
      imagePlans: nextImagePlans,
      aPlusPlans: nextAPlusPlans,
      dspPlans: nextDspPlans,
      selectedPlanIndex: nextSelectedPlanIndex,
      selectedAPlusPlanIndex: nextSelectedAPlusPlanIndex,
      selectedDspPlanIndex: nextSelectedDspPlanIndex,
      actionProgress: {},
    }).catch((err) => {
      showToast(`工作区保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    })
    showToast(`${sourceLabel}已生成 ${result.mode === 'aplus' ? result.aPlusPlans.length : result.mode === 'dsp' ? result.dspPlans.length : result.plans.length} 张图片策划`, 'success')
  }

  const applyAmazonDomImportResult = async (result: AmazonDomImportResult) => {
    setListingText(result.listingText)
    setDraft((current) => ({
      ...current,
      ...result.draft,
      productTitle: result.draft.productTitle ?? current.productTitle,
      sellingPoints: result.draft.sellingPoints ?? current.sellingPoints,
    }))
    setPlannerError('')
    setAmazonImportPreview(null)
    setAmazonImportStatus(result.asin ? `已应用亚马逊商品信息（ASIN ${result.asin}）` : '已应用亚马逊商品信息')
    const currentImage = getCurrentAmazonImportImage(result)
    if (currentImage) {
      await addAmazonImportImage(currentImage.url, { successMessage: '已应用商品信息并添加当前图片' })
    } else {
      showToast('已应用到策划', 'success')
    }
  }

  const previewAmazonDomImportResult = (result: AmazonDomImportResult) => {
    setAmazonImportPreview(result)
    setPlannerError('')
    setAmazonImportStatus(result.asin ? `已读取商品信息（ASIN ${result.asin}），请确认后应用。` : '已读取商品信息，请确认后应用。')
  }

  const addAmazonImportImage = async (url: string, options: { successMessage?: string } = {}) => {
    if (useStore.getState().inputImages.length >= API_MAX_IMAGES) {
      showToast(`参考图数量已达上限（${API_MAX_IMAGES} 张）`, 'error')
      return
    }
    setAddingAmazonImageUrl(url)
    try {
      await addImageFromUrl(url)
      updateCurrentPlannerSession(changedReferenceWorkspacePatch(useStore.getState().inputImages.map((image) => image.id)))
      showToast(options.successMessage ?? '已添加为参考图', 'success')
    } catch {
      showToast('图片读取受限，请右键保存图片后上传参考图。', 'error')
    } finally {
      setAddingAmazonImageUrl('')
    }
  }

  const importAmazonUrl = async () => {
    if (!amazonImportUrl.trim()) {
      setAmazonImportStatus('请先粘贴亚马逊商品 URL。')
      showToast('请先粘贴亚马逊商品 URL', 'error')
      return
    }

    setIsAmazonImporting(true)
    setAmazonImportStatus('正在读取亚马逊页面...')
    try {
      previewAmazonDomImportResult(await importAmazonDomFromUrl(amazonImportUrl))
    } catch (err) {
      const message = err instanceof Error && err.message === AMAZON_DOM_PARSE_FAILURE_MESSAGE
        ? AMAZON_DOM_PARSE_FAILURE_MESSAGE
        : AMAZON_DOM_URL_IMPORT_FAILURE_MESSAGE
      setAmazonImportStatus(message)
      showToast(message === AMAZON_DOM_PARSE_FAILURE_MESSAGE ? 'DOM 内容解析失败' : 'URL 导入失败，请上传 DOM 文件', 'error')
    } finally {
      setIsAmazonImporting(false)
    }
  }

  const importAmazonDomFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsAmazonImporting(true)
    setAmazonImportStatus('正在解析网页文件...')
    try {
      previewAmazonDomImportResult(parseAmazonDomHtml(await file.text(), amazonImportUrl))
    } catch {
      setAmazonImportStatus(AMAZON_DOM_PARSE_FAILURE_MESSAGE)
      showToast('网页文件解析失败', 'error')
    } finally {
      setIsAmazonImporting(false)
    }
  }

  const createAiPlan = async () => {
    if (plannerAbortControllerRef.current) {
      showToast('AI 策划正在进行中', 'info')
      return
    }
    if (!listingText.trim()) {
      showToast(plannerMode === 'dsp' ? '请先粘贴标题、五点描述、品牌或活动说明' : '请先粘贴标题和五点描述', 'error')
      return
    }

    if (!plannerProfile) {
      setPlannerError('未选择支持 Chat Completions 或 Responses API 的 AI 策划配置。\n\n请在设置 -> API 中创建或选择一个 Chat Completions 配置，例如 DeepSeek 文本模型；生图配置继续使用 Images API，不要把 gpt-image-2 用作策划模型。')
      showToast('AI 策划配置缺失', 'error')
      return
    }
    if (plannerProfileValidation) {
      setPlannerError(`AI 策划配置「${plannerProfile.name}」不完整：${plannerProfileValidation}`)
      showToast('AI 策划配置不完整', 'error')
      return
    }

    const controller = new AbortController()
    plannerAbortControllerRef.current = controller
    setPlanningStartedAt(Date.now())
    setPlanningElapsedSeconds(0)
    setPlannerRunStage(inputImages.length ? 'reference' : 'planning')
    setIsPlanning(true)
    setPlannerError('')
    try {
      const referencePayload = await prepareReferencePayloadForRequest(inputImages.map((image) => image.dataUrl), controller.signal)
      setPlannerRunStage('planning')
      const result = await callAmazonPlannerApi({
        listingText,
        baseDraft: draft,
        profile: plannerProfile,
        referenceImageDataUrls: referencePayload.dataUrls,
        mode: plannerMode,
        aPlusType,
        aPlusGenerationTier: resolutionTier,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setPlannerRunStage('saving')
      applyPlannerResult(result, plannerMode === 'aplus' ? 'A+ AI 策划' : plannerMode === 'dsp' ? 'DSP AI 策划' : 'AI 策划')
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return
      setPlannerError(getPlannerFailureDetail(err))
      showToast('AI 策划失败，请查看详情', 'error')
    } finally {
      if (plannerAbortControllerRef.current === controller) {
        plannerAbortControllerRef.current = null
        setIsPlanning(false)
        setPlannerRunStage('idle')
        setPlanningStartedAt(null)
        setPlanningElapsedSeconds(0)
      }
    }
  }

  const stopAiPlan = () => {
    const controller = plannerAbortControllerRef.current
    if (!controller) return
    controller.abort()
    plannerAbortControllerRef.current = null
    setIsPlanning(false)
    setPlannerRunStage('idle')
    setPlanningStartedAt(null)
    setPlanningElapsedSeconds(0)
    showToast('AI 策划已停止', 'info')
  }

  const createSelectedStyleReference = (
    imageState: StyleImageState,
    candidate: AmazonStyleCandidate | undefined,
    index: number,
  ): AmazonPlannerSelectedStyleReference => ({
    imageId: imageState.imageId!,
    label: candidate?.label ?? `风格 ${index + 1}`,
    description: candidate?.description,
    source: 'current-candidate',
    candidateIndex: index,
    plannerSessionId: currentPlannerSessionId ?? undefined,
  })

  const selectStyleReferenceFromLibrary = (item: StyleReferenceLibraryItem) => {
    const matchingCurrentImage = item.candidateIndex == null ? null : styleImages.find((image) => (
      image.candidateIndex === item.candidateIndex &&
      image.status === 'done' &&
      image.imageId === item.imageId
    ))
    const nextSelectedStyleIndex = matchingCurrentImage ? item.candidateIndex! : null
    const nextReference: AmazonPlannerSelectedStyleReference = {
      imageId: item.imageId,
      label: item.label,
      description: item.description,
      source: item.source,
      candidateIndex: item.candidateIndex,
      plannerSessionId: item.plannerSessionId,
    }

    setSelectedStyleIndex(nextSelectedStyleIndex)
    setSelectedStyleReference(nextReference)
    updateCurrentPlannerSession({
      selectedStyleIndex: nextSelectedStyleIndex,
      selectedStyleReference: nextReference,
      styleImages: getSessionStyleImages(styleImages),
    })
  }

  const selectStyleCandidate = (index: number) => {
    const imageState = styleImages.find((image) => image.candidateIndex === index && image.status === 'done' && image.imageId)
    if (!imageState) return
    const nextReference = createSelectedStyleReference(imageState, styleCandidates[index], index)
    setSelectedStyleIndex(index)
    setSelectedStyleReference(nextReference)
    updateCurrentPlannerSession({
      selectedStyleIndex: index,
      selectedStyleReference: nextReference,
      styleImages: getSessionStyleImages(styleImages),
    })
  }

  const changeStyleDensityMode = (mode: AmazonStyleDensityMode) => {
    setStyleDensityMode(mode)
    updateCurrentPlannerSession({ styleDensityMode: mode })
  }

  const updateStylePreview = (
    candidate: AmazonStyleCandidate,
    imageState: StyleImageState | undefined,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (imageState?.status !== 'done' || !imageState.dataUrl) return
    setStylePreview({
      dataUrl: imageState.dataUrl,
      label: candidate.label,
      description: candidate.description,
      ...getStylePreviewPosition(event.clientX, event.clientY),
    })
  }

  const openStylePreview = (imageId: string) => {
    setLightboxImageId(imageId, styleReferenceLightboxImageIds.length ? styleReferenceLightboxImageIds : [imageId])
  }

  const createProductWorkspace = async () => {
    const workspaceId = newWorkspaceId.trim()
    if (!workspaceId) {
      showToast('请输入工作区 ID', 'error')
      return
    }
    const workspace = createEmptyProductWorkspace({
      id: workspaceId,
      title: newWorkspaceTitle.trim() || workspaceId,
      createdAt: Date.now(),
    })
    await putProductWorkspace(workspace)
    upsertPlannerSessionList(workspace)
    applyPlannerSessionState(workspace, [], [], null, true)
    setNewWorkspaceId('')
    setNewWorkspaceTitle('')
    showToast('工作区已新建', 'success')
  }

  const selectPlan = (index: number) => {
    const plan = imagePlans[index]
    setSelectedPlanIndex(plan ? index : null)
    if (plan) {
      setDraft((current) => plan.kind ? { ...current, kind: plan.kind } : current)
    }
    updateCurrentPlannerSession({
      selectedPlanIndex: plan ? index : null,
      draft: toSessionDraft(plan?.kind ? { ...draft, kind: plan.kind } : draft),
    })
  }

  const selectAPlusPlan = (index: number) => {
    const plan = aPlusPlansWithSizes[index]
    setSelectedAPlusPlanIndex(plan ? index : null)
    updateCurrentPlannerSession({
      selectedAPlusPlanIndex: plan ? index : null,
    })
  }

  const selectDspPlan = (index: number) => {
    const plan = dspPlansWithSizes[index]
    setSelectedDspPlanIndex(plan ? index : null)
    updateCurrentPlannerSession({
      selectedDspPlanIndex: plan ? index : null,
    })
  }

  const selectVisiblePlan = (index: number) => {
    if (plannerMode === 'aplus') selectAPlusPlan(index)
    else if (plannerMode === 'dsp') selectDspPlan(index)
    else selectPlan(index)
  }

  const stepVisiblePlan = (direction: -1 | 1) => {
    if (visiblePlanCount === 0 || visiblePlanIndex == null) return
    const nextIndex = Math.min(visiblePlanCount - 1, Math.max(0, visiblePlanIndex + direction))
    if (nextIndex !== visiblePlanIndex) selectVisiblePlan(nextIndex)
  }

  const changePlannerMode = (mode: AmazonPlannerMode) => {
    if (mode === plannerMode) return
    setPlannerMode(mode)
    setStyleError('')
  }

  const changeAPlusType = (nextType: APlusContentType) => {
    setAPlusType(nextType)
    if (nextType !== aPlusType) {
      setAPlusPlans([])
      setSelectedAPlusPlanIndex(null)
      setSeriesStyleGuides((current) => ({ ...current, aplus: '' }))
      setStyleCandidates([])
      setStyleImages([])
      setSelectedStyleIndex(null)
      setSelectedStyleReference(null)
      setStylePreview(null)
      setStyleError('')
      resetActionProgress()
    }
  }

  const clearListingPlan = () => {
    setListingText('')
    setImagePlans([])
    setAPlusPlans([])
    setDspPlans([])
    setSeriesStyleGuides({ listing: '', aplus: '', dsp: '' })
    setStyleCandidates([])
    setStyleImages([])
    setSelectedStyleIndex(null)
    setSelectedStyleReference(null)
    setStyleDensityMode('rich')
    setStylePreview(null)
    setStyleError('')
    setSelectedPlanIndex(null)
    setSelectedAPlusPlanIndex(null)
    setSelectedDspPlanIndex(null)
    setPlannerError('')
    setCurrentPlannerSessionId(null)
    resetActionProgress()
  }

  const restorePlannerSession = async (session: ProductWorkspace) => {
    const restoredReferences = []
    for (const imageId of session.referenceImageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) restoredReferences.push({ id: imageId, dataUrl })
    }

    const restoredStyleImages: StyleImageState[] = []
    for (const image of session.styleImages) {
      const thumbnail = await ensureImageThumbnailCached(image.imageId)
      const restoredStyleImage: StyleImageState = {
        candidateIndex: image.candidateIndex,
        status: 'done',
        imageId: image.imageId,
      }
      if (thumbnail?.dataUrl) restoredStyleImage.dataUrl = thumbnail.dataUrl
      restoredStyleImages.push(restoredStyleImage)
    }

    const selectedStyleRestored = session.selectedStyleIndex != null &&
      restoredStyleImages.some((image) => image.candidateIndex === session.selectedStyleIndex)
    const restoredStyleReference = session.selectedStyleReference?.imageId
      ? session.selectedStyleReference
      : selectedStyleRestored && session.selectedStyleIndex != null
        ? (() => {
            const restoredImage = restoredStyleImages.find((image) => image.candidateIndex === session.selectedStyleIndex)
            const candidate = session.styleCandidates[session.selectedStyleIndex]
            return restoredImage?.imageId
              ? {
                  imageId: restoredImage.imageId,
                  label: candidate?.label ?? `风格 ${session.selectedStyleIndex + 1}`,
                  description: candidate?.description,
                  source: 'current-candidate' as const,
                  candidateIndex: session.selectedStyleIndex,
                  plannerSessionId: session.id,
                }
              : null
          })()
        : null

    applyPlannerSessionState(session, restoredReferences, restoredStyleImages, restoredStyleReference, selectedStyleRestored)
    showToast('工作区已打开', 'success')
  }

  const removePlannerSession = async (sessionId: string) => {
    try {
      await deleteProductWorkspace(sessionId)
      setPlannerSessions((current) => current.filter((session) => session.id !== sessionId))
      if (currentPlannerSessionId === sessionId) setCurrentPlannerSessionId(null)
      showToast('工作区已删除', 'success')
    } catch (err) {
      showToast(`工作区删除失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const copyPlannerError = async () => {
    try {
      await navigator.clipboard.writeText(plannerError)
      showToast('错误详情已复制', 'success')
    } catch {
      showToast('复制错误详情失败', 'error')
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (accepted.length === 0) {
      showToast('请选择图片文件', 'error')
      return
    }

    const currentCount = useStore.getState().inputImages.length
    if (currentCount >= API_MAX_IMAGES) {
      showToast(`参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`, 'error')
      return
    }

    const remaining = API_MAX_IMAGES - currentCount
    const toAdd = accepted.slice(0, remaining)
    const discarded = accepted.length - toAdd.length

    try {
      for (const file of toAdd) {
        await addImageFromFile(file)
      }

      const added = useStore.getState().inputImages.length - currentCount
      updateCurrentPlannerSession(changedReferenceWorkspacePatch(useStore.getState().inputImages.map((image) => image.id)))
      if (discarded > 0) {
        showToast(
          added > 0
            ? `已上传 ${added} 张参考图，已达上限 ${API_MAX_IMAGES} 张，${discarded} 张被丢弃`
            : `已达上限 ${API_MAX_IMAGES} 张，${discarded} 张图片被丢弃`,
          added > 0 ? 'success' : 'error',
        )
        return
      }

      showToast(added > 0 ? `已上传 ${added} 张参考图` : '参考图已存在', added > 0 ? 'success' : 'info')
    } catch (err) {
      showToast(`参考图上传失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files || [])
    event.target.value = ''
  }

  const plannerRelatedTasks = currentPlannerSessionId
    ? tasks.some((task) => task.category?.plannerSessionId === currentPlannerSessionId)
    : false
  const productionGuideState = deriveProductionGuideState({
    hasUsablePlannerProfile,
    hasListingText,
    hasPlanOptions,
    needsStyleReference: seriesStyleReferenceNeeded,
    hasStyleReference,
    hasSelectedPlan,
    hasRelatedTasks: plannerRelatedTasks || submittedVisiblePlanCount > 0,
  })
  const productionEstimate = getProductionEstimate({
    phase: isPlanning
      ? 'planning'
      : isGeneratingStyleImages || productionGuideState.currentStageId === 'style'
        ? 'style'
        : isBatchSubmitting
          ? 'batch'
          : 'generation',
    mode: plannerMode,
    resolution,
    elapsedSeconds: undefined,
  })
  const scrollToPlannerTarget = (selector: string) => {
    document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const getProductionPrimaryActionLabel = (stage: ProductionStageId) => {
    if (stage === 'configure-api') return '配置 API'
    if (stage === 'prepare-input') return '去填资料'
    if (stage === 'plan') return '开始 AI 策划'
    if (stage === 'style') return hasGeneratedStyleImages ? '选择风格板' : '生成风格板'
    if (stage === 'select-plan') return '选择图片位'
    if (stage === 'review-reuse') return '去历史查看'
    return '提交当前项'
  }
  const handleProductionPrimaryAction = () => {
    const stage = productionGuideState.currentStageId
    if (stage === 'configure-api') {
      setShowSettings(true, 'api')
      return
    }
    if (stage === 'prepare-input') {
      scrollToPlannerTarget('[data-onboarding-target="listing-input"], textarea')
      return
    }
    if (stage === 'plan') {
      void createAiPlan()
      return
    }
    if (stage === 'style') {
      if (hasGeneratedStyleImages) {
        focusStyleStep()
        return
      }
      void generateStyleImages()
      return
    }
    if (stage === 'select-plan') {
      scrollToPlannerTarget(`[${'data-amazon-action'}-bar]`)
      return
    }
    if (stage === 'review-reuse') {
      scrollToPlannerTarget('[data-onboarding-target="history-panel"]')
      return
    }
    handlePrimarySubmitAction()
  }

  if (!currentPlannerSessionId) {
    return (
      <section className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
        <div className="border-b border-gray-200 p-4 dark:border-white/[0.08] sm:p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">商品工作区</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            先新建或打开工作区，再生产 Listing 图 / A+ 图 / DSP 图。请先上传产品结构参考图，后续生图直接发送这些参考图。
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">新建工作区</div>
            <div className="mt-3 grid gap-3">
              <label>
                <span className={LABEL_CLASS}>工作区 ID</span>
                <input
                  value={newWorkspaceId}
                  onChange={(event) => setNewWorkspaceId(event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="例如 ASIN、型号或任意字符串"
                />
              </label>
              <label>
                <span className={LABEL_CLASS}>工作区标题</span>
                <input
                  value={newWorkspaceTitle}
                  onChange={(event) => setNewWorkspaceTitle(event.target.value)}
                  className={FIELD_CLASS}
                  placeholder="可选，默认使用工作区 ID"
                />
              </label>
              <button
                type="button"
                onClick={() => void createProductWorkspace()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                新建工作区
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">打开工作区</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">工作区保存商品信息、结构参考图、可选辅助视图版本和策划进度。</div>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                {plannerSessions.length}
              </span>
            </div>
            {plannerSessions.length > 0 ? (
              <div className="grid gap-2">
                {plannerSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => void restorePlannerSession(session)}
                    className="rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{session.title}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{formatPlannerSessionTime(session.updatedAt)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{session.id}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400">
                暂无工作区，请先新建。
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section data-no-drag-select data-onboarding-target="planner-panel" className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-white/[0.08] sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">亚马逊图片工作台</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>商品工作区：{currentWorkspace?.id ?? currentPlannerSessionId}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span>OpenAI gpt-image-2</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span>2K / 4K</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span>主图、附图、A+ 与 DSP 策划</span>
            </div>
            <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              {([
                ['listing', 'Listing 图'],
                ['aplus', 'A+ 图'],
                ['dsp', 'DSP 图'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changePlannerMode(mode)}
                  className={`h-8 rounded-lg px-3 text-sm font-medium transition ${plannerMode === mode ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void savePlannerSession().then(() => showToast('工作区已保存', 'success'))}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              保存工作区
            </button>
            <button
              type="button"
              onClick={() => setCurrentPlannerSessionId(null)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              关闭工作区
            </button>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">最终清晰度</span>
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
            <button
              type="button"
              onClick={() => setShowPlannerHistory((value) => !value)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${showPlannerHistory ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
            >
              <HistoryIcon className="h-4 w-4" />
              工作区
              {plannerSessions.length > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                  {plannerSessions.length}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <PlannerProductionGuide
            currentStageId={productionGuideState.currentStageId}
            completedStageIds={productionGuideState.completedStageIds}
            estimate={productionEstimate}
            primaryActionLabel={getProductionPrimaryActionLabel(productionGuideState.currentStageId)}
            onPrimaryAction={handleProductionPrimaryAction}
          />
        </div>
        {showPlannerHistory && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">工作区</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  保存在当前账号中；打开后会带回商品信息、结构参考图、可选辅助视图版本、策划卡片、风格候选和已选风格板。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlannerHistory(false)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              >
                收起
              </button>
            </div>
            {plannerSessions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {plannerSessions.map((session) => (
                  <div key={session.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{session.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{getPlannerModeLabel(session.mode ?? 'listing')}</span>
                          <span>·</span>
                          <span>{session.mode === 'aplus' ? session.aPlusType : session.mode === 'dsp' ? `${session.dspPlans?.length ?? 0} 个素材` : `${session.imagePlans.length} 张`}</span>
                          <span>·</span>
                          <span>{formatPlannerSessionTime(session.updatedAt)}</span>
                        </div>
                      </div>
                      {currentPlannerSessionId === session.id && (
                        <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                      )}
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {session.listingText || session.draft.sellingPoints || '无 Listing 文本'}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void restorePlannerSession(session).catch((err) => {
                            showToast(`工作区打开失败：${err instanceof Error ? err.message : String(err)}`, 'error')
                          })
                        }}
                        className="inline-flex h-8 items-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePlannerSession(session.id)}
                        className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400">
                暂无工作区，请先新建。
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="border-b border-gray-200 p-4 dark:border-white/[0.08] sm:p-5 lg:border-b-0 lg:border-r">
          <div className={`rounded-xl border p-3 shadow-sm transition ${getGuidePanelClass(plannerGuideActive)}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {getPlannerModeTitle(plannerMode)}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {getPlannerModeDescription(plannerMode)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                双配置
              </div>
            </div>
            {plannerGuideActive && (
              <div className={`${GUIDE_HINT_CLASS} mt-3`}>
                {guideState.message}
              </div>
            )}
            {plannerMode === 'aplus' && (
              <div className="mt-3 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
                {([
                  ['standard-large', '大图版'],
                  ['standard', 'Standard'],
                  ['premium', 'Premium'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => changeAPlusType(type)}
                    className={`h-8 rounded-lg px-3 text-sm font-medium transition ${aPlusType === type ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-end">
                <label className="min-w-0 flex-1">
                  <span className={LABEL_CLASS}>导入亚马逊商品</span>
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
                    className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white transition ${isAmazonImporting ? 'cursor-wait bg-gray-400' : 'bg-gray-800 hover:bg-gray-700 dark:bg-white/[0.12] dark:hover:bg-white/[0.20]'}`}
                  >
                    <ImportIcon className="h-4 w-4" />
                    {isAmazonImporting ? '导入中...' : '一键导入'}
                  </button>
                  <button
                    type="button"
                    onClick={() => amazonDomFileInputRef.current?.click()}
                    disabled={isAmazonImporting}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-wait disabled:text-gray-400 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                  >
                    <ImportIcon className="h-4 w-4" />
                    上传网页文件
                  </button>
                  <a
                    href={AMAZON_IMPORT_EXTENSION_ZIP}
                    download
                    className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    下载浏览器插件
                  </a>
                </div>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                DOM 导入不需要 API Key；提示缺少 API Key 时，只影响 AI 策划和生图。
              </div>
              {amazonImportStatus && (
                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                  {amazonImportStatus}
                </div>
              )}
              {amazonImportPreview && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-gray-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">导入预览</div>
                      <div className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        请确认识别结果，再应用到策划字段。
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void applyAmazonDomImportResult(amazonImportPreview)}
                        className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                      >
                        {getCurrentAmazonImportImage(amazonImportPreview) ? '应用并添加当前图' : '应用到策划'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmazonImportPreview(null)}
                        className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                      >
                        重新导入
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">商品标题</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.title || '未识别'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">五点描述</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.bullets.length} 条</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">品牌</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.draft.brand || '未识别'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">颜色</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.draft.color || '未识别'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">材质</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.draft.material || '未识别'}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-500 dark:text-gray-400">包装清单</span>
                      <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">{amazonImportPreview.draft.packageIncludes || '未识别'}</div>
                    </div>
                  </div>
                  {amazonImportPreview.imageCandidates.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">商品图片（当前图优先）</div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,88px)]">
                        {amazonImportPreview.imageCandidates.map((image) => (
                          <div key={image.url} className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {image.isCurrent && (
                              <div className="bg-blue-600 px-1.5 py-1 text-center text-[10px] font-semibold text-white">
                                当前图
                              </div>
                            )}
                            <img src={image.url} alt={image.label} className="aspect-square w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => void addAmazonImportImage(image.url)}
                              disabled={Boolean(addingAmazonImageUrl)}
                              className="w-full px-1.5 py-1.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 disabled:cursor-wait disabled:text-gray-400 dark:text-blue-300 dark:hover:bg-blue-400/10"
                            >
                              {addingAmazonImageUrl === image.url ? '添加中' : image.isCurrent ? '添加当前图' : '添加参考图'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input ref={amazonDomFileInputRef} type="file" className="hidden" onChange={importAmazonDomFile} />
            </div>
            <label data-onboarding-target="listing-input" className={`mt-3 block rounded-xl transition ${getGuideFocusClass(guideState.target === 'planner-input')}`}>
              <span className={LABEL_CLASS}>{getPlannerInputLabel(plannerMode)}</span>
              <textarea
                value={listingText}
                onChange={(event) => setListingText(event.target.value)}
                className={`${FIELD_CLASS} min-h-[138px] resize-y`}
                placeholder={getPlannerInputPlaceholder(plannerMode)}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className={`rounded-xl border px-3 py-2 transition ${guideState.target === 'planner-api' ? 'border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-500/15 dark:border-blue-400/60 dark:bg-blue-500/10 dark:text-blue-100' : plannerProfile && !plannerProfileValidation ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'}`}>
                <div className="text-xs font-semibold">AI 策划配置</div>
                <div className="mt-1 text-xs leading-relaxed">
                  {plannerProfile ? `${plannerProfile.name} · ${plannerProfile.model} · ${plannerApiLabel}` : '未配置，请在设置中选择一个 Chat Completions 策划配置'}
                  {plannerProfileValidation ? `（${plannerProfileValidation}）` : ''}
                </div>
              </div>
              <div data-onboarding-target="planner-action" className={`flex flex-wrap items-center gap-2 rounded-xl transition sm:justify-end ${getGuideFocusClass(guideState.target === 'planner-action')}`}>
                <button
                  type="button"
                  onClick={createAiPlan}
                  disabled={isPlanning || Boolean(plannerProfileValidation)}
                  className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white transition ${isPlanning ? 'cursor-wait bg-gray-400' : plannerProfileValidation ? 'cursor-not-allowed bg-gray-300 dark:bg-white/[0.12]' : 'bg-blue-600 hover:bg-blue-500'} ${guideState.target === 'planner-action' ? 'ring-2 ring-blue-500/25 ring-offset-2 ring-offset-white dark:ring-offset-gray-950' : ''}`}
                >
                  {isPlanning ? `策划中 ${formatPlannerElapsedLabel(planningElapsedSeconds)}` : getCreatePlanButtonLabel(plannerMode)}
                </button>
                {isPlanning && (
                  <button
                    type="button"
                    onClick={stopAiPlan}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-400/10"
                  >
                    <CloseIcon className="h-4 w-4" />
                    停止
                  </button>
                )}
                {(listingText.trim() || imagePlans.length > 0 || aPlusPlans.length > 0 || dspPlans.length > 0) && (
                  <button
                    type="button"
                    onClick={clearListingPlan}
                    className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSettings(true, 'api')}
                  className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
                >
                  设置
                </button>
              </div>
              {isPlanning && (
                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
                  {getPlannerRunningMessage(plannerMode, planningElapsedSeconds, plannerRunStage)}
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              文案策划固定使用 gpt-5.5 / xhigh；风格板和正式生图会自动使用
              {imageProfile ? `「${imageProfile.name} · ${imageProfile.model}」` : ' Images API 生图配置'}
              {imageProfileValidation ? `（${imageProfileValidation}）` : '，无需手动切换模型。'}
            </div>
            {plannerError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">AI 策划失败详情</span>
                  <button
                    type="button"
                    onClick={copyPlannerError}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-400/10"
                  >
                    复制错误
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{plannerError}</pre>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">结构参考图</div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {structureReferenceImageIds.length > 0
                    ? `${structureReferenceImageIds.length}/${API_MAX_IMAGES} 张结构参考图，保存在工作区；后续生图直接发送这些参考图${usesStyleReferenceForActivePlan ? `，并另附 1 张隐藏风格板（实际发送 ${effectiveReferenceCount}/${API_MAX_IMAGES}）` : ''}。只能复用用户提供的视角或对称反转视角。`
                    : usesStyleReferenceForActivePlan
                      ? `请先上传产品结构参考图；正式生成时会另附 1 张隐藏风格板`
                      : '请先上传产品结构参考图，建议包含产品实拍、包装或结构细节'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => !atImageLimit && fileInputRef.current?.click()}
                  disabled={atImageLimit}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${atImageLimit ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.04] dark:text-gray-500' : 'bg-white text-gray-700 shadow-sm hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                >
                  <PlusIcon className="h-4 w-4" />
                  上传参考图
                </button>
                <button
                  type="button"
                  onClick={() => !atImageLimit && cameraInputRef.current?.click()}
                  disabled={atImageLimit}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition sm:hidden ${atImageLimit ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.04] dark:text-gray-500' : 'bg-white text-gray-700 shadow-sm hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                >
                  <PhotoIcon className="h-4 w-4" />
                  拍照
                </button>
                {inputImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearInputImages()
                      updateCurrentPlannerSession(changedReferenceWorkspacePatch([]))
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-400/10"
                  >
                    <TrashIcon className="h-4 w-4" />
                    清空
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 dark:border-blue-400/20 dark:bg-gray-900">
              <div className="text-xs font-semibold text-blue-700 dark:text-blue-200">一次性成功参考图</div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {SIX_VIEW_REFERENCE_GUIDANCE.map((item) => (
                  <div key={item} className="flex gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {(isPreparingReferencePayload || referencePayloadNotice) && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${isPreparingReferencePayload ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                {isPreparingReferencePayload ? '正在压缩参考图...' : referencePayloadNotice}
              </div>
            )}

            {inputImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,72px)]">
                {inputImages.map((image, index) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
                    <img src={image.dataUrl} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextReferenceImageIds = inputImages.filter((_, imageIndex) => imageIndex !== index).map((item) => item.id)
                        removeInputImage(index)
                        updateCurrentPlannerSession(changedReferenceWorkspacePatch(nextReferenceImageIds))
                      }}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-100 transition hover:bg-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`删除参考图 ${index + 1}`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 flex min-h-[88px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-white/[0.12] dark:bg-gray-900 dark:hover:border-blue-400/50 dark:hover:bg-blue-400/10"
              >
                <PhotoIcon className="h-5 w-5 text-gray-400" />
                <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">上传产品参考图</span>
                <span className="mt-1 text-xs text-gray-400">支持多选、拖到底部输入栏或直接在这里选择文件</span>
              </button>
            )}

            {atImageLimit && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                参考图数量已达上限（{API_MAX_IMAGES} 张），请删除不需要的图片后再上传。
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">辅助 6 视图（可选）</div>
                <div className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  仅用于人工放大检查视角问题；后续生图默认使用上方结构参考图，不再把 6 视图作为默认结构参考。
                </div>
              </div>
              <div className={`rounded-lg px-2 py-1 text-xs font-semibold ${confirmedSixViewVersion ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200'}`}>
                {confirmedSixViewVersion ? '已确认' : '未确认'}
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-amber-100 bg-white px-3 py-2 dark:border-amber-400/20 dark:bg-gray-900">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-200">确认前检查</div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {SIX_VIEW_CONFIRMATION_CHECKS.map((item) => (
                  <div key={item} className="flex gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">快捷修正</span>
              {SIX_VIEW_REPAIR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => useSixViewRepairPreset(preset)}
                  className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <textarea
                value={sixViewInstruction}
                onChange={(event) => setSixViewInstruction(event.target.value)}
                className={`${FIELD_CLASS} min-h-[82px] resize-y`}
                placeholder={latestSixViewVersion ? '如产品有变形、角度错误或细节缺失，在这里写修正要求后重新生成版本' : '可选：补充标准 6 视图生成要求'}
              />
              <button
                type="button"
                onClick={() => void generateSixViewVersion()}
                disabled={isGeneratingSixView || !canGenerateStandardSixView}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${isGeneratingSixView || !canGenerateStandardSixView ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
              >
                <PhotoIcon className="h-4 w-4" />
                {isGeneratingSixView ? '生成中...' : latestSixViewVersion ? '提示词编辑 6 视图' : '生成标准 6 视图'}
              </button>
            </div>
            {sixViewError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                {sixViewError}
              </div>
            )}
            {currentWorkspace?.sixViewVersions.length ? (
              <div className="mt-3 grid gap-3">
                {currentWorkspace.sixViewVersions.map((version, index) => {
                  const isConfirmed = confirmedSixViewVersion?.id === version.id
                  const sixViewImageSrc = sixViewImageSrcById[version.imageId]
                  const sixViewCropPreviews = [
                    {
                      label: '第 3 格左侧视放大',
                      objectPosition: SIX_VIEW_CELL_CROP_STYLES.leftSide,
                      transform: SIX_VIEW_CELL_CROP_TRANSFORMS.leftSide,
                    },
                    {
                      label: '第 4 格右侧视放大',
                      objectPosition: SIX_VIEW_CELL_CROP_STYLES.rightSide,
                      transform: SIX_VIEW_CELL_CROP_TRANSFORMS.rightSide,
                    },
                    {
                      label: '第 5 格俯视放大',
                      objectPosition: SIX_VIEW_CELL_CROP_STYLES.top,
                      transform: SIX_VIEW_CELL_CROP_TRANSFORMS.top,
                    },
                    {
                      label: '第 6 格底视放大',
                      objectPosition: SIX_VIEW_CELL_CROP_STYLES.bottom,
                      transform: SIX_VIEW_CELL_CROP_TRANSFORMS.bottom,
                    },
                  ]
                  return (
                    <div key={version.id} className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-gray-900 ${isConfirmed ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-gray-200 dark:border-white/[0.08]'}`}>
                      <button
                        type="button"
                        onClick={() => setLightboxImageId(version.imageId, currentWorkspace.sixViewVersions.map((item) => item.imageId))}
                        className="block aspect-square w-full bg-gray-100 dark:bg-white/[0.04]"
                      >
                        {sixViewImageSrc ? (
                          <img src={sixViewImageSrc} alt={`标准 6 视图版本 ${index + 1}`} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">缩略图加载中...</div>
                        )}
                      </button>
                      <div className="p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">版本 {index + 1}</span>
                          {isConfirmed && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已确认</span>}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {sixViewCropPreviews.map((preview) => (
                            <button
                              key={preview.label}
                              type="button"
                              onClick={() => setLightboxImageId(version.imageId, currentWorkspace.sixViewVersions.map((item) => item.imageId))}
                              className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left dark:border-white/[0.08] dark:bg-white/[0.04]"
                            >
                              <div className="relative overflow-hidden bg-white dark:bg-gray-950" style={{ aspectRatio: '2 / 3' }}>
                                {sixViewImageSrc ? (
                                  <img
                                    src={sixViewImageSrc}
                                    alt={`${preview.label} - 标准 6 视图版本 ${index + 1}`}
                                    className="absolute left-0 top-0 h-[200%] w-[300%] max-w-none object-fill"
                                    style={{ objectPosition: preview.objectPosition, transform: preview.transform }}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">加载中</div>
                                )}
                              </div>
                              <div className="px-1.5 py-1 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{preview.label}</div>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => confirmSixViewVersion(version)}
                          disabled={isConfirmed}
                          className={`mt-2 inline-flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition ${isConfirmed ? 'cursor-default bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                        >
                          {isConfirmed ? '已设为确认版本' : '设为已确认 6 视图'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400">
                可按需根据结构参考图生成辅助 6 视图，用来放大检查侧视、俯视和底视；不影响后续草稿生成。
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className={LABEL_CLASS}>商品标题</span>
              <input
                value={draft.productTitle}
                onChange={(event) => setDraft((current) => updateDraft(current, 'productTitle', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：Stainless Steel Insulated Travel Mug"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>类目</span>
              <input
                value={draft.category}
                onChange={(event) => setDraft((current) => updateDraft(current, 'category', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：Kitchen / Sports / Home"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>品牌 / 型号</span>
              <input
                value={draft.brand}
                onChange={(event) => setDraft((current) => updateDraft(current, 'brand', event.target.value))}
                className={FIELD_CLASS}
                placeholder="只填商品真实品牌或型号"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>颜色</span>
              <input
                value={draft.color}
                onChange={(event) => setDraft((current) => updateDraft(current, 'color', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：matte black"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>材质 / 表面工艺</span>
              <input
                value={draft.material}
                onChange={(event) => setDraft((current) => updateDraft(current, 'material', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：304 stainless steel, silicone lid"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>目标人群</span>
              <input
                value={draft.audience}
                onChange={(event) => setDraft((current) => updateDraft(current, 'audience', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：commuters, office workers"
              />
            </label>
            <label className="md:col-span-2">
              <span className={LABEL_CLASS}>卖点</span>
              <textarea
                value={draft.sellingPoints}
                onChange={(event) => setDraft((current) => updateDraft(current, 'sellingPoints', event.target.value))}
                className={`${FIELD_CLASS} min-h-[86px] resize-y`}
                placeholder="一行一个卖点，或用分号分隔"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>包装清单</span>
              <textarea
                value={draft.packageIncludes}
                onChange={(event) => setDraft((current) => updateDraft(current, 'packageIncludes', event.target.value))}
                className={`${FIELD_CLASS} min-h-[76px] resize-y`}
                placeholder="例：1 mug, 1 lid, 1 straw"
              />
            </label>
            <label>
              <span className={LABEL_CLASS}>场景 / 构图</span>
              <textarea
                value={draft.scene}
                onChange={(event) => setDraft((current) => updateDraft(current, 'scene', event.target.value))}
                className={`${FIELD_CLASS} min-h-[76px] resize-y`}
                placeholder="例：白底产品构图 / 厨房台面场景 / 尺寸标注信息图"
              />
            </label>
            <label className="md:col-span-2">
              <span className={LABEL_CLASS}>禁用元素</span>
              <input
                value={draft.forbidden}
                onChange={(event) => setDraft((current) => updateDraft(current, 'forbidden', event.target.value))}
                className={FIELD_CLASS}
                placeholder="例：do not show phone, laptop, gift box"
              />
            </label>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {hasPlanOptions && (
            <div data-amazon-style-board className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(styleGuideActive, 'muted')}`}>
              {styleGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">视觉风格选择</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    先生成 3 张低清风格参考板，附图、A+ 和 DSP 正式生图时会作为隐藏参考附加到请求末尾。
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-9 rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold dark:border-white/[0.08] dark:bg-gray-900">
                    {STYLE_DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => changeStyleDensityMode(option.value)}
                        className={`rounded-md px-2.5 transition ${styleDensityMode === option.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={generateStyleImages}
                    disabled={isGeneratingStyleImages || styleCandidates.length === 0}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${isGeneratingStyleImages || styleCandidates.length === 0 ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'} ${guideState.target === 'style' ? 'ring-2 ring-blue-500/25 ring-offset-2 ring-offset-blue-50 dark:ring-offset-gray-950' : ''}`}
                  >
                    <PhotoIcon className="h-4 w-4" />
                    {isGeneratingStyleImages ? '生成中...' : '生成风格板'}
                  </button>
                  {styleGenerationStatusText && (
                    <div className="w-full text-right text-[11px] font-medium text-gray-500 dark:text-gray-400 sm:w-auto">
                      {styleGenerationStatusText}
                    </div>
                  )}
                </div>
              </div>
              {styleError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                  {styleError}
                </div>
              )}
              {styleCandidates.length > 0 && (
                <div className={`mt-3 grid gap-2 rounded-xl transition sm:grid-cols-3 ${getGuideFocusClass(guideState.target === 'style-choice')}`}>
                  {styleCandidates.map((candidate, index) => {
                    const imageState = styleImages.find((image) => image.candidateIndex === index)
                    const previewImageId = imageState?.status === 'done' ? imageState.imageId : undefined
                    const isSelected = Boolean(previewImageId && selectedStyleReferenceImageId === previewImageId)
                    const canSelect = Boolean(previewImageId)
                    const canPreview = Boolean(previewImageId && imageState?.dataUrl)
                    return (
                      <div
                        key={`${candidate.label}-${index}`}
                        onMouseEnter={(event) => updateStylePreview(candidate, imageState, event)}
                        onMouseMove={(event) => updateStylePreview(candidate, imageState, event)}
                        onMouseLeave={() => setStylePreview(null)}
                        className={`relative min-w-0 overflow-hidden rounded-xl border text-left transition ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15 dark:border-violet-300/70 dark:bg-violet-500/10' : canSelect ? 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.05]' : 'border-gray-200 bg-white opacity-70 dark:border-white/[0.08] dark:bg-gray-900'}`}
                      >
                        {canPreview && previewImageId && (
                          <button
                            type="button"
                            onClick={() => openStylePreview(previewImageId)}
                            title="预览风格板大图"
                            aria-label={`预览 ${candidate.label} 风格板大图`}
                            className="absolute right-2 top-2 z-10 inline-flex h-8 items-center gap-1 rounded-lg bg-white/95 px-2 text-[11px] font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 transition hover:bg-white dark:bg-gray-950/90 dark:text-gray-100 dark:ring-white/10 dark:hover:bg-gray-900"
                          >
                            <EyeIcon className="h-3.5 w-3.5" />
                            预览
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => canSelect && selectStyleCandidate(index)}
                          disabled={!canSelect}
                          className="block h-full w-full text-left disabled:cursor-not-allowed"
                        >
                          <div className="aspect-square bg-gray-100 dark:bg-white/[0.04]">
                            {imageState?.status === 'done' && imageState.dataUrl ? (
                              <img src={imageState.dataUrl} alt={candidate.label} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-gray-400">
                                {imageState?.status === 'running' ? '生成中...' : imageState?.status === 'error' ? '生成失败' : imageState?.status === 'done' ? '缩略图加载中...' : '待生成'}
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{candidate.label}</span>
                              {isSelected && (
                                <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已选</span>
                              )}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{candidate.description}</div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <StyleReferenceLibrary
                items={styleReferenceLibraryItems}
                selectedImageId={selectedStyleReferenceImageId}
                imageSrcById={styleReferenceImageSrcById}
                onUseStyle={selectStyleReferenceFromLibrary}
                onPreview={openStylePreview}
                onRestoreSession={(plannerSessionId) => {
                  const session = plannerSessions.find((item) => item.id === plannerSessionId)
                  if (session) {
                    void restorePlannerSession(session).catch((err) => {
                      showToast(`工作区打开失败：${err instanceof Error ? err.message : String(err)}`, 'error')
                    })
                  }
                }}
              />
              {stylePreview && (
                <div
                  className="pointer-events-none fixed z-50 hidden w-[420px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:block dark:border-white/[0.08] dark:bg-gray-950"
                  style={{ left: stylePreview.left, top: stylePreview.top }}
                >
                  <img src={stylePreview.dataUrl} alt="" className="aspect-square w-full bg-gray-100 object-contain dark:bg-white/[0.04]" />
                  <div className="border-t border-gray-100 p-3 dark:border-white/[0.08]">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{stylePreview.label}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{stylePreview.description}</div>
                  </div>
                </div>
              )}
              {selectedStyleReferenceImageId && selectedStyleReferenceLabel && (
                <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-800 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-200">
                  {isMainListingPlan
                    ? `已选择「${selectedStyleReferenceLabel}」，但当前 MAIN 主图不会附加这张风格板；切换到附图、A+ 或 DSP 时才会作为隐藏参考。`
                    : `已选择「${selectedStyleReferenceLabel}」。正式生成时会隐藏附加这张风格参考板作为最后一张参考图，用于统一字体感觉、色板、光影、材质和标注样式，不复制其中占位文字、固定版式或产品摆放。`}
                </div>
              )}
              {styleReferenceLimitExceeded && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  实际发送参考图共 {effectiveReferenceCount} 张，超过上限 {API_MAX_IMAGES} 张，请调整原始参考图或风格板后再提交。
                </div>
              )}
            </div>
          )}
          {showStickyActions && (
            <>
              <div data-amazon-action-bar className={`sticky top-20 z-30 mb-4 rounded-xl border p-3 shadow-lg shadow-gray-900/5 backdrop-blur transition dark:shadow-black/20 ${getGuidePanelClass(actionBarGuideActive)}`}>
                <div className="flex flex-col gap-3">
                  {actionBarGuideActive && (
                    <div className={GUIDE_HINT_CLASS}>
                      {guideState.message}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          {actionSlot ?? (plannerMode === 'aplus' ? 'A+' : plannerMode === 'dsp' ? 'DSP' : '当前')}
                        </span>
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {actionLabel ?? (plannerMode === 'aplus' ? '请选择 A+ 模块' : plannerMode === 'dsp' ? '请选择 DSP 素材' : '当前图片方案')}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                          {actionPositionLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {targetSize} / {generationParamLabel}
                        {plannerMode === 'aplus' && selectedAPlusPlan ? ` · 上传建议 ${selectedAPlusPlan.uploadSize}` : ''}
                        {plannerMode === 'dsp' && selectedDspPlan ? ` · 上传 ${selectedDspPlan.uploadSize} · ${selectedDspPlan.fileLimit} · ${getDspCtaPolicyLabel(selectedDspPlan.ctaPolicy)}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stepVisiblePlan(-1)}
                        disabled={!canGoPrev}
                        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${canGoPrev ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" />
                        上一张
                      </button>
                      <button
                        type="button"
                        onClick={() => stepVisiblePlan(1)}
                        disabled={!canGoNext}
                        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${currentActionSubmitted && canGoNext ? 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-500' : canGoNext ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                      >
                        下一张
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${currentActionSubmitted ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : currentActionFilled ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200' : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200'}`}>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">当前下一步</div>
                    <div>{gatedActionGuidance}</div>
                    {mainStyleGuidance && (
                      <span className="mt-1 block text-[11px] font-normal opacity-80">{mainStyleGuidance}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {actionProgressSteps.map((step) => (
                      <div key={step.label} className={`rounded-lg border px-2 py-1.5 ${getActionStepClass(step.status)}`}>
                        <div className="truncate text-[10px] font-bold">{step.label}</div>
                        <div className="mt-0.5 truncate text-[10px] opacity-80">{step.detail}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${batchStyleReferenceLimitExceeded ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300'}`}>
                      {batchSubmitStatusText}
                      {hasActivePlannerBatchSummary && (
                        <span className="mt-1 block font-medium">
                          生成进度：运行中 {activePlannerBatchSummary.running} / 已完成 {activePlannerBatchSummary.done} / 失败 {activePlannerBatchSummary.error}
                        </span>
                      )}
                      {batchStyleReferenceLimitExceeded && (
                        <span className="mt-1 block">实际发送参考图共 {batchEffectiveReferenceCount} 张，超过上限 {API_MAX_IMAGES} 张。</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void submitAllPlannedImages()}
                      disabled={batchSubmitDisabled}
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${batchSubmitDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-blue-600 text-white shadow-sm hover:bg-blue-500'}`}
                    >
                      <PhotoIcon className="h-4 w-4" />
                      {isBatchSubmitting ? '提交草稿中...' : '提交未提交草稿'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={copyPrompt}
                      disabled={actionDisabled}
                      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition ${actionDisabled ? 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPrompt()}
                      disabled={actionDisabled}
                      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${actionDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : currentActionFilled ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'}`}
                    >
                      {currentActionFilled ? (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <PhotoIcon className="h-3.5 w-3.5" />
                      )}
                      {currentActionFilled ? '已填入' : '填入'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrimarySubmitAction}
                      disabled={submitDisabled || currentActionSubmitted}
                      className={`inline-flex h-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${currentActionSubmitted ? 'cursor-default bg-emerald-600 text-white' : submitDisabled ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                    >
                      {submitButtonLabel}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {plannerMode === 'listing' && imagePlans.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(planListGuideActive)}`}>
              {planListGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">图片方案</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择图片位后，Prompt Preview 和生成按钮会切换到对应提示词。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {imagePlans.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {imagePlans.map((plan, index) => {
                  const isSelected = selectedPlanIndex === index
                  const planActionProgress = actionProgress[getPlannerActionKey('listing', index, plan.slot)]
                  const planSubmitStatus = getPlanSubmitStatus({
                    actionProgress: planActionProgress,
                    requiresStyleReference: !isAmazonListingMainSlot(plan.slot),
                    hasStyleReference,
                  })
                  return (
                    <button
                      key={`${plan.slot}-${index}`}
                      type="button"
                      onClick={() => selectPlan(index)}
                      className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:hover:bg-white/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'}`}>
                          {plan.slot}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{plan.label}</span>
                        {isSelected && (
                          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${planSubmitStatus.className}`}>
                          {planSubmitStatus.label}
                        </span>
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{getPlanSummary(plan.planMarkdown)}</div>
                      <div className="mt-2 line-clamp-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.05] dark:text-gray-300">
                        Negative：{plan.negativePrompt || '未提供'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {plannerMode === 'aplus' && aPlusPlansWithSizes.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(planListGuideActive)}`}>
              {planListGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">A+ 模块编排</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择模块后，Prompt Preview 和生成按钮会切换到对应 A+ 提示词与尺寸。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {aPlusPlansWithSizes.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {aPlusPlansWithSizes.map((plan, index) => {
                  const isSelected = selectedAPlusPlanIndex === index
                  const externalText = formatAPlusModuleText(plan)
                  const planActionProgress = actionProgress[getPlannerActionKey('aplus', index, plan.slot)]
                  const planSubmitStatus = getPlanSubmitStatus({
                    actionProgress: planActionProgress,
                    requiresStyleReference: true,
                    hasStyleReference,
                  })
                  return (
                    <button
                      key={`${plan.slot}-${index}`}
                      type="button"
                      onClick={() => selectAPlusPlan(index)}
                      className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:hover:bg-white/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'}`}>
                          {plan.slot}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getAPlusModuleDisplayName(plan)}</span>
                        <span className="text-xs text-gray-400">{getAPlusModuleEnglishName(plan)}</span>
                        {isSelected && (
                          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${planSubmitStatus.className}`}>
                          {planSubmitStatus.label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">上传 {plan.uploadSize}</span>
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">生成 {plan.generationSize}</span>
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{getPlanSummary(plan.planMarkdown)}</div>
                      {(isAPlusTextModule(plan) || externalText) && externalText && (
                        <div className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-xs leading-relaxed text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">
                          {plan.textTitle && <div className="font-semibold">{plan.textTitle}</div>}
                          {plan.textBody && <div className="mt-0.5 line-clamp-2 text-gray-500 dark:text-gray-300">{plan.textBody}</div>}
                        </div>
                      )}
                      <div className="mt-2 line-clamp-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.05] dark:text-gray-300">
                        Negative：{plan.negativePrompt || '未提供'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {plannerMode === 'dsp' && dspPlansWithSizes.length > 0 && (
            <div className={`mb-4 rounded-xl border p-3 transition ${getGuidePanelClass(planListGuideActive)}`}>
              {planListGuideActive && (
                <div className={GUIDE_HINT_CLASS}>
                  {guideState.message}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">DSP 素材方案</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    选择素材后，Prompt Preview 和生成按钮会切换到对应 DSP 尺寸、CTA 规则和文件限制。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {dspPlansWithSizes.length} 个素材
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {dspPlansWithSizes.map((plan, index) => {
                  const isSelected = selectedDspPlanIndex === index
                  const planActionProgress = actionProgress[getPlannerActionKey('dsp', index, plan.slot)]
                  const planSubmitStatus = getPlanSubmitStatus({
                    actionProgress: planActionProgress,
                    requiresStyleReference: true,
                    hasStyleReference,
                  })
                  return (
                    <button
                      key={`${plan.slot}-${index}`}
                      type="button"
                      onClick={() => selectDspPlan(index)}
                      className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/15 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950 dark:hover:bg-white/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300'}`}>
                          {plan.slot}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getDspAssetDisplayName(plan)}</span>
                        <span className="text-xs text-gray-400">{getDspCtaPolicyLabel(plan.ctaPolicy)}</span>
                        {isSelected && (
                          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">当前</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${planSubmitStatus.className}`}>
                          {planSubmitStatus.label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">上传 {plan.uploadSize}</span>
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">生成 {plan.generationSize}</span>
                        <span className="rounded-md bg-white/70 px-2 py-0.5 dark:bg-white/[0.05]">{plan.fileLimit}</span>
                      </div>
                      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{getPlanSummary(plan.planMarkdown)}</div>
                      <div className="mt-2 line-clamp-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.05] dark:text-gray-300">
                        Negative：{plan.negativePrompt || '未提供'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {plannerMode === 'dsp' && dspPlansWithSizes.length === 0 && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">DSP 固定规格</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    点击 AI策划DSP 后生成逐素材方案；REC Logo 和 Slogan 作为策划约束展示，不直接批量生图。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {dspSpecs.length} 个图片素材
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {DSP_ASSET_SPECS.map((spec) => (
                  <div key={spec.slot} className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-gray-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                        {spec.slot}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{spec.displayLabel}</span>
                      <span className="text-xs text-gray-400">{getDspCtaPolicyLabel(spec.ctaPolicy)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {spec.assetType === 'image'
                        ? `上传 ${getDspAssetUploadSize(spec)} · 生成 ${getDspAssetGenerationSize(spec, resolutionTier)} · ${spec.fileLimit}`
                        : `${getDspAssetUploadSize(spec)} · ${spec.fileLimit} · ${spec.formats?.join(' / ') ?? '文本'}`}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{spec.objective}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plannerMode === 'aplus' && aPlusPlansWithSizes.length === 0 && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">A+ 模块编排</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    当前选择 {getAPlusContentTypeLabel(aPlusType)}，点击 AI策划A+ 后生成逐模块方案。
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  {aPlusSpecs.length} 张
                </span>
              </div>
              <div className={PLAN_LIST_CLASS}>
                {aPlusSpecs.map((spec) => (
                  <div key={spec.slot} className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-gray-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                        {spec.slot}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{getAPlusModuleDisplayName(spec)}</span>
                      <span className="text-xs text-gray-400">{getAPlusModuleEnglishName(spec)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      上传 {getAPlusModuleUploadSize(spec)} · 生成 {getAPlusModuleGenerationSize(spec, resolutionTier)}
                      {isAPlusTextModule(spec) ? ' · 含标题/正文' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {checks.map((check) => (
              <div
                key={check.label}
                className={`rounded-xl border px-3 py-2 ${check.status === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200' : check.status === 'missing' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'}`}
              >
                <div className="text-xs font-semibold">{check.label}</div>
                <div className="mt-0.5 text-[11px] opacity-80">{check.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Prompt Preview{plannerMode === 'aplus' && selectedAPlusPlan ? ` · ${selectedAPlusPlan.slot}` : plannerMode === 'dsp' && selectedDspPlan ? ` · ${selectedDspPlan.slot}` : selectedPlan ? ` · ${selectedPlan.slot}` : ''}
              </span>
              <span className="text-xs text-gray-400">{targetSize} / {generationParamLabel}</span>
            </div>
            <textarea
              value={(plannerMode === 'aplus' && !selectedAPlusPlan) || (plannerMode === 'dsp' && !selectedDspPlan)
                ? getPromptPreviewFallback(plannerMode)
                : activePlanPreview || getPromptPreviewFallback(plannerMode)}
              className="h-[430px] w-full resize-none rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
              spellCheck={false}
              readOnly
            />
          </div>
          {plannerMode === 'aplus' && selectedAPlusPlan && (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  A+ 文案 · {selectedAPlusPlan.slot}
                </span>
                <button
                  type="button"
                  onClick={copyAPlusText}
                  disabled={!selectedAPlusText.trim()}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition ${selectedAPlusText.trim() ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]' : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-600'}`}
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  复制文案
                </button>
              </div>
              <textarea
                value={selectedAPlusText || (isAPlusTextModule(selectedAPlusPlan) ? '该模块暂未生成标题/正文文案。' : '当前模块通常不需要外部标题/正文文案。')}
                className="h-28 w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
                spellCheck={false}
                readOnly
              />
              <div className="mt-2 text-[11px] text-gray-400">
                外部 A+ 文案用于亚马逊模块文本区，不会写入图片生成 Prompt。
              </div>
            </div>
          )}
          {activePrompt.trim() && prompt.trim() && prompt !== activePrompt && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              底部输入框已有内容，点击“填入”会用当前亚马逊提示词覆盖。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
