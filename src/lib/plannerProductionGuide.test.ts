import { describe, expect, it } from 'vitest'
import {
  deriveProductionGuideState,
  getProductionEstimate,
  summarizePlannerBatchTasks,
} from './plannerProductionGuide'
import type { TaskRecord } from '../types'

function task(status: TaskRecord['status'], batchId = 'batch-1'): TaskRecord {
  return {
    id: `${status}-${batchId}`,
    prompt: 'prompt',
    params: { size: '1024x1024', quality: 'auto', output_format: 'png', output_compression: 100, n: 1 },
    apiProvider: 'openai',
    apiMode: 'images',
    inputImageIds: [],
    outputImages: status === 'done' ? ['img-1'] : [],
    status,
    error: status === 'error' ? 'failed' : null,
    createdAt: 1,
    finishedAt: status === 'running' ? null : 2,
    elapsed: status === 'running' ? null : 1000,
    category: { workflow: 'amazon-listing', plannerBatchId: batchId } as TaskRecord['category'] & { plannerBatchId: string },
  }
}

describe('planner production guide', () => {
  it('derives the next stage from planner state', () => {
    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: false,
      hasListingText: false,
      hasPlanOptions: false,
      needsStyleReference: false,
      hasStyleReference: false,
      hasSelectedPlan: false,
      hasRelatedTasks: false,
    }).currentStageId).toBe('configure-api')

    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: true,
      hasListingText: true,
      hasPlanOptions: true,
      needsStyleReference: true,
      hasStyleReference: false,
      hasSelectedPlan: true,
      hasRelatedTasks: false,
    }).currentStageId).toBe('style')

    expect(deriveProductionGuideState({
      hasUsablePlannerProfile: true,
      hasListingText: true,
      hasPlanOptions: true,
      needsStyleReference: true,
      hasStyleReference: true,
      hasSelectedPlan: true,
      hasRelatedTasks: true,
    }).currentStageId).toBe('review-reuse')
  })

  it('returns realistic ETA text by mode and phase', () => {
    expect(getProductionEstimate({ phase: 'planning', mode: 'listing', resolution: '2k', elapsedSeconds: 65 }).expectedRange).toBe('通常 1-3 分钟')
    expect(getProductionEstimate({ phase: 'planning', mode: 'dsp', resolution: '2k', elapsedSeconds: 181 }).statusTone).toBe('long')
    expect(getProductionEstimate({ phase: 'generation', mode: 'aplus', resolution: '4k', elapsedSeconds: 120 }).expectedRange).toBe('通常 2-5 分钟')
  })

  it('summarizes batch generation tasks by plannerBatchId', () => {
    const summary = summarizePlannerBatchTasks([
      task('running'),
      task('done'),
      task('error'),
      task('done', 'other-batch'),
    ], 'batch-1')

    expect(summary).toEqual({ total: 3, running: 1, done: 1, error: 1 })
  })
})
