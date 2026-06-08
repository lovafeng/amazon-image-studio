import { useEffect, useRef, useState } from 'react'
import { initStore, prepareStoreForAuthenticatedUser, resetUserScopedLocalState } from './store'
import { useStore } from './store'
import { getCurrentSession, login, logout, register, type AuthSession, type AuthUser, type RegisterInput } from './lib/auth'
import { markNewUserOnboardingComplete, shouldShowNewUserOnboardingAfterRegister } from './lib/onboarding'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
import AdminPanel from './components/AdminPanel'
import UsagePanel from './components/UsagePanel'
import NewUserOnboardingModal from './components/NewUserOnboardingModal'
import AmazonPlanner from './components/AmazonPlanner'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import { useGlobalClickSuppression } from './lib/clickSuppression'

export function canUseAmazonPlanner(user?: AuthUser) {
  return Boolean(user)
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [accountDataReady, setAccountDataReady] = useState(false)
  const [accountDataLoadFailed, setAccountDataLoadFailed] = useState(false)
  const [view, setView] = useState<'workspace' | 'admin' | 'usage'>('workspace')
  const [showNewUserOnboarding, setShowNewUserOnboarding] = useState(false)
  const initializedUserIdRef = useRef<string | null>(null)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    let active = true
    getCurrentSession()
      .then((session) => {
        if (active) setAuthSession(session)
      })
      .catch(() => {
        if (active) setAuthSession({ authenticated: false })
      })
    return () => {
      active = false
    }
  }, [])

  const loadAccountData = async (userId: string, isActive = () => true) => {
    setAccountDataReady(false)
    setAccountDataLoadFailed(false)
    await prepareStoreForAuthenticatedUser(userId)
    if (!isActive()) return

    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    await initStore()
    if (!isActive()) return

    useStore.getState().setAppMode('gallery')
    initializedUserIdRef.current = userId
    setAccountDataReady(true)
    setAccountDataLoadFailed(false)
  }

  const markAccountDataLoadFailed = () => {
    initializedUserIdRef.current = null
    setAccountDataReady(false)
    setAccountDataLoadFailed(true)
  }

  useEffect(() => {
    if (!authSession?.authenticated || !authSession.user) {
      initializedUserIdRef.current = null
      setAccountDataReady(false)
      setAccountDataLoadFailed(false)
      return
    }
    if (initializedUserIdRef.current === authSession.user.id && accountDataReady) return

    let active = true
    void loadAccountData(authSession.user.id, () => active).catch(() => {
      if (active) markAccountDataLoadFailed()
    })

    return () => {
      active = false
    }
  }, [authSession?.authenticated, authSession?.user?.id, accountDataReady])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  const handleLogin = async (identifier: string, password: string) => {
    const session = await login(identifier, password)
    if (session.authenticated && session.user) {
      await loadAccountData(session.user.id)
    }
    setView('workspace')
    setShowNewUserOnboarding(false)
    setAuthSession(session)
    return session
  }

  const handleRegister = async (input: RegisterInput) => {
    const session = await register(input)
    if (session.authenticated && session.user) {
      await loadAccountData(session.user.id)
      setShowNewUserOnboarding(shouldShowNewUserOnboardingAfterRegister(session.user.id))
    }
    setView('workspace')
    setAuthSession(session)
    return session
  }

  const completeNewUserOnboarding = (userId: string) => {
    markNewUserOnboardingComplete(userId)
    setShowNewUserOnboarding(false)
  }

  const handleRetryAccountDataLoad = () => {
    void loadAccountData(authSession!.user!.id).catch(markAccountDataLoadFailed)
  }

  const handleLogout = () => {
    void logout().then(() => {
      resetUserScopedLocalState()
      initializedUserIdRef.current = null
      setAccountDataReady(false)
      setAccountDataLoadFailed(false)
      setShowNewUserOnboarding(false)
      setView('workspace')
      setAuthSession({ authenticated: false })
    })
  }

  if (!authSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">
        正在检查登录状态
      </main>
    )
  }

  if (!authSession.authenticated) {
    return <LoginPage onLogin={handleLogin} onRegister={handleRegister} />
  }

  if (accountDataLoadFailed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-sm text-gray-600 dark:bg-gray-950 dark:text-gray-300">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">账号数据加载失败</h1>
          <p className="mt-2 leading-6 text-gray-500 dark:text-gray-400">
            请重试，或退出登录后重新进入。
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleRetryAccountDataLoad}
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              重试
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              退出登录
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!accountDataReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">
        正在加载账号数据
      </main>
    )
  }

  return (
    <>
      <Header user={authSession.user} view={view} onViewChange={setView} onLogout={handleLogout} />
      {view === 'admin' && authSession.user?.role === 'admin' ? (
        <AdminPanel />
      ) : view === 'usage' && authSession.user?.role === 'user' ? (
        <UsagePanel />
      ) : (
        <>
          <main data-home-main data-drag-select-surface className="home-main-with-dock pb-48 lg:pb-10">
            <div className="safe-area-x max-w-7xl mx-auto lg:!px-6">
              {canUseAmazonPlanner(authSession.user) && <AmazonPlanner />}
              <SearchBar />
              <TaskGrid />
            </div>
          </main>
          <InputBar />
          <DetailModal />
          <Lightbox />
          <SettingsModal clearPlannerSessions={canUseAmazonPlanner(authSession.user)} />
          <ConfirmDialog />
          <Toast />
          <MaskEditorModal />
          <ImageContextMenu />
          {showNewUserOnboarding && authSession.user && (
            <NewUserOnboardingModal
              canUseAmazonPlanner={canUseAmazonPlanner(authSession.user)}
              onComplete={() => completeNewUserOnboarding(authSession.user!.id)}
            />
          )}
        </>
      )}
    </>
  )
}
