import { describe, expect, it } from 'vitest'
import TaskGrid, { getTaskOutputReferencePlan, getVirtualTaskWindow } from './TaskGrid'
import inputBarSource from './InputBar.tsx?raw'
import searchBarSource from './SearchBar.tsx?raw'
import taskGridSource from './TaskGrid.tsx?raw'
import taskCardSource from './TaskCard.tsx?raw'

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

  it('limits reused task outputs to the reference image cap', () => {
    const currentIds = Array.from({ length: 14 }, (_, index) => `current-${index}`)
    const outputImageIds = ['new-a', 'new-b', 'new-c', 'new-d']

    expect(getTaskOutputReferencePlan(currentIds, outputImageIds)).toEqual({
      imageIds: ['new-a', 'new-b'],
      discarded: 2,
      alreadyPresent: false,
      atLimit: false,
    })
  })

  it('keeps task cards at a stable grid height for virtualization', () => {
    expect(taskGridSource).toContain('TASK_GRID_CARD_HEIGHT')
    expect(taskGridSource).toContain('style={{ height: TASK_GRID_CARD_HEIGHT }}')
    expect(taskCardSource).not.toContain("useWidePreviewLayout ? 'flex flex-col'")
    expect(taskCardSource).not.toContain('style={widePreviewStyle}')
  })

  it('wires Amazon draft tasks to final generation from the task grid', () => {
    expect(taskGridSource).toContain('createAmazonFinalImageFromDraft')
    expect(taskGridSource).toContain('isAmazonDraftTask(task)')
  })

  it('scopes every bottom history surface to the active product workspace', () => {
    expect(taskGridSource).toContain('activeProductWorkspaceId')
    expect(searchBarSource).toContain('activeProductWorkspaceId')
    expect(inputBarSource).toContain('activeProductWorkspaceId')
    expect(taskGridSource).toContain('filterProductWorkspaceId: activeProductWorkspaceId ?? undefined')
    expect(searchBarSource).toContain('filterProductWorkspaceId: activeProductWorkspaceId ?? undefined')
    expect(inputBarSource).toContain('filterProductWorkspaceId: activeProductWorkspaceId ?? undefined')
  })
})
