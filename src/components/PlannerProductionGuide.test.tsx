import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PlannerProductionGuide from './PlannerProductionGuide'

describe('PlannerProductionGuide', () => {
  it('renders current stage, ETA and primary action', () => {
    const html = renderToStaticMarkup(
      <PlannerProductionGuide
        currentStageId="style"
        completedStageIds={['configure-api', 'prepare-input', 'plan']}
        estimate={{ label: '风格板', expectedRange: '通常 1-3 分钟', statusTone: 'normal', note: '生成 3 张低清风格板' }}
        primaryActionLabel="生成风格板"
        onPrimaryAction={() => {}}
      />,
    )

    expect(html).toContain('生产进度')
    expect(html).toContain('生成风格板')
    expect(html).toContain('通常 1-3 分钟')
    expect(html).toContain('选择风格')
  })
})
