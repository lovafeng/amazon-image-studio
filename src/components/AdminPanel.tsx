import { useEffect, useState } from 'react'
import {
  getAdminOperations,
  getAdminSummary,
  getAdminTasks,
  getAdminUsage,
  getAdminUsers,
  resetUserPassword,
  setUserTokenLimit,
  setUserStatus,
  type AdminSummary,
  type AdminTask,
  type AdminUser,
  type AdminOperationsSummary,
  type UsageEvent,
  type UsageSummary,
} from '../lib/admin'

type AdminTab = 'summary' | 'users' | 'usage' | 'operations' | 'tasks'

function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString()
}

function formatDate(value?: number) {
  return value ? new Date(value).toLocaleString() : '暂无'
}

function formatTokenLimit(value?: number | null) {
  return value == null ? '不限' : formatNumber(value)
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value ?? 0) * 100)}%`
}

function formatSeconds(value?: number) {
  const seconds = Number(value ?? 0)
  if (seconds < 60) return `${formatNumber(seconds)} 秒`
  return `${formatNumber(Math.round(seconds / 60))} 分钟`
}

function userLabel(user: Pick<AdminUser, 'email' | 'phone' | 'id'>) {
  return user.email || user.phone || user.id
}

function adminTaskUserLabel(task: AdminTask) {
  return task.email || task.phone || task.userId
}

function taskStatusLabel(status?: string) {
  if (status === 'done') return '完成'
  if (status === 'running') return '进行中'
  if (status === 'error') return '失败'
  return status || '未知'
}

function metricCard(label: string, value: string | number, note?: string) {
  return (
    <article key={label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <strong className="mt-2 block text-xl text-gray-900 dark:text-gray-100">{typeof value === 'number' ? formatNumber(value) : value}</strong>
      {note && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{note}</span>}
    </article>
  )
}

export function AdminOperationsStats({ operations }: { operations: AdminOperationsSummary | null }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">北极星指标</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {metricCard('可上架商品图套', operations?.northStar.completedImageSets ?? 0, '已确认 6 视图且目标图片位生成完成')}
          {metricCard('套图完成率', formatPercent(operations?.funnel.workspaces ? (operations.funnel.completedImageSets / operations.funnel.workspaces) : 0), '完成套图 / 商品工作区')}
          {metricCard('单图成功率', formatPercent(operations?.stability.imageTaskSuccessRate), '成功输出图任务 / 全部任务')}
          {metricCard('每套调用', operations?.cost.callsPerCompletedImageSet.toFixed(1) ?? '0.0', 'AI 调用次数 / 完成套图')}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">生产漏斗</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {metricCard('商品工作区', operations?.funnel.workspaces ?? 0)}
          {metricCard('资料已准备', operations?.funnel.preparedWorkspaces ?? 0)}
          {metricCard('已生成 6 视图', operations?.funnel.sixViewGeneratedWorkspaces ?? 0)}
          {metricCard('已确认 6 视图', operations?.funnel.sixViewConfirmedWorkspaces ?? 0)}
          {metricCard('已生成风格板', operations?.funnel.styleGeneratedWorkspaces ?? 0)}
          {metricCard('风格板图片', operations?.funnel.styleGeneratedImages ?? 0)}
          {metricCard('已完成策划', operations?.funnel.plannedWorkspaces ?? 0)}
          {metricCard('已开始出图', operations?.funnel.imageStartedWorkspaces ?? 0)}
          {metricCard('套图完成', operations?.funnel.completedImageSets ?? 0)}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">效率</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div>单图 P80：{formatSeconds(operations?.efficiency.imageTaskP80Seconds)}</div>
            <div>单图平均：{formatSeconds(operations?.efficiency.imageTaskAverageSeconds)}</div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">稳定性</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div>图片任务：{formatNumber(operations?.stability.imageTasks)}</div>
            <div>成功 / 失败：{formatNumber(operations?.stability.imageTaskSuccesses)} / {formatNumber(operations?.stability.imageTaskFailures)}</div>
            <div>失败率：{formatPercent(operations?.stability.imageTaskFailureRate)}</div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">成本与质量</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div>调用次数：{formatNumber(operations?.cost.calls)}</div>
            <div>Token：{formatNumber(operations?.cost.totalTokens)}</div>
            <div>生成图片：{formatNumber(operations?.cost.generatedImages)}</div>
            <div>收藏率：{formatPercent(operations?.quality.favoriteRate)}，收藏任务 {formatNumber(operations?.quality.favoriteTasks)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('summary')
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [operations, setOperations] = useState<AdminOperationsSummary | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usageSummaries, setUsageSummaries] = useState<UsageSummary[]>([])
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})
  const [tokenLimitDrafts, setTokenLimitDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([getAdminSummary(), getAdminUsers(), getAdminUsage(), getAdminOperations(), getAdminTasks()])
      .then(([nextSummary, nextUsers, usage, nextOperations, nextTasks]) => {
        setSummary(nextSummary)
        setUsers(nextUsers)
        setUsageSummaries(usage.summaries ?? [])
        setEvents(usage.events)
        setOperations(nextOperations)
        setTasks(nextTasks)
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

  const saveTokenLimit = (user: AdminUser) => {
    const draft = tokenLimitDrafts[user.id] ?? ''
    void setUserTokenLimit(user.id, draft.trim() ? Number(draft) : null).then(() => {
      setTokenLimitDrafts((current) => ({ ...current, [user.id]: '' }))
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
            ['operations', '运营统计'],
            ['tasks', '分析任务'],
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
            ['Token 上限', users.filter((user) => user.tokenLimit != null).length],
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
            <div key={user.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.3fr_1fr_1fr_1.9fr]">
                <div>
                  <strong className="block text-gray-900 dark:text-gray-100">{userLabel(user)}</strong>
                  <span className="text-gray-500 dark:text-gray-400">{user.role} · {user.status}</span>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <div>调用 {formatNumber(user.usage?.calls)}</div>
                  <div>图片 {formatNumber(user.usage?.generatedImages)}</div>
                  <div>Token {formatNumber(user.usage?.totalTokens)} / {formatTokenLimit(user.tokenLimit)}</div>
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
                  <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <span className="whitespace-nowrap text-xs">Token 上限</span>
                    <input
                      value={tokenLimitDrafts[user.id] ?? ''}
                      onChange={(event) => setTokenLimitDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                      type="number"
                      min="0"
                      placeholder={formatTokenLimit(user.tokenLimit)}
                      className="h-9 w-28 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                    />
                  </label>
                  <button type="button" onClick={() => saveTokenLimit(user)} className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/10">
                    保存上限
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

      {tab === 'operations' && (
        <AdminOperationsStats operations={operations} />
      )}

      {tab === 'tasks' && (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">分析任务</h2>
          </div>
          {!loading && tasks.length === 0 && <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">暂无分析任务</p>}
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {tasks.map((item) => (
              <div key={`${item.owner}:${item.task.id}`} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.1fr_0.8fr_0.8fr_2fr_0.7fr]">
                <div>
                  <strong className="block text-gray-900 dark:text-gray-100">{adminTaskUserLabel(item)}</strong>
                  <span className="text-gray-500 dark:text-gray-400">{item.role || 'user'} · {item.status || 'active'}</span>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <strong className="block text-gray-900 dark:text-gray-100">{taskStatusLabel(item.task.status)}</strong>
                  <span>{formatDate(item.task.createdAt)}</span>
                </div>
                <div className="text-gray-600 dark:text-gray-300">
                  <div>{item.task.apiProvider || 'openai'}</div>
                  <div className="truncate">{item.task.apiModel || item.task.apiProfileName || '默认模型'}</div>
                </div>
                <p className="line-clamp-2 text-gray-700 dark:text-gray-200">{item.task.prompt || '无提示词'}</p>
                <div className="text-gray-600 dark:text-gray-300">
                  <div>{formatNumber(item.task.outputImages?.length)} 张图</div>
                  <div>{item.task.elapsed == null ? '耗时暂无' : `${formatNumber(Math.round(item.task.elapsed / 1000))} 秒`}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
