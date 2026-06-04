import { useEffect, useRef, useState } from 'react'
import { initStore, prepareStoreForAuthenticatedUser, resetUserScopedLocalState } from './store'
import { useStore } from './store'
import { getCurrentSession, login, logout, register, type AuthSession, type RegisterInput } from './lib/auth'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
import AdminPanel from './components/AdminPanel'
import UsagePanel from './components/UsagePanel'
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

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [accountDataReady, setAccountDataReady] = useState(false)
  const [view, setView] = useState<'workspace' | 'admin' | 'usage'>('workspace')
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
  }

  useEffect(() => {
    if (!authSession?.authenticated || !authSession.user) {
      initializedUserIdRef.current = null
      setAccountDataReady(false)
      return
    }
    if (initializedUserIdRef.current === authSession.user.id && accountDataReady) return

    let active = true
    void loadAccountData(authSession.user.id, () => active)

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
    setAuthSession(session)
    return session
  }

  const handleRegister = async (input: RegisterInput) => {
    const session = await register(input)
    if (session.authenticated && session.user) {
      await loadAccountData(session.user.id)
    }
    setView('workspace')
    setAuthSession(session)
    return session
  }

  const handleLogout = () => {
    void logout().then(() => {
      resetUserScopedLocalState()
      initializedUserIdRef.current = null
      setAccountDataReady(false)
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
              <AmazonPlanner />
              <SearchBar />
              <TaskGrid />
            </div>
          </main>
          <InputBar />
          <DetailModal />
          <Lightbox />
          <SettingsModal />
          <ConfirmDialog />
          <Toast />
          <MaskEditorModal />
          <ImageContextMenu />
        </>
      )}
    </>
  )
}
