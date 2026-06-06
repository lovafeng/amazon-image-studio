import { describe, expect, it } from 'vitest'
import dbSource from './db.ts?raw'

describe('image thumbnail generation', () => {
  it('uses canvas.toBlob instead of canvas.toDataURL in the thumbnail hot path', () => {
    const thumbnailBlock = dbSource.slice(
      dbSource.indexOf('async function createImageThumbnail'),
      dbSource.indexOf('async function safeCreateImageThumbnail'),
    )

    expect(dbSource).toContain('.toBlob(')
    expect(thumbnailBlock).toContain('canvasToThumbnailBlob(canvas)')
    expect(thumbnailBlock).not.toContain('.toDataURL(')
  })
})

describe('stored upload image sizing', () => {
  it('prepares oversized upload images before hashing and storing them', () => {
    const storeImageBlock = dbSource.slice(
      dbSource.indexOf('export async function storeImage'),
      dbSource.indexOf('function loadImage'),
    )

    expect(dbSource).toContain('STORED_UPLOAD_MAX_EDGE = 2400')
    expect(storeImageBlock).toContain("source === 'upload'")
    expect(storeImageBlock).toContain('prepareStoredUploadImageDataUrl(dataUrl)')
    expect(storeImageBlock.indexOf('prepareStoredUploadImageDataUrl(dataUrl)')).toBeLessThan(storeImageBlock.indexOf('hashDataUrl'))
  })
})
