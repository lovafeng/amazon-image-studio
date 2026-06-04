export interface AuthSession {
  authenticated: boolean
  user?: AuthUser
}

export interface AuthUser {
  id: string
  email?: string
  phone?: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  createdAt?: number
  lastLoginAt?: number
}

export interface RegisterInput {
  email: string
  phone: string
  password: string
}

async function readAuthResponse(response: Response): Promise<AuthSession> {
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error ?? '认证失败')
  return body
}

export async function getCurrentSession(): Promise<AuthSession> {
  return readAuthResponse(await fetch('/api/auth/me', { credentials: 'same-origin' }))
}

export async function login(identifier: string, password: string): Promise<AuthSession> {
  return readAuthResponse(await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  }))
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  return readAuthResponse(await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })
}
