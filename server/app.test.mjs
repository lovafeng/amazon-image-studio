import { createServer, request as httpRequest } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequestHandler } from './app.mjs'

const config = {
  adminUsername: 'admin',
  adminPassword: 'secret',
  sessionSecret: 'test-session-secret',
}

function createMemoryStorage() {
  const tasks = new Map()
  const key = (owner, id) => `${owner}:${id}`
  return {
    getAllTasks: (owner) => [...tasks.entries()].filter(([itemKey]) => itemKey.startsWith(`${owner}:`)).map(([, task]) => task),
    putTask: (owner, task) => tasks.set(key(owner, task.id), task),
    deleteTask: (owner, id) => tasks.delete(key(owner, id)),
    clearTasks: (owner) => {
      for (const itemKey of tasks.keys()) {
        if (itemKey.startsWith(`${owner}:`)) tasks.delete(itemKey)
      }
    },
    getImage: () => undefined,
    getAllImages: () => [],
    getAllImageIds: () => [],
    putImage: () => {},
    deleteImage: () => {},
    clearImages: () => {},
    getStoredImageThumbnail: () => undefined,
    putImageThumbnail: () => {},
    getAllAmazonPlannerSessions: () => [],
    putAmazonPlannerSession: () => {},
    deleteAmazonPlannerSession: () => {},
    clearAmazonPlannerSessions: () => {},
  }
}

let server
let baseUrl
let appConfig

beforeEach(async () => {
  appConfig = { ...config }
  await startApp()
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

async function startApp() {
  server = createServer(createRequestHandler({ config: appConfig, storage: createMemoryStorage() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
}

async function restartApp(configOverride) {
  await new Promise((resolve) => server.close(resolve))
  appConfig = { ...config, ...configOverride }
  await startApp()
}

async function postJson(path, body, cookie) {
  return request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function request(path, options = {}) {
  return new Promise((resolve) => {
    const req = httpRequest(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: () => text,
          json: () => JSON.parse(text),
        })
      })
    })
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function createUpstreamServer(handler) {
  const upstream = createServer(handler)
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => upstream.close(resolve)),
  }
}

describe('http app', () => {
  it('logs in, reports the current session, and logs out', async () => {
    const login = await postJson('/api/auth/login', { username: 'admin', password: 'secret' })

    expect(login.status).toBe(200)
    const cookie = login.headers['set-cookie'][0]
    expect(cookie).toContain('ais_session=')

    const me = await request('/api/auth/me', { headers: { cookie } })
    expect(me.json()).toEqual({ authenticated: true, username: 'admin' })

    const logout = await request('/api/auth/logout', { method: 'POST', headers: { cookie } })
    expect(logout.headers['set-cookie'][0]).toContain('Max-Age=0')
  })

  it('rejects invalid login credentials', async () => {
    const response = await postJson('/api/auth/login', { username: 'admin', password: 'wrong' })

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: '账号或密码错误' })
  })

  it('requires login for data APIs', async () => {
    const response = await request('/api/tasks')

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: '未登录' })
  })

  it('stores and reads a task after login', async () => {
    const login = await postJson('/api/auth/login', { username: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const task = { id: 'task-a', prompt: 'prompt', createdAt: 1 }

    const put = await request('/api/tasks/task-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(task),
    })
    expect(put.status).toBe(200)

    const get = await request('/api/tasks', { headers: { cookie } })
    expect(get.json()).toEqual([task])
  })

  it('isolates stored tasks by login account', async () => {
    await restartApp({
      accounts: [
        { username: 'admin', password: 'secret' },
        { username: 'operator', password: 'operator-secret' },
      ],
    })
    const adminLogin = await postJson('/api/auth/login', { username: 'admin', password: 'secret' })
    const operatorLogin = await postJson('/api/auth/login', { username: 'operator', password: 'operator-secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]
    const operatorCookie = operatorLogin.headers['set-cookie'][0]
    const adminTask = { id: 'task-a', prompt: 'admin prompt', createdAt: 1 }
    const operatorTask = { id: 'task-a', prompt: 'operator prompt', createdAt: 2 }

    await request('/api/tasks/task-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(adminTask),
    })
    await request('/api/tasks/task-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: operatorCookie },
      body: JSON.stringify(operatorTask),
    })

    expect((await request('/api/tasks', { headers: { cookie: adminCookie } })).json()).toEqual([adminTask])
    expect((await request('/api/tasks', { headers: { cookie: operatorCookie } })).json()).toEqual([operatorTask])
  })

  it('requires login for the API proxy', async () => {
    const response = await request('/api-proxy/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.5' }),
    })

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: '未登录' })
  })

  it('proxies allowed AI requests with the server API key', async () => {
    let upstreamRequest
    const upstream = await createUpstreamServer((req, res) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        upstreamRequest = {
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization,
          contentType: req.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
    })
    await restartApp({
      aiApiBaseUrl: `${upstream.baseUrl}/reseller/v1`,
      aiApiKey: 'env-api-key',
    })
    const login = await postJson('/api/auth/login', { username: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]

    const response = await request('/api-proxy/v1/responses', {
      method: 'POST',
      headers: {
        authorization: 'Bearer browser-placeholder',
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ model: 'gpt-5.5' }),
    })

    expect(response.status).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(upstreamRequest).toMatchObject({
      method: 'POST',
      url: '/reseller/v1/responses',
      authorization: 'Bearer env-api-key',
      contentType: 'application/json',
      body: JSON.stringify({ model: 'gpt-5.5' }),
    })
    await upstream.close()
  })
})
