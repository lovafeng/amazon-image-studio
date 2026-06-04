import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
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
  it('creates users and finds them by email or phone', () => {
    const user = storage.createUser({
      email: 'user@example.com',
      phone: '13800000000',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      createdAt: 1,
    })

    expect(storage.getUserById(user.id)).toMatchObject({
      email: 'user@example.com',
      phone: '13800000000',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      createdAt: 1,
    })
    expect(storage.findUserByIdentifier('user@example.com')).toMatchObject({ id: user.id })
    expect(storage.findUserByIdentifier('13800000000')).toMatchObject({ id: user.id })
  })

  it('updates user status, password hash, and last login time', () => {
    const user = storage.createUser({
      email: 'user@example.com',
      phone: '',
      passwordHash: 'old',
      role: 'user',
      status: 'active',
      createdAt: 1,
    })

    storage.setUserStatus(user.id, 'disabled')
    storage.setUserPasswordHash(user.id, 'new')
    storage.touchUserLogin(user.id, 20)

    expect(storage.getUserById(user.id)).toMatchObject({
      status: 'disabled',
      passwordHash: 'new',
      lastLoginAt: 20,
    })
  })

  it('ensures a configured admin user exists', () => {
    const admin = storage.ensureAdminUser({
      email: 'admin@example.com',
      phone: '',
      passwordHash: 'hash',
      createdAt: 1,
    })

    expect(storage.findUserByIdentifier('admin@example.com')).toMatchObject({
      id: admin.id,
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
    })
    expect(storage.ensureAdminUser({
      email: 'admin@example.com',
      phone: '',
      passwordHash: 'next-hash',
      createdAt: 2,
    })).toMatchObject({ id: admin.id, passwordHash: 'hash' })
  })

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

    storage.putTask('admin', task)
    expect(storage.getAllTasks('admin')).toEqual([task])

    const updated = { ...task, prompt: 'updated' }
    storage.putTask('admin', updated)
    expect(storage.getAllTasks('admin')).toEqual([updated])

    storage.deleteTask('admin', 'task-a')
    expect(storage.getAllTasks('admin')).toEqual([])

    storage.putTask('admin', task)
    storage.clearTasks('admin')
    expect(storage.getAllTasks('admin')).toEqual([])
  })

  it('isolates tasks with the same id by owner', () => {
    const adminTask = {
      id: 'task-a',
      prompt: 'admin prompt',
      createdAt: 10,
      inputImageIds: [],
      outputImages: [],
      status: 'done',
      error: null,
    }
    const operatorTask = { ...adminTask, prompt: 'operator prompt' }

    storage.putTask('admin', adminTask)
    storage.putTask('operator', operatorTask)

    expect(storage.getAllTasks('admin')).toEqual([adminTask])
    expect(storage.getAllTasks('operator')).toEqual([operatorTask])
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

    storage.putImage('admin', image)
    storage.putImageThumbnail('admin', thumbnail)

    expect(storage.getImage('admin', 'image-a')).toEqual(image)
    expect(storage.getAllImageIds('admin')).toEqual(['image-a'])
    expect(storage.getStoredImageThumbnail('admin', 'image-a')).toEqual(thumbnail)

    storage.deleteImage('admin', 'image-a')
    expect(storage.getImage('admin', 'image-a')).toBeUndefined()
    expect(storage.getStoredImageThumbnail('admin', 'image-a')).toBeUndefined()
  })

  it('isolates images and thumbnails with the same id by owner', () => {
    const adminImage = {
      id: 'image-a',
      dataUrl: 'data:image/png;base64,admin',
      createdAt: 20,
      source: 'upload',
    }
    const operatorImage = {
      ...adminImage,
      dataUrl: 'data:image/png;base64,operator',
    }
    const adminThumbnail = {
      id: 'image-a',
      thumbnailDataUrl: 'data:image/webp;base64,admin',
      thumbnailVersion: 2,
    }
    const operatorThumbnail = {
      ...adminThumbnail,
      thumbnailDataUrl: 'data:image/webp;base64,operator',
    }

    storage.putImage('admin', adminImage)
    storage.putImage('operator', operatorImage)
    storage.putImageThumbnail('admin', adminThumbnail)
    storage.putImageThumbnail('operator', operatorThumbnail)

    expect(storage.getImage('admin', 'image-a')).toEqual(adminImage)
    expect(storage.getImage('operator', 'image-a')).toEqual(operatorImage)
    expect(storage.getStoredImageThumbnail('admin', 'image-a')).toEqual(adminThumbnail)
    expect(storage.getStoredImageThumbnail('operator', 'image-a')).toEqual(operatorThumbnail)
  })

  it('stores and clears amazon planner sessions', () => {
    const session = {
      id: 'session-a',
      title: 'Tumbler',
      mode: 'listing',
      createdAt: 30,
      updatedAt: 40,
    }

    storage.putAmazonPlannerSession('admin', session)
    expect(storage.getAllAmazonPlannerSessions('admin')).toEqual([session])

    storage.clearAmazonPlannerSessions('admin')
    expect(storage.getAllAmazonPlannerSessions('admin')).toEqual([])
  })

  it('migrates existing single-account rows to the configured legacy owner', () => {
    const sqlitePath = join(tempDir, 'legacy.sqlite')
    const legacyTask = {
      id: 'task-a',
      prompt: 'legacy',
      createdAt: 1,
      inputImageIds: [],
      outputImages: [],
      status: 'done',
      error: null,
    }
    const legacyDb = new Database(sqlitePath)
    legacyDb.exec('create table tasks (id text primary key, record_json text not null, created_at integer)')
    legacyDb.prepare('insert into tasks (id, record_json, created_at) values (?, ?, ?)').run(legacyTask.id, JSON.stringify(legacyTask), legacyTask.createdAt)
    legacyDb.close()

    const migratedStorage = createStorage(sqlitePath, { legacyOwner: 'operator' })
    expect(migratedStorage.getAllTasks('operator')).toEqual([legacyTask])
    expect(migratedStorage.getAllTasks('admin')).toEqual([])
    migratedStorage.close()
  })
})
