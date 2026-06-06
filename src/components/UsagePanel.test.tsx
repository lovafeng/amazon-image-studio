import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import UsagePanel from './UsagePanel'

describe('UsagePanel', () => {
  it('renders current user usage sections', () => {
    const html = renderToStaticMarkup(<UsagePanel />)

    expect(html).toContain('我的统计')
    expect(html).toContain('调用次数')
    expect(html).toContain('Token 上限')
    expect(html).toContain('最近调用')
  })
})
