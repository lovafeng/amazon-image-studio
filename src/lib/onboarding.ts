const NEW_USER_ONBOARDING_VERSION = 'v1'
const NEW_USER_ONBOARDING_DONE = 'done'

export function getNewUserOnboardingStorageKey(userId: string) {
  return `amazon-image-studio:new-user-onboarding:${userId}:${NEW_USER_ONBOARDING_VERSION}`
}

export function hasCompletedNewUserOnboarding(userId: string) {
  return localStorage.getItem(getNewUserOnboardingStorageKey(userId)) === NEW_USER_ONBOARDING_DONE
}

export function markNewUserOnboardingComplete(userId: string) {
  localStorage.setItem(getNewUserOnboardingStorageKey(userId), NEW_USER_ONBOARDING_DONE)
}

export function shouldShowNewUserOnboardingAfterRegister(userId: string) {
  return !hasCompletedNewUserOnboarding(userId)
}
