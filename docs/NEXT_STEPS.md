# VERONICA — Next Steps

Snapshot as of Phase 54 (Automation Engine 2.0). 695/695 tests passing.
**Standing objective**: continue autonomously until there is genuinely
nothing left that can be built locally without external credentials,
hardware, OAuth, a legal/business decision, or browser-based visual
verification. Phases 55-60 (Multi-Model Intelligence, Personal
Intelligence Engine, Knowledge Acquisition Engine, Mission Control
Dashboard, Autonomous Capability Builder, Personal Operating System)
are being pursued under that condition, not as a fixed list to finish
and stop -- see `docs/CHANGELOG.md` for the full history.

## Resolved since the last snapshot

- **Automation Engine 2.0** (Phase 54): `core/automation/workflow.js`
  -- composable multi-step workflows (`defineWorkflow()`/`runWorkflow()`)
  layered over the existing `AutomationEngine`, not a second job queue.
  Real branching (`onSuccess`/`onFailure` step-id edges), real
  conditions (skip without failing), real per-step retries, real
  rollback (most-recently-completed-first on failure), reusable
  templates (one definition, many `runWorkflow()` calls with different
  context), and a real persisted REPORT per run. Approval is not a new
  mechanism -- a step's own handler can create/poll a real
  `ActionProposalEngine` proposal. Wired into the dashboard and the
  existing SSE event stream.

## Resolved earlier (Phase 41-53, unchanged from the last snapshot)

- **Continuous Observation Engine + Universal Event Bus** (Phase
  52-53): widened `core/bus/`'s real event vocabulary at 5 existing
  choke points, plus two new local observers (`gitObserver.js`,
  `connectorHealth.js`).
- **Executive Constitution** (Phase 51): wired into every single
  `Intelligence.think()` call.
- **Department Collaboration** (Phase 50).
- **Organizational Knowledge Graph expansion** (Phase 49).
- **Executive Intelligence** (Phase 48).
- **All six Divisions are production-ready** (Phase 41-46).
- **The recommendation feedback loop is closed** (Phase 47).
- **A real, recurring circular-require bug class** was found and fixed
  four times: any module reachable from a package tool handler must not
  top-level-require anything in the `core/learning`/`core/intelligence`/
  `core/brain` chain.
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing duplicate `id="system-health"`.

## In progress -- Phases 55-60 (open-ended, not a fixed backlog)

1. **Phase 55 — Multi-Model Intelligence.** Audit `core/brain/providers/`
   (Claude + OpenAI fallback already exist) before building new
   routing -- no Gemini/local-model credentials exist to test against,
   so the real, buildable gap is task-type-based routing logic between
   the two providers that already exist, not new provider integrations.
2. **Phase 56 — Personal Intelligence Engine.** Audit
   `core/profile/personalContextEngine.js` and the Constitution (Phase
   51) before adding new "evolving models" -- must only infer from real
   observed evidence, never invent facts. Track confidence per
   inference; allow correction.
3. **Phase 57 — Knowledge Acquisition Engine.** Audit
   `core/integrations/fileIntelligence.js`, `core/integrations/obsidian.js`,
   and `core/research/` before building new ingestion -- likely mostly
   real already; the gap may be connecting more real source types into
   the knowledge graph pipeline Phase 49 already built.
4. **Phase 58 — Mission Control Dashboard.** The ~25-panel command-center
   redesign genuinely needs browser-based visual iteration this
   environment cannot do responsibly headless -- a real stop condition.
5. **Phase 59 — Autonomous Capability Builder.** Audit
   `core/capabilities/autonomousBuilder.js` (already exists, Phase 26)
   before treating this as new.
6. **Phase 60 — Personal Operating System (boot/resident supervisor).**
   Genuinely requires a real LaunchAgent install and macOS-level
   decisions -- a human action.
7. **The git-history rewrite question** and **knowledge-graph company
   isolation** (both Phase 10, still open) -- unchanged.
