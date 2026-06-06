import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { commonOnboardingSteps, newUserOnboardingSteps } from '../lib/onboardingGuide'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'

interface NewUserOnboardingModalProps {
  canUseAmazonPlanner?: boolean
  onComplete: () => void
}

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

function toTargetRect(rect: DOMRect): TargetRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getPanelStyle(targetRect: TargetRect, cardWidth: number): CSSProperties {
  const margin = 12
  const gap = 14
  const estimatedHeight = 328
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const rightFits = targetRect.right + gap + cardWidth <= viewportWidth - margin
  const leftFits = targetRect.left - gap - cardWidth >= margin

  if (rightFits || leftFits) {
    return {
      width: cardWidth,
      left: rightFits ? targetRect.right + gap : targetRect.left - gap - cardWidth,
      top: clamp(targetRect.top, margin, Math.max(margin, viewportHeight - estimatedHeight - margin)),
    }
  }

  const belowFits = targetRect.bottom + gap + estimatedHeight <= viewportHeight - margin
  return {
    width: cardWidth,
    left: clamp(targetRect.left, margin, Math.max(margin, viewportWidth - cardWidth - margin)),
    top: belowFits
      ? targetRect.bottom + gap
      : clamp(targetRect.top - estimatedHeight - gap, margin, Math.max(margin, viewportHeight - estimatedHeight - margin)),
  }
}

export default function NewUserOnboardingModal({ canUseAmazonPlanner = true, onComplete }: NewUserOnboardingModalProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ width: 360, left: 24, top: 96 })
  const availableSteps = canUseAmazonPlanner ? newUserOnboardingSteps : commonOnboardingSteps
  const safeStepIndex = Math.min(stepIndex, availableSteps.length - 1)
  const currentStep = availableSteps[safeStepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = safeStepIndex === availableSteps.length - 1
  const highlightStyle = useMemo<CSSProperties | undefined>(() => {
    if (!targetRect) return undefined
    const padding = 8
    return {
      left: Math.max(8, targetRect.left - padding),
      top: Math.max(8, targetRect.top - padding),
      width: Math.min(window.innerWidth - 16, targetRect.width + padding * 2),
      height: Math.min(window.innerHeight - 16, targetRect.height + padding * 2),
      borderRadius: 16,
      boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)',
    }
  }, [targetRect])

  useCloseOnEscape(true, onComplete)

  useEffect(() => {
    if (stepIndex !== safeStepIndex) setStepIndex(safeStepIndex)
  }, [safeStepIndex, stepIndex])

  useEffect(() => {
    const measure = () => {
      const target = document.querySelector<HTMLElement>(currentStep.target)
      if (!target) return
      const rect = toTargetRect(target.getBoundingClientRect())
      const cardWidth = Math.min(360, window.innerWidth - 24)
      setTargetRect(rect)
      setPanelStyle(getPanelStyle(rect, cardWidth))
    }

    document.querySelector<HTMLElement>(currentStep.target)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    measure()
    const frame = window.requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 260)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [currentStep])

  const goNext = () => {
    if (isLastStep) {
      onComplete()
      return
    }
    setStepIndex((value) => value + 1)
  }

  return (
    <div
      data-no-drag-select
      className="pointer-events-none fixed inset-0 z-[120]"
      data-onboarding-guide
    >
      {highlightStyle && (
        <div
          className="fixed border-2 border-blue-400 bg-white/5 ring-4 ring-blue-400/25 transition-all duration-200"
          style={highlightStyle}
          aria-hidden="true"
        />
      )}

      <section
        role="dialog"
        aria-live="polite"
        aria-labelledby="new-user-onboarding-title"
        className="pointer-events-auto fixed overflow-hidden rounded-lg border border-white/70 bg-white shadow-2xl ring-1 ring-black/10 transition-all duration-200 dark:border-white/[0.08] dark:bg-gray-950 dark:ring-white/10"
        style={panelStyle}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                新手任务
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                {safeStepIndex + 1} / {availableSteps.length}
              </span>
            </div>
            <h2 id="new-user-onboarding-title" className="text-base font-semibold tracking-normal text-gray-900 dark:text-gray-100">
              {currentStep.title}
            </h2>
          </div>
          <button
            onClick={onComplete}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="跳过新手引导"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
            {currentStep.description}
          </p>
          {currentStep.checklist && (
            <ul className="mt-3 space-y-1.5 text-sm leading-5 text-gray-700 dark:text-gray-300">
              {currentStep.checklist.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100">
            {currentStep.tip}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          >
            跳过引导
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
              disabled={isFirstStep}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
              aria-label="上一步"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {isLastStep ? '完成' : '下一步'}
              {!isLastStep && <ChevronRightIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
