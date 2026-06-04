import { useEffect, useState } from 'react'
import {
  getAdminSummary,
  getAdminUsage,
  getAdminUsers,
  resetUserPassword,
  setUserStatus,
  type AdminSummary,
  type AdminUser,
  type UsageEvent,
  type UsageSummary,
} from '../lib/admin'

type AdminTab = 'summary' | 'users' | 'usage'

function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString()
}

function formatDate(value?: number) {
  return value ? new Date(value).toLocaleString() : '暂无'
}

function userLabel(user: Pick<AdminUser, 'email' | 'phone' | 'id'>) {
  return user.email || user.phone || user.id
}

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('summary')
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usageSummaries, setUsageSummaries] = useState<UsageSummary[]>([])
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([getAdminSummary(), getAdminUsers(), getAdminUsage()])
      .then(([nextSummary, nextUsers, usage]) => {
        setSummary(nextSummary)
        setUsers(nextUsers)
        setUsageSummaries(usage.summaries ?? [])
        setEvents(usage.events)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const updateStatus = (user: AdminUser) => {
    void setUserStatus(user.id, user.status === 'active' ? 'disabled' : 'active').then(load)
  }

  const resetPassword = (user: AdminUser) => {
    void resetUserPassword(user.id, passwordDrafts[user.id] ?? '').then(() => {
      setPasswordDrafts((current) => ({ ...current, [user.id]: '' }))
      load()
    })
  }

  return (
    <main className="safe-area-x mx-auto max-w-7xl pb-12 pt-6 lg:!px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-gray-900 dark:text-gray-100">管理总览</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">管理用户、重置密码，并查看全部账号的使用统计。</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-white/[0.08] dark:bg-gray-900">
          {[
            ['summary', '管理总览'],
            ['users', '用户管理'],
            ['usage', '使用统计'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value as AdminTab)}
              className={`rounded-md px-3 py-2 text-sm ${tab === value ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-950' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">正在加载管理数据</p>}

      {tab === 'summary' && (
        <section className="grid gap-3 md:grid-cols-4">
          {[
            ['用户数', summary?.users],
            ['活跃用户', summary?.activeUsers],
            ['调用次数', summary?.calls],
            ['成功次数', summary?.successes],
            ['失败次数', summary?.failures],
            ['生成图片', summary?.generatedImages],
            ['Token', summary?.totalTokens],
          ].map(([label, value]) => (
            <article key={label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <strong className="mt-2 block text-xl text-gray-900 dark:text-gray-100">{formatNumber(value as number)}</strong>
            </article>
          ))}
        </section>
      )}

      {tab === 'users' && (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">用户管理</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {users.map((user) => (
              <div key={user.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
                <div>
                  <strong className="block text-gray-900 dark:text-gray-100">{userLabel(user)}</strong>
                  <span className="text-gray-500 dark:text-gray-400">{user.role} · {user.status}</span>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <div>调用 {formatNumber(user.usage?.calls)}</div>
                  <div>图片 {formatNumber(user.usage?.generatedImages)}</div>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <div>注册 {formatDate(user.createdAt)}</div>
                  <div>登录 {formatDate(user.lastLoginAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => updateStatus(user)} className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/10">
                    {user.status === 'active' ? '禁用' : '启用'}
                  </button>
                  <input
                    value={passwordDrafts[user.id] ?? ''}
                    onChange={(event) => setPasswordDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                    type="password"
                    placeholder="新密码"
                    className="h-9 w-28 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button type="button" onClick={() => resetPassword(user)} className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-950">
                    重置密码
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'usage' && (
        <section className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <div className="rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">使用统计</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {usageSummaries.map((item) => (
                <div key={item.userId} className="px-4 py-3 text-sm">
                  <strong className="block text-gray-900 dark:text-gray-100">{item.email || item.phone || item.userId}</strong>
                  <span className="text-gray-500 dark:text-gray-400">
                    {formatNumber(item.calls)} 次调用 · {formatNumber(item.generatedImages)} 张图片 · {formatNumber(item.totalTokens)} Token
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">最近调用</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {events.map((event) => (
                <div key={event.id} className="grid gap-2 px-4 py-3 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-[1fr_1fr_1fr]">
                  <span>{event.endpoint || event.eventType}</span>
                  <span>{event.status === 'ok' ? '成功' : '失败'}</span>
                  <span>{formatDate(event.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
