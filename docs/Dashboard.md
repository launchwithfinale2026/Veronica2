# VERONICA Dashboard

There are two real, separate pages, both served by the same backend
(`dashboard/backend/server.js`) with zero framework, zero bundler, zero
build step -- plain HTML/CSS/JS, same convention this whole codebase
already uses.

- **`/` — Mission Control** (`dashboard/frontend/index.html` +
  `mission-control.js` + `mission-control.css`). The permanent, primary
  interface (Phase 45): at a glance, what VERONICA is doing right now,
  what's alive, what failed, whether voice is listening, and a live
  event stream. Event-driven, dark, minimal.
- **`/panels.html` — Full Dashboard** (`index.html`'s previous
  identity, renamed; `app.js` + `style.css`, unchanged). The full,
  dense, ~40-panel operational view built up over Phases 7-59 --
  Executive Summary, Memory, Knowledge Graph, all six Divisions,
  Capability Marketplace, and everything else. Still there, still real,
  reachable via the "Full Dashboard →" link in Mission Control's status
  bar (and "← Mission Control" from its own header).

Both pull from the same backend, the same `core/*` modules, and the
same `GET /api/events` SSE stream -- there is no second data layer.

## How components subscribe

Mission Control has exactly one live data source:
`new EventSource("/api/events")`, opened once in
`MissionControl.startEventStream()`. Every real bus event this
codebase already publishes (see `core/bus/index.js`) that's in
`dashboard/backend/server.js`'s `STREAMED_EVENTS` whitelist is
forwarded over that one connection as a JSON-encoded SSE message
(`{ type, payload, timestamp }`).

`MissionControl.handleEvent(event)` is the single dispatch point --
every widget-specific update (voice panel, agent activity, the core
node, the footer) is triggered from there, based on `event.type`. No
widget opens its own connection or does its own polling.

The one deliberate exception: CPU/RAM/disk and the automation queue
depth have no bus event behind them anywhere in this codebase (nothing
publishes when CPU usage changes) -- `pollUneventedMetrics()` refreshes
those on a single, explicitly-labeled 15-second interval
(`POLL_INTERVAL_MS`), not "when events already exist."

## How new widgets are added

1. Add the real DOM elements to `dashboard/frontend/index.html` inside
   whichever region they belong to (or a new `<section class="region">`
   for a whole new region).
2. Add a `render<Name>()` method on the `MissionControl` class that
   reads `this.state` and writes to those elements via `this.text(id,
   value)` or direct DOM calls.
3. Wire it into `handleEvent()` (or `loadInitialSnapshot()` for a
   one-time value) so it updates from the real event(s) that carry its
   data -- wrap the actual render call in `safeRender(regionId, label,
   fn)`, which every existing widget already uses: a real failure in
   one widget is caught, logged (`console.error`), and shown as an
   inline error in that widget's own region -- it never crashes another
   widget or the controller.
4. If the widget needs a fresh backend value, add it to the
   `Promise.allSettled([...])` list in `loadInitialSnapshot()` --
   reuse an existing `GET /api/...` route wherever one already returns
   the right data (most do; see `dashboard/backend/server.js`'s `ROUTES`
   table and `ROUTES`-adjacent pattern-matched routes for the full
   list) rather than adding a new one.
5. If any DOM listener is involved (a button, a resize handler,
   anything beyond `textContent` writes), register it through
   `this.listeners.add(target, event, handler)` -- never a bare
   `addEventListener()` call. `ListenerRegistry` is what makes
   `destroy()`/`stop()` able to remove every real listener the
   controller ever added, with nothing left behind.

## How visualization states work

The central node (Region 1) is a pure function of real state, computed
in `deriveVisualizationState()` (the one function in
`mission-control.js` with zero DOM dependency -- directly unit-tested
in `tests/mission-control-logic.test.js`):

| State | Real trigger |
|---|---|
| `offline` | The SSE connection itself isn't open yet, or dropped |
| `error` | A real error signal (`voice.error`, a `department.activity` failure, `runtime.stateChanged` to `"error"`) within the last 4s |
| `interrupted` | A real `voice.interrupted` event within the last ~0.9s |
| `listening` / `thinking` / `speaking` | Voice is actually enabled AND its real `conversationState` is `LISTENING`/`PROCESSING`/`SPEAKING` |
| `working` | A real non-voice activity event (`department.activity`, `automation.jobCompleted`, `router.dispatched`) within the last 2.5s |
| `idle` | None of the above -- the real resting state |

Nothing here is a canned animation loop. Every state transition is a
CSS class toggle (`.node-stage[data-state="..."]` in
`mission-control.css`) driven by a real event; the actual pulsing/
breathing/rotating animation runs as a native CSS `@keyframes`
animation on the compositor thread, never a JS `requestAnimationFrame`
loop -- the only way to genuinely guarantee 60fps without hand-rolled
frame timing. `prefers-reduced-motion: reduce` disables every animation
in one media query.

## How EventBus integration works

`core/bus/index.js`'s `MessageBus` (a singleton `EventEmitter`) is the
same one every other subsystem already publishes to -- Mission Control
adds no new bus, no new event system. Phase 45 specifically:

- Extended `dashboard/backend/server.js`'s `STREAMED_EVENTS` whitelist
  with `boot.stageCompleted`, `runtime.stateChanged`,
  `router.dispatched`, and every `core/voice/events.js` event -- all
  real events that already existed but were never forwarded to the
  browser before.
- Added exactly one new real publish call:
  `core/router/index.js`'s `route()` now publishes
  `router.dispatched` (`{ agent, command, timestamp }`) after a real
  dispatch -- purely additive observability, no change to routing
  behavior, no new dependency.

`GET /api/events` (unchanged, Phase 17) is still the transport: Server-
Sent Events over the same `http` module already in use, one real
`bus.on(eventName, handler)` per whitelisted event name per connected
browser tab, cleaned up on `req.on("close")`. See
docs/Architecture.md's "Dashboard Live Updates" section for why SSE
over a hand-rolled WebSocket.

## Testing

`dashboard/frontend/mission-control.js` is split in two, specifically
so it can be tested without a real browser:

- **Pure logic** (`classifyEventCategory`, `deriveVisualizationState`,
  `formatUptime`, `computeEventRate`, `computeQueueDepth`,
  `summarizePayload`) has zero `document`/`window` reference and is
  `require()`d directly from `tests/mission-control-logic.test.js` --
  plain Node, no dependency.
- **The DOM controller** is tested via [jsdom](https://github.com/jsdom/jsdom)
  (a devDependency added specifically for this -- never shipped to a
  real browser, never part of the actual page) in
  `tests/mission-control-dom.test.js`, which loads the REAL
  `index.html` and the REAL `mission-control.js` source into a
  constructed `window`/`document`, with fake `fetch`/`EventSource`
  standing in for the two browser APIs jsdom itself doesn't implement
  (same "fake the dependency boundary, keep the real code under test"
  approach every other test in this project already uses for
  `child_process`). Covers rendering, subscription counts, cleanup
  (every listener actually removed, the real `EventSource` actually
  closed), repeated start/stop cycles never accumulating listeners
  (a memory-leak-shaped test), malformed-event and missing-DOM-element
  failure isolation, window resize, and a 250-event burst never growing
  the rendered list past its real cap.

Honesty about what these tests can't verify: jsdom has no real paint
pipeline, so nothing here measures actual frame time/fps -- the
"performance" tests instead verify the two concrete bug patterns that
requirement exists to prevent (an unbounded event list, duplicate
subscriptions from a repeated `start()`). A true 60fps/frame-timing
measurement would need a real browser test runner (Playwright/
Puppeteer), which this repository does not have installed.
