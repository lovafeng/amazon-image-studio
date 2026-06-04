import { useEffect, useState } from 'react'
import { getMyUsage, type UsageEvent, type UsageSummary } from '../lib/admin'

function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString()
}

function formatDate(value?: number) {
  return value ? new Date(value).toLocaleString() : '暂无'
}

export default function UsagePanel() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    getMyUsage()
      .then((payload) => {
        setSummary(payload.summary ?? null)
        setEvents(payload.events)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="safe-area-x mx-auto max-w-7xl pb-12 pt-6 lg:!px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-normal text-gray-900 dark:text-gray-100">我的统计</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">查看当前账号的 AI 调用、生成图片和 token 使用情况。</p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ['调用次数', summary?.calls],
          ['成功次数', summary?.successes],
          ['失败次数', summary?.failures],
          ['生成图片', summary?.generatedImages],
          ['Token', summary?.totalTokens],
          ['最近调用', formatDate(summary?.lastUsedAt)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            <strong className="mt-2 block text-xl text-gray-900 dark:text-gray-100">
              {typeof value === 'number' ? formatNumber(value) : value ?? '0'}
            </strong>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">最近调用</h2>
        </div>
        {loading && <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">正在加载统计</p>}
        {error && <p className="px-4 py-6 text-sm text-red-600 dark:text-red-300">{error}</p>}
        {!loading && !error && events.length === 0 && <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">暂无调用记录</p>}
        {!loading && events.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {events.map((event) => (
              <div key={event.id} className="grid gap-2 px-4 py-3 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                <div>
                  <strong className="block text-gray-900 dark:text-gray-100">{event.endpoint || event.eventType}</strong>
                  <span>{formatDate(event.createdAt)}</span>
                </div>
                <div>{event.status === 'ok' ? '成功' : '失败'}</div>
                <div>{formatNumber(event.generatedImages)} 张图片</div>
                <div>{formatNumber(event.totalTokens)} Token</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
