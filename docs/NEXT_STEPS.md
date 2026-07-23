# VERONICA — Next Steps

Snapshot as of **Project D, part 1 (Connector Hardening)**. 720/720
tests passing. **The objective reframed again**: Phases 42-59 are
complete (see `docs/CHANGELOG.md`); Phases 58 (Mission Control
Dashboard) and 60 (Personal Operating System) were identified as
genuine external blockers. The new standing instruction is "turn the
architecture into daily-usable software," organized into lettered
Projects rather than numbered phases:

- **Project A** — Mission Control Dashboard (command-center redesign;
  browser-blocked for the final visual pass, but structural/data work
  is not blocked)
- **Project B** — Resident Personal Operating System (turns out
  substantially already built -- see below)
- **Project C** — Device Synchronization
- **Project D** — Connector Hardening (in progress)
- **Project E** — Executive UX
- **Project F** — Self Diagnostics (unified health score)
- **Project G** — Autonomous Maintenance
- **Project H** — Package Quality
- **Project I** — Production Polish

## Resolved since the last snapshot

- **Project D, part 1**: A real crash-risk bug fixed in
  `core/integrations/discordBot.js` (an unhandled discord.js `"error"`
  event would have crashed the entire process on a real gateway
  hiccup -- now wired with real reconnection-visibility fields). Real
  `status()`/`isConfigured()` added to `core/integrations/obsidian.js`/
  `core/integrations/fileIntelligence.js` (previously hardcoded
  `configured: true`), wired into `core/integrations/registry.js`.

## Audit correction: Project B is mostly already done

A full audit (before writing anything) found `core/system/startupManager.js`
(Phase 21) already provides: a real launch supervisor (spawns the
dashboard as a child process), automatic recovery with bounded,
backoff-scaled crash restarts, and real HTTP-based hang detection
(polls `/api/status`, not just "is the process alive"). `config/com.veronica.agent.plist`
and `scripts/install-launch-agent.sh`/`uninstall-launch-agent.sh`
already exist for the one deliberately-manual installation step. What
Project B's spec asks for that genuinely doesn't exist yet:
**connector reconnection** (Project D's job, in progress) and
**startup diagnostics** (a real, combined health report at boot --
Project F's unified health score, once built, is the natural thing to
wire into `startupManager.js` here). "Event replay" was considered and
rejected as manufactured scope: the real underlying state (memory,
knowledge graph, automation queue) is already durable and reloaded
correctly on restart; only transient live bus notifications are lost on
a restart, which is expected and fine for a personal single-user
system, not a real gap to build fake infrastructure for.

## In progress / next up (open-ended, not a fixed backlog)

1. **Project F — Unified Health Score.** No single combined score
   exists yet: `core/system/health.js` (CPU/RAM/disk/services),
   `core/system/connectorHealth.js` (transition detection only), and
   `core/system/selfImprovement.js` (proposals/reports) each report
   separately. Real, deterministic, explainable point-deduction scoring
   across all three is the next concrete piece of work.
2. **Project D, part 2** — extend real retry logic (currently
   centralized in `core/integrations/http.js`, GET-only via
   `github.js`'s `requestWithRetry`) to other connectors where safe
   (idempotent calls only).
3. **Project B — wire the unified health score into `startupManager.js`**
   as real startup diagnostics, once Project F exists.
4. **Project A — dashboard panels genuinely missing**: Memory Timeline,
   a dedicated Knowledge Graph Explorer (today only a widget inside
   "Intelligence"), Package Management (today only Capability
   Marketplace), AI Conversations. Structural/data work only --
   `system-health` duplicate id fix and the full visual/UX pass still
   wait on real browser access.
5. **Project C — Device Synchronization**: real presence/heartbeat/sync
   already exist (`core/device/`); "handoff" (marking a task/mission for
   a specific device to pick up) and cross-device notifications
   (queued, poll-based -- no push infrastructure exists or is being
   fabricated) are the genuine gaps.
6. **Project G — Autonomous Maintenance**: no real "clean temp data /
   archive logs / remove duplicates / repair references" job exists
   today. Real, SAFE, reversible work only (log rotation/archival);
   anything riskier (duplicate/dangling-reference detection) should be
   a REPORT, not an automatic action, matching "run only approval-free
   maintenance" and "never remove human oversight."
7. **Projects E, H, I** — executive-response formatting polish, a
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
