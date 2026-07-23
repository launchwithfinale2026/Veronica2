# VERONICA — Next Steps

Snapshot as of Phase 50 (Department Collaboration). 673/673 tests
passing. **Phase 41-46 closed the entire "make every Division
production-ready" arc**, **Phase 47 closed the recommendation feedback
loop**, **Phase 48 added the cross-department synthesis layer**,
**Phase 49 connected every Division's real entities into the knowledge
graph**, and **Phase 50 added a real, rule-based framework for
departments to automatically request work from each other** -- see
`docs/CHANGELOG.md` for the full history, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **Department Collaboration** (Phase 50):
  `core/collaboration/collaborationRules.js` -- a declarative rule
  framework (not hardcoded per-pair glue) detecting real
  cross-department collaboration opportunities from each Division's
  already-real state: `sales_requests_marketing` (open pipeline, no
  campaign), `marketing_requests_research` (campaign with an audience,
  no research), `operations_requests_department` (off-track KPI owned
  by another department). Every detected opportunity becomes a pending,
  approval-gated `ActionProposalEngine` proposal (a new
  `request_department_collaboration` external action) -- nothing
  delegates automatically without a human approving it; execution
  reuses `core/collaboration/engine.js`'s existing, already-real
  `delegate()`.

## Resolved earlier (Phase 41-49, unchanged from the last snapshot)

- **Organizational Knowledge Graph expansion** (Phase 49): leads,
  opportunities, campaigns, invoices/subscriptions (via their real
  client), portfolios, research missions, SOPs, KPIs, and meetings are
  now all connected into the graph. `GET /api/knowledge/query` exposes
  the graph's own `retrieve()`.
- **Executive Intelligence** (Phase 48):
  `core/executive/executiveIntelligence.js` -- real company health
  scoring, risk forecasting, cross-department recommendations,
  quarterly/annual planning, and an LLM-synthesized executive brief.
- **All six Divisions are production-ready** (Phase 41-46): Marketing,
  Sales, Finance, Research, Trading Research, Business Operations.
- **The recommendation feedback loop is closed** (Phase 47).
- **A real, recurring circular-require bug class was found and fixed
  four times** (Sales, proactively Marketing, Research's `missions.js`
  AND `engine.js` itself, designed around from the start in Trading and
  Business Operations): any module reachable from a package tool
  handler must not top-level-require anything in the
  `core/learning`/`core/intelligence`/`core/brain` chain.
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s.

## Recommended Phase 51+

1. **More collaboration rules.** Only 3 real rules ship today
   (`sales_requests_marketing`, `marketing_requests_research`,
   `operations_requests_department`) -- the mega-prompt's other named
   pairs ("Finance advises executive planning", "Research supports
   every department") are genuine candidates, and the framework
   (`core/collaboration/collaborationRules.js`'s `RULES` array) was
   specifically built so adding one is a single declarative object, not
   a structural change. Audit `executiveIntelligence.riskForecast()`'s
   real signals (low runway, off-track KPIs) as a starting point for a
   Finance-initiated rule.
2. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project has been verified at the endpoint/
   content level only -- no browser is available in this environment.
   This would also be the moment to fix the pre-existing
   "system-health" duplicate id, build a real "Knowledge Graph Explorer"
   panel over `/api/knowledge/query`, and consider the mega-prompt's
   broader ~25-panel "command-center" dashboard vision.
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
   NOT redesign the graph's name-based entity identity; still an open
   business/architecture decision for the operator.
