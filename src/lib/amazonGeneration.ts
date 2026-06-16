import type { TaskRecord, TaskWorkflow } from '../types'

export type AmazonGenerationStage = 'draft' | 'final'
export type ReferencePayloadStage = AmazonGenerationStage

export const AMAZON_DRAFT_QUALITY = 'low' as const
export const AMAZON_FINAL_QUALITY = 'high' as const
export const AMAZON_FINAL_PROMPT = [
  'Create a high-quality final version of the attached draft image.',
  'Use the attached draft image as the single visual source. Preserve its product geometry, camera angle, composition, crop, layout, colors, typography, text content, logos, marks, props, lighting direction, and background exactly.',
  'Only improve rendering quality: higher detail, cleaner edges, sharper product materials, better text legibility, natural lighting, reduced artifacts, and polished commercial finish.',
  'Do not introduce style boards, reference panels, moodboards, color swatches, layout guides, extra products, extra logos, extra text, UI modules, comparison charts, callout blocks, or new decorative elements.',
  'Do not redesign, rotate, stretch, simplify, repaint, or change the product. Do not change the visible product structure, handle, lid, control panel, seams, vents, feet, brand marks, or aspect ratio.',
].join('\n')

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
  const {
    plannerBatchId: _plannerBatchId,
    styleReferenceImageId: _styleReferenceImageId,
    styleReferenceLabel: _styleReferenceLabel,
    ...finalCategory
  } = category
  return {
    ...finalCategory,
    generationStage: 'final',
    draftSourceImageId,
  }
}
