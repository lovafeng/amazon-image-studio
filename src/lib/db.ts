import type { AgentConversation, AmazonPlannerSession, ProductWorkspace, TaskRecord, StoredImage, StoredImageThumbnail } from '../types'

const DB_NAME = 'amazon-image-studio'
const DB_VERSION = 3
const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const STORE_THUMBNAILS = 'thumbnails'
const STORE_AMAZON_PLANNER_SESSIONS = 'amazonPlannerSessions'
const LEGACY_IDB_SERVER_MIGRATION_KEY = 'amazon-image-studio:indexeddb-server-migration-v1'
const THUMBNAIL_MAX_SIZE = 720
const THUMBNAIL_QUALITY = 0.9
const THUMBNAIL_VERSION = 2
const STORED_UPLOAD_MAX_EDGE = 2400
const STORED_UPLOAD_QUALITY = 0.92

export const CURRENT_THUMBNAIL_VERSION = THUMBNAIL_VERSION
let legacyIndexedDbMigrationPromise: Promise<void> | null = null

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error ?? '请求失败')
  return body as T
}

function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiJson(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function apiDelete(path: string): Promise<undefined> {
  await apiJson(path, { method: 'DELETE' })
  return undefined
}

function openLegacyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_AMAZON_PLANNER_SESSIONS)) {
        db.createObjectStore(STORE_AMAZON_PLANNER_SESSIONS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function legacyDbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openLegacyDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

function getAllLegacyRecords<T>(storeName: string): Promise<T[]> {
  return legacyDbTransaction(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>)
}

async function runLegacyIndexedDbMigration(): Promise<void> {
  if (localStorage.getItem(LEGACY_IDB_SERVER_MIGRATION_KEY) === 'true') return

  const tasks = await getAllLegacyRecords<TaskRecord>(STORE_TASKS)
  const images = await getAllLegacyRecords<StoredImage>(STORE_IMAGES)
  const thumbnails = await getAllLegacyRecords<StoredImageThumbnail>(STORE_THUMBNAILS)
  const plannerSessions = await getAllLegacyRecords<AmazonPlannerSession>(STORE_AMAZON_PLANNER_SESSIONS)

  for (const task of tasks) {
    await apiPut<{ id: string }>(`/tasks/${encodeURIComponent(task.id)}`, task)
  }
  for (const image of images) {
    await apiPut<{ id: string }>(`/images/${encodeURIComponent(image.id)}`, image)
  }
  for (const thumbnail of thumbnails) {
    await apiPut<{ id: string }>(`/thumbnails/${encodeURIComponent(thumbnail.id)}`, thumbnail)
  }
  for (const session of plannerSessions) {
    await apiPut<{ id: string }>(`/amazon-planner-sessions/${encodeURIComponent(session.id)}`, session)
  }

  localStorage.setItem(LEGACY_IDB_SERVER_MIGRATION_KEY, 'true')
}

function migrateLegacyIndexedDBToServer(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') return Promise.resolve()
  legacyIndexedDbMigrationPromise ??= runLegacyIndexedDbMigration()
  return legacyIndexedDbMigrationPromise
}

async function migratedApiJson<T>(path: string): Promise<T> {
  await migrateLegacyIndexedDBToServer()
  return apiJson(path)
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return migratedApiJson('/tasks')
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/tasks/${encodeURIComponent(task.id)}`, task).then((result) => result.id)
}

export function deleteTask(id: string): Promise<undefined> {
  return apiDelete(`/tasks/${encodeURIComponent(id)}`)
}

export function clearTasks(): Promise<undefined> {
  return apiDelete('/tasks')
}

// ===== Agent conversations =====

export function getAllAgentConversations(): Promise<AgentConversation[]> {
  return apiJson('/agent-conversations')
}

export function putAgentConversation(conversation: AgentConversation): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/agent-conversations/${encodeURIComponent(conversation.id)}`, conversation).then((result) => result.id)
}

export function deleteAgentConversation(id: string): Promise<undefined> {
  return apiDelete(`/agent-conversations/${encodeURIComponent(id)}`)
}

export function clearAgentConversations(): Promise<undefined> {
  return apiDelete('/agent-conversations')
}

// ===== Amazon planner sessions =====

export function getAllAmazonPlannerSessions(): Promise<AmazonPlannerSession[]> {
  return migratedApiJson('/amazon-planner-sessions')
}

export function putAmazonPlannerSession(session: AmazonPlannerSession): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/amazon-planner-sessions/${encodeURIComponent(session.id)}`, session).then((result) => result.id)
}

export function deleteAmazonPlannerSession(id: string): Promise<undefined> {
  return apiDelete(`/amazon-planner-sessions/${encodeURIComponent(id)}`)
}

export function clearAmazonPlannerSessions(): Promise<undefined> {
  return apiDelete('/amazon-planner-sessions')
}

// ===== Product workspaces =====

export function getAllProductWorkspaces(): Promise<ProductWorkspace[]> {
  return apiJson('/product-workspaces')
}

export function putProductWorkspace(workspace: ProductWorkspace): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/product-workspaces/${encodeURIComponent(workspace.id)}`, workspace).then((result) => result.id)
}

export function deleteProductWorkspace(id: string): Promise<undefined> {
  return apiDelete(`/product-workspaces/${encodeURIComponent(id)}`)
}

export function clearProductWorkspaces(): Promise<undefined> {
  return apiDelete('/product-workspaces')
}

// ===== Images =====

export function getImage(id: string): Promise<StoredImage | undefined> {
  return migratedApiJson<StoredImage | null>(`/images/${encodeURIComponent(id)}`).then((image) => image ?? undefined)
}

async function migratedApiBlob(path: string): Promise<Blob | undefined> {
  await migrateLegacyIndexedDBToServer()
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' })
  if (!response.ok) return undefined
  return response.blob()
}

export function getImageBlob(id: string): Promise<Blob | undefined> {
  return migratedApiBlob(`/images/${encodeURIComponent(id)}/blob`)
}

export function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  return migratedApiJson<StoredImageThumbnail | null>(`/thumbnails/${encodeURIComponent(id)}`).then((thumbnail) => thumbnail ?? undefined)
}

export function getImageThumbnailBlob(id: string): Promise<Blob | undefined> {
  return migratedApiBlob(`/thumbnails/${encodeURIComponent(id)}/blob`)
}

export async function getStoredFreshImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const thumbnail = await getStoredImageThumbnail(id)
  return thumbnail?.thumbnailVersion === THUMBNAIL_VERSION ? thumbnail : undefined
}

export function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/thumbnails/${encodeURIComponent(thumbnail.id)}`, thumbnail).then((result) => result.id)
}

export async function getImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const existingThumbnail = await getStoredImageThumbnail(id)
  if (existingThumbnail?.thumbnailVersion === THUMBNAIL_VERSION) {
    return existingThumbnail
  }

  const blob = await getImageBlob(id)
  if (!blob) return undefined
  const metadata = await safeCreateImageThumbnail(await blobToDataUrl(blob))
  if (!metadata.thumbnailDataUrl) return undefined
  const thumbnail: StoredImageThumbnail = {
    id,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    width: metadata.width,
    height: metadata.height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
  await putImageThumbnail(thumbnail)
  return thumbnail
}

export function getAllImages(): Promise<StoredImage[]> {
  return migratedApiJson('/images')
}

export function getAllImageIds(): Promise<string[]> {
  return migratedApiJson('/images/ids')
}

export function putImage(image: StoredImage): Promise<IDBValidKey> {
  return apiPut<{ id: string }>(`/images/${encodeURIComponent(image.id)}`, image).then((result) => result.id)
}

export function deleteImage(id: string): Promise<undefined> {
  return apiDelete(`/images/${encodeURIComponent(id)}`)
}

export function clearImages(): Promise<undefined> {
  return apiDelete('/images')
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * 存储图片，若已存在（按 hash 去重）则跳过。
 * 返回 image id。
 */
export async function storeImage(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<string> {
  const storedDataUrl = source === 'upload' ? await prepareStoredUploadImageDataUrl(dataUrl) : dataUrl
  const id = await hashDataUrl(storedDataUrl)
  const existing = await getImage(id)
  if (!existing) {
    const thumbnail = await safeCreateImageThumbnail(storedDataUrl)
    await putImage({
      id,
      dataUrl: storedDataUrl,
      createdAt: Date.now(),
      source,
      width: thumbnail.width,
      height: thumbnail.height,
    })
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
  } else if ((await getStoredImageThumbnail(id))?.thumbnailVersion !== THUMBNAIL_VERSION) {
    const thumbnail = await safeCreateImageThumbnail(existing.dataUrl)
    if (thumbnail.width && thumbnail.height && (existing.width !== thumbnail.width || existing.height !== thumbnail.height)) {
      await putImage({ ...existing, width: thumbnail.width, height: thumbnail.height })
    }
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
  }
  return id
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = dataUrl
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('图片编码失败'))
    reader.readAsDataURL(blob)
  })
}

function getDataUrlMimeType(dataUrl: string) {
  return /^data:([^;,]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? 'image/png'
}

function getStoredUploadMimeType(dataUrl: string) {
  const mimeType = getDataUrlMimeType(dataUrl)
  return mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/png' ? mimeType : 'image/png'
}

function canvasToStoredUploadBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('图片压缩失败'))
      else resolve(blob)
    }, mimeType, STORED_UPLOAD_QUALITY)
  })
}

async function prepareStoredUploadImageDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof FileReader === 'undefined') return dataUrl

  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  const longestEdge = Math.max(width, height)
  if (longestEdge <= STORED_UPLOAD_MAX_EDGE) return dataUrl

  const scale = STORED_UPLOAD_MAX_EDGE / longestEdge
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await canvasToStoredUploadBlob(canvas, getStoredUploadMimeType(dataUrl))
  return blobToDataUrl(blob)
}

function canvasToThumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('缩略图导出失败'))
      else resolve(blob)
    }, 'image/webp', THUMBNAIL_QUALITY)
  })
}

async function createImageThumbnail(dataUrl: string): Promise<Omit<StoredImageThumbnail, 'id'>> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')

  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const thumbnailBlob = await canvasToThumbnailBlob(canvas)

  return {
    thumbnailDataUrl: await blobToDataUrl(thumbnailBlob),
    width,
    height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
}

async function safeCreateImageThumbnail(dataUrl: string): Promise<Partial<Omit<StoredImageThumbnail, 'id'>>> {
  try {
    return await createImageThumbnail(dataUrl)
  } catch {
    return {}
  }
}
