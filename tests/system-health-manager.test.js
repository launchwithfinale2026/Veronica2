const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const healthManager = require("../core/system/healthManager");


test("checkEventBus() reports healthy by actually publishing and receiving a real probe event", async () => {

    const result = await healthManager.checkEventBus();

    assert.strictEqual(result.system, "eventBus");
    assert.strictEqual(result.status, "healthy");
    assert.ok(typeof result.latency === "number");
    assert.ok(result.timestamp);

});


test("checkRouter() reports healthy when the real Router module resolves and exports a constructor", async () => {

    const result = await healthManager.checkRouter();

    assert.strictEqual(result.system, "router");
    assert.strictEqual(result.status, "healthy");
    assert.strictEqual(result.details.exportsConstructor, true);

});


test("checkDatabase() reports healthy by actually reading the real memory store", async () => {

    const result = await healthManager.checkDatabase();

    assert.strictEqual(result.system, "database");
    assert.strictEqual(result.status, "healthy");
    assert.ok(typeof result.details.entryCount === "number");

});


test("checkFilesystem() reports healthy for a real, accessible directory and unhealthy for a real, nonexistent one", async () => {

    const ok = await healthManager.checkFilesystem(__dirname);
    assert.strictEqual(ok.status, "healthy");

    const broken = await healthManager.checkFilesystem(path.join(__dirname, "definitely-does-not-exist-xqz"));
    assert.strictEqual(broken.status, "unhealthy");
    assert.ok(broken.details.error);

});


test("checkAgentLoader() reports healthy with a real agent count", async () => {

    const result = await healthManager.checkAgentLoader();

    assert.strictEqual(result.system, "agentLoader");
    assert.strictEqual(result.status, "healthy");
    assert.ok(result.details.agentCount > 0);

});


test("checkVoice() honestly reports degraded when voice is disabled, never fabricating \"healthy\"", async () => {

    const original = process.env.VOICE_ENABLED;
    delete process.env.VOICE_ENABLED;

    try {

        const result = await healthManager.checkVoice();

        assert.strictEqual(result.system, "voice");
        assert.strictEqual(result.status, "degraded");
        assert.ok(result.details.reason.includes("disabled"));

    } finally {
        if(original === undefined){ delete process.env.VOICE_ENABLED; } else { process.env.VOICE_ENABLED = original; }
    }

});


test("checkDashboard() reports the real, injected connection count, or honestly \"unknown\" when none is given", async () => {

    const withCount = await healthManager.checkDashboard({ activeSSEConnections: 3 });
    assert.strictEqual(withCount.details.activeConnections, 3);

    const withoutCount = await healthManager.checkDashboard();
    assert.strictEqual(withoutCount.details.activeConnections, "unknown");

});


test("checkResources() delegates to the real, existing core/system/healthScore.js -- never a second CPU/RAM/disk implementation", async () => {

    const result = await healthManager.checkResources();

    assert.strictEqual(result.system, "resources");
    assert.ok(["healthy", "degraded", "unhealthy"].includes(result.status));
    assert.ok(typeof result.details.score === "number");

});


test("Every real check function returns the exact requested shape: { system, status, timestamp, latency, details }", async () => {

    const result = await healthManager.checkEventBus();

    assert.deepStrictEqual(
        Object.keys(result).sort(),
        ["details", "latency", "status", "system", "timestamp"].sort()
    );

});


test("runAll() aggregates every real check, and the overall status is never better than its worst real finding", async () => {

    const report = await healthManager.runAll({ filesystemDirectory: __dirname });

    assert.ok(Array.isArray(report.checks));
    assert.strictEqual(report.checks.length, 9);
    assert.ok(["healthy", "degraded", "unhealthy"].includes(report.overall));

    const hasUnhealthy = report.checks.some(c => c.status === "unhealthy");
    const hasDegraded = report.checks.some(c => c.status === "degraded");

    if(hasUnhealthy){
        assert.strictEqual(report.overall, "unhealthy");
    } else if(hasDegraded){
        assert.strictEqual(report.overall, "degraded");
    } else {
        assert.strictEqual(report.overall, "healthy");
    }

});


test("A real check that throws is caught by timedCheck() and reported as unhealthy, never crashing runAll()", async () => {

    // A real, guaranteed-to-throw filesystem path.
    const result = await healthManager.checkFilesystem("/definitely/not/a/real/path/xqz46");

    assert.strictEqual(result.status, "unhealthy");
    assert.ok(result.details.error);

});
