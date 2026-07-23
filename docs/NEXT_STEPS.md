# VERONICA — Next Steps

Snapshot as of Phase 43 part 3 (Finance Division production-readiness,
dashboard surfacing complete). 576/576 tests passing. See
`docs/CHANGELOG.md` for what each phase actually built, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 28 live agents
  (9 built-in + 19 package), 15 live departments (9 built-in + 6
  package).
- **The operator's 9-point integration checklist is closed.**
- **The Marketing Division is production-ready** (Phase 41 parts 1-5):
  Company Brain + Brand Profile, a real Campaign Engine with
  Planner/Calendar, a real Content Generator, an approval-gated
  Publishing Queue (honest about only Discord actually working), a real
  Analytics Engine, Department/Campaign Health in the morning briefing,
  a complete real agent hierarchy, and full dashboard surfacing.
- **The Sales Division is production-ready** (Phase 42 parts 1-3): a
  real Lead database with deterministic, explainable scoring, a real
  Opportunity/Pipeline engine (Contact Management, Follow-up
  Scheduling, a deterministic weighted-pipeline Forecast), a real
  Proposal Generator, real Win/Loss Analytics, Sales Health in the
  morning briefing, and full dashboard surfacing. Building it surfaced
  a real, order-dependent circular-require bug
  (`core/sales/analytics.js`'s top-level `require("../learning")`
  reaching back into `core/tools/index.js` via
  `core/brain/providers/claude.js`) -- fixed, and proactively fixed in
  `core/marketing/analytics.js` too, which had the identical latent
  landmine.
- **The Finance Division is production-ready** (Phase 43 parts 1-3):
  real Budgets/Invoices/Subscriptions built on top of the existing
  ledger (`companyManager.js`'s `recordFinance()`/`financialSummary()`,
  not duplicated), real Cash-flow Reporting/Runway/Forecasting/
  Financial KPIs (`core/finance/reports.js`), a real
  `finance.report.generate` tool, real agent prompts, Finance Health in
  the morning briefing, and full dashboard surfacing. No banking
  connection anywhere, per the operator's explicit instruction.
- **Three of six Phase 35 packages are now genuinely `"active"`** in
  `core/capabilities/health.js`: marketing, sales, and finance. The
  remaining three (business-operations, research-department,
  trading-research) are still "Installed – Awaiting Integration" --
  their tools are still generated skeletons, awaiting the same
  production-readiness pass.

## Recommended Phase 44+

1. **Apply the same production-readiness template to the remaining
   three Phase 35 packages** (research-department, trading-research,
   business-operations, per the standing roadmap order) -- Research
   next: real research missions, citation management, source ranking,
   competitor/industry/technology reports, reusing
   `core/research/engine.js` (the existing, already-real Phase 29
   research/citation engine -- `packages/research-department/manifest.json`'s
   own description already notes this distinction: the package's agents
   are meant to actually call the real engine, not reimplement one)
   wherever it genuinely fits rather than building a second research
   engine. Then Trading Research
   (portfolio model, watchlists, strategy storage, paper trading,
   backtesting, risk metrics -- no real trade execution, approval-gated
   and unimplemented until broker credentials exist). Then Business
   Operations (SOP library, workflow documentation, process analysis,
   KPI tracking, department scorecards). Each is its own genuine scope
   -- audit first, and watch for the same class of circular-require bug
   (`core/learning` required at a module's top level, reached from a
   tool handler) in any new analytics module.
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
   (Phase 34), and the Marketing (Phase 41), Sales (Phase 42), and
   Finance (Phase 43) Division panels are functionally real but never
   visually confirmed.
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
