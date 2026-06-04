# 生产部署指引

本文档用于部署当前单机生产环境：

- 域名：`https://amzimage.amzdataincn.com/`
- SSH 主机：`siliconvalley`
- 应用目录：`/opt/amazon-image-studio/app`
- 前端镜像目录：`/opt/amazon-image-studio/frontend`
- systemd 服务：`amazon-image-studio.service`

部署脚本：`scripts/deploy-production.sh`

## 脚本做什么

执行 `npm run deploy:prod` 后，脚本会按顺序完成：

1. 本地运行 `npm test`。
2. 使用生产代理配置运行 `npm run build`。
3. 检查远端应用目录和 `.env` 是否存在。
4. 读取远端 `.env` 中的 `SQLITE_PATH`，如果 SQLite 文件存在，先复制一个 `.before-deploy-*.bak` 备份。
5. 同步 `server/`、`src/`、`scripts/`、`public/`、`dist/`、`package.json`、`package-lock.json`、`.env.example`。
6. 同步 `dist/` 到 `/opt/amazon-image-studio/frontend/`。
7. 重启 `amazon-image-studio.service`。
8. 用远端 `.env` 中第一个账号做登录和 `/api/tasks` smoke test。
9. 检查公网首页、最新 JS 资源和新版 `sw.js`。

脚本不会同步或覆盖生产 `.env`，也不会打印 API Key 或密码。

## 日常部署

在本地仓库根目录执行：

```bash
npm run deploy:prod
```

等脚本输出 `Deployment complete` 后，再打开：

```text
https://amzimage.amzdataincn.com/
```

## 常用参数

只验证脚本、本地构建和生产构建参数，不同步远端、不重启服务：

```bash
npm run deploy:prod -- --dry-run
```

跳过本地测试，仅用于已经单独验证过的紧急部署：

```bash
npm run deploy:prod -- --skip-tests
```

依赖发生变化时，让远端重新安装生产依赖：

```bash
npm run deploy:prod -- --remote-npm-install
```

部署到非默认主机或目录：

```bash
DEPLOY_HOST=siliconvalley \
REMOTE_APP_DIR=/opt/amazon-image-studio/app \
REMOTE_FRONTEND_DIR=/opt/amazon-image-studio/frontend \
SERVICE_NAME=amazon-image-studio.service \
HEALTH_URL=https://amzimage.amzdataincn.com/ \
npm run deploy:prod
```

跳过远端登录 smoke test：

```bash
npm run deploy:prod -- --no-auth-smoke
```

## 生产 `.env` 要求

生产 `.env` 必须留在服务器上，不提交到仓库。

首次启动时，服务会把配置账号写入 SQLite 作为 admin。多个初始 admin 可使用：

```env
APP_ACCOUNTS_JSON='[{"username":"admin","password":"..."},{"username":"operator","password":"..."}]'
```

如果没有 `APP_ACCOUNTS_JSON`，服务仍兼容单个 admin 配置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
```

普通用户不需要写入 `.env`，可在页面自助注册，注册后立即可登录。admin 可在管理模块查看全部用户、全部使用统计，并重置普通用户密码。

AI Key 继续只配置在服务端：

```env
AI_API_BASE_URL=https://done.amzdataincn.com/reseller/v1
AI_API_KEY=...
```

## 手动验证

部署完成后可手动执行：

```bash
curl -I https://amzimage.amzdataincn.com/
curl https://amzimage.amzdataincn.com/sw.js | grep NETWORK_ONLY_PATH_PREFIXES
ssh siliconvalley 'systemctl is-active amazon-image-studio.service'
ssh siliconvalley 'journalctl -u amazon-image-studio.service -n 40 --no-pager'
```

关键结果：

- 首页 HTTP 状态是 `200`。
- `sw.js` 中包含 `NETWORK_ONLY_PATH_PREFIXES`，确保 `/api/` 和 `/api-proxy/` 不被浏览器缓存。
- systemd 状态是 `active`。
- 日志中没有启动错误。

## 回滚

代码回滚：

1. 在本地切回上一个可用 commit。
2. 重新执行 `npm run deploy:prod`。

SQLite 回滚：

1. 先停止服务：

```bash
ssh siliconvalley 'systemctl stop amazon-image-studio.service'
```

2. 找到脚本输出的 SQLite 备份路径，例如：

```text
/opt/amazon-image-studio/data/app.sqlite.before-deploy-2026-06-04T00-00-00-000Z.bak
```

3. 覆盖回正式库：

```bash
ssh siliconvalley 'cp /opt/amazon-image-studio/data/app.sqlite.before-deploy-2026-06-04T00-00-00-000Z.bak /opt/amazon-image-studio/data/app.sqlite'
```

4. 重启服务：

```bash
ssh siliconvalley 'systemctl start amazon-image-studio.service && systemctl is-active amazon-image-studio.service'
```

## 注意事项

- 不要把 `.env`、SQLite 数据库或备份文件同步回仓库。
- 新增普通用户通过页面注册；新增初始 admin 才需要改生产 `.env` 并重启服务。
- 修改 `server/`、`src/`、`public/sw.js` 后需要重新部署。
- 如果用户反馈切账号后仍看到上一个账号历史，优先确认 `sw.js` 是新版，并让用户刷新页面或重新打开浏览器。
