const DEFAULT_STUDIO_URL = 'https://amzimage.amzdataincn.com/'
const LEGACY_STUDIO_URLS = [
  'https://ali-aria.github.io/amazon-image-studio/',
  'https://lovafeng.github.io/amazon-image-studio/',
]
const IMPORT_MESSAGE_TYPE = 'amazon-image-studio-import-current-page'

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeStudioUrl(value) {
  const trimmed = cleanText(value) || DEFAULT_STUDIO_URL
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

async function importCurrentPage() {
  const button = document.getElementById('importButton')
  const status = document.getElementById('status')
  const studioInput = document.getElementById('studioUrl')
  button.disabled = true
  status.textContent = '正在读取当前商品页 DOM...'

  const studioUrl = normalizeStudioUrl(studioInput.value)
  await chrome.storage.sync.set({ studioUrl })
  const response = await chrome.runtime.sendMessage({
    type: IMPORT_MESSAGE_TYPE,
    studioUrl,
  })
  if (!response?.ok) throw new Error(response?.error || '导入失败')
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
