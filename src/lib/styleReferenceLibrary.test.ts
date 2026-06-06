import { describe, expect, it } from 'vitest'
import { buildStyleReferenceLibrary } from './styleReferenceLibrary'
import type { AmazonPlannerSession } from '../types'

function draft(productTitle: string): AmazonPlannerSession['draft'] {
  return {
    productTitle,
    category: '',
    brand: '',
    color: '',
    material: '',
    audience: '',
    sellingPoints: '',
    packageIncludes: '',
    scene: '',
    forbidden: '',
  }
}

function session(overrides: Partial<AmazonPlannerSession>): AmazonPlannerSession {
  return {
    id: overrides.id ?? 'session-1',
    title: overrides.title ?? 'Title',
    mode: overrides.mode ?? 'listing',
    aPlusType: 'standard-large',
    resolution: '2k',
    listingText: '',
    referenceImageIds: [],
    draft: overrides.draft ?? draft('ThermoMaven Probe'),
    seriesStyleGuides: { listing: '', aplus: '', dsp: '' },
    styleCandidates: [
      { label: 'Clean Retail', description: 'bright', prompt: 'prompt', negativePrompt: '' },
      { label: 'Dark Tech', description: 'dark', prompt: 'prompt', negativePrompt: '' },
    ],
    styleImages: overrides.styleImages ?? [{ candidateIndex: 0, imageId: 'style-a' }],
    selectedStyleIndex: overrides.selectedStyleIndex ?? 0,
    styleDensityMode: overrides.styleDensityMode,
    imagePlans: [],
    aPlusPlans: [],
    dspPlans: [],
    selectedPlanIndex: null,
    selectedAPlusPlanIndex: null,
    selectedDspPlanIndex: null,
    actionProgress: {},
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  }
}

describe('style reference library', () => {
  it('prioritizes same product and mode references', () => {
    const items = buildStyleReferenceLibrary({
      sessions: [
        session({ id: 'old', mode: 'dsp', draft: draft('Other'), updatedAt: 10, styleImages: [{ candidateIndex: 0, imageId: 'style-old' }] }),
        session({ id: 'match', mode: 'listing', updatedAt: 2, styleImages: [{ candidateIndex: 1, imageId: 'style-match' }] }),
      ],
      currentMode: 'listing',
      productTitle: 'ThermoMaven Probe',
    })

    expect(items[0]).toMatchObject({ imageId: 'style-match', label: 'Dark Tech', plannerSessionId: 'match' })
  })

  it('dedupes by image id and limits the list', () => {
    const items = buildStyleReferenceLibrary({
      sessions: [
        session({ id: 'new', updatedAt: 3, styleImages: [{ candidateIndex: 0, imageId: 'same-img' }] }),
        session({ id: 'old', updatedAt: 2, styleImages: [{ candidateIndex: 0, imageId: 'same-img' }] }),
      ],
      currentMode: 'listing',
      productTitle: 'ThermoMaven Probe',
      limit: 1,
    })

    expect(items).toHaveLength(1)
    expect(items[0].plannerSessionId).toBe('new')
  })

  it('skips style images without matching candidate metadata', () => {
    const items = buildStyleReferenceLibrary({
      sessions: [
        session({ id: 'broken', styleImages: [{ candidateIndex: 9, imageId: 'style-missing' }] }),
      ],
      currentMode: 'listing',
      productTitle: 'ThermoMaven Probe',
    })

    expect(items).toEqual([])
  })
})
