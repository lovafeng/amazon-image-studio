export function shouldUseApiHandler(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/api-proxy/')
}
