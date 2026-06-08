import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function readDotEnvValue(name) {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return undefined

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    if (key === name) return trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

const apiPort = readDotEnvValue('API_PORT') ?? process.env.API_PORT ?? '5174'
const env = {
  ...process.env,
  API_PORT: apiPort,
  PORT: process.env.PORT ?? apiPort,
}
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const api = spawn(process.execPath, ['server/server.mjs'], {
  stdio: 'inherit',
  env,
})
const vite = spawn(npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  env,
})

let closing = false

function closeAll(code) {
  if (closing) return
  closing = true
  api.kill()
  vite.kill()
  process.exit(code)
}

api.on('exit', (code) => closeAll(code ?? 0))
vite.on('exit', (code) => closeAll(code ?? 0))
process.on('SIGINT', () => closeAll(0))
process.on('SIGTERM', () => closeAll(0))
