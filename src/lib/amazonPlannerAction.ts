type PlannerMode = 'listing' | 'aplus' | 'dsp'

export function getPlannerActionGuidance(options: {
  plannerMode: PlannerMode
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
  if (options.currentActionSubmitted) return `已提交 ${slot} ${options.actionKindLabel}，${options.canGoNext ? '点击下一张继续' : '已是最后一张'}`
  if (options.styleReferenceRequired && !options.hasStyleReference) return `请先生成并选择一张风格板，${slot} ${options.actionKindLabel}才能提交生成`
  if (options.styleReferenceLimitExceeded) return `当前参考图加隐藏风格板共 ${options.effectiveReferenceCount} 张，超过上限 ${options.apiMaxImages} 张，请删除一张产品参考图后再提交。`
  if (options.currentActionFilled) return '已填入右侧输入框，下一步提交生成'
  return `可提交当前 ${slot} ${options.actionKindLabel}，也可先填入提示词检查`
}

export function getBatchSubmitStatusText(options: {
  isBatchSubmitting: boolean
  batchSubmittedCount: number
  visiblePlanCount: number
  visibleUnsubmittedPlanCount?: number
  submittedVisiblePlanCount: number
  seriesStyleReferenceNeeded: boolean
  hasStyleReference: boolean
}) {
  const unsubmittedCount = options.visibleUnsubmittedPlanCount ?? Math.max(0, options.visiblePlanCount - options.submittedVisiblePlanCount)
  if (options.isBatchSubmitting) return `批量提交中：${options.batchSubmittedCount}/${unsubmittedCount}`
  if (options.seriesStyleReferenceNeeded && !options.hasStyleReference) {
    return options.submittedVisiblePlanCount > 0
      ? `已提交 ${options.submittedVisiblePlanCount}/${options.visiblePlanCount}；先选择风格板后可继续提交未提交项`
      : '先选择风格板后可提交未提交项'
  }
  if (unsubmittedCount === 0 && options.visiblePlanCount > 0) return `已全部提交 ${options.visiblePlanCount}/${options.visiblePlanCount}`
  if (options.submittedVisiblePlanCount > 0) return `已提交 ${options.submittedVisiblePlanCount}/${options.visiblePlanCount}`
  return `准备提交 ${unsubmittedCount} 张未提交项`
}

export function getSubmitButtonLabel(options: {
  currentActionSubmitted: boolean
  styleReferenceRequired: boolean
  hasStyleReference: boolean
  styleReferenceLimitExceeded: boolean
}) {
  if (options.currentActionSubmitted) return '已提交'
  if (options.styleReferenceLimitExceeded) return '参考图超限'
  if (options.styleReferenceRequired && !options.hasStyleReference) return '先选风格'
  return '提交生成'
}
