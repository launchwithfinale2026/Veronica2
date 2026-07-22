const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// POST /api/memory writes to the same shared, real database.json other
// test files back up/restore -- relies on --test-concurrency=1 plus its
// own backup/restore here.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-dashboard-${process.pid}.json`);

// POST /api/tools/:id/run and POST /api/departments/:id/run exercise the
// real Tool.execute()/DepartmentManager.run() instrumentation, which
// records to core/learning/log.js's executions.log.
const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-dashboard-${process.pid}.log`);

// require("../dashboard/backend/server") below pulls in core/automation,
// whose module load registers/schedules the built-in jobs -- schedule()
// persists to core/automation/state.json unconditionally (see
// docs/Architecture.md "Automation Engine"), so simply requiring the
// server module (not even starting it) writes real state to disk. Must
// snapshot "existed before" ahead of that require, not after.
const AUTOMATION_STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const AUTOMATION_STATE_EXISTED_BEFORE = fs.existsSync(AUTOMATION_STATE_PATH);
const AUTOMATION_STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-dashboard-${process.pid}.json`);

if(AUTOMATION_STATE_EXISTED_BEFORE){
    fs.copyFileSync(AUTOMATION_STATE_PATH, AUTOMATION_STATE_BACKUP);
}

// The SSE tests below construct a real DepartmentManager directly (same
// pattern as tests/departments.test.js) to trigger a real
// "department.activity" bus event without making a real Claude call --
// same activity.log backup/restore that file uses.
const ATHENA_LOG_PATH = path.join(__dirname, "..", "departments", "athena", "logs", "activity.log");
const ATHENA_LOG_EXISTED_BEFORE = fs.existsSync(ATHENA_LOG_PATH);
const ATHENA_LOG_BACKUP = path.join(os.tmpdir(), `veronica-athena-log-backup-dashboard-${process.pid}.log`);

// GET /api/health and GET /api/logs/errors read from (and one test below
// writes to) core/logging/errors.log.
const ERROR_LOG_PATH = path.join(__dirname, "..", "core", "logging", "errors.log");
const ERROR_LOG_EXISTED_BEFORE = fs.existsSync(ERROR_LOG_PATH);
const ERROR_LOG_BACKUP = path.join(os.tmpdir(), `veronica-errors-log-backup-dashboard-${process.pid}.log`);

if(ERROR_LOG_EXISTED_BEFORE){
    fs.copyFileSync(ERROR_LOG_PATH, ERROR_LOG_BACKUP);
}

if(ATHENA_LOG_EXISTED_BEFORE){
    fs.copyFileSync(ATHENA_LOG_PATH, ATHENA_LOG_BACKUP);
}

const { createServer } = require("../dashboard/backend/server");

let server;
let baseUrl;

test.before(async () => {

    fs.copyFileSync(DB_PATH, DB_BACKUP);

    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }

    server = createServer();

    await new Promise(resolve => {
        server.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

});

test.after(async () => {

    // server.close() alone waits for existing connections to end
    // gracefully -- the SSE tests below leave a keep-alive socket that
    // Node doesn't drop until its default 5s keepAliveTimeout, which was
    // adding several real seconds to every `npm test` run. Force-closing
    // every socket (including idle keep-alive ones) is safe here since
    // the test run is already finished with this server.
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));

    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);

    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }

    if(AUTOMATION_STATE_EXISTED_BEFORE){
        fs.copyFileSync(AUTOMATION_STATE_BACKUP, AUTOMATION_STATE_PATH);
        fs.unlinkSync(AUTOMATION_STATE_BACKUP);
    } else if(fs.existsSync(AUTOMATION_STATE_PATH)){
        fs.unlinkSync(AUTOMATION_STATE_PATH);
    }

    if(ATHENA_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ATHENA_LOG_BACKUP, ATHENA_LOG_PATH);
        fs.unlinkSync(ATHENA_LOG_BACKUP);
    } else if(fs.existsSync(ATHENA_LOG_PATH)){
        fs.unlinkSync(ATHENA_LOG_PATH);
    }

    if(ERROR_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ERROR_LOG_BACKUP, ERROR_LOG_PATH);
        fs.unlinkSync(ERROR_LOG_BACKUP);
    } else if(fs.existsSync(ERROR_LOG_PATH)){
        fs.unlinkSync(ERROR_LOG_PATH);
    }

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

test("GET /api/health reports process health, not just a canned online string", async () => {

    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(["ok", "degraded"].includes(body.status));
    assert.ok(typeof body.uptimeSeconds === "number");
    assert.ok(typeof body.memory.rssBytes === "number");
    assert.ok(typeof body.automation.running === "boolean");
    assert.ok(typeof body.recentErrorCount === "number");

});

test("GET /api/logs/errors returns the real persisted error log", async () => {

    const log = require("../core/logging");
    log.error("dashboard-test", "GET /api/logs/errors marker XQZLOGS1");

    const res = await fetch(`${baseUrl}/api/logs/errors`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(body.some(entry => entry.message === "GET /api/logs/errors marker XQZLOGS1"));

});

test("checkApiAuth rejects a wrong-length token without throwing", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const res = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { Authorization: "Bearer short", "Content-Type": "application/json" },
        body: JSON.stringify({ content: "should not be stored" })
    });

    assert.strictEqual(res.status, 403);

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


// --- GET /api/events (Server-Sent Events) --------------------------------

// Reads the SSE stream until a `data:` line matching `wantType` arrives,
// or `timeoutMs` elapses -- guards against hanging the test suite if the
// event never shows up (a bug should fail loudly, not freeze `npm test`).
async function readSseEventOfType(response, wantType, timeoutMs = 2000){

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const deadline = Date.now() + timeoutMs;
    let buffer = "";

    try {

        while(Date.now() < deadline){

            const { value, done } = await reader.read();

            if(done){
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n\n");
            buffer = lines.pop();

            for(const chunk of lines){

                const dataLine = chunk.split("\n").find(line => line.startsWith("data: "));

                if(!dataLine){
                    continue;
                }

                const parsed = JSON.parse(dataLine.slice("data: ".length));

                if(parsed.type === wantType){
                    return parsed;
                }

            }

        }

        throw new Error(`Timed out waiting for an SSE event of type "${wantType}"`);

    } finally {

        await reader.cancel().catch(() => {});

    }

}

test("GET /api/events streams a real memory.updated event when a memory is stored", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const stream = await fetch(`${baseUrl}/api/events`);
    assert.strictEqual(stream.status, 200);
    assert.strictEqual(stream.headers.get("content-type"), "text/event-stream");

    const eventPromise = readSseEventOfType(stream, "memory.updated");

    await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ content: "SSE live-update test marker XQZSSE1" })
    });

    const event = await eventPromise;

    assert.strictEqual(event.payload.action, "created");
    assert.strictEqual(event.payload.entry.content, "SSE live-update test marker XQZSSE1");

});

test("GET /api/events streams a real department.activity event", async () => {

    const stream = await fetch(`${baseUrl}/api/events`);

    const eventPromise = readSseEventOfType(stream, "department.activity");

    // Reuses tests/departments.test.js's real DepartmentManager (mocked
    // brain, no real API call) directly rather than going through the
    // dashboard's department-run endpoint, which would make a real,
    // billed Claude call end to end.
    const DepartmentManager = require("../core/departments/base");

    const manager = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        domain: "Knowledge Intelligence",
        agents: [{ name: "METIS", role: "Test Role", capabilities: [] }]
    });

    manager.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: "sse marker XQZSSE2", provider: "claude", toolCalls: [] }) }
    };
    manager.intelligence.brain.provider.active = "claude";

    await manager.run("sse test task XQZSSE2");

    const event = await eventPromise;

    assert.strictEqual(event.payload.department, "athena");
    assert.strictEqual(event.payload.agent, "METIS");
    assert.strictEqual(event.payload.outcome, "success");

});
