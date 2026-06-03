import { describe, expect, it } from 'vitest'
import { shouldUseApiHandler } from './routing.mjs'

describe('server routing', () => {
  it('routes app APIs and AI proxy requests to the API handler', () => {
    expect(shouldUseApiHandler('/api/auth/me')).toBe(true)
    expect(shouldUseApiHandler('/api-proxy/v1/responses')).toBe(true)
  })

  it('keeps frontend paths on the static handler', () => {
    expect(shouldUseApiHandler('/')).toBe(false)
    expect(shouldUseApiHandler('/assets/index.js')).toBe(false)
  })
})
