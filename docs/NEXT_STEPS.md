# VERONICA — Next Steps

Snapshot as of Phase 44 part 3 (Research Division production-readiness,
dashboard surfacing complete). 587/587 tests passing. See
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
  built entirely on top of the existing ledger
  (`companyManager.js`'s `recordFinance()`/`financialSummary()`, not
  duplicated). No banking connection anywhere, per the operator's
  explicit instruction.
- **The Research Division is production-ready** (Phase 44 parts 1-3): a
  real Research Mission Engine (`core/research/missions.js`) reusing
  `core/research/engine.js`'s Phase 29 pipeline wholesale -- Source
  Ranking (deterministic, by real extraction confidence) and Executive
  Summaries (a real LLM synthesis) on top. "Competitor
  research"/"Industry reports"/"Technology reports"/"Market trend
  reports" are all the same mechanism with a different mission `type`
  label, not four separate report generators. The SAME circular-require
  bug class surfaced a third time here (`core/research/missions.js` and
  `core/research/engine.js` itself both top-level-required
  `core/intelligence`) -- fixed in both.
- **Four of six Phase 35 packages are now genuinely `"active"`** in
  `core/capabilities/health.js`: marketing, sales, finance, and
  research-department. The remaining two (business-operations,
  trading-research) are still "Installed – Awaiting Integration" --
  their tools are still generated skeletons, awaiting the same
  production-readiness pass.
- **Minor, unrelated finding, not yet fixed**: `dashboard/frontend/index.html`
  has a pre-existing (predates this session) duplicate
  `id="system-health"` on two different `<div>`s -- harmless today (both
  happen to be populated identically), but `document.getElementById()`
  only ever returns the first match, so if the two were ever meant to
  show different content, one silently wouldn't update. Worth a
  dedicated fix, out of scope for whichever phase happens to notice it
  next.

## Recommended Phase 45+

1. **Apply the same production-readiness template to the remaining two
   Phase 35 packages** (trading-research, business-operations, per the
   standing roadmap order) -- Trading Research next: portfolio model,
   watchlists, strategy storage, paper trading engine, backtesting, risk
   metrics, position sizing, journal, performance analytics -- no real
   trade execution, approval-gated and unimplemented until broker
   credentials exist. Then Business Operations (SOP library, workflow
   documentation, process analysis, KPI tracking, department
   scorecards, blocker management, meeting summaries, weekly operating
   reviews). Each is its own genuine scope -- audit first, and watch for
   the same class of circular-require bug (`core/learning` or
   `core/intelligence` required at a module's top level, reached from a
   tool handler) in any new analytics/reasoning module -- it has now
   surfaced three times (Sales, proactively in Marketing, Research) and
   will keep recurring in any new domain module that both (a) gets
   `require()`'d from a package tool handler and (b) itself top-level-
   requires anything in the `core/learning`/`core/intelligence`/
   `core/brain` chain.
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
   Finance (Phase 43), and Research (Phase 44) Division panels are
   functionally real but never visually confirmed. This would also be
   the moment to fix the pre-existing "system-health" duplicate id
   noted above.
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
