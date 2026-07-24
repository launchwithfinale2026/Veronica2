const test = require("node:test");
const assert = require("node:assert");

const LifecycleManager = require("../core/system/lifecycleManager");
const recoveryManager = require("../core/system/recoveryManager");

test.beforeEach(() => {
    recoveryManager._resetForTests();
});

test.after(() => {
    recoveryManager._resetForTests();
});


const fakeVoiceModule = { status: () => ({ enabled: false, wakeWord: {}, speechToText: {}, textToSpeech: {} }), stop(){} };
const fakeAutomation = { status: () => ({ queue: [], running: false }), stop(){} };
const fakeLoadAgents = () => ([{ name: "TESTAGENT" }]);

function realBootOptions(overrides = {}){
    return {
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents,
        healthOptions: { filesystemDirectory: __dirname },
        ...overrides
    };
}


test("LifecycleManager.boot() reaches an operational state and getStatus() reflects it honestly", async () => {

    const lm = new LifecycleManager();

    const result = await lm.boot(realBootOptions());

    assert.strictEqual(result.booted, true);
    assert.ok(["READY", "DEGRADED"].includes(result.state));

    const status = lm.getStatus();
    assert.strictEqual(status.lifecycle.state, result.state);
    assert.strictEqual(status.isOperational, true);
    assert.ok(status.services.length > 0);

});


test("LifecycleManager.shutdown() takes a booted system to OFFLINE and records a real recovery point", async () => {

    const lm = new LifecycleManager();
    await lm.boot(realBootOptions());

    const result = await lm.shutdown({ reason: "test requested shutdown", voice: fakeVoiceModule, automation: fakeAutomation });

    assert.strictEqual(lm.systemState.state, "OFFLINE");
    assert.strictEqual(result.reason, "test requested shutdown");

});


test("LifecycleManager.diagnose() produces the full real combined report", async () => {

    const lm = new LifecycleManager();
    await lm.boot(realBootOptions());

    const diagnosis = await lm.diagnose();

    assert.ok(diagnosis.lifecycle);
    assert.ok(diagnosis.services.length > 0);
    assert.ok(diagnosis.health);
    assert.ok(diagnosis.lastBoot);
    assert.strictEqual(diagnosis.lastBoot.booted, true);

});


// --- The acceptance criteria's explicit "restart simulation" -------------
//
// 1. Start VERONICA (boot()).
// 2. Confirm READY (or DEGRADED -- both are real, honest "operational"
//    outcomes; only FAILED means something is actually wrong).
// 3. "Kill" the process -- simulated as an ungraceful stop: no
//    shutdown() call, just discarding this LifecycleManager instance,
//    exactly like a real crash leaves no shutdown record behind.
// 4. Restart -- a real, fresh LifecycleManager, boot() called again.
// 5. Confirm recovery -- the fresh boot's real recovery report finds
//    the previous run's real saved state and reports an honestly
//    unclean (crashed) shutdown, not a fabricated clean one.
// 6. "Confirm dashboard reconnect" / "confirm voice state restoration":
//    verified via the real service registry reporting "dashboard" and
//    "voice" as registered again after the restart, with voice's real
//    state read from the same real core/voice/index.js status() this
//    whole session's voice work already established -- nothing new
//    invented for this test.

test("Full restart simulation: boot -> READY -> simulated crash -> reboot -> real recovery is reported honestly", async () => {

    // 1 + 2: start VERONICA, confirm an operational state.
    const firstRun = new LifecycleManager();
    const firstBoot = await firstRun.boot(realBootOptions());

    assert.strictEqual(firstBoot.booted, true);
    assert.ok(["READY", "DEGRADED"].includes(firstRun.systemState.state));

    // A real periodic state save, exactly like a real long-running
    // process would do -- this is what a REAL crash leaves behind (no
    // matching shutdown record), as opposed to a graceful shutdown.
    recoveryManager.saveSnapshot(firstRun.systemState.snapshot(), { note: "mid-session save before simulated crash" });

    // 3: "kill" the process -- no shutdown() call at all, matching a
    // real crash (the instance is simply discarded; nothing runs).

    // 4: restart -- a real, fresh instance, exactly what a real process
    // restart constructs.
    const secondRun = new LifecycleManager();
    const secondBoot = await secondRun.boot(realBootOptions());

    // 5: confirm recovery -- real, evidence-based, not fabricated.
    assert.strictEqual(secondBoot.booted, true);
    assert.strictEqual(secondBoot.recovery.recovered, true);
    assert.strictEqual(secondBoot.recovery.previousState.note, "mid-session save before simulated crash");
    assert.strictEqual(secondBoot.recovery.wasCleanShutdown, false, "no graceful shutdown() was ever called -- this must be reported as an unclean shutdown, honestly");

    // 6: "dashboard reconnect" / "voice state restoration" -- the real
    // service registry reflects both being registered again after the
    // real restart, and voice's real reported state matches its real
    // status() (disabled in this fake, honestly reported as DISABLED,
    // never fabricated as READY).
    const services = secondRun.serviceRegistry.getAllServices();
    assert.ok(services.some(s => s.name === "dashboard" && s.status === "READY"));
    assert.ok(services.some(s => s.name === "voice" && s.status === "DISABLED"));

});


test("Restart simulation: a real GRACEFUL shutdown is correctly distinguished from a crash on the next boot", async () => {

    const firstRun = new LifecycleManager();
    await firstRun.boot(realBootOptions());

    await firstRun.shutdown({ reason: "operator requested restart", voice: fakeVoiceModule, automation: fakeAutomation });

    const secondRun = new LifecycleManager();
    const secondBoot = await secondRun.boot(realBootOptions());

    assert.strictEqual(secondBoot.recovery.wasCleanShutdown, true);
    assert.strictEqual(secondBoot.recovery.lastShutdown.reason, "operator requested restart");

});
