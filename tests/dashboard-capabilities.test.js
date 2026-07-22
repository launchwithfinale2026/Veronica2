const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-dash-${process.pid}.json`);

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-dashcap-${process.pid}.json`);

const AUTOMATION_STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const AUTOMATION_STATE_EXISTED_BEFORE = fs.existsSync(AUTOMATION_STATE_PATH);
const AUTOMATION_STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-dashcap-${process.pid}.json`);

if(AUTOMATION_STATE_EXISTED_BEFORE){
    fs.copyFileSync(AUTOMATION_STATE_PATH, AUTOMATION_STATE_BACKUP);
}

test.before(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(async () => {

    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));

    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }

    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);

    if(AUTOMATION_STATE_EXISTED_BEFORE){
        fs.copyFileSync(AUTOMATION_STATE_BACKUP, AUTOMATION_STATE_PATH);
        fs.unlinkSync(AUTOMATION_STATE_BACKUP);
    } else if(fs.existsSync(AUTOMATION_STATE_PATH)){
        fs.unlinkSync(AUTOMATION_STATE_PATH);
    }

    delete process.env.API_TOKEN;

});

const registry = require("../core/capabilities/registry");
const { createServer } = require("../dashboard/backend/server");

let server;
let baseUrl;

test.before(async () => {
    server = createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});


test("GET /api/capabilities lists real built-in capabilities", async () => {

    const res = await fetch(`${baseUrl}/api/capabilities`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(body.some(c => c.name === "memory" && c.core === true));

});


test("POST /api/capabilities/analyze reports a capability gap analysis without requiring auth", async () => {

    const res = await fetch(`${baseUrl}/api/capabilities/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: "create a trading division" })
    });
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.domain, "trading");
    assert.ok(body.missingCapabilities.length > 0);

});


test("POST /api/capabilities/install requires API_TOKEN, and installs the real example package once authorized", async () => {

    if(registry.isInstalled("example")){
        registry.remove("example");
    }

    const examplePackageDir = path.join(__dirname, "..", "packages", "example");

    const unauthorized = await fetch(`${baseUrl}/api/capabilities/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageDir: examplePackageDir })
    });
    assert.strictEqual(unauthorized.status, 501);

    process.env.API_TOKEN = "test-token-xqzdashcap1";

    const res = await fetch(`${baseUrl}/api/capabilities/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-xqzdashcap1" },
        body: JSON.stringify({ packageDir: examplePackageDir })
    });
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.pending, false);
    assert.strictEqual(body.capability.name, "example");
    assert.strictEqual(body.capability.status, "active");

});
