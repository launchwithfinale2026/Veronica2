const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createServer } = require("../dashboard/backend/server");

// POST /api/memory writes to the same shared, real database.json other
// test files back up/restore -- relies on --test-concurrency=1 plus its
// own backup/restore here.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-dashboard-${process.pid}.json`);

let server;
let baseUrl;

test.before(async () => {

    fs.copyFileSync(DB_PATH, DB_BACKUP);

    server = createServer();

    await new Promise(resolve => {
        server.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

});

test.after(async () => {

    await new Promise(resolve => server.close(resolve));

    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);

    delete process.env.API_TOKEN;

});


test("GET /api/status reports online with real agent/department counts", async () => {

    const res = await fetch(`${baseUrl}/api/status`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.status, "ONLINE");
    assert.strictEqual(body.agents, 9);
    assert.strictEqual(body.departments, 9);
    assert.ok(typeof body.uptimeSeconds === "number");

});

test("GET /api/agents returns the real 9-agent roster", async () => {

    const res = await fetch(`${baseUrl}/api/agents`);
    const body = await res.json();

    assert.strictEqual(body.length, 9);
    assert.ok(body.some(a => a.name === "METIS"));

});

test("GET /api/departments returns statusReport() shaped entries", async () => {

    const res = await fetch(`${baseUrl}/api/departments`);
    const body = await res.json();

    assert.strictEqual(body.length, 9);
    assert.ok(body.every(d => d.id && d.status && Array.isArray(d.agents)));

});

test("GET /api/knowledge returns the real graph", async () => {

    const res = await fetch(`${baseUrl}/api/knowledge`);
    const body = await res.json();

    assert.ok(Array.isArray(body.entities));
    assert.ok(body.entities.some(e => e.name === "VERONICA"));

});

test("GET /api/tools returns the real registered tools", async () => {

    const res = await fetch(`${baseUrl}/api/tools`);
    const body = await res.json();

    const ids = body.map(t => t.id).sort();
    assert.ok(ids.includes("memory.remember"));
    assert.ok(ids.includes("filesystem.readFile"));

});

test("GET /api/memory without a filter returns the real stored memories", async () => {

    const res = await fetch(`${baseUrl}/api/memory`);
    const body = await res.json();

    assert.ok(Array.isArray(body));
    // >= rather than an exact count: this reads real, evolving user
    // memory data, not a test fixture -- only asserting the known
    // baseline is present, not that it's frozen at exactly 3 forever.
    assert.ok(body.length >= 3);

});

test("GET /api/memory?type=goals filters by type, honestly reporting empty", async () => {

    const res = await fetch(`${baseUrl}/api/memory?type=goals`);
    const body = await res.json();

    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 0);

});

test("GET /api/activity returns an array (empty until departments run tasks)", async () => {

    const res = await fetch(`${baseUrl}/api/activity`);
    const body = await res.json();

    assert.ok(Array.isArray(body));

});

test("unknown /api/ route returns 404 JSON", async () => {

    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await res.json();

    assert.strictEqual(res.status, 404);
    assert.ok(body.error);

});

test("GET / serves the frontend index.html", async () => {

    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("text/html"));
    assert.ok(body.includes("VERONICA"));

});

test("static file serving rejects paths escaping the frontend root", async () => {

    // fetch()/the WHATWG URL parser normalizes ".." out of a path before
    // the request is even sent, so it can't exercise the server's own
    // guard. Node's raw http.request sends the literal path string,
    // which is what actually reaches serveStatic()'s path.resolve() +
    // startsWith() check.
    const response = await new Promise((resolve, reject) => {

        http.get({
            host: "127.0.0.1",
            port: server.address().port,
            path: "/../../core/memory/database.json"
        }, res => {

            let data = "";
            res.on("data", chunk => { data += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, data }));

        }).on("error", reject);

    });

    assert.strictEqual(response.status, 404);
    assert.ok(!response.data.includes("Jacob is building VERONICA"));

});


// --- Write actions (Phase 6/7 follow-up) --------------------------------

test("POST /api/memory is disabled (501) when API_TOKEN is unset", async () => {

    delete process.env.API_TOKEN;

    const res = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        body: JSON.stringify({ content: "should not be stored" })
    });

    assert.strictEqual(res.status, 501);

});

test("POST /api/memory requires the correct bearer token and validates content", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const wrongAuth = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
        body: JSON.stringify({ content: "nope" })
    });
    assert.strictEqual(wrongAuth.status, 403);

    const missingContent = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-secret" },
        body: JSON.stringify({})
    });
    assert.strictEqual(missingContent.status, 400);

});

test("POST /api/memory stores a real memory entry via the API", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const res = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: {
            Authorization: "Bearer test-api-secret",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: "written via dashboard API marker WXYZAB", type: "technical knowledge" })
    });

    assert.strictEqual(res.status, 200);

    const stored = await res.json();
    assert.strictEqual(stored.type, "technical knowledge");

    const verify = await fetch(`${baseUrl}/api/memory?q=WXYZAB`);
    const found = await verify.json();
    assert.ok(found.some(m => m.content.includes("WXYZAB")));

});

test("POST /api/tools/:id/run requires auth and runs a real tool", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const noAuth = await fetch(`${baseUrl}/api/tools/memory.recall/run`, { method: "POST" });
    assert.strictEqual(noAuth.status, 403);

    const res = await fetch(`${baseUrl}/api/tools/memory.recall/run`, {
        method: "POST",
        headers: {
            Authorization: "Bearer test-api-secret",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 200);

    const result = await res.json();
    assert.ok(Array.isArray(result));

});

test("POST /api/departments/:id/run requires auth, a task, and a real department", async () => {

    // Only exercises auth/validation/routing here -- a full successful
    // run() now makes a real Claude API call (Phase 8 follow-up: real
    // Intelligence, not a canned response), which shouldn't happen on
    // every automated test run. The underlying run() logic is covered
    // with a mocked brain in tests/departments.test.js, and the full
    // real-API path was verified manually end to end.

    process.env.API_TOKEN = "test-api-secret";

    const noAuth = await fetch(`${baseUrl}/api/departments/athena/run`, { method: "POST" });
    assert.strictEqual(noAuth.status, 403);

    const unknownDept = await fetch(`${baseUrl}/api/departments/not-a-real-department/run`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ task: "anything" })
    });
    assert.strictEqual(unknownDept.status, 404);

    const missingTask = await fetch(`${baseUrl}/api/departments/athena/run`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-secret", "Content-Type": "application/json" },
        body: JSON.stringify({})
    });
    assert.strictEqual(missingTask.status, 400);

});
