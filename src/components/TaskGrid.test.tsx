import { describe, expect, it } from 'vitest'
import TaskGrid, { getVirtualTaskWindow } from './TaskGrid'
import taskGridSource from './TaskGrid.tsx?raw'

describe('TaskGrid virtualization', () => {
  it('renders only a virtual slice of the filtered task list', () => {
    expect(TaskGrid).toBeTypeOf('function')
    expect(taskGridSource).toContain('const visibleTasks = filteredTasks.slice(')
    expect(taskGridSource).toContain('{visibleTasks.map((task)')
    expect(taskGridSource).not.toContain('{filteredTasks.map((task)')
  })

  it('keeps overscan around the visible task rows', () => {
    expect(getVirtualTaskWindow({
      total: 120,
      scrollTop: 720,
      viewportHeight: 720,
      rowHeight: 240,
      columnCount: 3,
      overscanRows: 2,
    })).toEqual({
      startIndex: 3,
      endIndex: 24,
      offsetTop: 240,
      totalHeight: 9600,
    })
  })
})
