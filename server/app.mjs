import { createClearSessionCookie, createSessionCookie, getRequestSession, isAdminLogin } from './auth.mjs'

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
