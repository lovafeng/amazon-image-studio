import { describe, expect, it } from 'vitest'
import { LATEST_RELEASE_API_URL, LATEST_RELEASE_REPO } from './useVersionCheck'

describe('useVersionCheck constants', () => {
  it('checks releases from the configured fork', () => {
    expect(LATEST_RELEASE_REPO).toBe('lovafeng/amazon-image-studio')
    expect(LATEST_RELEASE_API_URL).toBe('https://api.github.com/repos/lovafeng/amazon-image-studio/releases/latest')
  })
})
