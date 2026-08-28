import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminPanel, { AdminOperationsStats, AdminUserSearchInput } from './AdminPanel'

describe('AdminPanel', () => {
  it('renders admin management sections', () => {
    const html = renderToStaticMarkup(<AdminPanel />)

    expect(html).toContain('超级管理员')
    expect(html).toContain('管理路径')
    expect(html).toContain('管理概览')
    expect(html).toContain('用户与权限')
    expect(html).toContain('调用与用量')
    expect(html).toContain('生产运营')
    expect(html).toContain('分析任务')
    expect(html).toContain('Token 上限')
    expect(html).toContain('data-selectable-text')
  })

  it('marks the user filter as a non-autofill search field', () => {
    const html = renderToStaticMarkup(<AdminUserSearchInput value="" onChange={() => {}} />)

    expect(html).toContain('type="search"')
    expect(html).toContain('autoComplete="off"')
  })

  it('renders operations statistics sections', () => {
    const html = renderToStaticMarkup(<AdminOperationsStats operations={{
      northStar: { completedImageSets: 2 },
      funnel: {
        workspaces: 5,
        preparedWorkspaces: 4,
        sixViewGeneratedWorkspaces: 3,
        sixViewConfirmedWorkspaces: 2,
        styleGeneratedWorkspaces: 2,
        styleGeneratedImages: 6,
        plannedWorkspaces: 2,
        imageStartedWorkspaces: 2,
        completedImageSets: 2,
      },
      efficiency: {
        imageTaskP80Seconds: 240,
        imageTaskAverageSeconds: 120,
      },
      stability: {
        imageTasks: 10,
        imageTaskSuccesses: 8,
        imageTaskFailures: 2,
        imageTaskSuccessRate: 0.8,
        imageTaskFailureRate: 0.2,
      },
      cost: {
        calls: 12,
        totalTokens: 3456,
        generatedImages: 8,
        callsPerCompletedImageSet: 6,
      },
      quality: {
        favoriteTasks: 3,
        favoriteRate: 0.3,
      },
    }} />)

    expect(html).toContain('北极星指标')
    expect(html).toContain('可上架商品图套')
    expect(html).toContain('生产漏斗')
    expect(html).toContain('已生成风格板')
    expect(html).toContain('风格板图片')
    expect(html).toContain('6')
    expect(html).toContain('2')
    expect(html).toContain('80%')
    expect(html).toContain('3,456')
  })
})
