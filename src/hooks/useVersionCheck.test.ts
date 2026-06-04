import { describe, expect, it } from 'vitest'
import { LATEST_RELEASE_API_URL, LATEST_RELEASE_REPO } from './useVersionCheck'

describe('useVersionCheck constants', () => {
  it('does not configure a GitHub release endpoint', () => {
    expect(LATEST_RELEASE_REPO).toBeNull()
    expect(LATEST_RELEASE_API_URL).toBeNull()
  })
})
