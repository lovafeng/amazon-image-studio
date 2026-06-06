import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TaskReuseMenu from './TaskReuseMenu'

describe('TaskReuseMenu', () => {
  it('shows explicit reuse actions for done tasks', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages
        canRestorePlannerSession
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).toContain('复用')
    expect(html).toContain('复用参数')
    expect(html).toContain('输出图作参考')
    expect(html).toContain('用作当前风格')
    expect(html).toContain('恢复所属策划')
  })

  it('disables output actions without generated images', () => {
    const html = renderToStaticMarkup(
      <TaskReuseMenu
        hasOutputImages={false}
        canRestorePlannerSession={false}
        onReuseConfig={() => {}}
        onUseOutputAsReference={() => {}}
        onUseAsStyle={() => {}}
        onRestorePlannerSession={() => {}}
        onEditOutputs={() => {}}
      />,
    )

    expect(html).toContain('disabled')
  })
})
