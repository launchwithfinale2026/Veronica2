# VERONICA — Next Steps

Snapshot as of Phase 41 part 1 (Real Package Activation). 492/492 tests
passing. See `docs/CHANGELOG.md` for what each phase actually built,
and `docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for
what still needs a human.

## Resolved since the last snapshot

- **The six pending production-package proposals (Phase 35) were
  approved and are now genuinely, permanently active**: 25 live agents
  (9 built-in + 16 package), 15 live departments (9 built-in + 6
  package), all real -- not skeleton/pending anymore.
- Approving them for real (not a temp test package) surfaced and fixed
  three genuine bugs no prior test caught: a relative-`packageDir`
  `require()` bug in `installer.js`, `manifest.js`'s `normalize()`
  silently dropping the `department`/`automations` fields Phase 25
  added (so all six packages were "active" but contributed zero
  departments until fixed), and `core/context/engine.js` having its own
  second, package-unaware department loader (so every `think()` call's
  context silently omitted the six real divisions). See Phase 41 part 1
  in `docs/CHANGELOG.md` for the full detail on each.
- The prior snapshot's item 3 ("approve or reject the six real pending
  production-package proposals") is done for the packages; the six
  architecture-debt/upgrade items in `core/system/selfImprovement.js`
  are still open, still the operator's call.

## In progress -- Phase 41 part 2 (integration + Marketing Division)

The operator's standing instruction is to fully integrate the six
approved packages as first-class organizational divisions (Capability
Registry, Executive Core activation, Organization Manager, Agent/Tool
Registry, Organization Overview, Executive Dashboard, "Installed --
Awaiting Integration" status for any capability lacking a real
connector, and verified participation in Mission Engine/Executive
Planning/Approval Pipeline/Memory System/Capability Manager), then move
on to full Marketing Division production-readiness (Brand Profile,
Campaign Engine, Company Brain, Executive Daily Operations, evolved
agent collaboration hierarchy, Capability Marketplace/Dashboard
improvements). None of that is built yet -- part 1 above was the
necessary prerequisite (the packages have to be genuinely, correctly
active before they can be verified against that checklist), and is now
done and green.

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
