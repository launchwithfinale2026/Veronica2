const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const shutdownManager = require("../core/system/shutdownManager");
const SystemState = require("../core/system/systemState");
const recoveryManager = require("../core/system/recoveryManager");

const SHUTDOWN_LOG_EXISTED_BEFORE = fs.existsSync(shutdownManager.SHUTDOWN_LOG_PATH);
const SHUTDOWN_LOG_BACKUP = path.join(os.tmpdir(), `veronica-shutdown-log-backup-${process.pid}.log`);

test.before(() => {
    if(SHUTDOWN_LOG_EXISTED_BEFORE){
        fs.copyFileSync(shutdownManager.SHUTDOWN_LOG_PATH, SHUTDOWN_LOG_BACKUP);
    }
});

test.beforeEach(() => {
    recoveryManager._resetForTests();
    shutdownManager._resetForTests();
});

test.after(() => {
    recoveryManager._resetForTests();
    shutdownManager._resetForTests();

    if(SHUTDOWN_LOG_EXISTED_BEFORE){
        fs.copyFileSync(SHUTDOWN_LOG_BACKUP, shutdownManager.SHUTDOWN_LOG_PATH);
        fs.unlinkSync(SHUTDOWN_LOG_BACKUP);
    } else if(fs.existsSync(shutdownManager.SHUTDOWN_LOG_PATH)){
        fs.unlinkSync(shutdownManager.SHUTDOWN_LOG_PATH);
    }
});


function readyState(){
    const state = new SystemState();
    state.transition("STARTING");
    state.transition("CONFIGURING");
    state.transition("LOADING");
    state.transition("VERIFYING");
    state.transition("READY");
    return state;
}


test("isAcceptingCommands() starts true, and stopAcceptingCommands() flips it for real", () => {

    assert.strictEqual(shutdownManager.isAcceptingCommands(), true);
    shutdownManager.stopAcceptingCommands();
    assert.strictEqual(shutdownManager.isAcceptingCommands(), false);

});


test("gracefulShutdown() requires a real SystemState instance", async () => {
    await assert.rejects(() => shutdownManager.gracefulShutdown({}), /requires a real SystemState instance/);
});


test("gracefulShutdown() walks the real requested sequence and ends at OFFLINE", async () => {

    const state = readyState();

    const fakeVoice = { status: () => ({ engineState: "IDLE" }) };
    const fakeAutomation = { status: () => ({ running: false }) };

    const result = await shutdownManager.gracefulShutdown({
        reason: "test shutdown",
        systemState: state,
        voice: fakeVoice,
        automation: fakeAutomation
    });

    assert.strictEqual(state.state, "OFFLINE");
    assert.strictEqual(shutdownManager.isAcceptingCommands(), false);
    assert.strictEqual(result.reason, "test shutdown");
    assert.ok(result.snapshot);
    assert.ok(result.shutdownRecord);
    assert.strictEqual(result.logResult.flushed, true);

});


test("gracefulShutdown() only calls voice.stop()/automation.stop() when they're really running -- never when already idle", async () => {

    const state = readyState();

    let voiceStopCalls = 0;
    let automationStopCalls = 0;

    const fakeVoice = { status: () => ({ engineState: "IDLE" }), stop: () => { voiceStopCalls += 1; } };
    const fakeAutomation = { status: () => ({ running: false }), stop: () => { automationStopCalls += 1; } };

    const result = await shutdownManager.gracefulShutdown({ systemState: state, voice: fakeVoice, automation: fakeAutomation });

    assert.strictEqual(voiceStopCalls, 0);
    assert.strictEqual(automationStopCalls, 0);
    assert.strictEqual(result.voiceStopped, false);
    assert.strictEqual(result.automationStopped, false);

});


test("gracefulShutdown() really calls voice.stop()/automation.stop() when they ARE running", async () => {

    const state = readyState();

    let voiceStopCalls = 0;
    let automationStopCalls = 0;

    const fakeVoice = { status: () => ({ engineState: "LISTENING" }), stop: () => { voiceStopCalls += 1; } };
    const fakeAutomation = { status: () => ({ running: true }), stop: () => { automationStopCalls += 1; } };

    const result = await shutdownManager.gracefulShutdown({ systemState: state, voice: fakeVoice, automation: fakeAutomation });

    assert.strictEqual(voiceStopCalls, 1);
    assert.strictEqual(automationStopCalls, 1);
    assert.strictEqual(result.voiceStopped, true);
    assert.strictEqual(result.automationStopped, true);

});


test("gracefulShutdown() closes a real, injected HTTP-server-shaped object", async () => {

    const state = readyState();

    let closeCalled = false;
    const fakeServer = {
        close(callback){
            closeCalled = true;
            callback();
        }
    };

    const result = await shutdownManager.gracefulShutdown({
        systemState: state,
        voice: { status: () => ({ engineState: "IDLE" }) },
        automation: { status: () => ({ running: false }) },
        httpServer: fakeServer
    });

    assert.strictEqual(closeCalled, true);
    assert.strictEqual(result.connectionsClosed, true);

});


test("gracefulShutdown() survives a real voice.stop()/automation.stop() failure without throwing", async () => {

    const state = readyState();

    const fakeVoice = { status: () => ({ engineState: "LISTENING" }), stop: () => { throw new Error("real voice stop failure"); } };
    const fakeAutomation = { status: () => ({ running: false }) };

    await assert.doesNotReject(() => shutdownManager.gracefulShutdown({ systemState: state, voice: fakeVoice, automation: fakeAutomation }));
    assert.strictEqual(state.state, "OFFLINE");

});


test("gracefulShutdown() records real activeTasks/failures passed in, in the real shutdown record", async () => {

    const state = readyState();

    const result = await shutdownManager.gracefulShutdown({
        systemState: state,
        voice: { status: () => ({ engineState: "IDLE" }) },
        automation: { status: () => ({ running: false }) },
        activeTasks: [{ id: "1", job: "consolidate" }],
        failures: [{ component: "voice", error: "mic unavailable" }]
    });

    assert.strictEqual(result.shutdownRecord.activeTasks.length, 1);
    assert.strictEqual(result.shutdownRecord.failures.length, 1);

});


test("gracefulShutdown() appends a real, human-readable line to runtime/logs/shutdown.log (Phase 46.5)", async () => {

    const before = fs.existsSync(shutdownManager.SHUTDOWN_LOG_PATH) ? fs.readFileSync(shutdownManager.SHUTDOWN_LOG_PATH, "utf8") : "";

    const state = readyState();

    await shutdownManager.gracefulShutdown({
        reason: "XQZ46.5 test shutdown",
        systemState: state,
        voice: { status: () => ({ engineState: "IDLE" }) },
        automation: { status: () => ({ running: false }) }
    });

    const after = fs.readFileSync(shutdownManager.SHUTDOWN_LOG_PATH, "utf8");

    assert.ok(after.length > before.length);
    assert.ok(after.includes("XQZ46.5 test shutdown"));

});
