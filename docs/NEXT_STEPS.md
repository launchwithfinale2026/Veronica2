# VERONICA — Next Steps

Snapshot as of Phase 48 (Executive Intelligence -- cross-department
synthesis). 656/656 tests passing. **Phase 41-46 closed the entire
"make every Division production-ready" arc**, **Phase 47 closed the
recommendation feedback loop**, and **Phase 48 added the
cross-department synthesis layer over all six Divisions' real
analytics** -- see `docs/CHANGELOG.md` for the full history, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **Executive Intelligence** (Phase 48):
  `core/executive/executiveIntelligence.js` -- real company health
  scoring (Finance/Sales/Marketing composite, explainable per category),
  risk forecasting (deadlocked projects + low runway + off-track KPIs),
  cross-department recommendations (sales pipeline vs. marketing
  support), quarterly/annual planning (real roadmap + KPIs filtered by
  real period), and an LLM-synthesized executive brief. Wired into the
  daily briefing (`strategicHealth()`) and the dashboard (six new GET
  routes, one gated POST, one new panel). Not a new package -- part of
  the executive layer itself, reusing every Division's already-real
  analytics.
- **`BlockerDetector`'s deadlocked-project output now carries a real
  `company` field** (additive), needed so risk forecasting can scope
  deadlocked projects to one company.

## Resolved earlier (Phase 41-47, unchanged from the last snapshot)

- **All six Divisions are production-ready** (Phase 41-46): Marketing,
  Sales, Finance, Research, Trading Research, Business Operations --
  each with real domain engines, real tools, real agent prompts, and
  full dashboard surfacing. `core/capabilities/health.js` reports all
  six as genuinely `"active"`.
- **The recommendation feedback loop is closed** (Phase 47):
  `core/executive/executiveRecommendations.js`'s `generate()` now
  annotates every recommendation with its real historical acceptance
  rate and real recurrence count.
- **A real, recurring circular-require bug class was found and fixed
  four times** (Sales, proactively Marketing, Research's `missions.js`
  AND `engine.js` itself, designed around from the start in Trading and
  Business Operations): any module reachable from a package tool
  handler must not top-level-require anything in the
  `core/learning`/`core/intelligence`/`core/brain` chain. Watch for
  this in any future domain module -- including any future addition to
  `core/executive/executiveIntelligence.js` itself, which currently
  avoids the whole chain (its lazy requires are only Finance/Sales/
  Marketing/Operations/BlockerDetector/Planner, none of which touch
  `core/learning`).
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s.

## Recommended Phase 49+

1. **Organizational Knowledge Graph expansion** -- connect campaigns,
   opportunities, portfolios, SOPs, KPIs, and meetings into
   `core/knowledge`'s existing graph (companies/departments/agents are
   already there). Audit which of the six new divisions' entities
   already create knowledge graph entities (companies, campaigns, and a
   few others do; leads/opportunities/portfolios/SOPs/KPIs/meetings
   currently do not) before adding edges. Executive Intelligence's own
   outputs (health scores, risks, briefs) are candidates for graph
   nodes too, once the underlying entities are connected.
2. **Department Collaboration** -- a real framework for one department
   requesting work from another (e.g. Marketing requesting Research),
   rather than hardcoded cross-references. Audit the existing Mission
   Engine and task-dependency graph (`core/executive/decomposer.js`)
   first -- a cross-department request may already be expressible as an
   ordinary task with a dependency on another department's task, rather
   than needing an entirely new mechanism. Note `executiveIntelligence.js`'s
   `crossDepartmentRecommendations()` is currently observation-only
   (surfaces an insight, does not act on it) -- Phase 50 is where acting
   on it (e.g. auto-proposing a supporting campaign) would plug in, via
   the existing `ActionProposalEngine`, not a new mechanism.
3. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project (including all six Division panels
   and the new Executive Intelligence panel) has been verified at the
   endpoint/content level only -- no browser is available in this
   environment. This would also be the moment to fix the pre-existing
   "system-health" duplicate id, and to consider the mega-prompt's
   broader ~25-panel "command-center" dashboard vision (Executive
   Summary, Mission Control, Knowledge Graph Explorer, Universal Search,
   Capability Marketplace, etc.) -- most of the underlying data already
   exists per-panel; what's missing is a unified command-center layout
   pass, which needs visual iteration a headless environment can't do
   responsibly.
4. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call.
5. **Extend the autonomous capability builder's tool generation** to
   generate real implementations for well-known tool shapes.
6. **Additional external connectors** -- GitHub webhook receiver,
   Gmail/Calendar/Drive writes, a second real publishing connector
   beyond Discord, a real market-data feed, a real broker connector
   (still explicitly unbuilt/approval-gated by design).
7. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install. None of these block further
   *development*.
8. **The git-history rewrite question** and **knowledge-graph company
   isolation** (both Phase 10, still open) -- unchanged, still open
   business/architecture decisions for the operator.
