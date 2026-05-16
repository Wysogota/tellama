#!/usr/bin/env bash
# scripts/letta-start.sh
# ──────────────────────────────────────────────────────────────────────────────
# Starts the Letta docker-compose stack (if not already running) and waits
# for the server to become healthy before exiting.
# Called by `npm run dev` so the app always boots with Letta ready.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../letta-server/compose.yaml"
LETTA_URL="http://localhost:8283"
MAX_WAIT=90   # seconds

# ── 1. Check if already running ───────────────────────────────────────────────
if curl -sf "$LETTA_URL/v1/health" > /dev/null 2>&1; then
  echo "[Letta] ✅ Already running"
  exit 0
fi

# ── 2. Start the stack ────────────────────────────────────────────────────────
echo "[Letta] Starting docker compose stack..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 3. Wait for health ────────────────────────────────────────────────────────
echo "[Letta] Waiting for server on $LETTA_URL ..."
WAITED=0
while true; do
  if curl -sf "$LETTA_URL/v1/health" > /dev/null 2>&1; then
    echo "[Letta] ✅ Server is ready (${WAITED}s)"
    exit 0
  fi
  # Fallback: try the agents list endpoint (older Letta versions may not have /health)
  if curl -sf "$LETTA_URL/v1/agents?limit=1" > /dev/null 2>&1; then
    echo "[Letta] ✅ Server is ready (${WAITED}s)"
    exit 0
  fi
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "[Letta] ❌ Timed out after ${MAX_WAIT}s waiting for Letta to start"
    echo "         Check logs: docker compose -f letta-server/compose.yaml logs letta_server"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
