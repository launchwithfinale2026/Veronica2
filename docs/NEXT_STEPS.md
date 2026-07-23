# VERONICA — Next Steps

Snapshot as of **Project G (Autonomous Maintenance)**. 737/737 tests
passing. Objective: "turn the architecture into daily-usable software,"
organized into lettered Projects rather than numbered phases:

- **Project A** — Mission Control Dashboard (structural/data work not
  blocked; the full visual/UX pass waits on real browser access)
- **Project B** — Resident Personal Operating System (substantially
  already built; startup diagnostics now wired in)
- **Project C** — Device Synchronization (not started)
- **Project D** — Connector Hardening (part 1 done)
- **Project E** — Executive UX (not started)
- **Project F** — Self Diagnostics (unified health score -- done)
- **Project G** — Autonomous Maintenance (done)
- **Project H** — Package Quality (not started)
- **Project I** — Production Polish (ongoing, opportunistic)

## Resolved since the last snapshot

- **Project G**: `core/system/maintenance.js` -- real, safe, reversible
  log archival (rename, never delete) for `executions.log`/`errors.log`
  once they cross a real size threshold, run as a real daily automation
  job. Anything riskier (duplicates, dangling references) is
  report-only, reusing `selfImprovement.js`'s/`marketplace.js`'s
  already-real checks rather than inventing new destructive ones.

## Resolved earlier

- **Project F**: unified 0-100 health score
  (`core/system/healthScore.js`), wired into Project B's startup
  diagnostics and both dashboard health widgets. Fixed a real,
  pre-existing `id="system-health"` duplicate along the way (a
  structural JS bug, not something that needed a browser to fix).
- **Project D, part 1**: a real crash-risk bug in
  `core/integrations/discordBot.js` fixed; real `status()` added to
  `obsidian.js`/`fileIntelligence.js`.
- **Phases 42-59** (see `docs/CHANGELOG.md`): all six Divisions,
  Executive Intelligence, Knowledge Graph expansion, Department
  Collaboration, the Executive Constitution, the widened event bus,
  composable workflows, multi-model routing, personal intelligence,
  knowledge acquisition, real capability-builder tool shapes.
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
   Marketplace), AI Conversations. Structural/data work only -- proven
   not to require a browser by the `system-health` id fix; the full
   visual/UX command-center pass still waits on real browser access.
3. **Project C — Device Synchronization**: real presence/heartbeat/sync
   already exist (`core/device/`); "handoff" (marking a task/mission for
   a specific device to pick up) and cross-device notifications
   (queued, poll-based -- no push infrastructure exists or is being
   fabricated) are the genuine gaps.
4. **Projects E, H, I** — executive-response formatting polish, a
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
