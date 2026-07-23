# VERONICA — Next Steps

Snapshot as of Phase 45 part 3 (Trading Research Division production-
readiness, dashboard surfacing complete). 616/616 tests passing. See
`docs/CHANGELOG.md` for what each phase actually built, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 28 live agents
  (9 built-in + 19 package), 15 live departments (9 built-in + 6
  package).
- **The operator's 9-point integration checklist is closed.**
- **The Marketing Division is production-ready** (Phase 41 parts 1-5).
- **The Sales Division is production-ready** (Phase 42 parts 1-3).
  Building it surfaced a real, order-dependent circular-require bug
  (an analytics module's top-level `require("../learning")` reaching
  back into `core/tools/index.js` via `core/brain/providers/claude.js`)
  -- fixed there and proactively in Marketing's analytics module too.
- **The Finance Division is production-ready** (Phase 43 parts 1-3):
  built entirely on top of the existing ledger, not duplicated. No
  banking connection anywhere, per the operator's explicit instruction.
- **The Research Division is production-ready** (Phase 44 parts 1-3): a
  real Research Mission Engine reusing `core/research/engine.js`'s
  Phase 29 pipeline wholesale. The same circular-require bug class
  surfaced a third time here (`core/research/missions.js` AND
  `core/research/engine.js` itself both top-level-required
  `core/intelligence`) -- fixed in both.
- **The Trading Research Division is production-ready** (Phase 45 parts
  1-3): real Portfolio/Watchlists/Position Sizing, Strategy Storage, a
  Paper Trading Engine + Journal, a real deterministic Backtesting
  engine (moving-average crossover, hand-verified), real Risk/
  Performance Analytics (FIFO realized P&L). Research/analysis only
  throughout -- no real trade execution anywhere in this codebase.
  `core/trading/analytics.js` was written with `core/learning` lazily
  required from the start, having now seen the circular-require bug
  class three times already.
- **Five of six Phase 35 packages are now genuinely `"active"`** in
  `core/capabilities/health.js`: marketing, sales, finance,
  research-department, and trading-research. Only business-operations
  remains "Installed – Awaiting Integration".
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s -- harmless today, but
  `document.getElementById()` only ever returns the first match. Worth a
  dedicated fix, out of scope for whichever phase happens to notice it
  next.

## Recommended Phase 46+

1. **Apply the same production-readiness template to the last Phase 35
   package: business-operations** -- SOP library, workflow
   documentation, process analysis, KPI tracking, department
   scorecards, blocker management, meeting summaries, weekly operating
   reviews. This is the sixth and final package; once it's done, all
   six Phase 35 packages will be genuinely `"active"`, not just
   installed. Audit first (this codebase already has real blocker
   detection (`core/executive/blockerDetection.js`) and a real weekly
   operating report (`core/executive/weeklyReport.js`) -- reuse them
   rather than building parallel ones), and watch for the same class of
   circular-require bug (`core/learning`/`core/intelligence` required
   at a module's top level, reached from a tool handler) in any new
   analytics/reasoning module -- it has now surfaced three times
   (Sales, proactively Marketing, Research) and will keep recurring in
   any new domain module reachable from a package tool handler.
2. **Close the recommendation feedback loop.** Phase 38's
   `adaptiveInsights.js` computes real acceptance rates and repeated-
   recommendation counts but doesn't feed them back into
   `core/executive/executiveRecommendations.js`'s own generation logic.
   The natural next step: weight or suppress recommendations of a kind
   that's been rejected repeatedly, and surface highly-repeated ones
   more prominently -- both explainable off data that already exists.
3. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project has been verified at the
   endpoint/content level only -- no browser is available in this
   environment. The command palette, search, Executive Summary panel
   (Phase 34), and the Marketing (Phase 41), Sales (Phase 42),
   Finance (Phase 43), Research (Phase 44), and Trading Research
   (Phase 45) Division panels are functionally real but never visually
   confirmed. This would also be the moment to fix the pre-existing
   "system-health" duplicate id noted above.
4. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call,
   not something to decide autonomously.
5. **Extend the autonomous capability builder's tool generation.**
   Right now every NEWLY generated tool is a throwing skeleton; a
   natural next increment is generating a REAL implementation for
   simple, well-known tool shapes (e.g., a tool that just calls an
   existing connector method) rather than always a placeholder --
   carefully, without ever fabricating capability that doesn't work.
6. **GitHub webhook receiver** (push-based instead of polling) -- needs
   a publicly reachable HTTPS endpoint, which `DASHBOARD_HOST`'s
   `127.0.0.1` default doesn't provide.
7. **Gmail sending / Calendar event creation / Drive upload** --
   deliberately unbuilt (Phase 19 was explicitly read-only for Google);
   each would need its own new `ActionProposalEngine` external action.
8. **A real publishing connector beyond Discord** -- Twitter/X, email,
   Instagram, etc. Each needs its own new `ActionProposalEngine`
   external action and a real credential, same pattern
   `publish_content`'s Discord case already establishes.
9. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install (`scripts/install-launch-agent.sh`).
   None of these block further *development* -- every connector works
   correctly whether or not its credential is set.
10. **The git-history rewrite question** and **knowledge-graph company
   isolation** (both Phase 10, still open) -- unchanged across every
   phase since, still open business/architecture decisions for the
   operator.
