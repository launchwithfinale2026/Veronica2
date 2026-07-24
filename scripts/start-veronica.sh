#!/bin/bash
# ==================================
# VERONICA -- desktop-app-style startup wrapper (Phase 46.5)
# ==================================
#
# What config/com.veronica.agent.plist actually invokes at login (via
# scripts/install-launch-agent.sh) -- also runnable directly
# (`bash scripts/start-veronica.sh`) for a manual desktop-style launch.
# Real pre-flight validation, then execs into
# core/system/startupManager.js (the real, already-existing resident
# supervisor -- this script does not reimplement crash recovery, boot
# sequencing, or anything else that already exists; it only adds the
# checks/logging requested for this phase in front of it).
#
# `exec` at the end replaces this shell process with the real node
# process -- launchd tracks that process directly (its PID doesn't
# change again after this script's own setup), so KeepAlive/signal
# handling both work exactly as if launchd had invoked node directly.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

LOG_DIR="$REPO_DIR/runtime/logs"
mkdir -p "$LOG_DIR"
STARTUP_LOG="$LOG_DIR/startup.log"

log(){
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" | tee -a "$STARTUP_LOG"
}

log "start-veronica.sh invoked (cwd: $REPO_DIR)"

# VERONICA_NODE_PATH is set by the real, installed plist (resolved by
# scripts/install-launch-agent.sh at install time, since launchd's own
# PATH is minimal and doesn't reliably include a Homebrew/nvm node) --
# falls back to whatever `node` resolves to on PATH for a manual,
# interactive run.
NODE_BIN="${VERONICA_NODE_PATH:-node}"

if ! command -v "$NODE_BIN" > /dev/null 2>&1; then
    log "FATAL: node not found (tried: $NODE_BIN). Install Node.js or fix VERONICA_NODE_PATH."
    exit 1
fi

NODE_VERSION="$("$NODE_BIN" -e 'console.log(process.versions.node)' 2>/dev/null)"
log "Node version: ${NODE_VERSION:-unknown}"

# Real startup checks (core/system/startupChecks.js) -- reused, not
# reimplemented. A critical failure (bad Node version, missing
# directories, unresolvable dependencies, invalid identity.json) means
# VERONICA genuinely cannot run; this script must not launch it broken.
CHECKS_OUTPUT="$("$NODE_BIN" -e "
require('dotenv').config();
const checks = require('./core/system/startupChecks');
const result = checks.runAll();
console.log(JSON.stringify(result));
process.exit(result.passed ? 0 : 1);
" 2>&1)"
CHECKS_EXIT=$?

log "Startup checks: $CHECKS_OUTPUT"

if [ "$CHECKS_EXIT" -ne 0 ]; then
    log "FATAL: critical startup checks failed -- not launching. See the JSON above for which check(s) failed."
    exit 1
fi

log "Startup checks passed."

# Fire-and-forget: waits for a real READY/DEGRADED state, then opens
# the dashboard in the default browser. Runs independently so it never
# blocks (or is blocked by) the real supervisor process below -- if it
# fails for any reason, VERONICA itself is entirely unaffected.
if [ "${VERONICA_SKIP_DASHBOARD_OPEN:-}" != "1" ]; then
    ( bash "$REPO_DIR/scripts/open-dashboard.sh" >> "$LOG_DIR/startup.log" 2>&1 & )
fi

log "Launching core/system/startupManager.js (resident supervisor)."

exec "$NODE_BIN" "$REPO_DIR/core/system/startupManager.js"
