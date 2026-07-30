import { describe, expect, it } from 'vitest'
import taskCardSource from './TaskCard.tsx?raw'

describe('TaskCard thumbnail loading', () => {
  it('loads thumbnails only after the card enters the viewport', () => {
    expect(taskCardSource).toContain('IntersectionObserver')
    expect(taskCardSource).toContain('isThumbnailVisible')

    const thumbnailEffectBlock = taskCardSource.slice(
      taskCardSource.indexOf('// 加载缩略图'),
      taskCardSource.indexOf('const duration = (() => {'),
    )
    expect(thumbnailEffectBlock).toContain('if (!isThumbnailVisible) return')
  })

  it('uses thumbnail object URLs for card image display', () => {
    expect(taskCardSource).toContain('ensureImageThumbnailUrlCached')
    expect(taskCardSource).not.toContain('ensureImageThumbnailCached')

    const thumbnailEffectBlock = taskCardSource.slice(
      taskCardSource.indexOf('// 加载缩略图'),
      taskCardSource.indexOf('const duration = (() => {'),
    )
    expect(thumbnailEffectBlock).toContain('thumbnail.url')
    expect(thumbnailEffectBlock).not.toContain('thumbnail.dataUrl')
  })

  it('shows requested and actual parameter values when the API response differs', () => {
    expect(taskCardSource).toContain('renderParamDisplayValue')
    expect(taskCardSource).toContain('display.requestedValue')
    expect(taskCardSource).toContain('→')
    expect(taskCardSource).toContain('<ActualValueBadge value={display.displayValue}')
  })

  it('shows a direct high-resolution generation action on draft cards with outputs', () => {
    expect(taskCardSource).toContain("canCreateFinalFromDraft && Boolean(task.outputImages?.length)")
    expect(taskCardSource).toContain('tooltip="生成高清图"')
    expect(taskCardSource).toContain('onClick={onCreateFinalFromDraft}')
    expect(taskCardSource).toContain('高清')
  })

  it('shows scan-friendly status and source metadata above the prompt', () => {
    expect(taskCardSource).toContain('getTaskStatusBadge')
    expect(taskCardSource).toContain('getWorkflowLabel(historyCategory.workflow)')
    expect(taskCardSource).toContain('historyCategory.amazonSlot || getTaskImageCategoryLabel(task)')
    expect(taskCardSource).toContain('formatTaskTime(task.createdAt)')
    expect(taskCardSource).toContain('data-selectable-text')
  })
})
