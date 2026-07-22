# VERONICA — External Dependencies

**Phase 18.** Every capability that cannot be completed by VERONICA
alone, categorized by what kind of external input it needs. Companion
to `docs/REAL_WORLD_READINESS.md` (which describes what already works)
and `docs/NEXT_HUMAN_ACTIONS.md` (which says what to do about the first
one of these, in order).

## USER REQUIRED

Needs the operator to create/configure something, but no third-party
API credential or new hardware — just a decision or a local setting.

1. **Set `API_TOKEN`** — enables every dashboard write action,
   including the Phase 15/17 action-approval UI. Currently unset;
   nothing generated in the dashboard has ever been approved through
   it for real. *Purely a config value the operator picks*, no account
   needed.
2. **Set `SERVICE_ALLOWLIST`** — enables outbound HTTP at all
   (`web.fetch`, and both GitHub/Discord connectors once their own
   tokens are also set). A comma-separated hostname list the operator
   decides on.
3. **Point `OBSIDIAN_VAULT_PATH` at a real vault** (if one exists
   outside this repo) — a filesystem path, no account.
4. **Fill in `core/profile/veronica.profile.json`** (Phase 13) —
   identity, preferences, working style, relationships, long-term
   objectives. VERONICA derives a couple of defaults (e.g. the
   operator's first name, if the knowledge graph has exactly one
   `"person"` entity) but the rest needs the operator to actually state
   it via `veronica.profileSet`/`veronica.profileAdd`.
5. **Decide the git-history question** (carried over from the Phase 10
   security audit) — whether to rewrite history to purge legacy
   low-sensitivity data before this repository is shared more broadly.

## API REQUIRED

Needs a third-party account and a real credential from it.

1. **`OPENAI_API_KEY`** — semantic memory search. Optional: keyword
   search already works without it.
2. **`GITHUB_TOKEN`** — `core/integrations/github.js` is real and
   functional (get repo, list/create issues, branch/commit/PR
   monitoring, repository health summary, and a polling automation job
   as of Phase 19); needs a GitHub account + personal access token.
3. **`DISCORD_WEBHOOK_URL`** — `core/integrations/discord.js` is real
   and functional (send a message); needs a Discord server + an
   incoming webhook.
3a. **`DISCORD_BOT_TOKEN`** (+ optional `DISCORD_CLIENT_ID`, Phase 19)
   — `core/integrations/discordBot.js` is a real `discord.js` bot
   (slash commands, incoming-command-as-event, real connected/latency/
   guild-count status); needs a Discord application + bot user, distinct
   from the webhook above.
3b. **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`**
   (Phase 19) — `core/integrations/google/` is real and functional
   (Gmail/Calendar/Drive read access, polling), built on a hand-rolled
   OAuth2 flow (no `googleapis` dependency); needs a Google Cloud
   Console OAuth client AND a human completing the real consent flow in
   a browser (see `docs/EXTERNAL_INTEGRATIONS.md`'s "Authorization
   flow" — this is a two-step dependency, not just three env vars).
4. **A Calendar provider OTHER than Google** (Microsoft Graph, CalDAV)
   — `core/integrations/calendar.js` (the generic, provider-agnostic
   placeholder) is still interface-only; Google Calendar specifically is
   now real via 3b above.
5. **An Email provider for SENDING** (SMTP, SendGrid, SES, etc.) —
   `core/integrations/email.js` is still interface-only, and Gmail
   reading (3b) does not include sending. Note: a raw-SMTP
   implementation would need a new dependency (Node has no built-in
   SMTP client) — a transactional-API provider would not, reusing the
   existing `core/integrations/http.js`.
6. **A Cloud Storage provider OTHER than Drive** (S3, GCS, Dropbox) —
   `core/integrations/cloudStorage.js` (the generic placeholder) is
   still interface-only; Google Drive reading is now real via 3b above.
   Dropbox fits this codebase's "no new dependencies" convention best
   (plain bearer token over HTTPS); S3/GCS need request-signing a plain
   HTTP client doesn't provide for free.

## DEVICE REQUIRED

Needs real, physical hardware beyond this machine.

1. **A second (or third, fourth) physical device** to make Phase 16's
   `DeviceManager` mean anything beyond a local roster of one. Needs
   VERONICA installed and running there, plus either a shared network
   path, an actively-run sync exchange (`core/device/sync.js`'s
   export/import — exists today, but is manual, not automatic), or a
   small network service this milestone didn't build.
2. **A phone or Chromebook** specifically, per Phase 16's "prepare
   support for" list — the *simplest* real use of one is just reaching
   the dashboard's read-only views over the network from its browser
   (needs no new code, just network reachability); running the full
   Node.js terminal on one is a materially bigger ask (Linux/Crostini
   on a Chromebook; something like Termux on a phone) this milestone
   didn't attempt.
3. **A camera**, for analyzing a photo that doesn't already exist as a
   file in the sandboxed workspace.

## BUSINESS DECISION REQUIRED

Not a missing credential or missing hardware — a judgment call only
the operator can make, because the "right" answer depends on intent,
risk tolerance, or values, not on more engineering.

1. **Should `CompanyContext`'s `allowedRoles` restriction extend to the
   knowledge graph too** (Phase 10 finding, still open)? The graph has
   no company-level scoping at all today. Low priority for a
   single-operator system; a real question before any multi-company
   deployment with genuinely adversarial isolation requirements.
2. ~~Should `ActionProposalEngine` ever gain an action kind that
   reaches outside VERONICA's own data~~ — **decided and built, Phase
   19**: `create_github_issue` and `post_discord_message` are real,
   approval-gated external actions now. Sending email, merging a PR,
   pushing code, and deleting a file remain open — not yet decided
   *and* not yet possible (no connector implements those writes).
3. **Which Calendar/Email/Cloud-storage provider** (see API REQUIRED
   above) — a preference/cost/vendor-lock-in call, not something
   inferable from the codebase.
4. **Whether/when to acquire and dedicate additional hardware** to the
   device network (see DEVICE REQUIRED above) — a real spending
   decision.
5. **The git-history rewrite question** (also listed under USER
   REQUIRED, since the *action* is the operator's to take — but the
   underlying call of "is this worth doing, and when" is the business
   decision driving whether that action ever gets taken).
