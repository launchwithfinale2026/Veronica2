# VERONICA — Final Deployment Checklist

Generated 2026-07-23, evidence-based against this machine's real,
current state (see "How this was verified" at the bottom). Ordered by
priority: do these top to bottom. Everything below requires a human
action VERONICA cannot safely or honestly perform on its own --
credentials, macOS permission dialogs, OAuth consent, or a provider
choice only the operator can make. Nothing on this list is code work;
the code is done and the test suite is green.

## 1. Set `API_TOKEN` (5 minutes -- unblocks the entire dashboard UI)

**Why it matters most:** every mutating dashboard route (approve/reject
a proposal, generate a briefing on demand, register a device, mark a
notification read, everything interactive) fails closed with `501`
until this is set. This is deliberate -- VERONICA choosing its own
token would defeat the point of the gate -- but it means the dashboard
is currently **read-only** in daily use.

1. Generate a random token, e.g.: `openssl rand -hex 32`
2. Add to `.env`: `API_TOKEN=<the value>`
3. Restart the dashboard process.

## 2. Install the LaunchAgent (10 minutes -- makes VERONICA start automatically at login)

Currently VERONICA only runs when manually started with
`node dashboard/backend/server.js`. Without this step, a Mac restart
means VERONICA does **not** come back on its own.

```
bash scripts/install-launch-agent.sh
bash scripts/verify-launch-agent.sh
```

`verify-launch-agent.sh` is read-only and confirms three things: the
plist exists in `~/Library/LaunchAgents/`, `launchctl` reports it
loaded, and the dashboard port is actually listening. If any check
fails, the script tells you which one.

**This may prompt for macOS permission** the first time `launchctl`
runs (some macOS versions ask for approval on new login items under
System Settings -> General -> Login Items, or a background-task
notification). If you see such a prompt, approve it -- this is a
normal, per-user LaunchAgent, not a system-level daemon, and it never
touches sleep/shutdown/restart/battery behavior.

To undo at any time: `bash scripts/uninstall-launch-agent.sh`.

## 3. Decide whether you want the OpenAI fallback (2 minutes, optional)

`OPENAI_API_KEY` is present as a blank entry in `.env` right now (not
actually set). Semantic memory search silently falls back to keyword
search without it -- VERONICA works either way. If you want vector
search:

1. Add a real value to `OPENAI_API_KEY` in `.env`.
2. Restart the dashboard process.

If you don't want this, no action needed -- this is not a blocker.

## 4. Connect the credentials for any external system you actually want VERONICA to use (varies)

None of these block boot or daily use of the executive/memory/dashboard
core. Each missing one simply disables that one connector -- add only
the ones you actually plan to use:

| Connector | Env var(s) | What it unlocks |
|---|---|---|
| GitHub | `GITHUB_TOKEN` | Repo-aware capabilities |
| Discord bot | `DISCORD_BOT_TOKEN` | Bot presence/messaging |
| Discord webhook | `DISCORD_WEBHOOK_URL` | Outgoing Discord messages without a bot |
| Google Workspace | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Gmail/Calendar/Drive -- **also requires completing a real Google OAuth consent screen once configured**, via `GET /api/integrations/google/auth-url` |
| Outbound HTTP to a specific service | `SERVICE_ALLOWLIST` (comma-separated hostnames) | Any `core/integrations/http.js` call to that host |

## 5. Choose a Calendar / Email / Cloud Storage provider (design decision -- no action until you decide)

`core/integrations/calendar.js`, `email.js`, and `cloudStorage.js` are
real, wired-up connector *interfaces* with no concrete provider chosen
yet (Google Calendar/Gmail/Drive are covered by #4 above if you connect
Google Workspace; these three are for a *different*, non-Google
provider, e.g. Microsoft Graph or CalDAV/IMAP). Nothing to do here
unless you want a second provider alongside or instead of Google --
if so, tell VERONICA which provider and it can wire the concrete
implementation in.

## 6. Multi-device sync (design decision, no urgency)

Device identity/registry/roles already exist
(`registry/devices.json`, `core/device/`), and this Mac is registered.
Adding a second device (MacBook/iPhone/future) is real, working
infrastructure the moment you register one -- no blocker, just nothing
to do until you actually have a second device to add.

## What is explicitly NOT on this list

- Anything code-related -- the full test suite
  (`node --test --test-concurrency=1 tests/*.test.js`) is green (775
  tests) as of this checklist.
- Anything that could be built without a credential, OAuth consent, a
  macOS permission dialog, or a provider decision -- see
  `docs/Architecture.md`'s Changelog for what was built this session.

## After completing steps 1-2

Restart your Mac. Log in. VERONICA starts automatically, boots through
all 11 real stages (`docs/BootSequence.md`), and the dashboard is fully
interactive (not just read-only) at `http://127.0.0.1:4000`. No
terminal commands required from this point forward.

## How this was verified

Every number below was read from a real, live call against this
machine's actual current state, not estimated:

- `GET /api/system/operational-readiness` (equivalently,
  `core/system/operationalReadiness.js`'s `checklist()`): health score
  **65/100 (degraded)** at the moment of this audit -- driven by real
  host RAM pressure (100% in use *on this Mac, right now, from other
  running programs* -- not a VERONICA defect) and `automation-engine`/
  `discord-bot` reporting not-running (expected: this check was run as
  a one-off script, not the real long-running dashboard process, so
  the automation tick loop was never started; discord-bot correctly
  reports not-running because no token is configured).
- `connected`: `["claude"]` only -- Claude is the one real, configured
  AI provider right now.
- `unconfiguredConnectors`: 9 of 12 (`openai`, `github`, `discord`,
  `discordBot`, `google`, `calendar`, `email`, `cloudStorage`, plus
  `http` with no `SERVICE_ALLOWLIST` set).
- `API_TOKEN`: confirmed unset via direct `process.env` check.
- `approvalsWaiting`: 0 pending right now.
- Test suite: 775/775 passing, run with
  `node --test --test-concurrency=1 tests/*.test.js` immediately before
  writing this checklist.
- LaunchAgent: `scripts/install-launch-agent.sh`/
  `uninstall-launch-agent.sh`/`verify-launch-agent.sh` all present and
  confirmed idempotent by reading their source; not run in this
  session (running them would change this machine's real login
  behavior, which is exactly the one step left to the operator).
