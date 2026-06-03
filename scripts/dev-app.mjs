import { spawn } from 'node:child_process'

const apiPort = process.env.API_PORT ?? '5174'
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
