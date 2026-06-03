import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

describe('LoginPage', () => {
  it('renders username, password, and submit controls', () => {
    const html = renderToStaticMarkup(
      <LoginPage
        onLogin={async () => ({ authenticated: true, username: 'admin' })}
      />,
    )

    expect(html).toContain('管理员登录')
    expect(html).toContain('name="username"')
    expect(html).toContain('name="password"')
    expect(html).toContain('登录')
  })
})
