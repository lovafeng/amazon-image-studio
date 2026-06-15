import { describe, expect, it } from 'vitest'
import type { ProductWorkspace } from '../types'
import {
  buildStandardSixViewPrompt,
  collectProductWorkspaceImageIds,
  createEmptyProductWorkspace,
  createProductWorkspaceSixViewVersion,
  getConfirmedSixViewImageId,
  getConfirmedSixViewVersion,
  getStandardSixViewSourceImageIds,
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
  it('creates a blank product workspace without inheriting previous references or plans', () => {
    const current = createEmptyProductWorkspace({
      id: 'fresh-workspace',
      title: 'Fresh Workspace',
      createdAt: 10,
    })

    expect(current).toMatchObject({
      id: 'fresh-workspace',
      title: 'Fresh Workspace',
      mode: 'listing',
      aPlusType: 'standard-large',
      resolution: '1k',
      listingText: '',
      referenceImageIds: [],
      sixViewVersions: [],
      confirmedSixViewVersionId: null,
      seriesStyleGuides: { listing: '', aplus: '', dsp: '' },
      styleCandidates: [],
      styleImages: [],
      selectedStyleIndex: null,
      selectedStyleReference: null,
      styleDensityMode: 'rich',
      imagePlans: [],
      aPlusPlans: [],
      dspPlans: [],
      selectedPlanIndex: null,
      selectedAPlusPlanIndex: null,
      selectedDspPlanIndex: null,
      actionProgress: {},
      createdAt: 10,
      updatedAt: 10,
    })
  })

  it('builds a fixed 2x3 standard six-view prompt from product facts', () => {
    const prompt = buildStandardSixViewPrompt(workspace(), 'Correct the handle thickness.')

    expect(prompt).toContain('standardized six-view product reference')
    expect(prompt).toContain('2x3 grid')
    expect(prompt).toContain('3 columns x 2 rows')
    expect(prompt).toContain('cell 5 bottom-center top view')
    expect(prompt).toContain('cell 6 bottom-right bottom view')
    expect(prompt).toContain('front view')
    expect(prompt).toContain('back view')
    expect(prompt).toContain('left side view')
    expect(prompt).toContain('right side view')
    expect(prompt).toContain('top view')
    expect(prompt).toContain('bottom view')
    expect(prompt).toContain('Cell 3, the top-right left side view, must be a true orthographic side profile')
    expect(prompt).toContain('Cell 4, the bottom-left right side view, must be the opposite true orthographic side profile')
    expect(prompt).toContain('Do not turn either side view into a front-side, rear-side, top-side, or three-quarter perspective')
    expect(prompt).toContain('handle-side details, hinges, knobs, side panels, vents, seams, feet, lips, and protruding parts')
    expect(prompt).toContain('Cell 5, the bottom-center top view, must be a true vertical overhead orthographic view')
    expect(prompt).toContain('front face height, rear face height, side wall height')
    expect(prompt).toContain('not a front-top, three-quarter, angled, or perspective view')
    expect(prompt).toContain('Cell 6, the bottom-right bottom view, must be a true vertical underside view')
    expect(prompt).toContain('infer conservatively from the front, back, and side references')
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
    expect(prompt).toContain('movable or openable structural parts')
    expect(prompt).toContain('lids, covers, doors, flaps, panels, hinges, latches, handles')
    expect(prompt).toContain('curved edges, rounded corners, bevels, lips, thickness, transparency, and opening angle')
    expect(prompt).toContain('Do not flatten, straighten, square off, simplify, or replace these parts')
    expect(prompt).toContain('Treat original product reference photos as authoritative for true color, material finish, brand marks, and permanent geometry')
    expect(prompt).toContain('If a previous six-view candidate is supplied, use it only as a draft layout to correct')
    expect(prompt).not.toContain('badges, logos')
  })

  it('sanitizes non-product generation notes from six-view product facts', () => {
    const prompt = buildStandardSixViewPrompt(workspace({
      draft: {
        ...workspace().draft,
        sellingPoints: [
          'Low, wide body ratio: length 49.95cm, width 39.4cm, height 25.7cm.',
          '15 cooking functions including air fry and pizza. typhur dome advertisement featuring crispy food - DSP ad image plan "quiet 51db" Need final JSON no weird inserted text.',
        ].join('\n'),
      },
    }))

    expect(prompt).toContain('Low, wide body ratio: length 49.95cm, width 39.4cm, height 25.7cm.')
    expect(prompt).toContain('15 cooking functions including air fry and pizza.')
    expect(prompt).not.toContain('advertisement featuring')
    expect(prompt).not.toContain('DSP ad image plan')
    expect(prompt).not.toContain('Need final JSON')
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

  it('selects six-view source images only from original workspace references', () => {
    expect(getStandardSixViewSourceImageIds(workspace())).toEqual([
      'ref-a',
      'ref-b',
    ])

    expect(getStandardSixViewSourceImageIds(workspace({
      referenceImageIds: ['ref-a', 'six-view-image-b', 'ref-a'],
    }))).toEqual([
      'ref-a',
      'six-view-image-b',
    ])
  })
})
