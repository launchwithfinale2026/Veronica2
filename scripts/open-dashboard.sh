#!/bin/bash
# ==================================
# VERONICA -- open the dashboard once real, not before (Phase 46.5)
# ==================================
#
# Polls the real GET /api/system/lifecycle endpoint (core/system/
# lifecycleManager.js, Phase 46) until it reports a real operational
# state (READY, or DEGRADED -- both mean "actually usable," matching
# SystemState.isOperational()'s own definition; only FAILED/anything
# else means "not yet, keep waiting"), then opens the dashboard with
# macOS's real `open` command. Never opens a browser tab pointed at a
# backend that isn't actually ready yet.

set -uo pipefail

HOST="${DASHBOARD_HOST:-127.0.0.1}"
PORT="${DASHBOARD_PORT:-4000}"
TIMEOUT_SECONDS="${VERONICA_OPEN_DASHBOARD_TIMEOUT:-60}"
URL="http://${HOST}:${PORT}/"

echo "Waiting up to ${TIMEOUT_SECONDS}s for VERONICA to reach a real operational state at ${URL}..."

elapsed=0
last_state=""

while [ "$elapsed" -lt "$TIMEOUT_SECONDS" ]; do

    response="$(curl -sf -m 3 "http://${HOST}:${PORT}/api/system/lifecycle" 2>/dev/null || true)"

    if [ -n "$response" ]; then
        # The real lifecycle.state field -- the first (and only)
        # "state":"..." in this endpoint's real response shape
        # (services carry "status", not "state").
        last_state="$(echo "$response" | grep -o '"state":"[A-Z_]*"' | head -1 | sed -E 's/"state":"([A-Z_]*)"/\1/')"

        if [ "$last_state" = "READY" ] || [ "$last_state" = "DEGRADED" ]; then
            echo "VERONICA is $last_state -- opening dashboard."
            open "$URL"
            exit 0
        fi
    fi

    sleep 1
    elapsed=$((elapsed + 1))

done

echo "Timed out after ${TIMEOUT_SECONDS}s waiting for VERONICA to become operational (last known state: ${last_state:-unreachable})." >&2
exit 1
