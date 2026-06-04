import { describe, expect, it } from 'vitest'
import settingsModalSource from './SettingsModal.tsx?raw'
import supportPromptModalSource from './SupportPromptModal.tsx?raw'

describe('product GitHub links', () => {
  it('does not expose project GitHub links in product UI', () => {
    const source = `${settingsModalSource}\n${supportPromptModalSource}`

    expect(source).not.toContain('github.com/Ali-Aria/amazon-image-studio')
    expect(source).not.toContain('@Ali-Aria')
  })
})
