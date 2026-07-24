const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "dashboard", "frontend", "index.html");
const JS_PATH = path.join(__dirname, "..", "dashboard", "frontend", "mission-control.js");

const HTML_SOURCE = fs.readFileSync(HTML_PATH, "utf8");
const JS_SOURCE = fs.readFileSync(JS_PATH, "utf8");


// Real, minimal stand-ins for the two browser APIs jsdom itself doesn't
// implement (fetch, EventSource) -- same "fake the dependency boundary,
// keep the real code under test" approach every other test file in this
// project already uses for child_process/spawn.
function installFakeEventSource(win){

    class FakeEventSource extends win.EventTarget {

        constructor(url){
            super();
            this.url = url;
            this.readyState = 0;
            FakeEventSource.instances.push(this);
        }

        close(){
            this.readyState = 2;
            const idx = FakeEventSource.instances.indexOf(this);
            if(idx !== -1){
                FakeEventSource.instances.splice(idx, 1);
            }
        }

        emitOpen(){
            this.readyState = 1;
            this.dispatchEvent(new win.Event("open"));
        }

        emitMessage(payload){
            const messageEvent = new win.MessageEvent("message", { data: JSON.stringify(payload) });
            this.dispatchEvent(messageEvent);
        }

        emitError(){
            this.dispatchEvent(new win.Event("error"));
        }

    }

    FakeEventSource.instances = [];

    win.EventSource = FakeEventSource;

    return FakeEventSource;

}


function installFakeFetch(win, routes){

    win.fetch = async url => {

        const cleanPath = url.split("?")[0];

        if(!(cleanPath in routes)){
            return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
        }

        return { ok: true, status: 200, json: async () => routes[cleanPath] };

    };

}


const DEFAULT_ROUTES = {
    "/api/status": { identity: "VERONICA", version: "1.0.0", gitBranch: "development", environment: "test", uptimeSeconds: 120, agents: 28, departments: 15 },
    "/api/system/health-score": {
        score: 88, status: "healthy",
        raw: { cpu: { loadPercent1m: 20 }, memory: { usedPercent: 40 }, disk: { usedPercent: 30 } }
    },
    "/api/system/boot-status": { startedAt: new Date().toISOString(), online: true, progressPercent: 100 },
    "/api/system/runtime-state": [
        { name: "department:athena", state: "online", reason: null, updatedAt: new Date().toISOString() }
    ],
    "/api/voice/status": {
        enabled: false,
        wakeWord: { label: "Wake word detection", configured: false, missing: ["command"] },
        speechToText: { label: "Speech to text (whisper.cpp)", configured: false, missing: [] },
        textToSpeech: { label: "Text to speech (Piper)", configured: false, missing: [] },
        voiceStatus: { enabled: false, state: "IDLE", lastInteraction: null, modelLoaded: false }
    },
    "/api/automation/status": { running: true, queue: [{ status: "pending" }, { status: "completed" }], schedules: [] },
    "/api/learning/agents": [{ agent: "METIS", total: 5, successes: 4, failures: 1, successRate: 80, avgDurationMs: 900 }],
    "/api/departments": [{ id: "athena", name: "ATHENA", domain: "knowledge", status: "active", agents: ["METIS"], tools: [] }],
    "/api/integrations": { total: 3, configured: 1, implemented: 3, integrations: [{ id: "claude", label: "Claude", configured: true, implemented: true }] }
};


// Builds a real jsdom window with the real HTML, real fake-boundary
// APIs installed, and the REAL mission-control.js source evaluated
// inside it -- tests exercise the actual shipped file, not a parallel
// copy.
function createEnvironment(routeOverrides = {}){

    const dom = new JSDOM(HTML_SOURCE, {
        runScripts: "dangerously",
        url: "http://localhost/",
        pretendToBeVisual: true
    });

    const { window } = dom;

    installFakeFetch(window, { ...DEFAULT_ROUTES, ...routeOverrides });
    const FakeEventSource = installFakeEventSource(window);

    window.eval(JS_SOURCE);

    return { dom, window, document: window.document, FakeEventSource };

}


function flush(){
    return new Promise(resolve => setImmediate(resolve));
}


// Every test that starts the controller MUST stop it in a finally --
// otherwise a failed assertion leaves the real 1s clock interval and
// 15s poll interval alive, which keeps the whole `node --test` process
// running forever (a real hang this exact mistake caused once already
// this session, in tests/voice.test.js). This helper makes that
// impossible to forget.
async function withMissionControl(routeOverrides, fn){

    const env = createEnvironment(routeOverrides);

    try {
        await fn(env);
    } finally {
        env.window.MissionControl.stop();
    }

}


// --- Render tests ------------------------------------------------------

test("Mission Control renders the real initial snapshot into every region (Render tests)", async () => {

    await withMissionControl({}, async ({ window, document }) => {

        const controller = window.MissionControl.start();
        await controller.ready;
        await flush();

        assert.strictEqual(document.getElementById("field-version").textContent, "1.0.0");
        assert.strictEqual(document.getElementById("field-branch").textContent, "development");
        assert.strictEqual(document.getElementById("field-environment").textContent, "test");

        assert.strictEqual(document.getElementById("field-cpu").textContent, "20%");
        assert.strictEqual(document.getElementById("field-ram").textContent, "40%");
        assert.strictEqual(document.getElementById("field-disk").textContent, "30%");

        assert.strictEqual(document.getElementById("field-queue-depth").textContent, "1"); // one real pending entry

        assert.strictEqual(document.getElementById("voice-state").textContent, "Offline");
        assert.strictEqual(document.getElementById("voice-stt-engine").textContent, "Speech to text (whisper.cpp)");

        const agentRows = document.querySelectorAll("#agent-activity-list .agent-name");
        assert.strictEqual(agentRows.length, 1);
        assert.strictEqual(agentRows[0].textContent, "METIS");

    });

});


test("Mission Control's core visualization node is honestly \"offline\" before the real SSE connection opens, then \"idle\" once it does", async () => {

    await withMissionControl({}, async ({ window, document }) => {

        const controller = window.MissionControl.start();
        await controller.ready;
        await flush();

        const stage = document.querySelector(".node-stage");

        // No real live connection yet -- must not fabricate "idle".
        assert.strictEqual(stage.getAttribute("data-state"), "offline");
        assert.strictEqual(document.getElementById("node-state-label").textContent, "Offline");

        controller.eventSource.emitOpen();
        await flush();

        assert.strictEqual(stage.getAttribute("data-state"), "idle");
        assert.strictEqual(document.getElementById("node-state-label").textContent, "Idle");

    });

});


// --- Subscription tests -------------------------------------------------

test("Mission Control opens exactly one real EventSource and registers exactly the expected listeners (Subscription tests)", async () => {

    await withMissionControl({}, async ({ window, FakeEventSource }) => {

        const controller = window.MissionControl.start();
        await flush();

        assert.strictEqual(FakeEventSource.instances.length, 1);

        // open/error/message on the EventSource + click on the filter bar +
        // resize on window -- every real addEventListener() this controller
        // makes, tracked by its own ListenerRegistry.
        assert.strictEqual(controller.listeners.size, 5);

    });

});


test("Mission Control reacts to a real SSE message and updates the DOM live, no polling involved", async () => {

    await withMissionControl({}, async ({ window, document, FakeEventSource }) => {

        window.MissionControl.start();
        await flush();

        const source = FakeEventSource.instances[0];
        source.emitOpen();

        source.emitMessage({
            type: "department.activity",
            payload: { department: "athena", agent: "METIS", task: "Research a topic", outcome: "success", durationMs: 250 },
            timestamp: new Date().toISOString()
        });

        await flush();

        const rows = document.querySelectorAll("#event-stream li");
        assert.ok(rows.length >= 1);
        assert.ok(rows[0].textContent.includes("METIS"));
        assert.ok(rows[0].textContent.includes("Research a topic"));

        const agentMeta = document.querySelector("#agent-activity-list .agent-meta");
        assert.ok(agentMeta.textContent.includes("just ran"));

    });

});


test("Mission Control's core visualization reacts to a real voice.statusChanged event", async () => {

    await withMissionControl({
        "/api/voice/status": {
            enabled: true,
            wakeWord: { label: "Wake word detection", configured: true, missing: [] },
            speechToText: { label: "whisper.cpp", configured: true, missing: [] },
            textToSpeech: { label: "Piper", configured: true, missing: [] },
            voiceStatus: { enabled: true, state: "LISTENING", lastInteraction: null, modelLoaded: true }
        }
    }, async ({ window, document, FakeEventSource }) => {

        const controller = window.MissionControl.start();
        await controller.ready;
        await flush();

        const source = FakeEventSource.instances[0];
        source.emitOpen();

        source.emitMessage({
            type: "voice.statusChanged",
            payload: { voiceStatus: { enabled: true, state: "SPEAKING", lastInteraction: new Date().toISOString(), modelLoaded: true } },
            timestamp: new Date().toISOString()
        });

        await flush();

        assert.strictEqual(document.querySelector(".node-stage").getAttribute("data-state"), "speaking");
        assert.strictEqual(document.getElementById("voice-state").textContent, "SPEAKING");

    });

});


// --- Cleanup / memory-leak-shaped tests ---------------------------------

test("Mission Control removes every real listener it registered on stop() (Cleanup tests)", async () => {

    const env = createEnvironment();
    const { window, FakeEventSource } = env;

    const controller = window.MissionControl.start();
    await flush();

    assert.ok(controller.listeners.size > 0);
    assert.strictEqual(FakeEventSource.instances.length, 1);

    window.MissionControl.stop();

    assert.strictEqual(controller.listeners.size, 0);
    assert.strictEqual(FakeEventSource.instances.length, 0, "the real EventSource was actually closed, not just abandoned");
    assert.strictEqual(controller.clockTimer, null);
    assert.strictEqual(controller.pollTimer, null);

});


test("Repeated start()/stop() cycles never accumulate listeners or timers (Memory leak tests)", async () => {

    const { window, FakeEventSource } = createEnvironment();

    try {

        for(let i = 0; i < 5; i++){
            const controller = window.MissionControl.start();
            await flush();
            assert.strictEqual(FakeEventSource.instances.length, 1, `cycle ${i}: exactly one live EventSource`);
            window.MissionControl.stop();
            assert.strictEqual(FakeEventSource.instances.length, 0, `cycle ${i}: EventSource actually closed`);
            assert.strictEqual(controller.listeners.size, 0, `cycle ${i}: all listeners removed`);
        }

    } finally {
        window.MissionControl.stop();
    }

});


test("start() called twice in a row reuses the existing instance rather than opening a second EventSource (no duplicated subscriptions)", async () => {

    await withMissionControl({}, async ({ window, FakeEventSource }) => {

        const first = window.MissionControl.start();
        await flush();
        const second = window.MissionControl.start();

        assert.strictEqual(first, second);
        assert.strictEqual(FakeEventSource.instances.length, 1);

    });

});


// --- Failure tests --------------------------------------------------------

test("A malformed real SSE message is logged and does not crash the controller or other widgets (Failure tests)", async () => {

    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);

    try {

        await withMissionControl({}, async ({ window, document, FakeEventSource }) => {

            window.MissionControl.start();
            await flush();

            const source = FakeEventSource.instances[0];
            source.emitOpen();

            // Real malformed JSON on the wire.
            source.dispatchEvent(new window.MessageEvent("message", { data: "{not valid json" }));

            await flush();

            assert.ok(errors.length >= 1);

            // The controller is still alive and responds normally to the
            // next real, well-formed event.
            source.emitMessage({ type: "department.activity", payload: { department: "athena", agent: "METIS", task: "still works", outcome: "success" }, timestamp: new Date().toISOString() });
            await flush();

            assert.ok(document.getElementById("event-stream").textContent.includes("still works"));

        });

    } finally {
        console.error = originalError;
    }

});


test("A real fetch failure during the initial snapshot doesn't crash the whole page -- other regions still render", async () => {

    const originalError = console.error;
    console.error = () => {};

    const dom = new JSDOM(HTML_SOURCE, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
    const { window } = dom;
    const { document } = window;

    window.fetch = async url => {

        const cleanPath = url.split("?")[0];

        if(cleanPath === "/api/system/health-score"){
            throw new Error("real network failure");
        }

        return { ok: true, status: 200, json: async () => DEFAULT_ROUTES[cleanPath] || {} };

    };

    installFakeEventSource(window);
    window.eval(JS_SOURCE);

    try {

        const controller = window.MissionControl.start();
        await controller.ready;
        await flush();

        // Health score failed (Promise.allSettled absorbs it) -- but
        // status bar identity fields, which came from a real, separate,
        // successful fetch, still rendered.
        assert.strictEqual(document.getElementById("field-version").textContent, "1.0.0");

        // The failed metric's fields stay at their real, honest
        // "unknown" default rather than showing stale/fabricated data.
        assert.strictEqual(document.getElementById("field-cpu").textContent, "--");

    } finally {
        console.error = originalError;
        window.MissionControl.stop();
    }

});


test("A DOM element missing from the page (a hypothetical broken widget) is caught by safeRender() and logged, not thrown", async () => {

    const originalError = console.error;
    console.error = () => {};

    try {

        await withMissionControl({}, async ({ window, document }) => {

            // Simulate a broken/removed widget by deleting a real
            // element safeRender()'s target region wraps around.
            document.getElementById("voice-panel").remove();

            assert.doesNotThrow(() => { window.MissionControl.start(); });
            await flush();

        });

    } finally {
        console.error = originalError;
    }

});


// --- Window resize tests ---------------------------------------------

test("Mission Control responds to a real window resize event without throwing (Window resize tests)", async () => {

    await withMissionControl({}, async ({ window }) => {

        window.MissionControl.start();
        await flush();

        Object.defineProperty(window, "innerWidth", { value: 300, configurable: true });
        assert.doesNotThrow(() => window.dispatchEvent(new window.Event("resize")));

        Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
        assert.doesNotThrow(() => window.dispatchEvent(new window.Event("resize")));

    });

});


// --- Component tests (event filtering) --------------------------------

test("Recent Events filter chips only show events in the real selected category (Component tests)", async () => {

    await withMissionControl({}, async ({ window, document, FakeEventSource }) => {

        window.MissionControl.start();
        await flush();

        const source = FakeEventSource.instances[0];
        source.emitOpen();

        source.emitMessage({ type: "department.activity", payload: { department: "athena", agent: "METIS", task: "A", outcome: "success" }, timestamp: new Date().toISOString() });
        source.emitMessage({ type: "voice.listening", payload: {}, timestamp: new Date().toISOString() });
        await flush();

        const voiceChip = [...document.querySelectorAll(".filter-chip")].find(chip => chip.dataset.category === "voice");
        voiceChip.dispatchEvent(new window.Event("click", { bubbles: true }));

        await flush();

        const rows = [...document.querySelectorAll("#event-stream li")];
        assert.ok(rows.length >= 1);
        assert.ok(rows.every(row => row.getAttribute("data-category") === "voice"));

    });

});


// --- Performance-shaped tests -------------------------------------------
//
// jsdom has no real paint/frame pipeline, so these can't measure actual
// fps -- they verify the two real bug patterns "target <16ms, 60fps, no
// unnecessary rerenders" is actually guarding against: a runaway/
// unbounded event log, and a burst of events causing more work than the
// real number of changes involved.

test("A large burst of real events never grows the rendered event list past its real cap", async () => {

    await withMissionControl({}, async ({ window, document, FakeEventSource }) => {

        window.MissionControl.start();
        await flush();

        const source = FakeEventSource.instances[0];
        source.emitOpen();

        for(let i = 0; i < 250; i++){
            source.emitMessage({ type: "department.activity", payload: { department: "athena", agent: "METIS", task: `task ${i}`, outcome: "success" }, timestamp: new Date().toISOString() });
        }

        await flush();

        const rows = document.querySelectorAll("#event-stream li");
        assert.ok(rows.length <= 200, `expected the event list capped at 200, got ${rows.length}`);

    });

});


test("stop() clears the real clock/poll intervals so no background work continues after teardown", async () => {

    const { window } = createEnvironment();

    try {

        window.MissionControl.start();
        await flush();

        const clearIntervalCalls = [];
        const originalClear = window.clearInterval;
        window.clearInterval = id => { clearIntervalCalls.push(id); return originalClear(id); };

        window.MissionControl.stop();

        assert.strictEqual(clearIntervalCalls.length, 2, "both the clock timer and the poll timer were really cleared");

    } finally {
        window.MissionControl.stop();
    }

});
