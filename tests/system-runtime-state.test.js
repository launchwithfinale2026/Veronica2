const test = require("node:test");
const assert = require("node:assert");

const runtimeState = require("../core/system/runtimeState");
const bus = require("../core/bus");

test.beforeEach(() => {
    runtimeState._resetForTests();
});


test("register()/setState() reject an invalid state name", () => {
    assert.throws(() => runtimeState.register("xqzrt1", "not-a-real-state"), /Invalid runtime state/);
    assert.throws(() => runtimeState.setState("xqzrt1", "not-a-real-state"), /Invalid runtime state/);
});


test("register() defaults to \"starting\", and setState() transitions to a real state with a real reason", () => {

    const registered = runtimeState.register("xqzrt2-component");
    assert.strictEqual(registered.state, "starting");
    assert.strictEqual(registered.reason, null);

    const online = runtimeState.setState("xqzrt2-component", "online");
    assert.strictEqual(online.state, "online");

    const errored = runtimeState.setState("xqzrt2-component", "error", "simulated failure XQZRT2");
    assert.strictEqual(errored.state, "error");
    assert.strictEqual(errored.reason, "simulated failure XQZRT2");

});


test("getState() throws for an unregistered component, and all() lists every real registered one", () => {

    assert.throws(() => runtimeState.getState("xqzrt3-unregistered"), /Unknown runtime component/);

    runtimeState.register("xqzrt3-a");
    runtimeState.register("xqzrt3-b", "online");

    const all = runtimeState.all();
    assert.ok(all.some(c => c.name === "xqzrt3-a" && c.state === "starting"));
    assert.ok(all.some(c => c.name === "xqzrt3-b" && c.state === "online"));

});


test("history() records every real transition in order, bounded to the most recent entries", () => {

    runtimeState.register("xqzrt4-component");
    runtimeState.setState("xqzrt4-component", "online");
    runtimeState.setState("xqzrt4-component", "restarting", "real crash recovery XQZRT4");
    runtimeState.setState("xqzrt4-component", "online");

    const history = runtimeState.history("xqzrt4-component");

    assert.strictEqual(history.length, 4);
    assert.strictEqual(history[0].to, "starting");
    assert.strictEqual(history[2].to, "restarting");
    assert.strictEqual(history[2].reason, "real crash recovery XQZRT4");
    assert.strictEqual(history[2].from, "online");

});


test("setState() publishes a real runtime.stateChanged bus event with the real previous state", () => {

    runtimeState.register("xqzrt5-component", "starting");

    const captured = [];
    const listener = data => captured.push(data);

    bus.on("runtime.stateChanged", listener);

    try {
        runtimeState.setState("xqzrt5-component", "online");
    } finally {
        bus.off("runtime.stateChanged", listener);
    }

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].name, "xqzrt5-component");
    assert.strictEqual(captured[0].state, "online");
    assert.strictEqual(captured[0].previousState, "starting");

});
