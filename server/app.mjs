import { Readable } from 'node:stream'
import { createClearSessionCookie, createSessionCookie, getRequestSession, isAdminLogin } from './auth.mjs'

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

async function handleAuth(req, res, config, pathname) {
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const session = getRequestSession(config, req)
    sendOk(res, session ? { authenticated: true, username: session.username } : { authenticated: false })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const credentials = await readJson(req)
    if (!isAdminLogin(config, credentials)) {
      sendJson(res, 401, { error: '账号或密码错误' })
      return true
    }

    sendOk(res, { authenticated: true, username: config.adminUsername }, {
      'set-cookie': createSessionCookie(config, config.adminUsername),
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

async function handleApiProxy(req, res, config, pathname, search) {
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

  if (!getRequestSession(config, req)) {
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

  res.writeHead(response.status, createResponseHeaders(response))
  if (!response.body) {
    res.end()
    return true
  }
  Readable.fromWeb(response.body).pipe(res)
  return true
}

async function handleData(req, res, storage, pathname) {
  if (req.method === 'GET' && pathname === '/api/tasks') {
    sendOk(res, storage.getAllTasks())
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/tasks') {
    storage.clearTasks()
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/tasks/')) {
    const id = routeId(pathname, '/api/tasks/')
    if (req.method === 'PUT') {
      const task = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putTask(task) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteTask(id)
      sendOk(res)
      return true
    }
  }

  if (req.method === 'GET' && pathname === '/api/images/ids') {
    sendOk(res, storage.getAllImageIds())
    return true
  }
  if (req.method === 'GET' && pathname === '/api/images') {
    sendOk(res, storage.getAllImages())
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/images') {
    storage.clearImages()
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/images/')) {
    const id = routeId(pathname, '/api/images/')
    if (req.method === 'GET') {
      sendOk(res, storage.getImage(id) ?? null)
      return true
    }
    if (req.method === 'PUT') {
      const image = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putImage(image) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteImage(id)
      sendOk(res)
      return true
    }
  }

  if (pathname.startsWith('/api/thumbnails/')) {
    const id = routeId(pathname, '/api/thumbnails/')
    if (req.method === 'GET') {
      sendOk(res, storage.getStoredImageThumbnail(id) ?? null)
      return true
    }
    if (req.method === 'PUT') {
      const thumbnail = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putImageThumbnail(thumbnail) })
      return true
    }
  }

  if (req.method === 'GET' && pathname === '/api/amazon-planner-sessions') {
    sendOk(res, storage.getAllAmazonPlannerSessions())
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/amazon-planner-sessions') {
    storage.clearAmazonPlannerSessions()
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/amazon-planner-sessions/')) {
    const id = routeId(pathname, '/api/amazon-planner-sessions/')
    if (req.method === 'PUT') {
      const session = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putAmazonPlannerSession(session) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteAmazonPlannerSession(id)
      sendOk(res)
      return true
    }
  }

  return false
}

export function createRequestHandler({ config, storage }) {
  return (req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = url.pathname

      if (await handleAuth(req, res, config, pathname)) return
      if (await handleApiProxy(req, res, config, pathname, url.search)) return

      if (pathname.startsWith('/api/')) {
        if (!getRequestSession(config, req)) {
          sendJson(res, 401, { error: '未登录' })
          return
        }
        if (await handleData(req, res, storage, pathname)) return
      }

      sendJson(res, 404, { error: 'Not found' })
    })()
  }
}
