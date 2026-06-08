import { beforeEach, vi } from 'vitest'

function stubDefaultRuntimeEnv() {
  vi.stubEnv('VITE_DEFAULT_API_URL', '')
  vi.stubEnv('VITE_API_PROXY_AVAILABLE', '')
  vi.stubEnv('VITE_API_PROXY_LOCKED', '')
  vi.stubEnv('VITE_API_PROXY_SERVER_KEY_AVAILABLE', '')
}

stubDefaultRuntimeEnv()

beforeEach(() => {
  stubDefaultRuntimeEnv()
})
