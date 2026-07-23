const test = require("node:test");
const assert = require("node:assert");

const bootSequence = require("../core/system/bootSequence");
const bus = require("../core/bus");

test.beforeEach(() => {
    bootSequence._resetForTests();
});


test("markStage() records real stages in order, and status() reflects real progress", () => {

    const initial = bootSequence.status();
    assert.strictEqual(initial.completed.length, 0);
    assert.strictEqual(initial.currentStage, "initializing");
    assert.strictEqual(initial.online, false);
    assert.strictEqual(initial.progressPercent, 0);

    bootSequence.markStage("initializing");
    bootSequence.markStage("loading_configuration");

    const partial = bootSequence.status();
    assert.strictEqual(partial.completed.length, 2);
    assert.strictEqual(partial.completed[0].stage, "initializing");
    assert.ok(partial.completed[0].completedAt);
    assert.strictEqual(partial.currentStage, "loading_memory");
    assert.strictEqual(partial.online, false);

});


test("markStage() is idempotent -- marking an already-completed stage again does not duplicate it", () => {

    bootSequence.markStage("initializing");
    bootSequence.markStage("initializing");

    assert.strictEqual(bootSequence.status().completed.length, 1);

});


test("markStage() rejects an unknown stage name", () => {
    assert.throws(() => bootSequence.markStage("not-a-real-stage"), /Unknown boot stage/);
});


test("status() reports online:true and 100% only once every real stage has completed", () => {

    for(const stage of bootSequence.STAGES){
        bootSequence.markStage(stage);
    }

    const final = bootSequence.status();
    assert.strictEqual(final.online, true);
    assert.strictEqual(final.progressPercent, 100);
    assert.strictEqual(final.currentStage, null);

});


test("markStage() publishes a real boot.stageCompleted bus event", () => {

    const captured = [];
    const listener = data => captured.push(data);

    bus.on("boot.stageCompleted", listener);

    try {
        bootSequence.markStage("initializing");
    } finally {
        bus.off("boot.stageCompleted", listener);
    }

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].stage, "initializing");

});
