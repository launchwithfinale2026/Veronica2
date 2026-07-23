# VERONICA — Next Steps

Snapshot as of Phase 47 (Organizational Learning -- recommendation
feedback loop closed). 644/644 tests passing. **Phase 41-46 already
closed the entire "make every Division production-ready" arc** -- see
`docs/CHANGELOG.md` for the full history -- and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **All six Divisions are production-ready** (Phase 41-46): Marketing,
  Sales, Finance, Research, Trading Research, Business Operations --
  each with real domain engines, real tools, real agent prompts, and
  full dashboard surfacing. `core/capabilities/health.js` reports all
  six as genuinely `"active"`.
- **The recommendation feedback loop is closed** (Phase 47):
  `core/executive/executiveRecommendations.js`'s `generate()` now
  annotates every recommendation with its real historical acceptance
  rate and real recurrence count (`core/learning/adaptiveInsights.js`'s
  own data), resurfacing genuinely recurring issues more prominently --
  never silently hiding a low-acceptance one.
- **A real, recurring circular-require bug class was found and fixed
  four times** (Sales, proactively Marketing, Research's `missions.js`
  AND `engine.js` itself, designed around from the start in Trading and
  Business Operations): any module reachable from a package tool
  handler must not top-level-require anything in the
  `core/learning`/`core/intelligence`/`core/brain` chain. Watch for
  this in any future domain module.
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s.

## Recommended Phase 48+

1. **Executive Intelligence expansion** -- quarterly/annual planning,
   goal forecasting, opportunity/risk forecasting, company health
   scoring, cross-department recommendations, executive brief
   generation. Audit `core/executive/executiveRecommendations.js`,
   `core/executive/priorityRanking.js`, and the six new division
   analytics modules first -- a lot of the real underlying data (KPIs,
   pipeline forecasts, financial runway, research findings) already
   exists per-division; this phase's job is cross-department synthesis
   of what's already real, not new per-division tracking.
2. **Organizational Knowledge Graph expansion** -- connect campaigns,
   opportunities, portfolios, SOPs, KPIs, and meetings into
   `core/knowledge`'s existing graph (companies/departments/agents are
   already there). Audit which of the six new divisions' entities
   already create knowledge graph entities (companies, campaigns, and a
   few others do; leads/opportunities/portfolios/SOPs/KPIs/meetings
   currently do not) before adding edges.
3. **Department Collaboration** -- a real framework for one department
   requesting work from another (e.g. Marketing requesting Research),
   rather than hardcoded cross-references. Audit the existing Mission
   Engine and task-dependency graph (`core/executive/decomposer.js`)
   first -- a cross-department request may already be expressible as an
   ordinary task with a dependency on another department's task, rather
   than needing an entirely new mechanism.
4. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project (including all six new Division
   panels) has been verified at the endpoint/content level only -- no
   browser is available in this environment. This would also be the
   moment to fix the pre-existing "system-health" duplicate id.
5. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call.
6. **Extend the autonomous capability builder's tool generation** to
   generate real implementations for well-known tool shapes.
7. **Additional external connectors** -- GitHub webhook receiver,
   Gmail/Calendar/Drive writes, a second real publishing connector
   beyond Discord, a real market-data feed, a real broker connector
   (still explicitly unbuilt/approval-gated by design).
8. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install. None of these block further
   *development*.
9. **The git-history rewrite question** and **knowledge-graph company
    isolation** (both Phase 10, still open) -- unchanged, still open
    business/architecture decisions for the operator.
