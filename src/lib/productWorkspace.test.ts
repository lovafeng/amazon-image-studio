import { describe, expect, it } from 'vitest'
import type { ProductWorkspace } from '../types'
import {
  buildStandardSixViewPrompt,
  collectProductWorkspaceImageIds,
  createProductWorkspaceSixViewVersion,
  getConfirmedSixViewImageId,
  getConfirmedSixViewVersion,
} from './productWorkspace'

function workspace(overrides: Partial<ProductWorkspace> = {}): ProductWorkspace {
  return {
    id: 'B0WORKSPACE',
    title: 'Tumbler Workspace',
    mode: 'listing',
    aPlusType: 'standard-large',
    resolution: '2k',
    listingText: 'Title: 40 oz Tumbler',
    referenceImageIds: ['ref-a', 'ref-b'],
    draft: {
      kind: 'main',
      productTitle: '40 oz Tumbler',
      category: 'Kitchen',
      brand: 'Acme',
      color: 'Matte Black',
      material: 'Stainless steel',
      audience: '',
      sellingPoints: 'Vacuum insulation',
      packageIncludes: '',
      scene: '',
      forbidden: '',
    },
    sixViewVersions: [
      {
        id: 'six-view-a',
        imageId: 'six-view-image-a',
        prompt: 'first prompt',
        inputImageIds: ['ref-a'],
        createdAt: 2,
      },
      {
        id: 'six-view-b',
        imageId: 'six-view-image-b',
        prompt: 'second prompt',
        inputImageIds: ['six-view-image-a', 'ref-a'],
        createdAt: 3,
      },
    ],
    confirmedSixViewVersionId: 'six-view-b',
    seriesStyleGuides: {
      listing: '',
      aplus: '',
      dsp: '',
    },
    styleCandidates: [],
    styleImages: [{ candidateIndex: 0, imageId: 'style-a' }],
    selectedStyleIndex: 0,
    selectedStyleReference: null,
    styleDensityMode: 'rich',
    imagePlans: [],
    aPlusPlans: [],
    dspPlans: [],
    selectedPlanIndex: null,
    selectedAPlusPlanIndex: null,
    selectedDspPlanIndex: null,
    actionProgress: {},
    createdAt: 1,
    updatedAt: 4,
    ...overrides,
  }
}

describe('product workspace six-view helpers', () => {
  it('builds a fixed 2x3 standard six-view prompt from product facts', () => {
    const prompt = buildStandardSixViewPrompt(workspace(), 'Correct the handle thickness.')

    expect(prompt).toContain('standardized six-view product reference')
    expect(prompt).toContain('2x3 grid')
    expect(prompt).toContain('front view')
    expect(prompt).toContain('back view')
    expect(prompt).toContain('left side view')
    expect(prompt).toContain('right side view')
    expect(prompt).toContain('top view')
    expect(prompt).toContain('bottom view')
    expect(prompt).toContain('40 oz Tumbler')
    expect(prompt).toContain('Matte Black')
    expect(prompt).toContain('Correct the handle thickness.')
    expect(prompt).toContain('Do not add marketing text')
    expect(prompt).toContain('Use the supplied images as the primary source of truth')
    expect(prompt).toContain('Do not simplify the product into a generic box')
    expect(prompt).toContain('For products with movable or openable parts')
    expect(prompt).toContain('Preserve authentic on-product brand logos')
    expect(prompt).toContain('Do not remove, blur, replace, or relocate real on-product brand marks')
    expect(prompt).toContain('Keep real wordmarks visible in every panel where that product surface is visible, especially the front view and top/control-panel view')
    expect(prompt).toContain('Never output a blank or generic front-facing control panel when the supplied product images show a brand wordmark')
    expect(prompt).toContain('curved smoked transparent lid')
    expect(prompt).toContain('rounded lid corners')
    expect(prompt).toContain('hinge curve')
    expect(prompt).not.toContain('badges, logos')
  })

  it('creates immutable six-view versions', () => {
    expect(createProductWorkspaceSixViewVersion({
      id: 'six-view-c',
      imageId: 'six-view-image-c',
      prompt: 'six view prompt',
      inputImageIds: ['ref-a', 'ref-b'],
      createdAt: 10,
    })).toEqual({
      id: 'six-view-c',
      imageId: 'six-view-image-c',
      prompt: 'six view prompt',
      inputImageIds: ['ref-a', 'ref-b'],
      createdAt: 10,
    })
  })

  it('resolves the confirmed six-view version and image id', () => {
    const current = workspace()

    expect(getConfirmedSixViewVersion(current)?.id).toBe('six-view-b')
    expect(getConfirmedSixViewImageId(current)).toBe('six-view-image-b')
    expect(getConfirmedSixViewImageId(workspace({ confirmedSixViewVersionId: null }))).toBeNull()
  })

  it('collects every image referenced by a product workspace', () => {
    expect(collectProductWorkspaceImageIds(workspace())).toEqual([
      'ref-a',
      'ref-b',
      'six-view-image-a',
      'six-view-image-b',
      'style-a',
    ])
  })
})
