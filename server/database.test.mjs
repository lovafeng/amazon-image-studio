import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStorage } from './database.mjs'

let tempDir
let storage

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ais-db-'))
  storage = createStorage(join(tempDir, 'app.sqlite'))
})

afterEach(() => {
  storage.close()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('sqlite storage', () => {
  it('stores, lists, updates, deletes, and clears tasks', () => {
    const task = {
      id: 'task-a',
      prompt: 'make image',
      createdAt: 10,
      inputImageIds: [],
      outputImages: [],
      status: 'done',
      error: null,
    }

    storage.putTask(task)
    expect(storage.getAllTasks()).toEqual([task])

    const updated = { ...task, prompt: 'updated' }
    storage.putTask(updated)
    expect(storage.getAllTasks()).toEqual([updated])

    storage.deleteTask('task-a')
    expect(storage.getAllTasks()).toEqual([])

    storage.putTask(task)
    storage.clearTasks()
    expect(storage.getAllTasks()).toEqual([])
  })

  it('stores images and clears matching thumbnails with image deletion', () => {
    const image = {
      id: 'image-a',
      dataUrl: 'data:image/png;base64,a',
      createdAt: 20,
      source: 'upload',
      width: 100,
      height: 80,
    }
    const thumbnail = {
      id: 'image-a',
      thumbnailDataUrl: 'data:image/webp;base64,t',
      width: 100,
      height: 80,
      thumbnailVersion: 2,
    }

    storage.putImage(image)
    storage.putImageThumbnail(thumbnail)

    expect(storage.getImage('image-a')).toEqual(image)
    expect(storage.getAllImageIds()).toEqual(['image-a'])
    expect(storage.getStoredImageThumbnail('image-a')).toEqual(thumbnail)

    storage.deleteImage('image-a')
    expect(storage.getImage('image-a')).toBeUndefined()
    expect(storage.getStoredImageThumbnail('image-a')).toBeUndefined()
  })

  it('stores and clears amazon planner sessions', () => {
    const session = {
      id: 'session-a',
      title: 'Tumbler',
      mode: 'listing',
      createdAt: 30,
      updatedAt: 40,
    }

    storage.putAmazonPlannerSession(session)
    expect(storage.getAllAmazonPlannerSessions()).toEqual([session])

    storage.clearAmazonPlannerSessions()
    expect(storage.getAllAmazonPlannerSessions()).toEqual([])
  })
})
