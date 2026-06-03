import { useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { getCurrentSession, login, logout, type AuthSession } from './lib/auth'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
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

  useEffect(() => {
    if (!authSession?.authenticated) return

    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
    useStore.getState().setAppMode('gallery')
  }, [authSession?.authenticated, setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  const handleLogin = async (username: string, password: string) => {
    const session = await login(username, password)
    setAuthSession(session)
    return session
  }

  const handleLogout = () => {
    void logout().then(() => setAuthSession({ authenticated: false }))
  }

  if (!authSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">
        正在检查登录状态
      </main>
    )
  }

  if (!authSession.authenticated) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <>
      <Header username={authSession.username} onLogout={handleLogout} />
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
  )
}
