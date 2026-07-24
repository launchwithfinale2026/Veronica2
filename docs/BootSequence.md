# VERONICA Boot Sequence

This document describes the **real, implemented** boot sequence, as
tracked by `core/system/bootSequence.js` and surfaced at
`GET /api/system/boot-status`. It supersedes the earlier draft of this
file, which described an aspirational sequence written before the
tracker existed.

Every stage below is recorded the moment `dashboard/backend/server.js`'s
own top-level module code genuinely finishes that piece of work --
there is no simulated delay between stages. Because Node's `require()`
model is synchronous, most stages complete within milliseconds of each
other on a normal boot; what matters is that each one is a real
completion, not a cosmetic progress bar.

## The 11 real stages

1. **`initializing`** -- `bootSequence`/`runtimeState` are required and
   the module begins executing. `runtimeState` registers
   `dashboard-process` as `starting`.
2. **`loading_configuration`** -- `identity.json` has been read.
3. **`loading_memory`** -- Memory/knowledge are file-backed and
   available the instant their modules are required; there is nothing
   further to "load" beyond that.
4. **`loading_companies`** -- immediately follows: a company is an
   ordinary memory entry (`core/executive/companyManager.js`), not a
   separate store with its own load step.
5. **`loading_departments`** -- `loadDepartments(agents)` has returned.
   Each department is also registered into `runtimeState` as
   `department:<id>`, `online`.
6. **`loading_packages`** -- `loadDepartments()`/`loadAgents()` already
   fold in every active package's own agents/departments/tools
   (`core/capabilities/activation.js`), so this is marked immediately
   after departments load, honestly reflecting that packages are
   already live by this point.
7. **`loading_connectors`** -- `credentialManager.validateStartup()` has
   run, so every connector's credential/config state is known for this
   run. Connectors with a real async login step (Discord) still connect
   on their own after this, tracked via their own `status()`.
8. **`loading_automations`** -- `automation.registerExecutionJob()` has
   returned (registration, not the tick loop -- see below).
9. **`loading_dashboard`** -- immediately before `createServer()` is
   called.
10. **`running_diagnostics`** -- inside the `server.listen()` callback,
    once a real `healthScore.score()` call has completed.
11. **`online`** -- the final stage. `runtimeState` sets
    `dashboard-process` to `online` at the same moment.

## Reading boot status

```
GET /api/system/boot-status
```

Returns `{ startedAt, stages, completed, currentStage, online,
progressPercent }` -- `completed` is a real, timestamped list of every
stage that has actually finished. A boot that never reaches `online`
(e.g. a crash mid-load) simply stops advancing -- `currentStage` shows
exactly where it got stuck.

The dashboard's **System > Boot Sequence** panel renders this directly.

## Relationship to the automation tick loop

`automation.start()` (the actual periodic tick loop, distinct from
`registerExecutionJob()`'s one-time registration) only runs when
`AUTOMATION_DISABLED` is not `"1"`, inside the
`if(require.main === module)` block -- i.e. only when the dashboard is
actually being run as the real server process, not when
`createServer()` is required by a test. This is why `loading_automations`
is marked at registration time, not tick-loop-start time: registration
is the real, meaningful "automations are ready" moment; the tick loop
starting is an operational detail of running as the live process.

## Relationship to runtime state

Boot sequence is a **one-time** record of startup. Once a component is
`online`, its ongoing state (does it stay online, does it crash and
restart, does it go offline) is tracked separately by
`core/system/runtimeState.js` -- see `docs/Architecture.md`'s "Runtime
State Registry" section.
