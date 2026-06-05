const IMPORT_MESSAGE_TYPE = 'amazon-image-studio-import-current-page'
const DOM_IMPORT_EVENT = 'amazon-image-studio-dom-import'
const DOM_IMPORT_STORAGE_KEY = 'amazon-image-studio-dom-import-payload'

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

async function waitForTabComplete(tabId) {
  const tab = await chrome.tabs.get(tabId)
  if (tab.status === 'complete') return
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

async function importCurrentPage(studioUrl) {
  await ensureStudioPermission(studioUrl)
  const tab = await getActiveTab()
  if (!tab?.id || !/^https:\/\/www\.amazon\./i.test(tab.url || '')) {
    throw new Error('请先切换到 Amazon 商品详情页。')
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: captureDomFromPage,
  })
  const payload = result?.result
  if (!payload?.html) {
    throw new Error('未读取到当前页面 DOM，请确认当前是 Amazon 商品详情页。')
  }

  const studioTab = await chrome.tabs.create({ url: `${studioUrl}#amazon-dom-import=1` })
  await waitForTabComplete(studioTab.id)
  await chrome.scripting.executeScript({
    target: { tabId: studioTab.id },
    func: receiveDomInStudio,
    args: [payload, DOM_IMPORT_EVENT, DOM_IMPORT_STORAGE_KEY],
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== IMPORT_MESSAGE_TYPE) return false
  importCurrentPage(message.studioUrl)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  return true
})
