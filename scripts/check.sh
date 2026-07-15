#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Full verification pipeline: typecheck → unit tests → server tests → E2E
# Usage: bash scripts/check.sh [full|--browser-smoke]
# ==========================================================================

MODE="${1:-full}"
RUN_FULL_CHECKS=true
PLAYWRIGHT_ARGS=()
PLAYWRIGHT_LABEL="E2E tests (Playwright)"

case "$MODE" in
  full)
    ;;
  --browser-smoke|browser-smoke)
    RUN_FULL_CHECKS=false
    PLAYWRIGHT_ARGS=(
      "e2e/chat.spec.ts"
      "--grep"
      "initial state shows centered input when no session exists|creating a new session and sending a message"
    )
    PLAYWRIGHT_LABEL="Browser smoke test (Playwright)"
    ;;
  *)
    echo "Usage: bash scripts/check.sh [full|--browser-smoke]"
    exit 1
    ;;
esac

ENV_FILE="${ENV_FILE:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create .env from .env.example, or run 'make worktree-env' and use .env.worktree."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_NAME="${DB_NAME:-dentaltrip}"
DB_PORT="${DB_PORT:-3306}"
PORT="${PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:${FRONTEND_PORT}}"
export PLAYWRIGHT_BASE_URL

BACKEND_PID=""
FRONTEND_PID=""
STARTED_BACKEND=false
STARTED_FRONTEND=false
EXIT_CODE=0

# --------------------------------------------------------------------------
# Cleanup: kill only services this script started
# --------------------------------------------------------------------------
cleanup() {
  echo ""
  if [ "$STARTED_BACKEND" = true ] && [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
    echo "    Stopped backend (PID $BACKEND_PID)"
  fi
  if [ "$STARTED_FRONTEND" = true ] && [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null && wait "$FRONTEND_PID" 2>/dev/null || true
    echo "    Stopped frontend (PID $FRONTEND_PID)"
  fi
  echo ""
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "✓ All checks passed."
  else
    echo "✗ Checks FAILED."
  fi
  exit "$EXIT_CODE"
}
trap cleanup EXIT

# --------------------------------------------------------------------------
# Utility: wait until a port responds
# --------------------------------------------------------------------------
wait_for_port() {
  local port=$1 name=$2 max_wait=${3:-60} path=${4:-/}
  local elapsed=0
  echo "    Waiting for $name on :$port..."
  while ! curl -sf "http://localhost:${port}${path}" > /dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_wait" ]; then
      echo "    ERROR: $name did not start within ${max_wait}s"
      EXIT_CODE=1
      exit 1
    fi
  done
  echo "    $name ready (${elapsed}s)"
}

# --------------------------------------------------------------------------
# Step 0: Ensure DB
# --------------------------------------------------------------------------
echo "==> Using env file: $ENV_FILE"
echo "==> Checking MySQL..."
bash scripts/ensure-mysql.sh "$ENV_FILE"

# --------------------------------------------------------------------------
if [ "$RUN_FULL_CHECKS" = true ]; then
  # ------------------------------------------------------------------------
  # Step 1: TypeScript typecheck
  # ------------------------------------------------------------------------
  echo ""
  echo "==> [1/5] TypeScript typecheck..."
  pnpm typecheck || { EXIT_CODE=1; exit 1; }

  # ------------------------------------------------------------------------
  # Step 2: TypeScript unit tests (Vitest)
  # ------------------------------------------------------------------------
  echo ""
  echo "==> [2/5] TypeScript unit tests..."
  pnpm test || { EXIT_CODE=1; exit 1; }

  # ------------------------------------------------------------------------
  # Step 3: Server tests
  # ------------------------------------------------------------------------
  echo ""
  echo "==> [3/5] Server tests..."
  (cd server && pnpm test) || { EXIT_CODE=1; exit 1; }
fi

# --------------------------------------------------------------------------
# Step 4: Start services for E2E (only if not already running)
# --------------------------------------------------------------------------
echo ""
if [ "$RUN_FULL_CHECKS" = true ]; then
  echo "==> [4/5] Starting services for E2E..."
else
  echo "==> [1/2] Starting services for browser smoke..."
fi

if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
  echo "    Backend already running on :$PORT"
else
  echo "    Starting backend..."
  (cd server && pnpm dev) > /tmp/dentaltrip-ai-check-backend.log 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND=true
  wait_for_port "$PORT" "Backend" 90 "/health"
fi

if curl -sf "http://localhost:${FRONTEND_PORT}" > /dev/null 2>&1; then
  echo "    Frontend already running on :$FRONTEND_PORT"
else
  echo "    Starting frontend..."
  PORT="$FRONTEND_PORT" pnpm --filter web dev > /tmp/dentaltrip-ai-check-frontend.log 2>&1 &
  FRONTEND_PID=$!
  STARTED_FRONTEND=true
  wait_for_port "$FRONTEND_PORT" "Frontend" 120 "/"
fi

# --------------------------------------------------------------------------
# Step 5: E2E tests (Playwright)
# --------------------------------------------------------------------------
echo ""
if [ "$RUN_FULL_CHECKS" = true ]; then
  echo "==> [5/5] $PLAYWRIGHT_LABEL..."
else
  echo "==> [2/2] $PLAYWRIGHT_LABEL..."
fi
pnpm exec playwright test "${PLAYWRIGHT_ARGS[@]}" || { EXIT_CODE=1; exit 1; }
