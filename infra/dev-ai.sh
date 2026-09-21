#!/usr/bin/env bash
# 启动 NEXUS AI Service（FastAPI）。见 docs/ENVIRONMENT.md「AI Service」。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="$ROOT/apps/ai-service"
HOST="${AI_SERVICE_HOST:-127.0.0.1}"
PORT="${AI_SERVICE_PORT:-3200}"

if [[ -x "$SERVICE/.venv/Scripts/python.exe" ]]; then
  PY="$SERVICE/.venv/Scripts/python.exe"
elif [[ -x "$SERVICE/.venv/bin/python" ]]; then
  PY="$SERVICE/.venv/bin/python"
else
  echo "[dev:ai] 创建虚拟环境 $SERVICE/.venv"
  python -m venv "$SERVICE/.venv"
  if [[ -x "$SERVICE/.venv/Scripts/python.exe" ]]; then
    PY="$SERVICE/.venv/Scripts/python.exe"
  else
    PY="$SERVICE/.venv/bin/python"
  fi
fi

"$PY" -m pip install -q -r "$SERVICE/requirements.txt"

# 本地开发：provider key 只从 env 文件读，不写进仓库也不打印
# 优先 apps/ai-service/.env，其次复用 apps/web/.env.local（两者都在 .gitignore / hook 黑名单里）
for env_file in "$SERVICE/.env" "$ROOT/apps/web/.env.local"; do
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^[[:space:]]*(export[[:space:]]+)?(NEXUS|AI_SERVICE)_' "$env_file" || true)
    set +a
  fi
done

echo "[dev:ai] http://$HOST:$PORT/healthz"
cd "$SERVICE"
export PYTHONPATH="$SERVICE/src"
exec "$PY" -m uvicorn ai_service.app:app --host "$HOST" --port "$PORT"
