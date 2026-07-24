# VERONICA

A personal AI operating system: memory, an executive/agent layer across
real business divisions (Marketing, Sales, Finance, Research, Business
Operations, Trading Research), a knowledge graph, autonomous
maintenance, and a real-time Mission Control dashboard, built on Claude
as the primary reasoning provider. Node.js/CommonJS, no build step, no
framework, no bundler.

## Running it

```bash
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY at minimum
npm run dashboard        # starts the dashboard/backend process
```

Open `http://127.0.0.1:4000/` for **Mission Control** -- the primary,
real-time interface (see `docs/Dashboard.md`). The full, dense
operational dashboard (every panel built up over the project's life) is
at `http://127.0.0.1:4000/panels.html`.

```bash
npm start                # the terminal interface (core/interface/terminal.js)
```

## Testing

```bash
npm test
```

Runs the full suite via `node --test --test-concurrency=1
tests/*.test.js`. The `--test-concurrency=1` flag is required -- several
tests share file-backed state (`core/memory/database.json`,
`core/knowledge/graph.json`, etc.) via real backup/restore hooks, and
running them concurrently races on the same files.

## Voice

An optional, local-first voice interface (wake word → whisper.cpp →
existing Router/Agents → Piper) -- off by default, never auto-started.
See `docs/VOICE_SETUP.md`.

## Operating VERONICA

```bash
node scripts/veronica-cli.js status     # real lifecycle state + registered services
node scripts/veronica-cli.js health     # a fresh, real per-subsystem health run
node scripts/veronica-cli.js diagnose   # the full combined report
node scripts/veronica-cli.js start      # spawn the dashboard process
node scripts/veronica-cli.js stop       # a real graceful shutdown (SIGTERM)
node scripts/veronica-cli.js restart
```

Run `npm link` to make `veronica <command>` work directly (not done
automatically -- see `docs/BootSystem.md`). A real restart (`kill` then
relaunch, or `veronica restart`) restores lifecycle state and reports
whether the previous shutdown was clean or a crash -- see
`docs/BootSystem.md` for exactly what's recovered and how.

## Deployment

For running VERONICA as a persistent, login-time service (a macOS
LaunchAgent) rather than a manually-started process, see
`docs/DEPLOYMENT.md` and `docs/FINAL_DEPLOYMENT_CHECKLIST.md`.

### Desktop app behavior (macOS)

```bash
bash scripts/install-launch-agent.sh   # the one manual step: enables auto-start at login
npm run start:desktop                  # start now
npm run stop:desktop                   # real, correct stop (launchctl-aware -- see docs/DesktopIntegration.md)
npm run restart:desktop
npm run status:desktop
```

Once installed: every login starts VERONICA automatically, no terminal
needed, the dashboard opens in your browser once VERONICA is actually
ready (never before), and a crash restarts it automatically. See
`docs/DesktopIntegration.md`.

## Documentation

- `docs/Architecture.md` -- the full, phase-by-phase build history and
  every real architectural decision made along the way.
- `docs/Dashboard.md` -- Mission Control's subscription model, how to
  add a new widget, visualization states, EventBus integration.
- `docs/CHANGELOG.md` -- what shipped, in order.
- `docs/TROUBLESHOOTING.md` -- diagnosing a real problem via real
  endpoints/logs.
- `docs/BootSequence.md` -- the real, tracked per-process boot sequence.
- `docs/BootSystem.md` -- the system-wide lifecycle: boot/shutdown,
  crash recovery, health checks, the service registry, the CLI.
- `docs/DesktopIntegration.md` -- the macOS LaunchAgent: installing/
  enabling/disabling auto-start, the desktop npm commands, logging,
  troubleshooting.

## Design discipline

Every real capability in this codebase either works for real or fails
closed with a clear error -- nothing here fabricates a credential,
simulates a value, or fakes a connector's status. If something needed
for a feature isn't configured (an API key, a local binary, a model
file), the feature reports that honestly rather than pretending.
