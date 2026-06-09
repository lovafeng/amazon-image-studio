import { useState } from 'react'

interface TaskReuseMenuProps {
  hasOutputImages: boolean
  canRestorePlannerSession?: boolean
  canCreateFinalFromDraft?: boolean
  menuPlacement?: 'bottom' | 'top'
  onReuseConfig: () => void
  onUseOutputAsReference: () => void
  onCreateFinalFromDraft?: () => void
  onUseAsStyle: () => void
  onRestorePlannerSession: () => void
  onEditOutputs: () => void
}

function MenuAction({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:disabled:text-gray-600"
    >
      {children}
    </button>
  )
}

export default function TaskReuseMenu({
  hasOutputImages,
  canRestorePlannerSession = false,
  canCreateFinalFromDraft = false,
  menuPlacement = 'bottom',
  onReuseConfig,
  onUseOutputAsReference,
  onCreateFinalFromDraft = () => {},
  onUseAsStyle,
  onRestorePlannerSession,
  onEditOutputs,
}: TaskReuseMenuProps) {
  const [open, setOpen] = useState(false)
  const menuPositionClass = menuPlacement === 'top' ? 'bottom-9' : 'top-9'

  return (
    <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        复用
      </button>
      <div
        role="menu"
        aria-hidden={!open}
        className={`absolute right-0 ${menuPositionClass} z-50 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-white/[0.08] dark:bg-gray-950 ${open ? '' : 'hidden'}`}
      >
        <MenuAction onClick={onReuseConfig}>复用参数</MenuAction>
        <MenuAction disabled={!hasOutputImages} onClick={onUseOutputAsReference}>输出图作参考</MenuAction>
        {canCreateFinalFromDraft && (
          <MenuAction disabled={!hasOutputImages} onClick={onCreateFinalFromDraft}>制作高清</MenuAction>
        )}
        <MenuAction disabled={!hasOutputImages} onClick={onUseAsStyle}>用作当前风格</MenuAction>
        <MenuAction disabled={!canRestorePlannerSession} onClick={onRestorePlannerSession}>恢复所属策划</MenuAction>
        <MenuAction disabled={!hasOutputImages} onClick={onEditOutputs}>编辑输出</MenuAction>
      </div>
    </div>
  )
}
