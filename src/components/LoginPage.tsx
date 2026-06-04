import { useState, type FormEvent } from 'react'
import type { AuthSession, RegisterInput } from '../lib/auth'

interface LoginPageProps {
  onLogin: (identifier: string, password: string) => Promise<AuthSession>
  onRegister: (input: RegisterInput) => Promise<AuthSession>
}

export default function LoginPage({ onLogin, onRegister }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    onLogin(identifier.trim(), loginPassword)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSubmitting(false))
  }

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    onRegister({ email: email.trim(), phone: phone.trim(), password: registerPassword })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSubmitting(false))
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="safe-area-x mx-auto flex min-h-screen max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_1fr]">
        <form
          onSubmit={handleLoginSubmit}
          className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-gray-900"
        >
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-normal">账号登录</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              使用邮箱或电话进入亚马逊图片工作台
            </p>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            邮箱或电话
            <input
              name="identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
            密码
            <input
              name="password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {submitting ? '登录中' : '登录'}
          </button>
        </form>

        <form
          onSubmit={handleRegisterSubmit}
          className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-gray-900"
        >
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-normal">创建账号</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              邮箱或电话至少填写一项，注册后立即可用
            </p>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            邮箱
            <input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
            电话
            <input
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
            密码
            <input
              name="password"
              type="password"
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-2 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 h-11 w-full rounded-md bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-500 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white"
          >
            {submitting ? '创建中' : '创建账号'}
          </button>
        </form>
        </div>
      </div>
    </main>
  )
}
