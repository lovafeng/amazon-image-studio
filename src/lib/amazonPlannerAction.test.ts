import { describe, expect, it } from 'vitest'
import {
  getBatchSubmitStatusText,
  getPlannerActionGuidance,
  getSubmitButtonLabel,
} from './amazonPlannerAction'

describe('Amazon planner action guidance', () => {
  it('prioritizes missing style reference over filled prompt guidance for non-main images', () => {
    expect(getPlannerActionGuidance({
      plannerMode: 'listing',
      hasSelectedPlan: true,
      currentActionSubmitted: false,
      currentActionFilled: true,
      canGoNext: true,
      actionSlot: 'PT01',
      actionKindLabel: '图片',
      styleReferenceRequired: true,
      hasStyleReference: false,
      styleReferenceLimitExceeded: false,
      effectiveReferenceCount: 1,
      apiMaxImages: 16,
    })).toBe('请先生成并选择一张风格板，PT01 图片才能提交生成')
  })

  it('keeps the missing style reference reason visible after some images were submitted', () => {
    expect(getBatchSubmitStatusText({
      isBatchSubmitting: false,
      batchSubmittedCount: 0,
      visiblePlanCount: 7,
      visibleUnsubmittedPlanCount: 6,
      submittedVisiblePlanCount: 1,
      seriesStyleReferenceNeeded: true,
      hasStyleReference: false,
    })).toBe('已提交 1/7；先选择风格板后可继续提交未提交项')
  })

  it('uses a disabled submit label that points to the missing style step', () => {
    expect(getSubmitButtonLabel({
      currentActionSubmitted: false,
      styleReferenceRequired: true,
      hasStyleReference: false,
      styleReferenceLimitExceeded: false,
    })).toBe('先选风格')
  })
})
