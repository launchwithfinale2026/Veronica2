# VERONICA — Next Steps

Snapshot as of Phase 41 part 5 (Marketing Division production-readiness,
dashboard surfacing complete). 526/526 tests passing. See
`docs/CHANGELOG.md` for what each phase actually built, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 28 live agents
  (9 built-in + 19 package -- 16 from the six Phase 35 packages, +3
  from Marketing's completed hierarchy), 15 live departments (9 built-in
  + 6 package).
- **The operator's 9-point integration checklist is closed** (Capability
  Registry/Executive Core/Organization Overview/Agent+Tool Registry/
  Dashboard were all already correctly wired by Phase 25/32/33 -- they
  only looked broken because of four real bugs, all fixed; "Installed –
  Awaiting Integration" status and full Executive Planning participation
  were the two genuinely missing pieces, both now built).
- **The Marketing Division is production-ready** (Phase 41 parts 1-5):
  a real Company Brain + Brand Profile (`companyManager.js`), a real
  Campaign Engine with Planner/Calendar (`core/marketing/campaigns.js`),
  a real Content Generator using the actual Claude connection
  (`core/marketing/contentGenerator.js`), a real, approval-gated
  Publishing Queue (`actionProposal.js`'s `publish_content`, honest
  about only Discord actually working today), a real Analytics Engine
  (`core/marketing/analytics.js`), Department/Campaign Health in the
  morning briefing, a complete real agent hierarchy (Executive Core ->
  MarketingDirector -> CampaignManager -> ContentStrategist ->
  BrandManager -> PublishingManager -> MarketingAnalyticsAgent, every
  prompt real, no more skeletons), and full dashboard surfacing
  (backend routes + a new frontend panel). The marketing package is now
  the first of the six Phase 35 packages to report `"active"` in
  `core/capabilities/health.js`, not "Installed – Awaiting Integration".
- The remaining five Phase 35 packages (business-operations, sales,
  research-department, finance, trading-research) are still genuinely
  "Installed – Awaiting Integration" -- their tools are still generated
  skeletons. Marketing was the operator's explicit next objective; the
  same production-readiness pass (real tool implementations, real agent
  prompts) is the natural template for each of the other five, not yet
  started.

## Recommended Phase 42+

1. **Apply the Marketing Division's production-readiness template to
   the other five Phase 35 packages** (business-operations, sales,
   research-department, finance, trading-research) -- same pattern:
   real tool implementations replacing generated skeletons, real agent
   system prompts, a domain engine analogous to
   `core/marketing/campaigns.js` where the domain calls for one (e.g. a
   real deal/pipeline model for sales, a real ledger/report engine for
   finance). Each is its own genuine scope, not a single mechanical
   pass -- pick one at a time.
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
   (Phase 34), and now the Marketing Division panel (Phase 41) are
   functionally real but never visually confirmed.
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
