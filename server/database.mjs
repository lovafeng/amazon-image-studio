import Database from 'better-sqlite3'
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

export function createStorage(sqlitePath) {
  mkdirSync(dirname(sqlitePath), { recursive: true })

  const db = new Database(sqlitePath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    create table if not exists tasks (
      id text primary key,
      record_json text not null,
      created_at integer
    );

    create table if not exists images (
      id text primary key,
      data_url text not null,
      metadata_json text not null,
      created_at integer
    );

    create table if not exists thumbnails (
      id text primary key,
      thumbnail_data_url text not null,
      metadata_json text not null
    );

    create table if not exists amazon_planner_sessions (
      id text primary key,
      record_json text not null,
      updated_at integer
    );
  `)

  const statements = {
    getAllTasks: db.prepare('select record_json from tasks order by created_at desc, id desc'),
    putTask: db.prepare('insert into tasks (id, record_json, created_at) values (?, ?, ?) on conflict(id) do update set record_json = excluded.record_json, created_at = excluded.created_at'),
    deleteTask: db.prepare('delete from tasks where id = ?'),
    clearTasks: db.prepare('delete from tasks'),
    getImage: db.prepare('select id, data_url, metadata_json from images where id = ?'),
    getAllImages: db.prepare('select id, data_url, metadata_json from images order by created_at desc, id desc'),
    getAllImageIds: db.prepare('select id from images order by created_at desc, id desc'),
    putImage: db.prepare('insert into images (id, data_url, metadata_json, created_at) values (?, ?, ?, ?) on conflict(id) do update set data_url = excluded.data_url, metadata_json = excluded.metadata_json, created_at = excluded.created_at'),
    deleteImage: db.prepare('delete from images where id = ?'),
    clearImages: db.prepare('delete from images'),
    deleteImageThumbnail: db.prepare('delete from thumbnails where id = ?'),
    clearThumbnails: db.prepare('delete from thumbnails'),
    getThumbnail: db.prepare('select id, thumbnail_data_url, metadata_json from thumbnails where id = ?'),
    putThumbnail: db.prepare('insert into thumbnails (id, thumbnail_data_url, metadata_json) values (?, ?, ?) on conflict(id) do update set thumbnail_data_url = excluded.thumbnail_data_url, metadata_json = excluded.metadata_json'),
    getAllAmazonPlannerSessions: db.prepare('select record_json from amazon_planner_sessions order by updated_at desc, id desc'),
    putAmazonPlannerSession: db.prepare('insert into amazon_planner_sessions (id, record_json, updated_at) values (?, ?, ?) on conflict(id) do update set record_json = excluded.record_json, updated_at = excluded.updated_at'),
    deleteAmazonPlannerSession: db.prepare('delete from amazon_planner_sessions where id = ?'),
    clearAmazonPlannerSessions: db.prepare('delete from amazon_planner_sessions'),
  }

  return {
    getAllTasks() {
      return statements.getAllTasks.all().map(parseJsonRecord)
    },
    putTask(task) {
      statements.putTask.run(task.id, JSON.stringify(task), task.createdAt ?? null)
      return task.id
    },
    deleteTask(id) {
      statements.deleteTask.run(id)
    },
    clearTasks() {
      statements.clearTasks.run()
    },
    getImage(id) {
      return parseImage(statements.getImage.get(id))
    },
    getAllImages() {
      return statements.getAllImages.all().map(parseImage)
    },
    getAllImageIds() {
      return statements.getAllImageIds.all().map((row) => row.id)
    },
    putImage(image) {
      const { id, dataUrl, ...metadata } = image
      statements.putImage.run(id, dataUrl, JSON.stringify(metadata), image.createdAt ?? null)
      return id
    },
    deleteImage(id) {
      db.transaction(() => {
        statements.deleteImage.run(id)
        statements.deleteImageThumbnail.run(id)
      })()
    },
    clearImages() {
      db.transaction(() => {
        statements.clearImages.run()
        statements.clearThumbnails.run()
      })()
    },
    getStoredImageThumbnail(id) {
      return parseThumbnail(statements.getThumbnail.get(id))
    },
    putImageThumbnail(thumbnail) {
      const { id, thumbnailDataUrl, ...metadata } = thumbnail
      statements.putThumbnail.run(id, thumbnailDataUrl, JSON.stringify(metadata))
      return id
    },
    getAllAmazonPlannerSessions() {
      return statements.getAllAmazonPlannerSessions.all().map(parseJsonRecord)
    },
    putAmazonPlannerSession(session) {
      statements.putAmazonPlannerSession.run(session.id, JSON.stringify(session), session.updatedAt ?? null)
      return session.id
    },
    deleteAmazonPlannerSession(id) {
      statements.deleteAmazonPlannerSession.run(id)
    },
    clearAmazonPlannerSessions() {
      statements.clearAmazonPlannerSessions.run()
    },
    close() {
      db.close()
    },
  }
}
