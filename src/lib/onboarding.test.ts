import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNewUserOnboardingStorageKey,
  hasCompletedNewUserOnboarding,
  markNewUserOnboardingComplete,
  shouldShowNewUserOnboardingAfterRegister,
} from './onboarding'

describe('new user onboarding state', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
    })
  })

  it('builds a versioned per-user storage key', () => {
    expect(getNewUserOnboardingStorageKey('user-a')).toBe('amazon-image-studio:new-user-onboarding:user-a:v1')
  })

  it('marks onboarding complete for one user without completing another user', () => {
    expect(hasCompletedNewUserOnboarding('user-a')).toBe(false)

    markNewUserOnboardingComplete('user-a')

    expect(hasCompletedNewUserOnboarding('user-a')).toBe(true)
    expect(hasCompletedNewUserOnboarding('user-b')).toBe(false)
  })

  it('shows onboarding after registration only when the current user has not completed it', () => {
    expect(shouldShowNewUserOnboardingAfterRegister('user-a')).toBe(true)

    markNewUserOnboardingComplete('user-a')

    expect(shouldShowNewUserOnboardingAfterRegister('user-a')).toBe(false)
  })
})
