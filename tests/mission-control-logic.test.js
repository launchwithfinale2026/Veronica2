const test = require("node:test");
const assert = require("node:assert");

const mc = require("../dashboard/frontend/mission-control.js");

// --- classifyEventCategory() ---------------------------------------

test("classifyEventCategory() maps every real event prefix to its correct category", () => {

    assert.strictEqual(mc.classifyEventCategory("voice.listening"), "voice");
    assert.strictEqual(mc.classifyEventCategory("voice.error"), "error");
    assert.strictEqual(mc.classifyEventCategory("router.dispatched"), "router");
    assert.strictEqual(mc.classifyEventCategory("department.activity"), "agents");
    assert.strictEqual(mc.classifyEventCategory("collaboration.message"), "agents");
    assert.strictEqual(mc.classifyEventCategory("automation.jobCompleted"), "automation");
    assert.strictEqual(mc.classifyEventCategory("workflow.completed"), "automation");
    assert.strictEqual(mc.classifyEventCategory("connector.online"), "network");
    assert.strictEqual(mc.classifyEventCategory("connector.offline"), "network");
    assert.strictEqual(mc.classifyEventCategory("git.commit"), "filesystem");
    assert.strictEqual(mc.classifyEventCategory("memory.updated"), "filesystem");
    assert.strictEqual(mc.classifyEventCategory("knowledge.updated"), "filesystem");
    assert.strictEqual(mc.classifyEventCategory("runtime.stateChanged"), "system");
    assert.strictEqual(mc.classifyEventCategory("boot.stageCompleted"), "system");
    assert.strictEqual(mc.classifyEventCategory("approval.granted"), "agents");
    assert.strictEqual(mc.classifyEventCategory("notification.created"), "agents");

});

test("classifyEventCategory() falls back to \"system\" for an unrecognized or missing type", () => {
    assert.strictEqual(mc.classifyEventCategory("something.unheard-of"), "system");
    assert.strictEqual(mc.classifyEventCategory(""), "system");
    assert.strictEqual(mc.classifyEventCategory(null), "system");
});


// --- isWarningOrError() ----------------------------------------------

test("isWarningOrError() flags a real failure outcome, a real runtime error/restart, and voice.error", () => {

    assert.strictEqual(mc.isWarningOrError("voice.error", {}), "error");
    assert.strictEqual(mc.isWarningOrError("department.activity", { outcome: "failure" }), "error");
    assert.strictEqual(mc.isWarningOrError("department.activity", { outcome: "success" }), null);
    assert.strictEqual(mc.isWarningOrError("runtime.stateChanged", { state: "error" }), "error");
    assert.strictEqual(mc.isWarningOrError("runtime.stateChanged", { state: "restarting" }), "warning");
    assert.strictEqual(mc.isWarningOrError("runtime.stateChanged", { state: "online" }), null);
    assert.strictEqual(mc.isWarningOrError("connector.offline", {}), "warning");
    assert.strictEqual(mc.isWarningOrError("memory.updated", {}), null);

});


// --- deriveVisualizationState() (Task: visual states) ----------------

test("deriveVisualizationState() reports offline when the real SSE connection is down, above everything else", () => {

    const state = mc.deriveVisualizationState({
        sseConnected: false,
        voiceState: "SPEAKING",
        voiceEnabled: true,
        recentActivityAt: Date.now()
    });

    assert.strictEqual(state, "offline");

});

test("deriveVisualizationState() reports error during a real, recent error window, before voice states", () => {

    const now = 1000000;

    const state = mc.deriveVisualizationState({
        nowMs: now,
        recentErrorAt: now - 500,
        voiceState: "LISTENING",
        voiceEnabled: true,
        sseConnected: true
    });

    assert.strictEqual(state, "error");

});

test("deriveVisualizationState() reports interrupted for a brief real window after a real interruption", () => {

    const now = 1000000;

    const stillInterrupted = mc.deriveVisualizationState({
        nowMs: now,
        voiceInterruptedAt: now - 400,
        sseConnected: true
    });
    assert.strictEqual(stillInterrupted, "interrupted");

    const noLongerInterrupted = mc.deriveVisualizationState({
        nowMs: now,
        voiceInterruptedAt: now - 5000,
        sseConnected: true
    });
    assert.strictEqual(noLongerInterrupted, "idle");

});

test("deriveVisualizationState() maps real conversationState values to listening/thinking/speaking, only when voice is enabled", () => {

    const base = { nowMs: 1000000, sseConnected: true, voiceEnabled: true };

    assert.strictEqual(mc.deriveVisualizationState({ ...base, voiceState: "LISTENING" }), "listening");
    assert.strictEqual(mc.deriveVisualizationState({ ...base, voiceState: "PROCESSING" }), "thinking");
    assert.strictEqual(mc.deriveVisualizationState({ ...base, voiceState: "SPEAKING" }), "speaking");

    // Same real states, but voice isn't actually enabled -- must not
    // fabricate a listening/thinking/speaking appearance.
    assert.strictEqual(mc.deriveVisualizationState({ ...base, voiceEnabled: false, voiceState: "LISTENING" }), "idle");

});

test("deriveVisualizationState() reports working for a brief window after real non-voice activity, then settles to idle", () => {

    const now = 1000000;

    const working = mc.deriveVisualizationState({ nowMs: now, recentActivityAt: now - 100, sseConnected: true });
    assert.strictEqual(working, "working");

    const settled = mc.deriveVisualizationState({ nowMs: now, recentActivityAt: now - 10000, sseConnected: true });
    assert.strictEqual(settled, "idle");

});

test("deriveVisualizationState() defaults to idle with no real signals at all", () => {
    assert.strictEqual(mc.deriveVisualizationState({}), "idle");
});


test("deriveVisualizationState() (Phase 46) reports offline for a real system lifecycle OFFLINE/SHUTTING_DOWN state, even with a connected SSE stream", () => {

    assert.strictEqual(mc.deriveVisualizationState({ sseConnected: true, systemLifecycleState: "OFFLINE" }), "offline");
    assert.strictEqual(mc.deriveVisualizationState({ sseConnected: true, systemLifecycleState: "SHUTTING_DOWN" }), "offline");

});


test("deriveVisualizationState() (Phase 46) reports error for a real system lifecycle FAILED state, and during the real recent-FAILED flash window", () => {

    assert.strictEqual(mc.deriveVisualizationState({ systemLifecycleState: "FAILED" }), "error");

    const now = 1000000;
    assert.strictEqual(mc.deriveVisualizationState({ nowMs: now, lifecycleFailedAt: now - 500 }), "error");
    assert.strictEqual(mc.deriveVisualizationState({ nowMs: now, lifecycleFailedAt: now - 10000, systemLifecycleState: "READY" }), "idle");

});


// --- formatUptime() ----------------------------------------------------

test("formatUptime() formats real seconds into the largest sensible real unit", () => {

    assert.strictEqual(mc.formatUptime(5), "5s");
    assert.strictEqual(mc.formatUptime(65), "1m 5s");
    assert.strictEqual(mc.formatUptime(3725), "1h 2m");
    assert.strictEqual(mc.formatUptime(90000), "1d 1h 0m");
    assert.strictEqual(mc.formatUptime(-1), "--");
    assert.strictEqual(mc.formatUptime(NaN), "--");

});


// --- computeEventRate() / pruneTimestamps() ---------------------------

test("computeEventRate() counts only real timestamps within the trailing window", () => {

    const now = 1000000;
    const timestamps = [now - 70000, now - 59000, now - 30000, now - 1000, now];

    assert.strictEqual(mc.computeEventRate(timestamps, now, 60000), 4);
    assert.strictEqual(mc.computeEventRate(timestamps, now, 10000), 2);

});

test("pruneTimestamps() drops real timestamps older than the window, bounding real memory growth", () => {

    const now = 1000000;
    const timestamps = [now - 70000, now - 1000, now];

    const pruned = mc.pruneTimestamps(timestamps, now, 60000);

    assert.deepStrictEqual(pruned, [now - 1000, now]);

});


// --- computeQueueDepth() -----------------------------------------------

test("computeQueueDepth() counts only real pending/running entries, not completed/failed history", () => {

    const queue = [
        { status: "pending" },
        { status: "running" },
        { status: "completed" },
        { status: "failed" },
        { status: "pending" }
    ];

    assert.strictEqual(mc.computeQueueDepth(queue), 3);
    assert.strictEqual(mc.computeQueueDepth([]), 0);
    assert.strictEqual(mc.computeQueueDepth(null), 0);

});


// --- summarizePayload() -------------------------------------------------

test("summarizePayload() produces a real, informative one-line summary for known real event shapes", () => {

    const activity = mc.summarizePayload("department.activity", {
        agent: "PLUTUS", department: "hades", task: "Review budget", outcome: "success", durationMs: 420
    });
    assert.ok(activity.includes("PLUTUS"));
    assert.ok(activity.includes("hades"));
    assert.ok(activity.includes("success"));
    assert.ok(activity.includes("420ms"));

    const dispatched = mc.summarizePayload("router.dispatched", { agent: "METIS", command: "what agents are online" });
    assert.ok(dispatched.includes("METIS"));
    assert.ok(dispatched.includes("what agents are online"));

    const runtime = mc.summarizePayload("runtime.stateChanged", { name: "dashboard-child", previousState: "online", state: "restarting", reason: "crash" });
    assert.ok(runtime.includes("online"));
    assert.ok(runtime.includes("restarting"));
    assert.ok(runtime.includes("crash"));

});

test("summarizePayload() never fabricates content for an unrecognized real payload shape -- falls back to real JSON, truncated", () => {

    const result = mc.summarizePayload("some.unknown.event", { a: 1, b: "real value" });
    assert.ok(result.includes("real value"));

});

test("summarizePayload() handles a non-object/empty payload without throwing", () => {
    assert.strictEqual(mc.summarizePayload("x", null), "");
    assert.strictEqual(mc.summarizePayload("x", undefined), "");
});
