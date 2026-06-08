import { Readable } from 'node:stream'
import { Agent } from 'undici'
import { createClearSessionCookie, createSessionCookie, getRequestSession, hashPassword, verifyPassword } from './auth.mjs'

const API_PROXY_PATH_PATTERN = /^\/api-proxy\/((v1\/)?(images\/generations|images\/edits|responses|chat\/completions))$/
const AI_PROXY_UPSTREAM_TIMEOUT_MS = 15 * 60 * 1000
const LEGACY_DEFAULT_IMAGES_MODEL = 'gpt-image-2'
const RESPONSES_IMAGE_MODEL = 'gpt-5.5'
const PROMPT_REWRITE_GUARD_PREFIX = 'Use the following text as the complete prompt. Do not rewrite it:'
const RAW_INLINE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const aiProxyDispatcher = new Agent({
  headersTimeout: AI_PROXY_UPSTREAM_TIMEOUT_MS,
  bodyTimeout: AI_PROXY_UPSTREAM_TIMEOUT_MS,
})

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

function routeBlobId(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length, -'/blob'.length))
}

function sendOk(res, value = { ok: true }, headers = {}) {
  sendJson(res, 200, value, headers)
}

function sendImageContent(res, content) {
  if (!RAW_INLINE_IMAGE_MIME_TYPES.has(content.mimeType)) {
    sendJson(res, 415, { error: '不支持的图片类型' })
    return
  }
  res.writeHead(200, {
    'content-type': content.mimeType,
    'x-content-type-options': 'nosniff',
    'content-length': String(content.bytes.byteLength),
    'cache-control': 'private, max-age=86400',
  })
  res.end(content.bytes)
}

function isBrowserNavigationRequest(req) {
  const mode = req.headers['sec-fetch-mode']
  return mode === 'navigate' || (Array.isArray(mode) && mode.includes('navigate'))
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    tokenLimit: user.tokenLimit,
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

function createEmptyUsageMetrics() {
  return {
    generatedImages: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  }
}

function addUsageMetrics(target, source) {
  target.generatedImages += source.generatedImages
  target.promptTokens += source.promptTokens
  target.completionTokens += source.completionTokens
  target.totalTokens += source.totalTokens
}

function getUsageMetricsFromPayload(body) {
  const usage = body.usage ?? {}
  const responseUsage = body.response?.usage ?? {}
  const effectiveUsage = Object.keys(usage).length ? usage : responseUsage
  const output = Array.isArray(body.output)
    ? body.output
    : Array.isArray(body.response?.output)
      ? body.response.output
      : []
  const outputImages = output.filter((item) => item?.type === 'image_generation_call' && item?.result).length
  const dataImages = Array.isArray(body.data) ? body.data.filter((item) => item?.b64_json || item?.url).length : 0
  const completedImage = (body.type === 'image_generation.completed' || body.type === 'image_edit.completed') && body.b64_json ? 1 : 0
  return {
    generatedImages: dataImages + outputImages + completedImage,
    promptTokens: Number(effectiveUsage.prompt_tokens ?? effectiveUsage.input_tokens ?? 0),
    completionTokens: Number(effectiveUsage.completion_tokens ?? effectiveUsage.output_tokens ?? 0),
    totalTokens: Number(effectiveUsage.total_tokens ?? 0),
  }
}

function getUsageMetricsFromJson(text) {
  return getUsageMetricsFromPayload(JSON.parse(text))
}

function getErrorDetailsFromPayload(body) {
  const error = body.error
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    return {
      errorType: typeof error.type === 'string' ? error.type : '',
      errorCode: typeof error.code === 'string' ? error.code : '',
      errorMessage: typeof error.message === 'string' ? error.message : '',
    }
  }
  if (typeof error === 'string') return { errorType: '', errorCode: '', errorMessage: error }
  return { errorType: '', errorCode: '', errorMessage: '' }
}

function getErrorDetailsFromJson(text) {
  return getErrorDetailsFromPayload(JSON.parse(text))
}

function getUpstreamRequestId(response) {
  return response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? response.headers.get('openai-request-id') ?? ''
}

async function readRequestBuffer(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function getHeaderValue(headers, name) {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value ?? ''
}

function isLegacyDefaultImageProxyPath(pathname) {
  return /\/images\/generations$/.test(pathname)
}

function createLegacyResponsesInput(prompt, inputImages) {
  const text = `${PROMPT_REWRITE_GUARD_PREFIX}\n${prompt}`
  if (!inputImages.length) return text

  return [{
    role: 'user',
    content: [
      { type: 'input_text', text },
      ...inputImages.map((imageUrl) => ({
        type: 'input_image',
        image_url: imageUrl,
      })),
    ],
  }]
}

async function fileToDataUrl(file) {
  const bytes = Buffer.from(await file.arrayBuffer())
  return `data:${file.type || 'image/png'};base64,${bytes.toString('base64')}`
}

function getFormText(form, key, fallback = '') {
  const value = form.get(key)
  return typeof value === 'string' ? value : fallback
}

async function createLegacyDefaultImageResponsesBody(pathname, headers, requestBody) {
  if (!isLegacyDefaultImageProxyPath(pathname)) return null

  const contentType = getHeaderValue(headers, 'content-type')
  const isEdit = /\/images\/edits$/.test(pathname)
  let fields
  let inputImages = []
  let maskDataUrl

  if (contentType.includes('application/json')) {
    fields = JSON.parse(requestBody.toString('utf8') || '{}')
  } else if (contentType.includes('multipart/form-data')) {
    const request = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: requestBody,
    })
    const form = await request.formData()
    fields = {
      model: getFormText(form, 'model'),
      prompt: getFormText(form, 'prompt'),
      size: getFormText(form, 'size', '1024x1024'),
      quality: getFormText(form, 'quality', 'auto'),
      output_format: getFormText(form, 'output_format', 'png'),
      moderation: getFormText(form, 'moderation', 'auto'),
      output_compression: getFormText(form, 'output_compression'),
    }
    const imageFiles = [...form.getAll('image[]'), ...form.getAll('image')]
      .filter((value) => value && typeof value.arrayBuffer === 'function')
    inputImages = await Promise.all(imageFiles.map(fileToDataUrl))
    const mask = form.get('mask')
    if (mask && typeof mask.arrayBuffer === 'function') {
      maskDataUrl = await fileToDataUrl(mask)
    }
  } else {
    return null
  }

  if (fields.model !== LEGACY_DEFAULT_IMAGES_MODEL) return null

  const outputFormat = fields.output_format || 'png'
  const tool = {
    type: 'image_generation',
    action: isEdit ? 'edit' : 'generate',
    size: fields.size || '1024x1024',
    output_format: outputFormat,
    moderation: fields.moderation || 'auto',
  }
  if (fields.quality) tool.quality = fields.quality
  if (outputFormat !== 'png' && fields.output_compression !== undefined && fields.output_compression !== '') {
    tool.output_compression = Number(fields.output_compression)
  }
  if (maskDataUrl) {
    tool.input_image_mask = { image_url: maskDataUrl }
  }

  return JSON.stringify({
    model: RESPONSES_IMAGE_MODEL,
    input: createLegacyResponsesInput(fields.prompt || '', inputImages),
    tools: [tool],
    tool_choice: 'required',
  })
}

function convertResponsesPayloadToImagesPayload(payload) {
  const output = Array.isArray(payload.output) ? payload.output : []
  const data = []
  for (const item of output) {
    if (item?.type !== 'image_generation_call') continue
    const result = item.result
    const b64Json = typeof result === 'string'
      ? result
      : typeof result?.b64_json === 'string'
        ? result.b64_json
        : typeof result?.image === 'string'
          ? result.image
          : typeof result?.data === 'string'
            ? result.data
            : ''
    if (!b64Json) continue
    data.push({
      b64_json: b64Json,
      revised_prompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined,
      size: typeof item.size === 'string' ? item.size : undefined,
      quality: typeof item.quality === 'string' ? item.quality : undefined,
      output_format: typeof item.output_format === 'string' ? item.output_format : undefined,
      output_compression: typeof item.output_compression === 'number' ? item.output_compression : undefined,
      moderation: typeof item.moderation === 'string' ? item.moderation : undefined,
    })
  }
  return {
    data,
    ...(payload.usage ? { usage: payload.usage } : {}),
  }
}

function convertResponsesJsonToImagesJson(text) {
  return JSON.stringify(convertResponsesPayloadToImagesPayload(JSON.parse(text)))
}

function recordApiProxyAttempt(storage, event) {
  storage.recordUsageEvent({
    userId: event.userId,
    eventType: event.eventType ?? 'ai_proxy',
    status: event.status,
    endpoint: event.endpoint,
    model: '',
    generatedImages: event.generatedImages ?? 0,
    promptTokens: event.promptTokens ?? 0,
    completionTokens: event.completionTokens ?? 0,
    totalTokens: event.totalTokens ?? 0,
    createdAt: event.createdAt,
  })
  storage.recordApiProxyLog({
    userId: event.userId,
    endpoint: event.endpoint,
    status: event.status,
    upstreamStatus: event.upstreamStatus ?? null,
    upstreamRequestId: event.upstreamRequestId ?? '',
    contentType: event.contentType ?? '',
    errorType: event.errorType ?? '',
    errorCode: event.errorCode ?? '',
    errorMessage: event.errorMessage ?? '',
    generatedImages: event.generatedImages ?? 0,
    promptTokens: event.promptTokens ?? 0,
    completionTokens: event.completionTokens ?? 0,
    totalTokens: event.totalTokens ?? 0,
    durationMs: event.durationMs ?? 0,
    createdAt: event.createdAt,
  })
}

function parseServerSentEventData(block) {
  const dataLines = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue
    dataLines.push(line.slice(5).replace(/^ /, ''))
  }

  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  return data
}

async function pipeEventStreamAndCollectMetrics(body, res) {
  const metrics = createEmptyUsageMetrics()
  const decoder = new TextDecoder()
  let buffer = ''

  const processBlock = (block) => {
    const data = parseServerSentEventData(block)
    if (!data) return
    addUsageMetrics(metrics, getUsageMetricsFromPayload(JSON.parse(data)))
  }

  for await (const chunk of Readable.fromWeb(body)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    buffer += decoder.decode(bytes, { stream: true })

    let separatorIndex = buffer.search(/\r?\n\r?\n/)
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex)
      const separator = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n'
      buffer = buffer.slice(separatorIndex + separator.length)
      processBlock(block)
      separatorIndex = buffer.search(/\r?\n\r?\n/)
    }

    res.write(bytes)
  }

  buffer += decoder.decode()
  if (buffer.trim()) processBlock(buffer)
  res.end()
  return metrics
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
  const startedAt = Date.now()

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

  const usageSummary = storage.getUsageSummary(session.userId)
  if (usageSummary.tokenLimit !== null && usageSummary.totalTokens >= usageSummary.tokenLimit) {
    recordApiProxyAttempt(storage, {
      userId: session.userId,
      eventType: 'ai_proxy_quota',
      status: 'quota_limited',
      endpoint: pathname,
      generatedImages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      errorMessage: 'Token 使用量已达到上限',
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    })
    sendJson(res, 429, { error: 'Token 使用量已达到上限' })
    return true
  }

  const requestBody = await readRequestBuffer(req)
  const legacyResponsesBody = await createLegacyDefaultImageResponsesBody(pathname, req.headers, requestBody)
  const upstreamPathname = legacyResponsesBody ? pathname.replace(/images\/(generations|edits)$/, 'responses') : pathname
  const upstreamSearch = legacyResponsesBody ? '' : search
  const upstreamHeaders = createProxyHeaders(req, config.aiApiKey)
  const upstreamBody = legacyResponsesBody ? Buffer.from(legacyResponsesBody) : requestBody
  if (legacyResponsesBody) {
    upstreamHeaders.set('content-type', 'application/json')
  }

  let response
  try {
    response = await fetch(buildAiProxyUrl(config.aiApiBaseUrl, upstreamPathname, upstreamSearch), {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamBody,
      duplex: 'half',
      dispatcher: aiProxyDispatcher,
    })
  } catch (err) {
    recordApiProxyAttempt(storage, {
      userId: session.userId,
      eventType: 'ai_proxy',
      status: 'error',
      endpoint: pathname,
      generatedImages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      errorMessage: err instanceof Error ? err.message : 'AI API 代理请求失败',
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    })
    sendJson(res, 502, { error: 'AI API 代理请求失败' })
    return true
  }

  const responseHeaders = createResponseHeaders(response)
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const upstreamText = await response.text()
    const text = legacyResponsesBody && response.status >= 200 && response.status < 300
      ? convertResponsesJsonToImagesJson(upstreamText)
      : upstreamText
    const metrics = getUsageMetricsFromJson(text)
    const errorDetails = response.status >= 200 && response.status < 300 ? {} : getErrorDetailsFromJson(text)
    recordApiProxyAttempt(storage, {
      userId: session.userId,
      eventType: 'ai_proxy',
      status: response.status >= 200 && response.status < 300 ? 'ok' : 'error',
      endpoint: pathname,
      upstreamStatus: response.status,
      upstreamRequestId: getUpstreamRequestId(response),
      contentType,
      ...metrics,
      ...errorDetails,
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    })
    res.writeHead(response.status, responseHeaders)
    res.end(text)
    return true
  }

  res.writeHead(response.status, responseHeaders)
  if (!response.body) {
    recordApiProxyAttempt(storage, {
      userId: session.userId,
      eventType: 'ai_proxy',
      status: response.status >= 200 && response.status < 300 ? 'ok' : 'error',
      endpoint: pathname,
      upstreamStatus: response.status,
      upstreamRequestId: getUpstreamRequestId(response),
      contentType,
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    })
    res.end()
    return true
  }
  if (contentType.includes('text/event-stream')) {
    const metrics = await pipeEventStreamAndCollectMetrics(response.body, res)
    recordApiProxyAttempt(storage, {
      userId: session.userId,
      eventType: 'ai_proxy',
      status: response.status >= 200 && response.status < 300 ? 'ok' : 'error',
      endpoint: pathname,
      upstreamStatus: response.status,
      upstreamRequestId: getUpstreamRequestId(response),
      contentType,
      ...metrics,
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    })
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

  if (req.method === 'GET' && pathname === '/api/agent-conversations') {
    sendOk(res, storage.getAllAgentConversations(owner))
    return true
  }
  if (req.method === 'DELETE' && pathname === '/api/agent-conversations') {
    storage.clearAgentConversations(owner)
    sendOk(res)
    return true
  }
  if (pathname.startsWith('/api/agent-conversations/')) {
    const id = routeId(pathname, '/api/agent-conversations/')
    if (req.method === 'PUT') {
      const conversation = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putAgentConversation(owner, conversation) })
      return true
    }
    if (req.method === 'DELETE') {
      storage.deleteAgentConversation(owner, id)
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
  if (req.method === 'GET' && pathname.startsWith('/api/images/') && pathname.endsWith('/blob')) {
    const id = routeBlobId(pathname, '/api/images/')
    const content = storage.getImageContent(owner, id)
    if (!content) {
      sendJson(res, 404, { error: '图片不存在' })
      return true
    }
    sendImageContent(res, content)
    return true
  }
  if (pathname.startsWith('/api/images/')) {
    const id = routeId(pathname, '/api/images/')
    if (req.method === 'GET') {
      if (isBrowserNavigationRequest(req)) {
        const content = storage.getImageContent(owner, id)
        if (!content) {
          sendJson(res, 404, { error: '图片不存在' })
          return true
        }
        sendImageContent(res, content)
        return true
      }
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

  if (req.method === 'GET' && pathname.startsWith('/api/thumbnails/') && pathname.endsWith('/blob')) {
    const id = routeBlobId(pathname, '/api/thumbnails/')
    const content = storage.getImageThumbnailContent(owner, id)
    if (!content) {
      sendJson(res, 404, { error: '缩略图不存在' })
      return true
    }
    sendImageContent(res, content)
    return true
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

  return false
}

function requireAdmin(res, session) {
  if (session.role !== 'admin') {
    sendJson(res, 403, { error: '需要管理员权限' })
    return false
  }
  return true
}

async function handleAmazonPlannerSessions(req, res, storage, pathname, session) {
  if (pathname !== '/api/amazon-planner-sessions' && !pathname.startsWith('/api/amazon-planner-sessions/')) return false

  const owner = session.userId
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
      const sessionRecord = { ...(await readJson(req)), id }
      sendOk(res, { id: storage.putAmazonPlannerSession(owner, sessionRecord) })
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

async function handleUsageAndAdmin(req, res, storage, pathname, session) {
  if (req.method === 'GET' && pathname === '/api/usage/me') {
    sendOk(res, {
      summary: storage.getUsageSummary(session.userId),
      events: storage.getUsageEvents(session.userId),
      apiProxyLogs: storage.getApiProxyLogs(session.userId),
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

  if (req.method === 'GET' && pathname === '/api/admin/tasks') {
    sendOk(res, {
      items: storage.getAllUserTasks(),
    })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/admin/usage') {
    sendOk(res, {
      summaries: storage.getAllUsageSummaries(),
      events: storage.getAllUsageEvents(),
      apiProxyLogs: storage.getAllApiProxyLogs(),
    })
    return true
  }

  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/token-limit') && req.method === 'PATCH') {
    const id = pathname.slice('/api/admin/users/'.length, -'/token-limit'.length)
    const body = await readJson(req)
    storage.setUserTokenLimit(id, body.tokenLimit === null ? null : Number(body.tokenLimit))
    sendOk(res, { user: publicUser(storage.getUserById(id)) })
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
        if (await handleAmazonPlannerSessions(req, res, storage, pathname, session)) return
        if (await handleData(req, res, storage, pathname, session)) return
      }

      sendJson(res, 404, { error: 'Not found' })
    })()
  }
}
