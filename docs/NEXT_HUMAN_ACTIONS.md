# VERONICA — Next Human Actions

Autonomous development continued through Phases 12-18 without a single
architectural decision, missing credential, or human-approval gate
actually blocking further *building*. This document exists because the
mission's stop condition was reached anyway: not "development cannot
continue," but "the software that now exists cannot do anything more
*for real* without something only the operator can provide." No fake
solutions were implemented in its place — every gap below is either a
real, working connector waiting on a real credential, or a real
capability waiting on real hardware or a real decision.

## First human dependency: set `API_TOKEN`

1. **What capability is needed**: an `API_TOKEN` value in `.env`.

2. **Why VERONICA cannot do it alone**: `API_TOKEN` gates every
   mutating dashboard route, by design, fail-closed (see
   `docs/Architecture.md`'s "Dashboard write actions" and the entire
   Phase 10 security audit). This is deliberate and correct — VERONICA
   choosing its own access token would defeat the point of the gate.
   Concretely, right now, with `API_TOKEN` unset: the Phase 15/17
   action-approval buttons (approve/reject/execute a proposal),
   generating a fresh daily briefing or weekly report on demand,
   registering a device, and every other dashboard write action all
   return `501` — the dashboard's *read-only* views work, but nothing
   built across the entire executive-intelligence/controlled-autonomy/
   command-center arc (Phases 11, 14, 15, 17) can actually be acted on
   through the UI.

3. **Exact action needed**: choose a random, private token string
   (e.g. `openssl rand -hex 32`) and add it to `.env` as
   `API_TOKEN=<that value>`, then restart the dashboard. Enter the same
   value into the dashboard's own token field (top of the page, already
   built) so the browser sends it on write requests.

4. **What unlocks afterward**: the entire dashboard write surface —
   approving/rejecting/executing action proposals from the UI,
   triggering the daily cycle on demand, registering devices, running
   consolidation/self-check/recommendations on demand, and every other
   POST route audited in `docs/PRODUCTION_READINESS.md`.

## Next in line, roughly in priority order

Each follows the same shape (capability / why not alone / exact action
/ what unlocks) — kept brief since the first one above covers the
pattern in full.

1. **`SERVICE_ALLOWLIST`** — needed for ANY outbound HTTP
   (`web.fetch`, GitHub, Discord), independent of `API_TOKEN` above.
   *Action*: add allowlisted hostnames (e.g. `api.github.com,discord.com`)
   to `.env`. *Unlocks*: the two real, already-functional connectors
   below, once each also has its own credential.

2. **`GITHUB_TOKEN`** (a GitHub personal access token) — *why not
   alone*: `core/integrations/github.js` needs real GitHub credentials
   to authenticate; VERONICA has no GitHub identity of its own.
   *Action*: create a token at github.com (Settings → Developer
   settings → Personal access tokens) and add it to `.env`. *Unlocks*:
   real repo/issue read, issue creation (via approval), branch/commit/PR
   monitoring, and the repository health summary. Optionally also set
   `GITHUB_WATCHED_REPOS` (comma-separated `owner/repo`, not a
   credential) to enable the `github-poll` automation job.

3. **`DISCORD_WEBHOOK_URL`** (a Discord incoming webhook) — *why not
   alone*: same reasoning, Discord-side. *Action*: in a Discord server
   you admin, Server Settings → Integrations → Webhooks → New Webhook,
   copy its URL into `.env`. *Unlocks*: real message posting from
   VERONICA.

3a. **`DISCORD_BOT_TOKEN`** (Phase 19, a real Discord bot, distinct
   from the webhook above) — *why not alone*: VERONICA has no Discord
   application identity of its own. *Action*: create an application +
   bot user at discord.com/developers/applications, copy its token into
   `.env` as `DISCORD_BOT_TOKEN`, invite the bot to your server, and
   optionally also set `DISCORD_CLIENT_ID` (the application id) to
   enable slash command registration. *Unlocks*: `/status`/`/approvals`
   slash commands, incoming commands becoming VERONICA events, and a
   real connected/latency/guild-count dashboard status.

3b. **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`**
   (Phase 19, Gmail/Calendar/Drive) — *why not alone*: VERONICA has no
   Google identity of its own, and completing OAuth consent requires a
   real human clicking "Allow" in a real browser — no code path in this
   codebase can do that step. *Action*: create an OAuth client in Google
   Cloud Console (set the redirect URI to this VERONICA instance's
   `/api/integrations/google/callback`), add the three values to `.env`,
   restart, then visit `GET /api/integrations/google/auth-url` in a
   browser and complete Google's consent screen — Google will redirect
   back to the callback route automatically, completing the exchange.
   *Unlocks*: real Gmail/Calendar/Drive reading and the `google-poll`
   automation job. This is a two-step dependency (configure, then
   authorize) — setting the three env vars alone is not enough; see
   `docs/EXTERNAL_INTEGRATIONS.md`'s "Authorization flow" section.

4. **Fill in `core/profile/veronica.profile.json`** — *why not alone*:
   preferences/working style/relationships/objectives are facts about
   the operator VERONICA cannot infer beyond what's already in the
   knowledge graph. *Action*: `veronica.profile` in the terminal to see
   the current state, then `veronica.profileSet`/`veronica.profileAdd`
   to fill it in. *Unlocks*: a materially more useful
   `veronica.profile` summary and daily briefing/review context.

5. **Pick a Calendar/Email/Cloud-storage provider** (see
   `docs/EXTERNAL_DEPENDENCIES.md`'s API REQUIRED section) — *why not
   alone*: this is a preference/vendor decision, not something
   inferable from the codebase. *Action*: tell VERONICA (or whoever
   continues this work) which provider for each; a follow-up phase can
   then implement it the same way Discord/GitHub were done. *Unlocks*:
   Phase 7's remaining placeholder connectors becoming real.

6. **A second physical device** (see `docs/EXTERNAL_DEPENDENCIES.md`'s
   DEVICE REQUIRED section) — *why not alone*: Phase 16 built the data
   model for a device network; it cannot conjure hardware. *Action*:
   run VERONICA on another machine you own and use `core/device/sync.js`'s
   export/import (or reach the dashboard over the network from its
   browser) to connect them. *Unlocks*: `DeviceManager` actually
   managing more than one device.

7. **The git-history rewrite decision** (Phase 10, still open) — *why
   not alone*: rewriting published git history is destructive and a
   decision this session's own standing instructions require the
   operator to make explicitly, not something to do unilaterally.
   *Action*: decide whether it's worth doing given the (currently
   low-sensitivity) content involved, and say so. *Unlocks*: closing
   out the one remaining open item from the Phase 10 security audit.

---

## Status as of Phase 19

- **Current phase**: Phase 19 (External Integration & Operational
  Deployment) — complete. See `docs/EXTERNAL_INTEGRATIONS.md` for full
  connector detail.
- **Tests passing**: 375 / 375.
- **First human dependency reached**: still setting `API_TOKEN` (see
  above) — unchanged by this phase. Phase 19 added real GitHub/Discord
  bot/Google connectors, all of which are genuinely blocked on their own
  real credentials (items 2/3a/3b above) and, for Google specifically, a
  real human completing OAuth consent in a browser — none of which
  VERONICA can do for itself, by design.
