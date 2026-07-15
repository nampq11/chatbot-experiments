#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- Check prerequisites ----------
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
command -v docker >/dev/null 2>&1 || missing+=("docker")

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing prerequisites: ${missing[*]}"
  echo "  Please install: Node.js v20+, pnpm v10+, Docker"
  exit 1
fi

# ---------- Environment file ----------
if [ -f .git ]; then
  # Inside a git worktree (.git is a file, not a directory)
  ENV_FILE=".env.worktree"
  if [ ! -f "$ENV_FILE" ]; then
    echo "==> Worktree detected. Generating $ENV_FILE..."
    cp .env.example "$ENV_FILE"
  fi
else
  ENV_FILE=".env"
  if [ ! -f "$ENV_FILE" ]; then
    echo "==> Creating $ENV_FILE from .env.example..."
    cp .env.example "$ENV_FILE"
  fi
fi

echo "==> Using $ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# Ensure packages/server/.env exists for backend
mkdir -p packages/server
if [ ! -f packages/server/.env ]; then
  echo "==> Creating packages/server/.env..."
  cat > packages/server/.env << EOF
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8080}
DATABASE_URL=${DATABASE_URL:-mysql://root:password@127.0.0.1:3306/dentaltrip}
EOF
fi

# ---------- Install dependencies ----------
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  pnpm install
fi

# ---------- Database ----------
bash scripts/ensure-mysql.sh "$ENV_FILE"

# ---------- Start services ----------
echo ""
echo "✓ Ready. Starting services..."
echo "  Backend:  http://localhost:${PORT:-8080}"
echo "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo ""

trap 'kill 0' EXIT
pnpm --filter @dentaltrip-ai/server dev &
pnpm --filter web dev &
wait
