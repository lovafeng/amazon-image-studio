import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadImageIds } from './downloadImages'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('downloadImageIds', () => {
  it('downloads stored image ids from the image blob endpoint', async () => {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    vi.stubGlobal('document', {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn(() => anchor),
    })
    vi.stubGlobal('window', {
      setTimeout: vi.fn((callback: () => void) => {
        callback()
        return 1
      }),
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/images/image-a/blob') {
        return new Response(new Blob(['image-bytes'], { type: 'image/png' }))
      }
      return new Response(JSON.stringify({
        id: 'image-a',
        dataUrl: 'data:image/png;base64,a',
      }))
    })

    await expect(downloadImageIds(['image-a'], 'exported')).resolves.toEqual({ successCount: 1, failCount: 0 })

    expect(fetchMock).toHaveBeenCalledWith('/api/images/image-a/blob', { credentials: 'same-origin' })
    expect(anchor.download).toBe('exported.png')
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })
})
