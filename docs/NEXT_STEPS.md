# VERONICA — Next Steps

Snapshot as of Phase 42 part 3 (Sales Division production-readiness,
dashboard surfacing complete). 552/552 tests passing. See
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
  real Lead database with deterministic, explainable scoring
  (`core/sales/leads.js`), a real Opportunity/Pipeline engine with
  Contact Management, Follow-up Scheduling, and a deterministic
  weighted-pipeline Forecast (`core/sales/opportunities.js`), a real
  Proposal Generator (`core/sales/proposalGenerator.js`), real Win/Loss
  Analytics (`core/sales/analytics.js`), Sales Health in the morning
  briefing, and full dashboard surfacing. Building it surfaced a real,
  order-dependent circular-require bug (`core/sales/analytics.js`'s
  top-level `require("../learning")` reaching back into
  `core/tools/index.js` via `core/brain/providers/claude.js`) --
  fixed, and proactively fixed in `core/marketing/analytics.js` too,
  which had the identical latent landmine.
- **Two of six Phase 35 packages are now genuinely `"active"`** in
  `core/capabilities/health.js`: marketing and sales. The remaining four
  (business-operations, research-department, finance, trading-research)
  are still "Installed – Awaiting Integration" -- their tools are still
  generated skeletons, awaiting the same production-readiness pass.

## Recommended Phase 43+

1. **Apply the same production-readiness template to the remaining four
   Phase 35 packages** (business-operations, research-department,
   finance, trading-research) -- the operator's explicit next objective
   is Finance (a real ledger/revenue/expense/budget/forecast/cash-flow/
   runway engine), then Research, then Trading Research, then Business
   Operations, per the standing Phase 42+ roadmap. Each is its own
   genuine scope -- pick one at a time, audit first, reuse the Campaign
   Engine/Lead+Opportunity pattern wherever the domain actually matches
   it, and watch for the same class of circular-require bug
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
   (Phase 34), and the Marketing (Phase 41) and Sales (Phase 42) Division
   panels are functionally real but never visually confirmed.
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
