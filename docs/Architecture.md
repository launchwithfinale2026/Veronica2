# VERONICA — Architecture

This document is the authoritative source for structural decisions,
especially where more than one directory in the repo appears to implement
the same concept. See `docs/SYSTEM_AUDIT.md` for how these forks were
found. Update this file whenever a structural decision like the ones below
gets made or changed.

---

## Departments: `registry/departments.json` vs `departments/`

**Decision:** `registry/departments.json` is the authoritative index.
`departments/<name>/` is the implementation location for that
department's logic. Built out in Phase 5 (Agent Network) on 2026-07-21.

- `registry/departments.json` is loaded at boot (via
  `core/departments/loader.js`, called from `core/interface/terminal.js`,
  the real entry point) and is the single source of truth for which
  departments exist and their status — all 9 are now `"active"`.
- `departments/<name>/manager.js` is a thin factory over the shared
  `core/departments/base.js` `DepartmentManager` class — each department
  owns its own file as an extension point (custom behavior can be added
  per department later) without duplicating the base logic 9 times.
- `departments/<name>/identity.json` is populated (id, name, domain,
  status, primaryAgent, role, capabilities), derived from
  `registry/agents.json` + `registry/departments.json`.
- `departments/<name>/logs/` now actually receives `activity.log` entries
  from `DepartmentManager.run()`. `departments/<name>/agents/`,
  `.../memory/`, `.../reports/`, `.../tools/` are still reserved/empty —
  see the memory-access and tools notes below.
- Department **memory access** does not use `departments/<name>/memory/`
  as a separate store — `DepartmentManager.remember()`/`recall()` tag
  entries in the shared `core/memory` store with the department id
  instead, consistent with the memory-fork decision below. The
  `departments/<name>/memory/` directories stay empty by design.
- Department **tools** (`DepartmentManager.tools`) reflects the real
  registered tool list from `core/tools` as of Phase 6 (2026-07-21) — see
  the Tool System section below. `departments/<name>/tools/` (the
  per-department subdirectory) stays empty; tools are a shared, permission-
  gated system, not a per-department resource.
- `departments/<name>/reports/` and `departments/<name>/agents/` remain
  unused — no spec yet for what a "report" is or why a department would
  need its own agents subdirectory distinct from the shared agent
  roster. Not built speculatively; revisit if a real need appears.

Do not delete `departments/` — it now holds real implementation, not
scaffolding. Do not add a second competing "department" concept elsewhere.

---

## Agent roster vs. protocol document

**Decision:** the live roster in `registry/agents.json` — METIS, DAEDALUS,
HELIOS, IRIS, PLUTUS, NIKE, SELENE, ASTREA, ATLAS — is authoritative going
forward. `CLAUDE_AUTONOMOUS_DEVELOPMENT_PROTOCOL.md`'s Phase 5 section
(METIS/ATHENA/HEPHAESTUS/HERMES/PLUTUS as individually named agents) was an
earlier draft naming; ATHENA/HEPHAESTUS/HERMES were repurposed as
department names instead once the department concept was introduced. The
protocol document itself is not being edited to match (it's an external
directive, not project source), but any future work should treat this file
— not that section of the protocol — as the ground truth for "which agents
exist."

---

## Memory: `core/memory/` vs. root `memory/`

**Decision:** `core/memory/` is the current, live memory *engine* (code).
Root `memory/{archive,graph,vault,vector}` is reserved *data* structure for
Memory Engine V2 (Phase 3) and the Knowledge Graph (Phase 4) — it is not
built yet, and nothing should write to it until those phases land.

- Today: `core/memory/store.js` reads/writes `core/memory/database.json`
  as a flat array of `{content, timestamp}` entries. `core/memory/context.js`
  does naive keyword-overlap retrieval over that array. This is what
  `core/interface/terminal.js`'s `remember` / `memory.view` / `memory.search`
  actually use, and what `core/knowledge/index.js`'s `KnowledgeGraph`
  reads/writes (`core/knowledge/graph.json`).
- Future (Phase 3/4): memory objects gain
  `{id, type, content, importance, created, updated, relationships, tags, source}`
  per the protocol spec. When that lands, the natural split is:
  - `memory/vault/` — the structured memory objects themselves (replacing
    the flat `database.json`)
  - `memory/graph/` — entity/relationship data (replacing
    `core/knowledge/graph.json`)
  - `memory/vector/` — embeddings, once semantic search replaces the
    current keyword-overlap search
  - `memory/archive/` — memories aged out of active retrieval
  - `core/memory/` and `core/knowledge/` remain the *code* that reads and
    writes those locations; they do not disappear, only their storage
    target moves.
- Until that migration happens, root `memory/` stays empty. Do not
  duplicate storage by writing to both locations.

---

## Backups

Per protocol Rule 2 ("preserve the system... create backups before
modifying important files"), this project uses **per-file** backups
(`file.js` → `backups/<context>/file.js.save` or `.backup.js`), not
whole-directory snapshot copies. Two whole-directory snapshots
(`core_backup_v1/`, `registry_backup_v1/`) existed from before this
convention was applied consistently; both were archived under `backups/`
on 2026-07-21 (see `docs/SYSTEM_AUDIT.md` §7) rather than deleted, since no
git history existed yet to recover them from if that were wrong.

---

## Tool System & permission enforcement

**Decision:** tools are a single shared, permission-gated registry
(`core/tools`) — not a per-department or per-agent resource. Built out in
Phase 6 on 2026-07-21.

- `identity/roles.json` + `identity/permissions.json` are now actually
  enforced, via `core/identity/index.js`. Before this, they were populated
  data nobody read. While wiring enforcement up, found that
  `roles.json`'s permission names didn't match `permissions.json`'s
  vocabulary at all (e.g. `memory_access`, `system_boot` vs. the real
  `read_memory`, `write_memory`, ...) — fixed to use the real vocabulary.
  See `docs/SYSTEM_AUDIT.md` §5 for the full before/after.
- Least-privilege role progression: `agent` (read_memory, write_memory,
  execute_tools) < `department_manager` (+ manage_agents, create_reports)
  < `executive` (+ communicate — full set). `core/interface/terminal.js`
  runs tool calls as `executive` (it represents a trusted human operator);
  `DepartmentManager.useTool()` runs as `department_manager`.
- `registry/tools.json` declares each tool's identity (id, description,
  required permission); `core/tools/handlers/*.js` supplies the actual
  behavior, joined by id — same split as `registry/agents.json` +
  `core/agents/prompts/*.js`.
- The filesystem tool is sandboxed to `data/workspace/`, not given real
  filesystem access — every path is resolved against that root and
  rejected if it would escape it (covers both `../` traversal and
  absolute-path escapes). This was a deliberate scope reduction from the
  protocol's literal "filesystem" bullet: unrestricted read/write from
  agent-controlled input is a real vulnerability, not just an
  implementation detail.
- Not built: tools wrapping external APIs, databases, or web access (no
  concrete external system exists yet to wrap — would be speculative), and
  an agentic tool-use loop where the brain autonomously invokes tools
  mid-conversation. The latter is real, scoped future work — it changes
  the brain/intelligence request flow and is the most security-sensitive
  piece here (agent-initiated action), so it wasn't bolted on without its
  own design pass.

---

## Dashboard stack

**Decision:** plain Node `http` backend + framework-free static HTML/CSS/JS
frontend, no new dependencies. Built in Phase 7 on 2026-07-21.

This is a personal, single-user, local system — there was no concrete need
yet for a web framework (Express etc.), a frontend framework/build step
(React etc.), a database, or auth beyond what the OS-level "who can reach
localhost:4000" already provides. All of those are real, well-scoped
additions if/when an actual need shows up (e.g. multi-device access
becomes real in Phase 8, or the dashboard needs to become the primary
interface instead of a read-only view). Adding them speculatively now
would be exactly the kind of premature complexity the project's own
`CLAUDE.md`-equivalent guidance warns against. The backend
(`dashboard/backend/server.js`) is a pure façade — it holds no logic of
its own, only routes to `core/*` modules that already exist — so swapping
the HTTP layer later (Express, Fastify, whatever) would not require
touching any business logic.

`server.listen()` binds to `127.0.0.1` by default (Phase 8, 2026-07-21;
was accidentally all-interfaces before, since Node defaults to that when
no host is given to `.listen()`). Multi-device reach is opt-in via
`DASHBOARD_HOST=0.0.0.0`, not the default, since the dashboard exposes
memory/knowledge contents and, once `API_TOKEN` is set, several write
endpoints (see "Dashboard write actions" below).

---

## Device identity & synchronization (Phase 8)

**Decision:** device identity is a separate axis from user/agent identity
(`core/identity`) — "which machine is this" vs. "who is acting." Sync is
an export/import/merge mechanism transported over the existing dashboard
HTTP server, not a new network protocol or always-on daemon. Built
2026-07-21.

- `core/device/device.local.json` is machine-specific and gitignored,
  generated fresh on each machine VERONICA runs on — same treatment as
  `.env`. It should never be committed or copied between machines; each
  device gets its own.
- `registry/devices.json` defines device roles (`laptop`/`desktop`/
  `phone`/`server`) with permissions drawn from `identity/permissions.json`'s
  vocabulary — a new `sync` permission was added there rather than
  starting a second, separate permission vocabulary for devices (that
  would have reintroduced the exact drift bug fixed in Phase 6).
- Sync is deliberately NOT a live network service: `core/device/sync.js`
  produces/consumes a plain JSON snapshot. The dashboard's
  `GET /api/sync/export` / `POST /api/sync/import` are the transport —
  reusing Phase 7's HTTP server rather than building a second one. Two
  real devices sync by one fetching the other's export and POSTing it to
  its own import.
- Conflict resolution is last-write-wins on `updated` (memory) / name-based
  idempotency (knowledge) — the simplest correct strategy, not a
  placeholder. Three-way merge or vector clocks would be premature without
  a real multi-device usage pattern to design against.
- Sync fails closed: disabled (`501`) unless the auth token env var is
  set, and requires a matching `Authorization: Bearer` header otherwise
  (`403`). This is a mutating endpoint pair, so it doesn't get the same
  "open by default" treatment as the Phase 7 read-only endpoints. That
  token was `SYNC_TOKEN` originally; renamed to `API_TOKEN` in the
  "Dashboard write actions" section below once it started gating other
  write endpoints too, so one token now covers all of them.
- Not built: device discovery/pairing (no second physical device to
  design or test this against), an always-on sync daemon (export/import
  is triggered, not automatic/scheduled), and any conflict resolution
  beyond last-write-wins. All three are real future work, not gaps in
  what was asked for this pass.

---

## Boot path: `core/interface/terminal.js` vs. `core/executive/index.js`

**Resolved 2026-07-21.** `core/interface/terminal.js` is the sole entry
point — it's what `package.json`'s `main`/`start` point at, and it's what
actually runs on `npm start`.

`core/executive/index.js` was a second, redundant boot sequence that
independently loaded identity/departments/agents, printed its own status
banner, then `require`d `terminal.js` at the very end (which loaded agents
a second time). Nothing ever called it except by running
`node core/executive/index.js` directly — confirmed via a repo-wide grep
before removing it. Retired: archived to
`backups/executive_retirement_2026-07-21/` (per Rule 2, not deleted).
Its one genuinely useful piece — loading `core/veronica/identity.json`
and publishing a `system.ready` bus event on boot — was folded into
`terminal.js` directly rather than lost; `system.status` (both the
terminal command and the dashboard's `/api/status`) now reports the real
identity name/mission instead of a hardcoded string.

---

## Agentic tool-use loop

**Decision:** the tool-use loop lives entirely inside `ClaudeProvider`
(`core/brain/providers/claude.js`), not in a new provider-agnostic layer.
Built 2026-07-22.

Only Claude is a real, tested provider (`local` is a canned stub,
`openai` has never been exercised against a live key in this
environment) — changing the shared `generate(prompt) -> {response,
provider}` contract that all three providers implement to be
tool-use-aware would have added complexity to two providers that can't
use it yet, for a capability that's only verified on the third. Instead:
`generate(prompt, options)` takes an optional `options.useTools` flag;
when set, `ClaudeProvider` runs its own multi-turn loop internally
(`generateWithTools()`) and still returns the same `{response, provider}`
shape (with an added `toolCalls` field callers can ignore if they don't
care). `local`/`openai`'s `generate(prompt)` signatures don't need to
change — JS silently ignores the extra `options` argument they don't
accept.

- Tool names for Claude's API can't contain dots (`^[a-zA-Z0-9_-]{1,64}$`)
  but tool ids do (`memory.remember`). `core/tools/anthropicSchema.js`
  builds an explicit bidirectional id↔name map from the live tool
  registry on every call, rather than a blind `.replace(/\./g, "_")` +
  reverse — safe even if a future tool id contains an underscore.
- `Intelligence.think()` defaults every agent reasoning call to
  `{useTools: true, role: "agent"}` — real tool access, agent-level
  permissions only, for both the terminal's `ask` command (via
  `core/router`) and department-driven tasks (via `DepartmentManager`,
  see below). This wasn't a per-caller opt-in decision; Phase 6 built the
  whole permission/sandbox system specifically so agent-initiated tool
  calls could be trusted by default within their role's bounds.
- Turn cap (`maxTurns`, default 5) is a hard stop against a runaway loop,
  not expected to be hit in normal use.
- `ClaudeProvider`'s Anthropic client is now constructor-injectable
  specifically so tests can script a fake client's responses instead of
  making real, paid API calls for every test run. One real call was made
  manually to verify the loop end to end against the live API (see
  `docs/SYSTEM_AUDIT.md` §9) — that's a deliberate one-time check, not
  something to repeat on every test run.

**Found while wiring this in**: `DepartmentManager.run()` had never
actually called the brain — it called `agent.process()`
(`core/agents/base.js`), a method that returns a hardcoded canned string.
Every department-driven task had been fake since Phase 5; the Phase 5
tests didn't catch it because they mocked `agent.process()` directly
rather than exercising real reasoning. Fixed: `run()` now goes through
`core/intelligence` (a real `IntelligenceEngine` instance held on the
manager, same class `core/router` uses for `ask`), preserving the
existing flat `{agent, response}` return shape callers already depend on,
with a new `.thought` field carrying the full reasoning trace. Tests
updated to mock the brain provider (matching `tests/brain-provider.test.js`'s
pattern) instead of the now-defunct `agent.process()` mock.
`Agent.process()` itself wasn't deleted — it's still there as an
available offline/canned-response method, just no longer on the live
path.

---

## Dashboard write actions

**Decision:** one shared token (`API_TOKEN`) gates every mutating
dashboard endpoint, not a separate token per feature. Built 2026-07-22.

`SYNC_TOKEN` (Phase 8) was renamed to `API_TOKEN` once it needed to gate
more than just sync — `POST /api/memory`, `POST /api/tools/:id/run`, and
`POST /api/departments/:id/run` all reuse the exact same `checkApiAuth()`
check sync already had (fails closed if unset, `403` on a wrong/missing
bearer token). No back-compat alias for the old name: nothing external
depended on it yet, and the project avoids compatibility shims where
there's nothing real to stay compatible with (see `CLAUDE.md`-equivalent
guidance against speculative back-compat).

- `POST /api/departments/:id/run` is the one endpoint here that makes a
  real, potentially costly network call (Claude, with tool use) — same
  caution as the CLI's `ask` command, just reachable over HTTP now. It's
  deliberately **not** covered by a full-success-path automated test (see
  `docs/SYSTEM_AUDIT.md` §9) to avoid triggering a real paid call on
  every test run; auth/validation/routing are tested, the underlying
  `run()` logic is tested with a mocked brain, and the full real path was
  verified once manually.
- The frontend's API token field is stored in the browser's
  `localStorage` only — never sent anywhere except as the `Authorization`
  header on these specific requests. This is a personal, single-user
  local dashboard (see "Dashboard stack" above); a real multi-user
  credential system would be a different, larger scope than what was
  asked for here.

---

## Executive Planner (`core/executive`)

**Decision:** the planner is deliberately rule-based, not LLM-backed, and
projects are stored as ordinary memory entries, not a second store. Built
2026-07-21 (Intelligence Layer milestone, Phase 1 of 18).

- `core/executive/index.js` was previously just a retired boot-path stub
  (see "Boot path" section above) — this is the first real code living in
  that directory.
- Department assignment, effort estimate, and priority score are all
  synchronous keyword/heuristic logic (`core/executive/planner.js`), not a
  brain/LLM call: a plan needs to be cheap, deterministic, and callable
  without network access on every `plan()`, and every test needs to run
  without mocking a provider. This is a smaller scope than the milestone's
  literal "produce execution plans" bullet — turning a goal into concrete
  *steps*/subtasks is a genuinely LLM-shaped problem, left for a future
  Goal Decomposition Engine to build on top of this planner rather than
  bolted on speculatively here.
- Projects are `memory.remember()` entries (`type: "goals"`, tagged
  `executive-project` + the assigned department id), not a parallel
  `core/executive/projects.json` store — consistent with the existing rule
  against duplicating the memory system (see "Memory" section above). The
  roadmap (`roadmap()`) is a derived view over `memory.filter()`, recomputed
  on read, not separately maintained state.
- This required one additive change to the Phase 3 memory schema:
  `core/memory/store.js` entries now carry an optional `metadata` object
  (defaults to `{}`), used here for `{description, deadline, deadlineStatus,
  effort, priority, status}`. Existing readers ignore the new field;
  existing entries (including legacy-migrated ones) get `metadata: {}`.
  This is the same kind of generic extensibility `tags`/`relationships`
  already provided — not a new parallel schema.
- Each planned project also gets a `project`-type knowledge graph entity,
  an `assignedTo` relationship to its department entity, and a `dependsOn`
  relationship per validated dependency — department entities are keyed by
  registry id (e.g. `"athena"`), matching `core/knowledge/seed.js`'s
  existing convention, not display name.
- Dependencies (`goal.dependencies`, an array of project ids) are validated
  against the current roadmap at `plan()` time — an unknown id throws
  rather than silently being dropped or stored unchecked.
- Exposed the same way every other subsystem is: three tools
  (`executive.plan` — `manage_agents`, `executive.roadmap` /
  `executive.deadlines` — `read_memory`) registered in
  `registry/tools.json` + `core/tools/handlers/executive.js`; terminal
  commands (`executive.plan`/`.roadmap`/`.deadlines`); read-only dashboard
  routes (`GET /api/executive/roadmap`, `GET /api/executive/deadlines`) and
  one write route (`POST /api/executive/plan`, gated by `API_TOKEN` like
  every other write endpoint). Also the first real entry in
  `registry/services.json`, which existed but was empty/unreferenced until
  now — establishes that file as the services registry future subsystems
  (Project Manager, Company Manager, ...) should register themselves in
  too, rather than inventing a second registry file.
- Not built: mutable project status transitions (`planned` → `in_progress`
  → `completed`) and persistent progress/timeline/owners tracking — that's
  the milestone's Phase 3 (Project Manager), a distinct concern from
  scheduling/prioritizing goals. `toProject()`'s `status` field is always
  `"planned"` today; wiring real status updates through belongs with that
  phase, not bolted on speculatively here.

---

## Goal Decomposition Engine (`core/executive/decomposer.js`)

**Decision:** LLM-backed (unlike the planner), milestones/tasks are
first-class persisted entities, subtasks/deliverables are not. Built
2026-07-21 (Intelligence Layer milestone, Phase 2 of 18).

- This is the half of "produce execution plans" `ExecutivePlanner`
  deliberately deferred (see its section above): `GoalDecomposer.decompose
  (projectId)` takes a project already on the roadmap and asks the brain
  (via `core/intelligence`, `useTools: false` — this needs one clean JSON
  document back, not a multi-turn tool loop) to break it into milestones,
  each with tasks, each with subtasks/deliverables. The response is parsed
  as JSON (markdown code fences stripped first — models asked for "JSON
  only" still sometimes wrap it) and persisted.
- Milestones and tasks get the full treatment (memory entry + knowledge
  entity + department/priority/effort/dependencies/status), same as a
  Phase-1 project. Subtasks and deliverables do **not** — they're stored as
  structured data inside their owning task's `metadata` (`subtasks: [{title,
  status}]`, `deliverables: [string]`), not separate memory entries or
  graph nodes. Rationale: a subtask/deliverable isn't independently
  assigned to a department or prioritized against the rest of the roadmap —
  it's a checklist item / exit criterion of its task. Modeling all four
  levels as fully independent scheduled entities per the milestone spec's
  literal wording would have meant 4x the entities for every goal with no
  real scheduling use for the bottom two levels; revisit if a real need
  for independently-tracked subtasks appears.
- Department and priority are **inherited** from the parent project (a
  milestone/task doesn't get its own department-assignment or
  priority-scoring pass) — a project already belongs to one department;
  decomposing it into work items for that same department is the expected
  case, not a re-litigation of Phase 1's assignment. Effort is the one
  field computed bottom-up instead of inherited: each task gets its own
  estimate (explicit `estimatedHours` from the model, or
  `ExecutivePlanner.estimateEffort()` reused — exposed as `static
  sizeFromHours()` too, so the t-shirt-size thresholds live in one place),
  and a milestone's effort is the sum of its tasks'.
- Dependencies: the model can declare `dependsOnTitles` (referencing any
  earlier milestone/task title in the same decomposition, or the project
  itself); unresolvable titles are dropped rather than failing the whole
  decomposition — a missed dependency link is recoverable, an aborted
  decomposition over the model paraphrasing a title isn't.
- **Found while wiring this in**: making `executive.decompose` a tool
  (`core/tools/handlers/executive.js`) closed a real circular require loop
  — `core/tools` (via `handlers/executive.js`) → `core/executive` →
  `core/executive/decomposer.js` → `core/intelligence` → `core/brain` →
  `ClaudeProvider` → `core/tools` again. Node resolves a `require()` cycle
  by handing back whatever the in-progress module's `module.exports` is at
  that point in its load — which was still the default `{}`, so
  `GoalDecomposer`/`IntelligenceEngine`/`BrainProvider` all came back as
  "not a constructor" depending on which test file happened to trigger the
  cycle first. Fixed by making `core/tools/handlers/executive.js` require
  `../../executive` lazily inside each handler function instead of at
  module load time — by the time any tool is actually invoked, the normal
  (non-circular) load path has long finished and `require()` just returns
  the real cached singleton. No other handler module needs this (none of
  `memory`/`knowledge`/`filesystem`'s dependencies loop back through
  `core/tools`), so this is scoped to the one handler that does.
- Not built: decomposing a task further into its own sub-decomposition
  (recursive breakdown), and re-decomposing/updating an already-decomposed
  project. Both are real future work, not gaps in what was asked for this
  pass — the milestone spec describes one goal → one breakdown, not
  iterative refinement.

---

## Project Manager (`core/executive/projectManager.js`)

**Decision:** status/history is one generic mechanism shared by projects,
milestones, and tasks; progress is derived from decomposed tasks, not a
manually-set field. Built 2026-07-21 (Intelligence Layer milestone, Phase
3 of 18).

- This fills in exactly what `ExecutivePlanner`'s "Not built" note said it
  would: mutable status, progress, timeline/history, owners, artifacts —
  still no parallel store, every operation reads/writes the same memory
  entries `planner.js`/`decomposer.js` already create.
- Required the one other addition to `core/memory/store.js` this milestone
  needed: `update(id, changes)` — mutates an entry in place (shallow-merges
  `changes.metadata` onto the existing metadata rather than replacing it,
  so a status update doesn't have to resend the whole metadata object),
  bumping `updated`. Deliberately separate from `remember()` (creates) and
  `merge()` (sync upsert, last-write-wins by `updated`) — different
  concerns, not consolidated into one do-everything function.
- `updateStatus(id, status, note)` works on a project, milestone, or task
  id interchangeably — all three share the same `metadata.status`/
  `metadata.history` shape (milestones/tasks got `history: []` added in
  `decomposer.js` alongside their existing `status: "planned"` for
  exactly this). One method instead of three near-identical ones.
  `"completed"` is terminal — once set, nothing (including setting
  `"completed"` again) can change it further; every transition appends a
  `{from, to, note, timestamp}` entry rather than overwriting history.
- `progress(projectId)` is **derived**, not stored: percent of the
  project's decomposed tasks with `status: "completed"`. A project with no
  decomposition yet has no granular work to measure, so it falls back to a
  coarse reading of the project's own status (`planned` → 0,
  `in_progress` → 50, `completed` → 100) instead of always reporting 0 —
  consistent with the rest of this milestone's "derive from what's already
  there, don't ask for a second manually-maintained number" approach
  (`roadmap()`/`evaluateDeadlines()` work the same way).
- `owners` is resolved at `plan()` time (an `ExecutivePlanner.plan()`
  amendment, not a `ProjectManager` method): explicit `goal.owners` wins,
  otherwise every agent registered to the assigned department via
  `registry/agents.json` (today, one primary agent per department) owns it
  by default. No separate human/stakeholder identity system exists yet to
  assign a non-agent owner to — real future work if a project ever needs
  an owner who isn't one of VERONICA's own agents.
- `addArtifact()` links into the knowledge graph the same way everything
  else here does (a `produces` relationship from the project entity to a
  new `artifact`-type entity) — discoverable through
  `knowledge.retrieve()`, not just the project's own `artifacts` array.
- `getProject()` is the one place all of this comes together for the
  dashboard: base project fields + `progress` + `timeline`
  (`created`/`updated`/`deadline`/`history`) + `artifacts` + decomposed
  `milestones` (id/title/status only — full milestone/task detail isn't
  surfaced here, `executive.roadmap`-style entries for milestones/tasks
  themselves would be the natural next step if that's needed) +
  `knowledge.retrieve(project.title)`.
- Dashboard integration (explicitly required by the milestone spec for
  this phase, unlike the read-only façade treatment earlier phases got):
  a new "Executive" panel (`dashboard/frontend/index.html`) showing the
  live roadmap + deadline-risk counts + a project-id lookup that renders
  `getProject()`'s full JSON, plus four new forms in the existing
  "Actions" panel (plan a goal, decompose a project, update status, record
  an artifact) — all reusing the existing `authedFetch()`/`API_TOKEN`
  pattern, no new frontend infrastructure.
- Not built: milestone/task-level dashboard views (only project-level
  detail is surfaced today), and a UI for browsing a project's full
  knowledge-graph neighborhood beyond the raw JSON dump in "Project
  detail." Both are real future work if the JSON dump proves insufficient
  in practice, not gaps in what this pass asked for.

---

## Company Manager (`core/executive/companyManager.js`)

**Decision:** a company is the same kind of thing a project is (a memory
entry + metadata + knowledge entity), one structural level up, using a
memory *type* ("businesses") that already existed but was unused for
anything structured before this. Built 2026-07-21 (Intelligence Layer
milestone, Phase 4 of 18).

- The milestone spec's own framing — "isolated memory while still
  contributing to executive intelligence" — is exactly what tag-based
  scoping already gives departments (see "Departments" section above): a
  company's projects/communications are tagged `company:<id>` and
  filterable to just that company, while still living in the one shared
  memory store the rest of the system searches/reasons over. No per-company
  database, no new registry file — `registry/services.json` gained an
  `executive-planner` entry in Phase 1; companies don't get a parallel
  `registry/companies.json` for the same reason projects don't have one.
  `dashboard/frontend/index.html` already had a "Business" panel wired to
  `GET /api/memory?type=businesses` before this phase — showing raw,
  unstructured memories. That's the hook this phase builds on, not a new
  concept introduced from scratch.
- Field-by-field scope decisions for the milestone's "each company
  contains: projects, goals, employees, agents, documents, finances,
  relationships, knowledge, communications" list:
  - **projects/goals** — `ExecutivePlanner.plan()` gained an optional
    `goal.company` field (tags the project `company:<id>`, stores it in
    metadata); `roadmap()` gained an optional `{ company }` filter
    (backward compatible — existing zero-arg calls are unaffected).
    Deliberately **not** validated against the company registry at
    `plan()` time: doing so would make `ExecutivePlanner` depend on
    `CompanyManager`, which itself depends on `ExecutivePlanner` (to list
    a company's projects) — a circular dependency in the class graph, not
    just the `require()` graph this milestone already hit once in Phase 2.
    An unknown company id just means the project won't surface under that
    company's filtered view; recoverable, not worth the coupling.
  - **employees** — a plain list on the company (name + optional role),
    each also getting a `person`-type knowledge entity + `employedBy`
    relationship. No auth/login/identity for employees — they're records,
    not accounts.
  - **agents/departments** — a company records which of VERONICA's
    existing 9 departments staff it (validated against
    `registry/departments.json`, same check `assignDepartment()` already
    does), with a `staffedBy` knowledge relationship per department. No
    second agent roster — VERONICA has one shared set of agents/
    departments serving every company, consistent with this being one AI
    system operating multiple companies, not multiple separate AI
    installations.
  - **documents** — same treatment as `ProjectManager.addArtifact()`, one
    level up: a list on the company entry + a `produces` knowledge
    relationship per document.
  - **finances** — a minimal ledger (label/amount/type "revenue"|
    "expense"), not an accounting system: `recordFinance()` appends an
    entry, `financialSummary()` derives revenue/expense/net. No
    currencies, categories, or reconciliation — no concrete need for them
    yet, and building them speculatively would be exactly the premature
    complexity this project's guidance warns against.
  - **relationships** — go straight into the knowledge graph as an edge
    from the company entity (`addRelationship({to, type})`, e.g. `type:
    "client"`) rather than a second parallel list — a relationship *is* a
    graph edge, this makes it discoverable through `knowledge.retrieve()`
    like everything else here, and avoids a redundant place to look for
    the same fact.
  - **knowledge** — the company's `knowledge.retrieve(company.name)`
    neighborhood, same as a project's.
  - **communications** — logged as their own searchable memory entries
    (type `"businesses"`, tagged `company:<id>` + `"communication"`), not
    appended to the company entry's metadata like employees/documents —
    a communications log is a stream, not a small bounded list, so giving
    each entry its own memory entry keeps it consistent with how
    `memory.search()` already works over everything else. Deliberately
    minimal (`summary` + optional `channel`) — a real inbox/calendar
    integration is the milestone's own later Phase 14 (Communications),
    not duplicated here.
- Dashboard: a "Companies" list + company-id lookup (mirrors "Project
  detail"'s raw-JSON-dump pattern) in the existing "Business" panel, plus
  a "Create a company" form in "Actions". Unlike Phase 3, this phase's
  milestone text doesn't explicitly require dashboard integration, so
  employee/document/finance/relationship/communication management got
  terminal commands + tools + API routes but not dedicated dashboard
  forms — reachable today via `company.employee`/`company.finance`/etc.
  in the terminal, or directly against the API. Add dashboard forms for
  these if the JSON-dump + terminal combination proves insufficient in
  practice.

---

## Persistent Context Engine (`core/context/engine.js`)

**Decision:** context retrieval moved from "each caller fetches its own"
to "`core/intelligence` fetches it automatically for every reasoning
call." Built 2026-07-21 (Intelligence Layer milestone, Phase 5 of 18).

- Before this, `core/router` (the `ask` command) fetched context itself
  (`this.context.retrieve(command)`, memories + knowledge only) and passed
  it through `mission.context`; `core/departments/base.js`'s
  `DepartmentManager.run()` didn't fetch any context at all — department-
  driven tasks got zero background beyond the bare task string. Two
  callers, two different (and one non-existent) treatments. Now
  `Intelligence.think()` calls `this.context.retrieve(mission.task, {
  companyId: options.companyId })` itself on every call, so both paths get
  identical, automatic context — "inject automatically into prompts," per
  the milestone's own framing, means the reasoning layer does it, not
  every caller remembering to.
- `core/router/index.js`'s `route()` no longer pre-fetches context itself
  (removed the now-redundant `this.context.retrieve(command)` call) —
  `Intelligence.think()` does the real work. The `context` constructor
  parameter (`new Router(agents, context)`) is kept unchanged for backward
  compatibility (`tests/router.test.js` still constructs one) and any
  future direct caller, it's just not used internally by `route()` anymore.
- Context now covers what the milestone spec asked for beyond the
  original memories+knowledge: **active goals** (top 5 roadmap projects by
  priority), **recent project activity** (top 3 by `updated`, a distinct
  slice from "active goals" — "what's important" vs. "what just
  happened"), **department roster** (id/name/domain/status, all 9, always
  included — cheap, small, no reason to gate it on a query), **device
  identity** (`core/device`), and an **optional company scope**
  (`options.companyId`, trimmed to id/name/industry/status/departments —
  full company detail would blow past what a prompt needs). Company scope
  is a hook, not wired into any caller automatically yet — no caller
  (`Router`, `DepartmentManager`) has a natural company id to pass today;
  a future company-scoped department run is the natural place to use it.
- "Compress into executive context" (the milestone's own phrase): every
  list is capped (`LIST_LIMIT = 5` for memories/knowledge/activeGoals, 3
  for recent activity) so the injected context stays roughly prompt-sized
  regardless of how large the memory store, knowledge graph, or roadmap
  grow — not full-fidelity, deliberately.
- **Found while wiring this in**: making `core/context/engine.js` pull
  from `core/executive` for goals/company data would create the exact same
  class of circular dependency Phase 2 hit (`core/executive` depends on
  `core/intelligence` via `decomposer.js`; if `core/intelligence` now
  depends on `core/context`, and `core/context` depended on
  `core/executive` at module-load time, that's a cycle). Fixed the same
  way: `core/executive` is required lazily inside `retrieve()`, not at
  module load time — by the time `retrieve()` is ever actually called
  (a runtime reasoning call, never during initial module loading), the
  normal load path has long finished. See "Goal Decomposition Engine"
  above for the first occurrence of this exact issue and why the fix
  pattern is safe.
- Not built: semantic/embedding-based retrieval (memories/knowledge are
  still keyword search — Phase 3 of the original protocol flagged this as
  future work before this milestone existed, still true), and any context
  caching/memoization across calls (`retrieve()` re-reads from disk every
  time — this is a personal, single-user system with a small on-disk
  store, not a latency-sensitive multi-tenant one).

---

## Executive Memory Consolidation (`core/executive/consolidation.js`)

**Decision:** this phase builds the consolidation *logic* only — gather,
synthesize, persist — not a scheduler. Built 2026-07-21 (Intelligence
Layer milestone, Phase 6 of 18).

- The milestone spec calls this a "nightly process," but actually running
  anything on a schedule is the *next* phase's whole job (Phase 8,
  Automation Engine: "scheduled execution, background execution, task
  queues"). Building a bespoke scheduler here to satisfy the word
  "nightly" would mean building it twice — once ad hoc now, once properly
  in Phase 8. Instead: `consolidation.run()` is a plain on-demand async
  method, reachable via terminal (`executive.consolidate`), a tool
  (`executive.consolidate`), and a dashboard button / `POST /api/executive
  /consolidate` — the same "trigger it yourself, or point cron/launchd at
  the endpoint" honesty this project already applies to sync (see "Device
  identity & synchronization" above: "Sync is deliberately NOT a live
  network service").
- "Merge: completed tasks, important memories, knowledge updates, project
  lessons, decision history" is implemented as **gather**, not merge in
  the memory-store sense — nothing about existing entries changes; a
  consolidation run reads a window of recent activity and produces one new
  summary entry. Field-by-field:
  - **completed tasks** — task-kind entries (`GoalDecomposer.TAG`) with
    `metadata.status === "completed"`, updated since the window start.
  - **important memories** — memory entries with `importance >= 4`,
    excluding types `"decisions"`/`"goals"` (those are their own buckets
    below) and excluding the consolidation's own entries.
  - **knowledge updates** — graph entities/relationships `created` since
    the window start.
  - **project lessons** — a real, not invented, concept: the `note` on any
    project/milestone/task's transition *to* `"completed"` (see
    `ProjectManager.updateStatus()`) is treated as the lesson. Only counted
    when a note was actually given — most completions won't have one, and
    that's fine, there's nothing to learn from a bare status flip.
  - **decision history** — memory entries of type `"decisions"` (a type
    that already existed in `core/memory/store.js`'s `TYPES`, like
    `"businesses"` did for Company Manager) updated since the window start.
  - **windowing**: since the *previous* consolidation entry's `created`
    timestamp (`lastRun()`), or `DEFAULT_WINDOW_DAYS` (1) back if this is
    the first run ever. No separate "last run" state file — the previous
    run's own persisted memory entry (tagged `executive-consolidation`) is
    the state, same "don't add parallel storage for something the memory
    store can already answer" reasoning as everywhere else in this
    milestone.
- "Generate: summaries, patterns, recommendations, executive insights" is
  one LLM call (`synthesize()`, same `useTools: false` / JSON-response /
  markdown-fence-stripping pattern as `GoalDecomposer.requestStructure()`)
  — **skipped entirely** when `gather()` finds zero activity in the
  window, returning a canned "No new activity" result instead. This
  matters in practice, not just for cost: a "nightly" job that always finds
  *something* (even a single low-signal memory) would make a real, paid
  API call every night forever regardless of whether anything meaningful
  happened.
- **Found while wiring this in**: the consolidation run's own output
  (`persist()` adds a `"consolidation"`-type knowledge entity, matching
  every other executive entity's pattern of a matching graph node) was
  itself showing up in the *next* run's `knowledgeUpdates` — since that
  entity's `created` timestamp is always after the previous run's window
  start, every consolidation after the first found "activity" purely from
  its own prior output, permanently defeating the skip-when-empty check
  above and making every run a real (paid, ~10s) API call regardless of
  actual system activity. A test that called `run()` twice in a row without
  mocking the brain caught this (11s test runtime was the tell). Fixed by
  excluding `type: "consolidation"` entities from `knowledgeUpdates` in
  `gather()`.
- Not built: any scheduler/cron/daemon (Phase 8, as above), and semantic
  deduplication of what counts as "important" beyond the existing
  `importance` field (no embedding/similarity system exists yet — see
  "Persistent Context Engine" above).

---

## Learning Engine (`core/learning/`)

**Decision:** a new top-level `core/learning/` module (not nested under
`core/executive`), with its own dedicated execution log file rather than
memory entries. Built 2026-07-21 (Intelligence Layer milestone, Phase 7 of
18).

- **Why a new top-level module, not `core/executive/learning.js`**:
  unlike Company Manager/Memory Consolidation (which extend the
  goal→project→company hierarchy `core/executive` already owns), Learning
  is a cross-cutting concern over `core/departments`, `core/tools`, and
  `core/agents` alike — it doesn't belong to any one of them. This matches
  how `core/context` and `core/intelligence` are their own top-level
  modules rather than living under `core/executive` too.
- **Why a dedicated file (`core/learning/executions.log`), not memory
  entries**: this is high-frequency operational telemetry — potentially
  one entry per tool call and per department run — not curated content an
  agent should reason over. Mixing it into `core/memory` would pollute
  `memory.search()`/the Persistent Context Engine's retrieval with noise
  every future reasoning call would have to wade through. This is the same
  kind of decision that already put `departments/<id>/logs/activity.log`
  in its own file rather than memory entries; `core/learning/log.js`
  applies it system-wide instead of per-department, in the same
  JSON-lines-append shape.
- **Instrumentation, not a new reporting layer bolted on top**: the
  milestone's "track successful/failed decisions, execution time, tool
  performance, department performance, agent performance" needed real data
  to exist first. Two minimal, additive edits:
  - `core/tools/base.js` `Tool.execute()` now times every call and records
    outcome (`success`/`failure`, including a permission denial) to
    `core/learning/log.js` — the one chokepoint every tool call already
    passes through regardless of caller (terminal, dashboard, agent tool
    use), so this required touching exactly one function.
  - `core/departments/base.js` `run()` now wraps its call to
    `intelligence.think()` in a try/catch, timing it and recording the
    outcome the same way. **Found while wiring this in**: `run()` never
    had a catch block before — a failed department run (e.g. the brain
    throwing) propagated with literally no trace anywhere, not even in
    `activity.log`. A "failed decision" was previously indistinguishable
    from "this task was never attempted." Fixed as part of this phase,
    not a separate bug fix pass, since tracking failed decisions requires
    failures to be observable at all.
  - `core/learning/log.js` itself has zero dependencies beyond Node
    built-ins (`fs`/`path`/`crypto`) specifically so requiring it from
    `Tool.execute()`/`DepartmentManager.run()` — both hot, frequently-hit
    paths — can never risk the circular-`require()` class of bug Phase 2
    hit. `core/learning/engine.js` (the aggregation/recommendation layer)
    is a separate file specifically so those two call sites don't pull in
    `core/intelligence` → `core/brain` → `core/tools` at all.
- Every aggregate (`overview()`, `departmentPerformance()`,
  `agentPerformance()`, `toolPerformance()`) is computed by reading and
  grouping the log on every call — no separately-maintained running
  counters to keep in sync, consistent with `roadmap()`/`progress()`/etc.
  elsewhere in this milestone.
- "Generate optimization recommendations" is one LLM call
  (`recommend()`), same `useTools:false`/JSON-response/skip-when-no-data
  pattern as `MemoryConsolidation.run()` — fed the four aggregates above,
  asked for a summary + a list of concrete recommendations, persisted as a
  `type: "decisions"` memory entry tagged `learning-recommendation`.
- **Found while writing tests, before it shipped**: a test that called
  `Tool.execute()`/`DepartmentManager.run()` for real (exercising the new
  instrumentation) without also backing up/restoring the new
  `executions.log` file would permanently pollute it across test runs —
  three existing test files (`tools.test.js`, `departments.test.js`,
  `dashboard.test.js`, `claude-tooluse.test.js`) newly exercise this
  instrumentation as a side effect of testing things that were already
  there, so all four needed the same backup/restore treatment the other
  shared-state files already have. Caught by manually inspecting the live
  `executions.log` after a full `npm test` run and finding it non-empty
  when it should have been absent.
- Not built: a UI/tool to prune old executions.log entries (it grows
  unbounded) — no concrete need yet for a personal system's log to be
  large enough to matter; revisit if it ever is.

---

## Automation Engine (`core/automation/`)

**Decision:** plain `setInterval`-based tick loop with persisted JSON
state, no new dependency (no `node-cron`/`bull`/etc.), and the engine
itself has zero knowledge of what jobs exist. Built 2026-07-21
(Intelligence Layer milestone, Phase 8 of 18).

- **This is what Phases 6 and 7 were both waiting on**: both `docs/
  Architecture.md`'s Executive Memory Consolidation and Learning Engine
  sections explicitly said "not scheduled... until Phase 8." This phase's
  two built-in jobs (`consolidate`, `learning-recommend`, both nightly)
  are that promise being kept, not new speculative jobs invented to fill
  out the phase.
- **`core/automation/engine.js` depends on nothing from `core/executive`/
  `core/tools`/`core/learning`'s engine** — jobs are registered from
  outside via `registerJob(name, handler)`. `core/automation/jobs.js` is
  the one file allowed to require `core/executive`/`core/learning` to wire
  up the two built-in jobs; the engine class itself only touches `fs`/
  `path`/`crypto` and `core/learning/log.js` (a safe leaf dependency, same
  as `Tool.execute()`/`DepartmentManager.run()` use directly). This is
  deliberately the same shape as `registry/tools.json` + `core/tools/
  handlers/*.js` — declaration/wiring separated from the generic runner.
- **No node-cron or similar**: a personal system running at most a
  handful of daily jobs doesn't need cron-expression parsing, distributed
  locking, or persistence beyond a flat JSON file — a `setInterval` tick
  (default 30s) that checks "is anything due" against persisted
  `nextRunAt`/`scheduledFor` timestamps covers every capability the
  milestone asked for (scheduled execution, background execution, retry,
  recovery) without a new dependency. Revisit if job volume or scheduling
  precision ever genuinely needs more.
- **State** (`core/automation/state.json`, gitignored like `core/device/
  device.local.json` — per-machine operational state, not source) holds
  two arrays: `queue` (individual job executions, pending/running/
  completed/failed) and `schedules` (recurring definitions with
  `nextRunAt`). Both are covered by "persistent state": a schedule's
  `nextRunAt` survives a restart without resetting the clock (re-calling
  `schedule()` with the same `jobName` preserves the existing
  `nextRunAt`, only updates `intervalMs`), and **failure recovery** is
  literal — any queue entry found with `status: "running"` at load time
  (impossible unless the process crashed mid-job) is reset to `"pending"`
  so it gets retried.
- **Retry logic**: failed jobs re-enqueue with backoff
  (`60s × attempts`) up to `maxAttempts` (default 3), then go
  `"failed"` — a terminal state, same one-way-door pattern as a project's
  `"completed"` status (`ProjectManager.updateStatus()`) and a
  consolidation/recommendation run's `"failed"` isn't retried
  automatically after that either.
- **Two execution modes, not one**, because nothing guarantees a
  background tick loop is actually running on a personal, not-always-on
  machine: `enqueue()` is genuinely fire-and-forget background execution
  (only actually runs once *something's* tick loop finds it due), while
  `runNow()` bypasses the queue entirely and runs a job synchronously,
  immediately, regardless of whether any tick loop is active — mainly for
  the terminal, where a user issuing `automation.run consolidate` and
  having nothing happen (because they're not also running the dashboard)
  would be a confusing dead end. Both record to `core/learning/log.js`
  (`kind: "automation_job"`) either way, so job outcomes feed
  `core/learning/engine.js`'s stats automatically regardless of which
  mode ran them.
- **The tick loop only starts from one place**: `dashboard/backend/
  server.js`'s `require.main === module` guard (its real-boot path, not
  triggered by tests requiring `createServer`) — the dashboard is
  VERONICA's one genuinely long-running host process. `core/interface/
  terminal.js` gets an `automation.start` command instead of auto-
  starting, specifically to avoid two processes (a terminal session left
  open *and* the dashboard) both ticking against the same
  `state.json` and racing to claim the same due schedule. `AUTOMATION_DISABLED=1`
  opts a given dashboard instance out entirely, for the same
  multiple-instances-sharing-state reason.
- **Found while writing tests, before it shipped** (the same class of bug
  as Phase 7's `executions.log` leak, one level up): `core/automation/
  index.js`'s module load calls `schedule()` for both built-in jobs,
  which persists to `state.json` unconditionally — meaning simply
  *requiring* `dashboard/backend/server.js` (which `tests/dashboard.test.js`
  and `tests/sync.test.js` both do, to get `createServer`) writes real
  state to disk before any test even runs, let alone before a
  `test.before()` hook could snapshot "did this exist already." Fixed by
  moving the existed-before snapshot to before those two files' `require()`
  calls specifically, not inside their hooks — the general lesson (a
  module's *side effects on load*, not just on the operations its tests
  exercise, need backing up) applies to any future test that transitively
  requires a module with load-time persistence.
- Not built: cron-expression scheduling (fixed intervals only — no
  concrete need yet for "every weekday at 9am" precision over "every 24
  hours"), job concurrency (`processQueue()` runs due jobs sequentially,
  one at a time — a personal system's volume never justifies the
  complexity of parallel job execution), and pruning old completed/failed
  queue entries (same unbounded-growth deferral as `executions.log`
  above).

---

## Dashboard Live Updates (`GET /api/events`)

**Decision:** Server-Sent Events over the existing plain `http` server,
not a hand-rolled WebSocket implementation. Built 2026-07-21 (Intelligence
Layer milestone, Phase 9 of 18).

- **Why SSE, not literal WebSocket**: every capability the milestone spec
  actually lists — live notifications, progress updates, memory updates,
  knowledge updates, department activity, agent activity — is
  one-directional, server→client push. That is exactly what SSE is for.
  Node's `http` module has no built-in WebSocket support (unlike
  `http.createServer`'s native support for chunked/streamed responses,
  which SSE just is), so a literal WebSocket would mean hand-writing the
  handshake/framing/masking wire protocol from scratch — real,
  security-sensitive, easy-to-get-subtly-wrong code — or adding a new
  dependency (`ws`), which this project has avoided everywhere else (see
  "Dashboard stack" above: "no new dependencies... built-in http only").
  SSE gets automatic browser reconnection for free (`EventSource`) and
  needed zero new code on the wire-protocol level. Revisit if a genuine
  bidirectional need (the browser pushing to the server outside normal
  HTTP requests) ever appears — SSE structurally can't do that, WebSocket
  can.
- **Event source, not new instrumentation everywhere**: `core/bus` (the
  `EventEmitter`-based message bus that already existed, previously only
  used for one `system.ready` publish at boot) is the backbone. Rather
  than instrumenting every executive method that creates a project/
  company/consolidation/recommendation individually, `core/memory/
  index.js`'s `remember()`/`update()` publish `memory.updated` once —
  since nearly everything (`ExecutivePlanner.plan()`, `CompanyManager.
  createCompany()`, `MemoryConsolidation.persist()`, `ProjectManager.
  updateStatus()`, ...) already funnels through those two functions, this
  one chokepoint covers all of them for free, the same reasoning Phase 7's
  `Tool.execute()`/`DepartmentManager.run()` instrumentation already
  used. `core/knowledge/index.js`'s `addEntity()`/`addRelationship()`
  publish `knowledge.updated` (only on the genuine-create branch, not the
  idempotent-reuse one — a no-op call shouldn't notify anyone).
  `DepartmentManager.run()` and `AutomationEngine.runEntry()` publish
  their own distinct events (`department.activity`, `automation.
  jobCompleted`) since those carry information (which department/agent,
  which job) memory/knowledge events don't.
- **Not covered**: `core/device/sync.js` calls `core/memory/store.js` and
  `core/knowledge`'s `merge()` directly, bypassing the instrumented
  `core/memory/index.js` wrapper — sync imports don't currently trigger
  live-update events. Deliberate, not an oversight: sync is a rare,
  already-authenticated, distinctly different kind of write than normal
  live usage; wiring it in is real future work if it's ever needed, not
  gap-filled speculatively here.
- One `/api/events` connection streams every event type (tagged with
  `type` in the JSON payload) rather than one connection per type — a
  personal dashboard with one or two open tabs doesn't need per-topic
  subscription management, and the frontend just filters client-side.
  Listeners are cleaned up on `req.on("close")` (no leaked `EventEmitter`
  listeners across reconnects), and a 25s heartbeat comment line keeps
  proxies/browsers from treating the connection as idle and dropping it.
- Frontend: `setInterval(loadDashboard, 15000)` is gone, replaced by
  `EventSource` — each event both appends to a new "Live Activity" panel
  immediately (the direct, visible "live notifications" experience) and
  triggers a debounced (800ms) `loadDashboard()` refresh, since one user
  action (e.g. planning a goal) fires several events in quick succession
  (a `memory.updated` for the project, multiple `knowledge.updated` for
  its entities/relationships) and refreshing once covers all of them
  rather than re-fetching on every single event.
- **Found while writing tests, before it shipped**: the two new SSE tests
  in `tests/dashboard.test.js` (connect, trigger a real event, assert it
  arrives) made the file's `test.after()` — specifically the graceful
  `server.close()`, which waits for existing connections to end on their
  own — hang on Node's default 5s `keepAliveTimeout` before the socket
  the SSE test opened would actually close, adding several real seconds
  to every single `npm test` run regardless of whether SSE was even the
  thing being tested. Fixed with `server.closeAllConnections()` (Node
  ≥18.2) called immediately before `server.close()` in that file's
  cleanup — safe there since the test run is already finished with the
  server at that point. Caught by comparing `npm test`'s total duration
  before/after adding the SSE tests, the same way Phase 6's and Phase 8's
  bugs were caught by watching for anomalous timing, not by a failing
  assertion.
- Not built: per-event-type SSE subscription (one client always gets
  every event type — no concrete need yet to filter server-side), and any
  event history/replay for a client that connects after an event already
  fired (a freshly-opened dashboard tab sees new events from that point
  forward; the existing `GET /api/...` endpoints remain how a tab gets
  the current state on load, which is intentional — the point of SSE here
  is "notify me of what changes next," not "replace all data-fetching").

---

## Multi-Agent Collaboration (`core/collaboration/engine.js`)

**Decision:** `CollaborationEngine` is a caller-constructed class (like
`core/router`'s `Router`), not a self-contained singleton like `core/
executive`/`core/learning`/`core/automation` — and every operation here is
human/dashboard/terminal-triggered, not agent-initiated. Built 2026-07-22
(Intelligence Layer milestone, Phase 10 of 18).

- **Why a class, not a singleton facade**: it needs an already-loaded
  `departments` array (real `DepartmentManager` instances with agents and
  live `IntelligenceEngine`/`Brain` attached), the same array `terminal.js`
  and `dashboard/backend/server.js` already build via `loadDepartments
  (agents)`. A self-contained singleton would mean constructing a *second*
  set of 9 `DepartmentManager`/`IntelligenceEngine`/`Brain` instances
  internally — wasteful, and a source of drift (two separate department
  rosters that could disagree). `new CollaborationEngine(departments)` in
  both entry points, right next to where `departments` is already built,
  reuses the exact instances already in scope.
- **Why not wired into the tool system**: `core/tools/handlers/*.js`
  assume everything reachable is a `require()`-able singleton (`core/
  executive`, `core/learning`, etc.); `departments` isn't one — it's
  constructed fresh per entry point. Wiring collaboration into tools would
  mean either constructing a third set of `DepartmentManager` instances
  inside a tool handler, or restructuring how departments are loaded
  project-wide, neither of which this pass asked for. Practically, this
  also draws an intentional line: every collaboration operation here is
  triggered by a human (terminal command, dashboard form/API call), not by
  an agent mid-reasoning deciding to delegate or call a vote. Agent-
  initiated collaboration would mean wiring this into the tool-use loop
  (`core/brain/providers/claude.js`) — a materially bigger, more security-
  sensitive change (agent-initiated multi-department action, potentially
  chaining real API calls an agent chose to make) than this pass scoped.
- **Four capabilities, two different costs**: `sendMessage()` is a log +
  knowledge-graph edge only — no reasoning call, cheap, synchronous.
  `delegate()`, `review()`, and `consensus()` all make real LLM calls
  (`DepartmentManager.run()`, the same path a direct department run
  uses) — `consensus()` makes one *per department*, in parallel
  (`Promise.all`), deliberately: votes must be independent, not each
  agent seeing the previous one's reasoning and cascading toward
  agreement, which is what a sequential loop would risk.
- `review()`/`consensus()` ask for strict JSON responses (verdict/
  feedback, vote/reasoning) using the same `useTools:false` + markdown-
  fence-stripping + validate-with-clear-error pattern established in
  `GoalDecomposer`/`MemoryConsolidation`/`LearningEngine` — one JSON
  document back, not free text a caller would have to parse heuristically.
- **Task handoff is a different concept, not folded into this module**:
  the milestone spec's "task handoff" (full ownership transfer of a
  project to a different department) is `ProjectManager.
  reassignDepartment()`, in `core/executive`, not here — it mutates
  project *state* (the department tag, a history entry), which is
  `ProjectManager`'s job, not agent-to-agent interaction. It reuses
  `memory.update()`'s top-level spread (already supported since Phase 3,
  just not previously exercised on `tags`) to swap the department tag,
  rather than needing a new store.js capability. `delegate()` (this
  module) is a one-off subtask another department runs and hands back;
  `reassignDepartment()` is permanent reassignment — genuinely different
  operations that happen to share the word "handoff" in casual usage.
- Every collaboration record persists the same way every other executive
  entity does (a `type: "decisions"` memory entry tagged `collaboration` +
  a kind, `knowledge.addRelationship()` for the agent-to-agent edge) and
  publishes a Phase-9 live-update event (`collaboration.message`/
  `delegated`/`reviewed`/`consensus`), so collaboration activity shows up
  in the dashboard's live feed automatically, no separate wiring needed.
- Not built: agent-initiated collaboration (see above), delegation/review
  chains deeper than one hop (an agent's delegated task can't itself
  delegate further — no concrete recursive-delegation use case yet to
  design timeout/cycle-detection against), and weighted/expertise-based
  consensus (every vote counts equally regardless of department — no
  concrete need yet for e.g. weighting HADES's vote higher on a financial
  proposal).

---

## Production Hardening (`core/logging/`)

**Decision:** an audit-driven pass, not a wholesale rewrite — found and
fixed real gaps rather than adding generic defensive code everywhere.
Built 2026-07-22 (Intelligence Layer milestone, Phase 11 of 18).

- **What the audit actually found** (grep for `uncaughtException`/
  `unhandledRejection` across the whole repo, trace of every response
  path in the dashboard server, review of `checkApiAuth()`):
  1. Zero process-level crash handling existed anywhere. An unhandled
     rejection in either entry point would, depending on Node version/
     flags, either silently crash the process or print a warning and
     leave it in an unknown state — no durable trace either way.
  2. `dashboard/backend/server.js`'s `/api/events` (SSE) dispatch ran
     **outside** the request handler's `try`/`catch` (added in Phase 9,
     never caught since nothing in it has thrown yet in practice) — a
     synchronous throw there would be an unhandled promise rejection at
     the process level, not a normal error response. This is exactly the
     kind of bug the new crash guards exist to catch, so it became the
     first thing they'd need to catch — fixed at the source instead
     (moved inside the `try`), with the crash guards as defense in depth
     for whatever's still unanticipated.
  3. `checkApiAuth()`'s token comparison was a plain `===`, which
     short-circuits on the first mismatched byte — a timing side-channel
     in principle. Low real risk for a localhost-bound personal
     dashboard, but `crypto.timingSafeEqual` is a free fix (no new
     dependency, a few lines), so there's no reason not to take it.
  4. `/api/status` looked like a health check but is actually identity/
     roster info — nothing anywhere reported actual process health
     (memory, whether the automation tick loop is really running, recent
     error rate).
- **`core/logging/index.js`** is a small leveled logger
  (`debug`/`info`/`warn`/`error`), **not** a replacement for the
  `console.log("[MODULE] ...")` calls already scattered through the rest
  of the codebase — rewriting dozens of already-working, already-tested
  call sites to route through a new logger would be exactly the kind of
  high-risk, low-value churn this project's own guidance warns against.
  Only `warn`/`error` persist to `core/logging/errors.log` (gitignored,
  same `*.log` rule as `core/learning/executions.log`) — `debug`/`info`
  are exactly what console already shows, and persisting every info line
  would turn the error log into noise instead of a signal worth reading
  after a crash.
- **`core/logging/crashGuard.js`** installs the two process-level
  handlers. `unhandledRejection` logs and **keeps running** (most
  rejected promises here — a failed fetch, a job's own error already
  being retried by `core/automation` — aren't actually fatal, and taking
  down a long-running dashboard/automation host over one bad promise
  would be worse than the bug that caused it). `uncaughtException` logs
  and **exits** (`process.exit(1)`) — Node's own guidance is that the
  process is in an undefined state afterward and shouldn't keep running;
  exiting loudly with a durable log entry beats limping on broken.
  Installed in `core/interface/terminal.js` at module top level (it's
  always the live process when loaded at all — nothing requires it as a
  library) but scoped to `dashboard/backend/server.js`'s
  `require.main === module` guard, **not** module top level — that file
  is also `require()`d by `tests/dashboard.test.js`/`tests/sync.test.js`
  to get `createServer()`, and a real error during a test run must fail
  that test, not call `process.exit(1)` and kill the whole `npm test`
  run.
- The handlers are exported as plain functions
  (`makeUnhandledRejectionHandler`/`makeUncaughtExceptionHandler`), not
  only wired up internally — **found while writing tests**: calling
  `process.emit("unhandledRejection"/"uncaughtException", ...)` to test
  them synthetically doesn't work, because Node's own test runner
  listens for those exact same two process events to detect real test
  failures. Emitting them fights the test runner instead of exercising
  this module's logic (confirmed: both tests failed, reporting the
  synthetic error as a real test failure, before this fix). Refactored so
  tests call the handler functions directly like any other function —
  no `process.emit`, no interference with the test runner's own crash
  detection.
- **`GET /api/health`** is the real liveness/readiness check `/api/status`
  wasn't: process uptime/memory usage, whether the automation tick loop
  is actually running, and a recent-error count (from `core/logging`,
  windowed to the last 15 minutes so one error from days ago doesn't mark
  the system "degraded" forever) driving an `ok`/`degraded` verdict.
  `GET /api/logs/errors` surfaces the persisted error log itself.
- **Found while checking for residue after this phase, before it
  shipped** (the same discipline that caught bugs in Phases 6-9): a
  leftover `core/learning/executions.log` after a clean `npm test` run
  traced back to `tests/collaboration-engine.test.js` (Phase 10) —
  it calls real `DepartmentManager.run()` (via `delegate()`/
  `consensus()`), which records to that file, but the test file was
  never given the backup/restore treatment for it. Missed when Phase 10
  shipped because that file's own tests all passed; only showed up as
  filesystem residue on a later, unrelated phase's audit. Fixed by
  applying the same backup/restore pattern every other file exercising
  that instrumentation already has. This is the fourth time this exact
  class of bug (a test exercises already-instrumented code as a side
  effect of testing something else, without backing up the file that
  instrumentation writes to) has been caught — see "Learning Engine" and
  "Automation Engine" above for the first two.
- Not built: rate limiting (a personal, single-user, localhost-bound
  dashboard has no concrete need for it), log rotation/pruning for
  `errors.log` (same unbounded-growth deferral already made for
  `executions.log` — see "Learning Engine"), and routing the existing
  `console.log` boot-sequence messages through `core/logging` (would
  touch dozens of working call sites for no functional gain — the whole
  point of this phase was fixing real gaps, not manufacturing busywork).

---

## External Integrations (`core/integrations/`)

**Decision:** two integrations built with real value and real security
scoping (Obsidian vault, outbound HTTP), one deliberately deferred
(general "filesystem intelligence" — see below). Built 2026-07-22
(Intelligence Layer milestone, Phase 12 of 18).

- **Obsidian vault path**: `OBSIDIAN_VAULT_PATH`, defaulting to the repo
  root. This isn't a guess — the repo root already has a real (if empty)
  `.obsidian/` directory, which Obsidian only ever creates by actually
  opening that exact folder as a vault, so it's evidence, not a made-up
  default. Every operation fail-closed checks for `.obsidian/` at the
  configured path (`requireVault()`) — if `OBSIDIAN_VAULT_PATH` points
  somewhere that isn't a real vault, every operation throws a clear error
  rather than silently treating an arbitrary folder as one.
- **Indexing**: `indexVault()` turns every note into a `type: "note"`
  knowledge entity, `[[wikilinks]]` inside it into `links` relationships
  (Obsidian's own linking syntax, extracted rather than reimplemented),
  and a 280-char summary into a `type: "technical knowledge"` memory
  entry tagged `obsidian` — reachable through `memory.search()`/the
  Persistent Context Engine like everything else, not a separate,
  disconnected store. Same sandboxing pattern `core/tools/handlers/
  filesystem.js` already established (every path resolved against the
  vault root, rejected if it would escape), applied to a configurable
  root instead of a hardcoded one.
- **Outbound HTTP is VERONICA's first ability to reach anything outside
  Claude's own API** — every other tool operates on local state. That's a
  real SSRF-shaped risk (an agent reasoning over some external document
  could be prompt-injected into exfiltrating data to an attacker URL, or
  probing internal network services), so `core/integrations/http.js`
  fails closed by design: `SERVICE_ALLOWLIST` (comma-separated hostnames)
  must explicitly name a host before any request to it is permitted —
  unset/empty means nothing is reachable, not "open by default." Same
  fail-closed posture the dashboard's write endpoints (`API_TOKEN` unset)
  and the sandboxed filesystem tool already established. Also caps
  response size (1MB) and request duration (10s) — a personal system
  fetching a JSON API response doesn't need either unbounded.
- **Found while writing tests**: `request()` validated its input
  (`assertAllowed()`) with a plain synchronous `throw`, before the
  function was declared `async` — so a caller using `await request(...)`
  or `.catch(...)` for error handling wouldn't catch a validation error
  the same way it'd catch a real network failure (a synchronous throw
  from a non-async function propagates immediately, not as a promise
  rejection). `assert.rejects()` in the new tests caught this exactly as
  designed — the fix was declaring `request()` `async`, so every code
  path (validation and network) rejects the same way.
- **No dedicated dashboard routes or terminal commands were added for
  these** — unlike `executive`/`company`/`learning`/`automation`,
  `obsidian.*`/`web.fetch` are registered as ordinary tools with zero
  dependency on `core/intelligence`/`core/tools` (no circular-require
  risk to route around with a facade), so they're already fully reachable
  through the *existing* generic mechanism (`tools.run` in the terminal,
  `POST /api/tools/:id/run` on the dashboard) with no new wiring needed.
  Verified live against the real dashboard rather than assumed.
- **Deliberately deferred**: a distinct "filesystem intelligence"
  subsystem (indexing/searching arbitrary local files beyond the
  sandboxed workspace and the Obsidian vault). The milestone's own later
  roadmap has a dedicated File Intelligence phase (documents/code/PDFs/
  images/videos/repositories, searchable embeddings) — building a partial
  version of that here under a different name would mean redoing it
  properly later. "APIs"/"service connections" are covered by what
  already exists (the dashboard's own REST API, documented throughout
  this file) plus the new HTTP connector above; a bespoke MCP client is
  the milestone's own later, dedicated MCP Integrations phase, not
  reinvented here under a more generic name.
