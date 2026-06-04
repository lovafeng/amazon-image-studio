import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import { HelpCircleIcon, HistoryIcon, InstallIcon, LogoutIcon, SettingsIcon, WrenchIcon } from './icons'
import type { AuthUser } from '../lib/auth'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

interface HeaderProps {
  user?: AuthUser
  view?: 'workspace' | 'admin' | 'usage'
  onViewChange?: (view: 'workspace' | 'admin' | 'usage') => void
  onLogout?: () => void
}

function displayUser(user?: AuthUser) {
  return user?.email || user?.phone || user?.id || ''
}

export default function Header({ user, view = 'workspace', onViewChange, onLogout }: HeaderProps) {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(isInstalledPwa)

  const installTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()
  const adminTooltip = useTooltip()
  const usageTooltip = useTooltip()
  const workspaceTooltip = useTooltip()
  const logoutTooltip = useTooltip()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt
      setInstallPrompt(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        setIsPwaInstalled(choice.outcome === 'accepted')
      } catch {
        setIsPwaInstalled(isInstalledPwa())
      }
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIos) {
        setConfirmDialog({
          title: '安装为应用',
          message: '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      } else {
        setConfirmDialog({
          title: '安装为应用',
          message: '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      }
    }
  }

  return (
    <>
      <header data-no-drag-select className="safe-area-top fixed top-0 left-0 right-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80">
        <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="min-w-0 pr-3">
            <span className="text-[17px] font-bold tracking-tight text-gray-800 transition-colors hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300 sm:text-lg">
              亚马逊图片工作台
            </span>
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            {onViewChange && view !== 'workspace' && (
              <div className="relative" {...workspaceTooltip.handlers}>
                <button
                  onClick={() => onViewChange('workspace')}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                  aria-label="工作台"
                >
                  <HistoryIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={workspaceTooltip.visible} className="whitespace-nowrap">
                  工作台
                </ViewportTooltip>
              </div>
            )}
            {onViewChange && user?.role === 'admin' && (
              <div className="relative" {...adminTooltip.handlers}>
                <button
                  onClick={() => onViewChange('admin')}
                  className={`rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 ${view === 'admin' ? 'bg-gray-100 dark:bg-gray-900' : ''}`}
                  aria-label="管理"
                >
                  <WrenchIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={adminTooltip.visible} className="whitespace-nowrap">
                  管理
                </ViewportTooltip>
              </div>
            )}
            {onViewChange && user?.role === 'user' && (
              <div className="relative" {...usageTooltip.handlers}>
                <button
                  onClick={() => onViewChange('usage')}
                  className={`rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 ${view === 'usage' ? 'bg-gray-100 dark:bg-gray-900' : ''}`}
                  aria-label="统计"
                >
                  <HistoryIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={usageTooltip.visible} className="whitespace-nowrap">
                  统计
                </ViewportTooltip>
              </div>
            )}
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                aria-label="设置"
              >
                <SettingsIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
            {onLogout && (
              <div
                className="relative flex items-center"
                {...logoutTooltip.handlers}
              >
                {user && (
                  <span className="hidden max-w-32 truncate px-2 text-xs text-gray-500 dark:text-gray-400 sm:inline">
                    {displayUser(user)}
                  </span>
                )}
                <button
                  onClick={() => {
                    dismissAllTooltips()
                    onLogout()
                  }}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                  aria-label="退出登录"
                >
                  <LogoutIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={logoutTooltip.visible} className="whitespace-nowrap">
                  退出登录
                </ViewportTooltip>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="safe-area-top invisible pointer-events-none" aria-hidden="true">
        <div className="safe-header-inner" />
      </div>
      {showHelp && <HelpModal appMode="gallery" onClose={() => setShowHelp(false)} />}
    </>
  )
}
