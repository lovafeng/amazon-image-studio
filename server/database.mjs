import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function parseJsonRecord(row) {
  return row ? JSON.parse(row.record_json) : undefined
}

function parseImage(row) {
  if (!row) return undefined
  return {
    id: row.id,
    dataUrl: row.data_url,
    ...JSON.parse(row.metadata_json),
  }
}

function parseThumbnail(row) {
  if (!row) return undefined
  return {
    id: row.id,
    thumbnailDataUrl: row.thumbnail_data_url,
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
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
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

    create table if not exists images (
      owner text not null,
      id text not null,
      data_url text not null,
      metadata_json text not null,
      created_at integer,
      primary key (owner, id)
    );

    create table if not exists thumbnails (
      owner text not null,
      id text not null,
      thumbnail_data_url text not null,
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
  `)
}

function createOwnedIndexes(db) {
  db.exec(`
    create index if not exists users_role_status_idx on users (role, status);
    create index if not exists tasks_owner_created_idx on tasks (owner, created_at desc, id desc);
    create index if not exists images_owner_created_idx on images (owner, created_at desc, id desc);
    create index if not exists amazon_planner_sessions_owner_updated_idx on amazon_planner_sessions (owner, updated_at desc, id desc);
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
  for (const tableName of ['tasks', 'images', 'thumbnails', 'amazon_planner_sessions']) {
    migrateOwnedTable(db, tableName, legacyOwner)
  }
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
    getImage: db.prepare('select id, data_url, metadata_json from images where owner = ? and id = ?'),
    getAllImages: db.prepare('select id, data_url, metadata_json from images where owner = ? order by created_at desc, id desc'),
    getAllImageIds: db.prepare('select id from images where owner = ? order by created_at desc, id desc'),
    putImage: db.prepare('insert into images (owner, id, data_url, metadata_json, created_at) values (?, ?, ?, ?, ?) on conflict(owner, id) do update set data_url = excluded.data_url, metadata_json = excluded.metadata_json, created_at = excluded.created_at'),
    deleteImage: db.prepare('delete from images where owner = ? and id = ?'),
    clearImages: db.prepare('delete from images where owner = ?'),
    deleteImageThumbnail: db.prepare('delete from thumbnails where owner = ? and id = ?'),
    clearThumbnails: db.prepare('delete from thumbnails where owner = ?'),
    getThumbnail: db.prepare('select id, thumbnail_data_url, metadata_json from thumbnails where owner = ? and id = ?'),
    putThumbnail: db.prepare('insert into thumbnails (owner, id, thumbnail_data_url, metadata_json) values (?, ?, ?, ?) on conflict(owner, id) do update set thumbnail_data_url = excluded.thumbnail_data_url, metadata_json = excluded.metadata_json'),
    getAllAmazonPlannerSessions: db.prepare('select record_json from amazon_planner_sessions where owner = ? order by updated_at desc, id desc'),
    putAmazonPlannerSession: db.prepare('insert into amazon_planner_sessions (owner, id, record_json, updated_at) values (?, ?, ?, ?) on conflict(owner, id) do update set record_json = excluded.record_json, updated_at = excluded.updated_at'),
    deleteAmazonPlannerSession: db.prepare('delete from amazon_planner_sessions where owner = ? and id = ?'),
    clearAmazonPlannerSessions: db.prepare('delete from amazon_planner_sessions where owner = ?'),
    createUser: db.prepare('insert into users (id, email, phone, password_hash, role, status, created_at, last_login_at) values (?, ?, ?, ?, ?, ?, ?, null)'),
    getUserById: db.prepare('select id, email, phone, password_hash, role, status, created_at, last_login_at from users where id = ?'),
    findUserByIdentifier: db.prepare('select id, email, phone, password_hash, role, status, created_at, last_login_at from users where email = ? or phone = ?'),
    setUserStatus: db.prepare('update users set status = ? where id = ?'),
    setUserPasswordHash: db.prepare('update users set password_hash = ? where id = ?'),
    touchUserLogin: db.prepare('update users set last_login_at = ? where id = ?'),
    listUsers: db.prepare('select id, email, phone, password_hash, role, status, created_at, last_login_at from users order by created_at desc, id desc'),
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
    touchUserLogin(id, lastLoginAt) {
      statements.touchUserLogin.run(lastLoginAt, id)
    },
    listUsers() {
      return statements.listUsers.all().map(parseUser)
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
    getImage(owner, id) {
      return parseImage(statements.getImage.get(normalizeOwner(owner), id))
    },
    getAllImages(owner) {
      return statements.getAllImages.all(normalizeOwner(owner)).map(parseImage)
    },
    getAllImageIds(owner) {
      return statements.getAllImageIds.all(normalizeOwner(owner)).map((row) => row.id)
    },
    putImage(owner, image) {
      const { id, dataUrl, ...metadata } = image
      statements.putImage.run(normalizeOwner(owner), id, dataUrl, JSON.stringify(metadata), image.createdAt ?? null)
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
    putImageThumbnail(owner, thumbnail) {
      const { id, thumbnailDataUrl, ...metadata } = thumbnail
      statements.putThumbnail.run(normalizeOwner(owner), id, thumbnailDataUrl, JSON.stringify(metadata))
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
    close() {
      db.close()
    },
  }
}
