const test = require("node:test");
const assert = require("node:assert");

const health = require("../core/system/health");


test("cpuHealth() reports real core count and a real load-relative percentage", () => {

    const result = health.cpuHealth();

    assert.ok(result.cores > 0);
    assert.strictEqual(typeof result.loadAverage["1m"], "number");
    assert.strictEqual(typeof result.loadPercent1m, "number");

});


test("memoryHealth() reports real, internally-consistent totals", () => {

    const result = health.memoryHealth();

    assert.ok(result.totalBytes > 0);
    assert.ok(result.freeBytes >= 0);
    assert.strictEqual(result.usedBytes, result.totalBytes - result.freeBytes);
    assert.ok(result.usedPercent >= 0 && result.usedPercent <= 100);

});


test("diskHealth() reports real disk stats for a real path, and rejects for a nonexistent one", async () => {

    const result = await health.diskHealth("/");

    assert.ok(result.totalBytes > 0);
    assert.strictEqual(result.usedBytes, result.totalBytes - result.freeBytes);

    await assert.rejects(() => health.diskHealth("/no/such/path/xqzhealth1"));

});


test("runningServices() reports real status from VERONICA's own services, not fabricated values", () => {

    const fakeAutomation = { status: () => ({ running: true }) };
    const fakeDiscordBot = { status: () => ({ connected: false, configured: false }) };

    const services = health.runningServices({ automation: fakeAutomation, discordBot: fakeDiscordBot });

    assert.ok(services.find(s => s.name === "automation-engine").running === true);
    assert.ok(services.find(s => s.name === "discord-bot").running === false);
    assert.ok(services.find(s => s.name === "dashboard-process").uptimeSeconds >= 0);

});


test("generate() assembles a complete report even when disk stats fail, without throwing", async () => {

    const fakeAutomation = { status: () => ({ running: true }) };
    const fakeDiscordBot = { status: () => ({ connected: false, configured: false }) };

    const result = await health.generate({ diskPath: "/no/such/path/xqzhealth2", automation: fakeAutomation, discordBot: fakeDiscordBot });

    assert.ok(result.generatedAt);
    assert.ok(result.cpu);
    assert.ok(result.memory);
    assert.ok(result.disk.error); // real failure surfaced, not swallowed as fake success
    assert.strictEqual(result.services.length, 3);

});
