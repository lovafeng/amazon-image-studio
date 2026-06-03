import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequestHandler } from './app.mjs'
import { createStorage } from './database.mjs'

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function loadDotEnv() {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    process.env[key] ??= value
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

function contentType(filePath) {
  const ext = extname(filePath)
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.webmanifest') return 'application/manifest+json; charset=utf-8'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function serveStatic(req, res) {
  const staticDir = join(projectRoot, 'dist')
  if (!existsSync(staticDir)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
  const requestedFile = join(staticDir, requestedPath)
  const filePath = existsSync(requestedFile) && statSync(requestedFile).isFile()
    ? requestedFile
    : join(staticDir, 'index.html')

  res.writeHead(200, { 'content-type': contentType(filePath) })
  createReadStream(filePath).pipe(res)
}

loadDotEnv()

const config = {
  adminUsername: requiredEnv('ADMIN_USERNAME'),
  adminPassword: requiredEnv('ADMIN_PASSWORD'),
  sessionSecret: requiredEnv('SESSION_SECRET'),
}
const sqlitePath = process.env.SQLITE_PATH ?? join(projectRoot, 'data', 'app.sqlite')
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 5174)
const storage = createStorage(sqlitePath)
const apiHandler = createRequestHandler({ config, storage })

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    apiHandler(req, res)
    return
  }
  serveStatic(req, res)
}).listen(port, () => {
  console.log(`Amazon Image Studio server listening on http://127.0.0.1:${port}`)
})
