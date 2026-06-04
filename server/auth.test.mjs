import { describe, expect, it } from 'vitest'
import {
  createSessionCookie,
  createSessionToken,
  getCookieHeader,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from './auth.mjs'

const config = {
  adminUsername: 'admin',
  adminPassword: 'secret',
  sessionSecret: 'test-session-secret',
}

const activeUserStorage = {
  getUserById: (id) => (
    id === 'user-a'
      ? { id: 'user-a', email: 'user@example.com', role: 'user', status: 'active' }
      : undefined
  ),
}

const disabledUserStorage = {
  getUserById: () => ({ id: 'user-a', email: 'user@example.com', role: 'user', status: 'disabled' }),
}

describe('server auth sessions', () => {
  it('hashes and verifies passwords without storing plaintext', () => {
    const hash = hashPassword('secret', 'fixed-salt')

    expect(hash).toMatch(/^scrypt:fixed-salt:/)
    expect(hash).not.toContain('secret')
    expect(verifyPassword('secret', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })

  it('verifies a signed token created for an active user id', () => {
    const token = createSessionToken(config, { id: 'user-a', role: 'user' }, 1_900_000_000_000)

    expect(verifySessionToken(config, activeUserStorage, token, 1_800_000_000_000)).toEqual({
      userId: 'user-a',
      role: 'user',
    })
  })

  it('rejects a signed token for a disabled user', () => {
    const token = createSessionToken(config, { id: 'user-a', role: 'user' }, 1_900_000_000_000)

    expect(verifySessionToken(config, disabledUserStorage, token, 1_800_000_000_000)).toBeNull()
  })

  it('rejects a signed token for a removed account', () => {
    const token = createSessionToken(config, { id: 'missing-user', role: 'user' }, 1_900_000_000_000)

    expect(verifySessionToken(config, activeUserStorage, token, 1_800_000_000_000)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken(config, { id: 'user-a', role: 'user' }, 1_900_000_000_000)

    expect(verifySessionToken({ ...config, sessionSecret: 'other-secret' }, activeUserStorage, token, 1_800_000_000_000)).toBeNull()
  })

  it('creates an httpOnly session cookie', () => {
    const cookie = createSessionCookie(config, { id: 'user-a', role: 'user' }, 1_800_000_000_000)

    expect(cookie).toContain('ais_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('reads the signed session token from a cookie header', () => {
    const cookie = createSessionCookie(config, { id: 'user-a', role: 'user' }, 1_800_000_000_000)

    expect(getCookieHeader(cookie, 'ais_session')).toBeTruthy()
  })
})
