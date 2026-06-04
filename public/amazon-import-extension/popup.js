const DEFAULT_STUDIO_URL = 'https://ali-aria.github.io/amazon-image-studio/'

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cleanBullet(value) {
  const text = cleanText(value).replace(/[【】]/g, ' ').replace(/^[-•]+/, '').replace(/\s+/g, ' ').trim()
  return /^make sure this fits/i.test(text) || /^note:/i.test(text) ? '' : text
}

function extractPayloadFromPage() {
  const getText = (selector) => cleanText(document.querySelector(selector)?.textContent)
  const getValue = (selector) => cleanText(document.querySelector(selector)?.value)
  const details = {}

  for (const selector of ['#productDetails_detailBullets_sections1 tr', '#productDetails_techSpec_section_1 tr', '#productDetails_feature_div tr']) {
    for (const row of document.querySelectorAll(selector)) {
      const key = cleanText(row.querySelector('th')?.textContent).replace(/:$/, '')
      const value = cleanText(row.querySelector('td')?.textContent)
      if (key && value) details[key] = value
    }
  }

  for (const item of document.querySelectorAll('#detailBullets_feature_div li')) {
    const text = cleanText(item.textContent)
    const [key, ...rest] = text.split(':')
    const value = rest.join(':').trim()
    const normalizedKey = cleanText(key).replace(/^[^A-Za-z\u3400-\u9fff]+/, '')
    if (normalizedKey && value) details[normalizedKey] = value
  }

  const imageUrls = []
  for (const image of document.querySelectorAll('#imgTagWrapperId img, #landingImage, #main-image-container img, #altImages img')) {
    const oldHires = image.getAttribute('data-old-hires')
    if (oldHires) imageUrls.push(oldHires)
    const dynamic = image.getAttribute('data-a-dynamic-image')
    if (dynamic) {
      try {
        imageUrls.push(...Object.keys(JSON.parse(dynamic)))
      } catch {
        // Ignore malformed Amazon image metadata.
      }
    }
    const src = image.getAttribute('src')
    if (src && !oldHires) imageUrls.push(src)
  }

  const title = cleanText(getText('#productTitle') || getValue('input[name="productTitle"], input#productTitle') || getText('#pqv-title')).replace(/^Product Summary:\s*/i, '')
  const bullets = Array.from(document.querySelectorAll('#feature-bullets li span, #pqv-feature-bullets li span'))
    .map((item) => cleanBullet(item.textContent))
    .filter(Boolean)
    .slice(0, 5)
  const asin = location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase()
    || getValue('input[name="asin"], input#asin, input[name="ASIN"], input#ASIN').toUpperCase()

  return {
    ...(asin ? { asin } : {}),
    title,
    bullets,
    details,
    imageUrls: Array.from(new Set(imageUrls.filter((url) => /^https?:\/\//i.test(url)))).slice(0, 12),
  }
}

function encodePayload(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
}

function normalizeStudioUrl(value) {
  const trimmed = cleanText(value) || DEFAULT_STUDIO_URL
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function importCurrentPage() {
  const button = document.getElementById('importButton')
  const status = document.getElementById('status')
  const studioInput = document.getElementById('studioUrl')
  button.disabled = true
  status.textContent = '正在读取当前商品页...'

  const studioUrl = normalizeStudioUrl(studioInput.value)
  await chrome.storage.sync.set({ studioUrl })
  const tab = await getActiveTab()
  if (!tab?.id || !/^https:\/\/www\.amazon\./i.test(tab.url || '')) {
    status.textContent = '请先切换到 Amazon 商品详情页。'
    button.disabled = false
    return
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPayloadFromPage,
  })
  const payload = result?.result
  if (!payload?.title && !payload?.bullets?.length) {
    status.textContent = '未识别到商品标题或五点描述，请确认当前是 Amazon 商品详情页。'
    button.disabled = false
    return
  }

  await chrome.tabs.create({ url: `${studioUrl}#amazon-import=${encodeURIComponent(encodePayload(payload))}` })
  button.disabled = false
}

document.addEventListener('DOMContentLoaded', async () => {
  const saved = await chrome.storage.sync.get({ studioUrl: DEFAULT_STUDIO_URL })
  document.getElementById('studioUrl').value = saved.studioUrl
  document.getElementById('importButton').addEventListener('click', () => {
    importCurrentPage().catch((error) => {
      document.getElementById('status').textContent = `导入失败：${error instanceof Error ? error.message : String(error)}`
      document.getElementById('importButton').disabled = false
    })
  })
})
