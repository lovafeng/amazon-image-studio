import { Readable } from 'node:stream'
import { createClearSessionCookie, createSessionCookie, getRequestSession, hashPassword, verifyPassword } from './auth.mjs'

const API_PROXY_PATH_PATTERN = /^\/api-proxy\/((v1\/)?(images\/generations|images\/edits|responses|chat\/completions))$/

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function routeId(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length))
}

function sendOk(res, value = { ok: true }, headers = {}) {
  sendJson(res, 200, value, headers)
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

function buildAiProxyUrl(baseUrl, pathname, search) {
  const url = new URL(baseUrl)
  const endpoint = pathname.replace(/^\/api-proxy\/+/, '')
  const basePath = url.pathname.replace(/\/+$/, '')
  const endpointPath = basePath.endsWith('/v1') && endpoint.startsWith('v1/') ? endpoint.slice(3) : endpoint
  url.pathname = `${basePath}/${endpointPath}`.replace(/\/{2,}/g, '/')
  url.search = search
  return url
}

function createProxyHeaders(req, apiKey) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (['authorization', 'connection', 'content-length', 'cookie', 'host', 'transfer-encoding'].includes(key)) continue
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '))
    } else if (value) {
      headers.set(key, value)
    }
  }
  headers.set('authorization', `Bearer ${apiKey}`)
  return headers
}

function createResponseHeaders(response) {
  const headers = Object.fromEntries(response.headers.entries())
  delete headers['content-encoding']
  delete headers['content-length']
  delete headers['transfer-encoding']
  return headers
}

function getUsageMetricsFromJson(text) {
  const body = JSON.parse(text)
  const usage = body.usage ?? {}
  const outputImages = Array.isArray(body.output)
    ? body.output.filter((item) => item?.type === 'image_generation_call' && item?.result).length
    : 0
  const dataImages = Array.isArray(body.data) ? body.data.filter((item) => item?.b64_json || item?.url).length : 0
  return {
    generatedImages: dataImages + outputImages,
    promptTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
  }
}

async function handleAuth(req, res, config, storage, pathname) {
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const session = getRequestSession(config, storage, req)
    const user = session ? storage.getUserById(session.userId) : null
    sendOk(res, user ? { authenticated: true, user: publicUser(user) } : { authenticated: false })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJson(req)
    const email = String(body.email ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const password = String(body.password ?? '')
    if (!email && !phone) {
      sendJson(res, 400, { error: '请填写邮箱或电话' })
      return true
    }
    if ((email && storage.findUserByIdentifier(email)) || (phone && storage.findUserByIdentifier(phone))) {
      sendJson(res, 409, { error: '邮箱或电话已注册' })
      return true
    }

    const user = storage.createUser({
      email,
      phone,
      passwordHash: hashPassword(password),
      role: 'user',
      status: 'active',
      createdAt: Date.now(),
    })
    sendOk(res, { authenticated: true, user: publicUser(user) }, {
      'set-cookie': createSessionCookie(config, user),
    })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const credentials = await readJson(req)
    const identifier = String(credentials.identifier ?? credentials.username ?? '').trim()
    const user = storage.findUserByIdentifier(identifier)
    if (!user || user.status !== 'active' || !verifyPassword(String(credentials.password ?? ''), user.passwordHash)) {
      sendJson(res, 401, { error: '账号或密码错误' })
      return true
    }

    storage.touchUserLogin(user.id, Date.now())
    const nextUser = storage.getUserById(user.id)
    sendOk(res, { authenticated: true, user: publicUser(nextUser) }, {
      'set-cookie': createSessionCookie(config, nextUser),
    })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    sendOk(res, { authenticated: false }, {
      'set-cookie': createClearSessionCookie(),
    })
    return true
  }

  return false
}

async function handleApiProxy(req, res, config, storage, pathname, search) {
  if (!pathname.startsWith('/api-proxy/')) return false

  if (!API_PROXY_PATH_PATTERN.test(pathname)) {
    sendJson(res, 403, { error: 'Forbidden: API Proxy path restricted' })
    return true
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return true
  }

  const session = getRequestSession(config, storage, req)
  if (!session) {
    sendJson(res, 401, { error: '未登录' })
    return true
  }

  if (!config.aiApiBaseUrl || !config.aiApiKey) {
    sendJson(res, 502, { error: 'AI API 代理未配置' })
    return true
  }

  const response = await fetch(buildAiProxyUrl(config.aiApiBaseUrl, pathname, search), {
    method: 'POST',
    headers: createProxyHeaders(req, config.aiApiKey),
    body: req,
    duplex: 'half',
  })

  const responseHeaders = createResponseHeaders(response)
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const text = await response.text()
    const metrics = getUsageMetricsFromJson(text)
    storage.recordUsageEvent({
      userId: session.userId,
      eventType: 'ai_proxy',
      status: response.status >= 200 && response.status < 300 ? 'ok' : 'error',
      endpoint: pathname,
      model: '',
      ...metrics,
      createdAt: Date.now(),
    })
    res.writeHead(response.status, responseHeaders)
    res.end(text)
    return true
  }

  res.writeHead(response.status, responseHeaders)
  if (!response.body) {
    res.end()
    return true
  }
  Readable.fromWeb(response.body).pipe(res)
  return true
}

async function handleData(req, res, storage, pathname, session) {
  const owner = session.userId
  if (req.method === 'GET' && pathname === '/api/tasks') {
    sendOk(res, storage.getAllTasks(owner))
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/tasks') {
    storage.clearTasks(owner)
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/tasks/')) {
    const id = routeId(pathname, '/api/tasks/')
    if (req.method === 'PUT') {
      const task = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putTask(owner, task) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteTask(owner, id)
      sendOk(res)
      return true
    }
  }

  if (req.method === 'GET' && pathname === '/api/images/ids') {
    sendOk(res, storage.getAllImageIds(owner))
    return true
  }
  if (req.method === 'GET' && pathname === '/api/images') {
    sendOk(res, storage.getAllImages(owner))
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/images') {
    storage.clearImages(owner)
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/images/')) {
    const id = routeId(pathname, '/api/images/')
    if (req.method === 'GET') {
      sendOk(res, storage.getImage(owner, id) ?? null)
      return true
    }
    if (req.method === 'PUT') {
      const image = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putImage(owner, image) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteImage(owner, id)
      sendOk(res)
      return true
    }
  }

  if (pathname.startsWith('/api/thumbnails/')) {
    const id = routeId(pathname, '/api/thumbnails/')
    if (req.method === 'GET') {
      sendOk(res, storage.getStoredImageThumbnail(owner, id) ?? null)
      return true
    }
    if (req.method === 'PUT') {
      const thumbnail = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putImageThumbnail(owner, thumbnail) })
      return true
    }
  }

  if (req.method === 'GET' && pathname === '/api/amazon-planner-sessions') {
    sendOk(res, storage.getAllAmazonPlannerSessions(owner))
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/amazon-planner-sessions') {
    storage.clearAmazonPlannerSessions(owner)
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/amazon-planner-sessions/')) {
    const id = routeId(pathname, '/api/amazon-planner-sessions/')
    if (req.method === 'PUT') {
      const session = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putAmazonPlannerSession(owner, session) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteAmazonPlannerSession(owner, id)
      sendOk(res)
      return true
    }
  }

  return false
}

function requireAdmin(res, session) {
  if (session.role !== 'admin') {
    sendJson(res, 403, { error: '需要管理员权限' })
    return false
  }
  return true
}

async function handleUsageAndAdmin(req, res, storage, pathname, session) {
  if (req.method === 'GET' && pathname === '/api/usage/me') {
    sendOk(res, {
      summary: storage.getUsageSummary(session.userId),
      events: storage.getUsageEvents(session.userId),
    })
    return true
  }

  if (!pathname.startsWith('/api/admin/')) return false
  if (!requireAdmin(res, session)) return true

  if (req.method === 'GET' && pathname === '/api/admin/summary') {
    const users = storage.listUsers()
    const summaries = storage.getAllUsageSummaries()
    sendOk(res, {
      users: users.length,
      activeUsers: users.filter((user) => user.status === 'active').length,
      calls: summaries.reduce((sum, item) => sum + item.calls, 0),
      successes: summaries.reduce((sum, item) => sum + item.successes, 0),
      failures: summaries.reduce((sum, item) => sum + item.failures, 0),
      generatedImages: summaries.reduce((sum, item) => sum + item.generatedImages, 0),
      totalTokens: summaries.reduce((sum, item) => sum + item.totalTokens, 0),
    })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    sendOk(res, {
      items: storage.listUsers().map((user) => ({
        ...publicUser(user),
        usage: storage.getUsageSummary(user.id),
      })),
    })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/admin/usage') {
    sendOk(res, {
      summaries: storage.getAllUsageSummaries(),
      events: storage.getAllUsageEvents(),
    })
    return true
  }

  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/status') && req.method === 'PATCH') {
    const id = pathname.slice('/api/admin/users/'.length, -'/status'.length)
    const body = await readJson(req)
    storage.setUserStatus(id, String(body.status))
    sendOk(res, { user: publicUser(storage.getUserById(id)) })
    return true
  }

  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/reset-password') && req.method === 'POST') {
    const id = pathname.slice('/api/admin/users/'.length, -'/reset-password'.length)
    const body = await readJson(req)
    storage.setUserPasswordHash(id, hashPassword(String(body.password ?? '')))
    sendOk(res)
    return true
  }

  return false
}

export function createRequestHandler({ config, storage }) {
  return (req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = url.pathname

      if (await handleAuth(req, res, config, storage, pathname)) return
      if (await handleApiProxy(req, res, config, storage, pathname, url.search)) return

      if (pathname.startsWith('/api/')) {
        const session = getRequestSession(config, storage, req)
        if (!session) {
          sendJson(res, 401, { error: '未登录' })
          return
        }
        if (await handleUsageAndAdmin(req, res, storage, pathname, session)) return
        if (await handleData(req, res, storage, pathname, session)) return
      }

      sendJson(res, 404, { error: 'Not found' })
    })()
  }
}
