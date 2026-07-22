# VERONICA — Production Readiness Assessment

**Phase:** 10 — Operational Validation (architecture-complete → validated)
**Scope:** end-to-end operator workflows, sandbox company simulation,
the goal→planning→department→execution→memory pipeline, and a security
audit of permissions, company isolation, and tools. No new capabilities
were added in this phase — everything below either validates existing
behavior or fixes a bug found while validating it.

**Verdict: ready for continued single-operator personal use. Not yet
ready for multi-user or adversarial-input use** — see "Not production
ready" below for the specific, load-bearing reasons why.

---

## 1. What was validated

Four realistic end-to-end operator sessions were built as regression
tests (`tests/e2e-operator-workflows.test.js`), each using real classes
wired together the same way `dashboard/backend/server.js` and
`core/interface/terminal.js` actually do — only the LLM call itself is
mocked (same convention every other test in this suite already uses),
everything else is the real memory store, real knowledge graph, real
company layer, real collaboration engine, and the real automation
engine.

| # | Workflow | What it proves |
|---|---|---|
| 1 | **Personal goal pipeline** | `plan()` → `decompose()` (with a real dependency between two tasks) → dependency-gated execution via `ExecutiveOrchestrator` → cascading completion (task → milestone → project) → memory artifacts persisted → learning performance stats recorded → `report()` reflects the finished state. This is the literal "goal → planning → department → execution → memory" pipeline this phase asked to validate. |
| 2 | **Sandbox company simulation** | A company created, staffed, given a project, executed, and financially tracked end to end (employees, documents, relationships, communications, revenue/expense) — then checked against a second, unrelated company for both direct-access isolation (`CompanyContext`) and reasoning-context isolation, using this scenario's own real data rather than only synthetic test tags. |
| 3 | **Multi-department collaboration** | One department delegates work to another via `CollaborationEngine`; the exchange is discoverable through `history()` and the knowledge graph. |
| 4 | **Autonomous execution** | The real `AutomationEngine` class (not a mock) drives task execution through `registerJob()`/`runNow()` — one bounded task per invocation, exactly as it runs in production. |

Combined with the existing suite (unit/integration tests for every
subsystem — executive, memory, knowledge, departments, collaboration,
learning, automation, integrations, device, vision), the full test
count is **230, all passing**.

---

## 2. Security audit findings

### 2.1 Fixed this phase

**Cross-company data leak in the reasoning context path (critical).**
`core/executive/companyContext.js` enforces isolation for direct
memory reads/writes, but the ambient context every reasoning call
automatically receives (`core/context/engine.js`'s `retrieve()`,
wired in by every `DepartmentManager.run()` call) searched the
**entire** shared memory store regardless of which company a task
belonged to. In practice: a department executing a task for Company A
could see Company B's finances, communications, and documents in its
injected reasoning context — the exact thing company isolation is
supposed to prevent, just reachable through a different path than
direct reads. Root cause was two compounding gaps: milestones/tasks
never carried their parent project's company tag at all, and nothing
threaded a `companyId` from task → department → context retrieval even
where the plumbing existed. Both are now fixed and covered by 6 new
tests (see the "Security audit" commit and Workflow 2 above, which
re-confirms it against realistic data, not just synthetic tags).

**Real memory/knowledge data and manual backups tracked in git
(critical, hygiene).** `core/memory/database.json` and
`core/knowledge/graph.json` — the actual data this personal AI system
accumulates — were tracked in git and never added to `.gitignore`
alongside the other runtime-state files that already get this
treatment (`core/automation/state.json`, `core/memory/embeddings.json`,
`core/device/*.json`). A `backups/` directory of manual snapshots
(unrelated to this project's own code) was tracked too, including an
old snapshot of early memory/knowledge content. Both are now untracked
and gitignored; `core/memory/store.js` gained a bootstrap fallback
(mirroring what `core/knowledge/index.js` already had) so a fresh
clone without these files still works. **Earlier commits still contain
this data in git history** — current content is low-sensitivity
bootstrap-only material (a handful of "VERONICA memory online"-style
entries and old code snapshots, no real financial/business data was
ever exposed this way), but as real usage accumulates, the pattern
would have become a genuine privacy problem. Whether to rewrite git
history to purge it entirely (`git filter-repo` or BFG) is a decision
for the repository owner — rewriting published history on
`origin/development` is destructive and wasn't performed as part of
this audit.

**Dead file removed.** `core/memory/memory.json` — no code referenced
it; superseded by `database.json` long ago.

### 2.2 Documented, not fixed (deliberately, and why)

**`CompanyContext`'s `allowedRoles` restriction is not enforced by the
main executive pipeline.** `ExecutivePlanner`, `GoalDecomposer`,
`ProjectManager`, and `ExecutiveOrchestrator` all read/write memory
directly — none of them route through `CompanyManager.context()`.
`executive.companyContext(companyId)` is reachable from the facade but
has **zero callers** anywhere in `dashboard/backend/server.js`,
`core/interface/terminal.js`, or any tool handler today. In practice
this means: creating a company with `allowedRoles` restricts access
*only* for a caller that deliberately constructs a
`CompanyContext` (as this audit's own tests do) — the ordinary
`executive.*` API a real operator session actually uses enforces no
company-level role check at all. This is a real gap, but retrofitting
role checks across the entire executive pipeline is a structural
change to how that pipeline works, not a bug fix — out of scope for a
"no major features" validation phase. **Recommendation:** treat
`allowedRoles` as not-yet-load-bearing until a follow-up phase wires it
into the actual read/write paths, not just the standalone primitive.

**The knowledge graph has no company-level scoping at all.** Entities
and relationships (`core/knowledge/index.js`) carry no company tag —
the reasoning-context fix in this phase scoped memory search only.
Adding company scoping to the graph would mean tagging every
entity/relationship by company and updating `addEntity()`/
`addRelationship()`'s signatures — a larger structural change than this
phase's scope allows. **Recommendation:** low priority today (the
graph mostly holds structural/relationship data, not raw sensitive
content the way memory entries do), but worth closing before any
multi-company deployment with genuinely adversarial isolation
requirements.

**Git history still contains low-sensitivity legacy data** (see 2.1)
— a rewrite is the owner's call, not performed here.

### 2.3 Verified clean (no issues found)

- All 49 registered tools reference a permission that's actually
  granted to at least one role in `identity/roles.json` — no
  dead-end/unreachable permission strings.
- All 4 path-sandboxed modules (`core/tools/handlers/filesystem.js`,
  `core/integrations/obsidian.js`, `core/vision/engine.js`,
  `core/integrations/fileIntelligence.js`) still correctly resolve and
  reject any path that would escape their sandbox root.
- All 27 mutating dashboard routes enforce `checkApiAuth()` (regression
  test in `tests/dashboard.test.js`, extended this phase to cover every
  route added since).
- `.env` is not tracked in git.
- Outbound HTTP (`core/integrations/http.js`, and by extension
  `github.js`/`discord.js`) still fails closed without
  `SERVICE_ALLOWLIST`, and the API token comparison is still
  constant-time.
- `Tool.execute()`'s permission check and `ToolRegistry.run()`'s
  role→permission resolution (defaulting to the least-privileged
  `"agent"` role when unspecified) both hold up under inspection — no
  logic bugs found.

---

## 3. Not production ready (specific, load-bearing reasons)

1. **Company access control is a self-service primitive, not an
   enforced boundary on the main pipeline** (2.2 above). Don't rely on
   `allowedRoles` to actually restrict access to a company's projects/
   tasks/status through the ordinary executive API today.
2. **Knowledge graph has no company isolation.** A company's entities/
   relationships are visible to any caller that queries the graph,
   regardless of company scope.
3. **Git history carries legacy low-sensitivity data** that should be
   purged before treating this repository as safe to make public or
   share broadly, even though current content isn't seriously
   sensitive.
4. **Calendar/Email/Cloud storage connectors are interface-only**
   (from Phase 9) — not a security issue, but not functional either.
5. **Autonomous execution has no operator-facing pause control** beyond
   not registering the job or stopping automation entirely — acceptable
   for single-operator personal use, not for a setting where someone
   other than the operator needs to be able to halt it quickly.
6. **No browser-based visual verification** exists for the dashboard UI
   in this environment — endpoint- and syntax-level checks only.

## 4. What IS ready

- The core goal→plan→decompose→execute→evaluate→memory→report pipeline
  works end to end, with real dependency gating, real cascading
  completion, and real failure handling (a failing task is marked
  blocked, not retried forever).
- The company/business layer (companies, employees, documents,
  finances, relationships, communications) is fully functional and
  internally consistent.
- Multi-department collaboration (delegation, review, consensus) works
  and is discoverable via history and the knowledge graph.
- The autonomous execution loop is safe by construction: one bounded
  task per tick, crash recovery, persisted queue/schedule state,
  structured logging, and opt-in wiring (a host must explicitly call
  `automation.registerExecutionJob()` with real departments — simply
  requiring `core/automation` never risks unattended execution).
- Every dashboard write action fails closed without `API_TOKEN`; every
  outbound network call fails closed without `SERVICE_ALLOWLIST`.
- 230 tests passing, covering every subsystem plus the 4 end-to-end
  workflows above.

## 5. Recommended next phase

1. Decide whether `allowedRoles` should become load-bearing (wire
   `CompanyContext` into the executive pipeline itself) or be removed
   as a primitive that implies more protection than it delivers.
2. Decide on the git-history question (2.1) before any wider sharing of
   this repository.
3. Pick a concrete provider for at least one placeholder integration.
4. If multi-operator or untrusted-input use is ever planned, close the
   knowledge-graph isolation gap and add the symlink-escape hardening
   already flagged in the v1 release audit (`docs/Architecture.md`).
