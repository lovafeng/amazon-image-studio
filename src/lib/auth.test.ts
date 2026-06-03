import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentSession, login, logout } from './auth'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('frontend auth api', () => {
  it('loads the current session from the auth API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, username: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getCurrentSession()).resolves.toEqual({ authenticated: true, username: 'admin' })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'same-origin' })
  })

  it('posts credentials to login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true, username: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(login('admin', 'secret')).resolves.toEqual({ authenticated: true, username: 'admin' })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' }),
    })
  })

  it('posts logout', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await logout()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
  })
})
