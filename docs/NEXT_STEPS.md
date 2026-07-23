# VERONICA — Next Steps

Snapshot as of Phase 46 part 3 (Business Operations Division production-
readiness, dashboard surfacing complete) -- **this closes the entire
Phase 41-46 arc: all six Phase 35 production packages are now
genuinely production-ready divisions**, not just installed skeletons.
641/641 tests passing. See `docs/CHANGELOG.md` for what each phase
actually built, and `docs/NEXT_HUMAN_ACTIONS.md`/
`docs/EXTERNAL_DEPENDENCIES.md` for what still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 28 live agents,
  15 live departments.
- **The operator's 9-point integration checklist is closed.**
- **All six Divisions are production-ready**: Marketing (Phase 41),
  Sales (Phase 42), Finance (Phase 43), Research (Phase 44), Trading
  Research (Phase 45), Business Operations (Phase 46) -- each with real
  domain engines, real tools (no more generated skeletons), real agent
  prompts, and full dashboard surfacing. `core/capabilities/health.js`
  reports all six as genuinely `"active"`, confirmed by an exhaustive
  test.
- **A real, recurring circular-require bug class was found and fixed
  four times** (Sales, proactively Marketing, Research -- both
  `missions.js` and `engine.js` itself -- and designed around from the
  start in Trading and Business Operations): any module reachable from
  a package tool handler must not top-level-require anything in the
  `core/learning`/`core/intelligence`/`core/brain` chain, since that
  chain reaches `core/brain/providers/claude.js`, which requires
  `core/tools/index.js` at its own top level. Watch for this in any
  future domain module.
- **Reused, never duplicated, existing systems throughout**: the ledger
  (`companyManager.js`), the research/citation engine
  (`core/research/engine.js`, Phase 29), Blocker Management
  (`core/executive/blockerDetection.js`, Phase 11), Weekly Operating
  Reviews (`core/executive/weeklyReport.js`, Phase 11), Organization
  Overview's department health, and the Approval Pipeline
  (`ActionProposalEngine`) for the one real external action
  (`publish_content`) any division needed.
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s -- harmless today, but
  `document.getElementById()` only ever returns the first match.

## Recommended Phase 47+

With every Division production-ready, the natural next objectives shift
from "make one department real" to organization-wide capabilities that
span all of them:

1. **Organizational Learning** -- departments should record real
   successes/failures/lessons (several already do: campaigns'/
   opportunities' `lessonsLearned`, `core/system/selfImprovement.js`)
   and, genuinely new, feed `core/learning/adaptiveInsights.js`'s real
   acceptance-rate/repeat data back into
   `core/executive/executiveRecommendations.js`'s actual generation
   logic -- weighting or suppressing a kind of recommendation that's
   been rejected repeatedly, surfacing a highly-repeated one more
   prominently. Every improvement must cite real stored evidence, never
   invented learning.
2. **Executive Intelligence expansion** -- quarterly/annual planning,
   goal forecasting, opportunity/risk forecasting, company health
   scoring, cross-department recommendations, executive brief
   generation. Audit `core/executive/executiveRecommendations.js`,
   `core/executive/priorityRanking.js`, and the six new division
   analytics modules first -- a lot of the real underlying data (KPIs,
   pipeline forecasts, financial runway, research findings) already
   exists per-division; this phase's job is cross-department synthesis
   of what's already real, not new per-division tracking.
3. **Organizational Knowledge Graph expansion** -- connect campaigns,
   opportunities, portfolios, SOPs, KPIs, and meetings into
   `core/knowledge`'s existing graph (companies/departments/agents are
   already there). Audit which of the six new divisions' entities
   already create knowledge graph entities (companies, campaigns, and a
   few others do; leads/opportunities/portfolios/SOPs/KPIs/meetings
   currently do not) before adding edges.
4. **Department Collaboration** -- a real framework for one department
   requesting work from another (e.g. Marketing requesting Research),
   rather than hardcoded cross-references. Audit the existing Mission
   Engine and task-dependency graph (`core/executive/decomposer.js`)
   first -- a cross-department request may already be expressible as an
   ordinary task with a dependency on another department's task, rather
   than needing an entirely new mechanism.
5. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project (including all six new Division
   panels) has been verified at the endpoint/content level only -- no
   browser is available in this environment. This would also be the
   moment to fix the pre-existing "system-health" duplicate id.
6. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call.
7. **Extend the autonomous capability builder's tool generation** to
   generate real implementations for well-known tool shapes.
8. **Additional external connectors** -- GitHub webhook receiver,
   Gmail/Calendar/Drive writes, a second real publishing connector
   beyond Discord, a real market-data feed, a real broker connector
   (still explicitly unbuilt/approval-gated by design).
9. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install. None of these block further
   *development*.
10. **The git-history rewrite question** and **knowledge-graph company
    isolation** (both Phase 10, still open) -- unchanged, still open
    business/architecture decisions for the operator.
