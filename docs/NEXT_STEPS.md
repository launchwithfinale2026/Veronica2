# VERONICA — Next Steps

Snapshot as of **Final Deployment Mode (Projects 1-10)**. 775/775 tests
passing. Objective shifted from "build more architecture" to
"deployment" -- the remaining work is almost entirely human actions
(credentials, OAuth consent, a macOS permission dialog), not code. See
`docs/FINAL_DEPLOYMENT_CHECKLIST.md` for the authoritative, ordered
list of what's actually left for the operator.

## This round (Final Deployment Mode)

- **Project 1 — Boot Sequence**: done. `core/system/bootSequence.js`
  tracks all 11 real stages, wired into `dashboard/backend/server.js`'s
  actual load order; `GET /api/system/boot-status` + a dashboard panel.
- **Project 2 — Resident VERONICA**: `runtimeState` wired into
  `startupManager.js`'s existing backoff-restart logic for explainable
  recovery (real exit code/reason on every transition). LaunchAgent
  install/uninstall/verify scripts confirmed already idempotent and
  safe -- no script changes needed.
- **Project 3 — Dashboard Deployment**: Memory Timeline, Executive
  Calendar (real deadlines + real ingested calendar events, honestly
  empty until a provider is connected), and System Logs panels added --
  all backed by data that already existed.
- **Project 4 — Runtime Reliability**: `core/system/runtimeState.js` --
  a generic online/offline/starting/stopping/error/restarting registry
  with explainable transitions, publishing `runtime.stateChanged`.
  Departments, the dashboard process, and the supervisor's view of its
  child are all registered.
- **Project 5 — Operational Readiness**: consolidated into the single
  `docs/FINAL_DEPLOYMENT_CHECKLIST.md`, evidence-based against this
  machine's real, live state (health score, connector status, API_TOKEN
  presence) rather than estimated.
- **Project 6 — Business Readiness**: verified, not rebuilt. All six
  divisions already declare real package department configs, are
  already `active`, and already have passing per-division health
  assertions in `tests/daily-briefing.test.js`.
- **Project 7 — Daily Workflow**: verified. The dashboard's SSE-driven
  `scheduleRefresh()` already debounces a full reload on every bus
  event -- no manual refresh was ever required.
- **Project 8 — End-to-End Validation**: full suite run after every
  change this round; stayed green throughout (761 -> 775).
- **Project 9 — Documentation**: `docs/BootSequence.md` rewritten to
  match the real implementation (superseding an earlier aspirational
  draft); `docs/Architecture.md` and `docs/CHANGELOG.md` updated;
  `docs/DEPLOYMENT.md` and `docs/TROUBLESHOOTING.md` added.
- **Project 10 — Final Operational Audit**: see
  `docs/FINAL_DEPLOYMENT_CHECKLIST.md`'s "How this was verified"
  section for the exact evidence gathered.

## Resolved in the prior round (Projects A-N)

- Real, poll-based device notifications (no fabricated push
  infrastructure); a Notification Center dashboard widget.
- `scripts/verify-launch-agent.sh` (read-only checks).
- `dailyBriefing.js`'s `upcomingDeadlines()` and `dailyReview.js`'s
  `performanceMetrics()`.
- Real path-finding, type filtering, and N-hop expansion in
  `core/knowledge/index.js`; a dedicated Knowledge Graph Explorer panel.
- `packageDashboardConfigs()` -- packages declare a dashboard panel in
  their manifest, rendered by a generic, data-driven frontend renderer.
- `core/system/operationalReadiness.js` -- the combined readiness
  checklist, wired into the dashboard.
- Safe log archival, report-only consistency checks (Project G).
- Unified 0-100 health score (Project F), plus a fixed pre-existing
  `id="system-health"` duplicate.
- A real crash-risk bug in `discordBot.js` fixed; real `status()` added
  to `obsidian.js`/`fileIntelligence.js`.
- **Phases 42-59** (see `docs/CHANGELOG.md`): all six Divisions,
  Executive Intelligence, Knowledge Graph expansion, Department
  Collaboration, the Executive Constitution, the widened event bus,
  composable workflows, multi-model routing, personal intelligence,
  knowledge acquisition, real capability-builder tool shapes.

## Still genuinely open (not code gaps -- see the checklist)

- `API_TOKEN` unset -- every dashboard write route fails closed until
  this is set.
- LaunchAgent not yet installed on this machine -- VERONICA does not
  yet survive a Mac restart without a manual `node ...` invocation.
- Google OAuth consent (once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `GOOGLE_REDIRECT_URI` are set) is a real human consent flow, not
  something a script can complete.
- Calendar/Email/Cloud Storage connectors remain interface-only
  placeholders awaiting a provider decision (Google Workspace, if
  connected via #4 in the checklist, covers Gmail/Calendar/Drive
  already -- these three are for a *different*, non-Google provider).
- Project L's social-platform connectors (Instagram/TikTok/etc.)
  genuinely require real external developer accounts -- publishing
  stays approval-gated and unbuilt until those exist, by design.
- The git-history rewrite question and knowledge-graph company
  isolation (Phase 10) -- business/architecture decisions for the
  operator, not technical gaps.
- The full dashboard visual/UX command-center redesign still needs real
  browser access -- but individual missing panels/data have repeatedly
  proven not to be blocked by that.
