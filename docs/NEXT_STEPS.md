# VERONICA — Next Steps

Snapshot as of Phase 41 part 2 (9-point integration checklist closed).
500/500 tests passing. See `docs/CHANGELOG.md` for what each phase
actually built, and `docs/NEXT_HUMAN_ACTIONS.md`/
`docs/EXTERNAL_DEPENDENCIES.md` for what still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 25 live agents
  (9 built-in + 16 package), 15 live departments (9 built-in + 6
  package), all real -- not skeleton/pending anymore.
- **The operator's 9-point integration checklist is closed.** Capability
  Registry/Executive Core activation/Organization Manager (Organization
  Overview)/Agent Registry/Tool Registry/Organization Overview
  visibility/Executive Dashboard surfacing were all audited directly
  against the live running system (not assumed) and confirmed already
  correctly wired by Phase 25/32/33 -- they only *looked* broken because
  of the four bugs below. The two items that were genuinely missing are
  now built: "Installed – Awaiting Integration" status
  (`core/capabilities/health.js` + a new dashboard "Capability
  Operations" panel) and full Executive Planning participation (Bug 4).
- Getting the six packages genuinely active/integrated (not a temp test
  package) surfaced and fixed four real bugs no prior test caught:
  a relative-`packageDir` `require()` bug in `installer.js`,
  `manifest.js`'s `normalize()` silently dropping the
  `department`/`automations` fields Phase 25 added,
  `core/context/engine.js` and `core/executive/planner.js` each having
  their own second, package-unaware department/agent loader (so every
  `think()` call's context AND every `plan()`'s department
  assignment/owner resolution silently didn't know the six real
  divisions existed). See Phase 41 parts 1 and 2 in `docs/CHANGELOG.md`
  for the full detail on each.
- The prior snapshot's item 3 ("approve or reject the six real pending
  production-package proposals") is done for the packages; the six
  architecture-debt/upgrade items in `core/system/selfImprovement.js`
  are still open, still the operator's call.

## In progress -- Marketing Division production-readiness

The operator's standing instruction, after the integration checklist,
is full Marketing Division production-readiness: Brand Profile, Brand
Guidelines/Voice Rules, Campaign Engine/Planner/Calendar, Content
Generator, Approval Queue, Publishing Queue, Analytics Engine, Learning
Engine; a permanent per-company "Company Brain"; Executive Daily
Operations (morning briefing / evening review); an evolved agent
collaboration hierarchy (Executive Core -> Marketing Director ->
Campaign Manager -> Content Strategist -> Brand Manager -> Publishing
Manager -> Analytics Manager); further Capability Marketplace/Dashboard
improvements. None of that is built yet -- the integration checklist
above was the necessary prerequisite (the marketing package has to be
genuinely, correctly active and wired through every consumer before a
production-readiness pass on top of it means anything), and is now done
and green.

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
3. **The six architecture-debt/upgrade items** flagged in
   `core/system/selfImprovement.js` -- genuinely the operator's call,
   not something to decide autonomously.
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
