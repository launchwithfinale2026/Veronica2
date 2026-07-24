# VERONICA Deployment Guide

This document explains how VERONICA actually starts, runs, and recovers
on a Mac, and what is automatic versus what requires a one-time human
action. For the ordered list of remaining actions on THIS machine right
now, see `docs/FINAL_DEPLOYMENT_CHECKLIST.md` -- this document is the
narrative explanation; that one is the checklist.

## The three processes

VERONICA involves at most two real OS processes, plus one optional
always-on supervisor:

1. **The resident supervisor** (`core/system/startupManager.js`, run
   directly via `node core/system/startupManager.js`, or automatically
   at login via the LaunchAgent -- see "Resident Supervisor" below).
   Spawns and monitors process #2.
2. **The dashboard/backend process** (`dashboard/backend/server.js`).
   This is a single process -- there is no separate "backend" and
   "dashboard" server; the same HTTP server that serves the frontend's
   static files also serves every API route. "Backend" and "Dashboard"
   in the mega-prompts refer to one running process, not two.
3. **Discord bot connection** (optional, inside process #2, only if
   `DISCORD_BOT_TOKEN` is set) -- a real `discord.js` `Client.login()`
   call, not a separate process.

## Startup sequence

Whether started directly (`node dashboard/backend/server.js`) or via
the resident supervisor, process #2's startup is real and deterministic
-- see `docs/BootSequence.md` for the full 11-stage sequence tracked by
`core/system/bootSequence.js` and exposed at
`GET /api/system/boot-status`.

In short: configuration loads, memory/knowledge become readable
(file-backed, available the instant their modules are required),
companies/departments/packages load (a package's agents/departments/
tools are folded in automatically -- see
`core/capabilities/activation.js`), connector credentials are validated
(missing ones are logged and that one connector is disabled -- this
never blocks boot), automations register, the dashboard's HTTP server
starts listening, a real diagnostics pass runs (`healthScore.score()`),
and the process reports `online`.

## Runtime reliability

Once online, every runtime component's live state
(online/offline/starting/stopping/error/restarting) is tracked in
`core/system/runtimeState.js` and exposed at
`GET /api/system/runtime-state` -- see `docs/Architecture.md`'s "Boot
Sequence & Runtime State Registry" section for exactly which components
are registered and what triggers each transition.

## Resident Supervisor (Mac login, crash recovery)

`core/system/startupManager.js` is a thin, user-level supervisor: it
spawns the dashboard process as a child, restarts it on crash (bounded
to 5 restarts per 10-minute window, with exponential backoff up to
30s), and health-checks it every 60s over real HTTP
(`GET /api/status`). It explicitly does **not** touch sleep, shutdown,
restart, battery, or any system-level (root/LaunchDaemon) configuration
-- it is a normal, per-user, unprivileged LaunchAgent, and it only ever
spawns/monitors one already-existing entry point.

To have this run automatically at every login, a real macOS
LaunchAgent must be installed -- this is the one step VERONICA cannot
safely do for itself (see `docs/FINAL_DEPLOYMENT_CHECKLIST.md`):

```
bash scripts/install-launch-agent.sh      # installs, idempotent (safe to re-run)
bash scripts/verify-launch-agent.sh       # read-only check that it's actually loaded
bash scripts/uninstall-launch-agent.sh    # reverses it completely
```

`install-launch-agent.sh` unloads any previous copy before loading the
new one, so re-running it is always safe. It writes only to
`~/Library/LaunchAgents/` (per-user), never `/Library/LaunchDaemons/`.

**Phase 46.5 update:** the installed LaunchAgent now routes through
`scripts/start-veronica.sh` (real pre-flight checks, logging to
`runtime/logs/`) and automatically opens the dashboard in your browser
once VERONICA reaches a real `READY`/`DEGRADED` state -- see
`docs/DesktopIntegration.md` for the full breakdown, the LaunchAgent-
aware `npm run *:desktop` commands, and why stopping a LaunchAgent-
managed instance needs `launchctl unload` (via those commands) rather
than a raw signal. If you installed the LaunchAgent before this phase,
re-run `install-launch-agent.sh` to pick up the improvements.

## Configuration

All configuration is environment variables, read from `.env` in the
repo root (via `dotenv`). None of these are required for VERONICA to
boot -- a missing credential disables exactly the one connector that
needs it (logged by variable name, never by value) and nothing else.

| Variable | Purpose | Required for |
|---|---|---|
| `ANTHROPIC_API_KEY` | Primary AI provider | Any Claude-backed reasoning |
| `OPENAI_API_KEY` | Embeddings fallback | Semantic memory search |
| `API_TOKEN` | Gates every mutating dashboard route | Approving/executing anything through the dashboard UI |
| `GITHUB_TOKEN` | GitHub connector | Repo-aware capabilities |
| `DISCORD_BOT_TOKEN` | Discord bot connector | Bot presence/messaging |
| `DISCORD_WEBHOOK_URL` | Discord webhook (outgoing only) | Outgoing Discord messages without a bot |
| `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` | Google Workspace OAuth | Gmail/Calendar/Drive |
| `SERVICE_ALLOWLIST` | Comma-separated hostnames | Any outbound HTTP call from `core/integrations/http.js` |
| `DASHBOARD_PORT` (default `4000`) / `DASHBOARD_HOST` (default `127.0.0.1`) | Bind address | Reaching the dashboard from another device |
| `AUTOMATION_DISABLED=1` | Opt out of the automation tick loop | Running a second, non-scheduling instance |

`calendar`/`email`/`cloudStorage` connectors are intentionally
interface-only placeholders (no concrete provider chosen yet) -- see
`core/integrations/calendar.js`/`email.js`/`cloudStorage.js`. This is a
design decision waiting on the user, not a bug.

## Dashboard

A single HTML/JS frontend (`dashboard/frontend/`), served as static
files by the same process that serves the API. On load, it fetches
every panel's data once, then stays live via Server-Sent Events
(`GET /api/events`) -- any bus event (memory update, department
activity, boot stage, runtime state change, etc.) triggers a debounced
full refresh (`scheduleRefresh()`, 800ms), so no panel requires a
manual reload once the page is open.

Packages can register their own dashboard panels dynamically via
`core/capabilities/activation.js`'s `packageDashboardConfigs()` --
see `docs/Architecture.md`'s Project A/M section.

## What is NOT automatic (by design)

- Installing the LaunchAgent (one-time, requires the operator's
  explicit action -- see checklist).
- Setting any credential (VERONICA never fabricates or requests
  credentials on its own).
- Approving any action the approval pipeline gates (controlled
  autonomy, Phase 15).
- Google OAuth consent (a real human consent flow, not something a
  script can complete).
- Choosing a calendar/email/cloud-storage provider.
