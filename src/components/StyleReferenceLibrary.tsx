import type { StyleReferenceLibraryItem } from '../lib/styleReferenceLibrary'

interface StyleReferenceLibraryProps {
  items: StyleReferenceLibraryItem[]
  selectedImageId?: string | null
  imageSrcById: Record<string, string>
  onUseStyle: (item: StyleReferenceLibraryItem) => void
  onPreview: (imageId: string) => void
  onRestoreSession: (plannerSessionId: string) => void
}

function getModeLabel(mode: StyleReferenceLibraryItem['mode']) {
  if (mode === 'aplus') return 'A+ 图'
  if ((mode as string) === 'dsp') return 'DSP 图'
  return 'Listing 图'
}

function formatUpdatedAt(value: number) {
  if (!Number.isFinite(value)) return ''
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function StyleReferenceLibrary({
  items,
  selectedImageId,
  imageSrcById,
  onUseStyle,
  onPreview,
  onRestoreSession,
}: StyleReferenceLibraryProps) {
  if (!items.length) return null

  return (
    <section className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">复用已生成风格板</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">同一工作区内 Listing、A+、DSP 可复用。</div>
        </div>
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
          {items.length} 张
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const isSelected = selectedImageId === item.imageId
          const src = imageSrcById[item.imageId]
          return (
            <div
              key={`${item.plannerSessionId ?? item.source}-${item.imageId}`}
              className={`min-w-0 overflow-hidden rounded-lg border transition ${isSelected ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15 dark:border-violet-300/70 dark:bg-violet-500/10' : 'border-gray-200 bg-gray-50 dark:border-white/[0.08] dark:bg-gray-950'}`}
            >
              <div className="aspect-square bg-gray-100 dark:bg-white/[0.04]">
                {src ? (
                  <img src={src} alt={item.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-gray-400">缩略图加载中...</div>
                )}
              </div>
              <div className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{item.label}</span>
                  {isSelected && (
                    <span className="shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">已使用</span>
                  )}
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{item.description || '历史风格参考'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="rounded bg-white px-1.5 py-0.5 dark:bg-white/[0.05]">{getModeLabel(item.mode)}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 dark:bg-white/[0.05]">{item.productTitle || '未命名商品'}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 dark:bg-white/[0.05]">{formatUpdatedAt(item.updatedAt)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUseStyle(item)}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-gray-900 px-2 text-[11px] font-semibold text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    用作当前风格
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(item.imageId)}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                  >
                    预览
                  </button>
                  {item.plannerSessionId && (
                    <button
                      type="button"
                      onClick={() => onRestoreSession(item.plannerSessionId!)}
                      className="col-span-2 inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                    >
                      恢复整套策划
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
