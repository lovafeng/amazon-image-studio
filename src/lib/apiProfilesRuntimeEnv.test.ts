import { afterEach, describe, expect, it, vi } from 'vitest'

const IMAGE_PROFILE = {
  id: 'default-openai',
  name: '生图',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-image-2',
  timeout: 600,
  apiMode: 'images',
  codexCli: false,
  apiProxy: false,
  streamImages: false,
  streamPartialImages: 1,
}

const PLANNER_PROFILE = {
  id: 'default-openai-planner',
  name: 'AI策划',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-5.5',
  timeout: 600,
  apiMode: 'responses',
  codexCli: false,
  apiProxy: false,
  streamImages: false,
  streamPartialImages: 1,
}

describe('api profile runtime env defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fills untouched default image and planner profiles from server proxy env', async () => {
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://done.amzdataincn.com/reseller/v1')
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')
    vi.stubEnv('VITE_API_PROXY_LOCKED', 'true')
    vi.stubEnv('VITE_API_PROXY_SERVER_KEY_AVAILABLE', 'true')

    const { normalizeSettings } = await import('./apiProfiles')

    const settings = normalizeSettings({
      profiles: [IMAGE_PROFILE, PLANNER_PROFILE],
      activeProfileId: IMAGE_PROFILE.id,
      amazonPlannerProfileId: PLANNER_PROFILE.id,
    })

    expect(settings.profiles).toMatchObject([
      {
        id: IMAGE_PROFILE.id,
        baseUrl: 'https://done.amzdataincn.com/reseller/v1',
        apiKey: 'server-env',
        apiProxy: true,
      },
      {
        id: PLANNER_PROFILE.id,
        baseUrl: 'https://done.amzdataincn.com/reseller/v1',
        apiKey: 'server-env',
        apiProxy: true,
      },
    ])
  })

  it('overrides stale built-in image and planner browser config when server key is available', async () => {
    vi.stubEnv('VITE_DEFAULT_API_URL', 'https://done.amzdataincn.com/reseller/v1')
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')
    vi.stubEnv('VITE_API_PROXY_LOCKED', 'true')
    vi.stubEnv('VITE_API_PROXY_SERVER_KEY_AVAILABLE', 'true')

    const { normalizeSettings } = await import('./apiProfiles')

    const settings = normalizeSettings({
      profiles: [
        {
          ...IMAGE_PROFILE,
          baseUrl: 'https://chatgpt.com/backend-api/codex',
          apiKey: 'old-browser-key',
          apiProxy: false,
        },
        {
          ...PLANNER_PROFILE,
          baseUrl: 'https://chatgpt.com/backend-api/codex',
          apiKey: 'old-browser-key',
          apiProxy: false,
        },
      ],
      activeProfileId: IMAGE_PROFILE.id,
      amazonPlannerProfileId: PLANNER_PROFILE.id,
    })

    expect(settings.profiles).toMatchObject([
      {
        id: IMAGE_PROFILE.id,
        baseUrl: 'https://done.amzdataincn.com/reseller/v1',
        apiKey: 'server-env',
        apiProxy: true,
      },
      {
        id: PLANNER_PROFILE.id,
        baseUrl: 'https://done.amzdataincn.com/reseller/v1',
        apiKey: 'server-env',
        apiProxy: true,
      },
    ])
  })
})
