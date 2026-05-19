#!/usr/bin/env bash
# scripts/update-letta.sh
# ──────────────────────────────────────────────────────────────────────────────
# Checks whether the upstream letta/letta:latest image has changed any of the
# files we have patched.  Run this before `docker compose pull` to know if you
# need to re-apply or merge the Tellama patches.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LETTA_SRC="$REPO_ROOT/letta-server"

PATCHED_FILES=(
  "letta/agents/letta_agent_v2.py"
  "letta/llm_api/llm_client_base.py"
  "letta/adapters/simple_llm_request_adapter.py"
  "letta/adapters/simple_llm_stream_adapter.py"
  "letta/adapters/letta_llm_request_adapter.py"
  "letta/adapters/letta_llm_stream_adapter.py"
  "letta/server/rest_api/routers/v1/messages.py"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tellama / Letta patch updater"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "▶  Pulling latest letta/letta image..."
docker pull letta/letta:latest
echo ""
echo "▶  Comparing patched files against upstream..."
echo ""

CHANGED=0
for f in "${PATCHED_FILES[@]}"; do
  local_file="$LETTA_SRC/$f"

  if [ ! -f "$local_file" ]; then
    echo "  ⚠️   MISSING local patch: $f"
    CHANGED=1
    continue
  fi

  upstream=$(docker run --rm --entrypoint cat letta/letta:latest "/app/$f" 2>/dev/null || true)

  if diff <(echo "$upstream") "$local_file" > /dev/null 2>&1; then
    echo "  ✅  $f  (unchanged)"
  else
    echo ""
    echo "  ⚠️   $f  — UPSTREAM CHANGED"
    echo "  ── diff (upstream → local patch) ──────────────────────────"
    diff <(echo "$upstream") "$local_file" | head -80 | sed 's/^/    /'
    echo "  ────────────────────────────────────────────────────────────"
    echo ""
    CHANGED=1
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $CHANGED -eq 0 ]; then
  echo "  ✅  All patched files are safe. You can update Letta now:"
  echo ""
  echo "      cd letta-server && docker compose pull && docker compose up -d"
else
  echo "  ⚠️   Some patched files changed upstream."
  echo "  Review the diffs above, merge your patches into the new"
  echo "  versions, then run:"
  echo ""
  echo "      cd letta-server && docker compose pull && docker compose up -d"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
