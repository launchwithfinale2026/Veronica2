# VERONICA — Real World Readiness Audit

**Phase 18.** Before any external integrations go live, this audits
what VERONICA can actually do today, in this exact environment, versus
what's built and ready but inert until something external is provided.
Checked against the real, current `.env` state (not assumed):

| Variable | Status |
|---|---|
| `ANTHROPIC_API_KEY` | **set** — the one credential everything in this audit's "works alone" column depends on |
| `OPENAI_API_KEY` | not set |
| `API_TOKEN` | not set |
| `SERVICE_ALLOWLIST` | not set |
| `GITHUB_TOKEN` | not set |
| `DISCORD_WEBHOOK_URL` | not set |
| `OBSIDIAN_VAULT_PATH` | not set (falls back to the repo root default) |

## What VERONICA can do alone

Everything below works right now, with only `ANTHROPIC_API_KEY`
configured — no other credential, account, hardware, or human action
needed:

- **Full executive pipeline**: plan a goal, decompose it into
  milestones/tasks (real Claude reasoning call), dispatch tasks to
  departments (real Claude reasoning per department), evaluate results,
  update status, cascade completion.
- **Executive intelligence** (Phase 11): priority ranking, goal
  monitoring, blocker detection, recommendations, daily briefings,
  weekly reports — all 100% rule-based, zero additional dependencies.
- **Memory evolution** (Phase 12): automatic classification, 0-100
  importance scoring, lifecycle promotion — all local computation.
- **Personal profile** (Phase 13): tracks the operator via local data
  plus what's already in the knowledge graph.
- **Daily operating cycle** (Phase 14): morning briefing, evening
  review — local, scheduled, no external calls beyond the department
  dispatch already covered above.
- **Controlled autonomy** (Phase 15): generating, approving, rejecting,
  and executing action proposals — all local state changes.
- **Device registration** (Phase 16): registering, heartbeating, and
  checking the status of devices in the *local* roster — see "What
  requires hardware" below for the limit of this.
- **Company/business management**: companies, employees, documents,
  financial ledger, communications — internal record-keeping, not real
  invoicing/accounting/payment processing.
- **Vision**: analyzing an image file already in the sandboxed
  workspace (`data/workspace/`), via Claude's multimodal API.
- **Obsidian**: reading/writing/indexing notes in a local vault (once
  `OBSIDIAN_VAULT_PATH` points at a real one — no network, no account,
  just a filesystem path).
- **File intelligence**: indexing/searching the local sandboxed
  workspace.
- **Terminal and dashboard**: both run locally; the dashboard's
  *read-only* views work with zero additional configuration.

## What requires a user account

Built and functional in code, but produces nothing real until an
account exists and its credential is set:

- **OpenAI** (`OPENAI_API_KEY`): semantic memory search
  (`memory.semanticSearch`) and its reindex step. Falls back to keyword
  search automatically without it — not a broken feature, a degraded
  one.
- **GitHub** (`GITHUB_TOKEN`): `core/integrations/github.js` is a real,
  functional connector (get repo, list/create issues) — needs a GitHub
  account and a personal access token.
- **Discord** (`DISCORD_WEBHOOK_URL`): `core/integrations/discord.js`
  is real and functional (send a message) — needs a Discord server and
  an incoming webhook configured on it.
- **Calendar / Email / Cloud storage**: interface-only placeholders
  (Phase 7) — these need a *provider decision* first (Google Calendar
  vs. Microsoft Graph; SendGrid vs. SMTP; S3 vs. Dropbox) before an
  account/credential is even the next question. See
  `EXTERNAL_DEPENDENCIES.md`.

## What requires hardware

- **A genuine multi-device network** (Phase 16 prepared the data
  model; it does not create real connectivity). `DeviceManager`
  registers devices and tracks heartbeats in a *local* file
  (`core/device/network.json`) — two VERONICA instances on two real
  machines do not automatically see each other's heartbeats. Real
  multi-device operation needs: a second (and third, fourth...)
  physical device, VERONICA installed and running on each, and either
  a shared network path, a real sync mechanism actively run between
  them (`core/device/sync.js`'s export/import already exists but is
  manually triggered, not automatic), or a small network service none
  of this milestone built. A phone or Chromebook specifically also
  needs to actually be capable of running Node.js (or, more simply,
  just reach the dashboard's read-only views over the network from a
  browser — that part needs no new code at all, just the same network
  and a browser).
- **A camera** for any vision use beyond files already in the sandbox
  (e.g. "take a photo and analyze it" — VERONICA can analyze an image
  that already exists as a file; it cannot capture one).

## What requires permissions (configuration, not accounts)

- **`API_TOKEN`** — currently unset, which means **every mutating
  dashboard route fails closed with 501 right now**, including the
  brand-new action-approval buttons built in Phases 15/17. This is the
  most immediate practical gap: the dashboard's read-only views all
  work, but nothing can be approved, generated, or registered through
  the UI until this is set.
- **`SERVICE_ALLOWLIST`** — currently unset, which means **no outbound
  HTTP works at all**, regardless of whether `GITHUB_TOKEN`/
  `DISCORD_WEBHOOK_URL` are ever set. Both gates are independent and
  both must be satisfied.
- **`OBSIDIAN_VAULT_PATH`** — currently unset (falls back to the repo
  root, which does have a real `.obsidian/` directory, so this
  technically "works" today, but not against the operator's actual
  notes vault, if there is one elsewhere).
- Filesystem read/write for the sandboxed workspace already works with
  no extra permission (it's a directory inside the repo).

## What requires human approval

This one is already *built*, not a gap: Phase 15's `ActionProposalEngine`
requires an explicit `"approved"` status before `execute()` will do
anything, unconditionally, for every action kind. This is a completed
safety feature, not something blocking further progress.

**The one honest limitation inside it**: every action kind currently
implemented (`resolve_deadlock`, `unblock_task`, `revisit_stalled_goal`,
`high_urgency`) is an *internal* roadmap state change. There is no
proposal kind yet that, once approved, would actually post to GitHub/
Discord, send an email, or touch anything outside VERONICA's own data —
because none of those actions were ever generated by
`ExecutiveRecommendationEngine` in the first place. The approval gate
is real and would hold if such an action existed; one doesn't yet.
