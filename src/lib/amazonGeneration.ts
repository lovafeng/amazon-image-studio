import type { TaskRecord, TaskWorkflow } from '../types'

export type AmazonGenerationStage = 'draft' | 'final'
export type ReferencePayloadStage = AmazonGenerationStage

export const AMAZON_DRAFT_QUALITY = 'low' as const
export const AMAZON_FINAL_QUALITY = 'high' as const

type TaskCategory = NonNullable<TaskRecord['category']>

function isAmazonWorkflow(workflow: TaskWorkflow | undefined): workflow is 'amazon-listing' | 'amazon-aplus' | 'amazon-dsp' {
  return workflow === 'amazon-listing' || workflow === 'amazon-aplus' || workflow === 'amazon-dsp'
}

export function getAmazonGenerationStage(task: Pick<TaskRecord, 'category'>): AmazonGenerationStage {
  if (!isAmazonWorkflow(task.category?.workflow)) return 'final'
  return task.category?.generationStage === 'draft' ? 'draft' : 'final'
}

export function getReferencePayloadStageForTask(task: Pick<TaskRecord, 'category'>): ReferencePayloadStage {
  return getAmazonGenerationStage(task)
}

export function isAmazonDraftTask(task: Pick<TaskRecord, 'status' | 'category' | 'outputImages'>): boolean {
  return task.status === 'done' &&
    isAmazonWorkflow(task.category?.workflow) &&
    task.category?.generationStage === 'draft' &&
    Boolean(task.outputImages?.length)
}

export function createAmazonFinalCategory(category: TaskCategory, draftSourceImageId: string): TaskCategory {
  const { plannerBatchId: _plannerBatchId, ...finalCategory } = category
  return {
    ...finalCategory,
    generationStage: 'final',
    draftSourceImageId,
  }
}
