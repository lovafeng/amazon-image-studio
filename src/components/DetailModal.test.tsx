import { describe, expect, it } from 'vitest'
import detailModalSource from './DetailModal.tsx?raw'
import { getNearbyOutputImageIds } from './DetailModal'

describe('DetailModal', () => {
  it('lets operators classify generated history as DSP images', () => {
    expect(detailModalSource).toContain('<option value="amazon-dsp">DSP 图</option>')
  })

  it('loads only the current output image and adjacent outputs on initial open', () => {
    expect(getNearbyOutputImageIds(['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['b', 'c', 'd'])
    expect(getNearbyOutputImageIds(['a', 'b', 'c', 'd', 'e'], 0)).toEqual(['a', 'b'])

    const outputLoadEffectBlock = detailModalSource.slice(
      detailModalSource.indexOf('const outputImageIds = task?.outputImages ?? []'),
      detailModalSource.indexOf('}, [task?.outputImages'),
    )
    expect(outputLoadEffectBlock).toContain('getNearbyOutputImageIds')
    expect(outputLoadEffectBlock).not.toContain('for (const imageId of outputImageIds)')
  })

  it('uses object URLs for output preview display while keeping data URLs for canvas-only images', () => {
    expect(detailModalSource).toContain('ensureImageUrlCached')

    const outputLoadEffectBlock = detailModalSource.slice(
      detailModalSource.indexOf('const outputImageIds = task?.outputImages ?? []'),
      detailModalSource.indexOf('}, [task?.outputImages'),
    )
    expect(outputLoadEffectBlock).toContain('ensureImageUrlCached')
    expect(outputLoadEffectBlock).not.toContain('ensureImageCached(imageId)')
  })
})
