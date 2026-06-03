import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTasks, getAllTasks, putTask } from './db'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

describe('server backed db client', () => {
  it('loads tasks from the server API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([task()]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getAllTasks()).resolves.toEqual([task()])
    expect(fetch).toHaveBeenCalledWith('/api/tasks', { credentials: 'same-origin' })
  })

  it('stores a task through the server API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'task-a' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(putTask(task())).resolves.toBe('task-a')
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-a', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(task()),
    })
  })

  it('clears tasks through the server API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await clearTasks()
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  })
})
