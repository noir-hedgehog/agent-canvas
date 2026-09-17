#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "请先安装 Node.js 24 或更高版本。"; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("需要 Node.js 24 或更高版本");process.exit(1)}'
if [ ! -f node_modules/tsx/dist/loader.mjs ]; then
  echo "首次启动：安装运行依赖…"
  npm ci --omit=dev --no-audit --no-fund
fi
exec node --import tsx server/index.ts
