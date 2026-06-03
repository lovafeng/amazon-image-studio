# 单管理员登录与 SQLite 存储设计

## 背景

当前应用是纯前端 Vite / React 工作台，业务数据保存在浏览器 IndexedDB 中。这个模式适合本机单人使用，但任何能打开页面的人都能进入应用，也无法把数据集中保存到 SQLite。

本次目标是增加最小可用的账号登录体系，并把业务数据迁移到本地 SQLite 存储。

## 范围

本次只实现单管理员账号：

- 管理员账号、密码从 `.env` 读取。
- 不开放注册。
- 不做页面内用户管理。
- 不做密码找回或多角色权限。
- 未登录用户不能访问业务 API。

SQLite 存储覆盖现有主要本地数据：

- 任务记录 `tasks`
- 原图 `images`
- 缩略图 `thumbnails`
- Amazon 策划历史 `amazon_planner_sessions`

## 架构

新增本地 Node 服务端，前端仍保留现有 Vite / React 结构。

服务端职责：

- 读取 `.env` 中的 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SESSION_SECRET`。
- 提供登录、登出、当前登录态 API。
- 使用 httpOnly cookie 保存会话。
- 拦截未登录的 `/api/*` 请求。
- 读写 `data/app.sqlite`。

前端职责：

- 启动时请求 `/api/auth/me` 判断是否已登录。
- 未登录时显示登录页。
- 登录后进入现有工作台。
- Header 增加退出入口。
- `src/lib/db.ts` 保持现有函数名，内部改为请求服务端 API，减少对 `store.ts` 的改动。

## 数据模型

SQLite 采用低侵入模型，优先保持现有前端数据结构。

`tasks`

- `id` text primary key
- `record_json` text not null
- `created_at` integer

`images`

- `id` text primary key
- `data_url` text not null
- `metadata_json` text not null
- `created_at` integer

`thumbnails`

- `id` text primary key
- `thumbnail_data_url` text not null
- `metadata_json` text not null

`amazon_planner_sessions`

- `id` text primary key
- `record_json` text not null
- `updated_at` integer

这个设计避免在第一版重拆所有 TypeScript 类型。后续如果需要复杂查询，再把常用字段提升为独立列。

## API

认证 API：

- `POST /api/auth/login`：提交账号密码，成功后写入 cookie。
- `POST /api/auth/logout`：清除 cookie。
- `GET /api/auth/me`：返回当前登录态。

数据 API：

- `GET /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks`
- `GET /api/images/:id`
- `GET /api/images`
- `GET /api/images/ids`
- `PUT /api/images/:id`
- `DELETE /api/images/:id`
- `DELETE /api/images`
- `GET /api/thumbnails/:id`
- `PUT /api/thumbnails/:id`
- `GET /api/amazon-planner-sessions`
- `PUT /api/amazon-planner-sessions/:id`
- `DELETE /api/amazon-planner-sessions/:id`
- `DELETE /api/amazon-planner-sessions`

## 运行方式

新增环境示例：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
SESSION_SECRET=change-me-to-a-long-random-string
SQLITE_PATH=data/app.sqlite
```

新增脚本：

- `npm run server:dev`：启动本地 API 服务。
- `npm run dev:app`：同时启动 Vite 和 API 服务，供本地使用。
- `npm run server:start`：生产方式启动 API 服务并托管构建产物。

## 迁移策略

第一版不自动读取浏览器 IndexedDB 并上传到 SQLite。保留现有导出 / 导入功能：

1. 老版本先导出 ZIP。
2. 新版本登录后导入 ZIP。
3. 导入逻辑通过新的 `db.ts` API 写入 SQLite。

这样实现简单，也避免浏览器本地旧数据自动上传造成误解。

## 错误处理

遵循项目偏好的 fail-fast：

- 必需环境变量缺失时，服务端启动失败。
- SQLite 初始化失败时，服务端启动失败。
- 未登录访问业务 API 返回 401。
- 前端登录失败显示服务端返回的错误文案。

不加入注册兜底、默认弱口令兜底、自动降级到 IndexedDB。

## 测试

先写失败测试，再实现：

- 服务端认证：正确账号登录成功，错误账号失败，登出后 `/me` 未登录。
- API 鉴权：未登录访问数据 API 返回 401。
- SQLite CRUD：任务、图片、缩略图、策划历史能写入、读取、删除、清空。
- 前端状态：未登录显示登录页，登录成功进入工作台，退出后回到登录页。

完成后运行：

```bash
npm test
npm run build
```

并使用 in-app browser 打开本地页面验收登录、退出和基础历史数据写入流程。

## 非目标

本次不实现：

- 多用户。
- 用户注册。
- 页面内账号管理。
- 细粒度权限。
- 云端托管数据库。
- 自动从 IndexedDB 静默迁移数据。
