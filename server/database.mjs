import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function parseJsonRecord(row) {
  return row ? JSON.parse(row.record_json) : undefined
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  const mimeType = match[1]
  const bytes = Buffer.from(match[3], match[2] ? 'base64' : 'utf8')
  const storageDataUrl = match[2] && encodeDataUrl(mimeType, bytes) !== dataUrl ? dataUrl : ''
  return { mimeType, bytes, storageDataUrl }
}

function encodeDataUrl(mimeType, bytes) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

function parseImage(row) {
  if (!row) return undefined
  const dataUrl = row.data_url || encodeDataUrl(row.mime_type, row.content_blob)
  return {
    id: row.id,
    dataUrl,
    ...JSON.parse(row.metadata_json),
  }
}

function parseThumbnail(row) {
  if (!row) return undefined
  const thumbnailDataUrl = row.thumbnail_data_url || encodeDataUrl(row.mime_type, row.content_blob)
  return {
    id: row.id,
    thumbnailDataUrl,
    ...JSON.parse(row.metadata_json),
  }
}

function parseImageContent(row, dataUrlColumn = 'data_url') {
  if (!row) return undefined
  const content = row.content_blob
    ? { mimeType: row.mime_type, bytes: Buffer.from(row.content_blob) }
    : decodeDataUrl(row[dataUrlColumn])
  return {
    id: row.id,
    bytes: content.bytes,
    mimeType: content.mimeType,
    byteSize: row.byte_size ?? content.bytes.byteLength,
    ...JSON.parse(row.metadata_json),
  }
}

function parseUser(row) {
  if (!row) return undefined
  return {
    id: row.id,
    email: row.email ?? '',
    phone: row.phone ?? '',
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    tokenLimit: row.token_limit ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  }
}

function parseUsageEvent(row) {
  if (!row) return undefined
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    status: row.status,
    endpoint: row.endpoint ?? '',
    model: row.model ?? '',
    generatedImages: row.generated_images,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
  }
}

function parseUsageSummary(row) {
  return {
    userId: row.user_id,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role ?? '',
    status: row.user_status ?? '',
    calls: Number(row.calls ?? 0),
    successes: Number(row.successes ?? 0),
    failures: Number(row.failures ?? 0),
    generatedImages: Number(row.generated_images ?? 0),
    promptTokens: Number(row.prompt_tokens ?? 0),
    completionTokens: Number(row.completion_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    tokenLimit: row.token_limit ?? null,
    lastUsedAt: row.last_used_at ?? undefined,
  }
}

function parseApiProxyLog(row) {
  if (!row) return undefined
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint ?? '',
    status: row.status,
    upstreamStatus: row.upstream_status ?? null,
    upstreamRequestId: row.upstream_request_id ?? '',
    contentType: row.content_type ?? '',
    errorType: row.error_type ?? '',
    errorCode: row.error_code ?? '',
    errorMessage: row.error_message ?? '',
    generatedImages: row.generated_images,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }
}

function parseAdminTask(row) {
  return {
    owner: row.owner,
    userId: row.user_id ?? row.owner,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role ?? '',
    status: row.user_status ?? '',
    task: JSON.parse(row.record_json),
  }
}

function parseAdminProductWorkspace(row) {
  return {
    owner: row.owner,
    userId: row.user_id ?? row.owner,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role ?? '',
    status: row.user_status ?? '',
    workspace: JSON.parse(row.record_json),
  }
}

const DEFAULT_LEGACY_OWNER = 'admin'

function normalizeOwner(owner) {
  return String(owner || DEFAULT_LEGACY_OWNER)
}

function normalizeOptionalText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function getTableInfo(db, tableName) {
  return db.prepare(`pragma table_info(${tableName})`).all()
}

function createOwnedTables(db) {
  db.exec(`
    create table if not exists users (
      id text primary key,
      email text unique,
      phone text unique,
      password_hash text not null,
      role text not null,
      status text not null,
      token_limit integer,
      created_at integer not null,
      last_login_at integer
    );

    create table if not exists tasks (
      owner text not null,
      id text not null,
      record_json text not null,
      created_at integer,
      primary key (owner, id)
    );

    create table if not exists agent_conversations (
      owner text not null,
      id text not null,
      record_json text not null,
      updated_at integer,
      primary key (owner, id)
    );

    create table if not exists images (
      owner text not null,
      id text not null,
      data_url text not null default '',
      content_blob blob,
      mime_type text,
      byte_size integer,
      metadata_json text not null,
      created_at integer,
      primary key (owner, id)
    );

    create table if not exists thumbnails (
      owner text not null,
      id text not null,
      thumbnail_data_url text not null default '',
      content_blob blob,
      mime_type text,
      byte_size integer,
      metadata_json text not null,
      primary key (owner, id)
    );

    create table if not exists amazon_planner_sessions (
      owner text not null,
      id text not null,
      record_json text not null,
      updated_at integer,
      primary key (owner, id)
    );

    create table if not exists product_workspaces (
      owner text not null,
      id text not null,
      record_json text not null,
      updated_at integer,
      primary key (owner, id)
    );

    create table if not exists usage_events (
      id text primary key,
      user_id text not null,
      event_type text not null,
      status text not null,
      endpoint text,
      model text,
      generated_images integer not null default 0,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      total_tokens integer not null default 0,
      created_at integer not null
    );

    create table if not exists api_proxy_logs (
      id text primary key,
      user_id text not null,
      endpoint text not null,
      status text not null,
      upstream_status integer,
      upstream_request_id text,
      content_type text,
      error_type text,
      error_code text,
      error_message text,
      generated_images integer not null default 0,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      total_tokens integer not null default 0,
      duration_ms integer not null default 0,
      created_at integer not null
    );
  `)
}

function migrateUserSchema(db) {
  const columns = getTableInfo(db, 'users')
  if (!columns.some((column) => column.name === 'token_limit')) {
    db.exec('alter table users add column token_limit integer')
  }
}

function addColumnIfMissing(db, tableName, columns, columnName, definition) {
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`alter table ${tableName} add column ${columnName} ${definition}`)
  }
}

function migrateBinaryResourceSchema(db) {
  const imageColumns = getTableInfo(db, 'images')
  addColumnIfMissing(db, 'images', imageColumns, 'content_blob', 'blob')
  addColumnIfMissing(db, 'images', imageColumns, 'mime_type', 'text')
  addColumnIfMissing(db, 'images', imageColumns, 'byte_size', 'integer')

  const thumbnailColumns = getTableInfo(db, 'thumbnails')
  addColumnIfMissing(db, 'thumbnails', thumbnailColumns, 'content_blob', 'blob')
  addColumnIfMissing(db, 'thumbnails', thumbnailColumns, 'mime_type', 'text')
  addColumnIfMissing(db, 'thumbnails', thumbnailColumns, 'byte_size', 'integer')
}

function createOwnedIndexes(db) {
  db.exec(`
    create index if not exists users_role_status_idx on users (role, status);
    create index if not exists tasks_owner_created_idx on tasks (owner, created_at desc, id desc);
    create index if not exists agent_conversations_owner_updated_idx on agent_conversations (owner, updated_at desc, id desc);
    create index if not exists images_owner_created_idx on images (owner, created_at desc, id desc);
    create index if not exists amazon_planner_sessions_owner_updated_idx on amazon_planner_sessions (owner, updated_at desc, id desc);
    create index if not exists product_workspaces_owner_updated_idx on product_workspaces (owner, updated_at desc, id desc);
    create index if not exists usage_events_user_created_idx on usage_events (user_id, created_at desc, id desc);
    create index if not exists api_proxy_logs_user_created_idx on api_proxy_logs (user_id, created_at desc, id desc);
    create index if not exists api_proxy_logs_created_idx on api_proxy_logs (created_at desc, id desc);
  `)
}

function migrateOwnedTable(db, tableName, legacyOwner) {
  const columns = getTableInfo(db, tableName)
  if (!columns.length) return
  const ownerColumn = columns.find((column) => column.name === 'owner')
  const idColumn = columns.find((column) => column.name === 'id')
  if (ownerColumn?.pk === 1 && idColumn?.pk === 2) return

  const legacyTable = `${tableName}_legacy_${Date.now()}`
  const ownerExpr = ownerColumn ? "coalesce(nullif(owner, ''), ?)" : '?'
  db.exec(`alter table ${tableName} rename to ${legacyTable}`)
  createOwnedTables(db)
  if (tableName === 'tasks') {
    db.prepare(`insert or replace into tasks (owner, id, record_json, created_at) select ${ownerExpr}, id, record_json, created_at from ${legacyTable}`).run(legacyOwner)
  } else if (tableName === 'agent_conversations') {
    db.prepare(`insert or replace into agent_conversations (owner, id, record_json, updated_at) select ${ownerExpr}, id, record_json, updated_at from ${legacyTable}`).run(legacyOwner)
  } else if (tableName === 'images') {
    db.prepare(`insert or replace into images (owner, id, data_url, metadata_json, created_at) select ${ownerExpr}, id, data_url, metadata_json, created_at from ${legacyTable}`).run(legacyOwner)
  } else if (tableName === 'thumbnails') {
    db.prepare(`insert or replace into thumbnails (owner, id, thumbnail_data_url, metadata_json) select ${ownerExpr}, id, thumbnail_data_url, metadata_json from ${legacyTable}`).run(legacyOwner)
  } else if (tableName === 'amazon_planner_sessions') {
    db.prepare(`insert or replace into amazon_planner_sessions (owner, id, record_json, updated_at) select ${ownerExpr}, id, record_json, updated_at from ${legacyTable}`).run(legacyOwner)
  }
  db.exec(`drop table ${legacyTable}`)
}

function migrateOwnedSchema(db, legacyOwner) {
  createOwnedTables(db)
  migrateUserSchema(db)
  for (const tableName of ['tasks', 'agent_conversations', 'images', 'thumbnails', 'amazon_planner_sessions']) {
    migrateOwnedTable(db, tableName, legacyOwner)
  }
  migrateBinaryResourceSchema(db)
  createOwnedIndexes(db)
}

export function createStorage(sqlitePath, options = {}) {
  mkdirSync(dirname(sqlitePath), { recursive: true })

  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')
  const legacyOwner = normalizeOwner(options.legacyOwner)
  migrateOwnedSchema(db, legacyOwner)

  const statements = {
    getAllTasks: db.prepare('select record_json from tasks where owner = ? order by created_at desc, id desc'),
    putTask: db.prepare('insert into tasks (owner, id, record_json, created_at) values (?, ?, ?, ?) on conflict(owner, id) do update set record_json = excluded.record_json, created_at = excluded.created_at'),
    deleteTask: db.prepare('delete from tasks where owner = ? and id = ?'),
    clearTasks: db.prepare('delete from tasks where owner = ?'),
    getAllAgentConversations: db.prepare('select record_json from agent_conversations where owner = ? order by updated_at desc, id desc'),
    putAgentConversation: db.prepare('insert into agent_conversations (owner, id, record_json, updated_at) values (?, ?, ?, ?) on conflict(owner, id) do update set record_json = excluded.record_json, updated_at = excluded.updated_at'),
    deleteAgentConversation: db.prepare('delete from agent_conversations where owner = ? and id = ?'),
    clearAgentConversations: db.prepare('delete from agent_conversations where owner = ?'),
    getImage: db.prepare('select id, data_url, content_blob, mime_type, byte_size, metadata_json from images where owner = ? and id = ?'),
    getAllImages: db.prepare('select id, data_url, content_blob, mime_type, byte_size, metadata_json from images where owner = ? order by created_at desc, id desc'),
    getAllImageIds: db.prepare('select id from images where owner = ? order by created_at desc, id desc'),
    putImage: db.prepare('insert into images (owner, id, data_url, content_blob, mime_type, byte_size, metadata_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(owner, id) do update set data_url = excluded.data_url, content_blob = excluded.content_blob, mime_type = excluded.mime_type, byte_size = excluded.byte_size, metadata_json = excluded.metadata_json, created_at = excluded.created_at'),
    deleteImage: db.prepare('delete from images where owner = ? and id = ?'),
    clearImages: db.prepare('delete from images where owner = ?'),
    deleteImageThumbnail: db.prepare('delete from thumbnails where owner = ? and id = ?'),
    clearThumbnails: db.prepare('delete from thumbnails where owner = ?'),
    getThumbnail: db.prepare('select id, thumbnail_data_url, content_blob, mime_type, byte_size, metadata_json from thumbnails where owner = ? and id = ?'),
    putThumbnail: db.prepare('insert into thumbnails (owner, id, thumbnail_data_url, content_blob, mime_type, byte_size, metadata_json) values (?, ?, ?, ?, ?, ?, ?) on conflict(owner, id) do update set thumbnail_data_url = excluded.thumbnail_data_url, content_blob = excluded.content_blob, mime_type = excluded.mime_type, byte_size = excluded.byte_size, metadata_json = excluded.metadata_json'),
    getAllAmazonPlannerSessions: db.prepare('select record_json from amazon_planner_sessions where owner = ? order by updated_at desc, id desc'),
    putAmazonPlannerSession: db.prepare('insert into amazon_planner_sessions (owner, id, record_json, updated_at) values (?, ?, ?, ?) on conflict(owner, id) do update set record_json = excluded.record_json, updated_at = excluded.updated_at'),
    deleteAmazonPlannerSession: db.prepare('delete from amazon_planner_sessions where owner = ? and id = ?'),
    clearAmazonPlannerSessions: db.prepare('delete from amazon_planner_sessions where owner = ?'),
    getAllProductWorkspaces: db.prepare('select record_json from product_workspaces where owner = ? order by updated_at desc, id desc'),
    putProductWorkspace: db.prepare('insert into product_workspaces (owner, id, record_json, updated_at) values (?, ?, ?, ?) on conflict(owner, id) do update set record_json = excluded.record_json, updated_at = excluded.updated_at'),
    deleteProductWorkspace: db.prepare('delete from product_workspaces where owner = ? and id = ?'),
    clearProductWorkspaces: db.prepare('delete from product_workspaces where owner = ?'),
    createUser: db.prepare('insert into users (id, email, phone, password_hash, role, status, token_limit, created_at, last_login_at) values (?, ?, ?, ?, ?, ?, ?, ?, null)'),
    getUserById: db.prepare('select id, email, phone, password_hash, role, status, token_limit, created_at, last_login_at from users where id = ?'),
    findUserByIdentifier: db.prepare('select id, email, phone, password_hash, role, status, token_limit, created_at, last_login_at from users where email = ? or phone = ?'),
    setUserStatus: db.prepare('update users set status = ? where id = ?'),
    setUserPasswordHash: db.prepare('update users set password_hash = ? where id = ?'),
    setUserTokenLimit: db.prepare('update users set token_limit = ? where id = ?'),
    touchUserLogin: db.prepare('update users set last_login_at = ? where id = ?'),
    listUsers: db.prepare('select id, email, phone, password_hash, role, status, token_limit, created_at, last_login_at from users order by created_at desc, id desc'),
    getAllUserTasks: db.prepare(`
      select
        tasks.owner,
        users.id as user_id,
        users.email,
        users.phone,
        users.role,
        users.status as user_status,
        tasks.record_json,
        tasks.created_at
      from tasks
      left join users on users.id = tasks.owner
      order by tasks.created_at desc, tasks.id desc
      limit ?
    `),
    getAllUserProductWorkspaces: db.prepare(`
      select
        product_workspaces.owner,
        users.id as user_id,
        users.email,
        users.phone,
        users.role,
        users.status as user_status,
        product_workspaces.record_json,
        product_workspaces.updated_at
      from product_workspaces
      left join users on users.id = product_workspaces.owner
      order by product_workspaces.updated_at desc, product_workspaces.id desc
      limit ?
    `),
    recordUsageEvent: db.prepare('insert into usage_events (id, user_id, event_type, status, endpoint, model, generated_images, prompt_tokens, completion_tokens, total_tokens, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getUsageSummary: db.prepare(`
      select
        users.id as user_id,
        users.email,
        users.phone,
        users.role,
        users.status as user_status,
        users.token_limit,
        count(usage_events.id) as calls,
        sum(case when usage_events.status = 'ok' then 1 else 0 end) as successes,
        sum(case when usage_events.status <> 'ok' then 1 else 0 end) as failures,
        sum(usage_events.generated_images) as generated_images,
        sum(usage_events.prompt_tokens) as prompt_tokens,
        sum(usage_events.completion_tokens) as completion_tokens,
        sum(usage_events.total_tokens) as total_tokens,
        max(usage_events.created_at) as last_used_at
      from users
      left join usage_events on usage_events.user_id = users.id
      where users.id = ?
      group by users.id
    `),
    getUsageEvents: db.prepare('select id, user_id, event_type, status, endpoint, model, generated_images, prompt_tokens, completion_tokens, total_tokens, created_at from usage_events where user_id = ? order by created_at desc, id desc limit ?'),
    recordApiProxyLog: db.prepare('insert into api_proxy_logs (id, user_id, endpoint, status, upstream_status, upstream_request_id, content_type, error_type, error_code, error_message, generated_images, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getApiProxyLogs: db.prepare('select id, user_id, endpoint, status, upstream_status, upstream_request_id, content_type, error_type, error_code, error_message, generated_images, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at from api_proxy_logs where user_id = ? order by created_at desc, id desc limit ?'),
    getAllUsageSummaries: db.prepare(`
      select
        users.id as user_id,
        users.email,
        users.phone,
        users.role,
        users.status as user_status,
        users.token_limit,
        count(usage_events.id) as calls,
        sum(case when usage_events.status = 'ok' then 1 else 0 end) as successes,
        sum(case when usage_events.status <> 'ok' then 1 else 0 end) as failures,
        sum(usage_events.generated_images) as generated_images,
        sum(usage_events.prompt_tokens) as prompt_tokens,
        sum(usage_events.completion_tokens) as completion_tokens,
        sum(usage_events.total_tokens) as total_tokens,
        max(usage_events.created_at) as last_used_at
      from users
      left join usage_events on usage_events.user_id = users.id
      group by users.id
      order by calls desc, users.created_at desc, users.id desc
    `),
    getAllUsageEvents: db.prepare('select id, user_id, event_type, status, endpoint, model, generated_images, prompt_tokens, completion_tokens, total_tokens, created_at from usage_events order by created_at desc, id desc limit ?'),
    getAllApiProxyLogs: db.prepare('select id, user_id, endpoint, status, upstream_status, upstream_request_id, content_type, error_type, error_code, error_message, generated_images, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at from api_proxy_logs order by created_at desc, id desc limit ?'),
  }

  return {
    createUser(user) {
      const id = user.id ?? randomUUID()
      statements.createUser.run(
        id,
        normalizeOptionalText(user.email),
        normalizeOptionalText(user.phone),
        user.passwordHash,
        user.role,
        user.status,
        user.tokenLimit ?? null,
        user.createdAt,
      )
      return parseUser(statements.getUserById.get(id))
    },
    getUserById(id) {
      return parseUser(statements.getUserById.get(id))
    },
    findUserByIdentifier(identifier) {
      const normalizedIdentifier = String(identifier ?? '').trim()
      return parseUser(statements.findUserByIdentifier.get(normalizedIdentifier, normalizedIdentifier))
    },
    setUserStatus(id, status) {
      statements.setUserStatus.run(status, id)
    },
    setUserPasswordHash(id, passwordHash) {
      statements.setUserPasswordHash.run(passwordHash, id)
    },
    setUserTokenLimit(id, tokenLimit) {
      statements.setUserTokenLimit.run(tokenLimit == null ? null : Number(tokenLimit), id)
    },
    touchUserLogin(id, lastLoginAt) {
      statements.touchUserLogin.run(lastLoginAt, id)
    },
    listUsers() {
      return statements.listUsers.all().map(parseUser)
    },
    getAllUserTasks(limit = 100) {
      return statements.getAllUserTasks.all(limit).map(parseAdminTask)
    },
    getAllUserProductWorkspaces(limit = 1000) {
      return statements.getAllUserProductWorkspaces.all(limit).map(parseAdminProductWorkspace)
    },
    ensureAdminUser(user) {
      const identifier = user.email || user.phone
      const existing = this.findUserByIdentifier(identifier)
      if (existing) return existing
      return this.createUser({
        ...user,
        role: 'admin',
        status: 'active',
      })
    },
    recordUsageEvent(event) {
      const id = event.id ?? randomUUID()
      statements.recordUsageEvent.run(
        id,
        event.userId,
        event.eventType,
        event.status,
        event.endpoint ?? '',
        event.model ?? '',
        event.generatedImages ?? 0,
        event.promptTokens ?? 0,
        event.completionTokens ?? 0,
        event.totalTokens ?? 0,
        event.createdAt,
      )
      return id
    },
    recordApiProxyLog(log) {
      const id = log.id ?? randomUUID()
      statements.recordApiProxyLog.run(
        id,
        log.userId,
        log.endpoint ?? '',
        log.status,
        log.upstreamStatus ?? null,
        log.upstreamRequestId ?? '',
        log.contentType ?? '',
        log.errorType ?? '',
        log.errorCode ?? '',
        log.errorMessage ?? '',
        log.generatedImages ?? 0,
        log.promptTokens ?? 0,
        log.completionTokens ?? 0,
        log.totalTokens ?? 0,
        log.durationMs ?? 0,
        log.createdAt,
      )
      return id
    },
    getUsageSummary(userId) {
      return parseUsageSummary(statements.getUsageSummary.get(userId))
    },
    getUsageEvents(userId, limit = 50) {
      return statements.getUsageEvents.all(userId, limit).map(parseUsageEvent)
    },
    getApiProxyLogs(userId, limit = 50) {
      return statements.getApiProxyLogs.all(userId, limit).map(parseApiProxyLog)
    },
    getAllUsageSummaries() {
      return statements.getAllUsageSummaries.all().map(parseUsageSummary)
    },
    getAllUsageEvents(limit = 100) {
      return statements.getAllUsageEvents.all(limit).map(parseUsageEvent)
    },
    getAllApiProxyLogs(limit = 100) {
      return statements.getAllApiProxyLogs.all(limit).map(parseApiProxyLog)
    },
    getAllTasks(owner) {
      return statements.getAllTasks.all(normalizeOwner(owner)).map(parseJsonRecord)
    },
    putTask(owner, task) {
      statements.putTask.run(normalizeOwner(owner), task.id, JSON.stringify(task), task.createdAt ?? null)
      return task.id
    },
    deleteTask(owner, id) {
      statements.deleteTask.run(normalizeOwner(owner), id)
    },
    clearTasks(owner) {
      statements.clearTasks.run(normalizeOwner(owner))
    },
    getAllAgentConversations(owner) {
      return statements.getAllAgentConversations.all(normalizeOwner(owner)).map(parseJsonRecord)
    },
    putAgentConversation(owner, conversation) {
      statements.putAgentConversation.run(normalizeOwner(owner), conversation.id, JSON.stringify(conversation), conversation.updatedAt ?? null)
      return conversation.id
    },
    deleteAgentConversation(owner, id) {
      statements.deleteAgentConversation.run(normalizeOwner(owner), id)
    },
    clearAgentConversations(owner) {
      statements.clearAgentConversations.run(normalizeOwner(owner))
    },
    getImage(owner, id) {
      return parseImage(statements.getImage.get(normalizeOwner(owner), id))
    },
    getImageContent(owner, id) {
      return parseImageContent(statements.getImage.get(normalizeOwner(owner), id))
    },
    getAllImages(owner) {
      return statements.getAllImages.all(normalizeOwner(owner)).map(parseImage)
    },
    getAllImageIds(owner) {
      return statements.getAllImageIds.all(normalizeOwner(owner)).map((row) => row.id)
    },
    putImage(owner, image) {
      const { id, dataUrl, ...metadata } = image
      const content = decodeDataUrl(dataUrl)
      statements.putImage.run(normalizeOwner(owner), id, content.storageDataUrl, content.bytes, content.mimeType, content.bytes.byteLength, JSON.stringify(metadata), image.createdAt ?? null)
      return id
    },
    deleteImage(owner, id) {
      const normalizedOwner = normalizeOwner(owner)
      db.transaction(() => {
        statements.deleteImage.run(normalizedOwner, id)
        statements.deleteImageThumbnail.run(normalizedOwner, id)
      })()
    },
    clearImages(owner) {
      const normalizedOwner = normalizeOwner(owner)
      db.transaction(() => {
        statements.clearImages.run(normalizedOwner)
        statements.clearThumbnails.run(normalizedOwner)
      })()
    },
    getStoredImageThumbnail(owner, id) {
      return parseThumbnail(statements.getThumbnail.get(normalizeOwner(owner), id))
    },
    getImageThumbnailContent(owner, id) {
      return parseImageContent(statements.getThumbnail.get(normalizeOwner(owner), id), 'thumbnail_data_url')
    },
    putImageThumbnail(owner, thumbnail) {
      const { id, thumbnailDataUrl, dataUrl, ...metadata } = thumbnail
      const inputDataUrl = thumbnailDataUrl ?? dataUrl
      const content = decodeDataUrl(inputDataUrl)
      statements.putThumbnail.run(normalizeOwner(owner), id, content.storageDataUrl, content.bytes, content.mimeType, content.bytes.byteLength, JSON.stringify({ ...metadata, thumbnailDataUrl: inputDataUrl }))
      return id
    },
    getAllAmazonPlannerSessions(owner) {
      return statements.getAllAmazonPlannerSessions.all(normalizeOwner(owner)).map(parseJsonRecord)
    },
    putAmazonPlannerSession(owner, session) {
      statements.putAmazonPlannerSession.run(normalizeOwner(owner), session.id, JSON.stringify(session), session.updatedAt ?? null)
      return session.id
    },
    deleteAmazonPlannerSession(owner, id) {
      statements.deleteAmazonPlannerSession.run(normalizeOwner(owner), id)
    },
    clearAmazonPlannerSessions(owner) {
      statements.clearAmazonPlannerSessions.run(normalizeOwner(owner))
    },
    getAllProductWorkspaces(owner) {
      return statements.getAllProductWorkspaces.all(normalizeOwner(owner)).map(parseJsonRecord)
    },
    putProductWorkspace(owner, workspace) {
      statements.putProductWorkspace.run(normalizeOwner(owner), workspace.id, JSON.stringify(workspace), workspace.updatedAt ?? null)
      return workspace.id
    },
    deleteProductWorkspace(owner, id) {
      statements.deleteProductWorkspace.run(normalizeOwner(owner), id)
    },
    clearProductWorkspaces(owner) {
      statements.clearProductWorkspaces.run(normalizeOwner(owner))
    },
    close() {
      db.close()
    },
  }
}
