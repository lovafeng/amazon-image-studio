import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'ais_session'
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export function hashPassword(password, salt = randomBytes(16).toString('base64url')) {
  const hash = scryptSync(String(password), salt, 32).toString('base64url')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password, storedHash) {
  const [, salt, expected] = String(storedHash).split(':')
  const actual = scryptSync(String(password), salt, 32).toString('base64url')
  return actual === expected
}

function sign(config, payload) {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function compareSignatures(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createSessionToken(config, username, now = Date.now()) {
  const payload = encodePayload({
    username,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  })
  return `${payload}.${sign(config, payload)}`
}

function getAccounts(config) {
  return Array.isArray(config.accounts) && config.accounts.length
    ? config.accounts
    : [{ username: config.adminUsername, password: config.adminPassword }]
}

function hasAccount(config, username) {
  return getAccounts(config).some((account) => account.username === username)
}

export function verifySessionToken(config, token, now = Date.now()) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !compareSignatures(signature, sign(config, payload))) return null

  const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (session.expiresAt <= now || !hasAccount(config, session.username)) return null

  return { username: session.username }
}

export function getCookieHeader(cookieHeader, name) {
  return String(cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export function createSessionCookie(config, username, now = Date.now()) {
  const token = createSessionToken(config, username, now)
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax; Path=/`
}

export function createClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/`
}

export function getRequestSession(config, req, now = Date.now()) {
  const token = getCookieHeader(req.headers.cookie, SESSION_COOKIE_NAME)
  return token ? verifySessionToken(config, decodeURIComponent(token), now) : null
}

export function isAdminLogin(config, credentials) {
  return getAccounts(config).some((account) => account.username === credentials?.username && account.password === credentials?.password)
}
