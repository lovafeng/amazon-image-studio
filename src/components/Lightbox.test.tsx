import { describe, expect, it } from 'vitest'
import lightboxSource from './Lightbox.tsx?raw'

describe('Lightbox image loading', () => {
  it('uses object URLs for the primary image display path', () => {
    expect(lightboxSource).toContain('ensureImageUrlCached')

    const primaryLoadEffectBlock = lightboxSource.slice(
      lightboxSource.indexOf('// 图片加载'),
      lightboxSource.indexOf('// 遮罩图加载'),
    )
    expect(primaryLoadEffectBlock).toContain('ensureImageUrlCached')
    expect(primaryLoadEffectBlock).not.toContain('ensureImageCached(imageId)')
  })
})
