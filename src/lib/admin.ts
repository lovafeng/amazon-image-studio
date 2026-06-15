import type { AuthUser } from './auth'
import type { TaskRecord } from '../types'

export interface UsageSummary {
  userId: string
  email?: string
  phone?: string
  role?: string
  status?: string
  calls: number
  successes: number
  failures: number
  generatedImages: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  tokenLimit?: number | null
  lastUsedAt?: number
}

export interface UsageEvent {
  id: string
  userId: string
  eventType: string
  status: string
  endpoint: string
  model: string
  generatedImages: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: number
}

export type AdminUser = AuthUser & {
  usage?: UsageSummary
}

export interface AdminTask {
  owner: string
  userId: string
  email?: string
  phone?: string
  role?: string
  status?: string
  task: TaskRecord
}

export interface AdminSummary {
  users: number
  activeUsers: number
  calls: number
  successes: number
  failures: number
  generatedImages: number
  totalTokens: number
}

export interface AdminOperationsSummary {
  northStar: {
    completedImageSets: number
  }
  funnel: {
    workspaces: number
    preparedWorkspaces: number
    sixViewGeneratedWorkspaces: number
    sixViewConfirmedWorkspaces: number
    styleGeneratedWorkspaces: number
    styleGeneratedImages: number
    plannedWorkspaces: number
    imageStartedWorkspaces: number
    completedImageSets: number
  }
  efficiency: {
    imageTaskP80Seconds: number
    imageTaskAverageSeconds: number
  }
  stability: {
    imageTasks: number
    imageTaskSuccesses: number
    imageTaskFailures: number
    imageTaskSuccessRate: number
    imageTaskFailureRate: number
  }
  cost: {
    calls: number
    totalTokens: number
    generatedImages: number
    callsPerCompletedImageSet: number
  }
  quality: {
    favoriteTasks: number
    favoriteRate: number
  }
}

export interface UsagePayload {
  summary?: UsageSummary
  summaries?: UsageSummary[]
  events: UsageEvent[]
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error ?? '请求失败')
  return body
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const body = await readJsonResponse<{ items: AdminUser[] }>(await fetch('/api/admin/users', {
    credentials: 'same-origin',
  }))
  return body.items
}

export async function getAdminSummary(): Promise<AdminSummary> {
  return readJsonResponse(await fetch('/api/admin/summary', {
    credentials: 'same-origin',
  }))
}

export async function getAdminUsage(): Promise<UsagePayload> {
  return readJsonResponse(await fetch('/api/admin/usage', {
    credentials: 'same-origin',
  }))
}

export async function getAdminTasks(): Promise<AdminTask[]> {
  const body = await readJsonResponse<{ items: AdminTask[] }>(await fetch('/api/admin/tasks', {
    credentials: 'same-origin',
  }))
  return body.items
}

export async function getAdminOperations(): Promise<AdminOperationsSummary> {
  return readJsonResponse(await fetch('/api/admin/operations', {
    credentials: 'same-origin',
  }))
}

export async function getMyUsage(): Promise<UsagePayload> {
  return readJsonResponse(await fetch('/api/usage/me', {
    credentials: 'same-origin',
  }))
}

export async function setUserStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  await readJsonResponse(await fetch(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  }))
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await readJsonResponse(await fetch(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  }))
}

export async function setUserTokenLimit(id: string, tokenLimit: number | null): Promise<void> {
  await readJsonResponse(await fetch(`/api/admin/users/${encodeURIComponent(id)}/token-limit`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tokenLimit }),
  }))
}
