#!/bin/bash
# ==================================
# VERONICA -- install the macOS LaunchAgent (Phase 21: Mac Resident System)
# ==================================
#
# The one manual step that actually changes this machine's real login
# behavior -- deliberately NOT run automatically by anything in this
# repo. Fills in config/com.veronica.agent.plist's __NODE_PATH__/
# __REPO_PATH__ placeholders with this machine's real paths, copies the
# result to ~/Library/LaunchAgents/ (per-user, unprivileged -- never
# /Library/LaunchDaemons/), and loads it with launchctl.
#
# Usage:  bash scripts/install-launch-agent.sh
# Verify: bash scripts/verify-launch-agent.sh
# Undo:   bash scripts/uninstall-launch-agent.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_PATH="$(command -v node)"
PLIST_LABEL="com.veronica.agent"
DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ -z "$NODE_PATH" ]; then
    echo "Could not find 'node' on PATH -- install Node.js first." >&2
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

sed \
    -e "s#__NODE_PATH__#${NODE_PATH}#g" \
    -e "s#__REPO_PATH__#${REPO_DIR}#g" \
    "${REPO_DIR}/config/com.veronica.agent.plist" > "$DEST"

launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"

echo "Installed and loaded: $DEST"
echo "VERONICA's dashboard will now start automatically at login."
echo "To verify: bash ${REPO_DIR}/scripts/verify-launch-agent.sh"
echo "To undo: bash ${REPO_DIR}/scripts/uninstall-launch-agent.sh"
