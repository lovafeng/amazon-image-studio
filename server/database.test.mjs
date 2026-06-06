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

  it('stores and updates a user token limit', () => {
    const user = storage.createUser({
      email: 'limited@example.com',
      phone: '',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      tokenLimit: 100,
      createdAt: 1,
    })

    expect(storage.getUserById(user.id)).toMatchObject({ tokenLimit: 100 })

    storage.setUserTokenLimit(user.id, 42)
    expect(storage.getUserById(user.id)).toMatchObject({ tokenLimit: 42 })

    storage.setUserTokenLimit(user.id, null)
    expect(storage.getUserById(user.id)).toMatchObject({ tokenLimit: null })
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

  it('records usage events and summarizes them by user', () => {
    const user = storage.createUser({
      email: 'user@example.com',
      phone: '',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      createdAt: 1,
    })

    storage.recordUsageEvent({
      userId: user.id,
      eventType: 'ai_proxy',
      status: 'ok',
      endpoint: '/api-proxy/v1/responses',
      model: 'gpt-image-1',
      generatedImages: 2,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      createdAt: 10,
    })
    storage.recordUsageEvent({
      userId: user.id,
      eventType: 'ai_proxy',
      status: 'error',
      endpoint: '/api-proxy/v1/responses',
      model: 'gpt-image-1',
      generatedImages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      createdAt: 11,
    })

    expect(storage.getUsageSummary(user.id)).toMatchObject({
      calls: 2,
      successes: 1,
      failures: 1,
      generatedImages: 2,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      lastUsedAt: 11,
    })
    expect(storage.getUsageEvents(user.id)).toHaveLength(2)
    expect(storage.getAllUsageSummaries()[0]).toMatchObject({
      userId: user.id,
      email: 'user@example.com',
      calls: 2,
    })
  })

  it('records API proxy logs for support diagnostics', () => {
    const user = storage.createUser({
      email: 'user@example.com',
      phone: '',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      createdAt: 1,
    })

    storage.recordApiProxyLog({
      userId: user.id,
      endpoint: '/api-proxy/v1/images/generations',
      status: 'error',
      upstreamStatus: 400,
      upstreamRequestId: 'req_123',
      contentType: 'application/json',
      errorType: 'image_generation_user_error',
      errorCode: 'moderation_blocked',
      errorMessage: 'blocked',
      generatedImages: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: 1234,
      createdAt: 20,
    })

    expect(storage.getApiProxyLogs(user.id)).toEqual([
      expect.objectContaining({
        userId: user.id,
        endpoint: '/api-proxy/v1/images/generations',
        status: 'error',
        upstreamStatus: 400,
        upstreamRequestId: 'req_123',
        errorCode: 'moderation_blocked',
        errorMessage: 'blocked',
        durationMs: 1234,
        createdAt: 20,
      }),
    ])
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

  it('stores, lists, updates, deletes, and clears agent conversations', () => {
    const conversation = {
      id: 'conversation-a',
      title: '新对话',
      activeRoundId: null,
      createdAt: 10,
      updatedAt: 20,
      rounds: [],
      messages: [],
    }

    storage.putAgentConversation('admin', conversation)
    expect(storage.getAllAgentConversations('admin')).toEqual([conversation])

    const updated = { ...conversation, title: '更新后的对话', updatedAt: 30 }
    storage.putAgentConversation('admin', updated)
    expect(storage.getAllAgentConversations('admin')).toEqual([updated])

    storage.deleteAgentConversation('admin', 'conversation-a')
    expect(storage.getAllAgentConversations('admin')).toEqual([])

    storage.putAgentConversation('admin', conversation)
    storage.clearAgentConversations('admin')
    expect(storage.getAllAgentConversations('admin')).toEqual([])
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

  it('isolates agent conversations with the same id by owner', () => {
    const adminConversation = {
      id: 'conversation-a',
      title: 'admin conversation',
      activeRoundId: null,
      createdAt: 10,
      updatedAt: 20,
      rounds: [],
      messages: [],
    }
    const operatorConversation = { ...adminConversation, title: 'operator conversation' }

    storage.putAgentConversation('admin', adminConversation)
    storage.putAgentConversation('operator', operatorConversation)

    expect(storage.getAllAgentConversations('admin')).toEqual([adminConversation])
    expect(storage.getAllAgentConversations('operator')).toEqual([operatorConversation])
  })

  it('lists tasks across all users for admin audit', () => {
    const admin = storage.createUser({
      email: 'admin@example.com',
      phone: '',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active',
      createdAt: 1,
    })
    const user = storage.createUser({
      email: 'user@example.com',
      phone: '',
      passwordHash: 'hash',
      role: 'user',
      status: 'active',
      createdAt: 2,
    })
    const adminTask = {
      id: 'task-admin',
      prompt: 'admin prompt',
      createdAt: 10,
      inputImageIds: [],
      outputImages: [],
      status: 'done',
      error: null,
    }
    const userTask = {
      id: 'task-user',
      prompt: 'user prompt',
      createdAt: 20,
      inputImageIds: [],
      outputImages: [],
      status: 'running',
      error: null,
    }

    storage.putTask(admin.id, adminTask)
    storage.putTask(user.id, userTask)

    expect(storage.getAllUserTasks()).toEqual([
      expect.objectContaining({
        owner: user.id,
        userId: user.id,
        email: 'user@example.com',
        task: userTask,
      }),
      expect.objectContaining({
        owner: admin.id,
        userId: admin.id,
        email: 'admin@example.com',
        task: adminTask,
      }),
    ])
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

  it('stores new image and thumbnail bytes outside data url text', () => {
    const image = {
      id: 'image-binary',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      createdAt: 21,
      source: 'upload',
      width: 10,
      height: 8,
    }
    const thumbnail = {
      id: 'image-binary',
      thumbnailDataUrl: 'data:image/webp;base64,dGh1bWI=',
      width: 10,
      height: 8,
      thumbnailVersion: 2,
    }

    storage.putImage('admin', image)
    storage.putImageThumbnail('admin', thumbnail)

    const rawDb = new Database(join(tempDir, 'app.sqlite'), { readonly: true })
    const imageRow = rawDb.prepare('select data_url, content_blob, mime_type, byte_size from images where owner = ? and id = ?').get('admin', 'image-binary')
    const thumbnailRow = rawDb.prepare('select thumbnail_data_url, content_blob, mime_type, byte_size from thumbnails where owner = ? and id = ?').get('admin', 'image-binary')
    rawDb.close()

    expect(imageRow.data_url).toBe('')
    expect(imageRow.content_blob.equals(Buffer.from('hello'))).toBe(true)
    expect(imageRow.mime_type).toBe('image/png')
    expect(imageRow.byte_size).toBe(5)
    expect(thumbnailRow.thumbnail_data_url).toBe('')
    expect(thumbnailRow.content_blob.equals(Buffer.from('thumb'))).toBe(true)
    expect(thumbnailRow.mime_type).toBe('image/webp')
    expect(thumbnailRow.byte_size).toBe(5)

    expect(storage.getImage('admin', 'image-binary')).toEqual(image)
    const imageContent = storage.getImageContent('admin', 'image-binary')
    expect(imageContent).toMatchObject({
      id: 'image-binary',
      mimeType: 'image/png',
      byteSize: 5,
      createdAt: 21,
      source: 'upload',
      width: 10,
      height: 8,
    })
    expect(imageContent.bytes.equals(Buffer.from('hello'))).toBe(true)

    expect(storage.getStoredImageThumbnail('admin', 'image-binary')).toEqual(thumbnail)
    const thumbnailContent = storage.getImageThumbnailContent('admin', 'image-binary')
    expect(thumbnailContent).toMatchObject({
      id: 'image-binary',
      mimeType: 'image/webp',
      byteSize: 5,
      width: 10,
      height: 8,
      thumbnailVersion: 2,
    })
    expect(thumbnailContent.bytes.equals(Buffer.from('thumb'))).toBe(true)
  })

  it('serves raw content for legacy data url rows after binary schema migration', () => {
    const sqlitePath = join(tempDir, 'legacy-image-content.sqlite')
    const legacyDb = new Database(sqlitePath)
    legacyDb.exec(`
      create table images (
        owner text not null,
        id text not null,
        data_url text not null,
        metadata_json text not null,
        created_at integer,
        primary key (owner, id)
      );
    `)
    legacyDb.prepare('insert into images (owner, id, data_url, metadata_json, created_at) values (?, ?, ?, ?, ?)').run(
      'admin',
      'legacy-image',
      'data:image/jpeg;base64,bGVnYWN5',
      JSON.stringify({ createdAt: 30, source: 'generated', width: 20, height: 10 }),
      30,
    )
    legacyDb.close()

    const legacyStorage = createStorage(sqlitePath)
    expect(legacyStorage.getImage('admin', 'legacy-image')).toEqual({
      id: 'legacy-image',
      dataUrl: 'data:image/jpeg;base64,bGVnYWN5',
      createdAt: 30,
      source: 'generated',
      width: 20,
      height: 10,
    })
    const content = legacyStorage.getImageContent('admin', 'legacy-image')
    expect(content).toMatchObject({
      id: 'legacy-image',
      mimeType: 'image/jpeg',
      byteSize: 6,
      createdAt: 30,
      source: 'generated',
      width: 20,
      height: 10,
    })
    expect(content.bytes.equals(Buffer.from('legacy'))).toBe(true)
    legacyStorage.close()
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
