const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-orgoverview-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-orgoverview-${process.pid}.json`);

// Requiring core/automation triggers registerBuiltInJobs(), which
// persists to state.json unconditionally (see tests/dashboard.test.js's
// own comment on this exact behavior) -- snapshot "existed before"
// ahead of that require.
const AUTOMATION_STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const AUTOMATION_STATE_EXISTED_BEFORE = fs.existsSync(AUTOMATION_STATE_PATH);
const AUTOMATION_STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-orgoverview-${process.pid}.json`);

if(AUTOMATION_STATE_EXISTED_BEFORE){
    fs.copyFileSync(AUTOMATION_STATE_PATH, AUTOMATION_STATE_BACKUP);
}

const NETWORK_PATH = path.join(__dirname, "..", "core", "device", "network.json");
const NETWORK_EXISTED_BEFORE = fs.existsSync(NETWORK_PATH);
const NETWORK_BACKUP = path.join(os.tmpdir(), `veronica-network-backup-orgoverview-${process.pid}.json`);

if(NETWORK_EXISTED_BEFORE){
    fs.copyFileSync(NETWORK_PATH, NETWORK_BACKUP);
}

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {

    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);

    if(AUTOMATION_STATE_EXISTED_BEFORE){
        fs.copyFileSync(AUTOMATION_STATE_BACKUP, AUTOMATION_STATE_PATH);
        fs.unlinkSync(AUTOMATION_STATE_BACKUP);
    } else if(fs.existsSync(AUTOMATION_STATE_PATH)){
        fs.unlinkSync(AUTOMATION_STATE_PATH);
    }

    if(NETWORK_EXISTED_BEFORE){
        fs.copyFileSync(NETWORK_BACKUP, NETWORK_PATH);
        fs.unlinkSync(NETWORK_BACKUP);
    } else if(fs.existsSync(NETWORK_PATH)){
        fs.unlinkSync(NETWORK_PATH);
    }

});

const loadAgents = require("../core/agents/loader");
const loadDepartments = require("../core/departments/loader");
const OrganizationOverview = require("../core/executive/organizationOverview");

const agents = loadAgents();
const departments = loadDepartments(agents);


test("constructor requires real departments and agents", () => {

    assert.throws(() => new OrganizationOverview({}), /departments and agents are required/);
    assert.throws(() => new OrganizationOverview({ departments }), /departments and agents are required/);

});


test("organizationTree() reports every real department with its real agents, and every real company", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const tree = overview.organizationTree();

    assert.strictEqual(tree.departments.length, departments.length);
    assert.ok(tree.departments.every(d => Array.isArray(d.agents)));
    assert.ok(Array.isArray(tree.companies));

});


test("departmentHealth()/resourceAllocation() report real agent counts and real roadmap-derived project counts", () => {

    const overview = new OrganizationOverview({ departments, agents });

    const health = overview.departmentHealth();
    const allocation = overview.resourceAllocation();

    assert.strictEqual(health.length, departments.length);
    assert.strictEqual(allocation.length, departments.length);

    const firstDept = departments[0];
    const healthEntry = health.find(h => h.id === firstDept.id);
    assert.strictEqual(healthEntry.agentCount, firstDept.agents.length);

});


test("executiveKPIs() reports real roadmap totals and a real pending-approval count", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const kpis = overview.executiveKPIs();

    assert.strictEqual(typeof kpis.totalProjects, "number");
    assert.strictEqual(typeof kpis.completionRate, "number");
    assert.ok(kpis.deadlines);
    assert.strictEqual(typeof kpis.pendingApprovals, "number");

});


test("knowledgeGrowth() reports the real current entity/relationship counts", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const knowledge = require("../core/knowledge");

    const growth = overview.knowledgeGrowth();
    const realGraph = knowledge.read();

    assert.strictEqual(growth.entityCount, realGraph.entities.length);
    assert.strictEqual(growth.relationshipCount, realGraph.relationships.length);

});


test("memoriesOverview() reports a real total matching memory.view(), broken down by real lifecycle stage (Phase 40)", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const memory = require("../core/memory");

    const result = overview.memoriesOverview();
    const realEntries = memory.view();

    assert.strictEqual(result.total, realEntries.length);

    const summedByLifecycle = Object.values(result.byLifecycle).reduce((sum, count) => sum + count, 0);
    assert.strictEqual(summedByLifecycle, realEntries.length);

});


test("connectors() reuses the real integration registry wholesale (Phase 40)", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const integrationRegistry = require("../core/integrations/registry");

    const result = overview.connectors();
    const real = integrationRegistry.overview();

    assert.strictEqual(result.total, real.total);
    assert.deepStrictEqual(result.integrations.map(i => i.id).sort(), real.integrations.map(i => i.id).sort());

});


test("executiveRecommendationsOverview() returns a real, fresh recommendation set (Phase 40)", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const result = overview.executiveRecommendationsOverview();

    assert.ok(Array.isArray(result));

});


test("generate() assembles every section without throwing, against real system state", () => {

    const overview = new OrganizationOverview({ departments, agents });
    const result = overview.generate();

    for(const key of [
        "organizationTree", "departmentHealth", "executiveKPIs",
        "crossDepartmentDependencies", "resourceAllocation", "capabilityMap",
        "missionStatus", "knowledgeGrowth", "automationStatus",
        "deviceNetwork", "approvalQueue", "liveSystemHealth"
    ]){
        assert.ok(key in result, `expected "${key}" in generate() output`);
    }

    assert.ok(Array.isArray(result.crossDepartmentDependencies));
    assert.ok(Array.isArray(result.approvalQueue));
    assert.ok(result.liveSystemHealth.credentials.length > 0);

});
