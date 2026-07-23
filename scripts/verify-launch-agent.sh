#!/bin/bash
# ==================================
# VERONICA -- verify the macOS LaunchAgent installation (Project B)
# ==================================
#
# Read-only: never installs, loads, or modifies anything. Checks the
# same three real things that make "VERONICA starts automatically at
# login" actually true, and reports honestly if any of them isn't:
#
#   1. Is the real plist file present at ~/Library/LaunchAgents/?
#   2. Does launchctl actually know about it (loaded, not just present
#      on disk -- a plist can exist without ever having been loaded)?
#   3. Is the dashboard it's supposed to keep running actually
#      responding right now (a real HTTP call to /api/status, same
#      endpoint core/system/startupManager.js's own health check uses)?
#
# Usage: bash scripts/verify-launch-agent.sh

set -uo pipefail

PLIST_LABEL="com.veronica.agent"
DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${DASHBOARD_PORT:-4000}"

PASS=0
FAIL=0

check(){
    local description="$1"
    local ok="$2"
    if [ "$ok" = "true" ]; then
        echo "  [OK]   $description"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $description"
        FAIL=$((FAIL + 1))
    fi
}

echo "VERONICA LaunchAgent verification"
echo "=================================="

if [ -f "$DEST" ]; then
    check "Plist file exists at $DEST" "true"
else
    check "Plist file exists at $DEST" "false"
fi

if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    check "launchctl reports the agent as loaded" "true"
else
    check "launchctl reports the agent as loaded" "false"
fi

if curl -sf -m 5 "http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/api/status" > /dev/null 2>&1; then
    check "Dashboard responds at http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/api/status" "true"
else
    check "Dashboard responds at http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/api/status" "false"
fi

echo "=================================="
echo "$PASS passed, $FAIL failed."

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "Not installed yet? Run: bash scripts/install-launch-agent.sh"
    echo "Installed but dashboard not responding? It may still be starting -- check:"
    echo "  tail -f core/logging/launchagent.out.log core/logging/launchagent.err.log"
    exit 1
fi

echo ""
echo "VERONICA's LaunchAgent is installed, loaded, and the dashboard is responding."
exit 0
