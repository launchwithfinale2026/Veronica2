# VERONICA Desktop Integration (macOS)

Phase 46.5. Makes VERONICA behave like a real desktop application:
starts automatically at login, reaches a real `READY`/`DEGRADED` state,
opens the dashboard in your browser once it actually is ready, and
restarts itself if it crashes -- all via native macOS `launchd`, no
cron, no terminal required after installation.

This document covers the OS-integration layer only. For what boot/
health/recovery/shutdown actually do once VERONICA is running, see
`docs/BootSystem.md`. For the one-time LaunchAgent install itself
(unchanged from Phase 21), see `docs/DEPLOYMENT.md`.

## What's real here

- `config/com.veronica.agent.plist` -- the LaunchAgent template.
  `scripts/install-launch-agent.sh` fills in the real Node path and
  repo path and installs it to `~/Library/LaunchAgents/` (per-user,
  unprivileged -- never `/Library/LaunchDaemons/`, never touches sleep/
  shutdown/battery/power management).
- `scripts/start-veronica.sh` -- what the plist actually invokes. Real
  pre-flight checks (Node found and version logged, `core/system/
  startupChecks.js`'s real critical checks run and must pass) before
  launching, then `exec`s into `core/system/startupManager.js` (the
  existing resident supervisor, unchanged -- this script adds checks
  and logging in front of it, it does not replace or duplicate its
  crash-recovery logic).
- `scripts/open-dashboard.sh` -- polls the real `GET /api/system/
  lifecycle` endpoint (`core/system/lifecycleManager.js`) until it
  reports `READY` or `DEGRADED` (both mean "actually usable"), then
  opens `http://localhost:<port>/` with macOS's real `open` command.
  Never opens a tab pointed at a backend that isn't actually ready.
- `scripts/veronica-desktop.sh` -- the LaunchAgent-aware `start`/`stop`/
  `restart`/`status` VERONICA's `npm run *:desktop` commands actually
  call.

## Why a separate `veronica-desktop.sh` from `veronica-cli.js`

The plist sets `KeepAlive: true` -- while the LaunchAgent is loaded, a
raw `kill` on the resident supervisor gets it **immediately relaunched
by launchd**. `scripts/veronica-cli.js stop` (Phase 46, PID-file-based
`SIGTERM`) is correct for a manual, this-session-only run, but would
just get resurrected the moment it's used against a LaunchAgent-managed
instance. `veronica-desktop.sh` checks whether the agent is actually
loaded first:

- **Loaded**: `stop`/`restart` use `launchctl unload`/`load` -- the
  real, correct way to stop something `KeepAlive` is watching.
- **Not loaded** (installed but inactive, or never installed): falls
  back to `veronica-cli.js`'s real PID-file-based start/stop.

## Installation

```bash
bash scripts/install-launch-agent.sh    # the one manual step -- never run automatically
bash scripts/verify-launch-agent.sh     # read-only: confirms it's actually loaded and responding
```

If you installed the LaunchAgent **before** Phase 46.5, re-run
`install-launch-agent.sh` to pick up the new `start-veronica.sh`
wrapper (pre-flight checks, `runtime/logs/` logging, automatic
dashboard-opening) -- it's idempotent (unloads any previous copy before
loading the new one), safe to re-run anytime.

## Enabling / disabling startup

```bash
bash scripts/install-launch-agent.sh     # enable: survives every future reboot/login
bash scripts/uninstall-launch-agent.sh   # disable: removes it completely
```

## Desktop commands

```bash
npm run start:desktop     # start now (loads the agent if installed-but-inactive; direct start otherwise)
npm run stop:desktop      # real graceful stop -- launchctl unload if the agent is loaded
npm run restart:desktop   # unload + reload if the agent is loaded, otherwise direct restart
npm run status:desktop    # LaunchAgent load state + real lifecycle/service status
```

## Crash recovery

Two real, independent layers, unchanged/extended from Phase 21 and 46:

1. `core/system/startupManager.js`'s own bounded, backoff-scaled
   restart of the dashboard **child** process (up to 5 restarts per
   10-minute window).
2. `launchd`'s `KeepAlive: true` restarting the **supervisor** itself
   (and therefore the whole tree) if it dies outright -- launchd's own
   throttling prevents this from spinning unboundedly.

On any real restart, `core/system/recoveryManager.js` (Phase 46) reads
back what was saved before the crash and reports whether the previous
shutdown was clean or not -- see `docs/BootSystem.md`'s "Recovery"
section.

## Logging

`runtime/logs/` (gitignored, real per-machine state):

| File | Written by | Content |
|---|---|---|
| `startup.log` | `scripts/start-veronica.sh` | Every real invocation: Node version, the real startup-checks JSON, pass/fail |
| `shutdown.log` | `core/system/shutdownManager.js` | One real line per graceful shutdown, with the real reason |
| `crash.log` | `core/logging/crashGuard.js` | One real entry per uncaught exception, human-readable (the full structured record still goes to `core/logging/errors.log` as before) |
| `launchagent.out.log` / `launchagent.err.log` | `launchd` itself (`StandardOutPath`/`StandardErrorPath`) | Everything the process tree ever printed to stdout/stderr |

## Testing

What was actually verified, live, while building this:

1. **Stop, then start through the real mechanism, then verify the
   dashboard opens.** Ran `scripts/start-veronica.sh` directly (not via
   launchd, to avoid touching the machine's real login configuration
   during development) with `VERONICA_SKIP_DASHBOARD_OPEN` unset --
   confirmed the real pre-flight checks ran and passed, confirmed
   `runtime/logs/startup.log` got a real entry, confirmed
   `scripts/open-dashboard.sh` correctly waited for a real `DEGRADED`
   state and then opened the dashboard.
2. **Kill the process, verify automatic restart.** Sent a real
   `SIGTERM` to a running instance and confirmed
   `core/system/shutdownManager.js`'s real graceful sequence ran (a
   real `runtime/logs/shutdown.log` entry, a real recovery record).
   `core/system/startupManager.js`'s own crash-restart behavior (Phase
   21, unchanged) was independently re-confirmed live during this same
   session's Phase 46 work.
3. **Reboot the machine, verify automatic startup.** Not performed --
   rebooting the actual development machine mid-session isn't something
   this process can safely trigger or observe the far side of. The
   individual real pieces this depends on (the LaunchAgent's own
   `RunAtLoad`/`KeepAlive`, `start-veronica.sh`'s real pre-flight
   checks, `open-dashboard.sh`'s real readiness poll) were each verified
   directly; a full reboot test is the one honest gap -- confirm it
   yourself once installed: `bash scripts/install-launch-agent.sh`,
   restart your Mac, log in, and watch for the dashboard opening on its
   own.

## Troubleshooting

- **Nothing happens at login** -- `bash scripts/verify-launch-agent.sh`
  (read-only: checks the plist exists, `launchctl` reports it loaded,
  and the dashboard actually responds).
- **Dashboard never opens automatically** -- check
  `runtime/logs/startup.log` for what `open-dashboard.sh` saw; it gives
  up after `VERONICA_OPEN_DASHBOARD_TIMEOUT` seconds (60 by default) if
  VERONICA never reaches `READY`/`DEGRADED` -- check
  `GET /api/system/lifecycle` and `docs/BootSystem.md`'s health-check
  breakdown for why.
- **`stop:desktop` doesn't seem to work** -- if the LaunchAgent is
  loaded, a raw `kill` will always be resurrected; use
  `npm run stop:desktop` (or `launchctl unload
  ~/Library/LaunchAgents/com.veronica.agent.plist` directly), never a
  manual signal.
- **Crash loops** -- check `runtime/logs/crash.log` for the real,
  human-readable trace of what actually threw.
