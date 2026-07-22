const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Touches the same shared real files as other test files (database.json,
// graph.json, device.local.json) -- relies on --test-concurrency=1 (see
// package.json) plus its own backup/restore, same pattern as
// tests/memory-store.test.js / tests/knowledge.test.js / tests/device.test.js.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-sync-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-sync-${process.pid}.json`);

const DEVICE_PATH = path.join(__dirname, "..", "core", "device", "device.local.json");
const DEVICE_EXISTED_BEFORE = fs.existsSync(DEVICE_PATH);
const DEVICE_BACKUP = path.join(os.tmpdir(), `veronica-device-backup-sync-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(DEVICE_EXISTED_BEFORE){
        fs.copyFileSync(DEVICE_PATH, DEVICE_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(DEVICE_EXISTED_BEFORE){
        fs.copyFileSync(DEVICE_BACKUP, DEVICE_PATH);
        fs.unlinkSync(DEVICE_BACKUP);
    } else if(fs.existsSync(DEVICE_PATH)){
        fs.unlinkSync(DEVICE_PATH);
    }
    delete process.env.API_TOKEN;
});

const store = require("../core/memory/store");
const knowledge = require("../core/knowledge");


// --- merge() unit tests -----------------------------------------------

test("store.merge() inserts entries with unknown ids", () => {

    const before = store.recall().length;

    const result = store.merge([{
        id: "sync-test-new-id-1",
        type: "general",
        content: "merged-in entry ABCDEF",
        importance: 3,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        relationships: [],
        tags: [],
        source: "test"
    }]);

    assert.strictEqual(result.added, 1);
    assert.strictEqual(store.recall().length, before + 1);
    assert.ok(store.recall().some(m => m.content.includes("ABCDEF")));

});

test("store.merge() keeps the local entry when the incoming one is older", () => {

    const local = store.remember({ content: "local-wins entry GHIJKL" });

    const olderRemote = {
        ...local,
        content: "should NOT overwrite GHIJKL",
        updated: new Date(Date.parse(local.updated) - 60000).toISOString()
    };

    const result = store.merge([olderRemote]);

    assert.strictEqual(result.updated, 0);

    const stillLocal = store.recall().find(m => m.id === local.id);
    assert.strictEqual(stillLocal.content, "local-wins entry GHIJKL");

});

test("store.merge() overwrites the local entry when the incoming one is newer", () => {

    const local = store.remember({ content: "remote-wins entry MNOPQR" });

    const newerRemote = {
        ...local,
        content: "overwritten by newer remote MNOPQR",
        updated: new Date(Date.parse(local.updated) + 60000).toISOString()
    };

    const result = store.merge([newerRemote]);

    assert.strictEqual(result.updated, 1);

    const nowRemote = store.recall().find(m => m.id === local.id);
    assert.strictEqual(nowRemote.content, "overwritten by newer remote MNOPQR");

});

test("knowledge.merge() adds new entities/relationships and dedupes existing ones by name", () => {

    knowledge.addEntity({ name: "PreExisting_SYNCXYZ", type: "concept" });

    const before = knowledge.read();

    const result = knowledge.merge({
        entities: [
            { name: "PreExisting_SYNCXYZ", type: "concept" }, // duplicate, should not add
            { name: "BrandNew_SYNCXYZ", type: "concept" }
        ],
        relationships: [
            { from: "PreExisting_SYNCXYZ", to: "BrandNew_SYNCXYZ", type: "relatesTo" }
        ]
    });

    assert.strictEqual(result.entitiesAdded, 1);
    assert.strictEqual(result.relationshipsAdded, 1);

    const after = knowledge.read();
    assert.strictEqual(after.entities.length, before.entities.length + 1);

});


// --- HTTP sync endpoint tests -------------------------------------------

// require("../dashboard/backend/server") pulls in core/automation, whose
// module load registers/schedules the built-in jobs -- schedule()
// persists to core/automation/state.json unconditionally (see
// docs/Architecture.md "Automation Engine"), so simply requiring the
// server module writes real state to disk. Must snapshot "existed before"
// ahead of the require below, not after (same fix as tests/dashboard.test.js).
const AUTOMATION_STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const AUTOMATION_STATE_EXISTED_BEFORE = fs.existsSync(AUTOMATION_STATE_PATH);
const AUTOMATION_STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-sync-${process.pid}.json`);

if(AUTOMATION_STATE_EXISTED_BEFORE){
    fs.copyFileSync(AUTOMATION_STATE_PATH, AUTOMATION_STATE_BACKUP);
}

const { createServer } = require("../dashboard/backend/server");

let server;
let baseUrl;

test.before(async () => {

    server = createServer();

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    baseUrl = `http://127.0.0.1:${server.address().port}`;

});

test.after(async () => {

    await new Promise(resolve => server.close(resolve));

    if(AUTOMATION_STATE_EXISTED_BEFORE){
        fs.copyFileSync(AUTOMATION_STATE_BACKUP, AUTOMATION_STATE_PATH);
        fs.unlinkSync(AUTOMATION_STATE_BACKUP);
    } else if(fs.existsSync(AUTOMATION_STATE_PATH)){
        fs.unlinkSync(AUTOMATION_STATE_PATH);
    }

});

test("GET /api/sync/export is disabled (501) when API_TOKEN is unset", async () => {

    delete process.env.API_TOKEN;

    const res = await fetch(`${baseUrl}/api/sync/export`);

    assert.strictEqual(res.status, 501);

});

test("sync endpoints require the correct bearer token once API_TOKEN is set", async () => {

    process.env.API_TOKEN = "test-sync-secret";

    const noAuth = await fetch(`${baseUrl}/api/sync/export`);
    assert.strictEqual(noAuth.status, 403);

    const wrongAuth = await fetch(`${baseUrl}/api/sync/export`, {
        headers: { Authorization: "Bearer wrong-token" }
    });
    assert.strictEqual(wrongAuth.status, 403);

    const correctAuth = await fetch(`${baseUrl}/api/sync/export`, {
        headers: { Authorization: "Bearer test-sync-secret" }
    });
    assert.strictEqual(correctAuth.status, 200);

    const body = await correctAuth.json();
    assert.ok(body.device && body.device.id);
    assert.ok(Array.isArray(body.memory));
    assert.ok(Array.isArray(body.knowledge.entities));

});

test("POST /api/sync/import merges a hand-crafted remote package", async () => {

    process.env.API_TOKEN = "test-sync-secret";

    const remotePackage = {
        device: { id: "remote-device-id", name: "test-remote", role: "phone" },
        exportedAt: new Date().toISOString(),
        memory: [{
            id: "sync-http-test-id-1",
            type: "general",
            content: "imported over HTTP STUVWX",
            importance: 3,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            relationships: [],
            tags: [],
            source: "remote-device"
        }],
        knowledge: {
            entities: [{ name: "ImportedEntity_STUVWX", type: "concept" }],
            relationships: []
        }
    };

    const res = await fetch(`${baseUrl}/api/sync/import`, {
        method: "POST",
        headers: {
            Authorization: "Bearer test-sync-secret",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(remotePackage)
    });

    assert.strictEqual(res.status, 200);

    const result = await res.json();
    assert.strictEqual(result.memory.added, 1);
    assert.strictEqual(result.knowledge.entitiesAdded, 1);

    assert.ok(store.recall().some(m => m.content.includes("STUVWX")));
    assert.ok(knowledge.find("ImportedEntity_STUVWX").length === 1);

});
