import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

describe('LoginPage', () => {
  it('renders username, password, and submit controls', () => {
    const html = renderToStaticMarkup(
      <LoginPage
        onLogin={async () => ({ authenticated: true, user: { id: 'admin-a', email: 'admin', role: 'admin', status: 'active' } })}
        onRegister={async () => ({ authenticated: true, user: { id: 'user-a', email: 'user@example.com', role: 'user', status: 'active' } })}
      />,
    )

    expect(html).toContain('账号登录')
    expect(html).toContain('邮箱或电话')
    expect(html).toContain('创建账号')
    expect(html).toContain('name="identifier"')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="password"')
    expect(html).toContain('登录')
  })
})
