# New User Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-time game-style onboarding guide immediately after a newly registered user enters the workspace.

**Architecture:** Keep onboarding state entirely in the frontend. `App.handleRegister` is the trigger, `src/lib/onboarding.ts` owns localStorage keys, and `NewUserOnboardingModal` owns a coach mark overlay that highlights native workspace regions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, `renderToStaticMarkup`.

---

## File Structure

- Create `src/lib/onboarding.ts`: localStorage key construction and completion helpers.
- Create `src/lib/onboarding.test.ts`: helper behavior tests.
- Create `src/components/NewUserOnboardingModal.tsx`: one-time coach mark overlay.
- Create `src/components/NewUserOnboardingModal.test.tsx`: static render smoke test.
- Modify `src/App.tsx`: trigger guide after successful registration and mark completion on close.
- Modify `src/components/AmazonPlanner.tsx`, `src/components/SearchBar.tsx`, and `src/components/InputBar.tsx`: add stable `data-onboarding-target` markers.

### Task 1: Onboarding State Helper

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/onboarding.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNewUserOnboardingStorageKey,
  hasCompletedNewUserOnboarding,
  markNewUserOnboardingComplete,
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
})
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npm test -- src/lib/onboarding.test.ts`

Expected: FAIL because `src/lib/onboarding.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

```ts
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
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npm test -- src/lib/onboarding.test.ts`

Expected: PASS.

### Task 2: Onboarding Coach Mark Component

**Files:**
- Create: `src/components/NewUserOnboardingModal.tsx`
- Test: `src/components/NewUserOnboardingModal.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NewUserOnboardingModal from './NewUserOnboardingModal'

describe('NewUserOnboardingModal', () => {
  it('renders a game-style guide with progress controls', () => {
    const html = renderToStaticMarkup(<NewUserOnboardingModal onComplete={() => {}} />)

    expect(html).toContain('新手任务')
    expect(html).toContain('1 / 5')
    expect(html).toContain('下一步')
    expect(html).toContain('跳过引导')
    expect(html).toContain('先认识工作台')
  })
})
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/components/NewUserOnboardingModal.test.tsx`

Expected: FAIL because `NewUserOnboardingModal` does not exist.

- [ ] **Step 3: Implement coach mark guide**

Create a fixed overlay component with `role="dialog"`, a target highlight, a floating guide card, and previous/next/finish controls. Export `newUserOnboardingSteps` with selectors for native workspace targets.

- [ ] **Step 4: Run component tests and verify GREEN**

Run: `npm test -- src/components/NewUserOnboardingModal.test.tsx`

Expected: PASS.

### Task 3: Register Flow Trigger

**Files:**
- Modify: `src/App.tsx`
- Test: `src/lib/onboarding.test.ts`, `src/components/NewUserOnboardingModal.test.tsx`, `src/components/LoginPage.test.tsx`

- [ ] **Step 1: Wire modal state into App**

Add a `showNewUserOnboarding` state. After `handleRegister` loads account data and receives `session.user`, call `hasCompletedNewUserOnboarding(session.user.id)`. If false, show the modal.

- [ ] **Step 2: Complete onboarding from App**

Render `NewUserOnboardingModal` when authenticated workspace data is ready and `showNewUserOnboarding` is true. On complete, call `markNewUserOnboardingComplete(user.id)` and hide the modal.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- src/lib/onboarding.test.ts src/components/NewUserOnboardingModal.test.tsx src/components/LoginPage.test.tsx
```

Expected: PASS.

### Task 4: Build and Browser Acceptance

**Files:**
- No new code files.

- [ ] **Step 1: Run full build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Start local dev app**

Run: `npm run dev:app`

Expected: Vite and API server are available locally.

- [ ] **Step 3: Verify in in-app browser**

Open the local app. Register a new user. Confirm the onboarding modal appears after the workspace loads. Click “开始使用”, confirm the modal closes, refresh, and confirm it does not reappear for that user on this device.

## Self-Review

- Spec coverage: registration-only trigger, local per-user completion, modal content, no backend changes, and browser acceptance are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: helper names match usage planned for `App.tsx`.
