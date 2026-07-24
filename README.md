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

## Deployment

For running VERONICA as a persistent, login-time service (a macOS
LaunchAgent) rather than a manually-started process, see
`docs/DEPLOYMENT.md` and `docs/FINAL_DEPLOYMENT_CHECKLIST.md`.

## Documentation

- `docs/Architecture.md` -- the full, phase-by-phase build history and
  every real architectural decision made along the way.
- `docs/Dashboard.md` -- Mission Control's subscription model, how to
  add a new widget, visualization states, EventBus integration.
- `docs/CHANGELOG.md` -- what shipped, in order.
- `docs/TROUBLESHOOTING.md` -- diagnosing a real problem via real
  endpoints/logs.
- `docs/BootSequence.md` -- the real, tracked boot sequence.

## Design discipline

Every real capability in this codebase either works for real or fails
closed with a clear error -- nothing here fabricates a credential,
simulates a value, or fakes a connector's status. If something needed
for a feature isn't configured (an API key, a local binary, a model
file), the feature reports that honestly rather than pretending.
