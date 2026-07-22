# VERONICA — Production Readiness Assessment

**Phase:** 10 — Operational Validation (architecture-complete → validated)
**Scope:** end-to-end operator workflows, sandbox company simulation,
the goal→planning→department→execution→memory pipeline, and a security
audit of permissions, company isolation, and tools. No new capabilities
were added in this phase — everything below either validates existing
behavior or fixes a bug found while validating it.

**Update (Phase 10 follow-up):** the one finding in §2.2 below that
called for a real fix rather than a documentation-only note —
`CompanyContext`'s `allowedRoles` not being enforced by the main
executive pipeline — has been fixed. See §2.1's new entry and
`docs/Architecture.md`'s "Company access control in the executive
pipeline" for the design. §2.2/§3 below are left in their original,
"found but not yet fixed" form for the record, with a note pointing to
the fix.

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
learning, automation, integrations, device, vision) and the 10
company-access-control tests from the Phase 10 follow-up (§2.1), the
full test count is **240, all passing**.

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

**`CompanyContext`'s `allowedRoles` restriction was not enforced by the
main executive pipeline (fixed in a Phase 10 follow-up).**
`ExecutivePlanner`, `GoalDecomposer`, `ProjectManager`, and
`ExecutiveOrchestrator` all read/write memory directly — none of them
routed through `CompanyManager.context()`, so a company created with
`allowedRoles` restricted access *only* for a caller that deliberately
constructed a `CompanyContext` itself, not the ordinary `executive.*`
API a real operator session (or the autonomous execution job) actually
uses. Fixed by `ExecutiveOrchestrator.authorizeExecution()`, called at
the top of every `executeTask()` — before the department is even looked
up — validating companyId (an unknown company throws), identity (the
acting role and device role, resolved from an explicit `actor` or
defaulting to `{ role: "executive", deviceRole:
device.currentIdentity().role }`), role permissions
(`identity.hasPermission(role, "execute_tools")`, and separately the
device role's own), and the requested action (a small explicit set,
`["execute_task"]` today, not an arbitrary string) — then, if the task
is company-scoped, reuses the existing `CompanyContext.requirePermission()`
check rather than duplicating it. A denial is caught and returned as a
distinct `{ outcome: "denied" }` (marking the task `"blocked"`, not a
permanent dead end — a retry with a permitted actor succeeds normally),
the same shape a thrown `department.run()` error already produced for
`"failure"`. See `docs/Architecture.md`'s "Company access control in
the executive pipeline" for the full design, and
`tests/company-access-control.test.js`'s 10 tests (every denial path
independently, the allow paths, and two integration tests confirming a
denial never reaches `department.run()`, verified with a spy).

**Scope of the fix:** this closes the gap for the executive/orchestrator
pipeline specifically (`pursue()` → `decompose()` →
`executeTask()`/`runNextReadyTask()`) — what was actually flagged.
Direct `DepartmentManager.run()` calls outside the orchestrator
(`CollaborationEngine.delegate()`/`review()`/`consensus()`, the
dashboard's direct `/api/departments/:id/run`) were never company-scoped
in the first place, so there's nothing for this check to enforce there.
This also doesn't add a real human-identity/session system —
`resolveActor()`'s default (`"the system, acting for itself"`) is
honest about what VERONICA actually models today (no login/session
concept exists), not a stand-in for one.

### 2.2 Documented, not fixed (deliberately, and why)

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

1. ~~Company access control is a self-service primitive, not an enforced
   boundary on the main pipeline~~ — **fixed**, see §2.1.
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
7. **No real human-identity/session system.** Every executive-pipeline
   authorization (§2.1) resolves to "the system, acting for itself"
   unless a caller explicitly passes a different actor — there's no
   login, no per-human role assignment, and nothing in the dashboard/
   terminal today actually supplies a non-default actor. The
   enforcement mechanism is real; the identity behind it is still just
   VERONICA acting on its own authority.

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
- **Company-scoped task execution is authorized end to end**: companyId,
  acting identity (role + device), role permissions, and the requested
  action are all validated before a department ever runs a company-scoped
  task, and a restricted company's `allowedRoles` is now actually
  enforced by the pipeline that executes its work (§2.1).
- 240 tests passing, covering every subsystem plus the 4 end-to-end
  workflows and the 10 new access-control tests above.

## 5. Recommended next phase

1. Decide on the git-history question (2.1) before any wider sharing of
   this repository.
2. Pick a concrete provider for at least one placeholder integration.
3. If multi-operator or untrusted-input use is ever planned, close the
   knowledge-graph isolation gap (§2.2) and add the symlink-escape
   hardening already flagged in the v1 release audit
   (`docs/Architecture.md`).
4. If VERONICA ever needs to distinguish between real human operators
   (not just "the system acting for itself"), a login/session concept
   would need to exist before `authorizeExecution()`'s identity check
   means much more than it does today.
