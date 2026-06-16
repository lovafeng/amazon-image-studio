import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import {
  AMAZON_DRAFT_QUALITY,
  AMAZON_FINAL_QUALITY,
  AMAZON_FINAL_PROMPT,
  createAmazonFinalCategory,
  getAmazonGenerationStage,
  getReferencePayloadStageForTask,
  isAmazonDraftTask,
} from './amazonGeneration'

const task = (patch: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 'task-a',
  prompt: 'prompt',
  params: { size: '1024x1024', quality: 'medium', output_format: 'jpeg', output_compression: 70, moderation: 'auto', n: 1 },
  inputImageIds: [],
  outputImages: [],
  status: 'done',
  error: null,
  createdAt: 1,
  finishedAt: 2,
  elapsed: 1,
  ...patch,
})

describe('amazonGeneration', () => {
  it('recognizes Amazon draft tasks and resolves reference compression stage', () => {
    const draftTask = task({
      outputImages: ['image-a'],
      category: {
        workflow: 'amazon-listing',
        amazonSlot: 'PT01',
        generationStage: 'draft',
      },
    })

    expect(AMAZON_DRAFT_QUALITY).toBe('low')
    expect(AMAZON_FINAL_QUALITY).toBe('high')
    expect(AMAZON_FINAL_PROMPT).toContain('single visual source')
    expect(AMAZON_FINAL_PROMPT).toContain('Do not introduce style boards')
    expect(getAmazonGenerationStage(draftTask)).toBe('draft')
    expect(getReferencePayloadStageForTask(draftTask)).toBe('draft')
    expect(isAmazonDraftTask(draftTask)).toBe(true)
  })

  it('treats old Amazon and non-Amazon tasks as final/reference-default', () => {
    expect(getAmazonGenerationStage(task({ category: { workflow: 'amazon-aplus' } }))).toBe('final')
    expect(getReferencePayloadStageForTask(task({ category: { workflow: 'gallery' } }))).toBe('final')
    expect(isAmazonDraftTask(task({ category: { workflow: 'gallery', generationStage: 'draft' } }))).toBe(false)
  })

  it('builds final category from a draft category and source image', () => {
    expect(createAmazonFinalCategory({
      workflow: 'amazon-dsp',
      productTitle: 'Probe',
      amazonSlot: 'DSP-CUSTOM-300x250',
      plannerSessionId: 'planner-a',
      plannerBatchId: 'batch-a',
      styleReferenceImageId: 'style-a',
      styleReferenceLabel: 'Clean',
      generationStage: 'draft',
    }, 'draft-image-a')).toEqual({
      workflow: 'amazon-dsp',
      productTitle: 'Probe',
      amazonSlot: 'DSP-CUSTOM-300x250',
      plannerSessionId: 'planner-a',
      generationStage: 'final',
      draftSourceImageId: 'draft-image-a',
    })
  })
})
