# VERONICA — Next Steps

Snapshot as of the end of Phases 20-24 (Capability Expansion, Mac
Resident System, Command Center Dashboard extension, Integration
Framework, Self-Management). 403/403 tests passing. See
`docs/CHANGELOG.md` for what each phase actually built, and
`docs/NEXT_HUMAN_ACTIONS.md`/`docs/EXTERNAL_DEPENDENCIES.md` for what
still needs a human (credentials, OAuth consent, the LaunchAgent
install).

## The single highest-value next increment

**Wire installed capability packages into the live agent/tool/
department loaders.** Right now `core/capabilities/installer.js`
genuinely validates, registers, health-checks, activates, upgrades, and
rolls back a package — but `core/agents/loader.js`, `core/tools/loader.js`,
and `core/departments/loader.js` still only read the static
`registry/*.json` files, so an installed package's agents/tools don't
become live `Agent`/`Tool` instances a department can actually use.
Concretely:

1. Extend `loadAgents()` to also read `core/capabilities/registry.js`'s
   installed (non-core, active) capabilities, and for each one whose
   manifest declares `agents`, load the prompt file the same way
   `core/agents/prompts/*.js` already does (see
   `core/capabilities/validator.js`'s `agentPromptPath()` for the exact
   path convention a package already follows).
2. Do the same for `loadTools()` (package `tools/*.js` handler modules)
   and, if a package ever declares a full department rather than just
   agents, `loadDepartments()`.
3. This is additive and backward compatible by construction — zero
   packages installed means identical behavior to today; the risk is
   entirely in getting the merge logic right, not in touching what
   already works.
4. Once this exists, "VERONICA, create a trading division" becomes a
   genuinely complete loop: `planner.analyzeRequest()` names the gap,
   an operator (or a future agent) builds a package for it, `installer.install()`
   validates/activates it, and the NEXT boot has real, live agents for
   it — not just a registry entry.

## Other real gaps, roughly in priority order

1. **A dedicated visual/browser-tested dashboard pass.** Every dashboard
   change across this entire project (Phase 9 through 22) has been
   verified at the endpoint/content level only — no browser is available
   in this environment. If the Phase 22 vision (a genuine "CEO cockpit"
   redesign, not just more panels bolted onto the existing layout) still
   matters, it needs a pass somewhere a headless or real browser can
   confirm it actually renders and behaves as intended.
2. **GitHub webhook receiver** (push-based instead of polling) — needs a
   publicly reachable HTTPS endpoint, which `DASHBOARD_HOST`'s
   `127.0.0.1` default doesn't provide. Polling (`github-poll`, every 15
   min) already works without this.
3. **Extend `post_discord_message` to the real bot's channels** — it
   currently only posts through the pre-existing webhook connector, not
   `discordBot.js`'s `sendMessage(channelId, content)`.
4. **Gmail sending / Calendar event creation / Drive upload** — all
   deliberately unbuilt (Phase 19 was explicitly read-only for Google);
   each would need its own new `ActionProposalEngine` external action,
   same pattern as `create_github_issue`.
5. **The remaining human actions** (see `docs/NEXT_HUMAN_ACTIONS.md`):
   `API_TOKEN`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`
   (+`DISCORD_CLIENT_ID`), and Google's two-step configure-then-authorize
   flow. None of these block further *development* — every connector
   works correctly whether or not its credential is set — but they do
   block actually *using* what's been built against real accounts.
6. **The git-history rewrite question** (Phase 10, still open) and
   **knowledge-graph company isolation** (also Phase 10) — both
   unchanged by Phases 19-24, still open business/architecture decisions
   for the operator.
