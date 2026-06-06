import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminPanel from './AdminPanel'

describe('AdminPanel', () => {
  it('renders admin management sections', () => {
    const html = renderToStaticMarkup(<AdminPanel />)

    expect(html).toContain('管理总览')
    expect(html).toContain('用户管理')
    expect(html).toContain('使用统计')
    expect(html).toContain('分析任务')
    expect(html).toContain('Token 上限')
  })
})
