const test = require("node:test");
const assert = require("node:assert");

const ServiceRegistry = require("../core/system/serviceRegistry");
const events = require("../core/system/systemEvents");
const bus = require("../core/bus");


test("register() requires a real name and rejects a duplicate registration", () => {

    const registry = new ServiceRegistry();

    assert.throws(() => registry.register({}), /requires a real name/);

    registry.register({ name: "eventBus" });
    assert.throws(() => registry.register({ name: "eventBus" }), /already registered/);

});


test("register() stores the exact requested shape: name/version/status/startupTime/dependencies", () => {

    const registry = new ServiceRegistry();

    const entry = registry.register({ name: "voiceEngine", version: "1.0", status: "READY", dependencies: ["eventBus"] });

    assert.strictEqual(entry.name, "voiceEngine");
    assert.strictEqual(entry.version, "1.0");
    assert.strictEqual(entry.status, "READY");
    assert.deepStrictEqual(entry.dependencies, ["eventBus"]);
    assert.ok(entry.startupTime);

});


test("getStatus() returns the real registered entry, and throws for an unknown service", () => {

    const registry = new ServiceRegistry();
    registry.register({ name: "router", status: "READY" });

    assert.strictEqual(registry.getStatus("router").status, "READY");
    assert.throws(() => registry.getStatus("nope"), /Unknown service/);

});


test("updateStatus() changes a real, already-registered service's status and publishes a real event", () => {

    const registry = new ServiceRegistry();
    registry.register({ name: "voice", status: "STARTING" });

    const events_ = [];
    const listener = data => events_.push(data);
    bus.on(events.SERVICE_STATUS_CHANGED, listener);

    try {
        registry.updateStatus("voice", "READY", "startup validation passed");
    } finally {
        bus.off(events.SERVICE_STATUS_CHANGED, listener);
    }

    assert.strictEqual(registry.getStatus("voice").status, "READY");
    assert.strictEqual(events_.length, 1);
    assert.strictEqual(events_[0].previous, "STARTING");
    assert.strictEqual(events_[0].status, "READY");

    assert.throws(() => registry.updateStatus("nope", "READY"), /Unknown service/);

});


test("getAllServices() lists every real registered service, and unregister() removes one for real", () => {

    const registry = new ServiceRegistry();
    registry.register({ name: "a" });
    registry.register({ name: "b" });

    assert.strictEqual(registry.getAllServices().length, 2);

    const result = registry.unregister("a");
    assert.strictEqual(result.unregistered, true);
    assert.strictEqual(registry.getAllServices().length, 1);

    assert.strictEqual(registry.unregister("a").unregistered, false);

});


test("checkDependencies() reports real missing and real failed dependencies distinctly", () => {

    const registry = new ServiceRegistry();
    registry.register({ name: "eventBus", status: "READY" });
    registry.register({ name: "router", status: "READY", dependencies: ["eventBus", "missingThing"] });
    registry.register({ name: "brokenDep", status: "FAILED" });
    registry.register({ name: "dashboard", status: "READY", dependencies: ["brokenDep"] });

    const routerCheck = registry.checkDependencies("router");
    assert.strictEqual(routerCheck.satisfied, false);
    assert.deepStrictEqual(routerCheck.missing, ["missingThing"]);
    assert.deepStrictEqual(routerCheck.failed, []);

    const dashboardCheck = registry.checkDependencies("dashboard");
    assert.strictEqual(dashboardCheck.satisfied, false);
    assert.deepStrictEqual(dashboardCheck.failed, ["brokenDep"]);

    const eventBusCheck = registry.checkDependencies("eventBus");
    assert.strictEqual(eventBusCheck.satisfied, true);

});


test("isOperational() is honestly false for an empty registry, true only when nothing is FAILED", () => {

    const registry = new ServiceRegistry();
    assert.strictEqual(registry.isOperational(), false);

    registry.register({ name: "a", status: "READY" });
    assert.strictEqual(registry.isOperational(), true);

    registry.register({ name: "b", status: "FAILED" });
    assert.strictEqual(registry.isOperational(), false);

});


test("register() publishes a real system.serviceRegistered event", () => {

    const registry = new ServiceRegistry();

    const captured = [];
    const listener = data => captured.push(data);
    bus.on(events.SERVICE_REGISTERED, listener);

    try {
        registry.register({ name: "memory", status: "READY" });
    } finally {
        bus.off(events.SERVICE_REGISTERED, listener);
    }

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].name, "memory");

});
