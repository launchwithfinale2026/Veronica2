# VERONICA — SYSTEM AUDIT

Date: 2026-07-21
Scope: full repository, per `CLAUDE_AUTONOMOUS_DEVELOPMENT_PROTOCOL.md` Phase 1.

---

## 1. Current State

The repository has no git history (0 commits at time of audit). Of ~150
tracked files outside `node_modules`, only `core/` (agent/router/brain/memory
pipeline) and `registry/` (agent + department data) contain working code.
Everything else — `services/`, `dashboard/`, `foundation/`, `tools/`,
`tests/` (prior to this audit), `departments/` (9 dirs), root-level
`memory/`, `config/`, `identity/`, `communication/`, `data/`, `scripts/` —
was empty scaffolding: 0-byte files and empty directories.

### The one real, working pipeline

```
terminal.js → router.findAgent() (keyword match) → ContextEngine.retrieve()
→ Intelligence.think() → Brain → BrainProvider → ClaudeProvider
→ Anthropic SDK → response
```

Verified running: boots, loads 9 agents from `registry/agents.json` +
`core/agents/prompts/*.js`, `system.status` / `agents.list` / `memory.view`
/ `memory.search` / `remember` / `help` / `ask` all functional.

### Working features (verified)

- CLI terminal (`core/interface/terminal.js`) — all documented commands
  implemented.
- Agent loader — 9 agents (METIS, DAEDALUS, HELIOS, IRIS, PLUTUS, NIKE,
  SELENE, ASTREA, ATLAS), each with a real persona prompt file.
- Memory store (`core/memory/store.js` + `database.json`) — persists to
  JSON, real accumulated entries.
- Claude provider (`core/brain/providers/claude.js`) — real Anthropic SDK
  integration.
- Message bus (`core/bus/index.js`) — functional `EventEmitter` wrapper,
  lightly used.
- Registry (`registry/agents.json`, `departments.json`) — real data,
  consumed by `core/agents/loader.js` and `core/executive/index.js`.
- Knowledge graph (`core/knowledge/index.js`) — real read/write CRUD over
  `graph.json`, now wired into `ContextEngine.retrieve()`.

### Fixed during this audit (see §5)

Several bugs were corrected in place rather than left for a later phase,
because they were small, high-confidence, non-architectural fixes blocking
the rest of the roadmap (missing terminal commands, a merged/broken file,
dead code causing a logging bug, an eager-init crash risk). See the "Fixed"
column in §3 and the changelog in §5.

---

## 2. Missing Components

| Area | Status |
|---|---|
| `services/` (AI providers, automation, comms, storage) | Empty — real AI integration lives in `core/brain/`, not here |
| `dashboard/` | Empty, no `package.json`, cannot run — Phase 7 not started |
| `tools/` | Empty — Phase 6 tool system not started; `registry/tools.json` also empty |
| `foundation/` (config, errors, events, health, lifecycle, logging, registry, types, utils) | All 9 subdirs empty — no logging/health/lifecycle infrastructure exists |
| `departments/` (9 Greek-god dirs) | Pure empty templates, never `require()`'d — superseded in practice by `registry/departments.json` |
| `identity/` (root) | Populated JSON (capabilities/permissions/roles) but zero enforcement — nothing reads it |
| `config/` | All 4 files 0 bytes, unused |
| Device awareness (Phase 8) | No trace anywhere |
| `docs/`/`specs/` | Only `BootSequence.md` and `MessageBus.md` have content; Architecture, Roadmap, Vision, Identity, Memory, ToolFramework, etc. are all 0 bytes |
| Memory Engine V2 (Phase 3) | **Done (2026-07-21)** — see roadmap section below |

---

## 3. Broken Systems

| Finding | File | Status |
|---|---|---|
| Two entire class implementations concatenated into one file (accidental merge); dead first class also called memory methods with the wrong signature | `core/knowledge/index.js` | **Fixed** — split out, dead `Knowledge` class removed, working `KnowledgeGraph` kept |
| Two incompatible `Agent` classes; the unused one's `.status` field was logged by `executive/index.js` and always printed `undefined` for real (loader-built) agents | `core/agents/base.js` vs `core/agents/Agent.js` | **Fixed** — added `status` to the live `base.js` class; dead `Agent.js`/`listener.js` moved to `backups/core_cleanup_2026-07-21/` |
| `remember` terminal command only `console.log`'d input, never persisted | `core/interface/terminal.js` | **Fixed** — now calls `memory.remember()` |
| `memory.search` and `help` commands missing despite being required by the protocol's Phase 2 spec | `core/interface/terminal.js` | **Fixed** — both added |
| Knowledge graph fully disconnected — `ContextEngine.retrieve()` hardcoded `knowledge: []` | `core/context/engine.js` | **Fixed** — now queries `knowledge.find(query)` |
| `executive/index.js` required `router` but never used it; required `terminal.js` twice | `core/executive/index.js` | **Fixed** — dead require and duplicate call removed |
| No provider fallback; `openai.js` was a 0-byte stub despite being a listed dependency | `core/brain/provider.js`, `core/brain/providers/openai.js` | **Partially fixed** — `openai.js` implemented; `BrainProvider` now initializes providers defensively (skips ones that fail to construct, e.g. missing key) and falls back to `local` if the active provider's `generate()` throws. Full multi-provider fallback chain (beyond a single hardcoded fallback) is still Phase 2 work. |
| Router did substring/keyword matching only — no real intent detection, no priority logic | `core/router/index.js` | **Fixed (Phase 2)** — replaced with weighted scoring (name mention > exact capability phrase > partial capability/role word > department mention); ties resolve by registry declaration order, i.e. registry order is the priority order |
| Stray editor artifacts (`.save` files, `.backup.js` files, a malformed `index.js\` filename) | `core/agents/`, `core/interface/`, `core/executive/`, `core/memory/` | **Fixed** — moved to `backups/core_cleanup_2026-07-21/` |

---

## 4. Technical Debt

Resolved on 2026-07-21 (decisions recorded in `docs/Architecture.md`):

- **`core_backup_v1/`** and **`registry_backup_v1/`** — both were whole-directory
  snapshot copies, not the protocol's intended per-file `.backup.js`
  pattern (`registry_backup_v1/` was a byte-for-byte duplicate;
  `core_backup_v1/` was an older snapshot missing `brain/`/`intelligence/`).
  Archived to `backups/core_backup_v1_2026-07-21/` and
  `backups/registry_backup_v1_2026-07-21/` — confirmed unreferenced by any
  code before moving.
- **Departments fork** (`departments/` folder vs. `registry/departments.json`):
  decided `registry/departments.json` is the authoritative index,
  `departments/<name>/` is the reserved Phase 5 implementation location.
  See `docs/Architecture.md`.
- **Memory fork** (root `memory/` vs. `core/memory/`): decided `core/memory/`
  is the live engine, root `memory/{vault,graph,vector,archive}` is
  reserved storage structure for Phase 3/4. See `docs/Architecture.md`.
- **Agent-roster drift**: decided `registry/agents.json`'s actual roster
  (METIS, DAEDALUS, HELIOS, IRIS, PLUTUS, NIKE, SELENE, ASTREA, ATLAS) is
  authoritative over the protocol document's earlier Phase 5 naming. See
  `docs/Architecture.md`.

Still open:

- Almost no documentation actually written despite extensive `docs/`/`specs/`
  scaffolding existing (now 3 of 17 files have content, after this pass).
- `core/memory/memory.json` — an orphaned, empty (`[]`) data file with no
  live reader/writer left in place. Harmless; low priority to remove.

---

## 5. Security Issues

- **Fixed this pass**: `.gitignore` was completely empty (0 bytes), so
  `.env` (containing a live `ANTHROPIC_API_KEY`) and `node_modules/` were
  one `git add .` away from being committed. A `.gitignore` was added
  covering `.env`, `node_modules/`, `*.save`, and `logs/`.
- No `eval`/`exec`/command-injection surface found anywhere in `core/`.
- No secrets hardcoded in source — keys are correctly read via
  `process.env`.
- **Fixed (Phase 6, 2026-07-21)**: `identity/permissions.json` and
  `roles.json` now have a real enforcement layer (`core/identity/index.js`,
  used by `core/tools/registry.js`). While wiring it up, found and fixed a
  latent data-integrity bug: `identity/roles.json` referenced permission
  names (`system_boot`, `department_control`, `memory_access`,
  `execute_tasks`) that didn't exist in `identity/permissions.json`'s
  actual vocabulary (`read_memory`, `write_memory`, `execute_tools`,
  `manage_agents`, `create_reports`, `communicate`) — every role's
  permission list was checked against a vocabulary it didn't use. Fixed to
  use the real vocabulary with a least-privilege progression
  (agent < department_manager < executive). Backup at
  `backups/identity_roles_fix_2026-07-21/roles.json.pre-fix`.
- **Still open**: no commit has ever been made to this repository. Before
  the first commit, do a final pass over `.env` and any files under
  `core/*/logs` or `memory/*` for anything sensitive.

---

## 6. Scalability Issues

- Memory store is a single flat JSON file with full read/write on every
  operation and linear keyword-overlap search — fine at current scale
  (single user, dozens of entries), will not scale past that.
- No database of any kind (SQL or vector) despite `memory/vector/` existing
  as an empty placeholder.
- Bus is in-process `EventEmitter` only — no persistence, replay, or
  cross-process messaging, which falls short of `specs/MessageBus.md`'s
  intended envelope-based design (id/timestamp/sender/receiver/priority)
  meant to eventually span departments/services.
- Single-process CLI only — no API server, no concurrent sessions, no
  multi-device support (Phase 8 territory).
- `foundation/` being empty means there is no logging, health checking, or
  lifecycle management yet — no observability for a system meant to run
  continuously.

---

## 7. Changelog — this audit pass

Concrete, low-risk fixes applied directly (all verified via `node --check`,
targeted read-only smoke tests, and the new test suite):

1. Added `.gitignore` (`.env`, `node_modules/`, `*.save`, `logs/`).
2. `core/knowledge/index.js` — removed the dead/broken `Knowledge` class,
   kept the working `KnowledgeGraph`.
3. `core/context/engine.js` — wired `knowledge.find(query)` into
   `retrieve()` instead of a hardcoded empty array.
4. `core/executive/index.js` — removed the unused `router` require and the
   duplicate `require("../interface/terminal")` call.
5. `core/agents/base.js` — added `this.status = "online"` (fixes an
   `undefined` status log in `executive/index.js`).
6. `core/interface/terminal.js` — `remember` now persists via
   `memory.remember()`; added `memory.search <term>` and `help` commands;
   `memory.view` now prints actual stored memories instead of the memory
   module's function object.
7. `core/brain/providers/openai.js` — implemented (was a 0-byte stub)
   mirroring the working `claude.js` pattern.
8. `core/brain/provider.js` — provider construction is now defensive (a
   provider that fails to initialize, e.g. missing API key, is skipped
   with a log line instead of crashing boot); `generate()` now falls back
   to the `local` provider if the active provider throws.
9. Moved confirmed-dead files to `backups/core_cleanup_2026-07-21/`:
   `Agent.js.save`, `base.js.save`, `terminal.js.save`,
   `loader.backup.js`, `executive/index.backup.js`, the malformed
   `memory/index.js\` file, and the dead `Agent.js`/`listener.js`
   implementation pair.
10. Added `tests/` infrastructure: `node --test` wired up via
    `npm test` (`node --test tests/*.test.js`), plus `router.test.js` and
    `agent.test.js` covering the two areas touched above. All 4 tests
    pass.

Follow-up pass, same day: archived `core_backup_v1/` and
`registry_backup_v1/` to `backups/`, and resolved the departments,
memory, and agent-roster forks by decision, recorded in the new
`docs/Architecture.md`.

---

## 8. Roadmap

Phase 0 (stabilization) is complete: security fix, concrete bug fixes, dead
code archived, test infra stood up, architectural forks resolved by
decision.

Phase 2 (Core Stability) is partially complete as of 2026-07-21:

- Router: replaced keyword-substring matching with weighted intent
  scoring and a deterministic (registry-order) priority tie-break.
  `core/router/index.js`.
- Brain: `generate()` now tries the active provider, then falls through
  a fixed priority chain (`claude` → `openai` → `local`) instead of a
  single hardcoded fallback target, only throwing once every provider in
  the chain has failed. `core/brain/provider.js`.
- Terminal interface commands: completed in Phase 0 (see §3/§7).
- Intelligence system (mission creation / agent identity / reasoning /
  structured responses): already met the spec pre-audit, no changes
  needed.
- Still open in Phase 2: provider-level structured logging (currently
  `console.log` only — real logging infrastructure is Phase-8-adjacent,
  depends on `foundation/logging` being built).

Phase 3 (Memory Engine V2) is complete as of 2026-07-21:

- `core/memory/store.js` — memory entries are now structured objects:
  `{id, type, content, importance, created, updated, relationships, tags, source}`,
  matching the protocol spec exactly. `type` is constrained to the seven
  protocol categories (personal, projects, businesses, technical
  knowledge, preferences, decisions, goals) plus `general` as the default
  for callers that don't specify one (e.g. the terminal's bare
  `remember <text>`).
- **Migration**: a self-healing migration runs on load — legacy
  `{content, timestamp}` entries are upgraded to the new shape in place
  (content and original timestamp preserved as `created`/`updated`,
  `source: "legacy"`) and the file is only rewritten if migration was
  actually needed, so it's idempotent. The real `database.json` (3
  entries) was migrated and verified; a pre-migration copy is kept at
  `backups/memory_migration_2026-07-21/database.json.pre-v2`.
- **Search / filter / ranking / context injection**: `store.search()`
  (keyword match over content + tags), `store.filter()` (by type / tag /
  minimum importance), both ranked by importance-then-recency via a shared
  `rank()` helper. `core/memory/context.js` and `core/context/engine.js`
  (context injection into the router → intelligence pipeline) now both go
  through this instead of duplicating keyword-matching logic.
- `remember()` still accepts a bare string for backward compatibility
  (defaults to `type: "general"`, `importance: 3`) alongside the full
  structured object form.
- 5 new tests in `tests/memory-store.test.js`, using a backup/restore
  hook around the real data file so the suite never leaves test data in
  it.

Phase 4 (Knowledge Graph) is complete as of 2026-07-21:

- `core/knowledge/index.js` — `addEntity()`/`addRelationship()` are now
  idempotent (by name, and by the (from, type, to) triple respectively),
  so they're safe to call on every boot without accumulating duplicates.
  Added `connections(name)` (every relationship touching an entity, either
  direction) and `retrieve(query)` (matching entities + all relationships
  touching them, deduplicated) — the "connections" and "knowledge
  retrieval" capabilities the protocol asked for.
- `core/knowledge/seed.js` — new. Seeds the graph with what VERONICA
  factually knows: Jacob *builds* VERONICA, VERONICA *uses* Claude,
  VERONICA *contains* each of the 9 registry agents, and each agent
  *belongsTo* its department — this is the exact example graph from the
  protocol document, populated from real registry data rather than
  hand-written. Idempotent, so it's called on every boot from
  `core/interface/terminal.js` (the actual entry point) right after
  agents load, keeping the graph in sync with the registry automatically.
- **Live data seeded**: the real `graph.json` (previously an empty
  `{entities: [], relationships: []}` scaffold) now has 21 entities and 20
  relationships. Pre-seed backup at
  `backups/knowledge_seed_2026-07-21/graph.json.pre-seed`.
- `core/context/engine.js` — now calls `knowledge.retrieve(query)` instead
  of the old flat `knowledge.find(query)`, so agent context injection
  includes real connected relationships, not just name matches.
- Terminal: added `knowledge.view` and `knowledge.find <name>` commands.
- 5 new tests in `tests/knowledge.test.js` (idempotency, bidirectional
  connections, retrieval, and seed-from-registry correctness), using the
  same backup/restore-around-the-real-file pattern as the memory tests.

**Note**: while wiring this in, confirmed `core/executive/index.js` is a
second, redundant boot sequence — `package.json`'s `main`/`start` point at
`core/interface/terminal.js` directly, and nothing calls
`core/executive/index.js`. It duplicates identity/department/agent loading
and then itself `require`s `terminal.js` at the end, so running it
directly would load agents twice. Not resolved this pass — flagged as a
new technical debt item (see `docs/Architecture.md`).

Phase 5 (Agent Network — department build-out) is complete as of
2026-07-21:

- `core/departments/base.js` — new shared `DepartmentManager` class:
  `run(task)` delegates to the department's agent(s) and appends a JSON
  line to `departments/<id>/logs/activity.log`; `remember()`/`recall()`
  give department-scoped memory access by tagging shared `core/memory`
  entries with the department id (per the memory-architecture decision
  already recorded — no separate per-department store); `statusReport()`
  exposes id/domain/status/agents/tools.
- `core/departments/loader.js` — new. Reads `registry/departments.json`,
  requires each department's own `manager.js`, and hands it the agents
  whose `department` field matches (one agent per department today).
- All 9 `departments/<id>/manager.js` — populated (were 0 bytes). Each is
  a thin factory over the shared base class, per the "modular, not
  duplicated" decision in `docs/Architecture.md`.
- All 9 `departments/<id>/identity.json` — populated (were 0 bytes),
  derived from real `registry/agents.json` + `registry/departments.json`
  data (id, name, domain, status, primaryAgent, role, capabilities) — no
  invented content.
- `registry/departments.json` — status changed from `"planned"` to
  `"active"` for all 9, now that each has a working manager. Backup at
  `backups/departments_activation_2026-07-21/departments.json.pre-active`.
- Terminal: added `departments.list`.
- `tools` stays `[]` on every department — Phase 6 doesn't exist yet, so
  there's nothing real to point to; `departments/<id>/tools/` and
  `.../reports/` stay empty and reserved.
- 5 new tests in `tests/departments.test.js`. **Also fixed**: `node --test`
  runs test *files* concurrently by default, and this new file touches the
  same shared `core/memory/database.json` that `memory-store.test.js`
  already backs up/restores — a real race that could have corrupted live
  memory data. Fixed by adding `--test-concurrency=1` to the `test` script
  in `package.json`.

Phase 6 (Tool System) is complete as of 2026-07-21:

- `core/tools/base.js` — `Tool` class: every call is permission-checked
  against the caller's granted permissions before running, and every
  handler error is caught and re-thrown attributed to the tool id (no
  raw, unattributed exceptions).
- `core/identity/index.js` — new. The enforcement layer that was missing
  since the original audit: reads `identity/roles.json` +
  `identity/permissions.json`, exposes `permissionsForRole(roleId)` /
  `hasPermission(roleId, permission)`. Fixed the roles/permissions
  vocabulary mismatch described in §5 while building this.
- `registry/tools.json` — populated (was 0 bytes) with 5 real tools:
  `memory.remember`, `memory.recall`, `knowledge.query`,
  `filesystem.readFile`, `filesystem.writeFile`. Each declares its
  required permission.
- `core/tools/loader.js` — mirrors `core/agents/loader.js`'s pattern:
  registry JSON declares identity, `core/tools/handlers/*.js` supplies
  the actual behavior, joined by tool id.
- `core/tools/handlers/filesystem.js` — deliberately **sandboxed** to
  `data/workspace/` rather than given unrestricted filesystem access.
  Every path is resolved against the sandbox root and rejected (relative
  traversal `../../etc/passwd` and absolute paths `/etc/passwd` both
  tested) if it would resolve outside it — giving agents raw
  `fs.readFile`/`writeFile` access would have been a real path-traversal
  vulnerability, not just a Phase 6 checkbox. `data/workspace/` is
  gitignored (agent-generated scratch content shouldn't be
  version-controlled) with a tracked `.gitkeep`.
- `memory`/`knowledge` tool handlers are thin wrappers over the existing
  Phase 3/4 systems — no new storage, just permission-gated access to
  what already exists.
- `core/departments/base.js` — `DepartmentManager.tools` now reflects the
  real registered tool list (was a hardcoded `[]`); added `useTool(id,
  args)`, which calls tools with `department_manager`-level permissions.
- Terminal: added `tools.list` and `tools.run <id> <json args>` (runs
  with `executive`-level permissions, since the terminal represents a
  trusted human operator).
- **Deliberately not built**: full API/database/web-access/automation
  tools from the protocol's list, and an agentic tool-use loop (the brain
  autonomously deciding to call a tool mid-conversation via Claude's
  tool-use API). The former have no concrete need yet (no external APIs
  or databases exist in this system to wrap); the latter is a real
  feature with its own design surface (which agents get which tools, how
  the intelligence layer decides to invoke one, multi-turn tool loops) and
  the most security-sensitive piece here (agent-initiated action) — it
  deserves its own explicit scoping rather than being bolted on. What's
  built is the architecture plus real, permission-checked, sandboxed
  tools a human operator (or department code) can call directly today.
- 12 new tests in `tests/tools.test.js` covering permission
  enforcement, error wrapping, sandbox-escape rejection (both relative
  and absolute), and real round-trips through memory/knowledge/filesystem.

Phase 7 (Dashboard) is complete as of 2026-07-21:

- `dashboard/backend/server.js` — new. A read-only HTTP façade over
  `core/agents`, `core/departments`, `core/memory`, `core/knowledge`, and
  `core/tools` — no duplicated logic, every endpoint just calls the same
  modules the terminal already uses. Built on Node's built-in `http` only
  (no new dependencies): `GET /api/status`, `/api/agents`,
  `/api/departments`, `/api/memory` (optional `?type=`/`?q=` filters, same
  Phase 3 search/filter), `/api/knowledge`, `/api/tools`, `/api/activity`
  (merges every department's `activity.log`, most recent first).
- Static file serving is sandboxed to `dashboard/frontend/` using the same
  `path.resolve()` + prefix-check pattern as the Phase 6 filesystem tool.
  Uses the WHATWG `URL` API (not the deprecated `url.parse()`, which Node
  itself flags as having security implications) — verified this also
  normalizes `../` path segments before the sandbox check even runs, so
  it's a second layer, not a weaker one.
- `dashboard/frontend/` — new. Plain HTML/CSS/JS, no build step, no
  framework — a dark-theme, four-panel layout (System / Personal /
  Business / Intelligence) matching the protocol's spec exactly, polling
  the API every 15s. Every panel shows **real** data via the Phase 3
  memory-type filters (`goals`, `projects`, `businesses`, `decisions`) —
  empty categories show an honest "no data yet" message rather than
  placeholder/fake content.
- `npm run dashboard` starts it (`DASHBOARD_PORT` env var, default 4000).
- 10 new tests in `tests/dashboard.test.js`, spinning up the real server
  on an OS-assigned ephemeral port and hitting real HTTP endpoints
  (including a raw `http.request` test proving the sandbox rejects a
  literal `../` path that `fetch()` itself would have normalized away
  before it could even test the guard).
- **Not built**: the protocol's literal "tasks" bullet under Personal —
  there's no dedicated `tasks` memory type from Phase 3 (only `goals` and
  `projects`), and inventing one without a real task system behind it
  would just be a fake widget. Personal shows goals + projects, both
  backed by real data. Also not built: any write/action capability from
  the dashboard (it's read-only this pass) — a natural next step, but a
  separate scope with its own auth/safety questions.

Phase 8 (Device Awareness) is complete as of 2026-07-21 — the last phase
in the original protocol roadmap:

- **Device identity**: `core/device/index.js` — new. Persists
  `id`/`name`/`role`/`createdAt` to `core/device/device.local.json` on
  first run (gitignored — machine-specific, like `.env`, not meant to be
  shared/committed). Role defaults to a best-effort guess (headless Linux
  → `server`, everything else → `laptop`) and is correctable via
  `setRole()`. Verified for real: this machine now has a persisted
  identity (`role: "laptop"`, real hostname).
- **Device roles/permissions**: `registry/devices.json` — new, defines
  `laptop`/`desktop`/`phone`/`server`, each with a permission list drawn
  from the *same* vocabulary as `identity/permissions.json` (added a new
  `sync` permission to that shared vocabulary rather than inventing a
  second, incompatible one — exactly the drift bug fixed in Phase 6, not
  repeated here).
- **Synchronization layer**: scoped to what's actually buildable and
  verifiable without a second physical device — an export/import/merge
  mechanism, not a speculative always-on network daemon.
  - `core/memory/store.js` gained `merge()`: last-write-wins by `updated`
    timestamp, per-id.
  - `core/knowledge/index.js` gained `merge()`: reuses the existing
    name-based idempotency of `addEntity()`/`addRelationship()`.
  - `core/device/sync.js` — `exportState()`/`importState()` tying device
    identity + memory + knowledge into one portable package.
  - Transport: `GET /api/sync/export` / `POST /api/sync/import` on the
    Phase 7 dashboard server — two VERONICA instances sync by one
    fetching the other's export and POSTing it to its own import. Real
    and testable today (verified end to end with curl), without needing
    to invent a new protocol.
  - **Security**: sync exposes and mutates memory/knowledge data over the
    network, unlike the Phase 7 read-only endpoints, so it fails closed —
    disabled (501) unless a token env var is set, and requires a matching
    `Authorization: Bearer` header (403 otherwise). That token was named
    `SYNC_TOKEN` at the time; renamed to `API_TOKEN` in the follow-up
    work below once it started gating other write endpoints too.
  - **Also fixed while building this**: the dashboard server was binding
    to all network interfaces by default (Node's default when no host is
    passed to `.listen()`) — meaning the Phase 7 dashboard was already
    reachable from other devices on the LAN, unintentionally, exposing
    memory/knowledge contents. Now defaults to `127.0.0.1` (localhost
    only); multi-device reach is opt-in via `DASHBOARD_HOST=0.0.0.0`.
- Terminal: added `device.identity`.
- 13 new tests across `tests/device.test.js` and `tests/sync.test.js` —
  identity persistence, role validation, merge conflict resolution (older
  vs. newer timestamp), and the full HTTP auth + import flow with a
  hand-crafted remote package. **58/58 tests pass.**
- **Not built**: real cross-device network discovery/pairing, a live
  always-on sync daemon, and conflict resolution beyond last-write-wins
  (e.g. three-way merge) — none of these can be built responsibly without
  a second real device to test against, and last-write-wins is the
  correct default for now, not a placeholder.

This completes every phase in the original protocol roadmap (Phases
0–8). Remaining open items, none of them phases: the agentic tool-use
loop (flagged in Phase 6), dashboard write actions (flagged in Phase 7),
and the still-open `core/executive/index.js` vs.
`core/interface/terminal.js` duplicate boot path (flagged in Phase 4).

---

## 9. Follow-up work (post-roadmap)

All three items flagged above were resolved on 2026-07-21/22.

### Boot path resolved

`core/executive/index.js` and `core/executive/testBus.js` archived to
`backups/executive_retirement_2026-07-21/` after confirming via a
repo-wide grep that nothing referenced the module. Its one useful piece —
loading `core/veronica/identity.json` and publishing a `system.ready` bus
event on boot — was folded into `terminal.js` directly. `system.status`
(terminal command and dashboard `/api/status`) now reports the real
identity name/mission instead of a hardcoded `"VERONICA"` string. Verified
by driving the real terminal end to end via piped stdin. See
`docs/Architecture.md`.

### Agentic tool-use loop

This was the deepest of the three, and it surfaced a real, previously
undetected architectural gap: **`DepartmentManager.run()` never actually
called the brain.** It called `agent.process()` (`core/agents/base.js`),
which just returns a hardcoded canned string — meaning every
department-driven task (as opposed to a direct `ask` command through the
router) had been producing fake responses since Phase 5, without any test
catching it because the Phase 5 tests mocked `agent.process()` directly
rather than exercising the real reasoning path.

- `core/brain/providers/claude.js` — added `generateWithTools()`: a real
  Anthropic tool-use loop (offer tool definitions, execute any
  `tool_use` blocks Claude returns, feed results back, repeat up to
  `maxTurns` — default 5, a hard stop against a runaway loop). The
  Anthropic client is now injectable via the constructor so tests can
  supply a scripted fake client instead of hitting the real API.
- `registry/tools.json` — every tool gained an `inputSchema` (JSON
  Schema), so Claude knows what arguments each tool expects.
  `core/tools/anthropicSchema.js` — new, converts the tool registry to
  Anthropic's format with an explicit bidirectional id↔name map (tool ids
  use dots, Anthropic tool names can't — built from the live registry
  each call rather than a blind string replace, so it can never drift).
- `core/brain/provider.js` / `core/brain/index.js` / `core/intelligence/index.js`
  — `options` (`{useTools, role, maxTurns}`) now threads through the full
  call chain. `Intelligence.think()` defaults to `useTools: true, role:
  "agent"` for every agent reasoning call — agent-level permissions only
  (read_memory, write_memory, execute_tools; not manage_agents or
  communicate).
- **Fixed the gap above**: `DepartmentManager.run()` now calls
  `this.intelligence.think()` (a real `IntelligenceEngine` instance, same
  class `core/router` uses) instead of the canned `agent.process()`. The
  existing flat `{agent, response}` return contract is preserved (callers
  don't need to change) with a new `.thought` field carrying the full
  reasoning trace, including which tools were called. `Agent.process()`
  itself was left in place (not deleted) as an available offline/canned
  preview method — just no longer on the live path.
- 5 new tests in `tests/claude-tooluse.test.js` using a scripted fake
  Anthropic client (no real API calls): plain response, immediate
  no-tool-needed response, a real tool execution round-trip (verified the
  memory entry it wrote actually landed in the real store), a failed
  tool call that doesn't crash the loop, and the `maxTurns` cutoff.
  `tests/departments.test.js`'s `run()` test updated to mock the brain
  provider (same pattern `tests/brain-provider.test.js` already used)
  instead of the now-removed `agent.process()` mock.
- **One real, live verification against the actual Claude API** (not
  mocked, small real cost): asked it to look up the `VERONICA` knowledge
  graph entity via tool use and describe it in one sentence. It correctly
  called `knowledge.query` and answered "VERONICA is a 'system' type
  entity" — confirming the full loop (schema construction, Claude's
  tool_use decision, real permission-gated execution, feeding results
  back, grounded final answer) genuinely works, not just against mocks.

### Dashboard write actions

- `SYNC_TOKEN` renamed to `API_TOKEN` — it now gates every mutating
  dashboard endpoint, not just sync, so the sync-specific name no longer
  fit. No back-compat alias: nothing external depended on the old name
  yet.
- Three new endpoints, all requiring `API_TOKEN` the same way sync does
  (fails closed if unset, `403` on a wrong/missing bearer token):
  - `POST /api/memory` — mirrors the terminal's `remember`.
  - `POST /api/tools/:id/run` — mirrors `tools.run`.
  - `POST /api/departments/:id/run` — mirrors `departments.list` + a real
    task dispatch; this is the endpoint that now makes real Claude API
    calls (with tool use) via the fix above.
- `dashboard/frontend/` — new "Actions" panel: an API token field
  (stored in the browser's `localStorage` only), a "Remember" form, and a
  department task-runner form with a live result readout.
- Verified for real with curl (POST /api/memory, POST /api/tools/:id/run)
  and by loading the actual served frontend HTML/CSS/JS. The one real
  memory entry written during that manual verification was removed
  afterward — it was verification noise, not real data.
- Tests: `tests/dashboard.test.js` gained backup/restore hooks (it was
  read-only before, now writes) plus coverage for auth-gating,
  validation, and a full success round-trip for the cheap endpoints
  (`/api/memory`, `/api/tools/:id/run`). `POST /api/departments/:id/run`
  is tested for auth/validation/routing only, deliberately **not** a full
  success path — that would trigger a real, paid Claude call on every
  test run. The underlying logic is covered by the mocked
  `departments.test.js` test plus the one real verification above.

**68/68 tests pass** after all three items. `npm run dashboard` (with
`API_TOKEN` set) now exposes a real, working, permission-gated write
surface — memory, tools, and department task execution — on top of the
Phase 7 read-only dashboard.
