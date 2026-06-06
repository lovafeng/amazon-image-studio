import type { ProductionEstimate, ProductionStageId } from '../lib/plannerProductionGuide'
import { PRODUCTION_STAGES } from '../lib/plannerProductionGuide'

interface PlannerProductionGuideProps {
  currentStageId: ProductionStageId
  completedStageIds?: ProductionStageId[]
  estimate: ProductionEstimate
  primaryActionLabel: string
  onPrimaryAction: () => void
}

function getStageClass(isCurrent: boolean, isDone: boolean) {
  if (isCurrent) return 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400/50 dark:bg-blue-500/10 dark:text-blue-100'
  if (isDone) return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100'
  return 'border-gray-200 bg-white text-gray-500 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-400'
}

function getEstimateClass(tone: ProductionEstimate['statusTone']) {
  if (tone === 'long') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100'
  if (tone === 'slow') return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100'
  return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200'
}

export default function PlannerProductionGuide({
  currentStageId,
  completedStageIds = [],
  estimate,
  primaryActionLabel,
  onPrimaryAction,
}: PlannerProductionGuideProps) {
  const completed = new Set(completedStageIds)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-gray-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">生产进度</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
            {PRODUCTION_STAGES.map((stage) => {
              const isCurrent = stage.id === currentStageId
              const isDone = completed.has(stage.id)
              return (
                <div
                  key={stage.id}
                  className={`min-w-0 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${getStageClass(isCurrent, isDone)}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="block truncate">{isDone ? '✓ ' : ''}{stage.label}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${getEstimateClass(estimate.statusTone)}`}>
            <div className="font-semibold">
              {estimate.label} · {estimate.expectedRange}
              {estimate.elapsedLabel ? ` · ${estimate.elapsedLabel}` : ''}
            </div>
            <div className="opacity-80">{estimate.note}</div>
          </div>
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </section>
  )
}
