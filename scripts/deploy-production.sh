#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-siliconvalley}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/amazon-image-studio/app}"
REMOTE_FRONTEND_DIR="${REMOTE_FRONTEND_DIR:-/opt/amazon-image-studio/frontend}"
SERVICE_NAME="${SERVICE_NAME:-amazon-image-studio.service}"
HEALTH_URL="${HEALTH_URL:-https://amzimage.amzdataincn.com/}"
RUN_REMOTE_AUTH_SMOKE="${RUN_REMOTE_AUTH_SMOKE:-1}"
REMOTE_NPM_INSTALL="${REMOTE_NPM_INSTALL:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"
DRY_RUN="${DRY_RUN:-0}"
REMOTE_NODE_BIN="${REMOTE_NODE_BIN:-/opt/amazon-image-studio/runtime/node-v22.22.2-linux-x64/bin/node}"
REMOTE_NPM_BIN="${REMOTE_NPM_BIN:-/opt/amazon-image-studio/runtime/node-v22.22.2-linux-x64/bin/npm}"
REMOTE_NODE_DIR="$(dirname "$REMOTE_NODE_BIN")"

VITE_DEFAULT_API_URL="${VITE_DEFAULT_API_URL:-https://done.amzdataincn.com/reseller/v1}"
VITE_API_PROXY_AVAILABLE="${VITE_API_PROXY_AVAILABLE:-true}"
VITE_API_PROXY_LOCKED="${VITE_API_PROXY_LOCKED:-true}"
VITE_API_PROXY_SERVER_KEY_AVAILABLE="${VITE_API_PROXY_SERVER_KEY_AVAILABLE:-true}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-production.sh [options]

Options:
  --dry-run              Run tests/build, then stop before remote changes.
  --skip-tests           Skip npm test.
  --remote-npm-install   Run npm ci --omit=dev on the remote host.
  --no-auth-smoke        Skip remote login and /api/tasks smoke test.
  -h, --help             Show this help.

Environment overrides:
  DEPLOY_HOST, REMOTE_APP_DIR, REMOTE_FRONTEND_DIR, SERVICE_NAME, HEALTH_URL
  VITE_DEFAULT_API_URL, VITE_API_PROXY_AVAILABLE, VITE_API_PROXY_LOCKED
  VITE_API_PROXY_SERVER_KEY_AVAILABLE, REMOTE_NODE_BIN, REMOTE_NPM_BIN
USAGE
}

log() {
  printf '\n==> %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --skip-tests)
      SKIP_TESTS=1
      ;;
    --remote-npm-install)
      REMOTE_NPM_INSTALL=1
      ;;
    --no-auth-smoke)
      RUN_REMOTE_AUTH_SMOKE=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_command npm
require_command ssh
require_command rsync
require_command curl
require_command grep

log "Project: $ROOT_DIR"
log "Target: $DEPLOY_HOST:$REMOTE_APP_DIR"
log "Frontend mirror: $DEPLOY_HOST:$REMOTE_FRONTEND_DIR"
log "Service: $SERVICE_NAME"
log "Health URL: $HEALTH_URL"
if [[ "$DRY_RUN" == "1" ]]; then
  log "Dry run enabled; tests and build will run, remote files and service will not change"
fi

if [[ "$SKIP_TESTS" != "1" ]]; then
  log "Running tests"
  npm test
else
  log "Skipping tests because SKIP_TESTS=1"
fi

log "Building production bundle"
VITE_DEFAULT_API_URL="$VITE_DEFAULT_API_URL" \
VITE_API_PROXY_AVAILABLE="$VITE_API_PROXY_AVAILABLE" \
VITE_API_PROXY_LOCKED="$VITE_API_PROXY_LOCKED" \
VITE_API_PROXY_SERVER_KEY_AVAILABLE="$VITE_API_PROXY_SERVER_KEY_AVAILABLE" \
npm run build

if [[ "$DRY_RUN" == "1" ]]; then
  log "Dry run complete; stopping before remote backup, sync, restart, and health checks"
  exit 0
fi

log "Checking remote app directory and .env"
ssh "$DEPLOY_HOST" "test -d '$REMOTE_APP_DIR' && test -f '$REMOTE_APP_DIR/.env'"

log "Backing up remote SQLite database if present"
ssh "$DEPLOY_HOST" "cd '$REMOTE_APP_DIR' && PATH='$REMOTE_NODE_DIR':\$PATH '$REMOTE_NODE_BIN'" <<'REMOTE_NODE'
const fs = require('fs')
const path = require('path')
const envPath = '.env'
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const index = trimmed.indexOf('=')
  if (index < 0) continue
  env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
}
const sqlitePath = env.SQLITE_PATH || path.join(process.cwd(), 'data', 'app.sqlite')
if (!fs.existsSync(sqlitePath)) {
  console.log(JSON.stringify({ backedUp: false, reason: 'sqlite-not-found' }))
  process.exit(0)
}
const suffix = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = `${sqlitePath}.before-deploy-${suffix}.bak`
fs.copyFileSync(sqlitePath, backupPath)
console.log(JSON.stringify({ backedUp: true, backupPath }))
REMOTE_NODE

log "Syncing application files"
rsync -az package.json package-lock.json .env.example "$DEPLOY_HOST:$REMOTE_APP_DIR/"
rsync -az --delete server/ "$DEPLOY_HOST:$REMOTE_APP_DIR/server/"
rsync -az --delete src/ "$DEPLOY_HOST:$REMOTE_APP_DIR/src/"
rsync -az --delete scripts/ "$DEPLOY_HOST:$REMOTE_APP_DIR/scripts/"
rsync -az --delete public/ "$DEPLOY_HOST:$REMOTE_APP_DIR/public/"
rsync -az --delete dist/ "$DEPLOY_HOST:$REMOTE_APP_DIR/dist/"
ssh "$DEPLOY_HOST" "mkdir -p '$REMOTE_FRONTEND_DIR'"
rsync -az --delete dist/ "$DEPLOY_HOST:$REMOTE_FRONTEND_DIR/"

if [[ "$REMOTE_NPM_INSTALL" == "1" ]]; then
  log "Installing production dependencies on remote because REMOTE_NPM_INSTALL=1"
  ssh "$DEPLOY_HOST" "cd '$REMOTE_APP_DIR' && PATH='$REMOTE_NODE_DIR':\$PATH '$REMOTE_NPM_BIN' ci --omit=dev"
else
  log "Skipping remote npm install; set REMOTE_NPM_INSTALL=1 when dependencies changed"
fi

log "Restarting service"
ssh "$DEPLOY_HOST" "systemctl restart '$SERVICE_NAME' && systemctl is-active '$SERVICE_NAME'"

if [[ "$RUN_REMOTE_AUTH_SMOKE" == "1" ]]; then
  log "Running remote auth and storage smoke test"
  ssh "$DEPLOY_HOST" "cd '$REMOTE_APP_DIR' && PATH='$REMOTE_NODE_DIR':\$PATH '$REMOTE_NODE_BIN'" <<'REMOTE_NODE'
const fs = require('fs')
;(async () => {
  const envText = fs.readFileSync('.env', 'utf8')
  const env = {}
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  const accounts = env.APP_ACCOUNTS_JSON || env.ADMIN_ACCOUNTS_JSON
    ? JSON.parse(env.APP_ACCOUNTS_JSON || env.ADMIN_ACCOUNTS_JSON)
    : [{ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }]
  const account = accounts[0]
  const base = `http://127.0.0.1:${env.PORT || env.API_PORT || 5174}`
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password }),
  })
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  const tasks = cookie ? await fetch(`${base}/api/tasks`, { headers: { cookie } }) : null
  const result = {
    accountCount: accounts.length,
    loginStatus: login.status,
    tasksStatus: tasks?.status ?? null,
  }
  console.log(JSON.stringify(result))
  if (result.loginStatus !== 200 || result.tasksStatus !== 200) process.exit(1)
})()
REMOTE_NODE
else
  log "Skipping remote auth smoke test because RUN_REMOTE_AUTH_SMOKE=0"
fi

log "Checking public health URL"
curl -fsSI "$HEALTH_URL" >/dev/null
curl -fsS "$HEALTH_URL" | grep -E 'assets/index-[^" ]+\.js' >/dev/null
curl -fsS "${HEALTH_URL%/}/sw.js" | grep "NETWORK_ONLY_PATH_PREFIXES" >/dev/null

log "Deployment complete"
