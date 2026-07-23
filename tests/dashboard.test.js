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

// Phase 41's real company/campaign creation tests below also write a
// real knowledge graph entity (same as CompanyManager.createCompany()/
// core/marketing/campaigns.js's createCampaign() do everywhere else in
// this codebase) -- this file never needed a graph.json backup before
// since no prior test here actually exercised POST /api/companies with
// valid auth.
const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-dashboard-${process.pid}.json`);

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

// GET /api/devices/network (Phase 16/17) bootstraps core/device/network.json
// on first read if it doesn't exist yet (same pattern as core/memory/
// store.js's ensureFile()) -- back it up/restore like every other real,
// gitignored per-machine file this suite touches.
const NETWORK_PATH = path.join(__dirname, "..", "core", "device", "network.json");
const NETWORK_EXISTED_BEFORE = fs.existsSync(NETWORK_PATH);
const NETWORK_BACKUP = path.join(os.tmpdir(), `veronica-network-backup-dashboard-${process.pid}.json`);

if(NETWORK_EXISTED_BEFORE){
    fs.copyFileSync(NETWORK_PATH, NETWORK_BACKUP);
}

// Phase 51 (Executive Constitution): POST /api/constitution/set below
// writes real, gitignored operator data -- same backup/restore
// discipline as NETWORK_PATH above.
const CONSTITUTION_PATH = path.join(__dirname, "..", "core", "profile", "constitution.json");
const CONSTITUTION_EXISTED_BEFORE = fs.existsSync(CONSTITUTION_PATH);
const CONSTITUTION_BACKUP = path.join(os.tmpdir(), `veronica-constitution-backup-dashboard-${process.pid}.json`);

if(CONSTITUTION_EXISTED_BEFORE){
    fs.copyFileSync(CONSTITUTION_PATH, CONSTITUTION_BACKUP);
}

// Phase 55 (Multi-Model Intelligence): POST /api/brain/routing-preferences/set
// below writes real, gitignored operator data -- same backup/restore
// discipline as CONSTITUTION_PATH above.
const ROUTING_PREFERENCES_PATH = path.join(__dirname, "..", "core", "brain", "routingPreferences.json");
const ROUTING_PREFERENCES_EXISTED_BEFORE = fs.existsSync(ROUTING_PREFERENCES_PATH);
const ROUTING_PREFERENCES_BACKUP = path.join(os.tmpdir(), `veronica-routing-preferences-backup-dashboard-${process.pid}.json`);

if(ROUTING_PREFERENCES_EXISTED_BEFORE){
    fs.copyFileSync(ROUTING_PREFERENCES_PATH, ROUTING_PREFERENCES_BACKUP);
}

const { createServer } = require("../dashboard/backend/server");

let server;
let baseUrl;

test.before(async () => {

    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);

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
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);

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

    if(NETWORK_EXISTED_BEFORE){
        fs.copyFileSync(NETWORK_BACKUP, NETWORK_PATH);
        fs.unlinkSync(NETWORK_BACKUP);
    } else if(fs.existsSync(NETWORK_PATH)){
        fs.unlinkSync(NETWORK_PATH);
    }

    if(CONSTITUTION_EXISTED_BEFORE){
        fs.copyFileSync(CONSTITUTION_BACKUP, CONSTITUTION_PATH);
        fs.unlinkSync(CONSTITUTION_BACKUP);
    } else if(fs.existsSync(CONSTITUTION_PATH)){
        fs.unlinkSync(CONSTITUTION_PATH);
    }

    if(ROUTING_PREFERENCES_EXISTED_BEFORE){
        fs.copyFileSync(ROUTING_PREFERENCES_BACKUP, ROUTING_PREFERENCES_PATH);
        fs.unlinkSync(ROUTING_PREFERENCES_BACKUP);
    } else if(fs.existsSync(ROUTING_PREFERENCES_PATH)){
        fs.unlinkSync(ROUTING_PREFERENCES_PATH);
    }

    delete process.env.API_TOKEN;

});


test("GET /api/status reports online with real agent/department counts", async () => {

    const res = await fetch(`${baseUrl}/api/status`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.status, "ONLINE");
    // 9 built-in agents + 19 package agents (16 from the six real,
    // active Phase 35 production packages, +3 from Marketing's Phase 41
    // hierarchy completion -- MarketingDirector/BrandManager/
    // PublishingManager) = 28. 9 built-in + 6 package departments = 15
    // (department count is unaffected by adding agents to an existing
    // department). Not a fixed constant: this machine's real roster
    // legitimately depends on what's installed -- see docs/CHANGELOG.md's
    // "Phase 41" entries.
    assert.strictEqual(body.agents, 28);
    assert.strictEqual(body.departments, 15);
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

test("GET /api/agents/network returns every agent with its real knowledge-graph connections", async () => {

    const res = await fetch(`${baseUrl}/api/agents/network`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    // 9 built-in + 19 from the real, active production capability
    // packages (16 from Phase 35's six packages + 3 from Marketing's
    // Phase 41 hierarchy completion).
    assert.strictEqual(body.length, 28);
    assert.ok(body.every(agent => "name" in agent && "department" in agent && Array.isArray(agent.connections)));

});


test("GET /api/goals/overview returns the roadmap with real per-project progress", async () => {

    const res = await fetch(`${baseUrl}/api/goals/overview`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.every(project => Number.isFinite(project.progress) && project.progress >= 0 && project.progress <= 100));

});


test("GET /api/executive/proposals?status=pending only returns pending proposals", async () => {

    const res = await fetch(`${baseUrl}/api/executive/proposals?status=pending`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(body.every(proposal => proposal.status === "pending"));

});


// Phase 50 (Department Collaboration): pure detection, no LLM call --
// safe to exercise over the real running server. The gated
// POST .../generate route is already covered end-to-end, real
// department included, in tests/collaboration-rules.test.js.
test("GET /api/collaboration/opportunities returns real, rule-detected cross-department requests", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const companyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Collab Co XQZDASH8" })
    });
    const company = await companyRes.json();

    const opportunityRes = await fetch(`${baseUrl}/api/sales/opportunities`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, name: "Dashboard Collab Deal XQZDASH8", value: 9000 })
    });
    assert.strictEqual(opportunityRes.status, 200);

    const res = await fetch(`${baseUrl}/api/collaboration/opportunities?companyId=${company.id}`);
    const body = await res.json();

    const found = body.find(o => o.ruleId === "sales_requests_marketing");
    assert.ok(found);
    assert.strictEqual(found.from, "sales-dept");
    assert.strictEqual(found.to, "marketing-dept");

});


test("GET /api/devices/network returns an array (empty is valid -- no devices registered yet)", async () => {

    const res = await fetch(`${baseUrl}/api/devices/network`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(body));

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

test("GET /api/agents returns the real agent roster (9 built-in + package agents from installed capabilities)", async () => {

    const res = await fetch(`${baseUrl}/api/agents`);
    const body = await res.json();

    assert.strictEqual(body.length, 28);
    assert.ok(body.some(a => a.name === "METIS"));

});

test("GET /api/departments returns statusReport() shaped entries", async () => {

    const res = await fetch(`${baseUrl}/api/departments`);
    const body = await res.json();

    // 9 built-in + 6 from the real, active production capability
    // packages (Phase 35/41).
    assert.strictEqual(body.length, 15);
    assert.ok(body.every(d => d.id && d.status && Array.isArray(d.agents)));

});

test("GET /api/knowledge returns the real graph", async () => {

    const res = await fetch(`${baseUrl}/api/knowledge`);
    const body = await res.json();

    assert.ok(Array.isArray(body.entities));
    assert.ok(body.entities.some(e => e.name === "VERONICA"));

});

// Phase 49 (Organizational Knowledge Graph): surfaces the graph's own
// already-real retrieve() -- entities matching the query plus every
// relationship touching them.
test("GET /api/knowledge/query returns real matching entities and their real relationships", async () => {

    const res = await fetch(`${baseUrl}/api/knowledge/query?q=VERONICA`);
    const body = await res.json();

    assert.ok(body.entities.some(e => e.name === "VERONICA"));
    assert.ok(body.relationships.some(rel => rel.from === "VERONICA" || rel.to === "VERONICA"));

});


test("Knowledge Graph Explorer: real by-type/expand/path routes through the live server (Project H)", async () => {

    const knowledge = require("../core/knowledge");
    knowledge.addEntity({ name: "XQZDASH14 Person", type: "person" });
    knowledge.addEntity({ name: "XQZDASH14 Company", type: "company" });
    knowledge.addRelationship({ from: "XQZDASH14 Person", to: "XQZDASH14 Company", type: "worksAt" });

    const byTypeRes = await fetch(`${baseUrl}/api/knowledge/by-type?type=person`);
    const byType = await byTypeRes.json();
    assert.ok(byType.some(e => e.name === "XQZDASH14 Person"));

    const expandRes = await fetch(`${baseUrl}/api/knowledge/expand?name=${encodeURIComponent("XQZDASH14 Person")}&hops=1`);
    const expanded = await expandRes.json();
    assert.ok(expanded.entities.some(e => e.name === "XQZDASH14 Company"));

    const pathRes = await fetch(`${baseUrl}/api/knowledge/path?from=${encodeURIComponent("XQZDASH14 Person")}&to=${encodeURIComponent("XQZDASH14 Company")}`);
    const pathResult = await pathRes.json();
    assert.strictEqual(pathResult.found, true);
    assert.deepStrictEqual(pathResult.path, ["XQZDASH14 Person", "XQZDASH14 Company"]);

});


test("GET /api/system/health-score returns the real, unified 0-100 health score (Project F)", async () => {

    const res = await fetch(`${baseUrl}/api/system/health-score`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(typeof body.score === "number");
    assert.ok(["healthy", "fair", "degraded", "critical"].includes(body.status));
    assert.ok(Array.isArray(body.breakdown));

});


// Deliberately does NOT exercise POST .../run-log-archival with real
// auth here -- it would actually rename this test run's real, shared
// executions.log/errors.log files (already thoroughly covered, real
// temp files, in tests/system-maintenance.test.js). This test verifies
// the real, safe, read-only report route only.
test("GET /api/system/consistency-report returns the real, report-only maintenance findings (Project G)", async () => {

    const res = await fetch(`${baseUrl}/api/system/consistency-report`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.duplicatedCapabilityTools));
    assert.ok(Array.isArray(body.brokenCapabilities));

});


test("GET /api/system/operational-readiness returns the real combined checklist (Project N)", async () => {

    const res = await fetch(`${baseUrl}/api/system/operational-readiness`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.running, true);
    assert.ok(typeof body.healthy === "boolean");
    assert.ok(typeof body.fullyOperational === "boolean");
    assert.ok(typeof body.checks.missingCredentials.ok === "boolean");

});


// Phase 57 (Knowledge Acquisition Engine): pure history read, no LLM
// call -- safe to exercise over the real running server. The gated
// POST .../acquire-file/.../acquire-note routes are already covered
// end-to-end, LLM mocked, in tests/knowledge-acquisition.test.js.
test("GET /api/knowledge/acquisition-history returns the real, persisted acquisition history", async () => {

    const res = await fetch(`${baseUrl}/api/knowledge/acquisition-history`);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(await res.json()));

});


test("GET /api/automation/workflows and .../history reflect a real, defined-in-code workflow run through the real server (Phase 54)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    // Registers into the same in-memory workflow registry the running
    // server's own require("core/automation/workflow") singleton uses
    // (Node module caching -- same instance either way).
    const automationWorkflow = require("../core/automation/workflow");
    automationWorkflow.defineWorkflow("dashboard-test-workflow-xqzdash11", [
        { id: "only", run: async () => "dashboard workflow ran XQZDASH11" }
    ]);

    const listRes = await fetch(`${baseUrl}/api/automation/workflows`);
    const list = await listRes.json();
    assert.ok(list.some(w => w.name === "dashboard-test-workflow-xqzdash11"));

    const runRes = await fetch(`${baseUrl}/api/automation/workflows/dashboard-test-workflow-xqzdash11/run`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-secret", "Content-Type": "application/json" },
        body: "{}"
    });
    const run = await runRes.json();
    assert.strictEqual(run.status, "completed");

    const historyRes = await fetch(`${baseUrl}/api/automation/workflows/history?name=dashboard-test-workflow-xqzdash11`);
    const history = await historyRes.json();
    assert.strictEqual(history[0].id, run.id);

});

test("GET/POST /api/constitution reads and updates the real Executive Constitution (Phase 51)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const initial = await (await fetch(`${baseUrl}/api/constitution`)).json();
    assert.strictEqual(initial.identity.name, "VERONICA");

    const setRes = await fetch(`${baseUrl}/api/constitution/set`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ path: "mission", value: "Dashboard mission XQZDASH10" })
    });
    assert.strictEqual((await setRes.json()).mission, "Dashboard mission XQZDASH10");

    const addRes = await fetch(`${baseUrl}/api/constitution/add`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ field: "values", value: "Dashboard value XQZDASH10" })
    });
    assert.ok((await addRes.json()).values.includes("Dashboard value XQZDASH10"));

    const after = await (await fetch(`${baseUrl}/api/constitution`)).json();
    assert.strictEqual(after.mission, "Dashboard mission XQZDASH10");

});


test("GET /api/brain/status reports real provider configuration, and routing-preferences set/clear round-trip (Phase 55)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const statusRes = await fetch(`${baseUrl}/api/brain/status`);
    const status = await statusRes.json();
    assert.ok(status.some(entry => entry.name === "claude"));
    assert.ok(status.some(entry => entry.active));

    const setRes = await fetch(`${baseUrl}/api/brain/routing-preferences/set`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ taskType: "dashboard-test-xqzdash12", provider: "openai" })
    });
    assert.strictEqual((await setRes.json())["dashboard-test-xqzdash12"], "openai");

    const prefsRes = await fetch(`${baseUrl}/api/brain/routing-preferences`);
    assert.strictEqual((await prefsRes.json())["dashboard-test-xqzdash12"], "openai");

    const clearRes = await fetch(`${baseUrl}/api/brain/routing-preferences/clear`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ taskType: "dashboard-test-xqzdash12" })
    });
    assert.strictEqual((await clearRes.json())["dashboard-test-xqzdash12"], undefined);

});


test("Personal Intelligence: real relationship/decision-pattern inferences and a real dismiss round-trip through the live server (Phase 56)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const knowledge = require("../core/knowledge");
    knowledge.addEntity({ name: "Dashboard Intel Person XQZDASH13", type: "person" });
    knowledge.addRelationship({ from: "Dashboard Intel Person XQZDASH13", to: "VERONICA", type: "contains" });

    const relationshipsRes = await fetch(`${baseUrl}/api/personal-intelligence/relationships`);
    const relationships = await relationshipsRes.json();
    assert.ok(relationships.some(r => r.subject === "Dashboard Intel Person XQZDASH13"));

    const patternsRes = await fetch(`${baseUrl}/api/personal-intelligence/decision-patterns`);
    assert.ok(Array.isArray(await patternsRes.json()));

    const dismissRes = await fetch(`${baseUrl}/api/personal-intelligence/dismiss`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ subject: "Dashboard Intel Person XQZDASH13", reason: "test dismiss XQZDASH13" })
    });
    assert.strictEqual(dismissRes.status, 200);

    const dismissedRes = await fetch(`${baseUrl}/api/personal-intelligence/dismissed`);
    assert.ok((await dismissedRes.json()).some(d => d.subject === "Dashboard Intel Person XQZDASH13"));

    const afterRes = await fetch(`${baseUrl}/api/personal-intelligence/relationships`);
    const after = await afterRes.json();
    assert.ok(!after.some(r => r.subject === "Dashboard Intel Person XQZDASH13"));

});


test("GET /api/tools returns the real registered tools", async () => {

    const res = await fetch(`${baseUrl}/api/tools`);
    const body = await res.json();

    const ids = body.map(t => t.id).sort();
    assert.ok(ids.includes("memory.remember"));
    assert.ok(ids.includes("filesystem.readFile"));

});

test("GET /api/capabilities/health reports real per-package operational status (Phase 41)", async () => {

    const res = await fetch(`${baseUrl}/api/capabilities/health`);
    const body = await res.json();

    // All six real, active production packages (Phase 35) have now been
    // through their own production-readiness pass (Phase 41-46:
    // marketing, sales, finance, research-department, trading-research,
    // business-operations) and genuinely report "active" -- none remain
    // skeleton-tooled. See core/capabilities/health.js and
    // tests/capabilities-health.test.js's own exhaustive check for the
    // underlying logic this endpoint just exposes.
    const businessOperations = body.find(entry => entry.name === "business-operations");
    assert.ok(businessOperations);
    assert.strictEqual(businessOperations.operationalStatus, "active");
    assert.strictEqual(businessOperations.operationalStatusLabel, "Active");
    assert.ok(businessOperations.agentsLoaded > 0);

});


test("GET /api/capabilities/dashboard-panels returns an array, empty for the six hand-built Divisions which deliberately don't declare one (Project A/M)", async () => {

    const res = await fetch(`${baseUrl}/api/capabilities/dashboard-panels`);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body));

    // The six real production Divisions have real, richer, hand-built
    // dashboard integration already -- none of them declare a generic
    // manifest `dashboard` field, so none should appear here.
    assert.ok(!body.some(p => ["marketing", "sales", "finance", "research-department", "trading-research", "business-operations"].includes(p.packageName)));

});

test("Marketing Division: create a company, set its brand profile, plan a real campaign, and read it back through every real endpoint (Phase 41)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const companyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Marketing Co XQZDASH1" })
    });
    assert.strictEqual(companyRes.status, 200);
    const company = await companyRes.json();

    const brandRes = await fetch(`${baseUrl}/api/companies/${company.id}/brand-profile`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ mission: "Dashboard test mission XQZDASH1", voice: { tone: "direct" } })
    });
    assert.strictEqual(brandRes.status, 200);
    const brand = await brandRes.json();
    assert.strictEqual(brand.mission, "Dashboard test mission XQZDASH1");

    const brandGetRes = await fetch(`${baseUrl}/api/companies/${company.id}/brand-profile`);
    assert.strictEqual((await brandGetRes.json()).voice.tone, "direct");

    const decisionRes = await fetch(`${baseUrl}/api/companies/${company.id}/decisions`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ decision: "Ship the dashboard test XQZDASH1" })
    });
    assert.strictEqual((await decisionRes.json()).history.length, 1);

    const campaignRes = await fetch(`${baseUrl}/api/marketing/campaigns`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, objective: "Dashboard campaign XQZDASH1" })
    });
    assert.strictEqual(campaignRes.status, 200);
    const campaign = await campaignRes.json();
    assert.strictEqual(campaign.objective, "Dashboard campaign XQZDASH1");

    const scheduleRes = await fetch(`${baseUrl}/api/marketing/campaigns/${campaign.id}/schedule-content`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ date: "2026-09-01", platform: "discord", description: "Dashboard test post XQZDASH1" })
    });
    assert.strictEqual((await scheduleRes.json()).contentSchedule.length, 1);

    const approvalRes = await fetch(`${baseUrl}/api/marketing/campaigns/${campaign.id}/approval-status`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ status: "approved" })
    });
    assert.strictEqual((await approvalRes.json()).approvalStatus, "approved");

    const metricsRes = await fetch(`${baseUrl}/api/marketing/campaigns/${campaign.id}/metrics`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ impressions: 500 })
    });
    assert.strictEqual((await metricsRes.json()).performanceMetrics.impressions, 500);

    const lessonRes = await fetch(`${baseUrl}/api/marketing/campaigns/${campaign.id}/lessons`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ lesson: "Post earlier next time XQZDASH1" })
    });
    assert.strictEqual((await lessonRes.json()).lessonsLearned.length, 1);

    const detailRes = await fetch(`${baseUrl}/api/marketing/campaigns/${campaign.id}`);
    assert.strictEqual((await detailRes.json()).approvalStatus, "approved");

    const listRes = await fetch(`${baseUrl}/api/marketing/campaigns?companyId=${company.id}`);
    assert.strictEqual((await listRes.json()).length, 1);

    const calendarRes = await fetch(`${baseUrl}/api/marketing/calendar?companyId=${company.id}`);
    const calendarBody = await calendarRes.json();
    assert.strictEqual(calendarBody.length, 1);
    assert.strictEqual(calendarBody[0].description, "Dashboard test post XQZDASH1");

    const analyticsRes = await fetch(`${baseUrl}/api/marketing/analytics?companyId=${company.id}`);
    const analyticsBody = await analyticsRes.json();
    assert.strictEqual(analyticsBody.totals.impressions, 500);

    const brainRes = await fetch(`${baseUrl}/api/companies/${company.id}/brain`);
    const brain = await brainRes.json();
    assert.strictEqual(brain.mission, "Dashboard test mission XQZDASH1");
    assert.strictEqual(brain.campaigns.length, 1);
    assert.strictEqual(brain.historicalDecisions.length, 1);

    const externalProposalRes = await fetch(`${baseUrl}/api/executive/proposals/external`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
            action: "publish_content",
            reason: "Dashboard test publish XQZDASH1",
            payload: { campaignId: campaign.id, itemId: calendarBody[0].id, platform: "discord", content: "test" }
        })
    });
    assert.strictEqual(externalProposalRes.status, 200);
    const proposal = await externalProposalRes.json();
    assert.strictEqual(proposal.action, "publish_content");
    assert.strictEqual(proposal.status, "pending");

});

test("Sales Division: create a company, a lead, an opportunity, move it through the pipeline, and read real analytics back (Phase 42)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const companyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Sales Co XQZDASH2" })
    });
    const company = await companyRes.json();

    const leadRes = await fetch(`${baseUrl}/api/sales/leads`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, name: "Dashboard Lead XQZDASH2", email: "lead@xqzdash2.com" })
    });
    assert.strictEqual(leadRes.status, 200);
    const lead = await leadRes.json();

    const interactionRes = await fetch(`${baseUrl}/api/sales/leads/${lead.id}/interactions`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ type: "call", summary: "Intro call XQZDASH2" })
    });
    assert.strictEqual((await interactionRes.json()).interactions.length, 1);

    const signalsRes = await fetch(`${baseUrl}/api/sales/leads/${lead.id}/signals`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ budget: true })
    });
    assert.strictEqual((await signalsRes.json()).signals.budget, true);

    const scoreRes = await fetch(`${baseUrl}/api/sales/leads/${lead.id}/score`, {
        method: "POST",
        headers: authedHeaders
    });
    const scored = await scoreRes.json();
    assert.ok(scored.score > 0);

    const statusRes = await fetch(`${baseUrl}/api/sales/leads/${lead.id}/status`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ status: "qualified" })
    });
    assert.strictEqual((await statusRes.json()).status, "qualified");

    const leadDetailRes = await fetch(`${baseUrl}/api/sales/leads/${lead.id}`);
    assert.strictEqual((await leadDetailRes.json()).status, "qualified");

    const oppRes = await fetch(`${baseUrl}/api/sales/opportunities`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, leadId: lead.id, name: "Dashboard Deal XQZDASH2", value: 12000 })
    });
    assert.strictEqual(oppRes.status, 200);
    const opportunity = await oppRes.json();

    const contactRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/contacts`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Lead XQZDASH2", role: "Champion" })
    });
    assert.strictEqual((await contactRes.json()).contacts.length, 1);

    const followUpRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/follow-ups`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ date: "2026-09-01", note: "Send proposal XQZDASH2" })
    });
    const followUps = (await followUpRes.json()).followUps;
    assert.strictEqual(followUps.length, 1);

    const completeRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/follow-ups/${followUps[0].id}/complete`, {
        method: "POST",
        headers: authedHeaders
    });
    assert.strictEqual((await completeRes.json()).done, true);

    const stageRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/stage`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ stage: "qualified" })
    });
    assert.strictEqual((await stageRes.json()).stage, "qualified");

    const closeRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/stage`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ stage: "closed_won", reason: "Great fit XQZDASH2" })
    });
    assert.strictEqual((await closeRes.json()).winReason, "Great fit XQZDASH2");

    const lessonRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}/lessons`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ lesson: "Fast follow-up won the deal XQZDASH2" })
    });
    assert.strictEqual((await lessonRes.json()).lessonsLearned.length, 1);

    const oppDetailRes = await fetch(`${baseUrl}/api/sales/opportunities/${opportunity.id}`);
    assert.strictEqual((await oppDetailRes.json()).stage, "closed_won");

    const listRes = await fetch(`${baseUrl}/api/sales/opportunities?companyId=${company.id}`);
    assert.strictEqual((await listRes.json()).length, 1);

    const forecastRes = await fetch(`${baseUrl}/api/sales/forecast?companyId=${company.id}`);
    const forecast = await forecastRes.json();
    assert.strictEqual(forecast.totalOpenValue, 0);

    const analyticsRes = await fetch(`${baseUrl}/api/sales/analytics?companyId=${company.id}`);
    const analyticsBody = await analyticsRes.json();
    assert.strictEqual(analyticsBody.winLoss.won, 1);
    assert.strictEqual(analyticsBody.winLoss.avgWonValue, 12000);
    assert.strictEqual(analyticsBody.leadCount, 1);

    const leadsListRes = await fetch(`${baseUrl}/api/sales/leads?companyId=${company.id}`);
    assert.strictEqual((await leadsListRes.json()).length, 1);

});

test("Finance Division: create a company, record real revenue, set a budget, invoice a client, add a subscription, and read real KPIs back (Phase 43)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const companyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Finance Co XQZDASH3" })
    });
    const company = await companyRes.json();

    const financeRes = await fetch(`${baseUrl}/api/companies/${company.id}/finances`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ label: "Revenue XQZDASH3", amount: 4000, type: "revenue" })
    });
    assert.strictEqual(financeRes.status, 200);

    const budgetRes = await fetch(`${baseUrl}/api/finance/budgets`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, category: "infrastructure", period: "2026-07", limit: 500 })
    });
    assert.strictEqual(budgetRes.status, 200);
    const budget = await budgetRes.json();

    const budgetStatusRes = await fetch(`${baseUrl}/api/finance/budgets?companyId=${company.id}`);
    const budgetStatus = await budgetStatusRes.json();
    assert.strictEqual(budgetStatus.length, 1);
    assert.strictEqual(budgetStatus[0].id, budget.id);

    const invoiceRes = await fetch(`${baseUrl}/api/finance/invoices`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, clientName: "Acme XQZDASH3", amount: 1500 })
    });
    assert.strictEqual(invoiceRes.status, 200);
    const invoice = await invoiceRes.json();

    const invoiceStatusRes = await fetch(`${baseUrl}/api/finance/invoices/${invoice.id}/status`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ status: "sent" })
    });
    assert.strictEqual((await invoiceStatusRes.json()).status, "sent");

    const invoiceDetailRes = await fetch(`${baseUrl}/api/finance/invoices/${invoice.id}`);
    assert.strictEqual((await invoiceDetailRes.json()).status, "sent");

    const invoiceListRes = await fetch(`${baseUrl}/api/finance/invoices?companyId=${company.id}`);
    assert.strictEqual((await invoiceListRes.json()).length, 1);

    const subRes = await fetch(`${baseUrl}/api/finance/subscriptions`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ companyId: company.id, clientName: "Beta XQZDASH3", amount: 200, interval: "monthly" })
    });
    assert.strictEqual(subRes.status, 200);
    const subscription = await subRes.json();

    const subListRes = await fetch(`${baseUrl}/api/finance/subscriptions?companyId=${company.id}`);
    assert.strictEqual((await subListRes.json()).length, 1);

    const cancelRes = await fetch(`${baseUrl}/api/finance/subscriptions/${subscription.id}/cancel`, {
        method: "POST",
        headers: authedHeaders
    });
    assert.strictEqual((await cancelRes.json()).status, "canceled");

    const cashFlowRes = await fetch(`${baseUrl}/api/finance/cash-flow?companyId=${company.id}`);
    const cashFlow = await cashFlowRes.json();
    assert.strictEqual(cashFlow.length, 1);
    assert.strictEqual(cashFlow[0].revenue, 4000);

    const runwayRes = await fetch(`${baseUrl}/api/finance/runway?companyId=${company.id}`);
    assert.strictEqual((await runwayRes.json()).status, "profitable");

    const forecastRes = await fetch(`${baseUrl}/api/finance/forecast?companyId=${company.id}`);
    assert.ok((await forecastRes.json()).projection);

    const kpisRes = await fetch(`${baseUrl}/api/finance/kpis?companyId=${company.id}`);
    const kpis = await kpisRes.json();
    assert.strictEqual(kpis.financialSummary.revenue, 4000);
    // Subscription was canceled, so it must not count toward MRR.
    assert.strictEqual(kpis.mrr, 0);
    assert.strictEqual(kpis.accountsReceivable, 1500);

});

test("Research Division: create a mission, read it back, and mark it complete through every real endpoint (Phase 44)", async () => {

    // Deliberately does NOT exercise POST .../citations or .../summary
    // here -- both make a real network fetch + a real LLM call with no
    // mock injection point reachable through the dashboard route (the
    // underlying core/research/missions.js addCitation()/
    // generateExecutiveSummary() logic is already thoroughly covered,
    // mocked, in tests/research-missions.test.js). This test verifies
    // the HTTP plumbing for the rest of the mission lifecycle.
    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const missionRes = await fetch(`${baseUrl}/api/research/missions`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ objective: "Dashboard research mission XQZDASH4", type: "industry" })
    });
    assert.strictEqual(missionRes.status, 200);
    const mission = await missionRes.json();
    assert.strictEqual(mission.status, "in_progress");
    assert.strictEqual(mission.type, "industry");

    const detailRes = await fetch(`${baseUrl}/api/research/missions/${mission.id}`);
    assert.strictEqual((await detailRes.json()).objective, "Dashboard research mission XQZDASH4");

    const listRes = await fetch(`${baseUrl}/api/research/missions`);
    const list = await listRes.json();
    assert.ok(list.some(m => m.id === mission.id));

    const citationsRes = await fetch(`${baseUrl}/api/research/missions/${mission.id}/citations`);
    assert.deepStrictEqual(await citationsRes.json(), []);

    const rankedRes = await fetch(`${baseUrl}/api/research/missions/${mission.id}/ranked-sources`);
    assert.deepStrictEqual(await rankedRes.json(), []);

    const completeRes = await fetch(`${baseUrl}/api/research/missions/${mission.id}/complete`, {
        method: "POST",
        headers: authedHeaders
    });
    assert.strictEqual((await completeRes.json()).status, "completed");

    const finalDetailRes = await fetch(`${baseUrl}/api/research/missions/${mission.id}`);
    assert.strictEqual((await finalDetailRes.json()).status, "completed");

});

test("Trading Research Division: create a portfolio, execute paper trades, review real P&L, size a position, and backtest a strategy through every real endpoint (Phase 45)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const portfolioRes = await fetch(`${baseUrl}/api/trading/portfolios`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Trading Portfolio XQZDASH5", startingCash: 10000 })
    });
    assert.strictEqual(portfolioRes.status, 200);
    const portfolio = await portfolioRes.json();
    assert.strictEqual(portfolio.cash, 10000);

    const tradeRes = await fetch(`${baseUrl}/api/trading/portfolios/${portfolio.id}/trades`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ symbol: "ACME", side: "buy", quantity: 10, price: 100 })
    });
    assert.strictEqual(tradeRes.status, 200);
    const tradeResult = await tradeRes.json();
    assert.strictEqual(tradeResult.portfolio.cash, 9000);

    const sellRes = await fetch(`${baseUrl}/api/trading/portfolios/${portfolio.id}/trades`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ symbol: "ACME", side: "sell", quantity: 5, price: 120 })
    });
    assert.strictEqual(sellRes.status, 200);

    const journalRes = await fetch(`${baseUrl}/api/trading/portfolios/${portfolio.id}/journal`);
    const journal = await journalRes.json();
    assert.strictEqual(journal.length, 2);

    const valueRes = await fetch(`${baseUrl}/api/trading/portfolios/${portfolio.id}/value?prices=${encodeURIComponent(JSON.stringify({ ACME: 130 }))}`);
    const value = await valueRes.json();
    assert.strictEqual(value.positions[0].unrealizedPnl, (130 - 100) * 5);

    const reviewRes = await fetch(`${baseUrl}/api/trading/portfolios/${portfolio.id}/review?prices=${encodeURIComponent(JSON.stringify({ ACME: 130 }))}`);
    const review = await reviewRes.json();
    // Sold 5 of 10 shares bought at 100, for 120 -- realized P&L = 100.
    assert.strictEqual(review.performance.realizedPnl, 100);

    const portfolioListRes = await fetch(`${baseUrl}/api/trading/portfolios`);
    const portfolioList = await portfolioListRes.json();
    assert.ok(portfolioList.some(p => p.id === portfolio.id));

    const watchlistRes = await fetch(`${baseUrl}/api/trading/watchlists`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Watchlist XQZDASH5", symbols: ["ACME"] })
    });
    const watchlist = await watchlistRes.json();

    const addSymbolRes = await fetch(`${baseUrl}/api/trading/watchlists/${watchlist.id}/add-symbol`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ symbol: "BETA" })
    });
    assert.deepStrictEqual((await addSymbolRes.json()).symbols, ["ACME", "BETA"]);

    const removeSymbolRes = await fetch(`${baseUrl}/api/trading/watchlists/${watchlist.id}/remove-symbol`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ symbol: "ACME" })
    });
    assert.deepStrictEqual((await removeSymbolRes.json()).symbols, ["BETA"]);

    const watchlistListRes = await fetch(`${baseUrl}/api/trading/watchlists`);
    assert.ok((await watchlistListRes.json()).some(w => w.id === watchlist.id));

    const strategyRes = await fetch(`${baseUrl}/api/trading/strategies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Strategy XQZDASH5", rules: { shortWindow: 2, longWindow: 4 } })
    });
    const strategy = await strategyRes.json();

    const strategyDetailRes = await fetch(`${baseUrl}/api/trading/strategies/${strategy.id}`);
    assert.strictEqual((await strategyDetailRes.json()).name, "Dashboard Strategy XQZDASH5");

    const strategyListRes = await fetch(`${baseUrl}/api/trading/strategies`);
    assert.ok((await strategyListRes.json()).some(s => s.id === strategy.id));

    const positionSizeRes = await fetch(`${baseUrl}/api/trading/position-size?accountValue=10000&riskPercent=0.02&entryPrice=100&stopPrice=90`);
    assert.strictEqual((await positionSizeRes.json()).shares, 20);

    const backtestRes = await fetch(`${baseUrl}/api/trading/backtest`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
            priceSeries: [10, 10, 10, 10, 20, 20, 20, 20, 20, 5, 5, 5, 5].map((price, i) => ({ date: `d${i}`, price })),
            shortWindow: 2,
            longWindow: 4,
            startingCash: 1000
        })
    });
    const backtestResult = await backtestRes.json();
    assert.strictEqual(backtestResult.tradeCount, 2);
    assert.strictEqual(backtestResult.finalValue, 250);

});

test("Business Operations Division: create an SOP, track a KPI, log a meeting, and read a real department scorecard through every real endpoint (Phase 46 -- the sixth and final Phase 35 package)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const sopRes = await fetch(`${baseUrl}/api/operations/sops`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard SOP XQZDASH6", department: "bizops", steps: ["Step 1"] })
    });
    assert.strictEqual(sopRes.status, 200);
    const sop = await sopRes.json();
    assert.strictEqual(sop.version, 1);

    const stepsRes = await fetch(`${baseUrl}/api/operations/sops/${sop.id}/steps`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ steps: ["Step 1", "Step 2"] })
    });
    assert.strictEqual((await stepsRes.json()).version, 2);

    const analysisRes = await fetch(`${baseUrl}/api/operations/sops/${sop.id}/analysis`);
    assert.strictEqual((await analysisRes.json()).sop.id, sop.id);

    const sopDetailRes = await fetch(`${baseUrl}/api/operations/sops/${sop.id}`);
    assert.strictEqual((await sopDetailRes.json()).version, 2);

    const sopListRes = await fetch(`${baseUrl}/api/operations/sops?department=bizops`);
    assert.ok((await sopListRes.json()).some(s => s.id === sop.id));

    const kpiRes = await fetch(`${baseUrl}/api/operations/kpis`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard KPI XQZDASH6", department: "bizops", target: 100 })
    });
    const kpi = await kpiRes.json();

    const actualRes = await fetch(`${baseUrl}/api/operations/kpis/${kpi.id}/actual`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ actual: 120 })
    });
    assert.strictEqual((await actualRes.json()).actual, 120);

    const kpiDetailRes = await fetch(`${baseUrl}/api/operations/kpis/${kpi.id}`);
    assert.strictEqual((await kpiDetailRes.json()).onTrack, true);

    const kpiListRes = await fetch(`${baseUrl}/api/operations/kpis?department=bizops`);
    assert.ok((await kpiListRes.json()).some(k => k.id === kpi.id));

    const meetingRes = await fetch(`${baseUrl}/api/operations/meetings`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ title: "Dashboard Meeting XQZDASH6", actionItems: [{ text: "Follow up XQZDASH6" }] })
    });
    const meeting = await meetingRes.json();

    const completeRes = await fetch(`${baseUrl}/api/operations/meetings/${meeting.id}/action-items/action-0/complete`, {
        method: "POST",
        headers: authedHeaders
    });
    assert.strictEqual((await completeRes.json()).actionItems[0].done, true);

    const meetingDetailRes = await fetch(`${baseUrl}/api/operations/meetings/${meeting.id}`);
    assert.strictEqual((await meetingDetailRes.json()).actionItems[0].done, true);

    const meetingListRes = await fetch(`${baseUrl}/api/operations/meetings`);
    assert.ok((await meetingListRes.json()).some(m => m.id === meeting.id));

    const scorecardRes = await fetch(`${baseUrl}/api/operations/scorecard/bizops`);
    const scorecard = await scorecardRes.json();
    assert.strictEqual(scorecard.departmentId, "bizops");
    assert.ok(scorecard.health);
    assert.ok(scorecard.kpis.some(k => k.id === kpi.id));

});

// Deliberately does NOT exercise POST /api/executive/brief here -- it
// makes a real, billed LLM call with no mock injection point reachable
// through the dashboard route (already thoroughly covered, mocked, in
// tests/executive-intelligence.test.js). This test verifies the real
// GET endpoints only, matching the Research Division test's own
// carve-out above for the same reason.
test("Executive Intelligence: real company health, risk forecast, cross-department recommendations, and quarterly/annual planning through every real GET endpoint (Phase 48)", async () => {

    process.env.API_TOKEN = "test-api-secret";

    const authedHeaders = {
        Authorization: "Bearer test-api-secret",
        "Content-Type": "application/json"
    };

    const companyRes = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ name: "Dashboard Executive Intelligence Co XQZDASH7" })
    });
    const company = await companyRes.json();

    const financeRes = await fetch(`${baseUrl}/api/companies/${company.id}/finances`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ label: "Revenue XQZDASH7", amount: 4000, type: "revenue" })
    });
    assert.strictEqual(financeRes.status, 200);

    const healthRes = await fetch(`${baseUrl}/api/executive/company-health?companyId=${company.id}`);
    const health = await healthRes.json();
    assert.strictEqual(health.categories.finance.score, 100);
    assert.strictEqual(health.categories.marketing, null);

    const riskRes = await fetch(`${baseUrl}/api/executive/risk-forecast?companyId=${company.id}`);
    assert.ok(Array.isArray((await riskRes.json()).risks));

    const crossRes = await fetch(`${baseUrl}/api/executive/cross-department-recommendations?companyId=${company.id}`);
    assert.ok(Array.isArray((await crossRes.json()).recommendations));

    const quarterlyRes = await fetch(`${baseUrl}/api/executive/quarterly-plan?companyId=${company.id}&year=2026&quarter=3`);
    const quarterly = await quarterlyRes.json();
    assert.ok(Array.isArray(quarterly.projects));
    assert.ok(Array.isArray(quarterly.kpis));

    const annualRes = await fetch(`${baseUrl}/api/executive/annual-plan?companyId=${company.id}&year=2026`);
    assert.ok(Array.isArray((await annualRes.json()).projects));

    const briefsRes = await fetch(`${baseUrl}/api/executive/briefs?companyId=${company.id}`);
    assert.deepStrictEqual(await briefsRes.json(), []);

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

// Every mutating dashboard endpoint is supposed to call checkApiAuth()
// before doing anything else (verified by direct code inspection during
// the v1 release audit -- see docs/Architecture.md), but nothing
// previously asserted that invariant as a single regression test. One
// new route added without the checkApiAuth() call would 200 requests
// that should 501/403. This sweeps every known POST route with
// API_TOKEN unset and confirms none of them fall through to real work.
const ALL_POST_ROUTES = [
    "/api/memory",
    "/api/memory/semantic-search",
    "/api/memory/reindex-embeddings",
    "/api/sync/import",
    "/api/devices/register",
    "/api/devices/test-id/heartbeat",
    "/api/devices/test-id/role",
    "/api/executive/plan",
    "/api/executive/pursue",
    "/api/executive/run-next",
    "/api/executive/consolidate",
    "/api/executive/self-check",
    "/api/executive/recommendations",
    "/api/executive/daily-briefing",
    "/api/executive/weekly-report",
    "/api/executive/daily-review",
    "/api/executive/proposals/generate",
    "/api/executive/proposals/test-id/approve",
    "/api/executive/proposals/test-id/reject",
    "/api/executive/proposals/test-id/execute",
    "/api/learning/recommend",
    "/api/automation/jobs/test-job/run",
    "/api/automation/workflows/test-workflow/run",
    "/api/collaboration/message",
    "/api/collaboration/delegate",
    "/api/collaboration/review",
    "/api/collaboration/consensus",
    "/api/collaboration/opportunities/generate",
    "/api/executive/projects/test-id/decompose",
    "/api/executive/projects/test-id/status",
    "/api/executive/projects/test-id/artifacts",
    "/api/executive/projects/test-id/handoff",
    "/api/companies",
    "/api/companies/test-id/employees",
    "/api/companies/test-id/documents",
    "/api/companies/test-id/finances",
    "/api/companies/test-id/relationships",
    "/api/companies/test-id/communications",
    "/api/companies/test-id/brand-profile",
    "/api/companies/test-id/decisions",
    "/api/executive/proposals/external",
    "/api/executive/brief",
    "/api/constitution/set",
    "/api/constitution/add",
    "/api/brain/routing-preferences/set",
    "/api/brain/routing-preferences/clear",
    "/api/personal-intelligence/dismiss",
    "/api/system/maintenance/run-log-archival",
    "/api/knowledge/acquire-file",
    "/api/knowledge/acquire-note",
    "/api/marketing/campaigns",
    "/api/marketing/campaigns/test-id/schedule-content",
    "/api/marketing/campaigns/test-id/generate-draft",
    "/api/marketing/campaigns/test-id/approval-status",
    "/api/marketing/campaigns/test-id/metrics",
    "/api/marketing/campaigns/test-id/lessons",
    "/api/sales/leads",
    "/api/sales/leads/test-id/interactions",
    "/api/sales/leads/test-id/signals",
    "/api/sales/leads/test-id/status",
    "/api/sales/leads/test-id/score",
    "/api/sales/opportunities",
    "/api/sales/opportunities/test-id/stage",
    "/api/sales/opportunities/test-id/contacts",
    "/api/sales/opportunities/test-id/follow-ups",
    "/api/sales/opportunities/test-id/follow-ups/test-followup-id/complete",
    "/api/sales/opportunities/test-id/generate-proposal",
    "/api/sales/opportunities/test-id/lessons",
    "/api/finance/budgets",
    "/api/finance/invoices",
    "/api/finance/invoices/test-id/status",
    "/api/finance/subscriptions",
    "/api/finance/subscriptions/test-id/cancel",
    "/api/research/missions",
    "/api/research/missions/test-id/citations",
    "/api/research/missions/test-id/summary",
    "/api/research/missions/test-id/complete",
    "/api/trading/portfolios",
    "/api/trading/portfolios/test-id/trades",
    "/api/trading/watchlists",
    "/api/trading/watchlists/test-id/add-symbol",
    "/api/trading/watchlists/test-id/remove-symbol",
    "/api/trading/strategies",
    "/api/trading/backtest",
    "/api/operations/sops",
    "/api/operations/sops/test-id/steps",
    "/api/operations/kpis",
    "/api/operations/kpis/test-id/actual",
    "/api/operations/meetings",
    "/api/operations/meetings/test-id/action-items/test-item-id/complete",
    "/api/departments/athena/run",
    "/api/tools/memory.recall/run"
];

test("every mutating dashboard route enforces checkApiAuth() (501 when API_TOKEN unset)", async () => {

    delete process.env.API_TOKEN;

    for(const route of ALL_POST_ROUTES){

        const res = await fetch(`${baseUrl}${route}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
        });

        const body = await res.json();

        assert.strictEqual(res.status, 501, `${route} should 501 without API_TOKEN, got ${res.status}`);
        assert.match(body.error, /not configured/, `${route} should report auth not configured`);

    }

});
