import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminTasks,
  getAdminSummary,
  getAdminUsage,
  getAdminUsers,
  getMyUsage,
  resetUserPassword,
  setUserTokenLimit,
  setUserStatus,
} from './admin'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('frontend admin api', () => {
  it('loads admin users', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'user-a', email: 'user@example.com' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getAdminUsers()).resolves.toEqual([{ id: 'user-a', email: 'user@example.com' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users', { credentials: 'same-origin' })
  })

  it('loads admin summary and usage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: 1, calls: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summaries: [], events: [] }), { status: 200 }))

    await expect(getAdminSummary()).resolves.toEqual({ users: 1, calls: 2 })
    await expect(getAdminUsage()).resolves.toEqual({ summaries: [], events: [] })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/summary', { credentials: 'same-origin' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/usage', { credentials: 'same-origin' })
  })

  it('loads admin tasks', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [{ userId: 'user-a', task: { id: 'task-a' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getAdminTasks()).resolves.toEqual([{ userId: 'user-a', task: { id: 'task-a' } }])
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/tasks', { credentials: 'same-origin' })
  })

  it('updates user status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await setUserStatus('user-a', 'disabled')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/user-a/status', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    })
  })

  it('resets user password', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await resetUserPassword('user-a', 'new-secret')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/user-a/reset-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'new-secret' }),
    })
  })

  it('sets and clears user token limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await setUserTokenLimit('user-a', 100)
    await setUserTokenLimit('user-a', null)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/users/user-a/token-limit', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokenLimit: 100 }),
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/users/user-a/token-limit', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokenLimit: null }),
    })
  })

  it('loads the current user usage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: { calls: 1 }, events: [] }), { status: 200 }),
    )

    await expect(getMyUsage()).resolves.toEqual({ summary: { calls: 1 }, events: [] })
    expect(fetchMock).toHaveBeenCalledWith('/api/usage/me', { credentials: 'same-origin' })
  })
})
