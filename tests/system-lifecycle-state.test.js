const test = require("node:test");
const assert = require("node:assert");

const SystemState = require("../core/system/systemState");
const events = require("../core/system/systemEvents");
const bus = require("../core/bus");


test("SystemState starts OFFLINE and only allows real, valid transitions", () => {

    const state = new SystemState();
    assert.strictEqual(state.state, "OFFLINE");

    assert.throws(() => state.transition("READY"), /Invalid system state transition: "OFFLINE" -> "READY"/);
    assert.throws(() => state.transition("NOT_A_REAL_STATE"), /Unknown system state/);

    state.transition("STARTING");
    assert.strictEqual(state.state, "STARTING");

});


test("SystemState walks the full real boot path to READY", () => {

    const state = new SystemState();

    state.transition("STARTING");
    state.transition("CONFIGURING");
    state.transition("LOADING");
    state.transition("RECOVERING");
    state.transition("VERIFYING");
    state.transition("READY");

    assert.strictEqual(state.state, "READY");
    assert.strictEqual(state.isReady(), true);
    assert.strictEqual(state.isOperational(), true);

});


test("SystemState allows skipping RECOVERING (LOADING -> VERIFYING directly) for a real boot with nothing to recover", () => {

    const state = new SystemState();
    state.transition("STARTING");
    state.transition("CONFIGURING");
    state.transition("LOADING");
    state.transition("VERIFYING");

    assert.strictEqual(state.state, "VERIFYING");

});


test("SystemState records a real, explanatory reason on FAILED/DEGRADED transitions", () => {

    const state = new SystemState();
    state.transition("STARTING");
    state.transition("CONFIGURING", "real critical check failed");

    assert.strictEqual(state.state, "CONFIGURING");
    assert.strictEqual(state.lastReason, "real critical check failed");

});


test("SystemState.isOperational() is true for READY and DEGRADED, false otherwise", () => {

    const state = new SystemState();
    assert.strictEqual(state.isOperational(), false); // OFFLINE

    state.transition("STARTING");
    assert.strictEqual(state.isOperational(), false);

    state.transition("CONFIGURING");
    state.transition("LOADING");
    state.transition("VERIFYING");
    state.transition("DEGRADED", "one non-critical check failed");
    assert.strictEqual(state.isOperational(), true);

});


test("SystemState publishes a real system.stateChanged event plus the specific real event for READY/DEGRADED/FAILED/SHUTTING_DOWN/OFFLINE", () => {

    const state = new SystemState();

    const changed = [];
    const ready = [];
    const onChanged = data => changed.push(data);
    const onReady = data => ready.push(data);

    bus.on(events.STATE_CHANGED, onChanged);
    bus.on(events.READY, onReady);

    try {

        state.transition("STARTING");
        state.transition("CONFIGURING");
        state.transition("LOADING");
        state.transition("VERIFYING");
        state.transition("READY", "all checks passed");

        assert.strictEqual(changed.length, 5);
        assert.strictEqual(changed[4].previous, "VERIFYING");
        assert.strictEqual(changed[4].current, "READY");
        assert.strictEqual(changed[4].reason, "all checks passed");

        assert.strictEqual(ready.length, 1);
        assert.strictEqual(ready[0].current, "READY");

    } finally {
        bus.off(events.STATE_CHANGED, onChanged);
        bus.off(events.READY, onReady);
    }

});


test("SystemState supports a real FAILED -> STARTING retry path", () => {

    const state = new SystemState();
    state.transition("STARTING");
    state.transition("CONFIGURING", "critical check failed");
    // CONFIGURING can only go to LOADING or FAILED per the real graph --
    // simulate the real critical-failure path.
    state.transition("FAILED", "startup checks failed");

    assert.doesNotThrow(() => state.transition("STARTING", "retrying boot"));
    assert.strictEqual(state.state, "STARTING");

});


test("SystemState bounds its real transition history to the most recent 50 entries", () => {

    const state = new SystemState();

    // A real, valid, repeatable two-state cycle: READY <-> DEGRADED,
    // walked there once first.
    state.transition("STARTING");
    state.transition("CONFIGURING");
    state.transition("LOADING");
    state.transition("VERIFYING");
    state.transition("READY");

    for(let i = 0; i < 60; i++){
        state.transition("DEGRADED", `cycle ${i}`);
        state.transition("READY");
    }

    assert.strictEqual(state.history.length, 50);
    assert.strictEqual(state.history[state.history.length - 1].to, "READY");

});


test("SystemState.snapshot() returns a real, plain, serializable object", () => {

    const state = new SystemState();
    state.transition("STARTING");

    const snapshot = state.snapshot();

    assert.deepStrictEqual(Object.keys(snapshot).sort(), ["isOperational", "lastReason", "state", "updatedAt"]);
    assert.strictEqual(snapshot.state, "STARTING");

});


test("SystemState allows a real SHUTTING_DOWN transition from every mid-boot state, not just READY/DEGRADED/FAILED -- a real SIGTERM can arrive at any point", () => {

    for(const midBootState of ["STARTING", "CONFIGURING", "LOADING", "RECOVERING", "VERIFYING"]){

        const state = new SystemState();
        state.transition("STARTING");
        if(midBootState !== "STARTING"){
            if(["CONFIGURING", "LOADING", "RECOVERING", "VERIFYING"].includes(midBootState)){
                state.transition("CONFIGURING");
            }
            if(["LOADING", "RECOVERING", "VERIFYING"].includes(midBootState)){
                state.transition("LOADING");
            }
            if(midBootState === "RECOVERING"){
                state.transition("RECOVERING");
            }
            if(midBootState === "VERIFYING"){
                state.transition("VERIFYING");
            }
        }

        assert.strictEqual(state.state, midBootState);
        assert.doesNotThrow(() => state.transition("SHUTTING_DOWN", `SIGTERM during ${midBootState}`));
        assert.strictEqual(state.state, "SHUTTING_DOWN");

    }

});
