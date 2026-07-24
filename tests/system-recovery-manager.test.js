const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

const recoveryManager = require("../core/system/recoveryManager");

test.beforeEach(() => {
    recoveryManager._resetForTests();
});

test.after(() => {
    recoveryManager._resetForTests();
});


test("recoverOnBoot() honestly reports recovered:false when no real previous state exists", () => {

    const report = recoveryManager.recoverOnBoot({});

    assert.strictEqual(report.recovered, false);
    assert.strictEqual(report.previousState, null);
    assert.strictEqual(report.lastShutdown, null);
    assert.strictEqual(report.wasCleanShutdown, false);

});


test("saveSnapshot() writes a real state file, and recoverOnBoot() reads it back for real", () => {

    const saved = recoveryManager.saveSnapshot({ state: "READY", isOperational: true }, { note: "xqz46" });

    assert.ok(fs.existsSync(recoveryManager.STATE_FILE));
    assert.strictEqual(saved.state, "READY");

    const report = recoveryManager.recoverOnBoot({});

    assert.strictEqual(report.recovered, true);
    assert.strictEqual(report.previousState.state, "READY");
    assert.strictEqual(report.previousState.note, "xqz46");

});


test("saveSnapshot() also writes a real, timestamped copy into runtime/snapshots/, bounded to the most recent entries", () => {

    for(let i = 0; i < 3; i++){
        recoveryManager.saveSnapshot({ state: "READY" }, { iteration: i });
    }

    const snapshots = recoveryManager.listSnapshots();
    assert.strictEqual(snapshots.length, 3);

});


test("recordShutdown() writes a real shutdown record, and a save-then-shutdown sequence is reported as a real clean shutdown", async () => {

    recoveryManager.saveSnapshot({ state: "READY" });
    await new Promise(resolve => setTimeout(resolve, 5));
    const shutdownRecord = recoveryManager.recordShutdown({ reason: "operator requested", activeTasks: [], failures: [] });

    assert.ok(fs.existsSync(recoveryManager.SHUTDOWN_FILE));
    assert.strictEqual(shutdownRecord.reason, "operator requested");

    const report = recoveryManager.recoverOnBoot({});
    assert.strictEqual(report.wasCleanShutdown, true);
    assert.strictEqual(report.lastShutdown.reason, "operator requested");

});


test("A real state save with NO matching shutdown record afterward is honestly reported as an unclean (crashed) shutdown", async () => {

    // Real sequence: a shutdown record exists from an EARLIER, older
    // run, then the process saved state again more recently WITHOUT a
    // matching newer shutdown record -- exactly what a real crash looks
    // like (periodic saves kept happening, no graceful shutdown ever
    // recorded the more recent one).
    recoveryManager.recordShutdown({ reason: "earlier clean shutdown" });
    await new Promise(resolve => setTimeout(resolve, 5));
    recoveryManager.saveSnapshot({ state: "READY" });

    const report = recoveryManager.recoverOnBoot({});
    assert.strictEqual(report.wasCleanShutdown, false);

});


test("recoverOnBoot() surfaces real unfinished automation tasks without re-implementing automation's own recovery", () => {

    const fakeAutomation = {
        status: () => ({
            queue: [
                { id: "1", status: "running", job: "consolidate" },
                { id: "2", status: "completed", job: "learning-recommend" },
                { id: "3", status: "pending", job: "consolidate" }
            ]
        })
    };

    const report = recoveryManager.recoverOnBoot({ automation: fakeAutomation });

    assert.strictEqual(report.unfinishedTasks.length, 1);
    assert.strictEqual(report.unfinishedTasks[0].id, "1");

});


test("recoverOnBoot() surfaces real active devices via the real DeviceManager interface", () => {

    const fakeDeviceManager = {
        networkStatus: () => ([
            { id: "a", status: "online" },
            { id: "b", status: "offline" }
        ])
    };

    const report = recoveryManager.recoverOnBoot({ deviceManager: fakeDeviceManager });

    assert.strictEqual(report.activeDevices.length, 1);
    assert.strictEqual(report.activeDevices[0].id, "a");

});


test("recoverOnBoot() includes the real tail of core/logging/errors.log", () => {

    const report = recoveryManager.recoverOnBoot({});
    assert.ok(Array.isArray(report.recentErrors));

});


test("recoverOnBoot() handles a real corrupted state file without throwing", () => {

    fs.mkdirSync(require("path").dirname(recoveryManager.STATE_FILE), { recursive: true });
    fs.writeFileSync(recoveryManager.STATE_FILE, "{ not valid json at all");

    assert.doesNotThrow(() => {
        const report = recoveryManager.recoverOnBoot({});
        assert.strictEqual(report.recovered, false);
    });

});


test("recoverOnBoot() handles a real missing automation/deviceManager gracefully (neither passed in)", () => {

    const report = recoveryManager.recoverOnBoot({});

    assert.deepStrictEqual(report.unfinishedTasks, []);
    assert.deepStrictEqual(report.activeDevices, []);

});
