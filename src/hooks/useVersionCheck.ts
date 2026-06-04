import { useState } from 'react'

export const LATEST_RELEASE_REPO = null
export const LATEST_RELEASE_API_URL = null

export interface LatestRelease {
  tag: string
  url: string
}

export function useVersionCheck() {
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('version-dismissed') === 'true',
  )

  const dismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('version-dismissed', 'true')
  }

  const latestRelease: LatestRelease | null = null
  const hasUpdate = latestRelease !== null && !dismissed

  return { hasUpdate, latestRelease, dismiss }
}
