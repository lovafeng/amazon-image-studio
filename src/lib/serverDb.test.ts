import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAgentConversations, clearTasks, deleteAgentConversation, getAllAgentConversations, getAllAmazonPlannerSessions, getAllTasks, getImageThumbnail, putAgentConversation, putTask } from './db'
import { DEFAULT_PARAMS, type AgentConversation, type AmazonPlannerSession, type StoredImageThumbnail, type TaskRecord } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

function amazonPlannerSession(overrides: Partial<AmazonPlannerSession> = {}): AmazonPlannerSession {
  return {
    id: 'planner-session-a',
    title: 'Tumbler Listing',
    mode: 'listing',
    aPlusType: 'standard-large',
    resolution: '2k',
    listingText: 'Title: Tumbler',
    referenceImageIds: [],
    draft: {
      kind: 'main',
      productTitle: 'Tumbler',
      category: 'Kitchen',
      brand: '',
      color: '',
      material: '',
      audience: '',
      sellingPoints: '',
      packageIncludes: '',
      scene: '',
      forbidden: '',
    },
    seriesStyleGuides: {
      listing: 'Warm studio style.',
      aplus: '',
      dsp: '',
    },
    styleCandidates: [],
    styleImages: [],
    selectedStyleIndex: null,
    styleDensityMode: 'rich',
    imagePlans: [],
    aPlusPlans: [],
    dspPlans: [],
    selectedPlanIndex: null,
    selectedAPlusPlanIndex: null,
    selectedDspPlanIndex: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

function agentConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: 'conversation-a',
    title: '新对话',
    activeRoundId: null,
    createdAt: 1,
    updatedAt: 2,
    rounds: [],
    messages: [],
    ...overrides,
  }
}

function requestResult<T>(result: T) {
  const request = {
    result,
    error: null,
    onsuccess: null as null | (() => void),
    onerror: null as null | (() => void),
  }
  queueMicrotask(() => request.onsuccess?.())
  return request
}

function installLegacyIndexedDB(stores: Record<string, unknown[]>) {
  const objectStoreNames = {
    contains: (storeName: string) => Object.prototype.hasOwnProperty.call(stores, storeName),
  }
  const db = {
    objectStoreNames,
    createObjectStore: (storeName: string) => {
      stores[storeName] = []
    },
    transaction: (storeName: string) => ({
      objectStore: () => ({
        getAll: () => requestResult([...(stores[storeName] ?? [])]),
      }),
    }),
  }
  const indexedDB = {
    open: vi.fn(() => {
      const request = {
        result: db,
        error: null,
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | ((event: { target: { result: typeof db } }) => void),
      }
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request })
        request.onsuccess?.()
      })
      return request
    }),
  }
  vi.stubGlobal('indexedDB', indexedDB)
}

function installMigrationMarker() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  })
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

  it('loads agent conversations from the server API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([agentConversation()]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(getAllAgentConversations()).resolves.toEqual([agentConversation()])
    expect(fetch).toHaveBeenCalledWith('/api/agent-conversations', { credentials: 'same-origin' })
  })

  it('stores an agent conversation through the server API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'conversation-a' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(putAgentConversation(agentConversation())).resolves.toBe('conversation-a')
    expect(fetchMock).toHaveBeenCalledWith('/api/agent-conversations/conversation-a', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(agentConversation()),
    })
  })

  it('deletes an agent conversation through the server API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await deleteAgentConversation('conversation-a')
    expect(fetchMock).toHaveBeenCalledWith('/api/agent-conversations/conversation-a', {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  })

  it('clears agent conversations through the server API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await clearAgentConversations()
    expect(fetchMock).toHaveBeenCalledWith('/api/agent-conversations', {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  })

  it('returns a fresh stored thumbnail without requesting the full image', async () => {
    const thumbnail: StoredImageThumbnail = {
      id: 'image-a',
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
      width: 300,
      height: 250,
      thumbnailVersion: 2,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/thumbnails/image-a') {
        return new Response(JSON.stringify(thumbnail), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === '/api/images/image-a') {
        return new Response(JSON.stringify({ id: 'image-a', dataUrl: 'data:image/png;base64,full' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(null), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(getImageThumbnail('image-a')).resolves.toEqual(thumbnail)
    expect(fetchMock).toHaveBeenCalledWith('/api/thumbnails/image-a', { credentials: 'same-origin' })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/images/image-a', { credentials: 'same-origin' })
  })

  it('migrates legacy IndexedDB planner sessions before loading server history', async () => {
    const session = amazonPlannerSession()
    const serverSessions = new Map<string, AmazonPlannerSession>()
    installMigrationMarker()
    installLegacyIndexedDB({
      tasks: [],
      images: [],
      thumbnails: [],
      amazonPlannerSessions: [session],
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/amazon-planner-sessions' && !init?.method) {
        return new Response(JSON.stringify([...serverSessions.values()]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === `/api/amazon-planner-sessions/${session.id}` && init?.method === 'PUT') {
        serverSessions.set(session.id, JSON.parse(String(init.body)) as AmazonPlannerSession)
        return new Response(JSON.stringify({ id: session.id }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(getAllAmazonPlannerSessions()).resolves.toEqual([session])
    expect(fetchMock).toHaveBeenCalledWith(`/api/amazon-planner-sessions/${session.id}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    })
  })
})
