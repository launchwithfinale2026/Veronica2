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
`Agent.process()` itself wasn't deleted at the time — it was left in
place as an available offline/canned-response method, just no longer
on the live path. **Update (v1 release audit):** removed. It had
stayed unreferenced except by its own dedicated test
(`tests/agent.test.js`, also removed) ever since, so on reconsideration
for a public release it's genuine dead code rather than a kept
capability — reversing the original "keep it" call above.

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
- `loadDepartments()`/`loadAgents()` originally read ONLY the static
  `registry/departments.json`/`registry/agents.json` files — Phase 41
  part 2 extended both to also merge in package-declared departments/
  agents via `core/capabilities/activation.js`'s
  `packageDepartmentConfigs()`/`packageAgentConfigs()`, the same single
  source of truth `core/departments/loader.js`/`core/agents/loader.js`
  already use. Before this fix, a goal could never be assigned (by
  keyword match OR explicit `goal.department`) to a real, installed
  package department (e.g. `"trading-dept"`) — `assignDepartment()`
  would throw "Unknown department" on an explicit assignment, and
  `resolveOwners()` could never find a package agent. See Phase 41 part
  1's `docs/CHANGELOG.md` entry for the sibling bug this matches
  (`core/context/engine.js` had the exact same gap).
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
  happened"), **department roster** (id/name/domain/status, always
  included — cheap, small, no reason to gate it on a query; originally
  the 9 built-ins only, extended in Phase 41 to also include
  package-declared departments via `core/capabilities/activation.js`'s
  `packageDepartmentConfigs()` — see Phase 41 part 1 in
  `docs/CHANGELOG.md`, this engine had its own second, package-unaware
  department loader that silently omitted all six real production
  divisions from every reasoning call's context until fixed), **device
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

---

## Device Ecosystem (`core/device/registry.js`)

**Decision:** one small, real addition — a known-devices roster — not a
rebuild. Device identity (`core/device/index.js`) and sync (`core/device/
sync.js`) already existed from before this milestone (see "Device
identity & synchronization" above); this phase audited what was actually
still missing rather than re-implementing what already worked. Built
2026-07-22 (Intelligence Layer milestone, Phase 13 of 18).

- **What the audit found**: `importState()` already received the
  exporting device's full identity inside every sync package
  (`syncPackage.device`) — and did nothing with it beyond using it for
  the return value. Two VERONICA instances could sync repeatedly and
  neither would ever be able to answer "which other devices have I synced
  with, and when" — there was a merge *mechanism* but no actual
  multi-device *awareness*, which is the specific gap this milestone
  phase names.
- `core/device/registry.js` is per-machine state (`known-devices.json`,
  gitignored like `device.local.json`) — each device's own roster of
  "who I've seen" is naturally local, not itself something to sync (a
  device's sync history isn't a fact device B needs to receive from
  device A; each device already builds its own roster the moment it
  receives *anything* from another).
- `recordSighting()` upserts by device id: first sighting records
  `firstSeenAt`; every sighting after that updates `lastSeenAt`,
  `lastSyncDirection`, and increments `syncCount`, while preserving the
  original `firstSeenAt` — the roster answers "how long have I known
  this device and how often do we sync," not just "have I seen it."
- Wired into exactly one place: `importState()`, right after the existing
  merge calls. `exportState()` doesn't get a symmetric call — a `GET`
  request pulling an export doesn't identify itself as a specific device
  today (no device-identity header/param exists on that path), so there's
  nothing real to record on that side yet; adding one would mean
  designing a new identification mechanism for a capability that isn't
  needed until export-side awareness is actually asked for.
- No dedicated facade/lazy-require complexity needed — `core/device/
  registry.js` only touches `fs`/`path`, so requiring it from `core/
  device/sync.js` (already required broadly, including by the dashboard)
  carries zero circular-dependency risk, unlike the `core/executive`/
  `core/tools` chain documented earlier.
- **Found while writing tests, before it shipped**: the existing
  `POST /api/sync/import` test in `tests/sync.test.js` already sends a
  hand-crafted remote device identity in its sync package — meaning it
  now exercises `recordSighting()` (and writes to the real
  `known-devices.json`) as a side effect of testing something that
  already existed, the same class of bug caught repeatedly in earlier
  phases (see "Learning Engine," "Automation Engine," "Production
  Hardening"). Caught and fixed *before* it shipped this time, by
  proactively adding the backup/restore treatment while writing the new
  device-registry tests, rather than discovering it as filesystem residue
  afterward.
- Not built: "API architecture" as a new thing — the dashboard's existing
  REST API (documented throughout this file, extended every phase) and
  Phase 12's new HTTP connector already cover it; there was no concrete
  gap here to name a new subsystem after. A device actively announcing
  itself on the export side, and any notion of device "trust"/pairing
  beyond "the bearer token already gates every write" are real future
  work if a second physical device and a genuine pairing need show up —
  not built speculatively against a need that doesn't exist yet.

---

## Advanced Memory (`core/memory/embeddings.js`)

**Decision:** real embedding-based semantic search (OpenAI), additive to
keyword search, off by default and gracefully degrading everywhere it's
used. Knowledge graph, memory ranking, and learning systems (this
milestone's Phase 7) already existed going into this phase — the one
concrete, repeatedly-flagged gap was semantic retrieval, so that's what
got built, not a rebuild of what already worked. Built 2026-07-22
(Intelligence Layer milestone, Phase 14 of 18).

- **Why OpenAI, not a new dependency**: `openai` was already a listed
  dependency (`core/brain/providers/openai.js`, an existing but rarely-
  exercised fallback text provider) — using its embeddings endpoint adds
  zero new packages. Anthropic doesn't offer a dedicated embeddings API,
  so this is the one place in the whole project where a real OpenAI SDK
  call is load-bearing rather than an unused fallback.
- **Checked fresh on every call, not cached at construction**:
  `getClient()` reads `process.env.OPENAI_API_KEY` each time rather than
  once at startup — `dotenv.config()` runs at various points across
  different entry points/providers, so caching "no key" the moment
  `core/memory/index.js` first loads could wrongly stick even after a key
  becomes available later in the same process's lifetime.
- **Not wired into `memory.remember()`**: embedding every memory on every
  write would put a real, billed API call on the exact hot path nearly
  every executive operation already funnels through (planning a project,
  creating a company, logging a decision — see "Learning Engine" for why
  hot paths get special caution). Indexing is `reindexEmbeddings()`, a
  separate, explicitly-triggered batch step — the same "not automatic,
  triggered when needed" posture established for consolidation/learning
  recommendations. A content hash per entry means re-running it only
  embeds what's new or changed since the last pass, not everything again.
- **The Persistent Context Engine now tries semantic search first**
  (`core/context/engine.js`'s `searchMemories()`), falling back to the
  existing keyword `memory.search()` on: semantic search not being
  configured, zero results (an entry that hasn't been reindexed yet
  simply can't surface — see below), or *any* error from the embedding
  call. A transient OpenAI hiccup degrading one refinement of retrieval
  shouldn't be able to break every single reasoning call in the system —
  keyword search was already good enough to ship Phases 1-13 on, so it
  remains the floor, not a single point of failure introduced by adding
  something better on top.
- **This required making `ContextEngine.retrieve()` `async`** (previously
  synchronous) — a real embedding call can't be synchronous. Traced every
  caller before making the change: `core/intelligence/index.js`'s
  `think()` was the *only* caller (`core/router`'s `route()` stopped
  calling it directly back in Phase 9), and `think()` was already
  `async`, so adding one `await` there is a fully contained change with
  no ripple into `think()`'s own callers (already awaiting it either way).
- **Search results are scoped to what's actually been reindexed**:
  `search()` filters to entries with a stored embedding before ranking —
  an entry that exists in memory but hasn't been through
  `reindexEmbeddings()` yet can't appear in semantic results (silently
  returning it via some other signal would misrepresent what "semantic
  search" actually found). `searchMemories()`'s fallback-on-empty-results
  handles the case where nothing reindexed matches well enough to return
  anything, same reasoning as the error-fallback above.
- Not built: automatic/scheduled reindexing (a natural fit for `core/
  automation`'s job registry once there's a concrete cadence need — not
  added speculatively this pass), a blended keyword+semantic+importance
  ranking formula (semantic search is deliberately its own separate,
  similarity-only-ranked method rather than one unified scoring function
  — no concrete need yet demonstrated for blending them), and any other
  embedding provider (only OpenAI; Claude has no embeddings API to fall
  back to, and adding a second provider without a concrete second need is
  the same premature-complexity trap this project avoids everywhere else).

---

## Autonomous Operations (`core/executive/selfMonitor.js`)

**Decision:** a self-monitoring loop that detects problems and generates
recommendations about them, and deliberately stops there — no autonomous
remediating action. Built 2026-07-22 (Intelligence Layer milestone, Phase
15 of 18, and the last phase this milestone specified by number; Phases
16+ are this project's own judgment about what a genuine AI operating
system still needs, continued in later sections below).

- **Scoping the "autonomous" part carefully, on purpose**: "planning,"
  "task execution," and most of "improvement loops" already existed
  going into this phase (`ExecutivePlanner`/`GoalDecomposer`, department
  runs, `core/automation`'s job execution, `LearningEngine`'s
  recommendations). The one genuinely new piece is tying them into a
  periodic *self-check* — and the standing instruction for this entire
  autonomous run was explicit: stop for anything destructive or requiring
  human approval. Autonomously *detecting* a problem and *asking for a
  recommendation* about it (calling `LearningEngine.recommend()`, which
  already existed and does nothing destructive) is safe to run on a
  schedule with nobody watching. Autonomously *acting* on that
  recommendation — reassigning a project, canceling a job, changing
  anything — is a real decision with real consequences and stays a human
  one. `SelfMonitor.runSelfCheck()` never calls `reassignDepartment()`,
  `updateStatus()`, or any other mutating executive method; it only
  reads, flags, and (via the pre-existing recommend()) suggests.
- **Three checks, thresholded to avoid noise**: overdue projects
  (`ExecutivePlanner.evaluateDeadlines()` — any overdue project is worth
  flagging, no threshold needed), a high failure rate
  (`LearningEngine.overview()`, >30% failures, but only once at least 5
  executions have been logged — flagging "100% failure rate" off a
  sample of one execution would be a false alarm, not a signal), and
  repeated permanent job failures (`AutomationEngine.history()`, ≥3
  failed runs). Below every threshold, `runSelfCheck()` finds nothing and
  skips the real `recommend()` API call entirely — the same cost-
  conscious "skip when there's nothing to report" posture
  `MemoryConsolidation`/`LearningEngine` already established.
- **The automation-health check needed the live engine instance, not a
  require()**: `SelfMonitor`'s constructor takes an `automationEngine`
  parameter with *no* default via `require("../automation")` — unlike
  `executive`/`learning`, which default to their ordinary facade
  requires safely. The real scheduled self-monitor job is registered from
  inside `core/automation/jobs.js`'s `registerBuiltInJobs(engine)`, which
  runs *during* `core/automation/index.js`'s own top-level execution
  (module.exports not yet assigned) — if `SelfMonitor` called
  `require("../automation")` itself at that moment, it would re-enter
  that exact module mid-load and get back an incomplete object, the same
  circular-require bug class documented repeatedly since "Goal
  Decomposition Engine." Fixed by passing the already-constructed
  `engine` parameter directly instead. A dedicated regression test
  (`tests/automation-engine.test.js`) requires the real
  `core/automation` facade fresh and asserts the built-in jobs
  (including `self-monitor`) come back correctly scheduled, specifically
  so a future revert of this wiring fails loudly here instead of
  surfacing as a runtime crash. (Grown from three to five since this was
  written — `daily-briefing`/`weekly-report` joined in Phase 11, see
  "Executive Intelligence Layer" below — but the risk and the fix are
  unchanged.)
- **The facade's own `SelfMonitor` instance** (`core/executive/index.js`,
  for manual triggers/read access via terminal/dashboard/tools) hit the
  identical self-reference risk one level up: constructing it inside
  `core/executive/index.js` itself, while *that* module is still
  mid-load, means `executive: require("../executive")` would resolve to
  the same incomplete object. Fixed by passing a minimal inline object
  exposing only the one method (`evaluateDeadlines`) `SelfMonitor`
  actually calls, rather than the full facade. This facade instance has
  no `automationEngine` attached, so its automation-health check is a
  no-op there by design — full self-monitoring (all three checks) is
  only available through the real scheduled job.
- Not built: any autonomous remediation (see above — the standing
  instruction not to automate destructive/consequential decisions is a
  hard boundary here, not a "future work" placeholder), configurable
  thresholds (the three constants are fixed, not exposed via env
  vars/config yet — no concrete need shown for tuning them per-
  installation), and expanding the checks beyond these three signals
  (e.g. company financial health, knowledge graph staleness) without a
  concrete case for what "unhealthy" means there yet.

---

## Vision (`core/vision/`)

**Decision:** image understanding via Claude's native multimodal support,
not a new OCR library or vision service. Built 2026-07-22, continuing past
this run's own numbered Phase 15 by identifying what a real AI operating
system still needs — this run's own judgment call, not a further
instruction-numbered phase.

- **Why this and not Communications/MCP/real web search next**: those
  three all need something this environment doesn't have — OAuth
  credentials for email/calendar, a concrete MCP server to connect to (a
  generic client with nothing real to talk to is unverifiable, speculative
  code), or a search API key for actual web search (the Phase 12 HTTP
  connector can fetch a *known* URL, but has no way to *discover* one).
  This run's own standing instruction was explicit: stop when credentials
  are required rather than build something that can't actually work.
  Vision has no such blocker — Claude's Messages API already accepts
  image content blocks, so this needed zero new credentials and zero new
  dependencies.
- **Lives only on `ClaudeProvider`, not the shared `BrainProvider`
  fallback chain**: that chain (`core/brain/provider.js`) exists for
  text-generation resilience — falling back to `local`/`openai` when
  Claude is unavailable. Silently falling back to a non-vision-capable
  provider for an image task would return a confident, wrong answer
  instead of a clear error, which is worse than just requiring Claude
  for this one capability. `analyzeImage()` is a new method on
  `ClaudeProvider` itself, called directly by `core/vision/engine.js`,
  not through `generate()`.
- **Same sandbox, same trust boundary**: images must live in
  `data/workspace/` — the exact sandboxed root `core/tools/handlers/
  filesystem.js` already established, with the same path-escape
  rejection logic. No new place an agent-controlled path could reach
  outside what's already trusted.
- **Same "record it like everything else" treatment**: every analysis
  becomes a `type: "technical knowledge"` memory entry (tagged `vision`)
  plus an `image`-type knowledge entity — reachable through
  `memory.search()`/the Persistent Context Engine and
  `knowledge.retrieve()`, not a one-off disconnected result.
- No dedicated dashboard routes or terminal commands — same reasoning as
  Phase 12's `obsidian.*`/`web.fetch`: `vision.analyzeImage` is an
  ordinary tool with no dependency needing a facade/lazy-require dance
  beyond the one already applied to its handler file, so it's already
  fully reachable through the existing generic `tools.run`/
  `POST /api/tools/:id/run` mechanism.
- Not built: video, PDF rendering-to-image, or any vision capability
  beyond single static images (no concrete need shown yet for the
  others), and a dedicated dashboard image-upload flow (images currently
  need to already exist in `data/workspace/` — uploading one there is a
  separate, unbuilt capability across every sandboxed tool, not specific
  to vision).

---

## File Intelligence (`core/integrations/fileIntelligence.js`)

**Decision:** closing the loop on a deferral this run made explicitly
back in "External Integrations" (Phase 12) — "filesystem intelligence...
deliberately deferred... no concrete need yet." Semantic memory (this
run's own Phase 14) now exists, but this module deliberately does *not*
reuse it (see below) — its value is indexing/searching arbitrary files,
not embeddings specifically. Built 2026-07-22.

- **Complements, doesn't replace, `core/integrations/obsidian.js`**:
  Obsidian's indexer is markdown/wikilink-specific (extracting `[[links]]`
  as graph relationships, scoped to one configured vault). File
  Intelligence is generic — any indexable text-based extension
  (`.js`/`.py`/`.json`/`.txt`/etc.), no wikilink assumption, scoped to
  `data/workspace/` by default (the same sandboxed root every filesystem-
  touching tool already uses) but any root can be passed explicitly.
  Neither module was refactored to share logic with the other — they
  solve adjacent but genuinely different problems (a vault's note-linking
  structure vs. an arbitrary directory's file contents), and forcing a
  shared abstraction now would be speculative generalization ahead of a
  second concrete use case for one.
- **Deliberately grep-based search, not semantic**: reusing `core/
  memory/embeddings.js`'s `EmbeddingIndex` for files would require a
  second embeddings namespace (keyed by file path, not memory entry id)
  sharing or separate from the existing one — a real design decision
  with no concrete need yet to resolve one way or the other. Grep-based
  case-insensitive content search is simpler, free (no API call), and
  already answers "which files mention X" — semantic file search is real
  future work if keyword search proves insufficient in practice.
  `searchFiles()` returns matching line numbers (like real `grep`), not
  just "this file matched," so a caller can actually locate the hit.
  `indexDirectory()`'s summaries are separate from search — indexing
  feeds memory/the Persistent Context Engine; search is a direct,
  synchronous file scan.
- **Oversized files are skipped, not truncated silently**: a file over
  200KB becomes one unreadably-huge 280-char summary if truncated
  blindly, which would misrepresent what's actually in it — skipping it
  (and reporting the skip count) is more honest than a summary that
  looks complete but isn't.
- **Found while writing tests, before it shipped**: the first draft of
  the `indexDirectory()` test asserted `filesFound >= 3` based on a
  miscount of the fixture files actually created in the test's temp
  directory (one indexable `.md`, one oversized `.txt` — only 2, not 3;
  `image.png` and the `node_modules` fixture are correctly *not*
  indexable/indexed). The test failed immediately, caught before any
  code shipped — corrected to match what the fixture actually contains
  rather than loosening the assertion to something meaningless.
- Same tool-registration treatment as `obsidian.*`/`web.fetch`/
  `vision.analyzeImage`: no dependency on `core/intelligence`, so no
  facade/lazy-require dance needed — reachable through the existing
  generic `tools.run`/`POST /api/tools/:id/run` mechanism.
- Not built: semantic file search (see above), file types requiring
  parsing beyond plain text (PDFs, binary formats, images — vision
  already covers the image case separately), and recursive size limits
  on the whole indexed set (only per-file size is capped; a workspace
  with thousands of small files would still create thousands of memory
  entries in one `indexDirectory()` call — no concrete case yet for a
  workspace that large).

---

## v1 release audit (2026-07-22)

**Decision:** before a public release, audited the whole repository
(not just this milestone's own additions) for duplicated code, dead
code, security posture, and performance waste, with a hard constraint
of zero behavior change and one commit per fix. Five fixes landed,
each its own commit:

1. Extracted the JSON-fence-strip-then-parse logic duplicated verbatim
   across `GoalDecomposer`, `MemoryConsolidation`, `LearningEngine`,
   and `CollaborationEngine` into `core/brain/parseJsonResponse.js`.
2. Removed `core/memory/context.js` (`MemoryContext`) — a pass-through
   wrapper around `core/memory/store.js` with one dead method
   (`remember()`, no callers) and one method (`retrieve()`) only ever
   reached through `core/memory/index.js`, which now calls `store`
   directly.
3. Removed `Agent.process()` (`core/agents/base.js`) and its dedicated
   test. This reverses the "keep it as a possible offline fallback"
   call made when `DepartmentManager.run()` was wired to real
   reasoning (see "Real Brain Reasoning" above) — its only remaining
   caller was its own test, so for a public release it's dead code
   rather than a kept capability.
4. `AutomationEngine.checkSchedules()` no longer writes state to disk
   on every idle tick (default every 30s) when no schedule fired.
5. Added a regression test sweeping every mutating dashboard route to
   assert it enforces `checkApiAuth()` — previously true only by direct
   code inspection, not guarded going forward. Also fixed one flaky
   test (`AutomationEngine` history-ordering) found while re-running
   the suite, caused by two ticks tying on millisecond-resolution
   timestamps.

**Found and deliberately left alone**, with reasoning:
- **Symlink-based sandbox escape**: the four path-sandboxed modules
  (filesystem tool, Obsidian, Vision, File Intelligence) all validate
  with `path.resolve()` + a `startsWith(root + sep)` check, which does
  not follow symlinks before comparing. In principle a symlink planted
  inside the sandboxed root pointing outside it could defeat the
  check. Not fixed: nothing in VERONICA's current tool surface can
  create a symlink, and this is a single-local-user system, not a
  multi-tenant one — adding `fs.realpathSync` resolution (and handling
  the "target doesn't exist yet" case for writes) is real complexity
  against a threat with no actual path to exploitation today. Worth
  revisiting if a tool is ever added that can create arbitrary
  filesystem entries, or if VERONICA ever runs on behalf of more than
  one user.
- **Large files**: `core/interface/terminal.js` (~880 lines),
  `dashboard/backend/server.js` (~950 lines), and
  `dashboard/frontend/app.js` (~1280 lines) are all long, but each is a
  flat sequence of well-commented, independent command/route/render
  blocks, not entangled logic — splitting them would be a purely
  cosmetic reorganization with real risk of introducing a mistake for
  no behavioral benefit, which conflicts with this pass's own "zero
  behavior change" constraint. Left alone.

---

## Company access control in the executive pipeline

**Decision:** `docs/PRODUCTION_READINESS.md` (Phase 10) documented a
real gap: `CompanyContext` (see "v1 release audit" above) enforces
isolation for a caller that deliberately constructs one, but nothing in
the actual executive pipeline — `ExecutivePlanner`, `GoalDecomposer`,
`ProjectManager`, `ExecutiveOrchestrator` — routed through it. A
company created with `allowedRoles` restricted nothing in practice,
because the pipeline a real operator session (or the autonomous
execution job) actually uses never checked it.

**Fixed** by adding `ExecutiveOrchestrator.authorizeExecution({
companyId, role, deviceRole, action })`, called at the top of
`executeTask()` — before the department is even looked up, so a denied
task never reaches `department.run()` at all. It validates four
things, each independently testable and each with its own denial
message:

1. **companyId** — if the task carries one (see decomposer.js's
   company tagging, added when the reasoning-context leak was fixed),
   `CompanyManager.context(companyId)` is asked for it, which throws for
   an unknown company. A task with no company at all skips this check
   entirely — there's nothing company-specific to validate.
2. **Identity (role + device)** — every execution has an acting role
   and an acting device role, resolved by `resolveActor()`: an explicit
   `actor` argument wins, otherwise it defaults to `{ role: "executive",
   deviceRole: device.currentIdentity().role }` — "the system itself,
   acting in its executive capacity, from this device," since there's no
   human login/session system for a more specific identity to come from.
3. **Role permissions** — the acting role must hold `execute_tools` at
   all (`identity.hasPermission`, see `identity/roles.json`), and
   separately, the acting device's role must too (`registry/
   devices.json` — a `"phone"`-role device is read-only by design and
   is rejected here even for an otherwise-valid role).
4. **Requested action** — must be one of a small, explicit, validated
   set (`VALID_ACTIONS = ["execute_task"]` today) rather than an
   arbitrary string, so a future action has to be deliberately added
   here rather than silently accepted.

Only after all four pass does the company-specific check run: if the
task is company-scoped, `CompanyContext.requirePermission(role)` (the
existing enforcement primitive from the company-isolation work) is
reused rather than duplicated — this is the actual gap closing: the
same rule a direct `CompanyContext` caller was already subject to now
also applies to every task the orchestrator executes.

A denial doesn't throw out of `executeTask()` — it's caught the same
way a thrown `department.run()` error already was, marks the task
`"blocked"` with an `"Access denied: ..."` note, and returns a distinct
`{ outcome: "denied" }` (not `"failure"`) so a caller can tell "wasn't
allowed to run" from "ran and broke." A denied task isn't a dead end:
running it again with a permitted actor succeeds normally, since
`"blocked"` isn't a terminal status (only `"completed"` is — see
`ProjectManager.updateStatus()`).

**Scope note:** this closes the gap specifically for the executive/
orchestrator pipeline (`pursue()` → `decompose()` →
`executeTask()`/`runNextReadyTask()`), which is what
`docs/PRODUCTION_READINESS.md` flagged and what "the primary execution
pipeline" refers to. Direct `DepartmentManager.run()` calls outside the
orchestrator (`CollaborationEngine.delegate()`/`review()`/`consensus()`,
the dashboard's direct `/api/departments/:id/run`) carry no company
scope in the first place — there's nothing for this check to enforce
there, since those operations were never company-scoped to begin with.

**Not fixed by this change** (still true, see
`docs/PRODUCTION_READINESS.md`): the knowledge graph still has no
company-level scoping at all, and this pass didn't add a real
human-identity/session system — `resolveActor()`'s default is still
"the system, acting for itself," which is honest about what VERONICA
actually models today rather than pretending to a login system that
doesn't exist.

10 new tests (`tests/company-access-control.test.js`): every
`authorizeExecution()` denial path independently (unknown action,
role without permission, device role without permission, unknown
company, restricted company with a disallowed role), the
unrestricted/no-company allow paths, and two `executeTask()`-level
integration tests confirming a denial never reaches `department.run()`
(verified with a spy) and that the same task succeeds on retry with a
permitted actor.

---

## Phase 11 — Executive Intelligence Layer

**Goal:** move VERONICA from a command-driven system (you ask, it
answers — plan a goal, decompose it, check the roadmap) to one that
proactively tells an operator what needs attention, ranked and
explained. Six pieces, all additive to the existing executive pipeline,
none replacing it:

1. **Priority ranking** (`core/executive/priorityRanking.js`)
2. **Goal monitoring** (`core/executive/goalMonitor.js`)
3. **Blocker detection** (`core/executive/blockerDetection.js`)
4. **Executive recommendations** (`core/executive/executiveRecommendations.js`)
5. **Daily briefing engine** (`core/executive/dailyBriefing.js`)
6. **Weekly operating reports** (`core/executive/weeklyReport.js`)

**"All decisions must be explainable" was the load-bearing requirement**
for how every one of these is built: 100% rule-based, zero LLM calls,
same reasoning `planner.js` already gave for why department assignment/
priority scoring is deterministic (cheap, synchronous, no brain mock
needed in tests) — and here, load-bearing for a different reason too:
an operator needs to be able to verify *why* something was flagged or
recommended, not trust a model's narration of it. Every finding carries
its own `reason`/`reasons` string(s) citing the exact numbers behind it
(days idle, dependency counts, urgency deltas) — nothing is "the system
thinks this matters," everything is "this matters because X."

### Why these don't duplicate what already existed

Three systems already did LLM-narrated synthesis over similar data —
`MemoryConsolidation` (nightly activity summary), `LearningEngine.recommend()`
(system/tool performance recommendations), and `SelfMonitor` (overdue-
deadline and failure-rate thresholds). Phase 11 deliberately doesn't
re-do any of them:

- **`priorityRanking.js` vs. `planner.js`'s stored `priority`**: the
  stored value is frozen at `plan()` time and never revisited — a
  project planned three weeks out doesn't get more urgent in the
  roadmap's own eyes as its deadline actually approaches.
  `PriorityRanking.score()` recomputes `ExecutivePlanner.urgencyScore()`
  fresh, against *today*, every time it's called — same formula,
  live input — plus two things the stored value never captured at all:
  a bonus for currently being blocked, and a bonus per other active
  project that depends on this one (found via `dependencies` fan-out
  across the roadmap).
- **`goalMonitor.js` vs. `selfMonitor.js`'s `checkDeadlines()`**:
  `checkDeadlines()` only flags a project once it's actually past its
  stated deadline. A goal with *no* deadline, or one still "on track" by
  the calendar, can still have gone completely silent — no status
  change, no task update — for reasons a deadline check can't see.
  `GoalMonitor` flags staleness (no activity in 5+ days) independent of
  deadline status entirely.
- **`blockerDetection.js`**: nothing before this collected every
  currently-`"blocked"` task into one place with how long it's been
  stuck, or noticed when a project is quietly *deadlocked* — every
  remaining task either blocked or waiting on an incomplete dependency,
  so nothing in it will ever become ready without intervention. Re-
  implements `ExecutiveOrchestrator.isReady()`'s exact readiness rule
  locally rather than depending on the orchestrator, which requires real
  departments this detector has no need for.
- **`executiveRecommendations.js` vs. `consolidation.js`'s
  `recommendations` field / `learning.recommend()`**: both of those are
  LLM-narrated prose. This is a rule-based synthesis of the three
  modules above into a short, concrete action list (resolve this
  deadlock, unblock this task, revisit this stalled goal, prioritize
  this high-urgency project) — no narration, no judgment call an
  operator can't independently verify against the underlying data.
- **`dailyBriefing.js` vs. `consolidation.js`**: consolidation looks
  *backward* at recent activity and narrates it via one LLM call.
  The daily briefing looks *forward* — what needs attention today — by
  assembling the four rule-based engines above into one snapshot, with
  zero LLM calls of its own.
- **`weeklyReport.js` vs. `consolidation.js`**: consolidation runs
  nightly and narrates; the weekly report runs weekly and *counts* —
  completed projects/tasks, new projects, blockers encountered, briefings
  and recommendations issued, and reuses `consolidation.history()`/
  `selfMonitor.history()` rather than re-gathering raw activity a second
  time.

### Design notes

- **None of the six need real departments.** Every one takes only
  `{ planner, projectManager }` (or composes the others, which
  themselves only need those two) — they're read-only/derived views over
  memory and the roadmap, exactly like `planner.roadmap()` or
  `orchestrator.report()` already are. This is why all five (priority
  ranking, goal monitor, blocker detector, recommendations, daily
  briefing) are constructed eagerly in `core/executive/index.js`'s
  facade alongside `planner`/`decomposer`/`projectManager`, and why
  `daily-briefing`/`weekly-report` could join `registerBuiltInJobs()`
  (always-on, module-load time) rather than needing the opt-in
  `registerExecutionJob()` treatment `execute-tasks` requires (see
  "Implement autonomous execution loop" above) — no departments, no LLM
  calls, nothing unattended to worry about.
- **Some scans are deliberately global, not scoped to one project** —
  `BlockerDetector.findBlockedTasks()` and half of `WeeklyOperatingReport`'s
  counts (`completedThisWindow()`'s task count, `blockersEncounteredThisWindow()`)
  read the *entire* memory store, not just one project's tasks, because
  a blocker detector or a weekly operating report is supposed to be
  system-wide by nature. This tripped up the first draft of the test
  suite: a test asserting an exact-zero count on a global scan broke the
  moment an *earlier test in the same file* had created a blocked task
  of its own (memory is shared across a test file's whole run, same as
  every other executive test file). Fixed by asserting presence/absence
  of *this test's own* entry (by id) or a before/after *delta* on global
  counts, rather than an absolute value — the same technique
  `tests/tools.test.js`'s `memory.overview` test already used for
  exactly this reason.
- **Persisted vs. live-only**: `recommendations`/`dailyBriefing`/
  `weeklyOperatingReport` persist a real memory entry every run (tagged
  `executive-recommendation`/`executive-briefing`/
  `executive-weekly-report` respectively) — these are the actual
  "insights stored in memory" this phase asked for. `priorityRank`/
  `goalIssues`/`blockers` are intentionally live-only (recomputed fresh
  on every call, like `planner.roadmap()` itself) — their output becomes
  part of the persisted daily briefing rather than being persisted
  redundantly on their own.
- **Staleness in tests needs a real old timestamp, and `memory.update()`
  won't give you one** — it always stamps `updated` to `Date.now()`
  regardless of what's in `changes` (see `core/memory/store.js`).
  Simulating a stale entry for `goalMonitor.js`'s tests means editing
  `database.json` directly (find the entry, backdate `updated`, write
  the file back) — the same direct-file-manipulation technique
  `tests/automation-engine.test.js` already uses to simulate a due
  schedule.

27 new tests across 6 new test files
(`tests/priority-ranking.test.js`, `tests/goal-monitor.test.js`,
`tests/blocker-detection.test.js`, `tests/executive-recommendations.test.js`,
`tests/daily-briefing.test.js`, `tests/weekly-report.test.js`), covering
every rule's explainability output, both the global-scan and scoped
behaviors above, and full persist/history round trips.

---

## Phase 12 — Memory Evolution

**Goal:** move memory from static storage (a 1-5 `importance` field,
set once) into an adaptive system: every entry is automatically
classified, scored 0-100 on six explainable factors, and moves through
a lifecycle (`temporary` -> `active` -> `persistent`, or -> `archived`)
as its value becomes clearer over time.

- **`core/memory/memoryClassifier.js`**: `core/memory/classification.js`
  already mapped `type` to one of the four classes (episodic/semantic/
  procedural/organizational) as a read-only reporting layer.
  `MemoryClassifier` is that same table used *automatically at write
  time*, plus two tag-based overrides the type-only table can't see: any
  `company:<id>` tag forces `organizational` regardless of type, and a
  `workflow`/`process`/`howto`/`procedure` tag forces `procedural`.
- **`core/memory/memoryImportanceEngine.js`**: a 0-100 score across six
  independently-legible factors that sum to exactly 100 at max —
  explicit importance (30), repetition via shared tags (15), business
  impact via company tags or business-typed entries (15), knowledge-
  graph connections (20, matching the entry's own `content` against
  graph entity names — real for goals/projects/companies, whose
  `content` literally *is* their entity name; correctly zero for
  one-off personal notes that were never added as entities), future
  retrieval value via type/tag-diversity proxy (10), and recency (10,
  linear decay over 30 days). `score()` always returns the full
  breakdown alongside the total — "explainable" isn't optional here.
- **`core/memory/memoryLifecycle.js`**: `nextStage()` only promotes
  (never demotes on score alone — an already-`persistent` entry stays
  there even if a later sweep scores it lower) except one explicit rule:
  a low-scoring entry untouched for 60+ days gets archived regardless of
  its current stage. `run()` re-classifies and re-scores *every* entry
  in one sweep and persists the result — this is deliberately periodic,
  not recomputed on every `remember()`/`update()`: re-scoring one entry
  is cheap, but scanning every entry's connections/repetition on every
  single write would make ordinary operations
  (`ProjectManager.updateStatus()`, etc.) pay a cost unrelated to what
  they're doing.

**Wiring (the three explicit connections this phase asked for):**
- **Knowledge graph**: a newly-`persistent` entry gets a graph entity
  (deduped by name, same as everywhere else) plus a `classifiedAs`
  relationship to its memory class — persistent memories become
  discoverable through `knowledge.retrieve()`, not just memory search.
- **Executive intelligence / daily cycle**: `core/executive/dailyBriefing.js`'s
  `run()` now also calls `memory.runLifecyclePromotion()` and includes
  the transitions on the persisted briefing. This IS "the daily cycle"
  at this point in the roadmap (Phase 14 builds the full morning/evening
  cycle on top of it) — reusing it here means memory evolution rides
  the same daily cadence an operator already reads, rather than needing
  a second thing to check.

**`core/memory/index.js`'s `remember()`** now does two disk writes
(`store.remember()` then `store.update()` with the classification/score/
`lifecycle: "temporary"`) instead of one — needs the entry's real id
before classification metadata can be attached, and every mutation in
this system already rewrites the whole file regardless, so this isn't a
new class of inefficiency.

**Found and fixed along the way**: the three original bootstrap memory
entries (from the very first commit, before `metadata` existed as a
concept at all) had `metadata: null`, not `{}` — nothing before this
phase ever unconditionally dereferenced `entry.metadata.<field>`, so it
was a latent gap `store.js`'s migration path never caught. Fixed by
extending `load()`'s existing legacy-migration pass (which already
backfills entries with no `id`) to also backfill a missing/null
`metadata` to `{}`, persisted once and self-healing for any future
reader, not just this one.

24 new tests across three new test files
(`tests/memory-classifier.test.js`, `tests/memory-importance-engine.test.js`,
`tests/memory-lifecycle.test.js`), plus two integration tests added to
`tests/daily-briefing.test.js` confirming the daily-cycle wiring.

---

## Phase 13 — Personal Operating Profile

**Goal:** VERONICA understands the operator specifically, not just the
roadmap in the abstract. `core/profile/personalContextEngine.js`'s
`PersonalContextEngine` is deliberately distinct from
`core/context/engine.js`'s `ContextEngine` (per-query reasoning context)
— this is about the operator, persisted across every call, split
between explicit facts (`core/profile/veronica.profile.json`: identity,
preferences, working style, important relationships, long-term
objectives — settable via `set(path, value)`/`add(field, value)`) and
things already derivable live from systems this codebase already built
rather than duplicated into the static file: active goals
(`ExecutivePlanner.roadmap()`), important context (Phase 12's
`persistent`-lifecycle memories, VERONICA's own already-computed
judgment of what matters), recent decisions (`type: "decisions"` memory
entries), and recommended focus (Phase 11's `PriorityRanking.rank()`
top item).

**`resolvedIdentity()`** doesn't fabricate an operator identity: an
explicit `profile.identity.name` always wins; failing that, it checks
whether the knowledge graph has *exactly one* `"person"`-type entity —
if so, that's a real, already-recorded fact worth surfacing as a
default (not a guess invented here), source-tagged
`"derived from knowledge graph"` so it's clear where it came from. More
than one person entity is ambiguous (could be a client/employee, not
the operator) and is left unset for the operator to state explicitly.

**`veronica.profile.json` is gitignored from the start** (added to
`.gitignore` in the same commit that introduces the file) — this is
real, personal operator data, and Phase 10's security audit already
established why that class of file shouldn't be tracked; no reason to
repeat that mistake for a new file when the lesson is already learned.

**Terminal**: the phase brief's literal wording was `veronica profile`
(space-separated), but every other command in this terminal uses dot
notation (`executive.plan`, `memory.overview`, etc.) — `veronica.profile`
matches the codebase's own established convention instead, plus
`veronica.profileSet <path> <value>` / `veronica.profileAdd <field>
<value>` for editing. Output format matches exactly what was asked:
`Current mission: / Active goals: / Important context: / Recent
decisions: / Recommended focus:`.

**Found and fixed a real, more serious bug while wiring this in**:
`core/tools/handlers/profile.js`'s first draft required
`PersonalContextEngine` at module top level. `PersonalContextEngine`
depends on `PriorityRanking` -> `ProjectManager` -> `GoalDecomposer` ->
`core/intelligence` -> `core/brain` -> `ClaudeProvider` -> `core/tools`
— a top-level require closed that exact circular loop while
`core/tools` was still mid-load, the same bug class documented
repeatedly in "Goal Decomposition Engine" above. Fixed the same way
`core/tools/handlers/executive.js` already does: the require moves
inside a lazy getter, only ever actually executed once a tool is
invoked, long after module loading has finished.

**Also found and fixed, unrelated**: three help-text updates across
Phases 11 and 12 (`memory.overview`, `device.identity`,
`executive.selfMonitorHistory`) had used `replace_all` on a short bare
command name to insert new lines into the terminal's help listing. Each
of those same bare strings also appeared inside that command's own
`command === "..."` handler condition, which `replace_all` doesn't
distinguish from "the line in the help list" — it corrupted all three
handlers by inserting the multi-line replacement text inside their
string literals, breaking the closing quote. This shipped across two
prior commits without being caught, because nothing in the test suite
requires or executes `core/interface/terminal.js` at all (it's a CLI
entry point, not a module anything imports) — `npm test` staying green
never actually verified this file parses. Caught only while touching
this file again for Phase 13, via `node --check` (which should be, and
now is, run after every edit to this file, not just assumed fine
because the rest of the suite passed). Fixed by restoring each
corrupted handler to its single-line form, verified both with
`node --check` and by actually booting the terminal and running the
affected commands end to end.

9 new tests (`tests/personal-context-engine.test.js`). Wired into the
personal-context/tool/dashboard/terminal surfaces the same way every
prior phase's capabilities were.

---

## Phase 14 — Daily Operating System

**Goal:** the morning half of the daily cycle already existed (Phase
11's `DailyBriefingEngine`) — this adds the evening half
(`core/executive/dailyReview.js`'s `DailyReviewEngine`) and a thin
orchestrator over both (`core/executive/dailyCycle.js`'s
`DailyCycleEngine`), rather than rebuilding the morning side.

**`DailyReviewEngine`** looks backward at today and one step forward to
tomorrow: `completedToday()`/scans project/milestone/task history for
`to === "completed"` transitions today (same technique
`weeklyReport.js`'s `blockersEncounteredThisWindow()` already
established); `failedToday()` reads real execution failures from
`core/learning/log.js`'s raw telemetry (not memory — see that file's
own header comment for why); `learnedToday()` surfaces today's actual
recommendation details (Phase 11) rather than a fabricated "insight";
`newMemoriesToday()` counts today's memory creations; `tomorrowPriorities()`
reuses Phase 11's live priority ranking. Persisted with `type: "personal"`
and tagged both `"daily-review"` and `"organizational"` — this phase's
own framing said "organizational/personal," and a daily review is
genuinely both: the operator's own end-of-day reflection, covering
organizational activity.

**`DailyCycleEngine`** is intentionally thin — `runMorning()`/`runEvening()`
just delegate to the briefing/review engines. **Documented limitation,
not a fake solution**: `core/automation/engine.js`'s scheduler is purely
interval-based ("every N ms since last run"), with no time-of-day
concept at all — there's no real "run at 8am" vs. "run at 6pm" to wire
morning/evening into yet. Both `daily-briefing` and the new
`daily-review` automation jobs run on the same 24h interval, just from
whenever each was first registered. Real clock-time scheduling would
need to be added to `AutomationEngine` itself; noted here rather than
pretended around.

7 new tests (`tests/daily-review.test.js`), covering every field
(including the "presence"/"delta" assertion style for the two
genuinely global scans — `failedToday()` over the shared execution log,
`newMemoriesToday()` over the shared memory store — the same lesson
learned in Phase 11's blocker detection tests) plus the cycle
orchestrator. Wired into the executive facade, 4 new tools, dashboard
(route + widget + trigger form), the `daily-review` automation job, and
terminal commands.

---

## Phase 15 — Controlled Autonomy

**Goal:** complete the pipeline the last few phases built toward:
Observation (Phase 11's `PriorityRanking`/`GoalMonitor`/`BlockerDetector`)
-> Recommendation (Phase 11's `ExecutiveRecommendationEngine`) ->
**Proposal** -> **Approval** -> **Execution** — the last three steps,
added here in `core/executive/actionProposal.js`'s `ActionProposalEngine`.

**The hard rule — "no autonomous external actions without approval" —
is enforced structurally, not by convention**: `execute(id)` throws
unless the proposal's persisted `status` is exactly `"approved"`.
There is no code path that skips this check. `approvalRequired` is a
real, varying field (computed per action kind, not hardcoded `true`) —
it signals review urgency to a human (does this action change real
roadmap state, or is it purely informational), but it does **not**
bypass the approval gate itself, which is unconditional either way.
Only `"high_urgency"` proposals (informational only — the project is
already correctly prioritized, executing it is just an acknowledgment
with no state change) have `approvalRequired: false`; every action that
actually touches roadmap state (`resolve_deadlock`, `unblock_task`,
`revisit_stalled_goal`) requires it.

**Proposal shape** matches what was asked (`{ id, action, reason,
department, risk, approvalRequired, status }`), plus `subject` (which
task/project the action applies to — needed to actually perform it,
not in the literal spec but a natural implementation necessity) and
timestamps. Statuses: `pending -> approved/rejected -> executed`, with
`approve()`/`reject()` both requiring the proposal currently be
`"pending"` (a decided proposal can't be re-decided) and `execute()`
requiring `"approved"`.

**`performAction()` is deliberately administrative, not a second
execution pipeline**: it changes roadmap *status* (e.g. resetting a
blocked task back to `"planned"`), handing eligible work back to the
**normal** orchestrator/automation flow — which is already authorized
per its own rules (`ExecutiveOrchestrator.authorizeExecution()`, Phase
10) — rather than dispatching department work directly from here. This
avoids building a second, parallel authorization system when one
already exists and is already tested.

If `performAction()` itself throws (e.g. the underlying project got
independently completed in the meantime), the proposal stays
`"approved"` rather than transitioning to a broken `"executed"` state —
retriable, not a dead end, same philosophy as a blocked task elsewhere
in this system.

6 new tests (`tests/action-proposal.test.js`), including a full
approve -> execute round trip that verifies the real task got unblocked
via the real `ProjectManager`, not just that the proposal's own status
field changed. Wired into the executive facade, 5 new tools (approve/
reject/execute gated at `manage_agents`, matching
`executive.updateStatus`'s existing permission level for consequential
state changes), dashboard (routes + widget + two trigger forms), and
terminal commands.

---

## Phase 16 — Device Network

**Goal:** `core/device/deviceManager.js`'s `DeviceManager` — `registerDevice()`/
`heartbeat()`/`deviceStatus()`/`assignRole()`, with the schema asked for
(`id`/`name`/`type`/`role`/`capabilities`/`lastSeen`/`status`).

**Distinct from `core/device/registry.js`'s existing known-devices
roster on purpose**, not a duplicate: `registry.js` is specifically
"which other devices have I ever synced with, and when" (sighting
history, written by `core/device/sync.js`, schema `firstSeenAt`/
`lastSeenAt`/`syncCount`). This is a general-purpose device network
with a materially different schema (`lastSeen` not `lastSeenAt`, plus
new `type`/`capabilities`/`status` fields neither `registry.js` nor
`core/device/index.js`'s own device identity ever tracked). Rather than
overload one file with two schemas two different modules both write to
— a real risk of the two colliding — this keeps its own file
(`core/device/network.json`, gitignored like `device.local.json`/
`known-devices.json` already are). `registry.js` is untouched.

**`type` and `role` share the same vocabulary** (`registry/devices.json`'s
roles, now extended with `"chromebook"` alongside the existing laptop/
desktop/phone/server — the fourth device category this phase asked to
prepare support for) but aren't required to be the same value — a
laptop could plausibly be assigned role `"server"` if it's being used
as one. `"chromebook"` was given the same permissions as `"phone"`
(`read_memory`, `sync`) as a conservative default: real Chromebook
support depends on whether Linux/Crostini is available to run VERONICA
natively vs. only reaching the dashboard through a browser, which this
phase can't determine — the role exists and is ready to adjust once
that's known.

**`deviceStatus()` recomputes a live status from real elapsed time**
(15-minute online threshold, same explainable-threshold convention as
`goalMonitor.js`'s `STALE_DAYS`) rather than trusting whatever the
stored `status` field last said — a device that heartbeated an hour ago
and hasn't since is not still "online" just because nobody told it
otherwise.

**Not wired into the dashboard's UI in this phase** — Phase 17
("Command Center Dashboard") explicitly asks for a "Device network"
view; building a widget here and then rebuilding it properly in Phase
17 would be redundant. The API route (`GET /api/devices/network`, plus
register/heartbeat/role POST routes) is ready for Phase 17 to use.

7 new tests (`tests/device-manager.test.js`). Wired into the dashboard
(routes) and terminal commands; no generic tool registry entries --
matching the existing precedent that `device.identity`/
`device.capabilities` are terminal+dashboard only, not exposed as
tools either.

---

## Phase 17 — Command Center Dashboard

**Goal:** add the four named views that didn't already exist (Executive
view and Memory view already did, across Phases 9/11/12) — Goal view,
Agent network, Device network, Action approvals — as a new "Command
Center" dashboard panel, plus the API routes behind them.

- **`GET /api/goals/overview`**: the roadmap with real per-project
  progress (`ProjectManager.progress()`, via `getProject()`) attached —
  visible without looking each project up individually.
- **`GET /api/agents/network`**: every agent plus its real knowledge-
  graph connections (`knowledge.connections(agent.name)` — delegations,
  reviews, messages from `core/collaboration/engine.js`) — actual
  relationships, not just the flat roster `GET /api/agents` already
  gave.
- **`GET /api/devices/network`**: Phase 16's `DeviceManager.networkStatus()`,
  finally wired into the dashboard (deferred there specifically so it
  wouldn't be built twice).
- **`GET /api/executive/proposals?status=pending`**: the existing
  Phase 15 route, extended to support a `?status=` filter — required
  changing the route dispatcher itself (`ROUTES[routeKey]()` ->
  `ROUTES[routeKey](parsed.searchParams)`), since no GET route had ever
  needed a query parameter before. Backward compatible: every existing
  route function takes no parameters, so the extra argument is simply
  ignored by all of them.

**A genuinely overlooked bug caught while adding this**: the new
`GET /api/devices/network` route bootstraps `core/device/network.json`
on first read (same lazy-create pattern as `core/memory/store.js`'s
`ensureFile()`) — meaning `tests/dashboard.test.js` now creates that
real file as a side effect of testing a GET route, the same class of
issue this test suite has hit repeatedly for other real files
(`docs/Architecture.md`'s "Learning Engine"/"Production Hardening"
sections). Given the established backup/restore discipline, added the
same treatment here rather than letting it slip through as residue.

4 new tests (`tests/dashboard.test.js`) covering the new/extended
routes' response shape. No new automated tests for the frontend
widgets themselves — verified with `node --check`, a real server
instance confirming every new route, and cross-checking every new
element id against `index.html`, same verification level as prior
dashboard-only phases (no headless browser available in this
environment).

## Phase 18 — Real World Readiness Audit

Audit-only, no code. Documented (in `docs/REAL_WORLD_READINESS.md`,
`docs/EXTERNAL_DEPENDENCIES.md`, `docs/NEXT_HUMAN_ACTIONS.md`) what
VERONICA could and couldn't do alone at that point, and the first
ordered human action (`API_TOKEN`). Test count unchanged (324).

## Phase 19 — External Integration & Operational Deployment

**Goal:** connect VERONICA to the real world (GitHub, Discord, Google
Workspace) by extending the existing connector/approval/memory/
executive architecture — explicitly not redesigning it or building a
second parallel system anywhere. Full connector-level detail lives in
the new `docs/EXTERNAL_INTEGRATIONS.md`; this section covers the
architectural decisions.

**Audit first.** Before writing any code, the existing pieces this
phase would extend were read end to end: `core/integrations/` (github.js/
discord.js were already real; calendar.js/email.js/cloudStorage.js were
interface-only placeholders), `core/integrations/registry.js` (the
dashboard's one status-aggregation point), `core/executive/actionProposal.js`
(the existing pending→approved→executed pipeline — internal roadmap
actions only, until this phase), `core/automation/jobs.js` (the
interval-based job registration pattern every new polling job follows),
`core/memory/index.js`'s `remember()` (Phase 12's classification/
scoring/lifecycle — the "existing memory ingestion pipeline" this
phase's own instructions said to reuse, not rebuild), and `.env`
(confirmed, without ever printing a value, that none of `GITHUB_TOKEN`/
`DISCORD_BOT_TOKEN`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
`GOOGLE_REDIRECT_URI` were set — real credentials were never a
precondition for building real, tested code, per the same reasoning
Phase 7 already established for GitHub/Discord).

**Credential Manager** (`core/integrations/credentialManager.js`, new):
one static map of every credential this system knows about (10
connectors: claude, openai, github, discord webhook, discord bot,
google, calendar/email/cloudStorage placeholders), `validateStartup()`
(logs which vars are missing, by NAME only, never a value; disables only
that connector; never throws), `statusFor()`/`isConfigured()`/`overview()`.
Every existing connector's own `isConfigured()` was refactored to
delegate here instead of independently repeating
`Boolean(process.env.X)` — a pure internal refactor, same env vars, same
true/false results, one source of truth instead of five.

**GitHub extended**, not replaced: `listBranches()`/`listCommits()`/
`listPullRequests()` (new real REST endpoints, same bearer-token
pattern as the pre-existing `getRepo()`/`listIssues()`/`createIssue()`),
`repositoryHealthSummary()` (combines repo/issues/pulls into one
snapshot — open counts, default branch, a `stale` flag off `pushed_at`),
and `pollRepository()` — ingests new open PRs/issues as external events
via the new shared ingestion pipeline (below), deduped by a synthetic
`externalId` (`pr:owner/repo#N` / `issue:owner/repo#N`) so a job that
runs on an interval never re-ingests the same item. `GITHUB_WATCHED_REPOS`
(a new, plain — not secret — comma-separated env var) tells the new
`github-poll` automation job (15 min interval) which repos to watch;
absent, the job is a clean no-op, never an error.

**Discord: two connectors, deliberately not merged.** The pre-existing
`core/integrations/discord.js` (an outgoing webhook, `DISCORD_WEBHOOK_URL`)
is untouched except for delegating to credentialManager and adding
connect/error logging. A genuinely different capability — real-time
slash commands, a persistent bidirectional session — needed a different
mechanism entirely, and here this phase hit its one real architecture
fork: a Discord bot needs either a persistent Gateway connection or a
publicly-reachable HTTPS Interactions endpoint, and this project's
standing "no new npm dependencies beyond `@anthropic-ai/sdk`/`dotenv`/
`openai`" principle doesn't have a way to build either without either
(a) a public HTTPS endpoint this VERONICA instance doesn't have by
default (`DASHBOARD_HOST` defaults to `127.0.0.1`), or (b) hand-rolling
Discord's own Gateway wire protocol using Node's built-in `WebSocket` —
both real options, both weighed. Presented as an explicit
`AskUserQuestion` (a new dependency being exactly the kind of decision
this session's standing instructions require surfacing rather than
deciding unilaterally); the project owner chose the third option —
**add `discord.js` as a real, explicit exception** to the no-new-
dependencies principle. `core/integrations/discordBot.js` is the result:
real login via `DISCORD_BOT_TOKEN`, slash command registration via
`DISCORD_CLIENT_ID` (optional — the bot still logs in and sends messages
without it), every incoming slash-command interaction ingested as a
VERONICA event and replied to directly. `start()` takes an injectable
`clientFactory` specifically so tests exercise the real event-handling/
ingestion/status logic against a fake, event-emitter-shaped stand-in
without ever opening a real Gateway connection — no test in this
codebase makes a real network call to Discord.

**Google Workspace** (`core/integrations/google/`, new): a hand-built
OAuth2 authorization-code flow (`oauth.js`) rather than the `googleapis`
package — Google's OAuth and Gmail/Calendar/Drive REST APIs are plain
HTTPS + JSON, no different in kind from the GitHub REST API
`github.js` already talks to directly with the existing `http.js`
primitive. Introduces a two-state model this project hadn't needed
before: `isConfigured()` (env vars present — an app registration exists)
is explicitly distinct from `isAuthorized()` (a real human has completed
Google's own consent screen in a real browser and a real refresh token
is on disk) — unlike GitHub/Discord's simple bearer-token model, where
"configured" and "usable" are the same thing, Google's flow has a
step in the middle only a human can complete, and no code path in this
codebase can complete it (that's the entire point of OAuth). Read-only
Gmail (`gmail.js`)/Calendar (`calendar.js`)/Drive (`drive.js`)
connectors and a polling module (`poll.js`, feeding the same shared
ingestion pipeline, gated on `isAuthorized()` not just `isConfigured()`)
complete the connector; a new `google-poll` automation job (15 min)
runs it. Real tokens persist to `core/integrations/google/tokens.json`
— gitignored, the most sensitive file this project has generated, never
logged, never committed.

Two real bugs found and fixed during this work, both via test-driven
discovery (a failing test was investigated as a real bug, not adjusted
to match broken behavior, per this project's established practice):
(1) `tokens.expires_in || 3600` treated an explicit `expires_in: 0` (an
already-expired token, deliberately used in a test) as "not provided,"
silently defaulting to a full extra hour of assumed validity — fixed to
`Number.isFinite(tokens.expires_in) ? tokens.expires_in : 3600`.
(2) `gmail.js`'s `getMessage()`/`getAttachment()` and `drive.js`'s
`getFileMetadata()` were plain (non-`async`) functions whose own
validation (`if(!id) throw ...`) threw synchronously rather than as a
promise rejection — the exact bug class already fixed once for
`http.js`'s `request()` in Phase 7 — fixed by declaring all three
`async`, so any throw inside automatically becomes a rejection.

**Event ingestion pipeline** (`core/integrations/eventIngestion.js`,
new): the one normalization point every connector event flows through —
a GitHub commit/PR, a Discord message, a Gmail email, a Calendar event,
a Drive file — each tagged `external-event`/`source:<connector>`/
`kind:<event kind>` and handed to the **existing** `memory.remember()`
(Phase 12's classification/importance-scoring/lifecycle). This phase's
own instructions were explicit — "use existing memory evolution
architecture, do not build another memory system" — so every ingested
event is a completely ordinary memory entry, indistinguishable in
storage from anything else `remember()` already handles.
`recentEvents()` gives executive code one place to ask "what's new from
outside" without knowing about each connector individually.

**Approval pipeline extended, not duplicated.** This phase's own
instructions required reusing the existing framework: "VERONICA may
observe/recommend/prepare actions but may NOT send email, push code,
merge PR, delete files, modify repositories, or post externally unless
explicitly approved." `core/executive/actionProposal.js` gained
`proposeExternalAction()`/`executeExternal()` — the same memory-backed
pending/approved/rejected/executed status machine as the existing
`fromRecommendation()`/`execute()`, same unconditional "must be
approved" gate, but kept as a **separate async method** rather than
making `execute()`/`performAction()` themselves `async`: those are
exercised synchronously by every existing internal action kind
(`unblock_task`/`resolve_deadlock`/`revisit_stalled_goal`/`high_urgency`)
and by tests using `assert.throws()`/plain synchronous returns — changing
that signature would have broken passing tests for no behavioral gain.
Only two external actions are wired to a real connector call:
`create_github_issue` (→ `github.createIssue()`) and
`post_discord_message` (→ the webhook connector's `sendMessage()`).
`send_email`/`push_code`/`merge_pr`/`delete_file` are deliberately
**not** in the action vocabulary at all — no connector in this codebase
can perform those writes yet, and fabricating an approval path for a
capability that doesn't exist would violate this phase's explicit "do
not create placeholders pretending to work" instruction.

**Executive awareness extended.** `DailyBriefingEngine.generate()`
(last 24h), `DailyReviewEngine.generate()` (today), and
`WeeklyOperatingReport.generate()` (7-day window, grouped by source)
each gained an `externalEvents`/`externalEventsToday`/
`externalEventsThisWindow` field, all reading through
`eventIngestion.recentEvents()` — a pure read-side addition, no change
to how any of the three persist their own artifacts.

**Registry and boot sequence.** `core/integrations/registry.js` gained
two entries (`discordBot`, `google`) alongside the existing eight — `GET
/api/integrations` now reports 10 connectors, real status only. Both
`dashboard/backend/server.js` and `core/interface/terminal.js` call
`credentialManager.validateStartup()` at real boot (guarded behind
`require.main === module`/module-load respectively, so requiring either
file from a test never logs startup noise or starts anything). The
dashboard's real boot path also calls `discordBot.start()`
(non-blocking `.catch()` — a bad token or network outage logs an error
and leaves the bot disconnected, it never crashes the dashboard). Two
new dashboard routes complete Google's OAuth flow end to end:
`GET /api/integrations/google/auth-url` (step 1) and
`GET /api/integrations/google/callback` (step 2 — deliberately NOT
gated behind `API_TOKEN`, since Google's own redirect carries no bearer
token and completing consent in a real browser IS the human-authorized
action).

51 new tests (324 → 375): credential presence/absence/multi-var
reporting, Google OAuth's full flow (configure → auth URL → exchange →
auto-refresh → three-state `status()`), GitHub monitoring/health-
summary/polling with dedupe, a fully faked (never network-connecting)
Discord bot client exercising real event-handling/ingestion/status/
send logic, the shared event ingestion pipeline (validation, defaults,
scoping, sorting, limiting), the two new external `ActionProposal`
kinds end to end (propose → approve → execute → real connector call,
including a real connector failure surfacing as a rejection rather than
a false "executed" status), Google Workspace polling with dedupe across
all three services, the two new dashboard OAuth routes, and the three
executive-awareness extensions. All pre-existing tests continue to
pass unmodified except where a test's own exact-match assertion needed
updating to account for new registry entries (e.g. the connector-count/
id-list assertions in `tests/integrations-connectors.test.js`).

## Phases 20-24 — Capability Expansion, Mac Resident System, Integration Framework, Self-Management, Command Center extension

**Goal:** the foundation for VERONICA to install and manage new
capabilities as packages ("VERONICA, create a trading division" ->
capability-gap analysis -> installation plan -> real installed
capability), a real macOS user-level startup mechanism, and the
self-management/reporting pieces that tie the whole system's real
status together — without redesigning any existing system to get there.
Full detail in `docs/CHANGELOG.md`'s per-phase entries; this section
covers the two decisions worth explaining.

**Approval reuse, again.** `core/capabilities/installer.js`'s
approval-gated install path (a package whose manifest sets
`"approvalRequired": true`) creates a proposal via the SAME
`ActionProposalEngine.proposeExternalAction()` Phase 19 built for
`create_github_issue`/`post_discord_message` — a new `install_capability`
action, `"high"` risk (installing a package can grant new tool
permissions), nothing structurally new. The one wrinkle: `installer.js`
needs to create a proposal (requiring `core/executive/actionProposal.js`),
and `actionProposal.js`'s `performExternalAction()` needs to call back
into `installer.js` to actually perform the install once approved —
a genuine two-way dependency, resolved the same way every other
circular-require risk in this codebase is (see "Goal Decomposition
Engine" above): both requires are lazy, inside function bodies, never
at module top level.

**One real example package, not five fake departments.** The Phase 20
prompt's own illustrative examples (`packages/trading/`,
`packages/marketing/`, etc.) were illustrative, not literal asks — and
building five business-department stubs with agents that don't actually
do anything would be exactly the "don't fabricate integrations, don't
create placeholders pretending to work" failure mode Phase 19 was
explicit about avoiding. `packages/example/` is instead one real,
minimal package (one agent with a real prompt file, one tool with a
real, working handler) that proves `installer.install()`'s entire
pipeline — validate, snapshot, real health check (`require()`-ing the
package's own files, catching a genuine syntax error), activate,
rollback-on-failure — end to end. `core/capabilities/planner.js`'s
`CAPABILITY_CATALOG` still names the illustrative domains (trading,
marketing, finance, research, real estate) so the gap-analysis example
interaction works, but building a REAL package for any of them is
future work, honestly flagged as such in `docs/CHANGELOG.md` and
`docs/NEXT_STEPS.md` rather than implied to already exist.

**What's deliberately NOT done yet**: installed packages' agents/tools
aren't hot-wired into the live `loadAgents()`/`loadTools()`/
`loadDepartments()` roster — those three loaders are unchanged, still
reading only the static `registry/*.json` files. `docs/NEXT_STEPS.md`
names this as the single highest-value next increment, with the exact
extension point in each loader.

**Mac Resident System** (`core/system/startupManager.js`): explicitly
scoped to spawning/monitoring one already-existing process
(`dashboard/backend/server.js`) — no new capability of its own, and no
touching of sleep/shutdown/battery/power-management settings, per this
phase's own explicit constraint. The LaunchAgent
(`config/com.veronica.agent.plist`) is a template; actually installing
it (`scripts/install-launch-agent.sh`) changes the machine's real login
behavior, so — consistent with this whole project's standing posture on
actions with effects outside the repo — it's a manual, opt-in script,
never executed automatically as part of this work.

28 new tests (375 → 403) across all five phases: the capability
install/upgrade/rollback pipeline end to end (including a real
approval-gated install and a real syntax-error health-check failure),
the startup manager's crash/backoff/restart-limit logic against a faked
child process plus a real ephemeral HTTP server for the health-check
path, the new `lastSync` registry field, the system report's three
questions, and the new dashboard routes verified against a real running
server instance.

## Phases 25-32 — Engine to Operating System

**Goal:** the shift this arc's own framing named -- not "build more
features," but take VERONICA from an engine (you ask, it answers,
capabilities are static) to an operating system (capabilities activate
themselves, plan themselves, research what they don't know, evaluate
themselves, and compose into missions and an organization-wide view).
Eight phases, one theme: every one of them is a real extension of an
already-existing system, never a parallel one. Full per-phase detail in
`docs/CHANGELOG.md`; this section covers what required real judgment.

**Phase 25 closed Phase 20's own known gap** (named explicitly in
`docs/NEXT_STEPS.md` at the time): `core/capabilities/activation.js` is
now the single source of truth `core/agents/loader.js`/
`core/tools/loader.js`/`core/departments/loader.js`/
`core/automation/jobs.js` all pull from, so an installed, active
package's agents/tools/department/automations become real, live
instances -- not just a registry entry. This was safe to verify against
the FULL existing test suite precisely because zero active (non-core)
packages is the state every existing test already runs in: the change
is provably additive (empty arrays in, identical behavior out) rather
than something that had to be reasoned about from first principles.

**Phase 27's builder produces skeletons, and says so, everywhere.**
This phase's own prompt used the words "Agent Skeletons"/"Tool
Skeletons" -- language this implementation took literally rather than
building five illustrative business departments (trading/marketing/
finance/research/real_estate) that don't actually do anything. A
generated tool's handler body is `throw new Error("...is a generated
skeleton...")`, not a canned success response -- calling it fails
loudly, which is the honest behavior for code that doesn't exist yet.
Two real, non-obvious bugs surfaced here (both fixed, both worth
remembering for any future template-generation work in this codebase):
a relative require path computed assuming the package lives under the
default `packages/` directory breaks the moment a caller (a test, or a
future different install location) uses a different output root; and
`fs.mkdtempSync()` on macOS returns a path through the `/var` symlink
while Node's own module resolver resolves through the realpath
`/private/var` -- a relative path computed from the pre-realpath string
is silently one directory-segment short. Both fixed by computing every
generated file's require path dynamically, from real, realpath-
normalized locations, at generation time -- never a hardcoded depth
assumption.

**Phase 29's Research Engine requires a real URL, on principle.** There
is no web-search connector anywhere in this codebase. Giving this engine
a bare topic name and having it "research" anyway -- inventing
documentation content that was never actually fetched -- would be
indistinguishable from fabrication, exactly what this project's
standing instructions have prohibited since Phase 19. Requiring a real,
fetchable URL keeps every stored piece of research knowledge honestly
attributable to a real source, even though it means the engine can't
answer "look into X" without being told where to look.

**Phase 31's Mission Engine and Phase 32's Organization Overview are
both, deliberately, composition rather than construction.** Neither
file implements a new planning algorithm, a new health metric, or a new
knowledge-graph query -- `MissionEngine` wires together
`ExecutivePlanner`/`GoalDecomposer`/`ProjectManager`/
`ExecutiveRecommendationEngine`/the capability planner exactly as each
already worked in isolation; `OrganizationOverview` reads twelve
already-existing systems and reports on them. This was the direct,
literal reading of both phases' own instructions ("integrate with the
existing executive planner," "avoid duplicate implementations, prefer
extending existing abstractions") -- and it meant the actual
implementation risk in both files was almost entirely in getting field
names/shapes right against the real systems being composed (see the
`task.effort.hours` vs. `task.estimatedHours` bug below), not in
designing anything new.

**A real bug, found by a real test, in Phase 31**: `estimateTimeline()`
initially read `task.estimatedHours` off a decomposed task -- the shape
the LLM's own raw JSON response uses. `decomposer.js`'s `persistTask()`
transforms that into `task.effort.hours` once the task becomes a real
memory entry, and `decompose()` returns the PERSISTED shape, not the
raw one. A test asserting a specific, hand-computed day estimate (not a
vague "estimate exists" check) caught this immediately.

**A real incident, from verifying Phase 31 for real**: booting the
actual dashboard and POSTing a real mission objective against the real
Claude API (to confirm the new route genuinely worked end to end, not
just against a mocked LLM in a test) wrote 15 real memory entries and
14 real knowledge-graph entities/relationships into this project's
actual `database.json`/`graph.json` -- not test-isolated files. Found by
searching for the smoke test's own marker string across `memory.recall()`,
removed by id, and by name from the knowledge graph; both files
confirmed still valid JSON, full suite confirmed still green afterward.
Every prior "boot the real server and curl it" verification in this
project's history was a read-only GET; this is the first one that
POSTed to a route with a genuine side effect, and it's a reminder that
this class of live verification needs the SAME cleanup discipline as
any test touching shared state, even when it isn't a test.

43 new tests (403 → 446) across all eight phases -- see
`docs/CHANGELOG.md` for the per-phase breakdown. Every phase's new
tests run against REAL system state wherever practical (the real
capability registry, the real knowledge graph, the real learning log,
real `loadAgents()`/`loadDepartments()` output) rather than mocks,
consistent with this project's standing preference throughout its
history for exercising real collaborating objects over stubbing them
out.

## Marketing Division (`core/marketing/`, Phase 41)

**Decision:** the first Phase 35 production package to move from
skeleton to genuinely production-ready, built as the template for the
other five. Before writing anything, a dedicated audit pass established
what already existed (the company data model, the daily briefing/review
engines, the approval pipeline, `core/learning`'s execution telemetry)
versus what was genuinely greenfield (campaigns, brand/voice) -- see
`docs/CHANGELOG.md`'s Phase 41 (Marketing Division) entry for the full
audit findings and the part-by-part build log. This section is the
durable architectural record; that changelog entry is the narrative one.

- **Company Brain** (`core/executive/companyManager.js`): a `brandProfile`
  object (mission/vision/values/brand/voice/products/services/goals/
  audience/competitors/assets/operatingRules) added to a company's
  existing `metadata`, the same shallow-merge-on-update pattern every
  other company field there already uses -- not a new store.
  `companyBrain(companyId)` is the single aggregated view the spec
  asked for, built entirely from pre-existing concepts
  (departments/projects/team/finances were already derivable,
  relationships already lived in the knowledge graph) plus the one
  genuinely new field: campaigns. `metadata.history` existed since this
  file's very first version but nothing had ever appended to it --
  `recordDecision()` is what makes it a real, live decision log.
- **Campaign Engine** (`core/marketing/campaigns.js`): campaigns are
  ordinary memory entries (type `"businesses"`, tagged
  `company:<id>` + `"marketing-campaign"`) -- the exact pattern
  `companyManager.js` already established for company-scoped state, not
  a new parallel store. Deliberately does NOT `require()`
  `companyManager.js` at module load time (that file's own
  `companyBrain()` lazy-requires this one, to list a company's
  campaigns) -- `requireCompanyExists()` lazy-requires it instead, at
  call time, avoiding a load-time cycle. The Campaign Planner/Calendar
  IS `scheduleContent()`/`calendar()`: content items live on a
  campaign's own `contentSchedule` array; `calendar()` just flattens
  every campaign's schedule into one sorted, annotated view -- not a
  separate scheduling engine.
- **Content Generator** (`core/marketing/contentGenerator.js`): routed
  through `core/intelligence.think()`, the same reasoning path every
  other agent call already uses, following the exact pattern
  `core/learning/engine.js`'s `synthesizeRecommendations()` established
  (a fixed synthetic agent identity, a task-shaped mission,
  `useTools: false`). Not a raw `core/brain` call, and genuinely
  functional (not fabricated) -- Claude is already the configured
  provider in this environment.
- **Publishing Queue** (`core/executive/actionProposal.js`'s
  `publish_content` action): reuses `ActionProposalEngine` wholesale --
  no parallel approval system exists or was built. Execution is
  deliberately honest about what can actually publish: only Discord has
  a real connector (`core/integrations/discord.js`) today, so
  `performExternalAction()`'s case really posts there and marks the
  campaign/content item published; any other platform a campaign
  declares throws a clear "no publishing connector configured" error
  rather than fabricating a successful post. This is the same "only
  actions a connector can ACTUALLY perform are listed here" rule
  `actionProposal.js`'s own header comment already states for
  `create_github_issue`/`post_discord_message`.
- **Analytics Engine** (`core/marketing/analytics.js`): two genuinely
  different kinds of "analytics." Execution telemetry (did the
  department/agent/tool actually run successfully) is already tracked
  generically by `core/learning`, department-agnostic -- this module
  just reads it (`executionHealth()`), zero new tracking code.
  Campaign-domain metrics (impressions/clicks/conversions) are
  genuinely new business data with no existing system tracking it --
  `campaignPerformance()` aggregates whatever was actually recorded via
  `campaigns.js`'s `recordMetrics()`; there is no ad platform connector
  in this codebase to pull this automatically (see
  `docs/EXTERNAL_DEPENDENCIES.md`).
- **Executive Daily Operations** (`core/executive/dailyBriefing.js`):
  gained `departmentHealth()` (reuses
  `OrganizationOverview.departmentHealth()` wholesale -- constructing
  real department instances here follows the same accepted tradeoff
  Phase 40's `core/system/selfKnowledge.js` already made: fresh
  instances per call, not a live cache) and `campaignHealth()`
  (genuinely new -- a thin per-company rollup over campaigns.js's
  already-persisted state, closing the two Executive Daily Operations
  sections Phase 37's briefing didn't cover).
- **Agent hierarchy** (`packages/marketing/`): the operator's specified
  chain -- Executive Core -> MarketingDirector -> CampaignManager ->
  ContentStrategist -> BrandManager -> PublishingManager ->
  MarketingAnalyticsAgent -- realized as real system prompts (no more
  Phase 27 skeleton placeholders) plus three new agents
  (MarketingDirector/BrandManager/PublishingManager) added to complete
  it. There is no new inter-agent messaging protocol -- tasks still flow
  through the existing Mission Engine/department dispatch/Approval
  Pipeline exactly as they do for every other department; the prompts
  describe each role's place in the chain and which existing mechanism
  to use, not a new execution model.
- **A package's manifest edits require a registry re-sync**: editing an
  already-installed package's `manifest.json` on disk does NOT
  automatically update what `core/capabilities/registry.js` persisted at
  install time (`activation.js`'s `packageAgentConfigs()`/
  `packageToolConfigs()` read the REGISTRY's stored manifest copy, not a
  live re-read of the file) -- the same repair technique from Phase 41
  part 1's department-field bug (re-`loadManifest()` the real on-disk
  file, overwrite the registry's copy) had to be applied again here
  when adding the three new agents to `packages/marketing/manifest.json`.
  This is a real, sharp edge of the current design worth remembering
  for any future manifest edit to an already-installed package.

500 -> 526 tests across five parts (one commit per part, `npm test`
green before each). No architectural redesign anywhere in this arc --
every new piece follows an existing pattern from elsewhere in the
codebase; the only genuinely new store is campaigns themselves, and
even that is an ordinary memory entry.

## Sales Division (`core/sales/`, Phase 42)

**Decision:** the second Phase 35 package moved from skeleton to
production-ready, using the Marketing Division (Phase 41) as the
architectural reference throughout -- the operator's explicit
instruction for this and every remaining package.

- **Lead database + Lead Scoring** (`core/sales/leads.js`): leads as
  ordinary memory entries (same `company:<id>`-tagged pattern
  `core/marketing/campaigns.js` established). `scoreLead()` is fully
  deterministic and explainable -- contact completeness, real logged
  engagement (count and recency), and confirmed BANT signals each add a
  fixed, documented number of points with a visible reason string. This
  matches `core/executive/planner.js`'s own department-assignment
  scoring precedent: a real decision that needs to be cheap,
  synchronous, and auditable gets rule-based logic, not an LLM guessing
  at intent from a lead record.
- **Opportunity model, Pipeline Stages, Contact Management, Follow-up
  Scheduling, and Forecasting** (`core/sales/opportunities.js`): all one
  module, because they're all the same real entity (an opportunity)
  moving through a pipeline, not separate stores. `setStage()` requires
  a real reason to close a deal (`closed_won`/`closed_lost`) -- this is
  what makes win/loss analytics meaningful rather than a status flag.
  `forecast()` is a deterministic weighted-pipeline value (deal value
  times a fixed, documented stage-probability table), correctly
  excluding closed deals from the forward-looking number.
- **Proposal Generator** (`core/sales/proposalGenerator.js`): routed
  through `core/intelligence.think()`, following
  `core/marketing/contentGenerator.js`'s exact established pattern,
  incorporating the opportunity's real details and the company's real
  Brand Profile.
- **Analytics** (`core/sales/analytics.js`): win/loss analytics (win
  rate, average won value, a real loss-reason breakdown) plus execution
  telemetry reused from `core/learning` for free -- the same
  two-kinds-of-analytics split `core/marketing/analytics.js` established
  in Phase 41.
- **A real, found-live circular-require bug**: verifying
  `sales.pipeline.review` through the actual `core/tools` registry (not
  just requiring `core/sales/analytics.js` directly) surfaced a genuine
  bug. `core/tools/index.js` calls `loadTools()` at its own module load
  time; `loadTools()` `require()`s every package tool handler, including
  this one; this handler required `core/sales/analytics.js`, which
  top-level-required `../learning`, whose own chain
  (`core/intelligence` -> `core/brain` ->
  `core/brain/providers/claude.js`) top-level-requires
  `core/tools/index.js` right back -- landing on that SAME module,
  still mid-execution, before its `module.exports = registry` line had
  even run. Node silently hands back the partial/empty exports object
  in that case, corrupting whichever tool happened to be mid-load at
  that exact moment (logged as "does not export it -- skipped," even
  though the file itself is fine). Fixed by moving the `../learning`
  require inside `executionHealth()`, the exact lazy-require convention
  this codebase already uses for this class of problem (see
  `core/executive/actionProposal.js`'s `installer.js` require). Applied
  proactively to `core/marketing/analytics.js` too, which had the
  identical latent landmine, masked only because no marketing tool
  handler happened to import it during tool loading yet. **Lesson for
  any future package tool handler**: never let a tool handler's
  dependency chain top-level-require `core/learning` (or anything else
  that eventually reaches `core/brain/providers/claude.js`) -- lazy-
  require it inside the function that needs it.
- **Agent prompts, not a new hierarchy**: unlike Marketing, Sales's
  existing three agents (SalesAgent/Sales Representative,
  AccountManager, PipelineAnalyst) already mapped cleanly onto the
  domain (lead generation -> account/pipeline management -> analysis)
  without needing new roles added -- only real system prompts replacing
  the Phase 27 skeleton placeholders.
- **Sales Health** (`core/executive/dailyBriefing.js`): same
  per-company rollup pattern `campaignHealth()` established -- open
  lead/opportunity counts, the real weighted forecast, and overdue
  follow-up count, omitting companies with no sales activity.

542 -> 552 tests across three parts (one commit per part, `npm test`
green before each). No architectural redesign -- every new piece
follows an existing pattern from Marketing or elsewhere in the
codebase; the only genuinely new stores are leads and opportunities
themselves, both ordinary memory entries.

## Finance Division (`core/finance/`, Phase 43)

**Decision:** the third Phase 35 package moved from skeleton to
production-ready. The most important architectural decision here was
what NOT to build: `core/executive/companyManager.js`'s
`recordFinance()`/`financialSummary()` already IS a real ledger (Phase
2) -- ledger/revenue/expense tracking was never actually missing, it
just hadn't been surfaced as a "Finance Division." Every new module here
builds on top of that ledger rather than duplicating a transaction
store, exactly the operator's own instruction.

- **Budget Planning** (`core/finance/budgets.js`): required one small,
  additive extension to the existing ledger --
  `recordFinance()` gained an optional `category` field (defaults to
  `null`, backward-compatible with every existing caller) so
  `budgetStatus()` could compare a budget's limit against real expense
  entries filtered by category and a real calendar-month period
  (`"YYYY-MM"`, matched by string prefix -- no fuzzy date-range logic).
- **Invoice model** (`core/finance/invoices.js`): "overdue" is DERIVED
  at read time from a real due date on a `"sent"` invoice, never a
  stored flag -- a persisted overdue status would go stale the moment a
  day passed without VERONICA touching the invoice; computing it fresh
  on every read means it's always accurate. `accountsReceivable()` sums
  genuinely outstanding sent-but-unpaid invoices.
- **Subscription tracking** (`core/finance/subscriptions.js`): what
  makes real MRR/ARR possible -- recurring revenue is a genuinely
  different concept from `recordFinance()`'s one-time point-in-time
  transactions, so it gets its own real entity rather than being
  inferred from ledger entries.
- **Cash-flow, Runway, Forecasting, Financial KPIs**
  (`core/finance/reports.js`): all deterministic and explainable,
  matching this codebase's standing rule-based-where-explainable
  principle. `runway()`'s most important design decision: when the
  recent average net is non-negative, it reports a real `"profitable"`
  status with a null `runwayMonths` -- runway is a question that
  genuinely doesn't apply to every company at every moment, and forcing
  a number there (e.g. `Infinity`, or `0`) would be a fabrication.
  `forecast()` is a real linear extrapolation of the recent net trend,
  not a model's guess -- explainable arithmetic an operator can verify
  by hand.
- **No banking connection anywhere** -- explicitly out of scope per the
  operator's instruction (see `docs/EXTERNAL_DEPENDENCIES.md`). Every
  number in this division traces back to something actually recorded in
  VERONICA (a real `recordFinance()` call, a real invoice marked sent,
  a real active subscription), never fetched from an external bank API.
- **Finance Health** (`core/executive/dailyBriefing.js`): same
  per-company rollup pattern `campaignHealth()`/`salesHealth()`
  established -- cash on hand, runway status, over-budget count,
  overdue invoice count, omitting companies with no finance activity at
  all.

566 -> 576 tests across three parts (one commit per part, `npm test`
green before each). No architectural redesign -- the only genuinely new
stores are budgets, invoices, and subscriptions; the ledger itself was
reused, not rebuilt.

## Research Division (`core/research/missions.js`, Phase 44)

**Decision:** the fourth Phase 35 package moved from skeleton to
production-ready. `core/research/engine.js` (Phase 29) already did the
hard part -- real document fetching through the allowlisted HTTP
client, real LLM-based structured knowledge extraction, real citation
storage in memory. The genuine gap was grouping multiple citations
under one themed objective with ranking and a synthesized summary, not
a second research engine.

- **Research Missions, Source Ranking, Executive Summaries**
  (`core/research/missions.js`): `addCitation()` reuses
  `ResearchEngine.research()` wholesale -- fetch a real URL, extract via
  LLM, store with citation. `rankSources()` orders a mission's real
  citations by their real, already-computed extraction confidence
  (highest first) -- deliberately NOT a fabricated credibility score;
  the confidence value already exists from the extraction step,
  ranking just reads it. `generateExecutiveSummary()` follows
  `core/marketing/contentGenerator.js`/`core/sales/proposalGenerator.js`'s
  established pattern.
- **"Competitor research"/"Industry reports"/"Technology reports"/
  "Market trend reports" are one mechanism, not four**: a mission's
  `type` field is purely informational (what kind of research this is);
  the underlying pipeline (collect citations -> rank -> synthesize) is
  identical regardless of type. Building four separate report
  generators would have been exactly the kind of duplication this
  project's standing instructions warn against.
- **Missions are optionally company-scoped**: unlike Marketing/Sales/
  Finance's entities (which all require a companyId), a mission's
  companyId is optional -- `core/research/engine.js` was deliberately
  built global in Phase 29 (research isn't inherently about one
  company), so forcing a company onto every mission would have been a
  real design regression, not a consistency improvement.
- **The same circular-require bug, a third time**: both
  `core/research/missions.js` and `core/research/engine.js` itself
  top-level-required `core/intelligence`, whose chain reaches
  `core/brain/providers/claude.js`, which requires `core/tools/index.js`
  at its own top level. `engine.js` predates this discovery (Phase 29)
  and had never been reached from a tool-loading path before Phase 44's
  `research.dept.synthesize.js` made it reachable. Fixed the same way
  in both files (lazy-require inside the function that needs it) --
  this is now a three-for-three pattern (Sales, proactively Marketing,
  Research) worth watching for in ANY future module that both gets
  pulled in from a package tool handler and itself top-level-requires
  anything in the `core/learning`/`core/intelligence`/`core/brain`
  chain.
- **A real HTML id collision, found building the dashboard panel**:
  the new Research Mission form's objective field was originally named
  `mission-objective`, already used by the pre-existing Phase 31
  Mission Engine panel. Duplicate ids are invalid HTML;
  `document.getElementById()` silently returns only the first match, so
  this would have bound both forms to the same element without either
  form or the browser ever raising an error. Renamed to
  `research-mission-objective`. A second, unrelated `system-health` id
  duplicate was found in the same pass but left unfixed as out of
  scope -- see `docs/NEXT_STEPS.md`.

576 -> 587 tests across three parts (one commit per part, `npm test`
green before each). No architectural redesign -- the only genuinely new
store is missions themselves; the citation/extraction/storage pipeline
was reused wholesale from Phase 29.

## Trading Research Division (`core/trading/`, Phase 45)

**Decision:** the fifth Phase 35 package moved from skeleton to
production-ready. Explicitly research/analysis only -- there is no real
broker connection anywhere in this codebase, and real trade execution
remains approval-gated and unimplemented until one exists. Every module
here is genuinely useful without a broker: paper trading, backtesting,
and risk analysis are real disciplines a trader practices before
placing real capital.

- **Two DIFFERENT, both real cost-basis methods, by design**:
  `core/trading/portfolio.js`'s `applyTrade()` tracks an open position
  with a single blended average-cost-basis (the common retail-broker
  convention), while `core/trading/analytics.js`'s `journalPerformance()`
  computes REALIZED P&L via FIFO lot matching (the standard tax-lot
  accounting method) across the same journal. These answer two
  different real questions -- ongoing unrealized P&L on what's still
  held, vs. realized P&L attribution on each specific sell -- and
  deliberately don't share one calculation. A future reader should not
  "fix" this into one method; it would make one of the two questions
  wrong.
- **No market data feed, by design**: `portfolioValue()` and the
  backtest engine both take real prices as an explicit argument rather
  than fetching them -- there is no market-data connector in this
  codebase (see `docs/EXTERNAL_DEPENDENCIES.md`). Both do real
  arithmetic on real data the caller already has; neither fabricates or
  estimates a price.
- **Backtesting is deliberately scoped to one real strategy shape**:
  `core/trading/backtest.js`'s `backtestMovingAverageCrossover()`
  evaluates a real, well-known, well-defined rule (golden-cross buy /
  death-cross sell) against a real historical price series. A generic
  strategy-rule interpreter that could evaluate arbitrary stored
  strategies would have been substantially more scope than this phase
  called for -- `core/trading/strategies.js`'s free-form `rules` field
  is ready for that future work, but nothing currently reads a
  non-moving-average-crossover strategy's rules to run a backtest.
- **The circular-require bug, addressed proactively this time**:
  `core/trading/analytics.js` was written with `core/learning` required
  lazily inside `executionHealth()` from the very first draft, rather
  than discovered live a fourth time -- by this phase, the pattern (any
  module reachable from a package tool handler that itself top-level-
  requires anything in the `core/learning`/`core/intelligence`/
  `core/brain` chain) was well-established enough to design around up
  front.
- **Trading Status** (`core/executive/dailyBriefing.js`): system-wide,
  like `researchStatus()` -- total portfolios, total realized P&L, open
  positions, deliberately excluding unrealized P&L (no price source).

587 -> 616 tests across three parts (one commit per part, `npm test`
green before each). No architectural redesign -- the only genuinely new
stores are portfolios, strategies, watchlists, and the paper trade
journal.

## Business Operations Division (`core/operations/`, Phase 46) -- completes the Phase 41-46 arc

**Decision:** the sixth and final Phase 35 package moved from skeleton
to production-ready. The most important architectural decision here
was recognizing what NOT to build: Blocker Management
(`core/executive/blockerDetection.js`) and Weekly Operating Reviews
(`core/executive/weeklyReport.js`) were both already real, comprehensive
Phase 11 systems -- the spec's asks for them were satisfied by reuse,
not reimplementation.

- **SOP library IS Workflow documentation** (`core/operations/sops.js`):
  one real entity, not two stores describing the same thing from two
  angles. `updateSteps()` revises the document in place with a real
  version counter -- unlike every other division's append-only history
  arrays (a lead's interactions, an opportunity's stage history), an
  SOP is a single evolving document, not a growing log, so it gets a
  genuinely different persistence pattern.
- **KPI direction matters** (`core/operations/kpis.js`): a KPI is either
  higher-is-better (revenue) or lower-is-better (churn, defect rate) --
  defaulting to one direction, as would be tempting for simplicity,
  would silently mis-grade roughly half of all real KPIs.
  `kpiStatus()`'s `onTrack: null` before any actual is recorded is a
  deliberate honesty signal, not a default that happens to look like
  one.
- **Department Scorecards + Process Analysis, composed from existing
  systems** (`core/operations/scorecard.js`): `departmentScorecard()`
  reuses `OrganizationOverview.departmentHealth()` (real agent count/
  project counts/execution success rate, Phase 32) and
  `BlockerDetector.detect()` (real deadlocked projects, Phase 11)
  wholesale -- this module's only genuinely new contribution is real
  KPIs and real SOP counts layered on top. `analyzeProcess()` similarly
  composes a real SOP with its department's real execution health
  (reused from `core/learning`, zero new tracking) and related KPIs.
  Every cross-subsystem require in this file is lazy from the very
  first draft -- by Phase 46, the circular-require pattern (any module
  reachable from a package tool handler must not top-level-require
  anything in the `core/learning`/`core/intelligence`/`core/brain`
  chain) had recurred four times (Sales, proactively Marketing,
  Research's `missions.js` AND `engine.js` itself) and was designed
  around from the start rather than discovered live a fifth time.
- **Operations Status** (`core/executive/dailyBriefing.js`): system-
  wide, like `researchStatus()`/`tradingStatus()` -- total SOPs/KPIs,
  real off-track KPI count, real open action-item count. Weekly
  Operating Reviews remain their own separate, already-scheduled
  artifact -- deliberately not duplicated into this daily rollup.

**This completes the entire Phase 41-46 arc.** All six Phase 35
production packages (marketing, sales, finance, research-department,
trading-research, business-operations) are now genuinely `"active"` in
`core/capabilities/health.js`, confirmed by an exhaustive test asserting
all six directly. Every division followed the same discipline: audit
existing architecture first, reuse whatever was already real (the
ledger, the research engine, blocker detection, weekly reporting, the
approval pipeline), and build only the genuine gap. The one recurring
architectural lesson across all six -- the circular-require bug class
between package tool handlers and the `core/learning`/
`core/intelligence`/`core/brain` chain -- is now a known, documented
hazard for any future domain module.

616 -> 641 tests across three parts (one commit per part, `npm test`
green before each). No architectural redesign -- the only genuinely new
stores are SOPs, KPIs, and meetings.

## Organizational Learning -- the recommendation feedback loop (Phase 47)

**Decision:** with all six Divisions production-ready, work shifted to
organization-wide capabilities. First: close the one gap
`core/learning/adaptiveInsights.js`'s own Phase 38 header comment
explicitly flagged as real future work rather than doing it silently --
"feeding this data back into HOW future recommendations get generated."

- `core/executive/executiveRecommendations.js`'s `generate()` gained
  `applyAdaptiveInsights()`, which annotates every recommendation with
  two real signals already computed by `adaptiveInsights.js`: its
  kind's real acceptance rate (from every past `ActionProposalEngine`
  proposal's own status transition) and its real recurrence count
  (how many past recommendation runs flagged this exact kind+subject).
  Genuinely recurring issues sort to the front.
- **Deliberately does not hide anything**: a recommendation with a low
  historical acceptance rate is still returned, annotated honestly --
  silently suppressing it would hide a real, current issue from the
  operator, which is the opposite of this system's "explainable"
  principle. The feedback loop changes what the operator SEES about a
  recommendation (its real track record), not whether they see it.
- `adaptiveInsights.js` itself is unchanged (still a pure reporting
  layer) -- the feedback loop lives entirely in how
  `executiveRecommendations.js` consumes that reporting, keeping the
  two files' responsibilities exactly as separated as Phase 38 already
  established.
- Both files lazily require each other where needed (`executiveRecommendations.js`
  requires `adaptiveInsights.js` inside `applyAdaptiveInsights()`;
  `adaptiveInsights.js` already lazily required
  `executiveRecommendations.js` back, for its static `TAG`) -- a safe,
  symmetrical lazy pair, not a top-level cycle.

644 tests (641 -> 644), `npm test` green. No architectural redesign --
the only new code is the annotation/sort step itself.

## Executive Intelligence -- cross-department synthesis (Phase 48)

**Decision:** with all six Divisions production-ready (Phase 41-46) and
the recommendation feedback loop closed (Phase 47), Phase 48 asked for
a genuinely new layer: Company Health Scoring, Risk Forecasting,
Cross-Department Recommendations, Quarterly/Annual Planning, and
Executive Brief generation, "all recommendations must be explainable."
The entire module (`core/executive/executiveIntelligence.js`) composes
each Division's already-real analytics rather than tracking anything
new -- there is no new persisted entity type here except the brief
itself.

- **`companyHealthScore(companyId)`**: a composite 0-100 score
  averaging only the categories with real data. Finance's sub-score
  buckets `core/finance/reports.js`'s real `runway()` status/months
  (profitable=100, >=12mo=80, >=6mo=60, >=3mo=40, else 20). Sales'
  sub-score is the real win rate from `core/sales/analytics.js`'s
  `winLossAnalytics()`. Marketing's sub-score is the real approved-or-
  published fraction of `core/marketing/campaigns.js`'s
  `listCampaigns()`. A company with no data in a category gets `null`
  there (excluded from the average, not penalized) -- reported
  honestly via `unscoredCategories`, not silently defaulted to zero.
- **`riskForecast(companyId)`**: combines three real signals, each risk
  carrying the specific number it came from --
  `core/executive/blockerDetection.js`'s deadlocked projects (filtered
  to this company via a new `project.company` field, see below),
  Finance's real "burning" runway under 6 months, and
  `core/operations/kpis.js`'s real off-track KPIs (`onTrack: false`).
- **`crossDepartmentRecommendations(companyId)`**: currently one real,
  conservative rule spanning two divisions' actual data -- real open
  sales pipeline value (`core/sales/opportunities.js`'s `forecast()`)
  with zero published marketing campaigns supporting it. Deliberately
  small: an explainable, exact observation two divisions' separate data
  makes visible together, not a speculative correlation engine.
- **`quarterlyPlan()`/`annualPlan()`**: real roadmap projects
  (`ExecutivePlanner.roadmap()`) and real KPIs filtered by real
  deadline/period falling within the requested calendar range -- a
  filtered view over already-real data, not a new planning store.
- **`generateExecutiveBrief(companyId)`**: an LLM-synthesized narrative
  over the three outputs above, via `Intelligence.think()` -- the exact
  same pattern `core/marketing/contentGenerator.js`/
  `core/sales/proposalGenerator.js`/`core/research/missions.js`'s
  `generateExecutiveSummary()` already establish (a synthetic agent
  identity, `useTools: false`, `thought.cognition.response.response`).
  Persisted as an ordinary memory entry tagged `executive-brief` (plus
  `company:<id>`) -- `briefHistory()` reads it back, no new store shape.

**Prerequisite fix, additive:** `findDeadlockedProjects()`'s output
didn't carry a `company` field on its `project` object (only
`department`), needed so `riskForecast()` can scope deadlocked projects
to one company. The real roadmap project object already had
`goal.company` (set by `ExecutivePlanner.plan()`) -- adding
`company: project.company` to the existing `project: {...}` literal was
a one-line additive change, no new tracking.

**Not a new package/division.** Unlike Phase 41-46, Executive
Intelligence has no `packages/` entry and no new agents -- it lives
directly in `core/executive/`, alongside `executiveRecommendations.js`/
`dailyBriefing.js`/`priorityRanking.js`, because its entire job is
synthesizing what the six real Divisions already produce, not being a
seventh one.

**Circular-require discipline maintained:** the module's own top level
requires only `../memory` (safe). Every Division-analytics dependency
(Finance, Sales, Marketing, Operations, `BlockerDetector`, `Planner`,
`IntelligenceEngine`) is required lazily inside the specific function
that needs it -- the same hazard documented throughout Phase 42-46
(anything reachable from a package tool handler must not top-level-
require the `core/learning`/`core/intelligence`/`core/brain` chain).
This module isn't reached from a package tool handler today, but was
written lazy from the start rather than risk it becoming a fifth
occurrence later.

**Wired into:**
- `core/executive/dailyBriefing.js`'s `generate()` gained
  `strategicHealth()` -- a per-company rollup of the composite score
  and real top risk. Distinct from the pre-existing Phase 37
  `companyHealth()` (plain employee/document counts, unrelated).
  Unlike `campaignHealth()`/`salesHealth()`/`financeHealth()`, a
  company with no scoreable data is NOT omitted from the list -- "no
  data yet" is itself real information worth an executive seeing in
  their own morning briefing, not noise to filter out.
- Dashboard: six new GET routes (`/api/executive/company-health`,
  `risk-forecast`, `cross-department-recommendations`, `quarterly-plan`,
  `annual-plan`, `briefs`) and one gated POST
  (`/api/executive/brief`, added to `tests/dashboard.test.js`'s
  `ALL_POST_ROUTES`), plus a new "Executive Intelligence (Phase 48)"
  panel (Company Health & Risk Forecast, Cross-Department
  Recommendations, Quarterly/Annual Plan, Executive Brief).

**Tests:** `tests/executive-intelligence.test.js` (9 tests, entirely
real persisted state -- real companies/opportunities/campaigns/KPIs/
deadlocked projects, only the LLM call itself mocked for the brief
test, same convention every other content-generation test in this
codebase uses); `tests/blocker-detection.test.js` gained one new
assertion plus one new test for the `company` field; `tests/daily-briefing.test.js`
gained one new test for `strategicHealth()`; `tests/dashboard.test.js`
gained endpoint coverage for the new routes (deliberately excluding the
brief-generation POST's content, same carve-out the Research Division's
own dashboard test already established for LLM-backed routes).

656 tests (644 -> 656), `npm test` green.

## Organizational Knowledge Graph expansion (Phase 49)

**Audit first:** `core/knowledge/index.js`'s graph already existed
(entities/relationships, idempotent by name, used since early phases
for companies/departments/agents -- see `core/knowledge/seed.js`).
Leads/opportunities/campaigns already called `knowledge.addEntity()` on
creation (Phase 41-42), but nothing ever connected those entities to
their owning company -- they existed in the graph as unreachable
islands. Portfolios, SOPs, KPIs, meetings, invoices/subscriptions, and
research missions created no graph entities at all. Phase 49's job was
closing these real gaps, not redesigning the graph itself.

**The identity-collision constraint that shaped every choice below:**
`KnowledgeGraph.addEntity()` is idempotent by lowercase name -- two
calls with the same name return the SAME entity. This is fine for
already-unique real names (a company name, a campaign objective, a
person's name) but dangerous for a memory entry whose own `content`
isn't guaranteed unique. `core/finance/invoices.js`'s/
`core/finance/subscriptions.js`'s own entry content is
`"Invoice for ${clientName}"` / `"Subscription for ${clientName}"` --
two invoices to the same client would collide into one node if invoice
records were the connected entity. The fix: connect the CLIENT
(`clientName` itself, genuinely unique per real-world client) with a
`billedBy` relationship to the company, not the invoice/subscription
record. Every other new connection (leads, opportunities, campaigns,
portfolios, missions, SOPs, KPIs, meetings) already had a
real, caller-supplied unique name at entity-creation time, so no
similar substitution was needed there.

**What got connected, one real relationship per module:**

- **Leads/Opportunities/Campaigns** (`core/sales/leads.js`,
  `core/sales/opportunities.js`, `core/marketing/campaigns.js`): each
  module's `requireCompanyExists(companyId)` helper previously
  validated existence and returned nothing; it now returns the real
  company memory entry so its `.content` (the company's real name) is
  available right where the entity is already created. One new
  `knowledge.addRelationship({ from: entity.name, to: company.content,
  type: "belongsTo" })` line per module, added immediately after the
  pre-existing `addEntity()` call -- no new store, no new validation
  path, purely additive.
- **Invoices/Subscriptions** (`core/finance/invoices.js`,
  `core/finance/subscriptions.js`): a `client`-typed entity for
  `input.clientName`, `billedBy` -> the company. See the constraint
  above for why the client, not the record, is the connected entity.
- **Portfolios** (`core/trading/portfolio.js`): a `portfolio`-typed
  entity, `belongsTo` its company ONLY when `createPortfolio()` was
  actually given a `companyId` -- this engine deliberately allows
  unscoped, system-wide portfolios (Phase 45's own header comment), and
  an unscoped portfolio has nothing real to connect to.
- **Research missions** (`core/research/missions.js`): a
  `research-mission`-typed entity, `belongsTo` its company only when
  BOTH a `companyId` was supplied AND a real company entry actually
  exists for it. This engine deliberately does not validate `companyId`
  on creation (missions are optionally, loosely company-scoped, Phase
  44's own header comment) -- silently fabricating a relationship to a
  company that might not exist would be dishonest, so the lookup is
  real and the edge is skipped, not assumed, when it comes back empty.
- **SOPs/KPIs** (`core/operations/sops.js`, `core/operations/kpis.js`):
  `sop`/`kpi`-typed entities, `belongsTo` the real department id string
  when `input.department` is given. That id string is the exact same
  one every real agent's `department` field already carries into
  `core/knowledge/seed.js`'s own `department`-typed entity at boot --
  no new department-naming scheme, just reusing the existing one.
- **Meetings** (`core/operations/meetings.js`): a `meeting`-typed
  entity, one `attended` relationship per real named attendee in
  `input.attendees`.

**Query surface added:** `KnowledgeGraph.retrieve(query)` (matching
entities + every relationship touching any of them) already existed --
written for agent-context injection -- but had no dashboard route.
Added `GET /api/knowledge/query?q=...` returning it directly. This is
the "everything queryable" requirement satisfied by exposing an
existing capability, not building a new query engine.

**Deliberately unchanged:** the graph's name-based identity scheme
itself. True per-company isolation in the graph (two different
companies each naming an opportunity "Big Deal" would still collide
into one node, since `addEntity()` doesn't know about companies) is the
same open architectural question this document's Phase 10 section
already flagged (see "knowledge-graph company isolation" in
`docs/NEXT_STEPS.md`) -- redesigning entity identity to be
company-scoped was explicitly out of this phase's scope; the phase's
job was connecting real, already-existing entities, not changing what
makes an entity unique.

**Tests:** `tests/knowledge-graph-expansion.test.js` (9 tests, real
calls through every module above -- a real company, a real lead
connected to it, a real client connected via `billedBy`, a real
department-scoped SOP/KPI, a real meeting with real attendees, a real
`retrieve()` query -- no mocks anywhere in this file), plus one new
dashboard test for the query endpoint.

666 tests (656 -> 666), `npm test` green.
