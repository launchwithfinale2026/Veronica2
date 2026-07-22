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

## Totals

- 9 commits, one per logical milestone, each with `npm test` green
  before committing.
- Test count: 210 (Executive Core + autonomous loop + memory + company
  isolation + integrations + device capabilities) growing to 222 by the
  end of this pass, all passing throughout.
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
