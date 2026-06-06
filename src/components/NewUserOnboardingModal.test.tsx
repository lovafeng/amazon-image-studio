import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { newUserOnboardingSteps } from '../lib/onboardingGuide'
import NewUserOnboardingModal from './NewUserOnboardingModal'

describe('NewUserOnboardingModal', () => {
  it('renders a game-style guide with progress controls', () => {
    const html = renderToStaticMarkup(<NewUserOnboardingModal onComplete={() => {}} />)

    expect(html).toContain('新手任务')
    expect(html).toContain('1 / 6')
    expect(html).toContain('下一步')
    expect(html).toContain('跳过引导')
    expect(html).toContain('先选出图入口')
    expect(html).toContain('完整路径')
    expect(html).toContain('在历史记录里预览、下载、复用或编辑输出')
  })

  it('guides a full Amazon output path instead of stopping at planning', () => {
    expect(newUserOnboardingSteps.map((step) => step.title)).toEqual([
      '先选出图入口',
      '准备商品资料',
      '让 AI 生成方案',
      '生成风格板并提交',
      '拿到最终输出',
      '临时生图入口',
    ])
    expect(newUserOnboardingSteps.flatMap((step) => step.checklist ?? [])).toEqual(expect.arrayContaining([
      'AI策划完成后生成并选择风格板',
      '选择图片位或素材，点击提交生成',
      '在历史记录里预览、下载、复用或编辑输出',
    ]))
    expect(newUserOnboardingSteps.map((step) => step.target)).toEqual([
      '[data-onboarding-target="planner-panel"]',
      '[data-onboarding-target="listing-input"]',
      '[data-onboarding-target="planner-action"]',
      '[data-onboarding-target="planner-panel"]',
      '[data-onboarding-target="history-panel"]',
      '[data-onboarding-target="input-dock"]',
    ])
  })

  it('still guides users without Amazon Planner access to a direct output', () => {
    const html = renderToStaticMarkup(
      <NewUserOnboardingModal canUseAmazonPlanner={false} onComplete={() => {}} />,
    )

    expect(html).toContain('1 / 4')
    expect(html).toContain('直接描述要生成的图')
    expect(html).toContain('点击生成图像')
    expect(html).not.toContain('先选出图入口')
  })
})
