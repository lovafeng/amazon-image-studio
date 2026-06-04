import { describe, expect, it } from 'vitest'
import {
  createSessionCookie,
  createSessionToken,
  getCookieHeader,
  verifySessionToken,
} from './auth.mjs'

const config = {
  adminUsername: 'admin',
  adminPassword: 'secret',
  sessionSecret: 'test-session-secret',
}

const multiAccountConfig = {
  sessionSecret: 'test-session-secret',
  accounts: [
    { username: 'admin', password: 'secret' },
    { username: 'operator', password: 'operator-secret' },
  ],
}

describe('server auth sessions', () => {
  it('verifies a signed token created for the admin user', () => {
    const token = createSessionToken(config, 'admin', 1_900_000_000_000)

    expect(verifySessionToken(config, token, 1_800_000_000_000)).toEqual({
      username: 'admin',
    })
  })

  it('verifies a signed token created for any configured account', () => {
    const token = createSessionToken(multiAccountConfig, 'operator', 1_900_000_000_000)

    expect(verifySessionToken(multiAccountConfig, token, 1_800_000_000_000)).toEqual({
      username: 'operator',
    })
  })

  it('rejects a signed token for a removed account', () => {
    const token = createSessionToken(multiAccountConfig, 'operator', 1_900_000_000_000)

    expect(verifySessionToken(config, token, 1_800_000_000_000)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken(config, 'admin', 1_900_000_000_000)

    expect(verifySessionToken({ ...config, sessionSecret: 'other-secret' }, token, 1_800_000_000_000)).toBeNull()
  })

  it('creates an httpOnly session cookie', () => {
    const cookie = createSessionCookie(config, 'admin', 1_800_000_000_000)

    expect(cookie).toContain('ais_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('reads the signed session token from a cookie header', () => {
    const cookie = createSessionCookie(config, 'admin', 1_800_000_000_000)

    expect(getCookieHeader(cookie, 'ais_session')).toBeTruthy()
  })
})
