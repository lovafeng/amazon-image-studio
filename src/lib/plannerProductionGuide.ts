import type { TaskRecord } from '../types'
import type { AmazonPlannerMode } from './listingPlanner'

export type ProductionStageId =
  | 'configure-api'
  | 'prepare-input'
  | 'plan'
  | 'style'
  | 'select-plan'
  | 'submit'
  | 'review-reuse'

export type ProductionEstimatePhase = 'planning' | 'style' | 'generation' | 'batch'
export type ProductionEstimateTone = 'normal' | 'slow' | 'long'

export interface ProductionGuideInput {
  hasUsablePlannerProfile: boolean
  hasListingText: boolean
  hasPlanOptions: boolean
  needsStyleReference: boolean
  hasStyleReference: boolean
  hasSelectedPlan: boolean
  hasRelatedTasks: boolean
}

export interface ProductionGuideState {
  currentStageId: ProductionStageId
  completedStageIds: ProductionStageId[]
}

export interface ProductionEstimateInput {
  phase: ProductionEstimatePhase
  mode: AmazonPlannerMode
  resolution: '1k' | '2k' | '4k'
  elapsedSeconds?: number
}

export interface ProductionEstimate {
  label: string
  expectedRange: string
  elapsedLabel?: string
  statusTone: ProductionEstimateTone
  note: string
}

export interface PlannerBatchSummary {
  total: number
  running: number
  done: number
  error: number
}

export const PRODUCTION_STAGES: Array<{ id: ProductionStageId; label: string }> = [
  { id: 'configure-api', label: '配置 API' },
  { id: 'prepare-input', label: '准备资料' },
  { id: 'plan', label: 'AI 策划' },
  { id: 'style', label: '选择风格' },
  { id: 'select-plan', label: '选择图片位' },
  { id: 'submit', label: '提交生成' },
  { id: 'review-reuse', label: '历史复用' },
]

export function formatProductionElapsed(elapsedSeconds: number) {
  const secondsValue = Math.max(0, Math.floor(elapsedSeconds))
  const minutes = Math.floor(secondsValue / 60).toString().padStart(2, '0')
  const seconds = (secondsValue % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function deriveProductionGuideState(input: ProductionGuideInput): ProductionGuideState {
  const currentStageId = getCurrentStageId(input)
  const currentIndex = PRODUCTION_STAGES.findIndex((stage) => stage.id === currentStageId)
  return {
    currentStageId,
    completedStageIds: PRODUCTION_STAGES
      .slice(0, Math.max(0, currentIndex))
      .map((stage) => stage.id),
  }
}

function getCurrentStageId(input: ProductionGuideInput): ProductionStageId {
  if (!input.hasUsablePlannerProfile) return 'configure-api'
  if (!input.hasListingText) return 'prepare-input'
  if (!input.hasPlanOptions) return 'plan'
  if (input.needsStyleReference && !input.hasStyleReference) return 'style'
  if (!input.hasSelectedPlan) return 'select-plan'
  if (input.hasRelatedTasks) return 'review-reuse'
  return 'submit'
}

export function getProductionEstimate(input: ProductionEstimateInput): ProductionEstimate {
  const elapsedLabel = input.elapsedSeconds == null ? undefined : `已用 ${formatProductionElapsed(input.elapsedSeconds)}`
  const statusTone = getEstimateTone(input.elapsedSeconds)
  if (input.phase === 'planning') {
    const isDsp = input.mode === 'dsp'
    return {
      label: isDsp ? 'DSP 策划' : 'AI 策划',
      expectedRange: isDsp ? '通常 3-6 分钟' : '通常 1-3 分钟',
      elapsedLabel,
      statusTone,
      note: isDsp ? 'DSP 会一次规划 11 个图片素材。' : '模型会生成中文方案、英文 Prompt 和风格候选。',
    }
  }
  if (input.phase === 'style') {
    return {
      label: '风格板',
      expectedRange: '通常 1-3 分钟',
      elapsedLabel,
      statusTone,
      note: '生成 3 张低清风格板，完成后选择一张作为隐藏参考。',
    }
  }
  if (input.phase === 'batch') {
    return {
      label: '批量提交',
      expectedRange: '按任务数逐个入队',
      elapsedLabel,
      statusTone,
      note: '入队进度和生成完成进度会分开展示。',
    }
  }
  return {
    label: '正式生图',
    expectedRange: input.resolution === '4k' ? '通常 2-5 分钟' : input.resolution === '2k' ? '通常 1-3 分钟' : '通常 1-2 分钟',
    elapsedLabel,
    statusTone,
    note: '任务提交后可在历史记录中查看计时、预览和最终输出。',
  }
}

function getEstimateTone(elapsedSeconds: number | undefined): ProductionEstimateTone {
  if (elapsedSeconds == null) return 'normal'
  if (elapsedSeconds >= 180) return 'long'
  if (elapsedSeconds >= 90) return 'slow'
  return 'normal'
}

export function summarizePlannerBatchTasks(tasks: TaskRecord[], plannerBatchId: string | null | undefined): PlannerBatchSummary {
  const summary: PlannerBatchSummary = { total: 0, running: 0, done: 0, error: 0 }
  if (!plannerBatchId) return summary
  for (const task of tasks) {
    const category = task.category as (TaskRecord['category'] & { plannerBatchId?: string }) | undefined
    if (category?.plannerBatchId !== plannerBatchId) continue
    summary.total += 1
    if (task.status === 'running') summary.running += 1
    if (task.status === 'done') summary.done += 1
    if (task.status === 'error') summary.error += 1
  }
  return summary
}
