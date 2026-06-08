import { describe, expect, it, vi } from 'vitest'
import { createImageObjectUrlCache } from './imageObjectUrlCache'

describe('createImageObjectUrlCache', () => {
  it('does not revoke an object URL when the same id is set to the same URL', () => {
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const cache = createImageObjectUrlCache<{ version: number }>(2)

    cache.set('image-a', 'blob:image-a', { version: 1 })
    cache.set('image-a', 'blob:image-a', { version: 2 })

    expect(revokeObjectUrl).not.toHaveBeenCalled()
    expect(cache.get('image-a')).toEqual({
      url: 'blob:image-a',
      metadata: { version: 2 },
    })
  })
})
