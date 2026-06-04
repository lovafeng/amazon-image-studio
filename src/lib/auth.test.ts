import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentSession, login, logout, register } from './auth'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('frontend auth api', () => {
  it('loads the current session from the auth API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        authenticated: true,
        user: { id: 'admin-a', email: 'admin', phone: '', role: 'admin', status: 'active' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getCurrentSession()).resolves.toEqual({
      authenticated: true,
      user: { id: 'admin-a', email: 'admin', phone: '', role: 'admin', status: 'active' },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'same-origin' })
  })

  it('posts identifier credentials to login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        authenticated: true,
        user: { id: 'user-a', email: 'user@example.com', phone: '', role: 'user', status: 'active' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(login('user@example.com', 'secret')).resolves.toEqual({
      authenticated: true,
      user: { id: 'user-a', email: 'user@example.com', phone: '', role: 'user', status: 'active' },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'user@example.com', password: 'secret' }),
    })
  })

  it('posts registration details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        authenticated: true,
        user: { id: 'user-a', email: 'user@example.com', phone: '13800000000', role: 'user', status: 'active' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(register({ email: 'user@example.com', phone: '13800000000', password: 'secret' })).resolves.toEqual({
      authenticated: true,
      user: { id: 'user-a', email: 'user@example.com', phone: '13800000000', role: 'user', status: 'active' },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', phone: '13800000000', password: 'secret' }),
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
