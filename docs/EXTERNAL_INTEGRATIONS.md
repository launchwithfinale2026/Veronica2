# VERONICA — External Integrations

**Phase 19: External Integration & Operational Deployment.** This
document covers how VERONICA connects to the outside world: GitHub,
Discord, and Google Workspace (Gmail/Calendar/Drive). It complements
`docs/Architecture.md`'s "Phase 19" section (design reasoning) and
`docs/EXTERNAL_DEPENDENCIES.md`/`docs/NEXT_HUMAN_ACTIONS.md` (what still
needs a human to complete).

Every connector described here is real and functional — none is a
fabricated placeholder. Where a capability genuinely isn't built yet
(sending email, merging a PR, deleting a file), that's stated explicitly
rather than implied to work.

## Architecture

```
                    ┌─────────────────────────┐
                    │   credentialManager.js   │  <- one map of every
                    │  (env var presence only,  │     credential this
                    │   never a value)          │     system knows about
                    └────────────┬──────────────┘
                                 │ isConfigured("x")
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        ┌─────▼─────┐     ┌──────▼──────┐    ┌──────▼───────┐
        │ github.js │     │  discord.js  │    │ google/oauth │
        │ (REST,    │     │  (webhook,   │    │   .js        │
        │ bearer    │     │  outgoing    │    │ (OAuth2 auth-│
        │ token)    │     │  only)       │    │ code flow)   │
        └─────┬─────┘     └──────────────┘    └──────┬───────┘
              │                                       │
              │            ┌──────────────┐    ┌──────┴───────┐
              │            │ discordBot.js│    │ gmail/calendar│
              │            │ (discord.js, │    │  /drive .js   │
              │            │ real bot)    │    │  (REST, token │
              │            └──────┬───────┘    │  from oauth)  │
              │                   │             └──────┬────────┘
              └───────────┬───────┴─────────────────────┘
                          │
                ┌─────────▼──────────┐
                │ eventIngestion.js  │  <- normalizes every event,
                │ (shared pipeline)  │     tags source:X/kind:Y
                └─────────┬──────────┘
                          │
                ┌─────────▼──────────┐
                │  core/memory       │  <- Phase 12's EXISTING
                │  .remember()       │     classify/score/lifecycle
                └─────────┬──────────┘     (no second memory system)
                          │
        ┌─────────────────┼─────────────────────┐
        │                 │                     │
┌───────▼────────┐ ┌──────▼───────┐   ┌─────────▼─────────┐
│ DailyBriefing   │ │ DailyReview  │   │ WeeklyOperating    │
│ .externalEvents │ │ .externalEv- │   │ Report.externalEv- │
│ ()              │ │ entsToday()  │   │ entsThisWindow()   │
└─────────────────┘ └──────────────┘   └────────────────────┘

Writes (create_github_issue, post_discord_message) go through the
EXISTING approval pipeline, unchanged in shape:

  automation job / connector  ->  ActionProposalEngine
                                   .proposeExternalAction()
                                        │  (status: pending)
                                        ▼
                              a human calls .approve(id)
                                        │  (status: approved)
                                        ▼
                              .executeExternal(id)  ->  real connector call
                                        │  (status: executed)
                                        ▼
                                 persisted outcome
```

## Connectors

### GitHub (`core/integrations/github.js`)

- **Auth**: `GITHUB_TOKEN` (bearer token), checked via
  `credentialManager.isConfigured("github")`.
- **Read**: `getRepo()`, `listIssues()`, `listBranches()`,
  `listCommits()`, `listPullRequests()`, `repositoryHealthSummary()`
  (open issue/PR counts, default branch, staleness).
- **Monitoring**: `pollRepository(owner, repo)` — ingests new open
  PRs/issues as external events (`source:github`), deduped by
  `externalId` so repeated polls don't re-ingest the same item.
- **Automation job**: `github-poll` (every 15 min, registered in
  `core/automation/jobs.js`) polls every repo listed in the optional,
  comma-separated `GITHUB_WATCHED_REPOS` env var (e.g.
  `"owner/repo,owner/other-repo"`). Not a credential (nothing secret
  about which repo to watch) — a no-op, never a crash, when GitHub isn't
  configured or no repos are listed.
- **Writes**: `createIssue()` exists as a raw connector primitive, but
  nothing in VERONICA calls it autonomously without going through
  `ActionProposalEngine.proposeExternalAction({ action:
  "create_github_issue", ... })` first — **VERONICA never pushes,
  merges, or writes to GitHub automatically.**
- **Not implemented**: `push_code`, `merge_pr`, `delete_file` — no
  connector method exists for these. Building them is future work, not
  a fabricated stub today.

### Discord — two separate connectors

- **`core/integrations/discord.js`** (pre-existing, unchanged): outgoing
  webhook only. Auth: `DISCORD_WEBHOOK_URL`. One method,
  `sendMessage(content)`.
- **`core/integrations/discordBot.js`** (new, Phase 19): a real
  `discord.js` bot. Auth: `DISCORD_BOT_TOKEN` (login), optionally
  `DISCORD_CLIENT_ID` (to register slash commands — the bot still logs
  in and can still send messages without it, it just won't have
  slash commands registered).
  - **Slash commands**: `/status`, `/approvals` (see `COMMANDS` in
    `discordBot.js` — trivial to extend).
  - **Incoming**: every slash-command interaction becomes a VERONICA
    event (`source:discord`, `kind:command`) through the shared
    ingestion pipeline, and gets a direct reply acknowledging receipt.
  - **Outgoing**: `sendMessage(channelId, content)` is a low-level
    primitive (like `github.createIssue()`) — a slash command's own
    reply isn't gated (it's not VERONICA reaching out unprompted, it's
    responding to what a human just typed), but VERONICA *deciding* to
    post proactively goes through `ActionProposalEngine`'s
    `post_discord_message` external action (currently wired to the
    webhook connector; extending it to target a specific bot channel is
    a natural next step, not yet built).
  - **Dashboard status**: `GET /api/integrations/discord-bot/status` —
    real `connected`/`latencyMs`/`guildCount`/`lastEventAt`, never fake
    values.
  - **Lifecycle**: started automatically at dashboard boot
    (`dashboard/backend/server.js`), non-blocking — a failed login never
    crashes the dashboard, it just logs the error and leaves the bot
    disconnected.

### Google Workspace (`core/integrations/google/`)

A real OAuth2 authorization-code flow, built entirely on
`core/integrations/http.js` (no `googleapis` dependency — Google's OAuth
and Gmail/Calendar/Drive REST APIs are plain HTTPS + JSON).

- **`oauth.js`**: `isConfigured()` (env vars present) vs.
  `isAuthorized()` (a real human has completed Google's consent screen
  and a refresh token is on disk) are two genuinely different states —
  see "Authorization flow" below.
- **`gmail.js`**: `listMessages()`, `getMessage()`, `getAttachment()`.
  Read-only — no `send()` exists.
- **`calendar.js`**: `listEvents()`. Read-only — no `createEvent()`
  exists for Google Calendar specifically (the older, provider-agnostic
  `core/integrations/calendar.js` placeholder still has an unimplemented
  one, for a *different* provider).
- **`drive.js`**: `listFiles()`, `getFileMetadata()`. Read-only — no
  upload/delete/modify.
- **`poll.js`**: `pollGmail()`/`pollCalendar()`/`pollDrive()`/`pollAll()`
  — ingest new emails/events/files as external events
  (`source:gmail`/`source:calendar`/`source:drive`), deduped by
  `externalId`. Gated on `isAuthorized()`, not just `isConfigured()`.
- **Automation job**: `google-poll` (every 15 min). No-ops cleanly until
  a human completes the real OAuth consent flow.
- **Never**: deletes anything, sends email, or writes to Calendar/Drive
  — matching this phase's explicit read-only ask for Google.

## Required environment variables

| Variable | Connector | Required for |
|---|---|---|
| `GITHUB_TOKEN` | GitHub | Any GitHub API call |
| `GITHUB_WATCHED_REPOS` | GitHub (optional) | `github-poll` automation job — comma-separated `owner/repo` list |
| `DISCORD_WEBHOOK_URL` | Discord (webhook) | `discord.js`'s `sendMessage()` |
| `DISCORD_BOT_TOKEN` | Discord (bot) | `discordBot.js` login |
| `DISCORD_CLIENT_ID` | Discord (bot, optional) | Slash command registration only — the bot still logs in without it |
| `GOOGLE_CLIENT_ID` | Google | OAuth app identity |
| `GOOGLE_CLIENT_SECRET` | Google | OAuth app identity |
| `GOOGLE_REDIRECT_URI` | Google | Must match the URI registered in Google Cloud Console, and point at this VERONICA instance's `/api/integrations/google/callback` |

All of these are validated at startup by `credentialManager.validateStartup()`
(called from both `dashboard/backend/server.js` and
`core/interface/terminal.js`'s real boot paths) — missing variables are
logged **by name only, never printed, never committed, never
hardcoded**, and disable only that one connector. VERONICA always
finishes booting.

## Startup flow

1. `credentialManager.validateStartup()` runs, logging one line per
   connector: configured, or "not configured — missing: X, Y" (names
   only).
2. Every connector's own `isConfigured()` delegates to
   `credentialManager.isConfigured(id)` — one source of truth, not five
   duplicated `Boolean(process.env.X)` checks.
3. The dashboard's real boot path additionally starts the Discord bot
   (`discordBot.start()`, non-blocking) and the automation engine's tick
   loop, which includes `github-poll` and `google-poll`.
4. Nothing throws, nothing crashes, regardless of how many credentials
   are missing.

## Authorization flow (Google specifically)

Unlike GitHub/Discord's simple bearer-token model, Google's flow has a
step only a human can complete:

1. **Configure**: set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
   `GOOGLE_REDIRECT_URI` in `.env` (from a Google Cloud Console OAuth
   client you create — outside VERONICA entirely).
2. **Authorize**: visit `GET /api/integrations/google/auth-url` on the
   running dashboard, open the returned `url` in a real browser, and
   click "Allow" on Google's own consent screen.
3. **Complete**: Google redirects the browser to
   `GET /api/integrations/google/callback?code=...` — the dashboard
   exchanges that one-time code for real tokens
   (`core/integrations/google/tokens.json`, gitignored, never committed)
   and Google is now `isAuthorized() === true`.

**How VERONICA detects completion**: `oauth.isAuthorized()` — true once
`tokens.json` exists and has a `refresh_token`. No code path in this
codebase can complete step 2 on its own; that's the entire point of
OAuth (the human, not VERONICA, is proving they own the Google account).

## Event ingestion

Every connector event — a new GitHub PR, an incoming Discord slash
command, a new Gmail message, an upcoming Calendar event, a new Drive
file — flows through one shared function,
`core/integrations/eventIngestion.js`'s `ingest()`, which:

1. Tags the event `external-event`, `source:<connector>`,
   `kind:<event kind>`.
2. Hands it to the **existing** `core/memory.remember()` (Phase 12's
   classification/importance-scoring/lifecycle) — this is deliberately
   **not** a second memory system.
3. Makes it visible to executive code via `recentEvents()`, which
   `DailyBriefingEngine`, `DailyReviewEngine`, and `WeeklyOperatingReport`
   all now call (see `docs/Architecture.md`'s "Phase 19" section).

## Approval pipeline

VERONICA may observe, recommend, and prepare external actions, but may
**never** send email, push code, merge a PR, delete a file, modify a
repository, or post externally without explicit human approval. This is
enforced by reusing — not duplicating — the existing
`core/executive/actionProposal.js`:

- `proposeExternalAction({ action, reason, payload })` creates a
  `pending` proposal (same memory-backed record, same status machine as
  every internal proposal).
- `approve(id)` / `reject(id)` — identical to internal proposals.
- `executeExternal(id)` — unconditionally requires `status === "approved"`,
  same as `execute()` for internal actions. Only two actions are wired
  to a real connector call: `create_github_issue` and
  `post_discord_message`. Everything else in this phase's "must never
  do automatically" list (`send_email`, `push_code`, `merge_pr`,
  `delete_file`) has **no** connector method to call yet — there is
  nothing to route through the approval pipeline until that capability
  is actually built.

## Logging

Every connector logs via `core/logging` (never a secret value): connect/
authenticate, errors (by status code, not body when the body might carry
sensitive echo data), and — for the polling connectors — events
processed per run. `credentialManager.validateStartup()` is the one
place startup status for every connector is logged at once.

## Future expansion

- Extending `post_discord_message` to target a specific bot channel
  (currently webhook-only).
- Gmail send / Calendar event creation / Drive upload — all deliberately
  unbuilt today; would each need their own `ActionProposalEngine` action
  kind, same pattern as `create_github_issue`.
- GitHub webhook receiver (push-based instead of polling) — needs a
  publicly reachable HTTPS endpoint, which this VERONICA instance does
  not have by default (`DASHBOARD_HOST` defaults to `127.0.0.1`).
- A dedicated "External Systems" dashboard panel — `GET /api/integrations`
  already returns every connector's real status (including the two new
  ones added this phase); a purpose-built visual panel is frontend work,
  not a new backend capability.
