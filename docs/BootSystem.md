# VERONICA Boot System

Phase 46 ("System Resurrection & Operational Boot Layer"). This
document covers the system-wide lifecycle layer: boot, shutdown, crash
recovery, health verification, and the service registry --
`core/system/{systemState,systemEvents,serviceRegistry,healthManager,
startupChecks,recoveryManager,shutdownManager,bootManager,
lifecycleManager}.js`.

This is a **different layer** from `docs/BootSequence.md`, which still
describes exactly what it always did: the real, one-time, 11-stage
record of `dashboard/backend/server.js`'s own top-level module-load
order. That tracker is untouched. The system in this document sits
above it -- a real, richer lifecycle (with DEGRADED/FAILED/RECOVERING/
SHUTTING_DOWN states bootSequence.js never had), real crash recovery,
real active health checks, and a real service registry -- built by
**composing** bootSequence/runtimeState/healthScore/credentialManager,
never re-implementing any of them.

## Why two layers

`core/system/bootSequence.js` answers "did this real load sequence
finish, and in what order." `core/system/systemState.js` (this phase)
answers "is VERONICA, as a whole, actually usable right now, and why
not if not." The dashboard process itself still marks its own
`bootSequence` stages exactly as before; separately, once that real
boot reaches `online`, `core/system/lifecycleManager.js` runs its own
real boot pass on top -- environment validation, service registration,
crash recovery, and active health verification -- landing on READY,
DEGRADED, or FAILED.

## Lifecycle states

```
OFFLINE → STARTING → CONFIGURING → LOADING → RECOVERING → VERIFYING → READY
                                                                     ↘ DEGRADED
                                                                     ↘ FAILED
```

Any of `STARTING`/`CONFIGURING`/`LOADING`/`RECOVERING`/`VERIFYING`/
`READY`/`DEGRADED`/`FAILED` can transition to `SHUTTING_DOWN` at any
time -- a real SIGTERM can arrive mid-boot, not just once settled.
`SHUTTING_DOWN` → `OFFLINE` is the only way out; `FAILED` → `STARTING`
supports a real retry.

Every transition publishes a real `system.stateChanged` bus event
(`{ previous, current, timestamp, reason }`), plus one specific event
per meaningful target state (`system.ready`, `system.degraded`,
`system.failure`, `system.shutdownStarted`, `system.offline`) -- see
`core/system/systemEvents.js`. `core/system/systemState.js` is a pure,
guarded state machine (an invalid transition throws) with zero I/O --
the same proven shape as `core/voice/conversationState.js`.

## Boot sequence (what `bootManager.boot()` actually does)

1. **STARTING** → **CONFIGURING**: `core/system/startupChecks.js` runs
   real, boot-gating checks -- Node version, required directories
   (created if missing, same bootstrap convention as
   `core/device/deviceManager.js`), `package.json`'s declared
   dependencies actually resolving, `identity.json` parsing validly.
   A **critical** failure here halts boot (`FAILED`, boot never
   proceeds to LOADING) -- connector credentials and capability health
   are checked too, but are always advisory (a missing API key disables
   one connector; it must never halt the whole system).
2. **LOADING**: each real subsystem already loaded by the host process
   (agents, router, voice, dashboard, the event bus, logging) is
   registered into a real `ServiceRegistry` -- see below. Nothing is
   loaded a second way here; this only records what's already real.
3. **RECOVERING**: `core/system/recoveryManager.js` reads real state
   left behind by the previous run -- see "Recovery" below.
4. **VERIFYING**: `core/system/healthManager.js` runs a full, active
   health pass (see "Health checks" below). The result decides the
   final state: `healthy` → **READY**, `degraded` → **DEGRADED**,
   `unhealthy` → **FAILED**.

## Service registry

`core/system/serviceRegistry.js` -- distinct from
`core/system/runtimeState.js` (which tracks ongoing online/offline/
error/restarting transitions with history, e.g. `dashboard-child`'s
crash-restart state): this answers "what services does VERONICA know
about, their real declared dependencies, and current status" -- closer
to a dependency manifest than a process monitor.

```js
registry.register({ name: "voiceEngine", version: "1.0", status: "READY", dependencies: ["eventBus"] });
registry.updateStatus("voiceEngine", "FAILED", "mic unavailable");
registry.checkDependencies("voiceEngine"); // { satisfied, missing: [], failed: [] }
registry.isOperational(); // false if empty, or if anything is FAILED
```

`register()` rejects a duplicate name (call `updateStatus()` for a real
status change instead). Publishes `system.serviceRegistered` /
`system.serviceStatusChanged`.

### Adding a new service

When a real new subsystem is built, register it in
`core/system/bootManager.js`'s `boot()` (LOADING stage), right where
its own real readiness is already known:

```js
registry.register({ name: "myNewSubsystem", status: mySubsystem.isReady() ? "READY" : "FAILED", dependencies: ["eventBus"] });
```

No other file needs to change -- `getAllServices()`, the dashboard's
lifecycle panel, and `veronica status`/`diagnose` all read the registry
generically.

## Health checks

`core/system/healthManager.js` -- **active** verification, not a
mystery "healthy" string. Every check actually calls the real thing:

| Check | What it really does |
|---|---|
| `eventBus` | Publishes a real probe event and confirms it was actually received |
| `router` | Confirms `core/router` resolves and exports a real constructor (does NOT construct a full Router -- that means a real Brain/Claude client, too heavy for a routine health check) |
| `database` | Calls `core/memory`'s real `view()` |
| `filesystem` | Real `fs.accessSync()` on a real directory |
| `aiProvider` | `credentialManager.isConfigured("claude")` -- honestly does not verify the model is reachable (a real API call on every health check would cost real money/latency) |
| `agentLoader` | Calls the real `loadAgents()` |
| `voice` | Reads `core/voice`'s own real `status()` |
| `dashboard` | Reports the real, live SSE connection count, passed in by the route (never fabricated as 0 when unknown) |
| `resources` | Delegates to the existing `core/system/healthScore.js` (CPU/RAM/disk) -- not re-implemented |

Every result is `{ system, status, timestamp, latency, details }`.
`runAll()`'s overall status is never better than its worst real
finding. `GET /api/system/health-check` (`veronica health`) runs this
live, on demand.

## Recovery

`core/system/recoveryManager.js` persists to `runtime/` (gitignored,
per-machine, same treatment as `core/automation/state.json`):

- `runtime/state/current.json` -- the real, latest lifecycle snapshot,
  saved periodically and on every graceful shutdown.
- `runtime/snapshots/` -- a real, timestamped history of the above,
  bounded to the most recent 20.
- `runtime/recovery/last-shutdown.json` -- written ONLY by a real
  graceful shutdown (`{ reason, timestamp, activeTasks, failures }`).

On boot, `recoverOnBoot()` reports, all real:

- **`previousState`** -- the last saved snapshot, if any.
- **`wasCleanShutdown`** -- true only when a real shutdown record
  exists and is at least as recent as the last state save. A crash
  leaves a state save with no matching (or a stale) shutdown record --
  reported honestly as unclean, never assumed clean.
- **`unfinishedTasks`** -- real automation queue entries still marked
  `"running"` (`core/automation/engine.js`'s own load-time logic
  already resets these to `"pending"` so they re-run -- this only
  surfaces that real recovery action, it doesn't duplicate it).
- **`recentErrors`** -- the real tail of `core/logging/errors.log`.
- **`activeDevices`** -- real, currently-online devices
  (`core/device/deviceManager.js`'s real heartbeat-derived status).

## Clean shutdown

`core/system/shutdownManager.js` -- this genuinely did not exist before
Phase 46. `dashboard/backend/server.js` had no `SIGINT`/`SIGTERM`
handler of its own at all (only the separate resident-supervisor
process, `core/system/startupManager.js`, did -- and that just kills
this process abruptly). Now:

```
SIGINT/SIGTERM
  → stop accepting commands
  → save real state (recoveryManager.saveSnapshot())
  → stop voice, if it was running
  → stop automation, if it was running
  → flush logs (a real no-op -- core/logging writes synchronously; documented, not silently skipped)
  → close the real HTTP server / SSE connections
  → record the real shutdown reason (recoveryManager.recordShutdown())
  → SHUTTING_DOWN → OFFLINE
```

Every step calls a real, already-existing stop/close method -- nothing
here is reimplemented, just sequenced and recorded.

## Startup Diagnostic Mode

```bash
VERONICA_DIAGNOSTIC=true npm run dashboard
```

Prints the real boot result to stdout as it happens -- every line is a
real `startupChecks`/service-registry finding, never canned:

```
[BOOT]
✓ nodeVersion -- Node 24.18.0
✓ directories -- 3 required directories accessible
✓ eventBus (READY)
✓ router (READY)
⚠ voice (DISABLED)

SYSTEM READY
```

## The CLI

`scripts/veronica-cli.js` (`npm link` to get a real `veronica` command,
or run it directly with `node scripts/veronica-cli.js <command>`):

- `status` / `health` / `diagnose` -- read the real running dashboard's
  own HTTP API (`/api/system/lifecycle`, `/api/system/health-check`,
  `/api/system/diagnose`).
- `start` -- spawns the dashboard process detached.
- `stop` -- reads the real PID file `dashboard/backend/server.js`
  writes at boot (`runtime/state/dashboard.pid`) and sends a real
  `SIGTERM`, then polls until the process actually exits.
- `restart` -- `stop` then `start`.

Deliberately does not install/manage a LaunchAgent -- that stays
`scripts/install-launch-agent.sh`'s own explicit, operator-run step
(see `docs/DEPLOYMENT.md`). This CLI operates an already-running (or
about-to-run) deployment; it doesn't decide how VERONICA is deployed.

## Dashboard integration

Mission Control's footer shows the real lifecycle state (fetched once
on load, updated live via `system.stateChanged` SSE events -- no
polling). The central node visualization also reacts to it: a real
`FAILED` transition flashes the node red (`error`), and
`SHUTTING_DOWN`/`OFFLINE` show as `offline` -- same real, event-driven
CSS-class-toggle mechanism `docs/Dashboard.md` describes for voice
states, extended with one more real input.

## Testing

Eight test files, one per module, plus a full end-to-end restart
simulation (`tests/system-lifecycle-manager.test.js`): boot a real
`LifecycleManager`, save a real state snapshot, discard the instance
with **no** graceful shutdown call (simulating a real crash), construct
a fresh instance, boot it again, and assert the real recovery report
honestly identifies the previous run as an unclean shutdown -- then a
second version of the same test proves a real graceful `shutdown()`
call is correctly distinguished as clean on the next boot.
