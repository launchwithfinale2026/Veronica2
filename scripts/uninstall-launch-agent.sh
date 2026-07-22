#!/bin/bash
# Reverses scripts/install-launch-agent.sh: unloads and removes the
# LaunchAgent. Does not touch anything else on the machine.

set -euo pipefail

PLIST_LABEL="com.veronica.agent"
DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ -f "$DEST" ]; then
    launchctl unload "$DEST" 2>/dev/null || true
    rm "$DEST"
    echo "Removed: $DEST"
else
    echo "Not installed: $DEST does not exist."
fi
