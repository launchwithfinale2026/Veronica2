const test = require("node:test");
const assert = require("node:assert");

const bootManager = require("../core/system/bootManager");
const SystemState = require("../core/system/systemState");
const ServiceRegistry = require("../core/system/serviceRegistry");
const recoveryManager = require("../core/system/recoveryManager");

test.beforeEach(() => {
    recoveryManager._resetForTests();
});

test.after(() => {
    recoveryManager._resetForTests();
});


function fakeStartupChecks(passed = true){
    return {
        runAll: () => passed
            ? { passed: true, critical: false, checks: [], failures: [] }
            : { passed: false, critical: true, checks: [], failures: [{ name: "nodeVersion", ok: false, critical: true, detail: "too old" }] }
    };
}

function fakeHealthManager(overall = "healthy"){
    return {
        runAll: async () => ({ overall, checks: [], timestamp: new Date().toISOString() })
    };
}

const fakeVoiceModule = { status: () => ({ enabled: false, wakeWord: {}, speechToText: {}, textToSpeech: {} }) };
const fakeAutomation = { status: () => ({ queue: [], running: false }) };
const fakeLoadAgents = () => ([{ name: "TESTAGENT" }]);


test("boot() requires real SystemState and ServiceRegistry instances", async () => {

    await assert.rejects(() => bootManager.boot({}), /requires real SystemState and ServiceRegistry/);

});


test("boot() walks the full real state sequence to READY when every real check is healthy", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    const result = await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("healthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    assert.strictEqual(result.booted, true);
    assert.strictEqual(result.state, "READY");
    assert.strictEqual(systemState.state, "READY");

    assert.deepStrictEqual(
        systemState.history.map(h => h.to),
        ["STARTING", "CONFIGURING", "LOADING", "RECOVERING", "VERIFYING", "READY"]
    );

});


test("boot() halts at FAILED and never proceeds to LOADING when a real critical startup check fails", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    const result = await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(false),
        healthManager: fakeHealthManager("healthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    assert.strictEqual(result.booted, false);
    assert.strictEqual(result.state, "FAILED");
    assert.strictEqual(systemState.state, "FAILED");
    assert.strictEqual(serviceRegistry.getAllServices().length, 0, "no services should be registered once boot halted before LOADING");

});


test("boot() lands on DEGRADED (not READY) when the real health report comes back degraded", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    const result = await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("degraded"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    assert.strictEqual(result.booted, true);
    assert.strictEqual(result.state, "DEGRADED");

});


test("boot() lands on FAILED when the real health report comes back unhealthy", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    const result = await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("unhealthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    assert.strictEqual(result.booted, false);
    assert.strictEqual(result.state, "FAILED");

});


test("boot() registers every real subsystem it loads into the given ServiceRegistry", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("healthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    const names = serviceRegistry.getAllServices().map(s => s.name).sort();
    assert.deepStrictEqual(names, ["agents", "dashboard", "eventBus", "logging", "router", "voice"]);

    assert.strictEqual(serviceRegistry.getStatus("voice").status, "DISABLED");
    assert.strictEqual(serviceRegistry.getStatus("agents").status, "READY");

});


test("boot() marks the \"agents\" service FAILED when the real agent loader returns nothing", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("healthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: () => []
    });

    assert.strictEqual(serviceRegistry.getStatus("agents").status, "FAILED");

});


test("boot() runs real recovery and surfaces it in the result", async () => {

    const systemState = new SystemState();
    const serviceRegistry = new ServiceRegistry();

    recoveryManager.saveSnapshot({ state: "READY" }, { note: "previous real run" });

    const result = await bootManager.boot({
        systemState,
        serviceRegistry,
        startupChecks: fakeStartupChecks(true),
        healthManager: fakeHealthManager("healthy"),
        voice: fakeVoiceModule,
        automation: fakeAutomation,
        loadAgentsFn: fakeLoadAgents
    });

    assert.strictEqual(result.recovery.recovered, true);
    assert.strictEqual(result.recovery.previousState.note, "previous real run");

});
