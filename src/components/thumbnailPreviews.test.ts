import { describe, expect, it } from 'vitest'
import agentWorkspaceSource from './AgentWorkspace.tsx?raw'
import inputBarSource from './InputBar.tsx?raw'

describe('thumbnail previews', () => {
  it('uses compressed thumbnails for @ image option previews', () => {
    const atImageOptionThumbBlock = inputBarSource.slice(
      inputBarSource.indexOf('function AtImageOptionThumb'),
      inputBarSource.indexOf('export default function InputBar()'),
    )

    expect(atImageOptionThumbBlock).toContain('ensureImageThumbnailCached(option.imageId)')
    expect(atImageOptionThumbBlock).not.toContain('ensureImageCached(option.imageId).then')
  })

  it('uses compressed thumbnails for unmasked agent chat image previews', () => {
    const chatImageThumbBlock = agentWorkspaceSource.slice(
      agentWorkspaceSource.indexOf('function ChatImageThumb'),
      agentWorkspaceSource.indexOf('function AgentStreamingCursor()'),
    )
    expect(chatImageThumbBlock).toContain('ensureImageThumbnailCached(imageId)')
    expect(chatImageThumbBlock).not.toContain('ensureImageCached(imageId).then')
  })
})
