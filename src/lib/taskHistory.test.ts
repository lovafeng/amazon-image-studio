import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import {
  UNCATEGORIZED_PRODUCT_FILTER,
  getTaskGenerationStageLabel,
  getTaskHistoryCategory,
  getTaskImageCategoryLabel,
  getTaskProductFilterOptions,
  getWorkflowLabel,
  matchesTaskHistoryFilters,
} from './taskHistory'

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'Create a professional Amazon product listing image.\n\nProduct facts:\n- Product title: Large Folding Umbrella\n',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

describe('task history categories', () => {
  it('uses explicit Amazon Listing metadata when present', () => {
    const category = getTaskHistoryCategory(task({
      category: {
        productTitle: 'Large Folding Umbrella',
        workflow: 'amazon-listing',
        amazonSlot: 'MAIN',
      },
    }))

    expect(category).toMatchObject({
      productTitle: 'Large Folding Umbrella',
      workflow: 'amazon-listing',
      amazonSlot: 'MAIN',
      aspect: 'square',
    })
  })

  it('uses explicit A+ metadata and detects landscape size', () => {
    const category = getTaskHistoryCategory(task({
      prompt: 'Create A+ module for the product.\n\nA+ module requirements:\n- Final Seller Central recommended upload size: 970x300px.',
      params: { ...DEFAULT_PARAMS, size: '3536x1184' },
      category: {
        productTitle: 'LED Desk Lamp',
        workflow: 'amazon-aplus',
        amazonSlot: 'A+S01',
        aPlusType: 'standard',
      },
    }))

    expect(category).toMatchObject({
      productTitle: 'LED Desk Lamp',
      workflow: 'amazon-aplus',
      amazonSlot: 'A+S01',
      aPlusType: 'standard',
      aspect: 'landscape',
    })
  })

  it('uses explicit DSP metadata and workflow label', () => {
    const category = getTaskHistoryCategory(task({
      prompt: 'Create Amazon DSP advertising creative.',
      params: { ...DEFAULT_PARAMS, size: '2448x2040' },
      category: {
        productTitle: 'LED Desk Lamp',
        workflow: 'amazon-dsp',
        amazonSlot: 'DSP-CUSTOM-300x250',
      },
    }))

    expect(category).toMatchObject({
      productTitle: 'LED Desk Lamp',
      workflow: 'amazon-dsp',
      amazonSlot: 'DSP-CUSTOM-300x250',
      aspect: 'landscape',
    })
    expect(getWorkflowLabel('amazon-dsp')).toBe('DSP 图')
  })

  it('labels Amazon draft and final generation stages', () => {
    expect(getTaskGenerationStageLabel({ category: { workflow: 'amazon-listing', generationStage: 'draft' } } as any)).toBe('草稿')
    expect(getTaskGenerationStageLabel({ category: { workflow: 'amazon-listing', generationStage: 'final' } } as any)).toBe('高清')
    expect(getTaskGenerationStageLabel({ category: { workflow: 'gallery' } } as any)).toBe('')
  })

  it('matches history search by draft and final stage labels', () => {
    const draftTask = task({
      category: { workflow: 'amazon-listing', generationStage: 'draft' },
    })

    expect(matchesTaskHistoryFilters(draftTask, {
      searchQuery: '草稿',
      filterStatus: 'all',
      filterFavorite: false,
      filterProductTitle: '',
      filterWorkflow: 'all',
      filterAspect: 'all',
      filterImageCategory: 'all',
    })).toBe(true)
  })

  it('infers product and workflow from legacy prompts', () => {
    const category = getTaskHistoryCategory(task())

    expect(category.productTitle).toBe('Large Folding Umbrella')
    expect(category.workflow).toBe('amazon-listing')
  })

  it('handles legacy tasks without params', () => {
    const legacyTask = task({
      params: undefined as unknown as TaskRecord['params'],
    })

    expect(getTaskHistoryCategory(legacyTask).aspect).toBe('square')
    expect(getTaskProductFilterOptions([legacyTask]).map((option) => option.label)).toEqual(['Large Folding Umbrella'])
  })

  it('keeps tasks without product title under the uncategorized product filter', () => {
    expect(matchesTaskHistoryFilters(task({
      prompt: 'A regular creative prompt',
      category: { workflow: 'gallery' },
    }), {
      searchQuery: '',
      filterStatus: 'all',
      filterFavorite: false,
      filterProductTitle: UNCATEGORIZED_PRODUCT_FILTER,
      filterWorkflow: 'all',
      filterAspect: 'all',
      filterImageCategory: 'all',
    })).toBe(true)
  })

  it('combines product, workflow, aspect, status, favorite, and text filters', () => {
    const record = task({
      prompt: 'Create a premium Amazon A+ hero banner for a desk lamp.',
      params: { ...DEFAULT_PARAMS, size: '3536x1184' },
      isFavorite: true,
      category: {
        productTitle: 'LED Desk Lamp',
        workflow: 'amazon-aplus',
        amazonSlot: 'A+P01',
        aPlusType: 'premium',
      },
    })

    expect(matchesTaskHistoryFilters(record, {
      searchQuery: 'hero',
      filterStatus: 'done',
      filterFavorite: true,
      filterProductTitle: 'LED Desk Lamp',
      filterWorkflow: 'amazon-aplus',
      filterAspect: 'landscape',
      filterImageCategory: 'aplus',
    })).toBe(true)

    expect(matchesTaskHistoryFilters(record, {
      searchQuery: 'hero',
      filterStatus: 'done',
      filterFavorite: true,
      filterProductTitle: 'LED Desk Lamp',
      filterWorkflow: 'amazon-listing',
      filterAspect: 'landscape',
      filterImageCategory: 'all',
    })).toBe(false)

    expect(matchesTaskHistoryFilters(task({
      prompt: 'Create Amazon DSP advertising creative.',
      category: {
        productTitle: 'LED Desk Lamp',
        workflow: 'amazon-dsp',
        amazonSlot: 'DSP-REC-600x600',
      },
    }), {
      searchQuery: 'DSP',
      filterStatus: 'all',
      filterFavorite: false,
      filterProductTitle: 'LED Desk Lamp',
      filterWorkflow: 'amazon-dsp',
      filterAspect: 'all',
      filterImageCategory: 'dsp',
    })).toBe(true)
  })

  it('classifies Amazon image history into business image categories', () => {
    expect(getTaskImageCategoryLabel(task({
      category: { workflow: 'amazon-listing', amazonSlot: 'MAIN' },
    }))).toBe('主图')
    expect(getTaskImageCategoryLabel(task({
      category: { workflow: 'amazon-listing', amazonSlot: 'PT02' },
    }))).toBe('Listing 附图')
    expect(getTaskImageCategoryLabel(task({
      category: { workflow: 'amazon-aplus', amazonSlot: 'A+S01' },
    }))).toBe('A+ 模块')
    expect(getTaskImageCategoryLabel(task({
      category: { workflow: 'amazon-dsp', amazonSlot: 'DSP-REC-600x600' },
    }))).toBe('DSP 素材')
    expect(getTaskImageCategoryLabel(task({
      category: { workflow: 'gallery' },
    }))).toBe('普通生图')
  })

  it('filters history by image category including draft and final stages', () => {
    const listingMain = task({
      id: 'listing-main',
      category: { workflow: 'amazon-listing', amazonSlot: 'MAIN', generationStage: 'draft' },
    })
    const listingSecondary = task({
      id: 'listing-secondary',
      category: { workflow: 'amazon-listing', amazonSlot: 'PT02', generationStage: 'final' },
    })
    const dsp = task({
      id: 'dsp',
      category: { workflow: 'amazon-dsp', amazonSlot: 'DSP-REC-600x600' },
    })

    const baseFilters = {
      searchQuery: '',
      filterStatus: 'all' as const,
      filterFavorite: false,
      filterProductTitle: '',
      filterWorkflow: 'all' as const,
      filterAspect: 'all' as const,
    }

    expect(matchesTaskHistoryFilters(listingMain, { ...baseFilters, filterImageCategory: 'main' })).toBe(true)
    expect(matchesTaskHistoryFilters(listingSecondary, { ...baseFilters, filterImageCategory: 'listing-secondary' })).toBe(true)
    expect(matchesTaskHistoryFilters(dsp, { ...baseFilters, filterImageCategory: 'dsp' })).toBe(true)
    expect(matchesTaskHistoryFilters(listingMain, { ...baseFilters, filterImageCategory: 'draft' })).toBe(true)
    expect(matchesTaskHistoryFilters(listingSecondary, { ...baseFilters, filterImageCategory: 'final' })).toBe(true)
    expect(matchesTaskHistoryFilters(listingSecondary, { ...baseFilters, filterImageCategory: 'main' })).toBe(false)
  })

  it('limits history matches to the current product workspace when provided', () => {
    const workspaceTask = task({
      id: 'workspace-task',
      category: {
        productTitle: 'Nugget Ice Maker',
        workflow: 'amazon-listing',
        productWorkspaceId: 'B0CURRENT',
      },
    })
    const legacyWorkspaceTask = task({
      id: 'legacy-workspace-task',
      category: {
        productTitle: 'Nugget Ice Maker',
        workflow: 'amazon-listing',
        plannerSessionId: 'B0CURRENT',
      },
    })
    const otherWorkspaceTask = task({
      id: 'other-workspace-task',
      category: {
        productTitle: 'Nugget Ice Maker',
        workflow: 'amazon-listing',
        productWorkspaceId: 'B0OTHER',
      },
    })
    const uncategorizedTask = task({
      id: 'gallery-task',
      category: { workflow: 'gallery' },
    })
    const filters = {
      searchQuery: '',
      filterStatus: 'all' as const,
      filterFavorite: false,
      filterProductTitle: '',
      filterWorkflow: 'all' as const,
      filterAspect: 'all' as const,
      filterImageCategory: 'all' as const,
      filterProductWorkspaceId: 'B0CURRENT',
    }

    expect(matchesTaskHistoryFilters(workspaceTask, filters)).toBe(true)
    expect(matchesTaskHistoryFilters(legacyWorkspaceTask, filters)).toBe(true)
    expect(matchesTaskHistoryFilters(otherWorkspaceTask, filters)).toBe(false)
    expect(matchesTaskHistoryFilters(uncategorizedTask, filters)).toBe(false)
  })

  it('sorts product filter options by most recent task', () => {
    const options = getTaskProductFilterOptions([
      task({ id: 'old-lamp', createdAt: 1, category: { productTitle: 'LED Desk Lamp', workflow: 'amazon-aplus' } }),
      task({ id: 'umbrella', createdAt: 3, category: { productTitle: 'Large Folding Umbrella', workflow: 'amazon-listing' } }),
      task({ id: 'new-lamp', createdAt: 5, category: { productTitle: 'LED Desk Lamp', workflow: 'amazon-listing' } }),
    ])

    expect(options.map((option) => [option.label, option.count])).toEqual([
      ['LED Desk Lamp', 2],
      ['Large Folding Umbrella', 1],
    ])
  })
})
