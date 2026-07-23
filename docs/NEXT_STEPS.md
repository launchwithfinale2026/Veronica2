# VERONICA — Next Steps

Snapshot as of Phase 49 (Organizational Knowledge Graph expansion).
666/666 tests passing. **Phase 41-46 closed the entire "make every
Division production-ready" arc**, **Phase 47 closed the recommendation
feedback loop**, **Phase 48 added the cross-department synthesis
layer**, and **Phase 49 connected every Division's real entities into
the existing knowledge graph** -- see `docs/CHANGELOG.md` for the full
history, and `docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md`
for what still needs a human.

## Resolved since the last snapshot

- **Organizational Knowledge Graph expansion** (Phase 49): leads,
  opportunities, and campaigns now gain a real `belongsTo` relationship
  to their owning company (their entities already existed, just
  unconnected). Invoices/subscriptions connect their real CLIENT (not
  the record itself -- a name-collision hazard, see
  `docs/Architecture.md`'s Phase 49 section) to the company via
  `billedBy`. Portfolios and research missions connect to their company
  only when actually company-scoped. SOPs/KPIs connect to their real
  department id. Meetings connect to each real attendee. A new
  `GET /api/knowledge/query?q=...` route exposes the graph's own
  pre-existing `retrieve()`. The graph's name-based entity identity
  scheme itself was deliberately NOT redesigned -- see "still open"
  below.

## Resolved earlier (Phase 41-48, unchanged from the last snapshot)

- **Executive Intelligence** (Phase 48):
  `core/executive/executiveIntelligence.js` -- real company health
  scoring, risk forecasting, cross-department recommendations,
  quarterly/annual planning, and an LLM-synthesized executive brief.
  Wired into the daily briefing (`strategicHealth()`) and the dashboard.
- **All six Divisions are production-ready** (Phase 41-46): Marketing,
  Sales, Finance, Research, Trading Research, Business Operations --
  each with real domain engines, real tools, real agent prompts, and
  full dashboard surfacing. `core/capabilities/health.js` reports all
  six as genuinely `"active"`.
- **The recommendation feedback loop is closed** (Phase 47).
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

## Recommended Phase 50+

1. **Department Collaboration** -- a real framework for one department
   requesting work from another (e.g. Marketing requesting Research),
   rather than hardcoded cross-references. Audit the existing Mission
   Engine and task-dependency graph (`core/executive/decomposer.js`)
   first -- a cross-department request may already be expressible as an
   ordinary task with a dependency on another department's task, rather
   than needing an entirely new mechanism. Note
   `executiveIntelligence.js`'s `crossDepartmentRecommendations()` is
   currently observation-only (surfaces an insight, does not act on it)
   -- this is where acting on it (e.g. auto-proposing a supporting
   campaign) would plug in, via the existing `ActionProposalEngine`,
   not a new mechanism. The knowledge graph's new `belongsTo` edges
   (Phase 49) mean a company's full real footprint across every
   Division is now walkable in one place -- useful for deciding which
   department to route a request to.
2. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project (every Division panel, the
   Executive Intelligence panel) has been verified at the endpoint/
   content level only -- no browser is available in this environment.
   This would also be the moment to fix the pre-existing
   "system-health" duplicate id, build a real "Knowledge Graph Explorer"
   panel over the new `/api/knowledge/query` endpoint, and consider the
   mega-prompt's broader ~25-panel "command-center" dashboard vision --
   most of the underlying data already exists per-panel; what's missing
   is a unified command-center layout pass, which needs visual
   iteration a headless environment can't do responsibly.
3. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call.
4. **Extend the autonomous capability builder's tool generation** to
   generate real implementations for well-known tool shapes.
5. **Additional external connectors** -- GitHub webhook receiver,
   Gmail/Calendar/Drive writes, a second real publishing connector
   beyond Discord, a real market-data feed, a real broker connector
   (still explicitly unbuilt/approval-gated by design).
6. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install. None of these block further
   *development*.
7. **The git-history rewrite question** and **knowledge-graph company
   isolation** (both Phase 10, still open) -- Phase 49 deliberately did
   NOT redesign the graph's name-based entity identity (two companies
   each naming an opportunity identically would still collide into one
   node); still an open business/architecture decision for the operator.
