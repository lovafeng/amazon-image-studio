import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
  it('allows authenticated users to use the Amazon planner', async () => {
    const { canUseAmazonPlanner } = await import('./App')

    expect(canUseAmazonPlanner(user('admin'))).toBe(true)
    expect(canUseAmazonPlanner(user('user'))).toBe(true)
    expect(canUseAmazonPlanner(undefined)).toBe(false)
  })
})

function createHookHarness() {
  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  const depsList: Array<unknown[] | undefined> = []
  const cleanups: Array<(() => void) | undefined> = []
  let stateIndex = 0
  let refIndex = 0
  let effectIndex = 0
  let pendingEffects: Array<() => void> = []

  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  const useState = <T,>(initialValue: T | (() => T)) => {
    const index = stateIndex++
    if (!(index in states)) {
      states[index] = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
    }

    const setState = (nextValue: T | ((currentValue: T) => T)) => {
      states[index] = typeof nextValue === 'function'
        ? (nextValue as (currentValue: T) => T)(states[index] as T)
        : nextValue
    }

    return [states[index] as T, setState] as const
  }

  const useRef = <T,>(initialValue: T) => {
    const index = refIndex++
    if (!refs[index]) refs[index] = { current: initialValue }
    return refs[index] as { current: T }
  }

  const useEffect = (effect: () => void | (() => void), deps?: unknown[]) => {
    const index = effectIndex++
    const previousDeps = depsList[index]
    const changed = !deps || !previousDeps || deps.length !== previousDeps.length || deps.some((dep, depIndex) => !Object.is(dep, previousDeps[depIndex]))

    if (changed) {
      depsList[index] = deps
      pendingEffects.push(() => {
        cleanups[index]?.()
        const cleanup = effect()
        cleanups[index] = typeof cleanup === 'function' ? cleanup : undefined
      })
    }
  }

  const render = async (App: () => React.ReactNode) => {
    stateIndex = 0
    refIndex = 0
    effectIndex = 0
    pendingEffects = []
    const element = App()
    const html = renderToStaticMarkup(element)
    pendingEffects.forEach((runEffect) => runEffect())
    await flush()
    return { element, html }
  }

  return { flush, render, useEffect, useRef, useState }
}

function textContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (typeof node === 'object' && 'props' in node) return textContent((node as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  return ''
}

function findButton(element: React.ReactNode, label: string): React.ReactElement<{ onClick?: () => void }> | null {
  if (element === null || element === undefined || typeof element === 'boolean' || typeof element === 'string' || typeof element === 'number') return null
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findButton(child, label)
      if (found) return found
    }
    return null
  }

  const reactElement = element as React.ReactElement<{ children?: React.ReactNode }>
  if (reactElement.type === 'button' && textContent(reactElement.props.children).includes(label)) return reactElement as React.ReactElement<{ onClick?: () => void }>
  return findButton(reactElement.props.children, label)
}

async function renderAuthenticatedApp(options: {
  prepareStoreForAuthenticatedUser?: ReturnType<typeof vi.fn>
  initStore?: ReturnType<typeof vi.fn>
} = {}) {
  vi.resetModules()

  const harness = createHookHarness()
  const prepareStoreForAuthenticatedUser = options.prepareStoreForAuthenticatedUser ?? vi.fn().mockResolvedValue(undefined)
  const initStore = options.initStore ?? vi.fn().mockResolvedValue(undefined)
  const logout = vi.fn().mockResolvedValue(undefined)
  const storeState = {
    settings: {},
    setSettings: vi.fn(),
    setAppMode: vi.fn(),
  }
  const useStore = Object.assign(
    vi.fn((selector: (state: typeof storeState) => unknown) => selector(storeState)),
    { getState: () => storeState },
  )

  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react')
    return {
      ...actual,
      useEffect: harness.useEffect,
      useRef: harness.useRef,
      useState: harness.useState,
    }
  })
  vi.doMock('./store', () => ({
    initStore,
    prepareStoreForAuthenticatedUser,
    resetUserScopedLocalState: vi.fn(),
    useStore,
  }))
  vi.doMock('./lib/auth', () => ({
    getCurrentSession: vi.fn().mockResolvedValue({
      authenticated: true,
      user: { id: 'user-a', email: 'user@example.com', role: 'user', status: 'active' },
    }),
    login: vi.fn(),
    logout,
    register: vi.fn(),
  }))
  vi.doMock('./hooks/useDockerApiUrlMigrationNotice', () => ({ useDockerApiUrlMigrationNotice: vi.fn() }))
  vi.doMock('./lib/clickSuppression', () => ({ useGlobalClickSuppression: vi.fn() }))
  vi.doMock('./components/LoginPage', () => ({ default: () => <div>账号登录</div> }))
  vi.doMock('./components/Header', () => ({ default: () => <header>亚马逊图片工作台</header> }))
  vi.doMock('./components/AdminPanel', () => ({ default: () => <div>管理总览</div> }))
  vi.doMock('./components/UsagePanel', () => ({ default: () => <div>使用统计</div> }))
  vi.doMock('./components/NewUserOnboardingModal', () => ({ default: () => <div>新手任务</div> }))
  vi.doMock('./components/AmazonPlanner', () => ({ default: () => <div>Amazon Planner</div> }))
  vi.doMock('./components/SearchBar', () => ({ default: () => <div>Search</div> }))
  vi.doMock('./components/TaskGrid', () => ({ default: () => <div>Tasks</div> }))
  vi.doMock('./components/InputBar', () => ({ default: () => <div>Input</div> }))
  vi.doMock('./components/DetailModal', () => ({ default: () => null }))
  vi.doMock('./components/Lightbox', () => ({ default: () => null }))
  vi.doMock('./components/SettingsModal', () => ({ default: () => null }))
  vi.doMock('./components/ConfirmDialog', () => ({ default: () => null }))
  vi.doMock('./components/Toast', () => ({ default: () => null }))
  vi.doMock('./components/MaskEditorModal', () => ({ default: () => null }))
  vi.doMock('./components/ImageContextMenu', () => ({ default: () => null }))

  vi.stubGlobal('window', {
    history: { replaceState: vi.fn() },
    location: { hash: '', pathname: '/', search: '' },
  })
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })

  const { default: App } = await import('./App')
  let result = await harness.render(App)
  result = await harness.render(App)
  result = await harness.render(App)

  return {
    App,
    harness,
    initStore,
    logout,
    prepareStoreForAuthenticatedUser,
    render: async () => harness.render(App),
    result,
  }
}

describe('App account data loading', () => {
  it('shows retry and logout controls when preparing user scoped store fails', async () => {
    const prepareStoreForAuthenticatedUser = vi.fn()
      .mockRejectedValueOnce(new Error('prepare failed'))
      .mockResolvedValue(undefined)
    const app = await renderAuthenticatedApp({ prepareStoreForAuthenticatedUser })

    expect(app.result.html).toContain('账号数据加载失败')
    expect(app.result.html).toContain('重试')
    expect(app.result.html).toContain('退出登录')
    expect(app.result.html).not.toContain('正在加载账号数据')

    findButton(app.result.element, '重试')?.props.onClick?.()
    await app.harness.flush()
    await app.render()

    expect(prepareStoreForAuthenticatedUser).toHaveBeenCalledTimes(2)
  })

  it('shows retry and logout controls when initializing store fails', async () => {
    const initStore = vi.fn().mockRejectedValue(new Error('init failed'))
    const app = await renderAuthenticatedApp({ initStore })

    expect(app.result.html).toContain('账号数据加载失败')
    expect(app.result.html).toContain('重试')
    expect(app.result.html).toContain('退出登录')
    expect(app.result.html).not.toContain('正在加载账号数据')
  })
})
