# VERONICA — Next Steps

Snapshot as of **Project A + Project M (modular, package-injected
dashboard panels)**. 751/751 tests passing. Objective: "make VERONICA
operational for daily use." Projects A-N, pursued autonomously.

- **Project A** — Mission Control Dashboard: modular panel injection
  done; Memory Timeline/Analytics, Conversation History, Notification
  Center still to build (data-driven, not blocked by lack of browser)
- **Project B** — Resident Personal Operating System: substantially
  built (Phase 21) + startup diagnostics wired in; `verify-launch-agent.sh`
  still missing
- **Project C** — Device Ecosystem: not started this pass
- **Project D** — Connector Hardening: part 1 done (crash-risk fix,
  real status() for filesystem connectors); retry/reconnect extension
  to more connectors still open
- **Project E** — Memory System (Timeline/Inspector/Analytics): real
  underlying data exists (importance scoring, lifecycle stages); no
  by-source breakdown, heatmap, or evolution viewer yet
- **Project F** — Self Diagnostics: unified health score done
- **Project G** — Autonomous Maintenance: safe log archival + report-only
  consistency checks done
- **Project H** — Knowledge Graph Explorer: done (type filter, N-hop
  expansion, path-finding, dedicated panel)
- **Project I** — Operational Readiness (code audit): not started
- **Project J** — Daily Executive OS: morning briefing/evening review
  already cover most asks (see audit below); "upcoming deadlines" and
  "performance metrics" fields are the real remaining gaps
- **Project K** — Personal AI Operating System: substantially covered
  by existing Executive/Personal Intelligence layers; more a "start
  using it" question than a "build it" one
- **Project L** — Social Media Operating System: multi-brand support
  already real (brandProfile is per-company); new publishing connectors
  explicitly require real external accounts -- genuinely blocked
- **Project M** — Capability Evolution: dashboard-module generation
  done (see Project A); the rest of the lifecycle already existed
  (Phase 39/59)
- **Project N** — First-Time User Experience: Operational Readiness
  checklist done

## Resolved since the last snapshot

- **Project H**: real path-finding, type filtering, and N-hop expansion
  added to `core/knowledge/index.js`; a dedicated Knowledge Graph
  Explorer panel.
- **Project A + Project M**: `packageDashboardConfigs()` -- packages can
  now declare a real dashboard panel in their manifest, rendered by a
  generic, data-driven frontend renderer with zero per-package frontend
  code. `autonomousBuilder.js` now generates a real one automatically
  for every future capability it builds, closing the one genuine gap in
  its otherwise-complete lifecycle.
- **Project N**: `core/system/operationalReadiness.js` -- the real
  combined checklist (running/healthy/connected + missing credentials/
  approvals waiting/offline services), wired into the dashboard.

## Resolved earlier

- **Project G**: safe log archival, report-only consistency checks.
- **Project F**: unified 0-100 health score, wired into Project B's
  startup diagnostics; fixed a real, pre-existing `id="system-health"`
  duplicate along the way.
- **Project D, part 1**: a real crash-risk bug in `discordBot.js`
  fixed; real `status()` added to `obsidian.js`/`fileIntelligence.js`.
- **Phases 42-59** (see `docs/CHANGELOG.md`): all six Divisions,
  Executive Intelligence, Knowledge Graph expansion, Department
  Collaboration, the Executive Constitution, the widened event bus,
  composable workflows, multi-model routing, personal intelligence,
  knowledge acquisition, real capability-builder tool shapes.

## Audit findings still to act on (from this round's research)

1. **Project J gaps**: `dailyBriefing.js` has no distinct "upcoming
   deadlines" field (roadmap has deadline data, not surfaced as its own
   filtered list); `dailyReview.js` has no distinct "performance
   metrics" field (failure telemetry exists, not aggregated). Both are
   small, well-scoped additions reusing existing real data.
2. **Project E gaps**: no by-source memory breakdown, no activity-over-
   time heatmap, no per-entry evolution history (importance is
   overwritten each lifecycle sweep, not appended) -- real design
   decision needed on whether to start appending history before
   building a "viewer" for it.
3. **Project B gap**: no `scripts/verify-launch-agent.sh` (install/
   uninstall exist); no single consolidated "startup complete" log line
   (diagnostics log individually).
4. **Project D, part 2**: retry logic is centralized in `http.js` but
   only `github.js` explicitly uses `requestWithRetry`; extending to
   discord/google/calendar/email/cloudStorage where calls are
   idempotent is still open.

## Unchanged, still open

- The git-history rewrite question and knowledge-graph company
  isolation (Phase 10) -- business/architecture decisions for the
  operator, not technical gaps.
- The full dashboard visual/UX command-center redesign still needs
  real browser access -- but individual missing panels/data (as this
  round proved repeatedly) are not blocked by that.
- Project L's new social-platform connectors (Instagram/TikTok/etc.)
  genuinely require real external developer accounts -- publishing
  stays approval-gated and unbuilt until those exist, by design.
