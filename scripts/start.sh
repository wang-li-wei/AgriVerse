#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
if [[ -x "$PROJECT_ROOT/.tools/bin/node" ]]; then
  export PATH="$PROJECT_ROOT/.tools/bin:$PATH"
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "需要 Node.js 22+ 和 npm。请先安装 Node.js，再运行此脚本。"
  exit 1
fi
PYTHON_BIN="${AGRIVERSE_PYTHON:-python3}"
if [[ ! -d .venv ]]; then "$PYTHON_BIN" -m venv .venv; fi
if ! .venv/bin/python -c 'import fastapi,uvicorn,httpx,dotenv' >/dev/null 2>&1; then
  .venv/bin/pip install -r backend/requirements.txt
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ "${1:-}" == "--production" ]]; then
  npm run build
  echo "AgriVerse → http://127.0.0.1:8000"
  exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
fi
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
node node_modules/vite/bin/vite.js --host 127.0.0.1 &
FRONTEND_PID=$!
cleanup() { kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
echo "AgriVerse → http://127.0.0.1:5173"
echo "按 Ctrl+C 停止前后端服务。"
wait -n "$BACKEND_PID" "$FRONTEND_PID"
