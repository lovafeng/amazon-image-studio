# 用户体系与管理后台设计

## 背景

当前应用已经有本地 Node 服务、SQLite 存储、httpOnly cookie 登录态，以及按账号隔离的任务、图片、缩略图和 Amazon 策划历史。现状仍偏单管理员或配置账号模式，不支持用户自助注册、邮箱或电话登录、管理员重置密码，也没有使用统计和管理后台。

本次目标是在现有架构上增加完整但聚焦的用户体系：

- 普通用户可注册，注册后立即可登录使用。
- 登录支持邮箱或电话任选其一加密码。
- admin 可在管理模块查看用户、统计和重置普通用户密码。
- 使用统计区分 admin 全量视图和普通用户个人视图。
- 管理模块参考 `cliproxy-reseller` 的后台结构，但只实现当前项目需要的账号和统计能力。

## 范围

本次实现：

- 用户注册、登录、登出、当前登录态。
- 用户角色：`admin` 和 `user`。
- 用户状态：`active` 和 `disabled`。
- admin 管理模块，包含总览、用户管理、使用统计、密码重置能力。
- 普通用户个人统计页。
- SQLite 用户表、统计表和必要迁移。
- 后端 API 权限控制。
- 前端真实页面验收。

本次不实现：

- 邮件、短信验证码。
- 用户自行找回密码。
- 邀请码、充值、计费、账单、API Key、IP 规则。
- 多级管理员权限。
- 复杂报表导出。

## 设计选择

推荐采用“完整后台外壳 + 聚焦功能模块”。

相较只在 Header 里塞一个简单弹窗，独立管理模块更接近参考项目，后续扩展空间更清楚。相较完整复制参考项目，不引入计费、兑换码、风控等无关概念，避免当前项目被不相关业务拖重。

当前项目没有 React Router。第一版不强行引入路由库，而是在 `App` 内维护视图状态：

- `workspace`：现有图片工作台。
- `admin`：管理员后台。
- `usage`：普通用户个人统计。

Header 根据角色显示入口。admin 看到“工作台”和“管理”；普通用户看到“工作台”和“统计”。这样能获得后台式的信息架构，同时保持改动低侵入。

## 数据模型

新增 `users` 表：

- `id` text primary key
- `email` text unique
- `phone` text unique
- `password_hash` text not null
- `role` text not null
- `status` text not null
- `created_at` integer not null
- `last_login_at` integer

约束：

- `email` 和 `phone` 至少一个非空。
- `role` 只使用 `admin` 或 `user`。
- `status` 只使用 `active` 或 `disabled`。

新增 `usage_events` 表：

- `id` text primary key
- `user_id` text not null
- `event_type` text not null
- `status` text not null
- `endpoint` text
- `model` text
- `generated_images` integer not null default 0
- `prompt_tokens` integer not null default 0
- `completion_tokens` integer not null default 0
- `total_tokens` integer not null default 0
- `created_at` integer not null

统计口径：

- AI 代理请求记录为一次调用。
- 成功响应计入成功次数，失败响应计入失败次数。
- 如果上游响应包含图片或可解析的生成结果，记录生成图片数。
- 如果上游响应包含 `usage` 字段，记录 token；没有则 token 为 0。

现有业务表继续使用 `owner` 字段隔离。新用户的 `owner` 使用 `users.id`。旧数据和旧 admin owner 保持兼容，迁移时把环境变量里的首个管理员账号写入 `users`，其 owner 可继续映射到原 admin 标识。

## 认证与权限

密码使用 Node `crypto.scryptSync` 哈希，存储格式为 `scrypt:<salt>:<hash>`。

服务端启动时确保存在 admin 用户：

- 优先读取现有 `APP_ACCOUNTS_JSON` / `ADMIN_USERNAME` / `ADMIN_PASSWORD`。
- 第一个配置账号为 admin。
- 迁移后普通登录不再直接依赖明文环境变量账号列表。

登录 API 接收：

- `identifier`：邮箱或电话。
- `password`：密码。

注册 API 接收：

- `email`：可选。
- `phone`：可选。
- `password`：必填。

注册成功后创建 `active user`，并直接写入会话 cookie。

会话 token payload 改为：

- `userId`
- `role`
- `expiresAt`

每次 `/api/auth/me` 和业务 API 会检查用户仍存在且状态为 `active`。disabled 用户不能继续使用。

权限规则：

- 未登录不能访问 `/api/*` 业务接口。
- 普通用户只能访问自己的数据和统计。
- admin 可以访问管理 API 和全部统计。
- admin 也可以使用现有工作台，数据 owner 为 admin 用户 id。

## API

认证 API：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

普通用户统计 API：

- `GET /api/usage/me`

admin API：

- `GET /api/admin/summary`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/reset-password`
- `GET /api/admin/usage`

现有数据 API 保持路径不变，但 owner 从 session 的 `userId` 获取。

## 前端

登录页改为账号入口：

- 支持“登录”和“注册”切换。
- 登录表单：邮箱或电话、密码。
- 注册表单：邮箱、电话、密码；邮箱或电话至少填一个。

Header：

- 显示用户邮箱、电话或账号标识。
- 普通用户显示“统计”入口。
- admin 显示“管理”入口。
- 保留设置、帮助、安装、退出。

admin 管理模块采用后台布局：

- 左侧或顶部页签：总览、用户管理、使用统计。
- 总览展示用户数、活跃用户数、今日调用、今日生成图片数、失败次数。
- 用户管理展示邮箱、电话、角色、状态、注册时间、最近登录、调用统计，并支持启用/禁用和重置密码。
- 使用统计展示全部用户汇总列表，可按用户筛选。

普通用户统计页：

- 展示个人调用次数、成功/失败次数、生成图片数、token 总量和最近调用明细。

## 错误处理

遵循项目偏好的 fail-fast：

- 服务端启动时数据库初始化失败直接失败。
- admin 初始化所需环境变量缺失直接失败。
- 注册重复邮箱或电话返回明确错误。
- 登录失败返回账号或密码错误。
- disabled 用户返回未授权或账号已禁用。

不加入邮件找回、短信验证、重试、自动兜底账号。

## 测试

先写失败测试，再实现：

- 服务端用户存储：创建 admin、注册普通用户、邮箱/电话唯一、密码校验、禁用状态。
- 服务端认证：邮箱登录、电话登录、注册后登录态、登出、disabled 用户拒绝。
- admin API：普通用户不能访问，admin 可列用户、改状态、重置密码、看全部统计。
- usage API：普通用户只看到自己，admin 看到全部。
- AI 代理统计：成功、失败、图片数量、usage token 能被记录。
- 前端 API helper：登录、注册、当前用户、admin 用户管理和统计请求路径正确。
- 前端组件：登录/注册表单、admin 管理模块入口、普通用户统计入口。

完成后运行：

```bash
npm test
npm run build
```

并启动本地服务，用 in-app browser 验收：

- 注册普通用户后立即进入工作台。
- 邮箱或电话登录均可进入。
- 普通用户只能看自己的统计。
- admin 可进入管理模块，看全部用户和统计。
- admin 重置普通用户密码后，新密码可登录。

## 自检

- 设计聚焦账号、管理和统计，没有引入参考项目的计费、兑换码、API Key 和风控模块。
- 数据模型支持邮箱或电话任选其一登录。
- admin 重置密码通过后台完成，不依赖邮件或短信。
- 使用统计第一版有稳定口径，token 字段只在上游提供时记录。
- 前端后台结构参考完整后台，但不强制引入新路由库，避免不必要迁移。
