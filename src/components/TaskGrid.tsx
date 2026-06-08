import { useMemo, useRef, useState, useEffect } from 'react'
import { useStore, reuseConfig, editOutputs, removeTask, ensureImageCached, createAmazonFinalImageFromDraft } from '../store'
import type { TaskRecord } from '../types'
import { getTaskHistoryCategory, matchesTaskHistoryFilters } from '../lib/taskHistory'
import { isAmazonDraftTask } from '../lib/amazonGeneration'
import TaskCard from './TaskCard'

export const TASK_GRID_REFERENCE_IMAGE_LIMIT = 16
export const TASK_GRID_CARD_HEIGHT = 200
const VIRTUAL_ROW_HEIGHT = TASK_GRID_CARD_HEIGHT + 16
const VIRTUAL_OVERSCAN_ROWS = 2

interface VirtualTaskWindowInput {
  total: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  columnCount: number
  overscanRows: number
}

export function getVirtualTaskWindow({
  total,
  scrollTop,
  viewportHeight,
  rowHeight,
  columnCount,
  overscanRows,
}: VirtualTaskWindowInput) {
  const rowCount = Math.ceil(total / columnCount)
  const firstVisibleRow = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visibleRowCount = Math.ceil(viewportHeight / rowHeight)
  const startRow = Math.max(0, firstVisibleRow - overscanRows)
  const endRow = Math.min(rowCount, firstVisibleRow + visibleRowCount + overscanRows)

  return {
    startIndex: startRow * columnCount,
    endIndex: Math.min(total, endRow * columnCount),
    offsetTop: startRow * rowHeight,
    totalHeight: rowCount * rowHeight,
  }
}

function getTaskGridColumnCount(width: number) {
  if (width >= 1536) return 3
  if (width >= 1280) return 2
  if (width >= 1024) return 1
  if (width >= 640) return 2
  return 1
}

export function getTaskOutputReferencePlan(
  currentImageIds: string[],
  outputImageIds: string[],
  limit = TASK_GRID_REFERENCE_IMAGE_LIMIT,
) {
  const existingIds = new Set(currentImageIds)
  const candidates: string[] = []
  for (const imageId of outputImageIds) {
    if (existingIds.has(imageId)) continue
    existingIds.add(imageId)
    candidates.push(imageId)
  }
  const remaining = Math.max(0, limit - currentImageIds.length)
  const imageIds = candidates.slice(0, remaining)

  return {
    imageIds,
    discarded: candidates.length - imageIds.length,
    alreadyPresent: candidates.length === 0,
    atLimit: remaining === 0,
  }
}

export default function TaskGrid() {
  const tasks = useStore((s) => s.tasks)
  const searchQuery = useStore((s) => s.searchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const filterProductTitle = useStore((s) => s.filterProductTitle)
  const filterWorkflow = useStore((s) => s.filterWorkflow)
  const filterAspect = useStore((s) => s.filterAspect)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const setInputImages = useStore((s) => s.setInputImages)
  const setGalleryStyleReferenceRequest = useStore((s) => s.setGalleryStyleReferenceRequest)
  const showToast = useStore((s) => s.showToast)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ startPageX: number; startPageY: number; currentPageX: number; currentPageY: number } | null>(null)
  const [viewport, setViewport] = useState(() => ({
    scrollY: window.scrollY,
    height: window.innerHeight,
    width: window.innerWidth,
  }))
  const dragStart = useRef<{ pageX: number; pageY: number } | null>(null)
  const lastClientPoint = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const isDragging = useRef(false)
  const dragScrollIntervalRef = useRef<number | null>(null)
  const dragScrollDirectionRef = useRef<-1 | 1 | null>(null)
  const lastToastTimeRef = useRef(0)
  const suppressClickUntil = useRef(0)
  const startedOnCard = useRef(false)
  const startedWithCtrl = useRef(false)
  const initialSelection = useRef<string[]>([])
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
    
    return sorted.filter((task) => matchesTaskHistoryFilters(task, {
      searchQuery,
      filterStatus,
      filterFavorite,
      filterProductTitle,
      filterWorkflow,
      filterAspect,
    }))
  }, [tasks, searchQuery, filterStatus, filterFavorite, filterProductTitle, filterWorkflow, filterAspect])

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        scrollY: window.scrollY,
        height: window.innerHeight,
        width: window.innerWidth,
      })
    }

    updateViewport()
    window.addEventListener('scroll', updateViewport, { passive: true })
    window.addEventListener('resize', updateViewport)
    return () => {
      window.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  const virtualWindow = useMemo(() => {
    const rootTop = rootRef.current ? rootRef.current.getBoundingClientRect().top + window.scrollY : 0
    return getVirtualTaskWindow({
      total: filteredTasks.length,
      scrollTop: viewport.scrollY - rootTop,
      viewportHeight: viewport.height,
      rowHeight: VIRTUAL_ROW_HEIGHT,
      columnCount: getTaskGridColumnCount(viewport.width),
      overscanRows: VIRTUAL_OVERSCAN_ROWS,
    })
  }, [filteredTasks.length, viewport])
  const visibleTasks = filteredTasks.slice(virtualWindow.startIndex, virtualWindow.endIndex)

  const getTaskStyleReferenceLabel = (task: TaskRecord) => {
    const category = getTaskHistoryCategory(task)
    return task.category?.styleReferenceLabel?.trim() ||
      task.category?.amazonSlot?.trim() ||
      category.productTitle ||
      '图库风格'
  }

  const addTaskOutputsAsInputImages = async (task: TaskRecord) => {
    const outputImageIds = task.outputImages ?? []
    if (!outputImageIds.length) {
      showToast('当前任务没有可复用的输出图', 'error')
      return
    }

    const currentInputImages = useStore.getState().inputImages
    const referencePlan = getTaskOutputReferencePlan(
      currentInputImages.map((image) => image.id),
      outputImageIds,
    )
    if (referencePlan.atLimit) {
      showToast(`参考图数量已达上限（${TASK_GRID_REFERENCE_IMAGE_LIMIT} 张），无法继续添加`, 'error')
      return
    }

    const additions: Array<{ id: string; dataUrl: string }> = []
    for (const imageId of referencePlan.imageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) additions.push({ id: imageId, dataUrl })
    }
    if (!additions.length) {
      showToast(referencePlan.alreadyPresent ? '输出图已在参考图中' : '没有可添加的输出图', 'info')
      return
    }

    setInputImages([...useStore.getState().inputImages, ...additions])
    if (referencePlan.discarded > 0) {
      showToast(`已添加 ${additions.length} 张输出图作参考，已达上限 ${TASK_GRID_REFERENCE_IMAGE_LIMIT} 张，${referencePlan.discarded} 张被丢弃`, 'success')
    } else {
      showToast(`已添加 ${additions.length} 张输出图作参考`, 'success')
    }
  }

  const useTaskOutputAsStyle = (task: TaskRecord) => {
    const imageId = task.outputImages?.[0]
    if (!imageId) {
      showToast('当前任务没有可用作风格的输出图', 'error')
      return
    }
    setGalleryStyleReferenceRequest({
      imageId,
      label: getTaskStyleReferenceLabel(task),
      requestedAt: Date.now(),
    })
    showToast('已发送到亚马逊工作台当前风格', 'success')
  }

  const restorePlannerSessionFromTask = (task: TaskRecord) => {
    if (!task.category?.plannerSessionId) return
    document.querySelector<HTMLElement>('[data-onboarding-target="planner-panel"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    showToast('请在亚马逊工作台历史记录中恢复所属策划', 'info')
  }

  const handleDelete = (task: typeof tasks[0]) => {
    setConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条记录吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  const getPagePoint = (clientX: number, clientY: number) => ({
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
  })

  const beginSelection = (target: HTMLElement, clientX: number, clientY: number, isCtrl: boolean) => {
    const point = getPagePoint(clientX, clientY)

    startedOnCard.current = Boolean(target.closest('.task-card-wrapper'))
    startedWithCtrl.current = isCtrl
    initialSelection.current = [...useStore.getState().selectedTaskIds]

    isDragging.current = true
    hasDragged.current = false
    dragStart.current = point
    lastClientPoint.current = { x: clientX, y: clientY }
    document.body.classList.add('select-none')
    document.body.classList.add('drag-selecting')
    setSelectionBox({
      startPageX: point.pageX,
      startPageY: point.pageY,
      currentPageX: point.pageX,
      currentPageY: point.pageY,
    })
  }

  const updateSelectionFromPoint = (pageX: number, pageY: number) => {
    const start = dragStart.current
    if (!start || !gridRef.current) return

    const minX = Math.min(start.pageX, pageX)
    const maxX = Math.max(start.pageX, pageX)
    const minY = Math.min(start.pageY, pageY)
    const maxY = Math.max(start.pageY, pageY)

    const cards = gridRef.current.querySelectorAll('.task-card-wrapper')
    const newSelected = new Set(initialSelection.current)
    const initialSelected = new Set(initialSelection.current)

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect()
      const taskId = card.getAttribute('data-task-id')
      if (!taskId) return

      const cardLeft = rect.left + window.scrollX
      const cardRight = rect.right + window.scrollX
      const cardTop = rect.top + window.scrollY
      const cardBottom = rect.bottom + window.scrollY

      const isIntersecting =
        minX < cardRight && maxX > cardLeft && minY < cardBottom && maxY > cardTop

      if (isIntersecting) {
        if (initialSelected.has(taskId)) {
          newSelected.delete(taskId)
        } else {
          newSelected.add(taskId)
        }
      } else if (!initialSelected.has(taskId)) {
        newSelected.delete(taskId)
      }
    })

    setSelectedTaskIds(Array.from(newSelected))
  }

  useEffect(() => {
    const stopDragScroll = () => {
      if (dragScrollIntervalRef.current) {
        clearInterval(dragScrollIntervalRef.current)
        dragScrollIntervalRef.current = null
      }
      dragScrollDirectionRef.current = null
    }

    const startDragScroll = (direction: -1 | 1) => {
      if (dragScrollIntervalRef.current && dragScrollDirectionRef.current === direction) return
      stopDragScroll()
      dragScrollDirectionRef.current = direction
      dragScrollIntervalRef.current = window.setInterval(() => {
        window.scrollBy({ top: direction * 15, behavior: 'instant' })
      }, 16)
    }

    const endSelection = (clearEmptySurfaceClick = false, suppressClick = false) => {
      if (isDragging.current) {
        document.body.classList.remove('select-none')
        document.body.classList.remove('drag-selecting')
      }
      if (isDragging.current && clearEmptySurfaceClick && !hasDragged.current && !startedOnCard.current && !startedWithCtrl.current) {
        clearSelection()
      }
      if (isDragging.current && suppressClick && hasDragged.current) {
        suppressClickUntil.current = Date.now() + 250
      }
      stopDragScroll()
      isDragging.current = false
      dragStart.current = null
      lastClientPoint.current = null
      setSelectionBox(null)
    }

    const getEventElement = (e: MouseEvent) => {
      if (e.target instanceof Element) return e.target
      return document.elementFromPoint(e.clientX, e.clientY)
    }

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = getEventElement(e)
      if (!target) return
      if (!target.closest('[data-drag-select-surface]')) return
      if (target.closest('[data-input-bar]')) return
      if (target.closest('[data-no-drag-select], [data-lightbox-root]')) return
      if (target.closest('button, a, input, textarea, select')) return

      const isCtrl = isMac ? e.metaKey : e.ctrlKey
      beginSelection(target as HTMLElement, e.clientX, e.clientY, isCtrl)
      e.preventDefault()
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return

      const start = dragStart.current
      const point = getPagePoint(e.clientX, e.clientY)
      lastClientPoint.current = { x: e.clientX, y: e.clientY }
      const distance = Math.hypot(point.pageX - start.pageX, point.pageY - start.pageY)
      if (distance < 6 && !hasDragged.current) return

      hasDragged.current = true
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
      e.preventDefault()

      const scrollThreshold = 40
      if (e.clientY < scrollThreshold) {
        startDragScroll(-1)
      } else if (e.clientY > window.innerHeight - scrollThreshold) {
        startDragScroll(1)
      } else {
        stopDragScroll()
      }
    }

    const handleDocumentScroll = () => {
      if (!isDragging.current || !dragStart.current || !lastClientPoint.current || !hasDragged.current) return

      const point = getPagePoint(lastClientPoint.current.x, lastClientPoint.current.y)
      const start = dragStart.current
      setSelectionBox({
        startPageX: start.pageX,
        startPageY: start.pageY,
        currentPageX: point.pageX,
        currentPageY: point.pageY,
      })
      updateSelectionFromPoint(point.pageX, point.pageY)
    }

    const handleDocumentWheel = (e: WheelEvent) => {
      if (!isDragging.current) return
      if ((e.buttons & 1) === 0) {
        endSelection()
        return
      }
      if (!hasDragged.current) return
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()
      const now = Date.now()
      if (now - lastToastTimeRef.current > 3000) {
        lastToastTimeRef.current = now
        const keyName = isMac ? '⌘' : 'Ctrl'
        useStore.getState().showToast(`松开 ${keyName} 键使用滚轮，或拖至边缘自动滚动`, 'info')
      }
    }

    const handleDocumentMouseUp = () => {
      endSelection(true, true)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    document.addEventListener('mousemove', handleDocumentMouseMove, true)
    document.addEventListener('mouseup', handleDocumentMouseUp, true)
    document.addEventListener('wheel', handleDocumentWheel, { capture: true, passive: false })
    window.addEventListener('scroll', handleDocumentScroll, true)
    return () => {
      stopDragScroll()
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('mousemove', handleDocumentMouseMove, true)
      document.removeEventListener('mouseup', handleDocumentMouseUp, true)
      document.removeEventListener('wheel', handleDocumentWheel, true)
      window.removeEventListener('scroll', handleDocumentScroll, true)
    }
  }, [clearSelection, isMac])

  if (!filteredTasks.length) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-gray-500">
        {searchQuery || filterFavorite || filterStatus !== 'all' || filterProductTitle || filterWorkflow !== 'all' || filterAspect !== 'all' ? (
          <p className="text-sm">没有找到匹配的记录</p>
        ) : (
          <>
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-200 dark:text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm">输入提示词开始生成图片</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={rootRef}
      data-task-grid-root
      className="relative min-h-[50vh]"
      style={{ height: virtualWindow.totalHeight }}
    >
      <div
        ref={gridRef}
        className="absolute left-0 right-0 grid grid-cols-1 gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3"
        style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}
      >
        {visibleTasks.map((task) => (
          <div
            key={task.id}
            className="task-card-wrapper"
            data-task-id={task.id}
            style={{ height: TASK_GRID_CARD_HEIGHT }}
          >
            <TaskCard
              task={task}
              onClick={(e) => {
                if (Date.now() < suppressClickUntil.current) {
                  e.preventDefault()
                  return
                }
                suppressClickUntil.current = 0
                const isCtrl = isMac ? e.metaKey : e.ctrlKey
                if (isCtrl) {
                  useStore.getState().toggleTaskSelection(task.id)
                  return
                }

                setDetailTaskId(task.id)
              }}
              onReuse={() => reuseConfig(task)}
              onEditOutputs={() => editOutputs(task)}
              onUseOutputAsReference={() => void addTaskOutputsAsInputImages(task)}
              canCreateFinalFromDraft={isAmazonDraftTask(task)}
              onCreateFinalFromDraft={() => void createAmazonFinalImageFromDraft(task)}
              onUseAsStyle={() => useTaskOutputAsStyle(task)}
              onRestorePlannerSession={() => restorePlannerSessionFromTask(task)}
              canRestorePlannerSession={Boolean(task.category?.plannerSessionId)}
              onDelete={() => handleDelete(task)}
              isSelected={selectedTaskIds.includes(task.id)}
            />
          </div>
        ))}
      </div>
      {selectionBox && (
        <div
          className="fixed bg-blue-500/20 border border-blue-500/50 pointer-events-none z-[30]"
          style={{
            left: Math.min(selectionBox.startPageX, selectionBox.currentPageX) - window.scrollX,
            top: Math.min(selectionBox.startPageY, selectionBox.currentPageY) - window.scrollY,
            width: Math.abs(selectionBox.currentPageX - selectionBox.startPageX),
            height: Math.abs(selectionBox.currentPageY - selectionBox.startPageY),
          }}
        />
      )}
    </div>
  )
}
