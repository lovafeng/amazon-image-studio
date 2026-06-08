import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_FAL_BASE_URL,
  DEFAULT_FAL_MODEL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_AMAZON_PLANNER_PROFILE_ID,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_OPENAI_INPUT_IMAGE_PROFILE_ID,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_SETTINGS,
  createOpenAIInputImageProfile,
  createDefaultOpenAIProfile,
  createDefaultFalProfile,
  findEquivalentApiProfile,
  getActiveApiProfile,
  getAgentResponsesProfile,
  getAmazonPlannerProfile,
  getDefaultImageProfile,
  getImageGenerationProfile,
  importCustomProviderDefinitionFromJson,
  importCustomProviderSettingsFromJson,
  mergeImportedSettings,
  normalizeSettings,
  switchApiProfileProvider,
} from './apiProfiles'

describe('mergeImportedSettings', () => {
  it('creates separate default profiles for image generation and AI planning', () => {
    const settings = normalizeSettings({})

    expect(settings.profiles).toHaveLength(2)
    expect(settings.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(settings.amazonPlannerProfileId).toBe(DEFAULT_AMAZON_PLANNER_PROFILE_ID)
    expect(settings.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      name: '生图',
      apiMode: DEFAULT_SETTINGS.apiMode,
      model: DEFAULT_SETTINGS.model,
    })
    expect(getAmazonPlannerProfile(settings)).toMatchObject({
      id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
      name: 'AI策划',
      apiMode: 'responses',
      model: DEFAULT_RESPONSES_MODEL,
    })
  })

  it('migrates the untouched legacy default image profile to Responses API', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          baseUrl: DEFAULT_SETTINGS.baseUrl,
          apiKey: DEFAULT_SETTINGS.apiKey,
          model: DEFAULT_IMAGES_MODEL,
          apiMode: 'images',
          apiProxy: DEFAULT_SETTINGS.apiProxy,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          baseUrl: DEFAULT_SETTINGS.baseUrl,
          apiKey: DEFAULT_SETTINGS.apiKey,
          model: DEFAULT_RESPONSES_MODEL,
          apiMode: 'responses',
          apiProxy: DEFAULT_SETTINGS.apiProxy,
        }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(settings.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      apiMode: DEFAULT_SETTINGS.apiMode,
      model: DEFAULT_SETTINGS.model,
    })
  })

  it('keeps a customized image profile on Images API', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          baseUrl: DEFAULT_SETTINGS.baseUrl,
          apiKey: DEFAULT_SETTINGS.apiKey,
          model: 'custom-image-model',
          apiMode: 'images',
          apiProxy: DEFAULT_SETTINGS.apiProxy,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          baseUrl: DEFAULT_SETTINGS.baseUrl,
          apiKey: DEFAULT_SETTINGS.apiKey,
          model: DEFAULT_RESPONSES_MODEL,
          apiMode: 'responses',
          apiProxy: DEFAULT_SETTINGS.apiProxy,
        }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(settings.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      apiMode: 'images',
      model: 'custom-image-model',
    })
  })

  it('splits a persisted single default planner profile into image and planner defaults', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          apiKey: 'shared-key',
          apiMode: 'responses',
          model: DEFAULT_RESPONSES_MODEL,
        }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_OPENAI_PROFILE_ID,
    })

    expect(settings.profiles).toHaveLength(2)
    expect(settings.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(settings.amazonPlannerProfileId).toBe(DEFAULT_AMAZON_PLANNER_PROFILE_ID)
    expect(settings.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      name: '生图',
      apiKey: 'shared-key',
      apiMode: DEFAULT_SETTINGS.apiMode,
      model: DEFAULT_SETTINGS.model,
    })
    expect(getAmazonPlannerProfile(settings)).toMatchObject({
      id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
      name: 'AI策划',
      apiKey: 'shared-key',
      apiMode: 'responses',
      model: DEFAULT_RESPONSES_MODEL,
    })
  })

  it('keeps explicit profile API mode and model instead of applying stale top-level fields', () => {
    const settings = normalizeSettings({
      baseUrl: 'https://stale.example.com/v1',
      apiMode: 'responses',
      model: DEFAULT_RESPONSES_MODEL,
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          baseUrl: 'https://images.example.com/v1',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          apiMode: 'responses',
          model: DEFAULT_RESPONSES_MODEL,
        }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(settings.profiles.find((profile) => profile.id === DEFAULT_OPENAI_PROFILE_ID)).toMatchObject({
      baseUrl: 'https://images.example.com/v1',
      apiMode: 'images',
      model: DEFAULT_IMAGES_MODEL,
    })
    expect(settings.baseUrl).toBe('https://images.example.com/v1')
    expect(settings.apiMode).toBe('images')
    expect(settings.model).toBe(DEFAULT_IMAGES_MODEL)
  })

  it('replaces the default OpenAI profile with legacy imported settings when current settings are untouched', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
      timeout: 120,
      apiMode: 'responses',
      codexCli: true,
      apiProxy: true,
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      provider: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
      timeout: 120,
      apiMode: 'responses',
      codexCli: true,
      apiProxy: true,
    })
  })

  it('replaces the default provider list with imported profiles when current settings are untouched', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [
        {
          id: 'imported-openai',
          name: 'Imported OpenAI',
          provider: 'openai',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-fal',
          name: 'Imported fal',
          provider: 'fal',
          baseUrl: DEFAULT_FAL_BASE_URL,
          apiKey: 'fal-key',
          model: DEFAULT_FAL_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
      ],
      activeProfileId: 'imported-fal',
    })

    expect(merged.profiles.map((profile) => profile.id)).toEqual(['imported-openai', 'imported-fal'])
    expect(merged.activeProfileId).toBe('imported-fal')
  })

  it('deduplicates imported profiles when replacing untouched default settings', () => {
    const merged = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [
        {
          id: 'imported-openai-a',
          name: 'Imported OpenAI A',
          provider: 'openai',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-openai-b',
          name: 'Imported OpenAI B',
          provider: 'openai',
          baseUrl: 'https://api.example.com/v1/',
          apiKey: 'openai-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 600,
          apiMode: 'images',
          codexCli: true,
          apiProxy: true,
        },
      ],
      activeProfileId: 'imported-openai-b',
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.profiles[0].id).toBe('imported-openai-a')
    expect(merged.activeProfileId).toBe('imported-openai-a')
  })

  it('appends imported legacy settings as a new profile when current settings are customized', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      baseUrl: 'https://imported.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
    })

    expect(merged.profiles).toHaveLength(3)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    const importedProfile = merged.profiles.find((profile) => profile.apiKey === 'imported-key')
    expect(importedProfile).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://imported.example.com/v1',
      apiKey: 'imported-key',
      model: 'imported-model',
    })
    expect(importedProfile?.id).not.toBe(DEFAULT_OPENAI_PROFILE_ID)
  })

  it('appends imported profiles as new profiles when current settings are customized', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      profiles: [
        {
          id: 'imported-openai',
          name: 'Imported OpenAI',
          provider: 'openai',
          baseUrl: 'https://imported.example.com/v1',
          apiKey: 'imported-key',
          model: DEFAULT_IMAGES_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
        {
          id: 'imported-fal',
          name: 'Imported fal',
          provider: 'fal',
          baseUrl: DEFAULT_FAL_BASE_URL,
          apiKey: 'fal-key',
          model: DEFAULT_FAL_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
      ],
      activeProfileId: 'imported-fal',
    })

    expect(merged.profiles).toHaveLength(4)
    expect(merged.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles.find((profile) => profile.name === 'Imported OpenAI')).toMatchObject({ provider: 'openai', apiKey: 'imported-key' })
    expect(merged.profiles.find((profile) => profile.name === 'Imported fal')).toMatchObject({ provider: 'fal', apiKey: 'fal-key' })
    expect(new Set(merged.profiles.map((profile) => profile.id)).size).toBe(4)
  })

  it('skips imported profiles that already exist in current customized settings', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      profiles: [
        {
          id: 'duplicate-openai',
          name: 'Duplicate OpenAI',
          provider: 'openai',
          baseUrl: 'https://current.example.com/v1/',
          apiKey: 'current-key',
          model: 'current-model',
          timeout: 600,
          apiMode: 'images',
          codexCli: true,
          apiProxy: true,
        },
        {
          id: 'new-fal',
          name: 'New fal',
          provider: 'fal',
          baseUrl: DEFAULT_FAL_BASE_URL,
          apiKey: 'fal-key',
          model: DEFAULT_FAL_MODEL,
          timeout: 300,
          apiMode: 'images',
          codexCli: false,
          apiProxy: false,
        },
      ],
    })

    expect(merged.profiles).toHaveLength(3)
    expect(merged.profiles[0]).toMatchObject({ apiKey: 'current-key', model: 'current-model' })
    expect(merged.profiles.find((profile) => profile.provider === 'fal')).toMatchObject({ apiKey: 'fal-key', model: DEFAULT_FAL_MODEL })
  })

  it('reuses an existing keyed profile when importing the same custom profile without an API key', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'existing-custom',
        name: 'Existing Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'existing-key',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'existing-custom',
    })
    const imported = normalizeSettings({
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })
    const merged = mergeImportedSettings(current, imported)
    const match = findEquivalentApiProfile(merged, imported.profiles[0], imported.customProviders)

    expect(merged.profiles).toHaveLength(1)
    expect(match?.id).toBe('existing-custom')
  })

  it('does not replace existing custom providers when only the default profile remains', () => {
    const current = normalizeSettings({
      ...DEFAULT_SETTINGS,
      customProviders: [{
        id: 'custom-existing',
        name: 'Existing Provider',
        submit: { path: 'images/generations' },
      }],
    })
    const merged = mergeImportedSettings(current, {
      customProviders: [{
        id: 'custom-imported',
        name: 'Imported Provider',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-imported',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: '',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customProviders.map((provider) => provider.id)).toEqual(['custom-existing', 'custom-imported'])
    expect(merged.profiles).toHaveLength(3)
  })

  it('appends imported custom providers and keeps imported custom profile references', () => {
    const current = mergeImportedSettings(DEFAULT_SETTINGS, {
      baseUrl: 'https://current.example.com/v1',
      apiKey: 'current-key',
      model: 'current-model',
    })
    const merged = mergeImportedSettings(current, {
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        id: 'imported-custom',
        name: 'Imported Custom',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged.customProviders).toHaveLength(1)
    expect(merged.customProviders[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(merged.profiles).toHaveLength(3)
    expect(merged.profiles.find((profile) => profile.name === 'Imported Custom')).toMatchObject({
      name: 'Imported Custom',
      provider: 'custom-json',
      apiKey: 'custom-key',
      model: 'custom-model',
    })
  })
})

describe('custom providers', () => {
  it('normalizes custom provider definitions and keeps custom profiles', () => {
    const settings = normalizeSettings({
      customProviders: [{
        id: 'custom-async',
        name: 'Custom Async',
        template: 'openai-compatible-async',
        generationPath: '/v1/images/generations',
        editPath: '/v1/images/edits',
        taskPath: '/v1/images/tasks/{task_id}',
      }],
      profiles: [{
        id: 'profile-custom',
        name: 'Custom Profile',
        provider: 'custom-async',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        model: 'model',
        timeout: 60,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'profile-custom',
    })

    expect(settings.customProviders[0]).toMatchObject({
      id: 'custom-async',
      template: 'http-image',
      submit: {
        path: 'images/generations',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      editSubmit: {
        path: 'images/edits',
        query: { async: 'true' },
        taskIdPath: 'data',
      },
      poll: {
        path: 'images/tasks/{task_id}',
      },
    })
    expect(settings.profiles[0].provider).toBe('custom-async')
  })

  it('normalizes an Apimart-style task manifest', () => {
    const provider = importCustomProviderDefinitionFromJson(JSON.stringify({
      name: 'Apimart GPT-Image-2',
      template: 'http-image',
      submit: {
        path: '/v1/images/generations',
        method: 'POST',
        contentType: 'json',
        body: {
          model: '$profile.model',
          prompt: '$prompt',
          n: '$params.n',
          size: '$params.size',
          resolution: '2k',
          image_urls: '$inputImages.dataUrls',
        },
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: '/v1/tasks/{task_id}',
        method: 'GET',
        query: { language: 'zh' },
        statusPath: 'data.status',
        successValues: ['completed'],
        failureValues: ['failed', 'cancelled'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    }))

    expect(provider).toMatchObject({
      template: 'http-image',
      submit: {
        path: 'images/generations',
        taskIdPath: 'data.0.task_id',
      },
      poll: {
        path: 'tasks/{task_id}',
        query: { language: 'zh' },
        successValues: ['completed'],
        result: {
          imageUrlPaths: ['data.result.images.*.url.*'],
        },
      },
    })
  })

  it('imports wrapped custom provider settings with profiles', () => {
    const imported = importCustomProviderSettingsFromJson(JSON.stringify({
      customProviders: [{
        id: 'custom-json',
        name: 'Custom JSON',
        submit: {
          path: 'images/generations',
          method: 'POST',
          contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: [] },
        },
      }],
      profiles: [{
        name: 'Custom JSON',
        provider: 'custom-json',
        baseUrl: 'https://custom.example.com/v1',
        model: 'custom-model',
        apiMode: 'images',
      }],
    }))

    expect(imported.customProviders[0]).toMatchObject({ id: 'custom-json', name: 'Custom JSON' })
    expect(imported.profiles[0]).toMatchObject({
      name: 'Custom JSON',
      provider: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
      apiKey: '',
      model: 'custom-model',
      apiMode: 'images',
    })
  })

  it('imports wrapped custom provider settings from a json code block', () => {
    const imported = importCustomProviderSettingsFromJson(`\`\`\`json
{"customProviders":[{"id":"custom-json","name":"Custom JSON","submit":{"path":"images/generations","method":"POST","contentType":"json","body":{"model":"$profile.model","prompt":"$prompt"},"result":{"imageUrlPaths":["data.result.images.*.url.*"],"b64JsonPaths":[]}}}],"profiles":[{"name":"Custom JSON","provider":"custom-json","baseUrl":"https://custom.example.com/v1","model":"custom-model","apiMode":"images"}]}
\`\`\``)

    expect(imported.customProviders[0]).toMatchObject({ id: 'custom-json' })
    expect(imported.customProviders[0].submit.result).toMatchObject({
      imageUrlPaths: ['data.result.images.*.url.*'],
    })
    expect(imported.profiles[0]).toMatchObject({
      provider: 'custom-json',
      baseUrl: 'https://custom.example.com/v1',
    })
  })

  it('rejects markdown-corrupted profile fields when importing wrapped settings', () => {
    expect(() => importCustomProviderSettingsFromJson(JSON.stringify({
      customProviders: [{
        id: 'custom-apimart',
        name: 'APIMart',
        submit: { path: 'images/generations' },
      }],
      profiles: [{
        name: 'APIMart',
        provider: 'custom-apimart',
        baseUrl: '[https://api.apimart.ai/v1',
        model: 'gpt-image-2-official',
        apiMode: 'images](https://api.apimart.ai/v1%22,%22model%22:%22gpt-image-2-official%22,%22apiMode%22:%22images)',
      }],
    }))).toThrow('JSON 包含 Markdown 链接')
  })

  it('does not inherit fal URL and model when switching to a custom provider', () => {
    const provider = importCustomProviderDefinitionFromJson(JSON.stringify({
      name: 'Custom Provider',
      template: 'http-image',
      submit: { path: 'images/generations' },
    }))
    const profile = switchApiProfileProvider(createDefaultFalProfile(), provider.id, provider)

    expect(profile.provider).toBe(provider.id)
    expect(profile.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
    expect(profile.model).toBe(DEFAULT_IMAGES_MODEL)
  })

  it('enables streaming with maximum partial images by default', () => {
    expect(createDefaultOpenAIProfile().streamImages).toBe(true)
    expect(createDefaultOpenAIProfile().streamPartialImages).toBe(3)
    expect(DEFAULT_SETTINGS.streamImages).toBe(true)
    expect(DEFAULT_SETTINGS.streamPartialImages).toBe(3)
    expect(DEFAULT_SETTINGS.profiles[0].streamImages).toBe(true)
    expect(DEFAULT_SETTINGS.profiles[0].streamPartialImages).toBe(3)

    const normalized = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamImages: false, streamPartialImages: 3 }),
      ],
    })

    expect(normalized.streamImages).toBe(false)
    expect(normalized.streamPartialImages).toBe(3)
    expect(normalized.profiles[0].streamImages).toBe(false)
    expect(normalized.profiles[0].streamPartialImages).toBe(3)

    const clamped = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ streamPartialImages: 8 }),
      ],
    })

    expect(clamped.profiles[0].streamPartialImages).toBe(3)
  })

  it('enables Agent submit auto scroll by default', () => {
    expect(DEFAULT_SETTINGS.agentScrollToBottomAfterSubmit).toBe(true)
    expect(normalizeSettings({}).agentScrollToBottomAfterSubmit).toBe(true)
    expect(normalizeSettings({ agentScrollToBottomAfterSubmit: false }).agentScrollToBottomAfterSubmit).toBe(false)
  })

  it('restores OpenAI-compatible URL after switching through fal.ai', () => {
    const openaiProfile = createDefaultOpenAIProfile({
      baseUrl: 'https://api.compat.example.com/v1',
      model: 'custom-openai-model',
      apiProxy: false,
    })

    const falProfile = switchApiProfileProvider(openaiProfile, 'fal')
    const restoredProfile = switchApiProfileProvider(falProfile, 'openai')

    expect(falProfile.baseUrl).toBe(DEFAULT_FAL_BASE_URL)
    expect(restoredProfile.baseUrl).toBe('https://api.compat.example.com/v1')
    expect(restoredProfile.model).toBe('custom-openai-model')
    expect(restoredProfile.apiProxy).toBe(false)
  })
})

describe('amazon planner profile', () => {
  it('keeps default OpenAI style board requests on the virtual Images profile after settings normalization', () => {
    const imageProfile = createDefaultOpenAIProfile({
      id: DEFAULT_OPENAI_PROFILE_ID,
      name: '生图',
      apiMode: 'images',
      model: DEFAULT_IMAGES_MODEL,
      streamImages: true,
    })
    const requestProfile = createOpenAIInputImageProfile(imageProfile)
    const normalizedSettings = normalizeSettings({
      profiles: [imageProfile],
      activeProfileId: imageProfile.id,
    })
    const requestSettings = normalizeSettings({
      ...normalizedSettings,
      profiles: [requestProfile, ...normalizedSettings.profiles],
      activeProfileId: requestProfile.id,
    })

    expect(getActiveApiProfile(requestSettings)).toMatchObject({
      id: DEFAULT_OPENAI_INPUT_IMAGE_PROFILE_ID,
      apiMode: 'images',
      model: DEFAULT_IMAGES_MODEL,
      streamImages: false,
    })
  })

  it('resolves the built-in image profile even when the planner profile is active', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          apiMode: 'responses',
          model: DEFAULT_RESPONSES_MODEL,
        }),
      ],
      activeProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(getDefaultImageProfile(settings)).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      apiMode: DEFAULT_SETTINGS.apiMode,
      model: DEFAULT_SETTINGS.model,
    })
  })

  it('auto-selects the first OpenAI Chat/Responses profile when none is configured', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: 'image-profile',
          name: 'Image Profile',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: 'planner-profile',
          name: 'Planner Profile',
          apiMode: 'chat',
          model: DEFAULT_CHAT_MODEL,
        }),
      ],
      activeProfileId: 'image-profile',
    })

    expect(settings.activeProfileId).toBe('image-profile')
    expect(settings.amazonPlannerProfileId).toBe('planner-profile')
    expect(getAmazonPlannerProfile(settings)?.id).toBe('planner-profile')
  })

  it('falls back when the configured planner profile is removed or no longer uses Chat/Responses API', () => {
    const settings = normalizeSettings({
      amazonPlannerProfileId: 'stale-planner',
      profiles: [
        createDefaultOpenAIProfile({
          id: 'image-profile',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: 'next-planner',
          apiMode: 'chat',
          model: DEFAULT_CHAT_MODEL,
        }),
      ],
    })

    expect(settings.amazonPlannerProfileId).toBe('next-planner')
    expect(getAmazonPlannerProfile(settings)?.id).toBe('next-planner')
  })

  it('does not treat the active image profile as the planner profile', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: 'image-profile',
          apiKey: 'image-key',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: 'planner-profile',
          apiKey: 'planner-key',
          apiMode: 'chat',
          model: 'deepseek-v4-flash',
        }),
      ],
      activeProfileId: 'image-profile',
      amazonPlannerProfileId: 'planner-profile',
    })

    expect(settings.activeProfileId).toBe('image-profile')
    expect(getAmazonPlannerProfile(settings)).toMatchObject({
      id: 'planner-profile',
      apiKey: 'planner-key',
      model: 'deepseek-v4-flash',
    })
  })

  it('auto-selects the image profile when the active profile is the planner profile', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          apiKey: 'image-key',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          apiKey: 'planner-key',
          apiMode: 'responses',
          model: DEFAULT_RESPONSES_MODEL,
        }),
      ],
      activeProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(getImageGenerationProfile(settings)).toMatchObject({
      id: DEFAULT_OPENAI_PROFILE_ID,
      apiMode: 'images',
      model: DEFAULT_IMAGES_MODEL,
    })
  })

  it('auto-selects the Responses profile for Agent when the active profile is image generation', () => {
    const settings = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({
          id: DEFAULT_OPENAI_PROFILE_ID,
          name: '生图',
          apiKey: 'image-key',
          apiMode: 'images',
          model: DEFAULT_IMAGES_MODEL,
        }),
        createDefaultOpenAIProfile({
          id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
          name: 'AI策划',
          apiKey: 'planner-key',
          apiMode: 'responses',
          model: DEFAULT_RESPONSES_MODEL,
        }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      amazonPlannerProfileId: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
    })

    expect(getAgentResponsesProfile(settings)).toMatchObject({
      id: DEFAULT_AMAZON_PLANNER_PROFILE_ID,
      apiMode: 'responses',
      model: DEFAULT_RESPONSES_MODEL,
    })
  })
})
