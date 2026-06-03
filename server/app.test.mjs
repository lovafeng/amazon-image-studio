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
  return {
    getAllTasks: () => [...tasks.values()],
    putTask: (task) => tasks.set(task.id, task),
    deleteTask: (id) => tasks.delete(id),
    clearTasks: () => tasks.clear(),
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

beforeEach(async () => {
  server = createServer(createRequestHandler({ config, storage: createMemoryStorage() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

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
          json: () => JSON.parse(text),
        })
      })
    })
    if (options.body) req.write(options.body)
    req.end()
  })
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
})
