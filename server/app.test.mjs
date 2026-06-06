import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequestHandler } from './app.mjs'
import { hashPassword } from './auth.mjs'
import { createStorage } from './database.mjs'

const config = {
  adminUsername: 'admin',
  adminPassword: 'secret',
  sessionSecret: 'test-session-secret',
}

let server
let baseUrl
let appConfig
let tempDir
let appStorage

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'ais-app-'))
  appStorage = createStorage(join(tempDir, 'app.sqlite'))
  appStorage.ensureAdminUser({
    email: 'admin',
    phone: '',
    passwordHash: hashPassword('secret', 'admin-salt'),
    createdAt: 1,
  })
  appConfig = { ...config }
  await startApp()
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  appStorage.close()
  rmSync(tempDir, { recursive: true, force: true })
})

async function startApp() {
  server = createServer(createRequestHandler({ config: appConfig, storage: appStorage }))
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
  return new Promise((resolve, reject) => {
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
    req.on('error', reject)
    if (options.timeoutMs) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error('request timeout'))
      })
    }
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
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })

    expect(login.status).toBe(200)
    const cookie = login.headers['set-cookie'][0]
    expect(cookie).toContain('ais_session=')

    const me = await request('/api/auth/me', { headers: { cookie } })
    expect(me.json()).toMatchObject({
      authenticated: true,
      user: {
        email: 'admin',
        role: 'admin',
        status: 'active',
      },
    })

    const logout = await request('/api/auth/logout', { method: 'POST', headers: { cookie } })
    expect(logout.headers['set-cookie'][0]).toContain('Max-Age=0')
  })

  it('registers a user and returns an authenticated user session', async () => {
    const response = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })

    expect(response.status).toBe(200)
    expect(response.json()).toMatchObject({
      authenticated: true,
      user: {
        email: 'user@example.com',
        role: 'user',
        status: 'active',
      },
    })
    expect(response.headers['set-cookie'][0]).toContain('ais_session=')
  })

  it('logs in with either email or phone', async () => {
    await postJson('/api/auth/register', {
      email: 'user@example.com',
      phone: '13800000000',
      password: 'secret',
    })

    expect((await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'secret' })).status).toBe(200)
    expect((await postJson('/api/auth/login', { identifier: '13800000000', password: 'secret' })).status).toBe(200)
  })

  it('rejects disabled users during login', async () => {
    const registered = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const userId = registered.json().user.id
    appStorage.setUserStatus(userId, 'disabled')

    const response = await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'secret' })

    expect(response.status).toBe(401)
  })

  it('rejects invalid login credentials', async () => {
    const response = await postJson('/api/auth/login', { identifier: 'admin', password: 'wrong' })

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: '账号或密码错误' })
  })

  it('requires login for data APIs', async () => {
    const response = await request('/api/tasks')

    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: '未登录' })
  })

  it('stores and reads a task after login', async () => {
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
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

  it('stores and reads agent conversations after login', async () => {
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const conversation = {
      id: 'conversation-a',
      title: '新对话',
      activeRoundId: null,
      createdAt: 1,
      updatedAt: 2,
      rounds: [],
      messages: [],
    }

    const put = await request('/api/agent-conversations/conversation-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(conversation),
    })
    expect(put.status).toBe(200)

    const get = await request('/api/agent-conversations', { headers: { cookie } })
    expect(get.json()).toEqual([conversation])
  })

  it('isolates stored tasks by login account', async () => {
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const operatorLogin = await postJson('/api/auth/register', { email: 'operator@example.com', password: 'operator-secret' })
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

  it('isolates stored agent conversations by login account', async () => {
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const operatorLogin = await postJson('/api/auth/register', { email: 'operator@example.com', password: 'operator-secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]
    const operatorCookie = operatorLogin.headers['set-cookie'][0]
    const adminConversation = {
      id: 'conversation-a',
      title: 'admin conversation',
      activeRoundId: null,
      createdAt: 1,
      updatedAt: 2,
      rounds: [],
      messages: [],
    }
    const operatorConversation = { ...adminConversation, title: 'operator conversation', updatedAt: 3 }

    await request('/api/agent-conversations/conversation-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(adminConversation),
    })
    await request('/api/agent-conversations/conversation-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: operatorCookie },
      body: JSON.stringify(operatorConversation),
    })

    expect((await request('/api/agent-conversations', { headers: { cookie: adminCookie } })).json()).toEqual([adminConversation])
    expect((await request('/api/agent-conversations', { headers: { cookie: operatorCookie } })).json()).toEqual([operatorConversation])
  })

  it('serves stored images and thumbnails as raw blob responses after login', async () => {
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]

    await request('/api/images/image-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        id: 'image-a',
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        createdAt: 1,
        source: 'upload',
      }),
    })
    await request('/api/thumbnails/image-a', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        id: 'image-a',
        thumbnailDataUrl: 'data:image/webp;base64,dGh1bWI=',
        thumbnailVersion: 2,
      }),
    })

    const image = await request('/api/images/image-a/blob', { headers: { cookie } })
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toBe('image/png')
    expect(image.headers['content-length']).toBe('5')
    expect(image.text()).toBe('hello')

    const thumbnail = await request('/api/thumbnails/image-a/blob', { headers: { cookie } })
    expect(thumbnail.status).toBe(200)
    expect(thumbnail.headers['content-type']).toBe('image/webp')
    expect(thumbnail.headers['content-length']).toBe('5')
    expect(thumbnail.text()).toBe('thumb')
  })

  it('returns 404 for missing raw image content after login', async () => {
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]

    const response = await request('/api/images/missing/blob', { headers: { cookie } })

    expect(response.status).toBe(404)
    expect(response.json()).toEqual({ error: '图片不存在' })
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
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
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

  it('records successful proxy usage with generated image and token counts', async () => {
    const upstream = await createUpstreamServer((req, res) => {
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          data: [{ b64_json: 'aW1hZ2U=' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 42 },
        }))
      })
    })
    await restartApp({
      aiApiBaseUrl: `${upstream.baseUrl}/v1`,
      aiApiKey: 'env-api-key',
    })
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const userId = login.json().user.id

    const response = await request('/api-proxy/v1/images/generations', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-1' }),
    })

    expect(response.status).toBe(200)
    expect(appStorage.getUsageSummary(userId)).toMatchObject({
      calls: 1,
      successes: 1,
      failures: 0,
      generatedImages: 1,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 42,
    })
    await upstream.close()
  })

  it('records streamed proxy usage and request diagnostics', async () => {
    const upstream = await createUpstreamServer((req, res) => {
      req.resume()
      req.on('end', () => {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'x-request-id': 'req_stream_123',
        })
        res.write('event: image_generation.partial_image\n')
        res.write('data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"cGFydGlhbA=="}\n\n')
        res.end('event: image_generation.completed\ndata: {"type":"image_generation.completed","b64_json":"ZmluYWw=","usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":42}}\n\n')
      })
    })
    await restartApp({
      aiApiBaseUrl: `${upstream.baseUrl}/v1`,
      aiApiKey: 'env-api-key',
    })
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const userId = login.json().user.id

    const response = await request('/api-proxy/v1/images/generations', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-1', stream: true }),
    })

    expect(response.status).toBe(200)
    expect(response.text()).toContain('image_generation.completed')
    expect(appStorage.getUsageSummary(userId)).toMatchObject({
      calls: 1,
      successes: 1,
      generatedImages: 1,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 42,
    })
    expect(appStorage.getApiProxyLogs(userId)).toEqual([
      expect.objectContaining({
        endpoint: '/api-proxy/v1/images/generations',
        status: 'ok',
        upstreamStatus: 200,
        upstreamRequestId: 'req_stream_123',
        generatedImages: 1,
        totalTokens: 42,
      }),
    ])
    await upstream.close()
  })

  it('routes legacy default image generation requests through Responses and returns Images API shape', async () => {
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
        res.end(JSON.stringify({
          output: [{
            type: 'image_generation_call',
            result: 'aW1hZ2U=',
            revised_prompt: 'revised prompt',
            size: '2048x2048',
            output_format: 'png',
          }],
          usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 },
        }))
      })
    })
    await restartApp({
      aiApiBaseUrl: `${upstream.baseUrl}/reseller/v1`,
      aiApiKey: 'env-api-key',
    })
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const userId = login.json().user.id
    const response = await fetch(`${baseUrl}/api-proxy/v1/images/generations`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: 'Create a simple product image.',
        size: '2048x2048',
        quality: 'auto',
        output_format: 'png',
        moderation: 'auto',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: [{
        b64_json: 'aW1hZ2U=',
        revised_prompt: 'revised prompt',
        size: '2048x2048',
        output_format: 'png',
      }],
      usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 },
    })
    expect(upstreamRequest).toMatchObject({
      method: 'POST',
      url: '/reseller/v1/responses',
      authorization: 'Bearer env-api-key',
      contentType: 'application/json',
    })
    const upstreamBody = JSON.parse(upstreamRequest.body)
    expect(upstreamBody).toMatchObject({
      model: 'gpt-5.5',
      tool_choice: 'required',
      tools: [{
        type: 'image_generation',
        action: 'generate',
        size: '2048x2048',
        output_format: 'png',
        moderation: 'auto',
      }],
    })
    expect(upstreamBody.input).toContain('Create a simple product image.')
    expect(appStorage.getUsageSummary(userId)).toMatchObject({
      calls: 1,
      successes: 1,
      failures: 0,
      generatedImages: 1,
      promptTokens: 11,
      completionTokens: 22,
      totalTokens: 33,
    })
    await upstream.close()
  })

  it('returns a gateway error and records usage when the AI proxy upstream fails', async () => {
    await restartApp({
      aiApiBaseUrl: 'http://127.0.0.1:1/v1',
      aiApiKey: 'env-api-key',
    })
    const login = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = login.headers['set-cookie'][0]
    const userId = login.json().user.id

    const response = await request('/api-proxy/v1/images/generations', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-2' }),
      timeoutMs: 1000,
    })

    expect(response.status).toBe(502)
    expect(response.json()).toEqual({ error: 'AI API 代理请求失败' })
    expect(appStorage.getUsageSummary(userId)).toMatchObject({
      calls: 1,
      successes: 0,
      failures: 1,
      generatedImages: 0,
    })
  })

  it('allows admin to list users and reset a user password', async () => {
    const userRegister = await postJson('/api/auth/register', { email: 'user@example.com', password: 'old-secret' })
    const userId = userRegister.json().user.id
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]

    const users = await request('/api/admin/users', { headers: { cookie: adminCookie } })
    expect(users.status).toBe(200)
    expect(users.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: userId, email: 'user@example.com', role: 'user' }),
    ]))

    const reset = await postJson(`/api/admin/users/${userId}/reset-password`, { password: 'new-secret' }, adminCookie)
    expect(reset.status).toBe(200)
    expect((await postJson('/api/auth/login', { identifier: 'user@example.com', password: 'new-secret' })).status).toBe(200)
  })

  it('allows admin to update user status', async () => {
    const userRegister = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const userId = userRegister.json().user.id
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })

    const response = await request(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { cookie: adminLogin.headers['set-cookie'][0], 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    })

    expect(response.status).toBe(200)
    expect(appStorage.getUserById(userId)).toMatchObject({ status: 'disabled' })
  })

  it('allows admin to set and clear a user token limit', async () => {
    const userRegister = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const userId = userRegister.json().user.id
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]

    const setLimit = await request(`/api/admin/users/${userId}/token-limit`, {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ tokenLimit: 100 }),
    })
    expect(setLimit.status).toBe(200)
    expect(appStorage.getUserById(userId)).toMatchObject({ tokenLimit: 100 })

    const clearLimit = await request(`/api/admin/users/${userId}/token-limit`, {
      method: 'PATCH',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ tokenLimit: null }),
    })
    expect(clearLimit.status).toBe(200)
    expect(appStorage.getUserById(userId)).toMatchObject({ tokenLimit: null })
  })

  it('prevents ordinary users from admin APIs', async () => {
    const register = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })

    const response = await request('/api/admin/users', { headers: { cookie: register.headers['set-cookie'][0] } })

    expect(response.status).toBe(403)
    expect(response.json()).toEqual({ error: '需要管理员权限' })
  })

  it('allows ordinary users to use their own Amazon planner session APIs', async () => {
    const register = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const cookie = register.headers['set-cookie'][0]
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]
    appStorage.putAmazonPlannerSession(adminLogin.json().user.id, { id: 'admin-session', title: 'Admin plan', updatedAt: 2 })

    const save = await request('/api/amazon-planner-sessions/session-a', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'session-a', title: 'Listing plan', updatedAt: 1 }),
    })
    const list = await request('/api/amazon-planner-sessions', { headers: { cookie } })
    const remove = await request('/api/amazon-planner-sessions/session-a', {
      method: 'DELETE',
      headers: { cookie },
    })
    const adminList = await request('/api/amazon-planner-sessions', { headers: { cookie: adminCookie } })

    expect(save.status).toBe(200)
    expect(list.status).toBe(200)
    expect(list.json()).toEqual([{ id: 'session-a', title: 'Listing plan', updatedAt: 1 }])
    expect(remove.status).toBe(200)
    expect(adminList.json()).toEqual([{ id: 'admin-session', title: 'Admin plan', updatedAt: 2 }])
  })

  it('allows admin to use Amazon planner session APIs', async () => {
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const cookie = adminLogin.headers['set-cookie'][0]
    const session = { id: 'session-a', title: 'Listing plan', updatedAt: 1 }

    const save = await request('/api/amazon-planner-sessions/session-a', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(session),
    })
    const list = await request('/api/amazon-planner-sessions', { headers: { cookie } })

    expect(save.status).toBe(200)
    expect(list.status).toBe(200)
    expect(list.json()).toEqual([session])
  })

  it('allows admin to list analysis tasks across all users', async () => {
    const userRegister = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const userId = userRegister.json().user.id
    const adminLogin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    const adminCookie = adminLogin.headers['set-cookie'][0]
    const adminId = adminLogin.json().user.id
    const userTask = { id: 'task-user', prompt: 'user prompt', createdAt: 20, status: 'done', inputImageIds: [], outputImages: [] }
    const adminTask = { id: 'task-admin', prompt: 'admin prompt', createdAt: 10, status: 'running', inputImageIds: [], outputImages: [] }
    appStorage.putTask(userId, userTask)
    appStorage.putTask(adminId, adminTask)

    const response = await request('/api/admin/tasks', { headers: { cookie: adminCookie } })

    expect(response.status).toBe(200)
    expect(response.json().items).toEqual([
      expect.objectContaining({ userId, email: 'user@example.com', task: userTask }),
      expect.objectContaining({ userId: adminId, email: 'admin', task: adminTask }),
    ])
  })

  it('returns current-user usage and admin all-user usage', async () => {
    const user = await postJson('/api/auth/register', { email: 'user@example.com', password: 'secret' })
    const userId = user.json().user.id
    const admin = await postJson('/api/auth/login', { identifier: 'admin', password: 'secret' })
    appStorage.recordUsageEvent({
      userId,
      eventType: 'ai_proxy',
      status: 'ok',
      endpoint: '/api-proxy/v1/responses',
      model: 'gpt-image-1',
      generatedImages: 1,
      totalTokens: 10,
      createdAt: 10,
    })

    const mine = await request('/api/usage/me', { headers: { cookie: user.headers['set-cookie'][0] } })
    expect(mine.status).toBe(200)
    expect(mine.json().summary).toMatchObject({ calls: 1, generatedImages: 1, totalTokens: 10 })

    const all = await request('/api/admin/usage', { headers: { cookie: admin.headers['set-cookie'][0] } })
    expect(all.status).toBe(200)
    expect(all.json().summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId, email: 'user@example.com', calls: 1 }),
    ]))
  })

  it('blocks proxied AI requests when the user reaches the token limit', async () => {
    let upstreamCalls = 0
    const upstream = await createUpstreamServer((req, res) => {
      upstreamCalls += 1
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ usage: { total_tokens: 1 } }))
      })
    })
    await restartApp({
      aiApiBaseUrl: `${upstream.baseUrl}/v1`,
      aiApiKey: 'env-api-key',
    })
    const userRegister = await postJson('/api/auth/register', { email: 'limited@example.com', password: 'secret' })
    const userId = userRegister.json().user.id
    const userCookie = userRegister.headers['set-cookie'][0]
    appStorage.setUserTokenLimit(userId, 10)
    appStorage.recordUsageEvent({
      userId,
      eventType: 'ai_proxy',
      status: 'ok',
      endpoint: '/api-proxy/v1/responses',
      model: 'gpt-image-1',
      generatedImages: 1,
      totalTokens: 10,
      createdAt: 10,
    })

    const response = await request('/api-proxy/v1/responses', {
      method: 'POST',
      headers: {
        cookie: userCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-1' }),
    })

    expect(response.status).toBe(429)
    expect(response.json()).toEqual({ error: 'Token 使用量已达到上限' })
    expect(upstreamCalls).toBe(0)
    expect(appStorage.getUsageSummary(userId)).toMatchObject({
      failures: 1,
      totalTokens: 10,
    })
    await upstream.close()
  })
})
