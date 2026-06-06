import { describe, expect, it } from 'vitest'
import amazonPlannerSource from './AmazonPlanner.tsx?raw'

describe('AmazonPlanner metadata wiring', () => {
  it('writes planner and gallery style metadata through submit paths', () => {
    expect(amazonPlannerSource).toContain('plannerSessionId: currentPlannerSessionId')
    expect(amazonPlannerSource).toContain('plannerBatchId')
    expect(amazonPlannerSource).toContain('galleryStyleReferenceRequest')
    expect(amazonPlannerSource).toContain('setGalleryStyleReferenceRequest(null)')
  })
})
