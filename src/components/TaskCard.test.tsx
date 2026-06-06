import { describe, expect, it } from 'vitest'
import taskCardSource from './TaskCard.tsx?raw'

describe('TaskCard thumbnail loading', () => {
  it('loads thumbnails only after the card enters the viewport', () => {
    expect(taskCardSource).toContain('IntersectionObserver')
    expect(taskCardSource).toContain('isThumbnailVisible')

    const thumbnailEffectBlock = taskCardSource.slice(
      taskCardSource.indexOf('// 加载缩略图'),
      taskCardSource.indexOf('const duration = (() => {'),
    )
    expect(thumbnailEffectBlock).toContain('if (!isThumbnailVisible) return')
  })
})
