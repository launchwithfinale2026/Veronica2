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

## Totals

- 12 commits across Phases 10-12 combined with the earlier 9, each with
  `npm test` green before committing.
- Test count: 210 -> 222 (end of the original 9-phase pass) -> 240 (end
  of Phase 10) -> 267 (end of Phase 11) -> 291 (end of Phase 12), all
  passing throughout.
- No existing test broken; no existing public API removed or changed
  incompatibly.

## Remaining limitations / future work

- **Calendar/Email/Cloud storage connectors** are interface-only --
  real implementations need a concrete provider decision (see each
  file's header comment for the tradeoffs).
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
- **No visual/browser-based UI testing** was performed for the new
  dashboard widgets in this environment -- endpoint- and syntax-level
  verification only.
- **Recommended next phase:** wiring the orchestrator's `pursue()` into
  a true "one-shot user objective" entry point that also chooses
  whether to run the resulting tasks immediately vs. waiting for the
  autonomous loop, plus picking a concrete provider for at least one of
  the placeholder integrations (Discord and GitHub are already real end
  to end and could serve as a template).
