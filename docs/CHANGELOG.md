# VERONICA Changelog

This log covers the "v1-foundation -> functional executive AI operating
system" development pass. Earlier phases (the Intelligence Layer
milestone: Executive Core through File Intelligence, plus the v1
release audit) are documented in `docs/Architecture.md` and
`docs/ENGINEERING_AUDIT.md` / `docs/FINAL_SYSTEM_STATE.md`; this file
starts from the point where a fresh audit found the codebase already
well past the "68 tests passing" baseline the driving prompt assumed.

## Pre-existing state (audited, not rebuilt)

Before writing any code, the repository was audited against the
9-phase brief. Most of it already existed:

- **Executive Core** (`core/executive/planner.js`, `decomposer.js`,
  `projectManager.js`): goal -> project -> milestone/task breakdown,
  department assignment, status/progress tracking.
- **Goal and Project System**: goals/projects/tasks/milestones/
  deadlines/priority, all persisted as ordinary memory entries, no
  parallel store.
- **Company layer** (`core/executive/companyManager.js`): companies,
  employees, documents, finances, relationships, communications.
- **Multi-device**: device registry, roles, sync, sighting history
  (`core/device/`).
- **Dashboard**: executive/business/learning/automation/collaboration
  views already wired to real backend state.

What was genuinely missing is what this changelog covers.

## Phase 2 -- Executive Core (orchestrator)

**Added:** `core/executive/orchestrator.js`. Planning and decomposition
existed, but nothing ever dispatched a decomposed task to a real
department, evaluated the result, and updated its status --
`ExecutiveOrchestrator` closes that loop: `pursue()` (plan + decompose
in one call), `nextReadyTask()`/`isReady()` (dependency-gated task
selection across the active roadmap), `executeTask()` (dispatch,
rule-based evaluation, status update, artifact recording, cascading
completion up through milestone -> project), `report()` (aggregate
roadmap view).

**Architectural decision:** constructed with the caller's
already-loaded `departments` array, same reasoning as
`core/collaboration/engine.js` -- avoids a second set of 9
IntelligenceEngine/Brain instances. Evaluation is rule-based (did the
department run throw or not), not a second LLM call, consistent with
`planner.js`'s own reasoning for deterministic executive logic.

**Wired into:** dashboard (`GET /api/executive/report`,
`POST /api/executive/pursue`, `POST /api/executive/run-next`) and the
terminal (`executive.pursue`/`report`/`runNext`).

**Tests:** 7 new (`tests/executive-orchestrator.test.js`).

## Phase 4 -- Autonomous execution loop

**Added:** `core/automation/jobs.js`'s `registerExecutionJob()`, wiring
`ExecutiveOrchestrator.runNextReadyTask()` to the automation engine's
existing scheduler (one bounded task every 5 minutes).

**Safety properties:** one task per tick (never "drain everything
ready"); a failed task is marked `blocked`, not retried forever, so a
broken task can't loop indefinitely; crash recovery, persisted
queue/schedule state, and structured logging were already provided by
`AutomationEngine`. Deliberately opt-in (not part of
`registerBuiltInJobs()`, which runs automatically on
`require("../automation")`) since this is the first job that can spend
real API credits and take real action unattended -- a host
(`dashboard/backend/server.js`, `core/interface/terminal.js`) must
explicitly wire its own departments in.

**Tests:** 1 new (confirms the job is absent until registered, then
correctly wired, without invoking the handler).

## Phase 5 -- Organizational operating system (logical company isolation)

**Decision point raised to the user:** the brief asked for each company
to have separate memory/knowledge/projects/permissions. The existing
design deliberately shares one memory/knowledge store with tag-based
scoping (`company:<id>`) so the system can still reason across
companies -- physically separating storage would reverse that,
touching most modules. Given the choice of (a) strengthen logical
isolation, (b) build full physical isolation, or (c) leave as-is, the
user chose (a).

**Added:** `core/executive/companyContext.js`. `CompanyManager.context(companyId)`
returns a `CompanyContext` whose `remember()`/`search()`/`filter()`
cannot read or write outside that one company's entries -- there's no
parameter that overrides the scope. Companies can optionally be
created with `allowedRoles` (validated against `identity/roles.json`);
a restricted company's context throws for any other role. Unrestricted
(the default) is intentional for a single-user system -- this is an
organizational boundary, not a security control against untrusted
actors.

**Tests:** 7 new (`tests/company-context.test.js`) -- unknown company,
unknown role rejection, forced tagging, cross-company isolation
(two companies with identical content never see each other's entries),
unrestricted-by-default behavior, enforced role restriction, knowledge
scoping.

## Phase 6 -- Memory architecture upgrade

**Added:** `core/memory/classification.js`, grouping the existing
memory `type`s into four classes (episodic, semantic, procedural,
organizational) -- a read-only, derived-on-read reporting layer, not a
second store. `"workflow"` was added to `core/memory/store.js`'s
`TYPES` (additive) as the one genuinely new capability: previously
nothing distinguished a repeatable process from a one-off fact.

**Wired into:** `memory.classify()`/`memory.overview()`, a new
`memory.overview` tool, `GET /api/memory/overview`, the
`memory.overview` terminal command, and a new "Memory" dashboard panel.

**Tests:** 9 new (classification logic, unknown-type fallback,
count/total correctness, an end-to-end tool test).

## Phase 7 -- Integration framework

**Added:** `core/integrations/registry.js` plus five new connectors,
none requiring live credentials to load or be listed:

- `github.js`, `discord.js`: real, functional connectors (GitHub REST
  API, Discord incoming webhooks), built on the existing
  `core/integrations/http.js` allowlisted `request()`. Fail closed
  until their own env var is set (`GITHUB_TOKEN`,
  `DISCORD_WEBHOOK_URL`), layered on top of `SERVICE_ALLOWLIST`.
- `calendar.js`, `email.js`, `cloudStorage.js`: interface-only
  placeholders (`isConfigured()`/`status()` plus stub methods that
  throw a clear "provider not chosen" error) -- each documents why
  picking a concrete provider (Google Calendar vs. Microsoft Graph,
  SMTP vs. SendGrid, S3 vs. Dropbox) wasn't this milestone's call to
  make.

`registry.js` aggregates all eight connectors (the five new ones plus
the pre-existing `obsidian`/`http`/`fileIntelligence`) into one
overview, exposed via `integrations.status`, `GET /api/integrations`,
and a new "Integrations" dashboard panel.

**Tests:** 10 new -- fail-closed behavior, mocked GitHub/Discord calls
(no real network access), placeholder interface stability, registry
aggregate counts.

## Phase 8 -- Multi-device: capabilities

Device registry/roles/sync already existed. The one gap: "device
capabilities" as a concept distinct from permissions (capabilities
describe what a device role can physically/functionally do; permissions
gate what it's allowed to access). Added a `capabilities` array per
role in `registry/devices.json` and
`capabilitiesForDeviceRole()`/`capabilities()` on `core/device/index.js`,
mirroring the existing permissions shape. Exposed via
`device.capabilities` (terminal) and `GET /api/device/capabilities`.

**Tests:** 4 new, added to the existing `tests/device.test.js` harness.

## Phase 9 -- Dashboard evolution

Surfaced the new orchestrator and memory-classification capabilities
(API-only until this point) in the actual dashboard UI: a "Progress
report" widget, a "Pursue an objective" form, a "Run next ready task"
button in the Executive panel, and a new "Memory" panel (class
breakdown) and "Integrations" panel (connector status). Verified with
`node --check`, a real server instance confirming the new endpoints
return well-formed JSON, and every new element id cross-checked
against `index.html`. No headless browser was available in this
environment, so full interactive/visual verification wasn't performed.

## Phase 10 -- Operational Validation

Not covered in detail here -- see `docs/PRODUCTION_READINESS.md` and
`docs/DEVELOPMENT_REPORT.md` for the full account. Summary: end-to-end
operator workflow tests (including a sandbox company simulation) and a
security audit that found and fixed a real cross-company data leak in
the reasoning-context path, plus a follow-up that wired company role
enforcement into the executive pipeline itself (`ExecutiveOrchestrator.authorizeExecution()`
-- see `docs/Architecture.md`'s "Company access control in the executive
pipeline"). Test count reached 240 by the end of that pass.

## Phase 11 -- Executive Intelligence Layer

Moves VERONICA from command-driven (you ask, it answers) toward
proactive: six additive, 100% rule-based subsystems, none replacing
anything existing. Full design reasoning -- including why none of these
duplicate `MemoryConsolidation`/`LearningEngine.recommend()`/
`SelfMonitor`, which already covered adjacent ground -- is in
`docs/Architecture.md`'s "Phase 11 -- Executive Intelligence Layer".

- **Priority ranking** (`core/executive/priorityRanking.js`): live
  re-scoring of the active roadmap against *today's* date (not the
  frozen priority stored at `plan()` time), plus bonuses for being
  blocked or blocking other projects -- every score cites its exact
  components.
- **Goal monitoring** (`core/executive/goalMonitor.js`): flags projects/
  milestones with no activity in 5+ days, independent of deadline
  status entirely (distinct from `selfMonitor.js`'s deadline-only
  check).
- **Blocker detection** (`core/executive/blockerDetection.js`): every
  currently-blocked task system-wide, plus projects that are quietly
  deadlocked (nothing left in them can become ready without
  intervention), each with the specific holdup named.
- **Executive recommendations** (`core/executive/executiveRecommendations.js`):
  rule-based synthesis of the three above into a short, concrete action
  list -- no LLM narration, unlike `consolidation.js`'s/
  `learning.recommend()`'s recommendation fields.
- **Daily briefing engine** (`core/executive/dailyBriefing.js`): the
  "read this each morning" snapshot, assembling all of the above --
  zero LLM calls.
- **Weekly operating reports** (`core/executive/weeklyReport.js`):
  backward-looking structured counts (completed work, new projects,
  blockers, briefings/recommendations issued), reusing
  `consolidation.history()`/`selfMonitor.history()` rather than
  re-gathering raw activity.

All six persist their insights to memory where that's the point
(recommendations/briefings/reports are stored artifacts with real
history; the three live-check engines feed those rather than
persisting redundantly on their own). `daily-briefing`/`weekly-report`
joined the automation engine's always-on built-in jobs (24h/7-day
cadence) -- safe to do since neither needs real departments or makes an
LLM call, unlike `execute-tasks`.

Wired into the executive facade, 9 new tools, dashboard routes plus a
new "Executive Intelligence" panel, and terminal commands -- the same
three surfaces every prior phase's capabilities got.

27 new tests across 6 new test files. All passing; no existing test
broken.

## Phase 12 -- Memory Evolution

Full design reasoning in `docs/Architecture.md`'s "Phase 12 -- Memory
Evolution". Three new modules, all in `core/memory/`:

- **`memoryClassifier.js`**: automatic classification at write time
  (reuses `classification.js`'s type->class table, plus tag-based
  overrides for company/workflow tags).
- **`memoryImportanceEngine.js`**: 0-100 score across six explainable
  factors (explicit importance, repetition, business impact, knowledge-
  graph connections, future retrieval value, recency), always returned
  with its full breakdown.
- **`memoryLifecycle.js`**: `temporary -> active -> persistent`
  promotion (never demotion on score alone) plus a staleness-based
  archive rule, run as a periodic sweep (not on every write).

`memory.remember()` now auto-stamps every new entry with its class/
score/`lifecycle: "temporary"`. `dailyBriefing.run()` (Phase 11) now
also runs the lifecycle sweep and records its transitions -- the "daily
cycle" connection this phase asked for. A newly-persistent entry gets
linked into the knowledge graph -- the other connection asked for.

Found and fixed a real, pre-existing data-integrity gap along the way:
the three original bootstrap memory entries had `metadata: null` (they
predate the `metadata` field existing at all), which nothing had ever
unconditionally dereferenced before this phase's code did. Fixed in
`store.js`'s existing legacy-migration pass.

24 new tests across 3 new test files, plus 2 more added to
`tests/daily-briefing.test.js` for the daily-cycle wiring. Wired into
the memory facade, 2 new tools, dashboard routes/widget, and terminal
commands -- the same surfaces every prior phase's capabilities got.

## Phase 13 -- Personal Operating Profile

Full design reasoning in `docs/Architecture.md`'s "Phase 13 -- Personal
Operating Profile". `core/profile/personalContextEngine.js`'s
`PersonalContextEngine` tracks the operator specifically (distinct from
`core/context/engine.js`'s per-query reasoning context): identity,
preferences, working style, relationships, and objectives, split
between an explicit profile file (`core/profile/veronica.profile.json`,
gitignored from the start) and live-derived data reused from Phases 11
-12 (active goals, persistent-memory "important context", recent
decisions, recommended focus via priority ranking) rather than
duplicated.

Terminal: `veronica.profile` (matching the codebase's own dot-notation
convention rather than the brief's literal `veronica profile` wording),
outputting exactly the requested format (mission/goals/context/
decisions/focus).

Two real bugs found and fixed along the way, both documented in full in
Architecture.md: (1) a genuine circular-require closing the same loop
documented since "Goal Decomposition Engine" -- `core/tools/handlers/
profile.js`'s first draft required `PersonalContextEngine` at module
top level, fixed with a lazy getter; (2) three terminal.js handlers
corrupted by bad `replace_all` operations in Phases 11-12 that had
shipped undetected because nothing in the test suite actually executes
`core/interface/terminal.js` -- caught via `node --check`, fixed, and
verified by actually booting the terminal.

9 new tests. Wired into tools/dashboard/terminal.

## Phase 14 -- Daily Operating System

Full design reasoning in `docs/Architecture.md`'s "Phase 14 -- Daily
Operating System". Adds the evening half of the daily cycle Phase 11's
morning briefing was always one half of: `core/executive/dailyReview.js`'s
`DailyReviewEngine` (completed/failed/learned today, new memories
today, tomorrow's top-priority preview) and
`core/executive/dailyCycle.js`'s thin `DailyCycleEngine` orchestrator
over both halves.

Documented, not faked: `AutomationEngine`'s scheduler has no time-of-day
concept, so `daily-briefing` and the new `daily-review` job both run on
the same 24h interval rather than at real "morning"/"evening" clock
times -- noted explicitly rather than pretended around.

7 new tests. Wired into the executive facade, 4 new tools, dashboard,
the `daily-review` automation job, and terminal commands.

## Phase 15 -- Controlled Autonomy

Full design reasoning in `docs/Architecture.md`'s "Phase 15 -- Controlled
Autonomy". Completes the pipeline: Observation (Phase 11) ->
Recommendation (Phase 11) -> **Proposal -> Approval -> Execution**
(this phase, `core/executive/actionProposal.js`).

"No autonomous external action without approval" is enforced
structurally: `execute()` throws unless status is exactly `"approved"`,
unconditionally -- `approvalRequired` (real, computed per action kind)
signals review urgency but never bypasses the gate. Execution itself
is administrative (roadmap status changes, e.g. unblocking a task),
handing eligible work back to the already-authorized orchestrator/
automation flow (Phase 10) rather than building a second execution
pipeline.

6 new tests including a full approve -> execute round trip verified
against the real `ProjectManager`. Wired into the executive facade, 5
new tools, dashboard (routes + widget + forms), and terminal commands.

## Phase 16 -- Device Network

Full design reasoning in `docs/Architecture.md`'s "Phase 16 -- Device
Network". `core/device/deviceManager.js`'s `DeviceManager`:
`registerDevice()`/`heartbeat()`/`deviceStatus()`/`assignRole()`, schema
`{id, name, type, role, capabilities, lastSeen, status}`. Deliberately
its own file (`network.json`) rather than overloading
`core/device/registry.js`'s existing known-devices roster, which
tracks something different (sync sighting history) with an
incompatible schema. Added `"chromebook"` as a fourth device role
alongside laptop/desktop/phone/server. `deviceStatus()` recomputes a
live online/offline status from real elapsed time (15-minute
threshold) rather than trusting a possibly-stale stored field.

Not wired into the dashboard UI yet -- Phase 17 explicitly covers a
"Device network" view; the API routes are ready for it rather than
building the widget twice.

7 new tests. Wired into dashboard routes and terminal commands.

## Phase 17 -- Command Center Dashboard

Full design reasoning in `docs/Architecture.md`'s "Phase 17 -- Command
Center Dashboard". Executive view and Memory view already existed
(Phases 9/11/12); adds the four that didn't as a new "Command Center"
panel: Goal view (`GET /api/goals/overview` -- roadmap + real per-
project progress), Agent network (`GET /api/agents/network` -- real
knowledge-graph connections per agent, not just the flat roster),
Device network (Phase 16's `DeviceManager.networkStatus()`, wired into
the dashboard now that Phase 17 exists to build the view properly),
and Action approvals (the existing Phase 15 proposals route extended
with a `?status=pending` filter for a focused queue).

Required extending the route dispatcher itself to pass query params
through (`ROUTES[routeKey](parsed.searchParams)`) -- backward
compatible, every existing route ignores the extra argument.

Found and fixed the same "real file created as a side effect of a GET
route" issue this suite has hit before (see Architecture.md): the new
devices route bootstraps `core/device/network.json` on first read,
now properly backed up/restored in `tests/dashboard.test.js`.

4 new tests covering the new/extended routes.

## Phase 18 -- Real World Readiness Audit

Audit-only, no code changes. Created `docs/REAL_WORLD_READINESS.md`
(what VERONICA can do alone vs. what needs a user account/hardware/
permission/human approval), `docs/EXTERNAL_DEPENDENCIES.md` (the same
gaps, categorized as USER REQUIRED / API REQUIRED / DEVICE REQUIRED /
BUSINESS DECISION REQUIRED), and `docs/NEXT_HUMAN_ACTIONS.md` (the
first, ordered, human-only action -- setting `API_TOKEN` -- and what
follows it). No test count change (324, same as end of Phase 17).

## Phase 19 -- External Integration & Operational Deployment

Full design reasoning and connector-by-connector detail in
`docs/EXTERNAL_INTEGRATIONS.md` (new). Audited first (per this phase's
own mandate): the existing connector architecture (`core/integrations/`),
AI provider architecture, dashboard integration points, approval
pipeline (`core/executive/actionProposal.js`), automation scheduler,
memory ingestion, executive orchestrator, and env var loading -- then
extended rather than redesigned.

- **`core/integrations/credentialManager.js`** (new): one centralized
  map of every credential this system knows about (10 connectors),
  `validateStartup()` (logs names of missing vars only, never crashes),
  `statusFor()`/`isConfigured()`/`overview()`. Every existing connector's
  own `isConfigured()` now delegates to it instead of duplicating
  `Boolean(process.env.X)`.
- **GitHub** (`core/integrations/github.js`, extended): `listBranches()`,
  `listCommits()`, `listPullRequests()`, `repositoryHealthSummary()`,
  and `pollRepository()` (ingests new open PRs/issues as external
  events, deduped by externalId). A new `github-poll` automation job
  (every 15 min) polls every repo in the optional `GITHUB_WATCHED_REPOS`
  env var.
- **Discord bot** (`core/integrations/discordBot.js`, new): a real
  `discord.js` bot -- login, slash commands (`/status`, `/approvals`),
  incoming interactions become VERONICA events, real
  connected/latency/guildCount status. Kept entirely separate from the
  pre-existing outgoing-webhook connector (different credential,
  different capability). **Explicit, user-approved exception** to this
  project's "no new npm dependencies" principle -- a real-time Discord
  bot genuinely needs a persistent Gateway connection or a public HTTPS
  endpoint, and hand-rolling either was weighed against `discord.js` and
  rejected as needlessly fragile (see the actual decision point in this
  phase's own commit history).
- **Google Workspace** (`core/integrations/google/`, new): a hand-built
  OAuth2 authorization-code flow (`oauth.js`, no `googleapis`
  dependency -- built on the existing `http.js`), plus real, read-only
  Gmail (`gmail.js`), Calendar (`calendar.js`), and Drive (`drive.js`)
  connectors, and a polling module (`poll.js`) wired into a new
  `google-poll` automation job. `isConfigured()` (env vars present) is
  explicitly distinct from `isAuthorized()` (a human has completed
  Google's real consent screen) -- the dashboard exposes both halves of
  the flow (`GET /api/integrations/google/auth-url`,
  `GET /api/integrations/google/callback`).
- **`core/integrations/eventIngestion.js`** (new): the one shared
  normalization point every connector event flows through -- tags
  `external-event`/`source:X`/`kind:Y` and hands off to the **existing**
  `memory.remember()` (Phase 12's classification/scoring/lifecycle),
  never a second memory system.
- **`core/executive/actionProposal.js`** (extended): `proposeExternalAction()`/
  `executeExternal()` alongside the existing recommendation-derived
  `fromRecommendation()`/`execute()` -- same memory-backed pending/
  approved/rejected/executed status machine, same unconditional
  "must be approved" gate. Only `create_github_issue` and
  `post_discord_message` are wired to a real connector call; nothing
  else (send_email, push_code, merge_pr, delete_file) has connector
  support yet, so nothing else was added to avoid fabricating capability
  that doesn't exist.
- **Executive awareness** (`dailyBriefing.js`/`dailyReview.js`/
  `weeklyReport.js`, extended): each now surfaces external connector
  events (last 24h / today / this week respectively) via
  `eventIngestion.recentEvents()` -- a new email, GitHub PR, Discord
  command, calendar meeting, or Drive document now reaches the same
  morning briefing, evening review, and weekly report an operator
  already reads.
- **`core/integrations/registry.js`** extended with the two new
  connectors (discordBot, google) -- `GET /api/integrations` now reports
  10 connectors total, real status only, no fake values.
- **Boot sequence**: both `dashboard/backend/server.js` and
  `core/interface/terminal.js` now call
  `credentialManager.validateStartup()` at real boot; the dashboard also
  starts the Discord bot (non-blocking -- a bad token or network outage
  never crashes the dashboard).

A real, fixed bug found and corrected along the way: `expires_in: 0`
(an already-expired token) was being treated as "not provided" by
`tokens.expires_in || 3600`, silently defaulting to a full extra hour of
(incorrectly) assumed validity -- fixed to
`Number.isFinite(tokens.expires_in) ? tokens.expires_in : 3600`. Also
fixed the same synchronous-throw-instead-of-promise-rejection class of
bug (previously fixed once for `http.js` in Phase 7) in three new Gmail/
Drive methods.

51 new tests (324 -> 375), covering: credential presence/absence
reporting, Google OAuth's full authorization-code flow (configure ->
auth URL -> exchange -> auto-refresh), GitHub monitoring/health-summary/
polling with dedupe, a fully faked (never network-connecting) Discord
bot client exercising real event-handling/ingestion/status logic, the
shared event ingestion pipeline, the two new external `ActionProposal`
kinds end to end (approve -> execute -> real connector call, including
a real failure surfacing as a rejection rather than a false "executed"),
Google Workspace polling with dedupe, the two new dashboard OAuth
routes, and the three executive-awareness extensions.

## Totals

- 18 commits across Phases 10-17 combined with the earlier 9, plus 12
  more across Phase 19 and 6 more across Phases 20-24, each with
  `npm test` green before committing.
- Test count: 210 -> 222 (end of the original 9-phase pass) -> 240 (end
  of Phase 10) -> 267 (end of Phase 11) -> 291 (end of Phase 12) -> 300
  (end of Phase 13) -> 307 (end of Phase 14) -> 313 (end of Phase 15)
  -> 320 (end of Phase 16) -> 324 (end of Phase 17) -> 324 (end of
  Phase 18, audit-only) -> 375 (end of Phase 19) -> 403 (end of Phases
  20-24), all passing throughout.
- No existing test broken; no existing public API removed or changed
  incompatibly.

## Phase 20 -- Capability Expansion Architecture

`core/capabilities/` (new): `registry.js` (persisted status --
installed/active/disabled/error -- for every capability, seeded with
the real built-ins), `manifest.js`/`validator.js` (load and validate a
package's `manifest.json` against its actual directory: do the declared
agent prompt/tool handler files really exist, are dependencies already
installed), `lifecycle.js` (legal status transitions + rollback to a
prior snapshot), `installer.js` (validate -> snapshot -> register ->
real health check, actually `require()`-ing every declared file to
catch a syntax error before activation -> activate, or roll back
entirely on any failure), `planner.js` ("VERONICA, create a trading
division" -> a rule-based capability-gap analysis against a static
domain catalog). A package whose manifest sets `"approvalRequired":
true` reuses Phase 19's `ActionProposalEngine` (a new
`install_capability` external action) rather than a second approval
mechanism.

`packages/example/` is one real, minimal reference package (one agent,
one tool) proving the install pipeline end to end -- deliberately not
five fabricated business-department stubs. Installed package agents/
tools are NOT YET hot-wired into the live agent/department/tool roster
(`core/agents/loader.js` etc. are unchanged) -- see "Remaining
limitations" below.

Dashboard: `GET /api/capabilities`, `POST /api/capabilities/analyze`
(no auth -- read-only analysis), `POST /api/capabilities/install`
(`API_TOKEN`-gated), and a new
`POST /api/executive/proposals/:id/execute-external` route for the
async external-proposal execution path.

19 new tests.

## Phase 21 -- Mac Resident System

`core/system/startupManager.js`: a thin, user-level supervisor --
spawns the dashboard server as a child process, restarts it on crash
(bounded, exponential backoff, gives up after a limit within a rolling
window rather than crash-looping forever), and periodically health-
checks it over real HTTP. Touches nothing about sleep/shutdown/battery/
power management or any system-level policy, per this phase's explicit
constraint.

`config/com.veronica.agent.plist` is a LaunchAgent template for
`~/Library/LaunchAgents/` (per-user, unprivileged -- never
`/Library/LaunchDaemons/`). Actually installing it
(`scripts/install-launch-agent.sh`) changes the machine's real login
behavior, so it's an opt-in script the operator runs manually, not
something executed automatically as part of this work --
`scripts/uninstall-launch-agent.sh` reverses it.

4 new tests (a fully faked child process, a real ephemeral HTTP server
for the health-check path -- no test spawns a real process or touches
the real LaunchAgents directory).

## Phase 23 -- Integration Framework

Phase 19 already built the substance of this phase's ask (connector
registry, per-connector status, permissions via `credentialManager`,
health via each connector's own `status()`). Closed the one real gap:
`core/integrations/registry.js` now reports a real `lastSync` timestamp
for github/google, derived from the shared event-ingestion pipeline
every poller already writes to.

1 new test.

## Phase 24 -- VERONICA Self-Management

`installer.upgrade(name, packageDir)`: capability upgrades with the
same backup-snapshot/health-check/rollback safety as a fresh install.
`core/system/report.js` answers "what exists / what is missing / what
needs improvement" by reading the real capability/integration/
credential registries -- not a fourth parallel tracking system. Exposed
as `GET /api/system/report`. Health monitoring itself was already real
(Phase 11's `SelfMonitor`).

4 new tests.

## Phase 22 -- Command Center Dashboard (extension, not a redesign)

Extended the existing dashboard rather than rebuilding it -- this
environment has no browser for visual verification, so a full aesthetic
overhaul isn't something that could be honestly verified as done.
Integrations panel now surfaces the richer fields Phase 19's newer
connectors report (authorized/connected/latency/guild count/lastSync);
fixed `github.js`/`discord.js`/`discordBot.js`/`google/oauth.js`'s
`status()` to report `implemented: true` (always true, just missing,
which mislabeled them "placeholder" in the existing UI). New
"Capability Center" panel (installed capabilities, objective analysis,
package install) and "System Report" panel. The existing generic
proposal-action form gained an "execute external" option.

No new backend routes in this commit (both `GET /api/capabilities` and
`GET /api/system/report` were already tested when built in Phase 20/24)
-- verified by booting the dashboard for real and curling every new
route plus the served HTML/JS.

## Remaining limitations / future work

- **Installed capability packages aren't hot-wired into the live agent/
  tool/department roster yet** (Phase 20) -- `core/agents/loader.js`/
  `core/tools/loader.js`/`core/departments/loader.js` would need to
  additionally merge in installed packages' declarations; today,
  install/upgrade/rollback all work for real against the capability
  registry, but a package's agents don't yet become live `Agent`
  instances without extending those three loaders.
- **Generic Calendar/Email/Cloud storage connectors** (the pre-Phase-19
  provider-agnostic placeholders) remain interface-only -- Google
  Calendar/Gmail/Drive are now real (Phase 19); a different provider,
  or Gmail *sending*/Drive *uploading*, would still need to be built.
- **Autonomous execution** only picks the single next ready task per
  5-minute tick; there's no priority preemption mid-cycle, no
  parallelism across departments, and no operator-facing "pause
  autonomous execution" switch beyond not registering the job or
  stopping the automation engine entirely.
- **Company isolation** is logical/tag-based, not physical -- documented
  and deliberate (see Phase 5 above), but worth revisiting if VERONICA
  ever needs to run on behalf of more than one user, or a tool is added
  that can create arbitrary filesystem entries (see
  `docs/Architecture.md`'s "v1 release audit" symlink note, which the
  same reasoning extends to).
- **No visual/browser-based UI testing** was performed for any dashboard
  work (Phase 9 through 22) in this environment -- endpoint- and
  content-level verification only.
- **External write capability remains narrow by design** (Phase 19/20):
  only `create_github_issue`/`post_discord_message`/`install_capability`
  can be executed through the approval pipeline; email sending, PR
  merging, code pushing, and file deletion have no connector
  implementation at all.
- **The LaunchAgent is a template, not installed** (Phase 21) -- running
  `scripts/install-launch-agent.sh` is a deliberate, manual, one-time
  operator action, not something this session did automatically.

## Phase 25 -- Dynamic Capability Activation

Closed the exact gap the prior phase's own docs/NEXT_STEPS.md named as
the top next increment. `core/capabilities/activation.js` (new) is the
single source of truth for "what does an active, installed capability
package provide," read directly from the registry -- `core/agents/loader.js`,
`core/tools/loader.js`, `core/departments/loader.js`, and
`core/automation/jobs.js` each extended (not rewritten) to also load a
package's agents/tools/department/automations alongside the base
roster. Zero active packages (every existing test, every clean install)
means identical behavior to before this phase. 7 new tests.

## Phase 26 -- Capability Marketplace

`core/capabilities/marketplace.js` (new): categorizes every capability
into Installed/Available/Disabled/Experimental/Updates Available/
Deprecated/Broken, with real per-package metadata -- install size (an
actual recursive byte count), update history (the existing registry
history array), and a real updates-available detection (registered
version vs. the manifest on disk right now). "Available" packages are
discovered by scanning `packages/` for manifests not yet installed.
7 new tests.

## Phase 27 -- Internal Package Builder

`core/capabilities/builder.js` (new): generates a new capability
package's real files -- manifest, agent/tool SKELETONS (explicitly
placeholder, not working capability), an optional department
manager.js, a self-validating test, a README -- from small, reusable
templates. Found and fixed two real bugs: hardcoded relative require
paths breaking under a custom output directory, and a macOS
`/var/folders` vs. `/private/var/folders` symlink discrepancy between
`mkdtempSync` and Node's module resolver. 6 new tests.

## Phase 28 -- Capability Planner extension

Extended (not replaced) `core/capabilities/planner.js`: each catalog
capability now carries required-agent-role/required-APIs/dependsOn/
risk/estimatedDays, so `analyzeRequest()` additionally returns a real
dependency graph, required permissions/agents/APIs, a risk assessment,
and a summed build-time estimate -- fully backward compatible with
Phase 20's original output shape. 4 new tests.

## Phase 29 -- Knowledge & Research Engine

`core/research/engine.js` (new): fetches a real URL through the
existing allowlisted http connector, extracts plain text (regex-based,
no new DOM-parser dependency), extracts structured knowledge via a real
LLM call (same dependency-injection pattern as GoalDecomposer), and
stores it as an ordinary, cited memory entry. Deliberately requires a
real URL -- never fabricates knowledge from a bare topic name, since
there's no web-search connector in this codebase. 5 new tests.

## Phase 30 -- Self Improvement Engine

`core/system/selfImprovement.js` (new): what's duplicated (a real tool-
id collision check across installed packages), outdated (reuses Phase
26's version-drift detection), and performing poorly (departments/tools
with enough volume and a high failure rate, same thresholds as Phase
11's SelfMonitor) -- assembled into an Optimization Queue, Refactor
Queue, Performance Report, and a real, live Security Report (is
`API_TOKEN` set, is `SERVICE_ALLOWLIST` set, which connectors are
unconfigured right now). No autonomous execution anywhere in this file
-- proposals only. 4 new tests.

## Phase 31 -- Mission Engine

`core/executive/missionEngine.js` (new): the shift from commands to
objectives, composing five already-existing systems (ExecutivePlanner,
GoalDecomposer, the capability planner, ProjectManager,
ExecutiveRecommendationEngine) around one persisted mission record,
rather than building a parallel planning system. Wired into the
existing `core/executive/index.js` facade. 4 new tests.

## Phase 32 -- Organization Operating System

`core/executive/organizationOverview.js` (new): the one aggregation
point across companies/departments/projects/missions/capabilities/
knowledge/automation/devices/approvals this phase's dashboard ask
names -- every section a thin read over a system that already existed.
Cross-department dependencies are derived from real knowledge-graph
relationships between agents in different departments. Dashboard gains
an "Organization Overview" panel placed FIRST in the layout, per the
information-hierarchy principle (executive summary before everything
else). 6 new tests.

## Totals (Phases 25-32)

- 8 commits, one per phase, each with `npm test` green before
  committing.
- Test count: 403 (end of Phase 24) -> 410 (Phase 25) -> 417 (Phase 26)
  -> 423 (Phase 27) -> 427 (Phase 28) -> 432 (Phase 29) -> 436 (Phase 30)
  -> 440 (Phase 31) -> 446 (Phase 32), all passing throughout.
- No existing test broken; no existing public API removed or changed
  incompatibly.
- One real incident during this arc, found and corrected: a live
  end-to-end smoke test of Phase 31's mission creation (against the
  real Claude API, to verify the dashboard route actually worked) wrote
  15 real memory entries and 14 real knowledge-graph entities/
  relationships into the actual (non-test) database.json/graph.json.
  Found and removed all of them by id/name immediately after, verified
  both files remained valid JSON and the full suite still passed. This
  is the same class of risk every "boot the real server and curl it"
  verification in this project's history carries when the route being
  tested WRITES (as opposed to the many prior smoke tests that were
  read-only GETs) -- worth remembering for any future live verification
  of a write route.

## Remaining limitations / future work (updated)

- **Installed capability packages ARE now hot-wired into the live
  roster** (Phase 25 closes the gap Phase 20 left open) -- agents/tools/
  departments/automations all activate for real once a package is
  installed and active.
- **No dynamic dashboard-panel plugin system** -- a package-specific
  dashboard view still means extending `dashboard/frontend/` directly
  (documented in every generated package's README, Phase 27).
- **Package-provided departments inherit DepartmentManager's own
  activity-log path assumption** (`departments/<id>/logs/`, relative to
  `core/departments/base.js`'s own location) -- a package's department
  would need that directory to exist, or its own `.log()` calls will
  fail, since the base class doesn't yet know how to log to a package's
  own directory. Not hit in practice (`packages/example/` declares no
  department), but a real gap for the first package that does.
- **Architecture Debt in Phase 30's Self Improvement Engine is a
  manually curated snapshot**, not live-derived -- update
  `KNOWN_ARCHITECTURE_DEBT` in `core/system/selfImprovement.js` as items
  are resolved.
- **Mission Engine's timeline estimates are explicitly rough** -- an
  8-hour-workday conversion of real decomposed task hours plus the
  capability planner's static per-domain day estimates, stated as
  estimates, not commitments.
- **No web-search connector** -- Phase 29's Research Engine requires a
  real, specific URL; it cannot discover documentation on its own.
- Every limitation listed in the Phase 19-24 section above still
  applies except where superseded here.

## Phase 33 -- Core Stabilization

Audited "dynamic loading/eliminate hardcoded paths/unify loader
behavior/rollback+upgrade reliability/startup validation/recovery after
failures/dependency validation" against the real code, per this phase's
own "audit before modifying" instruction. Found and fixed four real,
contained issues:

1. `core/capabilities/registry.js`'s `load()` had no recovery from a
   corrupted `state.json` -- and since Phase 25 wired this registry into
   every agent/tool/department loader, a corrupted file would crash ALL
   of them. Now preserves the corrupt file (timestamped) and
   reinitializes to defaults rather than crashing boot.
2. `DepartmentManager`'s activity-log path
   (`departments/<id>/logs/activity.log`) is runtime output, not
   checked into git -- missing on a fresh clone for built-ins, and never
   existing at all for a package-declared department. Fixed by always
   ensuring the log directory exists at construction, and accepting an
   optional `logDir` so a package logs to its own directory.
3. Real dependency version constraints: `manifest.dependencies` entries
   can now be `{name, minVersion}`, not just a plain name -- backward
   compatible with the plain-string form.
4. The exact "unify loader behavior" gap: `core/automation/jobs.js`'s
   package-job loop already logged-and-skipped a broken package
   automation (Phase 25), but `core/agents/loader.js`/
   `core/tools/loader.js`/`core/departments/loader.js`'s package loops
   did not -- a broken package file (edited/corrupted after
   installation) would crash agent/tool/department loading entirely.
   All three now match the existing resilience pattern.

Also added `registry.validateStartup()` (logs any capability already in
error/disabled status at boot, same posture as
`credentialManager.validateStartup()`).

9 new tests (one existing test's asserted behavior deliberately updated
to match the improved resilience, not a regression).

## Phase 34 -- Production Dashboard

Not a visual redesign (unverifiable without a browser in this
environment) -- three genuinely new real capabilities, placed first in
the layout per the "what needs attention" information-hierarchy
principle: `core/system/health.js` (real CPU/RAM/disk via Node's
built-in `os`/`fs`, zero new dependencies, plus VERONICA's own internal
service status), `core/system/search.js` (one search entry point across
memory/knowledge/capabilities, each a passthrough to that system's own
existing search), and `core/executive/executiveSummary.js` (Today's
Priorities + Critical Alerts, composed from already-existing detectors).
New "Executive Summary" panel, header search, and a Ctrl+K/Cmd+K command
palette (a flat quick-navigation list).

10 new tests.

## Phase 35 -- Production Capability Packages

Six real, generated (Phase 27's builder) packages for Business
Operations/Marketing/Sales/Research/Finance/Trading Research -- real
manifests, agent/tool skeletons, package-owned departments,
self-validating tests, READMEs, `approvalRequired: true`. Still
skeletons, honestly: no ad-platform/broker/market-data/MLS API
integration exists for any of these. All six were installed for real
via `installer.install()` -- each created a genuine PENDING proposal,
none self-approved.

7 new tests (validates all six real manifests stay valid as part of the
main test run).

## Phase 36 -- Connector Completion

Audited all 7 named connectors against register/validate/report
status/respect approval/log activity/store credentials securely/report
failures/retry safely. Two real gaps fixed: `core/integrations/http.js`
gains `requestWithRetry()` (bounded, backoff retries -- GET only by
default, since a POST/PUT/PATCH/DELETE retry could double-execute a
write whose response was simply lost), wired into GitHub's and every
Google connector's shared `call()` helper; `BrainProvider` gains
`status()`, and Claude/OpenAI now appear in the integration registry
alongside every other connector.

Two real bugs found by tests before being wired in anywhere: the last
retry attempt returned a still-failing response as success instead of
throwing (a silent failure); `requestWithRetry()` initially bypassed
every existing test's `http.request = fakeFn` mocking convention by
calling the bare local function instead of `module.exports.request`.

4 new tests, 2 existing tests updated for the two new registry entries.

## Phase 37 -- Executive Assistant

Extends `DailyBriefingEngine`/`DailyReviewEngine` (not a new daily-
workflow system) with the sections this phase's ask named that weren't
there: pending approvals, company health, mission status, package
updates, learning summary (morning); knowledge evolution -- real
entities/relationships added TODAY (evening). System health deliberately
NOT duplicated into the (synchronous, heavily-tested) briefing class --
Phase 34's Executive Summary panel already surfaces it on the same
dashboard view.

2 new tests.

## Phase 38 -- Learning Engine

`core/learning/adaptiveInsights.js` tracks accepted/rejected
recommendations, repeated behaviors, automation success, and package
tool usage -- entirely from already-persisted real records (Phase 15's
proposal status history, Phase 11's recommendation history, Phase 8's
automation history, tool-call telemetry). Rule-based, fully explainable,
a reporting layer only -- does not feed back into recommendation
generation itself (named as real future work, not done silently).

5 new tests.

## Phase 39 -- Autonomous Capability Builder

`core/capabilities/autonomousBuilder.js` chains analyze (Phase 28) ->
generate package/agents/tools/tests/docs + validate (Phase 27) ->
request approval (Phase 20) into one pipeline from a single objective
("Build a recruiting department" -- added for real as a new
`CAPABILITY_CATALOG` domain). `approvalRequired` is structurally forced
`true` on every autonomously-derived package, not just a default --
"no execution without approval" as a guarantee, not a convention.

6 new tests.

## Phase 40 -- Personal Operating System

Closes the last real gaps in Phase 32's `OrganizationOverview`
(memories, connectors, executive recommendations), then makes the WHOLE
aggregation callable by VERONICA herself: `core/system/selfKnowledge.js`
+ a new `system.understand` tool. Building this surfaced (and required
fixing) the exact "Goal Decomposition Engine" circular-require class
this project has hit before -- fixed with the same lazy-require
convention already established, with a dedicated regression test
guarding the specific path.

12 new tests.

## Totals (Phases 33-40)

- 8 commits, one per phase, each with `npm test` green before
  committing.
- Test count: 446 (end of Phase 32) -> 449 (33 part 1) -> 448 (33 part
  2 -- net includes a corrected assertion) -> 451 (33 part 3) -> 461
  (34) -> 468 (35) -> 472 (36) -> 474 (37) -> 479 (38) -> 485 (39) ->
  491 (40), all passing throughout.
- No existing test broken; every behavior change (the loader resilience
  fix, Phase 33) was deliberate and documented, with the affected test's
  assertion updated to match the improved behavior, not silently
  reverted.

## Remaining limitations / future work (Phases 33-40)

- **Package-declared departments' activity logging is fixed** (Phase
  33) -- the gap named at the end of the Phase 19-24 section is closed.
- **No dynamic dashboard-panel plugin system still** -- unchanged from
  before this arc.
- **Adaptive insights are reporting-only** (Phase 38) -- not yet wired
  into how `executiveRecommendations.js` actually generates
  recommendations. Real next step, not done silently.
- **The autonomous capability builder always requires approval** (Phase
  39, by design) -- there is no path for it to install/activate
  anything without a human.
- **`system.understand` (Phase 40) constructs fresh department
  instances on every call** (via the existing loaders) rather than
  reusing a host's already-running ones -- correct, but real IntelligenceEngine
  construction for all 9 departments on every call is not free; caching
  within a single reasoning session would be the natural optimization
  if this tool sees heavy use.
- **Recommended next phase:** see the final architecture review's Phase
  41+ roadmap.

## Phase 41 (part 1) -- Real Package Activation: Approval + Three Live Bugs

The operator approved all six pending Phase 35 production capability
packages (`business-operations`, `marketing`, `sales`,
`research-department`, `finance`, `trading-research`). Approving and
actually installing them for real -- not a temp-directory test package,
the first time this exact end-to-end path had ever carried real,
permanent state -- surfaced three genuine bugs that no prior test had
caught, because every prior test either used an absolute `mkdtempSync()`
path or hand-built a registry entry directly, bypassing the exact code
paths below.

**Bug 1 -- relative `packageDir` broke `require()` in `installer.js`'s
`healthCheck()`.** `fs.existsSync()`/`fs.readFileSync()` resolve a
relative path against `process.cwd()`; `require()` does not -- a bare
`"packages/finance"` (no `./` prefix) is a node_modules specifier to
`require()`, not a cwd-relative path. Fixed with a `resolvePackageDir()`
helper applied at all three real entry points
(`completeInstall()`/`install()`/`upgrade()`), plus a regression test
using a real relative path (not `mkdtempSync()`'s always-absolute one).

**Bug 2 -- `core/capabilities/manifest.js`'s `normalize()` silently
dropped `department` and `automations`.** Phase 25 added those two
optional manifest fields (read back by
`core/capabilities/activation.js`'s `packageDepartmentConfigs()`/
`packageAutomationConfigs()`), but `manifest.js`'s field whitelist
(written in Phase 20, before either field existed) was never updated to
pass them through. Every real package's department declaration was
stripped before being persisted to the registry -- so all six packages
were "active" but contributed **zero** departments, invisibly. Fixed by
adding both fields to `normalize()`'s output, plus a one-time repair
(re-reading each already-installed package's real on-disk `manifest.json`
through the fixed `normalize()` and writing the corrected manifest back
into `core/capabilities/state.json`) so the six packages already
installed didn't have to be uninstalled and reinstalled to pick up the
fix.

**Bug 3 -- `core/context/engine.js` had its own, second, independent
department loader** that only read the static `registry/departments.json`
and never knew package departments existed at all -- meaning every
`think()` call's context (this engine feeds every reasoning call,
per its own file comment) silently omitted the six real divisions.
Fixed by having it also pull from
`core/capabilities/activation.js`'s `packageDepartmentConfigs()`, the
same single source of truth `core/departments/loader.js` already uses,
without adopting that loader's full `DepartmentManager` instantiation
(this engine only needs the lightweight `{id, name, domain, status}`
summary it already returned for built-ins).

**Result:** 25 live agents (9 built-in + 16 package), 15 live
departments (9 built-in + 6 package) -- both genuinely wired through
every consumer (`core/agents/loader.js`, `core/tools/loader.js`,
`core/departments/loader.js`, `core/context/engine.js`, the dashboard's
`/api/status`/`/api/agents`/`/api/departments`).

**Test suite baseline updated to match real machine state, not
fabricated:** every test that hardcoded "9 agents"/"9 departments" as a
closed assumption (`tests/dashboard.test.js` x2,
`tests/departments.test.js`, `tests/system-self-knowledge.test.js`,
`tests/context-engine.test.js`) now asserts 25/15 with a comment
explaining why; `tests/tools.test.js`'s exhaustive tool-id list became a
subset-plus-unexplained-extras check (a fixed closed list is
incompatible with a machine that has real, dynamically installed
packages); `tests/capabilities-activation.test.js`'s "zero active
packages" test now creates that condition for itself via
`registry.snapshot()`/`restore()` instead of assuming it's the
environment's natural baseline; `tests/capabilities-planner-extended.test.js`
updated to reflect that `planner.js`'s `isCapabilityPresent()` now
correctly matches "market intelligence" against the real
`trading-research` package's description (a real, correct behavior
change, not a regression -- confirmed by direct diagnostic before
editing any assertion).

**Also fixed, unrelated:** `tests/crash-guard.test.js` (x3) and
`tests/logging.test.js`'s error-log tests asserted an exact
before/after diff using `readErrors(1000)` -- `core/logging/index.js`'s
`readErrors(limit)` caps its result at `limit` regardless of true total,
so once `errors.log` organically grew past 1000 real lines (which it
now has, after months of real sessions), the diff-by-N assumption broke
for reasons having nothing to do with the code under test. Fixed by
truncating the file to empty in `test.before()` (already backed up,
already restored in `test.after()` -- the same pattern this project uses
everywhere else) so the count is deterministic regardless of the real
log's historical size.

488 -> 492 tests (1 new regression test for Bug 1; net +3 from planner
test restructuring). All passing.

No architectural redesign -- every fix reuses the exact pattern already
established for its class of problem (lazy path resolution, a single
source-of-truth manifest shape, snapshot/restore test isolation).

## Phase 41 (part 2) -- Bug 4, Capability Health Reporting, Capability Operations Dashboard View

Continuing the 9-point integration checklist audit from part 1 (Capability
Registry/Executive Core/Organization Manager/Agent Registry/Tool
Registry/Organization Overview/Executive Dashboard were all confirmed
already correctly wired once the three part-1 bugs were fixed -- verified
directly against the running `OrganizationOverview`/dashboard endpoints,
not assumed). Two items remained genuinely open: a fourth real bug found
during that audit, and the "Installed – Awaiting Integration" status
concept, which didn't exist anywhere yet.

**Bug 4 -- `core/executive/planner.js`'s `ExecutivePlanner` had the exact
same class of gap as Bug 3** (`core/context/engine.js`, part 1):
`loadDepartments()`/`loadAgents()` read ONLY the static
`registry/departments.json`/`registry/agents.json` files, never
package-declared ones. Concretely: `assignDepartment()` would throw
`"Unknown department"` on an explicit `goal.department: "trading-dept"`,
keyword-match auto-assignment could never select a package department,
and `resolveOwners()` could never return a package agent as an owner --
meaning Executive Planning (checklist item 9) never actually knew the six
real divisions existed. Fixed the same way as Bug 3: merge in
`core/capabilities/activation.js`'s `packageDepartmentConfigs()`/
`packageAgentConfigs()`, the same source of truth every other consumer
already uses. Regression test added to `tests/executive.test.js` (explicit
assignment to the real `trading-dept`, real package agent as owner).

**"Installed – Awaiting Integration" (checklist item 8), built for
real:** new `core/capabilities/health.js` computes each installed
package's real operational status -- not `registry.status` (which only
means "correctly wired into the loaders," already guaranteed by Phase
25/33/41-part-1), but whether its declared agents/tools actually loaded,
whether any declared dependency is missing, and whether any of its tools
is still a `core/capabilities/builder.js`-generated skeleton. Detected by
reading the tool handler's own source for `builder.js`'s
`SKELETON_MARKER` constant (now exported, shared by both the generator
and the detector, rather than a duplicated string) -- not by calling the
handler, since a real tool could have side effects and this needs to stay
a passive check. `core/tools/base.js`'s `Tool` gained a `packageSource`
field (mirroring `Agent`'s existing one) so a live tool can be attributed
back to its owning package.

Four operational statuses, all REPORTING-only (never overwrites
`registry.status`): `"active"` (fully real), `"installed_awaiting_integration"`
(wired and running, but at least one tool is still a skeleton --
currently all six real Phase 35 packages, honestly, since none of their
tools have real implementations yet), `"degraded"` (a declared agent/tool
failed to load, or a dependency is missing), or the raw `registry.status`
verbatim for anything not active (`"installed"`, `"disabled"`).

Wired into the dashboard: `GET /api/capabilities/health`, and a new
"Capability Operations" panel (`dashboard/frontend/index.html`/`app.js`)
listing every installed package's real status, agents/tools
loaded-vs-declared, any skeleton tools, and any missing dependencies --
distinct from the existing Capability Marketplace panel (install/version/
update metadata, not "does it actually work").

6 new tests (`tests/capabilities-health.test.js`: active/skeleton/degraded-
agent/degraded-dependency/inactive/core-exclusion, each built from a real
temp package, not mocked) + 1 dashboard endpoint test + 1 planner
regression test. 492 -> 500 tests, all passing.

No architectural redesign -- `health.js` is a pure read/report layer over
existing loaders and the existing registry; nothing about how a package
actually gets installed, activated, or loaded changed.

## Phase 41 (Marketing Division) -- parts 1-5

With the integration checklist closed, work moved to the operator's next
objective: make the Marketing Division production-ready. Audited the
existing architecture first (company data model, daily briefing/review,
campaign concepts, approval pipeline, learning/analytics, brand/voice --
a dedicated research pass) before writing anything, per standing
instruction to reuse rather than duplicate. Findings: the company model,
daily cycle engines, and approval pipeline were all real and reusable;
campaigns and brand/voice were genuinely greenfield; the marketing
package itself was still 100% skeleton (Phase 35).

**Part 1 -- Company Brain + Campaign Engine.** `companyManager.js`
gained `brandProfile` (mission/vision/values/brand/voice/products/
services/goals/audience/competitors/assets/operatingRules) as company
metadata, the same shallow-merge-on-update pattern every other company
field already uses. Made `metadata.history` a real, live decision log
via `recordDecision()` -- it existed as a field since Phase 2 but nothing
ever appended to it. Added `clientRelationships()` and `companyBrain()`,
the single aggregated view the spec asks for, built entirely from
existing concepts plus the one genuinely new addition: campaigns. New
`core/marketing/campaigns.js` -- real campaigns as memory entries (same
pattern as everything else), with the full field set the spec asks for
(Objective/Audience/Platforms/Timeline/Content Schedule/Assets/Approval
Status/Publishing Status/Performance Metrics/Lessons Learned) --
`scheduleContent()`/`calendar()` together ARE the Campaign Planner/
Calendar.

**Part 2 -- real Content Generator + Publishing Queue.** New
`core/marketing/contentGenerator.js`: genuine content drafting routed
through `core/intelligence.think()` (the same reasoning path every
other agent call uses, following `core/learning/engine.js`'s own
established pattern), incorporating a company's real brand voice once
set. Not fabricated -- Claude is already the configured provider in this
environment. `actionProposal.js` gained `publish_content` as a new
external action, reusing `ActionProposalEngine` wholesale (no parallel
approval system). Execution honestly only works for platforms with a
real connector (Discord, today) -- any other platform throws a clear
"no publishing connector configured" error rather than fabricating a
post.

**Part 3 -- real Analytics Engine + real tool + complete agent
hierarchy.** New `core/marketing/analytics.js`: campaign-domain metrics
(whatever was actually recorded -- no ad platform connector exists to
auto-pull this) plus real execution telemetry, reusing
`core/learning`'s existing department-agnostic aggregation for free.
`packages/marketing`'s one skeleton tool (`marketing.campaign.plan`)
was given a real implementation (creates a real campaign; fixed its
permission from an invented `"read"` string to the real
`"write_memory"` vocabulary). Every agent's placeholder prompt was
replaced with a real one, and three agents were added to complete the
operator's specified hierarchy (Executive Core -> MarketingDirector ->
CampaignManager -> ContentStrategist -> BrandManager ->
PublishingManager -> MarketingAnalyticsAgent): MarketingDirector,
BrandManager, PublishingManager. Result: `core/capabilities/health.js`
now reports marketing as genuinely `"active"`, not `"Installed –
Awaiting Integration"` -- the first of the six Phase 35 packages to
cross that line for real.

**Part 4 -- Department Health + Campaign Health in the morning
briefing.** `dailyBriefing.js` gained the two Executive Daily Operations
sections Phase 37 didn't cover: `departmentHealth()` (reuses
`OrganizationOverview.departmentHealth()` wholesale) and
`campaignHealth()` (genuinely new -- a thin per-company rollup over
`campaigns.js`'s real state: pending-approval count, approved-but-not-
published count, campaigns nearing their deadline while still
unpublished).

**Part 5 -- dashboard surfacing.** Wired the whole arc into the
dashboard: `GET/POST /api/companies/:id/brand-profile`, `.../decisions`,
`.../brain`; `GET /api/marketing/campaigns`/`calendar`/`analytics`,
full campaign lifecycle POST routes; `POST
/api/executive/proposals/external` (the one `ActionProposalEngine`
method that didn't have a facade wrapper yet -- generic, not marketing-
specific, so the Publishing Queue and any future external action type
get a dashboard entry point for free). A new "Marketing Division"
frontend panel (Brand Profile, campaign planning, calendar, Company
Brain) follows every existing form/result/renderList convention.
Verified end to end against a live running server, not just the test
suite -- no browser available in this environment to click through the
actual UI (see `docs/NEXT_STEPS.md`), but every element id referenced
by the new frontend JS was confirmed present in the served HTML, and
the underlying API calls were verified directly over real HTTP.

500 -> 526 tests across all five parts, all passing throughout, one
commit per part.

No architectural redesign anywhere in this arc -- every new piece
(Campaign Engine, Content Generator, Analytics, dashboard routes)
follows an existing pattern from elsewhere in the codebase rather than
inventing a new one; the only genuinely new store is campaigns
themselves, and even that is an ordinary memory entry, not a new file
or schema.

## Phase 42 (Sales Division) -- parts 1-3

The operator reframed the objective from "build infrastructure" to
"build real departmental intelligence" and asked for the Marketing
Division to be used as the architectural reference for each remaining
Phase 35 package, starting with Sales. Same discipline: audit first,
reuse wherever possible, no fabricated capability.

**Part 1 -- real Lead + Opportunity/Pipeline engine.** New
`core/sales/leads.js`: leads as memory entries (same pattern
`core/marketing/campaigns.js` established), with `scoreLead()` computing
a fully deterministic, explainable 0-100 score -- every point traces to
a real, visible reason (contact completeness, real logged engagement
and its recency, confirmed BANT signals) -- never an LLM's guess, the
same rule-based-where-explainable principle `core/executive/planner.js`
already established for department assignment. New
`core/sales/opportunities.js`: Pipeline Stages, Contact Management, and
Follow-up Scheduling all on the same real opportunity entity (they
aren't separate concerns, they're one entity moving through a
pipeline), plus `forecast()` -- a real, deterministic weighted-pipeline
value (stage-probability table, correctly excluding closed deals).

**Part 2 -- real Proposal Generator + Analytics + real tool.** New
`core/sales/proposalGenerator.js`, following
`core/marketing/contentGenerator.js`'s exact pattern (routed through
`core/intelligence.think()`, incorporating the company's real Brand
Profile). New `core/sales/analytics.js`: win/loss analytics (win rate,
average won value, a genuine loss-reason breakdown -- every closed_lost
opportunity requires a real reason) plus execution telemetry reused
from `core/learning` for free. `packages/sales`'s one skeleton tool
(`sales.pipeline.review`) given a real implementation, its permission
fixed from an invented `"read"` string to the real `"read_memory"`
vocabulary, and every agent prompt replaced with a real one.

**A real, found-live circular-require bug, and its proactive fix
elsewhere.** Verifying the new tool through the actual Tool Registry
(not just requiring the analytics module directly) surfaced a genuine
bug: `core/sales/analytics.js`'s top-level `require("../learning")`
transitively reaches `core/brain/providers/claude.js`, which requires
`core/tools/index.js` at ITS OWN top level (to offer the tool registry
to Claude's tool-use loop) -- when `core/tools/index.js`'s own
`loadTools()` is what triggered the whole chain in the first place
(exactly what happens the first time any package tool handler pulls in
this dependency graph), that nested require lands on an incompletely-
initialized module, silently corrupting whichever tool was mid-load.
Fixed by moving the `../learning` require inside `executionHealth()`,
the same lazy-require convention this codebase already uses for this
exact class of problem (see `core/executive/actionProposal.js`'s
`installer.js` require for the canonical precedent). Applied the
identical fix proactively to `core/marketing/analytics.js`, which had
the same latent landmine -- masked only because no marketing tool
handler happened to import it during tool loading yet.

**Part 3 -- Sales Health + dashboard surfacing.** `dailyBriefing.js`
gained `salesHealth()` (same per-company rollup pattern as
`campaignHealth()`: open lead/opportunity counts, the real weighted
forecast, overdue follow-up count). Full dashboard wiring -- the
complete lead and opportunity lifecycles, a new "Sales Division"
frontend panel -- verified end to end against a live running server.

Result: `core/capabilities/health.js` now reports sales as genuinely
`"active"` -- the second of six Phase 35 packages to cross that line,
after marketing.

542 -> 552 tests across all three parts, all passing throughout, one
commit per part. No architectural redesign -- every new piece follows
an existing pattern from Marketing or elsewhere in the codebase.

## Phase 43 (Finance Division) -- parts 1-3

The operator's third package, per the standing Phase 42+ roadmap.
Deliberately does NOT build a new ledger --
`core/executive/companyManager.js`'s `recordFinance()`/
`financialSummary()` already IS the real ledger (Phase 2, "bookkeeping"
was never actually missing); this phase reuses it directly and builds
what's genuinely new on top. No banking connection anywhere -- the
operator's explicit instruction -- every number traces back to what's
actually been recorded in VERONICA.

**Part 1 -- real Budgets + Invoices + Subscriptions.**
`recordFinance()` gained an optional `category` field (additive,
backward-compatible) specifically so Budget Planning could compare real
spend per category against a limit. New `core/finance/budgets.js`:
`budgetStatus()` compares a budget's limit against real expense entries
already in the ledger, filtered by category and a real calendar-month
period -- not a parallel expense store. New `core/finance/invoices.js`:
the Invoice model, with "overdue" derived at read time from a real due
date on a "sent" invoice (never a stored flag that could go stale), and
`accountsReceivable()` summing genuinely outstanding sent-but-unpaid
invoices. New `core/finance/subscriptions.js`: Subscription tracking --
what makes real MRR/ARR possible, since recurring revenue is a
genuinely different concept from a one-time ledger transaction.

**Part 2 -- Cash-flow, Runway, Forecasting, KPIs + real tool.** New
`core/finance/reports.js`: `cashFlow()` (real monthly revenue/expense/
net grouped from the actual ledger), `runway()` (cash-on-hand divided
by recent average burn -- reports a real `"profitable"` status with a
null `runwayMonths` rather than a fabricated number when the recent
trend genuinely isn't burning cash), `forecast()` (a real, deterministic
linear extrapolation of the recent net trend -- explainable arithmetic,
not ML/LLM), and `kpis()` (combines the real ledger summary, real
MRR/ARR, real accounts receivable, and real runway in one call).
`packages/finance`'s one skeleton tool (`finance.report.generate`) given
a real implementation, its permission fixed from an invented `"read"`
string to the real `"read_memory"` vocabulary, and every agent prompt
replaced with a real one (Bookkeeper, FinancialAnalyst,
ComplianceOfficer).

**Part 3 -- Finance Health + dashboard surfacing.** `dailyBriefing.js`
gained `financeHealth()` (same per-company rollup pattern: cash on
hand, runway status, over-budget count, overdue invoice count). Full
dashboard wiring -- budgets/invoices/subscriptions lifecycle routes, a
new "Finance Division" frontend panel -- verified end to end against a
live running server.

Result: `core/capabilities/health.js` now reports finance as genuinely
`"active"` -- the third of six Phase 35 packages to cross that line.

566 -> 576 tests across all three parts, all passing throughout, one
commit per part. No architectural redesign -- every new piece follows
an existing pattern from Marketing/Sales or elsewhere in the codebase;
the only genuinely new stores are budgets, invoices, and subscriptions
themselves.

## Phase 44 (Research Division) -- parts 1-3

The fourth Phase 35 package, per the standing roadmap. Audited
`core/research/engine.js` (Phase 29) first -- it already does real
document fetching (through the allowlisted HTTP client), real LLM-based
knowledge extraction with citation tracking, and real memory-backed
storage. The genuine gap was grouping multiple citations into one
themed research effort with ranking and a synthesized summary -- not a
second research engine.

**Part 1 -- real Research Mission Engine.** New
`core/research/missions.js`: `addCitation()` reuses
`ResearchEngine.research()` wholesale (fetch a real URL, extract via
LLM, store with citation) -- not a duplicate implementation.
"Competitor research"/"Industry reports"/"Technology reports"/"Market
trend reports" are all the same mechanism with a different `type` label
on a mission, not four separate report generators. `rankSources()` is
real and deterministic: orders a mission's citations by their real,
already-computed extraction confidence, never a fabricated credibility
score. `generateExecutiveSummary()` follows the established Content
Generator/Proposal Generator pattern (`core/intelligence.think()`),
synthesizing across everything a mission has actually collected.
Missions are optionally company-scoped, not required -- research isn't
inherently tied to one company.

**Part 2 -- real tool + agent prompts, the same circular-require bug a
third time.** `packages/research-department`'s one skeleton tool
(`research.dept.synthesize`) given a real implementation, permission
fixed to `"read_memory"`, every agent prompt replaced with a real one
(ResearchAgent collects, AnalysisAgent ranks/synthesizes). Building it
surfaced the SAME circular-require bug class found in Phase 42 (Sales)
a third time: both `core/research/missions.js` and
`core/research/engine.js` (Phase 29, predating this discovery)
top-level-required `core/intelligence`, whose chain reaches
`core/tools/index.js`. Fixed the same way in both files. Verified with
a real, live end-to-end call through the real Tool Registry against the
actual Claude connection -- it correctly identified test-fixture content
as placeholder data rather than fabricating a finding.

**Part 3 -- Research Status + dashboard surfacing.** `dailyBriefing.js`
gained `researchStatus()` -- unlike every other division's health
rollup, this is a single system-wide summary (total/in-progress/
completed missions, average source confidence), not a per-company list,
matching missions' own optional company-scoping. Full dashboard wiring
-- create/list/complete a mission, add a real citation, view ranked
sources, generate a real executive summary -- and a new frontend panel.
Found and fixed a real HTML id collision while building it
("mission-objective" already used by the pre-existing Phase 31 Mission
Engine panel -- duplicate ids are invalid HTML and
`document.getElementById()` would have silently bound both forms to
whichever element came first) -- renamed to
"research-mission-objective". Also found, but left as out-of-scope pre-
existing debt: a "system-health" id duplicate that predates this
session (see `docs/NEXT_STEPS.md`).

Result: `core/capabilities/health.js` now reports research-department
as genuinely `"active"` -- the fourth of six Phase 35 packages to cross
that line.

576 -> 587 tests across all three parts, all passing throughout, one
commit per part. No architectural redesign -- the only genuinely new
store is missions themselves; the citation/extraction/storage pipeline
was reused wholesale from Phase 29.

## Phase 45 (Trading Research Division) -- parts 1-3

The fifth Phase 35 package. Explicitly research/analysis only
throughout -- no real trade execution anywhere in this codebase; real
trade execution remains approval-gated and unimplemented until a real
broker credential exists, per the operator's explicit instruction.

**Part 1 -- real Portfolio + Strategy Storage + Paper Trading Engine/
Journal.** New `core/trading/portfolio.js`: Portfolio model, Watchlists,
Position Sizing. `applyTrade()` computes a real, correct weighted-
average cost basis across multiple buys, rejects a buy costing more
than available cash and a sell exceeding the held position.
`portfolioValue()` computes real market value/unrealized P&L from
caller-supplied current prices -- no market data feed exists, so this
is real arithmetic on real positions against whatever prices are
actually given, honestly reporting `null` (not a fabricated number) for
an unsupplied symbol. `calculatePositionSize()` applies the real,
standard "percent risk" formula. New `core/trading/strategies.js`:
Strategy storage. New `core/trading/paperTrading.js`: `executePaperTrade()`
applies a trade to the real portfolio FIRST and only records a journal
entry for a trade that genuinely happened.

**Part 2 -- real Backtesting + Risk/Performance Analytics + real
tool.** New `core/trading/backtest.js`: a real, deterministic backtest
of a moving-average crossover strategy (the one strategy shape this
engine can actually evaluate -- not a generic strategy-rule
interpreter) against a real, caller-supplied historical price series --
no market data connector exists. Test expectations were hand-verified
against the actual crossover math. New `core/trading/analytics.js`:
`journalPerformance()` computes real realized P&L via FIFO lot
matching -- deliberately a DIFFERENT cost-basis method than
`portfolio.js`'s average-cost position tracking, both real and
legitimate, answering two different real questions (ongoing unrealized
P&L vs. realized P&L attribution per sell). Written with
`core/learning` required lazily from the start, having now seen the
circular-require bug class three times already (Sales, Marketing,
Research). `packages/trading-research`'s skeleton tool given a real
implementation, permission fixed to `"read_memory"`, every agent prompt
replaced with a real one. Found a stale test along the way:
`tests/dashboard.test.js` hardcoded trading-research as the "still
awaiting integration" example -- updated to business-operations, the
one package remaining.

**Part 3 -- Trading Status + dashboard surfacing.** `dailyBriefing.js`
gained `tradingStatus()` (system-wide, like `researchStatus()`: total
portfolios, total realized P&L, open positions). Full dashboard wiring
-- portfolios, paper trades, journal, review, position sizing,
watchlists, strategies, backtest -- and a new frontend panel explicitly
labeled research/analysis only. Checked for (and found none of) the
HTML id-collision class of bug found in Phase 44's Research panel.

Result: `core/capabilities/health.js` now reports trading-research as
genuinely `"active"` -- the fifth of six Phase 35 packages to cross
that line. Only business-operations remains.

587 -> 616 tests across three parts, all passing throughout, one
commit per part. No architectural redesign -- the only genuinely new
stores are portfolios, strategies, watchlists, and the paper trade
journal.

## Phase 46 (Business Operations Division) -- parts 1-3, completes all six Phase 35 packages

The sixth and final Phase 35 package. Audited existing architecture
first and found two of the spec's asks already fully real: Blocker
Management (`core/executive/blockerDetection.js`, Phase 11) and Weekly
Operating Reviews (`core/executive/weeklyReport.js`, Phase 11) -- both
reused directly rather than duplicated.

**Part 1 -- real SOP/Workflow Library + KPI Tracking + Meeting
Summaries.** New `core/operations/sops.js`: "SOP library" and "Workflow
documentation" are the same real entity (an SOP IS a documented
workflow), not two stores. `updateSteps()` revises the document in
place with a real version counter -- an SOP is a single evolving
document, unlike other divisions' append-only history logs. New
`core/operations/kpis.js`: real `direction` field
(higher_is_better/lower_is_better) -- defaulting to one direction
would silently mis-grade half of all real KPIs. `kpiStatus()` honestly
reports a null `onTrack` before any actual value has been recorded.
New `core/operations/meetings.js`: structured action items
(text/owner/done), distinct from `companyManager.js`'s
`logCommunication()` (free-text + channel only, no place for
attendees/decisions/trackable items).

**Part 2 -- Department Scorecards + Process Analysis + real tool.** New
`core/operations/scorecard.js`: composes EXISTING systems rather than
duplicating them. `departmentScorecard()` reuses
`OrganizationOverview.departmentHealth()` and
`BlockerDetector.detect()` wholesale, adding only the two genuinely new
pieces (real KPIs, real SOP count). `analyzeProcess()` combines a real
SOP with its department's real execution health (reused from
`core/learning`) and related KPIs. Every cross-subsystem require here
is lazy, written that way from the start -- the fourth time this
codebase has needed the same circular-require workaround.
`packages/business-operations`'s skeleton tool given a real
implementation, permission fixed to `"read_memory"`, every agent prompt
replaced with a real one.

**Result: all six Phase 35 production packages are now genuinely
`"active"`** in `core/capabilities/health.js` -- marketing, sales,
finance, research-department, trading-research, business-operations.
None remain skeleton-tooled. Added an exhaustive test asserting this
directly, and fixed a now-doubly-stale assertion in
`tests/dashboard.test.js` (previously updated to point at
business-operations as the "still awaiting" example -- now updated to
reflect that none remain).

**Part 3 -- Operations Status + dashboard surfacing.** `dailyBriefing.js`
gained `operationsStatus()` (system-wide: total SOPs/KPIs, off-track
KPI count, open action-item count). Full dashboard wiring -- SOP/KPI/
meeting lifecycle, process analysis, department scorecard -- and a new
frontend panel.

616 -> 641 tests across three parts, all passing throughout, one
commit per part. This closes the entire Phase 41-46 arc: six Phase 35
packages that were "installed but skeleton" are now six genuinely
production-ready organizational divisions, each with real domain
engines, real tools, real agent prompts, and real dashboard surfacing
-- reusing existing architecture throughout (the ledger, the research
engine, blocker detection, weekly reporting, the approval pipeline)
rather than duplicating any of it.

## Phase 47 -- Organizational Learning: close the recommendation feedback loop

With all six Divisions production-ready, work shifted from "make one
department real" to organization-wide capabilities. First: close the
one gap `core/learning/adaptiveInsights.js`'s own Phase 38 header
comment explicitly named as real future work -- "feeding this data back
into HOW future recommendations get generated."

`core/executive/executiveRecommendations.js`'s `generate()` now calls a
new `applyAdaptiveInsights()` that annotates every recommendation with
two real, already-persisted signals: its kind's real acceptance rate
(from every past `ActionProposalEngine` proposal's own status
transition) and how many times this exact kind+subject has recurred
across past runs. Genuinely recurring issues are resurfaced more
prominently (sorted to the front). Deliberately does NOT silently drop
or hide a low-acceptance recommendation -- that would hide a real,
current issue from the operator, the opposite of "explainable"; the
annotation is honest and visible, acting on it stays the operator's
call.

Most of Phase 47's other asks (record successes/failures/lessons,
generate improvements) were already real before this change:
campaigns'/opportunities' `lessonsLearned`, `core/learning/log.js`'s
per-call telemetry, `core/learning/engine.js`'s LLM-synthesized
recommendations, `core/system/selfImprovement.js`'s debt tracking. This
closes the one genuine, clearly-scoped gap those didn't already cover.

Tested entirely against real, persisted state -- a real approved
proposal, three real recommendation runs -- no mocked adaptive-insights
data.

641 -> 644 tests, all passing.
