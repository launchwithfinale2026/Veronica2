# VERONICA — Next Steps

Snapshot as of the end of Phases 33-40 (Core Stabilization, Production
Dashboard, Production Capability Packages, Connector Completion,
Executive Assistant, Learning Engine, Autonomous Capability Builder,
Personal Operating System). 491/491 tests passing. See
`docs/CHANGELOG.md` for what each phase actually built, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human (credentials, OAuth consent, the LaunchAgent
install, and now six real pending capability-install approvals from
Phase 35).

## Resolved since the last snapshot

The single highest-value item from the prior `NEXT_STEPS.md` --
"wire installed capability packages into the live agent/tool/department
loaders" -- was fully closed in Phase 25, then hardened in Phase 33
(loader resilience, package-department logging, dependency version
constraints). "VERONICA, create a trading division" is now a genuinely
complete loop end to end (Phase 39's autonomous builder), gated on real
human approval at the one point that matters.

## Recommended Phase 41+

1. **Close the recommendation feedback loop.** Phase 38's
   `adaptiveInsights.js` computes real acceptance rates and repeated-
   recommendation counts but doesn't feed them back into
   `core/executive/executiveRecommendations.js`'s own generation logic.
   The natural next step: weight or suppress recommendations of a kind
   that's been rejected repeatedly, and surface highly-repeated ones
   more prominently -- both explainable off data that already exists.
2. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project has been verified at the
   endpoint/content level only -- no browser is available in this
   environment. The command palette, search, and Executive Summary
   panel (Phase 34) are functionally real but never visually confirmed.
3. **Approve or reject the six real pending production-package
   proposals** (Phase 35) and the six architecture-debt/upgrade items
   flagged in `core/system/selfImprovement.js` -- genuinely the
   operator's call, not something to decide autonomously.
4. **Extend the autonomous capability builder's tool generation.**
   Right now every generated tool is a throwing skeleton; a natural
   Phase 41+ increment is generating a REAL implementation for simple,
   well-known tool shapes (e.g., a tool that just calls an existing
   connector method) rather than always a placeholder -- carefully,
   without ever fabricating capability that doesn't work.
5. **GitHub webhook receiver** (push-based instead of polling) -- needs
   a publicly reachable HTTPS endpoint, which `DASHBOARD_HOST`'s
   `127.0.0.1` default doesn't provide.
6. **Gmail sending / Calendar event creation / Drive upload** --
   deliberately unbuilt (Phase 19 was explicitly read-only for Google);
   each would need its own new `ActionProposalEngine` external action.
7. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), Google's two-step configure-then-authorize
   flow, and the LaunchAgent install (`scripts/install-launch-agent.sh`).
   None of these block further *development* -- every connector works
   correctly whether or not its credential is set.
8. **The git-history rewrite question** and **knowledge-graph company
   isolation** (both Phase 10, still open) -- unchanged across every
   phase since, still open business/architecture decisions for the
   operator.
