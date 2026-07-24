# VERONICA Troubleshooting

Every check below reads a real endpoint or a real log file -- nothing
here asks you to guess.

## "Is VERONICA actually running?"

```
curl http://127.0.0.1:4000/api/status
```

If this hangs or refuses: the dashboard process is not running. If you
installed the LaunchAgent, run `bash scripts/verify-launch-agent.sh`
first -- it checks (read-only) whether the agent is loaded, whether the
plist exists, and whether the port is listening.

## "Did it boot all the way?"

```
curl http://127.0.0.1:4000/api/system/boot-status
```

`currentStage` shows exactly where boot got stuck if `online` is
`false`. See `docs/BootSequence.md` for what each of the 11 stages
means.

## "What's the overall health score, and why?"

```
curl http://127.0.0.1:4000/api/system/operational-readiness
```

Returns a 0-100 score with an explainable `breakdown` (never a mystery
number) -- CPU/RAM/disk pressure, services not running, poorly
performing departments/tools, broken capabilities. Also lists missing
credentials, pending approvals, and offline services in one place.

## "A service shows as offline in the health score, but I expect it to be running"

- `"automation-engine" is not running` -- the automation tick loop
  (`automation.start()`) only runs inside the real
  `if(require.main === module)` boot path, and only if
  `AUTOMATION_DISABLED` is not `"1"`. If you're running the dashboard
  directly (`node dashboard/backend/server.js`) this should be running;
  if you `require()`d a module in a one-off script instead, this is
  expected and not a bug.
- `"discord-bot" is not running"` -- either `DISCORD_BOT_TOKEN` isn't
  set (expected, not an error) or the real `discord.js` login failed
  (check `GET /api/logs/errors` for the real error message, and
  `GET /api/integrations/discord-bot/status` for
  `lastDisconnectedAt`/`reconnectAttempts`/`lastErrorMessage`).

## "The dashboard-child keeps restarting"

```
curl http://127.0.0.1:4000/api/system/runtime-state
```

Each `dashboard-child` transition carries a real `reason` -- the exact
exit code/signal and attempt count on a restart, or the give-up message
once `maxRestarts` (5 within 10 minutes, by default) is exhausted. Once
exhausted, the supervisor stops trying and a human needs to
investigate; check `GET /api/logs/errors` for what actually crashed it.

## "A dashboard write action returns 501"

This is by design: every mutating route fail-closes when `API_TOKEN`
is unset (see `docs/Architecture.md`'s "Dashboard write actions"). Set
`API_TOKEN` in `.env` and restart.

## "A connector isn't working"

```
curl http://127.0.0.1:4000/api/integrations
```

Every connector reports `configured`/`missing` (variable names only,
never values). A missing credential disables exactly that one
connector -- it never crashes VERONICA or blocks boot. See
`docs/DEPLOYMENT.md`'s configuration table for what each variable
enables.

## "Memory/knowledge seems wrong or stale"

```
curl http://127.0.0.1:4000/api/memory/timeline?limit=25
curl http://127.0.0.1:4000/api/system/consistency-report
```

The timeline shows real entries in real chronological order. The
consistency report (Project G, Autonomous Maintenance) is report-only
-- duplicated capability tools, broken capabilities -- and never
auto-deletes anything; log files are archived (renamed), never removed.

## "I want to see every real error VERONICA has logged"

```
curl http://127.0.0.1:4000/api/logs/errors
```

Backed by `core/logging/errors.log` (warn/error level only -- info/debug
stay in console scrollback, by design, to keep this file signal not
noise).

## Full test suite

```
node --test --test-concurrency=1 tests/*.test.js
```

Must be run with `--test-concurrency=1` -- several tests share
file-backed state (`core/memory/database.json`,
`core/knowledge/graph.json`, etc.) via backup/restore hooks in
`test.before()`/`test.after()`, and concurrent runs race on the same
files. This is a test-harness constraint, not a product bug.
