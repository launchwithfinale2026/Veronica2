const test = require("node:test");
const assert = require("node:assert");

const healthScore = require("../core/system/healthScore");

function baseHealth(overrides = {}){
    return {
        cpu: { cores: 4, model: "Test CPU", loadAverage: { "1m": 1, "5m": 1, "15m": 1 }, loadPercent1m: 10, ...overrides.cpu },
        memory: { totalBytes: 1000, freeBytes: 900, usedBytes: 100, usedPercent: 10, ...overrides.memory },
        disk: { path: "/", totalBytes: 1000, freeBytes: 900, usedBytes: 100, usedPercent: 10, ...overrides.disk },
        services: overrides.services || [
            { name: "automation-engine", running: true },
            { name: "discord-bot", running: true, configured: true },
            { name: "dashboard-process", running: true, uptimeSeconds: 10 }
        ]
    };
}


test("score() returns 100/healthy for an all-clear real snapshot with no real problems", async () => {

    const result = await healthScore.score({
        health: baseHealth(),
        poorPerformers: { departments: [], tools: [] },
        broken: []
    });

    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.status, "healthy");
    assert.deepStrictEqual(result.breakdown, []);

});


test("score() deducts real points for high CPU/memory/disk, each with a traceable breakdown entry", async () => {

    const result = await healthScore.score({
        health: baseHealth({
            cpu: { loadPercent1m: 95 },
            memory: { usedPercent: 95 },
            disk: { usedPercent: 95 }
        }),
        poorPerformers: { departments: [], tools: [] },
        broken: []
    });

    assert.strictEqual(result.score, 100 - 15 - 15 - 15);
    assert.strictEqual(result.breakdown.length, 3);
    assert.ok(result.breakdown.some(b => b.category === "cpu"));
    assert.ok(result.breakdown.some(b => b.category === "memory"));
    assert.ok(result.breakdown.some(b => b.category === "disk"));

});


test("score() deducts for a real disk-read error without treating it as a usage spike", async () => {

    const result = await healthScore.score({
        health: baseHealth({ disk: { error: "simulated statfs failure XQZHS1", usedPercent: undefined } }),
        poorPerformers: { departments: [], tools: [] },
        broken: []
    });

    assert.strictEqual(result.score, 95);
    assert.strictEqual(result.breakdown[0].category, "disk");
    assert.match(result.breakdown[0].detail, /simulated statfs failure XQZHS1/);

});


test("score() deducts for a real service that is not running", async () => {

    const result = await healthScore.score({
        health: baseHealth({ services: [{ name: "automation-engine", running: false }] }),
        poorPerformers: { departments: [], tools: [] },
        broken: []
    });

    assert.strictEqual(result.score, 90);
    assert.strictEqual(result.breakdown[0].category, "service");
    assert.match(result.breakdown[0].detail, /"automation-engine" is not running/);

});


test("score() deducts for real poor-performing departments/tools and real broken capabilities, citing the exact real numbers", async () => {

    const result = await healthScore.score({
        health: baseHealth(),
        poorPerformers: {
            departments: [{ department: "xqzhs2-dept", total: 10, successRate: 40 }],
            tools: [{ tool: "xqzhs2.tool", total: 8, successRate: 30 }]
        },
        broken: [{ name: "xqzhs2-broken-capability" }]
    });

    assert.strictEqual(result.score, 100 - 10 - 5 - 10);
    assert.ok(result.breakdown.some(b => b.category === "department_performance" && b.detail.includes("xqzhs2-dept") && b.detail.includes("60%")));
    assert.ok(result.breakdown.some(b => b.category === "tool_performance" && b.detail.includes("xqzhs2.tool")));
    assert.ok(result.breakdown.some(b => b.category === "capability" && b.detail.includes("xqzhs2-broken-capability")));
    assert.deepStrictEqual(result.raw.brokenCapabilities, ["xqzhs2-broken-capability"]);

});


test("score() never goes below 0 even with many real simultaneous problems", async () => {

    const result = await healthScore.score({
        health: baseHealth({
            cpu: { loadPercent1m: 99 },
            memory: { usedPercent: 99 },
            disk: { usedPercent: 99 },
            services: [
                { name: "a", running: false },
                { name: "b", running: false },
                { name: "c", running: false },
                { name: "d", running: false },
                { name: "e", running: false }
            ]
        }),
        poorPerformers: {
            departments: [{ department: "d1", total: 10, successRate: 0 }, { department: "d2", total: 10, successRate: 0 }],
            tools: [{ tool: "t1", total: 10, successRate: 0 }]
        },
        broken: [{ name: "b1" }, { name: "b2" }]
    });

    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.status, "critical");

});


test("statusFor() maps real score ranges to the correct real status label", () => {

    assert.strictEqual(healthScore.statusFor(100), "healthy");
    assert.strictEqual(healthScore.statusFor(90), "healthy");
    assert.strictEqual(healthScore.statusFor(89), "fair");
    assert.strictEqual(healthScore.statusFor(70), "fair");
    assert.strictEqual(healthScore.statusFor(69), "degraded");
    assert.strictEqual(healthScore.statusFor(40), "degraded");
    assert.strictEqual(healthScore.statusFor(39), "critical");
    assert.strictEqual(healthScore.statusFor(0), "critical");

});


test("score() with no overrides runs the real, live pipeline end to end without throwing", async () => {

    const result = await healthScore.score();

    assert.ok(typeof result.score === "number");
    assert.ok(["healthy", "fair", "degraded", "critical"].includes(result.status));
    assert.ok(Array.isArray(result.breakdown));
    assert.ok(result.raw.connectors.total > 0);

});
