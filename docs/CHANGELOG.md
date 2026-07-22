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
- **Recommended next phase:** wire installed capability packages into
  the live agent/tool/department loaders (the real next increment for
  Phase 20, above); a dedicated visual/browser-tested dashboard pass
  once a browser-capable environment is available; a GitHub webhook
  receiver (needs public HTTPS reachability); extending Discord's
  approval-gated posting to the real bot's channels instead of only the
  webhook.
