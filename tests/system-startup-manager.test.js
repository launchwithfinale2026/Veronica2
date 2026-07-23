const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { EventEmitter } = require("node:events");

const StartupManager = require("../core/system/startupManager");

// A minimal, event-emitter-shaped stand-in for Node's real ChildProcess
// -- never spawns a real process. Same "fake the dependency boundary"
// approach this suite already uses for http.request/discord.js's Client.
class FakeChild extends EventEmitter {
    constructor(pid){
        super();
        this.pid = pid;
        this.killed = false;
    }
    kill(){
        this.killed = true;
    }
}

function fakeSpawnFactory(){
    const children = [];
    const spawnFn = () => {
        const child = new FakeChild(1000 + children.length);
        children.push(child);
        return child;
    };
    return { spawnFn, children };
}


test("start() spawns the entry once, and status() reports the real pid", () => {

    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new StartupManager({ entry: "/fake/entry.js", spawnFn, healthCheckIntervalMs: 999999 });

    const result = manager.start();

    assert.strictEqual(result.started, true);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(result.pid, children[0].pid);
    assert.strictEqual(manager.status().running, true);

    manager.stop();

});


test("a crashed child is restarted with backoff, up to maxRestarts, then gives up", async () => {

    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new StartupManager({
        entry: "/fake/entry.js",
        spawnFn,
        maxRestarts: 2,
        backoffBaseMs: 5,
        backoffMaxMs: 20,
        healthCheckIntervalMs: 999999
    });

    manager.start();
    assert.strictEqual(children.length, 1);

    // First crash -> restart 1
    children[0].emit("exit", 1, null);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(children.length, 2);

    // Second crash -> restart 2 (hits maxRestarts)
    children[1].emit("exit", 1, null);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(children.length, 3);

    // Third crash -> restart limit reached, no further spawn
    children[2].emit("exit", 1, null);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(children.length, 3);

    manager.stop();

});


test("stop() prevents a restart after a deliberate stop, and kills the current child", () => {

    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new StartupManager({ entry: "/fake/entry.js", spawnFn, healthCheckIntervalMs: 999999 });

    manager.start();
    manager.stop();

    assert.strictEqual(children[0].killed, true);

    children[0].emit("exit", 0, null); // a real child would emit this on kill() too
    assert.strictEqual(children.length, 1); // no restart -- stopped

});


test("checkHealth() reports a real healthy status against a real ephemeral HTTP server, and a real failure when nothing is listening", async () => {

    const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ONLINE" }));
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {

        const manager = new StartupManager({ host: "127.0.0.1", port, healthCheckIntervalMs: 999999 });
        const healthy = await manager.checkHealth();

        assert.strictEqual(healthy.healthy, true);
        assert.strictEqual(healthy.statusCode, 200);

    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    // Nothing listening on this port -- a real ECONNREFUSED.
    const managerDown = new StartupManager({ host: "127.0.0.1", port: 1, healthCheckIntervalMs: 999999 });
    const unhealthy = await managerDown.checkHealth();

    assert.strictEqual(unhealthy.healthy, false);
    assert.ok(unhealthy.error);

});


test("runStartupDiagnostics() populates a real, unified health score onto status(), without ever throwing (Project B/F)", async () => {

    const { spawnFn } = fakeSpawnFactory();
    const manager = new StartupManager({ entry: "/fake/entry.js", spawnFn, healthCheckIntervalMs: 999999 });

    assert.strictEqual(manager.status().lastStartupDiagnostics, null);

    await manager.runStartupDiagnostics();

    const diagnostics = manager.status().lastStartupDiagnostics;

    assert.ok(diagnostics);
    assert.ok(typeof diagnostics.score === "number");
    assert.ok(["healthy", "fair", "degraded", "critical"].includes(diagnostics.status));
    assert.ok(Array.isArray(diagnostics.breakdown));

});


test("start() triggers startup diagnostics without blocking the actual spawn", () => {

    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new StartupManager({ entry: "/fake/entry.js", spawnFn, healthCheckIntervalMs: 999999 });

    const result = manager.start();

    // start() itself is synchronous and must return immediately -- the
    // real diagnostics call is a genuinely async CPU/RAM/disk read that
    // must never delay actually spawning the child process.
    assert.strictEqual(result.started, true);
    assert.strictEqual(children.length, 1);

    manager.stop();

});
