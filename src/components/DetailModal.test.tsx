import { describe, expect, it } from 'vitest'
import detailModalSource from './DetailModal.tsx?raw'

describe('DetailModal', () => {
  it('lets operators classify generated history as DSP images', () => {
    expect(detailModalSource).toContain('<option value="amazon-dsp">DSP 图</option>')
  })
})
