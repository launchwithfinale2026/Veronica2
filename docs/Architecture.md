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
