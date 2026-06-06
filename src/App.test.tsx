import { describe, expect, it } from 'vitest'
import { canUseAmazonPlanner } from './App'
import type { AuthUser } from './lib/auth'

function user(role: AuthUser['role']): AuthUser {
  return {
    id: `${role}-a`,
    email: `${role}@example.com`,
    role,
    status: 'active',
  }
}

describe('App permissions', () => {
  it('allows authenticated users to use the Amazon planner', () => {
    expect(canUseAmazonPlanner(user('admin'))).toBe(true)
    expect(canUseAmazonPlanner(user('user'))).toBe(true)
    expect(canUseAmazonPlanner(undefined)).toBe(false)
  })
})
