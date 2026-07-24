#!/bin/bash
# ==================================
# VERONICA -- desktop start/stop/restart/status (Phase 46.5)
# ==================================
#
# What `npm run start:desktop`/`stop:desktop`/`restart:desktop`/
# `status:desktop` actually call. LaunchAgent-aware: the plist's real
# KeepAlive setting means a raw `kill` on the supervisor process gets
# it immediately relaunched by launchd while the agent is loaded -- so
# stop/restart use `launchctl unload`/`load` in that case, and fall
# back to scripts/veronica-cli.js's real PID-file-based approach only
# when the LaunchAgent isn't installed/loaded (a manual, this-session-
# only run).
#
# Never installs the LaunchAgent itself -- that stays
# scripts/install-launch-agent.sh's own explicit, operator-run step.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_LABEL="com.veronica.agent"
PLIST_DEST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"


is_agent_loaded(){
    launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"
}


cmd_start(){

    if is_agent_loaded; then
        echo "LaunchAgent already loaded -- VERONICA starts automatically at every login."
        echo "To force a fresh restart right now, run: bash scripts/veronica-desktop.sh restart"
        return 0
    fi

    if [ -f "$PLIST_DEST" ]; then
        echo "LaunchAgent installed but not currently loaded -- loading it."
        launchctl load "$PLIST_DEST"
        return 0
    fi

    echo "LaunchAgent not installed -- starting VERONICA directly for this session only."
    echo "(Run 'bash scripts/install-launch-agent.sh' to also survive a reboot.)"
    node "$REPO_DIR/scripts/veronica-cli.js" start

}


cmd_stop(){

    if is_agent_loaded; then
        echo "Unloading the LaunchAgent -- the correct way to stop VERONICA while it's installed"
        echo "(a raw kill would just be relaunched immediately by launchd's KeepAlive)."
        launchctl unload "$PLIST_DEST"
        return 0
    fi

    node "$REPO_DIR/scripts/veronica-cli.js" stop

}


cmd_restart(){

    if is_agent_loaded; then
        echo "Restarting via the LaunchAgent (unload, then load)."
        launchctl unload "$PLIST_DEST"
        sleep 1
        launchctl load "$PLIST_DEST"
        return 0
    fi

    node "$REPO_DIR/scripts/veronica-cli.js" restart

}


cmd_status(){

    if is_agent_loaded; then
        echo "LaunchAgent: loaded (starts automatically at every login)"
    elif [ -f "$PLIST_DEST" ]; then
        echo "LaunchAgent: installed but not currently loaded"
    else
        echo "LaunchAgent: not installed (run 'bash scripts/install-launch-agent.sh' for VERONICA to survive a reboot)"
    fi

    echo ""
    node "$REPO_DIR/scripts/veronica-cli.js" status

}


case "${1:-}" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    *)
        echo "Usage: bash scripts/veronica-desktop.sh <start|stop|restart|status>" >&2
        exit 1
        ;;
esac
