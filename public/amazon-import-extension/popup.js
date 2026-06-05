const DEFAULT_STUDIO_URL = 'https://amzimage.amzdataincn.com/'
const LEGACY_STUDIO_URLS = [
  'https://ali-aria.github.io/amazon-image-studio/',
  'https://lovafeng.github.io/amazon-image-studio/',
]
const DOM_IMPORT_EVENT = 'amazon-image-studio-dom-import'
const DOM_IMPORT_STORAGE_KEY = 'amazon-image-studio-dom-import-payload'

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function captureDomFromPage() {
  const root = document.documentElement.cloneNode(true)
  for (const element of root.querySelectorAll('script, style, noscript, iframe')) {
    element.remove()
  }
  return {
    sourceUrl: location.href,
    html: `<!doctype html>\n${root.outerHTML}`,
  }
}

function normalizeStudioUrl(value) {
  const trimmed = cleanText(value) || DEFAULT_STUDIO_URL
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function getOriginPattern(value) {
  return `${new URL(value).origin}/*`
}

async function ensureStudioPermission(studioUrl) {
  const origin = getOriginPattern(studioUrl)
  if (await chrome.permissions.contains({ origins: [origin] })) return
  const granted = await chrome.permissions.request({ origins: [origin] })
  if (!granted) throw new Error('请允许插件向工作台传递 DOM。')
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    })
  })
}

function receiveDomInStudio(payload, eventName, storageKey) {
  const serializedPayload = JSON.stringify(payload)
  if (serializedPayload.length < 4000000) {
    window.sessionStorage.setItem(storageKey, serializedPayload)
  }
  window.postMessage({ type: eventName, payload }, window.location.origin)
  window.dispatchEvent(new Event(eventName))
}

async function importCurrentPage() {
  const button = document.getElementById('importButton')
  const status = document.getElementById('status')
  const studioInput = document.getElementById('studioUrl')
  button.disabled = true
  status.textContent = '正在读取当前商品页 DOM...'

  const studioUrl = normalizeStudioUrl(studioInput.value)
  await chrome.storage.sync.set({ studioUrl })
  await ensureStudioPermission(studioUrl)
  const tab = await getActiveTab()
  if (!tab?.id || !/^https:\/\/www\.amazon\./i.test(tab.url || '')) {
    status.textContent = '请先切换到 Amazon 商品详情页。'
    button.disabled = false
    return
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: captureDomFromPage,
  })
  const payload = result?.result
  if (!payload?.html) {
    status.textContent = '未读取到当前页面 DOM，请确认当前是 Amazon 商品详情页。'
    button.disabled = false
    return
  }

  status.textContent = '已读取 DOM，正在打开工作台...'
  const studioTab = await chrome.tabs.create({ url: `${studioUrl}#amazon-dom-import=1` })
  await waitForTabComplete(studioTab.id)
  await chrome.scripting.executeScript({
    target: { tabId: studioTab.id },
    func: receiveDomInStudio,
    args: [payload, DOM_IMPORT_EVENT, DOM_IMPORT_STORAGE_KEY],
  })
  status.textContent = '已发送 DOM 到工作台，请在导入预览中确认。'
  button.disabled = false
}

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await chrome.storage.sync.get({ studioUrl: DEFAULT_STUDIO_URL })
  const studioUrl = LEGACY_STUDIO_URLS.includes(normalizeStudioUrl(saved.studioUrl)) ? DEFAULT_STUDIO_URL : saved.studioUrl
  document.getElementById('studioUrl').value = studioUrl
  document.getElementById('importButton').addEventListener('click', () => {
    importCurrentPage().catch((error) => {
      document.getElementById('status').textContent = `导入失败：${error instanceof Error ? error.message : String(error)}`
      document.getElementById('importButton').disabled = false
    })
  })
})
