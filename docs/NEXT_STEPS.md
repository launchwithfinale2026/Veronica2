# VERONICA — Next Steps

Snapshot as of **Project F (Self Diagnostics) + startup diagnostics
wiring into Project B**. 731/731 tests passing. Objective: "turn the
architecture into daily-usable software," organized into lettered
Projects rather than numbered phases:

- **Project A** — Mission Control Dashboard (command-center redesign;
  browser-blocked for the final visual pass, but structural/data work
  is not blocked)
- **Project B** — Resident Personal Operating System (substantially
  already built; startup diagnostics now wired in)
- **Project C** — Device Synchronization
- **Project D** — Connector Hardening (part 1 done)
- **Project E** — Executive UX
- **Project F** — Self Diagnostics (unified health score -- done)
- **Project G** — Autonomous Maintenance
- **Project H** — Package Quality
- **Project I** — Production Polish

## Resolved since the last snapshot

- **Project F**: `core/system/healthScore.js` -- a deterministic,
  explainable 0-100 score combining `health.js`/`selfImprovement.js`/
  `marketplace.js`'s real signals, with a traceable per-deduction
  breakdown. Wired into a new `GET /api/system/health-score` route and
  both dashboard health widgets.
- **Project B**: `core/system/startupManager.js`'s `start()` now runs
  real startup diagnostics (non-blocking, never throws) via the new
  health score -- the one genuinely-missing piece from the audit.
- **A real, pre-existing bug fixed**: `dashboard/frontend/index.html`'s
  duplicate `id="system-health"` (flagged across multiple prior
  snapshots, always deferred as "needs a browser pass") turned out to
  be a structural JS bug fixable without any visual/browser work --
  fixed. The "System" panel's Health widget had never once been
  populated before this fix.

## Resolved earlier

- **Project D, part 1**: a real crash-risk bug in
  `core/integrations/discordBot.js` (unhandled discord.js `"error"`
  event could crash the whole process); real `status()`/`isConfigured()`
  added to `obsidian.js`/`fileIntelligence.js`.
- **Phases 42-59** (see `docs/CHANGELOG.md`): all six Divisions,
  Executive Intelligence, Knowledge Graph expansion, Department
  Collaboration, the Executive Constitution, the widened event bus,
  composable workflows, multi-model routing, personal intelligence,
  knowledge acquisition, and real capability-builder tool shapes.
- Phases 58/60 remain genuine external blockers (browser access; a real
  LaunchAgent install on the operator's actual machine).

## In progress / next up (open-ended, not a fixed backlog)

1. **Project D, part 2** — extend real retry logic (currently
   centralized in `core/integrations/http.js`, GET-only via
   `github.js`'s `requestWithRetry`) to other connectors where safe
   (idempotent calls only).
2. **Project A — dashboard panels genuinely missing**: Memory Timeline,
   a dedicated Knowledge Graph Explorer (today only a widget inside
   "Intelligence"), Package Management (today only Capability
   Marketplace), AI Conversations. Structural/data work only -- the
   full visual/UX command-center pass still waits on real browser
   access, but individual missing panels with real data are not
   blocked (see how the `system-health` id fix above needed no browser
   at all).
3. **Project C — Device Synchronization**: real presence/heartbeat/sync
   already exist (`core/device/`); "handoff" (marking a task/mission for
   a specific device to pick up) and cross-device notifications
   (queued, poll-based -- no push infrastructure exists or is being
   fabricated) are the genuine gaps.
4. **Project G — Autonomous Maintenance**: no real "clean temp data /
   archive logs / remove duplicates / repair references" job exists
   today. Real, SAFE, reversible work only (log rotation/archival);
   anything riskier (duplicate/dangling-reference detection) should be
   a REPORT, not an automatic action, matching "run only approval-free
   maintenance" and "never remove human oversight."
5. **Projects E, H, I** — executive-response formatting polish, a
   per-package consistency audit, and general production polish --
   applied opportunistically alongside the above rather than as
   separate, dedicated efforts.

## Unchanged, still open

- The git-history rewrite question and knowledge-graph company
  isolation (Phase 10) -- business/architecture decisions for the
  operator, not technical gaps.
- Phase 58/60's real external blockers (browser access; a real
  LaunchAgent install on the operator's actual machine) -- Project B/A
  work continues around them, not through them.
