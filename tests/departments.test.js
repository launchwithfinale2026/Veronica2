const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// This test touches real, shared state (core/memory/database.json and a
// real department's activity.log), so it relies on `node --test` running
// with --test-concurrency=1 (see package.json) to avoid racing against
// tests/memory-store.test.js, which backs up/restores the same file.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-dept-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "departments", "athena", "logs", "activity.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-athena-log-backup-${process.pid}.log`);

// run() now also records to core/learning/log.js's executions.log --
// same existed-before-this-run treatment as activity.log above.
const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-dept-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);

    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }

    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
});

const DepartmentManager = require("../core/departments/base");
const loadDepartments = require("../core/departments/loader");
const loadAgents = require("../core/agents/loader");

function fakeAgent(name, role = "Test Role"){
    return {
        name,
        role,
        capabilities: ["testing"]
    };
}

// run() now goes through the real core/intelligence -> core/brain ->
// BrainProvider chain (see docs/Architecture.md), the same one
// tests/brain-provider.test.js mocks -- swap in a fake "claude" provider
// so this never makes a real, paid API call.
function mockBrain(manager, responseText){

    manager.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    manager.intelligence.brain.provider.active = "claude";

}

test("run() delegates to the department's agent via real Intelligence and logs the exchange", async () => {

    const before = fs.existsSync(LOG_PATH)
        ? fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean).length
        : 0;

    const manager = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        domain: "Knowledge Intelligence",
        agents: [fakeAgent("METIS")]
    });

    mockBrain(manager, "METIS handled: summarize the quarter");

    const result = await manager.run("summarize the quarter");

    assert.strictEqual(result.agent, "METIS");
    assert.ok(result.response.includes("summarize the quarter"));
    assert.ok(result.thought && result.thought.cognition);

    const after = fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean).length;
    assert.strictEqual(after, before + 1);

    const learningLog = require("../core/learning/log");
    const events = learningLog.readAll();
    const event = events[events.length - 1];

    assert.strictEqual(event.kind, "department_run");
    assert.strictEqual(event.department, "athena");
    assert.strictEqual(event.agent, "METIS");
    assert.strictEqual(event.outcome, "success");
    assert.ok(Number.isFinite(event.durationMs));

});

test("run() logs a failure (to both activity.log and the learning log) and still rejects when the brain throws", async () => {

    const manager = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        domain: "Knowledge Intelligence",
        agents: [fakeAgent("METIS")]
    });

    manager.intelligence.brain.provider.providers = {
        claude: { generate: async () => { throw new Error("brain unavailable XQZFAIL"); } }
    };
    manager.intelligence.brain.provider.active = "claude";

    await assert.rejects(
        () => manager.run("a task that will fail"),
        /brain unavailable XQZFAIL/
    );

    const activity = fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean).map(JSON.parse);
    const lastActivity = activity[activity.length - 1];
    assert.strictEqual(lastActivity.outcome, "failure");
    assert.ok(lastActivity.error.includes("brain unavailable XQZFAIL"));

    const learningLog = require("../core/learning/log");
    const events = learningLog.readAll();
    const event = events[events.length - 1];

    assert.strictEqual(event.kind, "department_run");
    assert.strictEqual(event.outcome, "failure");
    assert.ok(event.error.includes("brain unavailable XQZFAIL"));

});

test("run() throws when the department has no agents", async () => {

    const manager = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        domain: "Knowledge Intelligence",
        agents: []
    });

    await assert.rejects(() => manager.run("anything"));

});

test("remember()/recall() scope shared memory by department tag", () => {

    const athena = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        agents: []
    });

    const hades = new DepartmentManager({
        id: "hades",
        name: "HADES",
        agents: []
    });

    athena.remember("a knowledge finding unique marker QAZWSX");
    hades.remember("a finance finding, different department");

    const athenaMemories = athena.recall();
    const hadesMemories = hades.recall();

    assert.ok(athenaMemories.some(m => m.content.includes("QAZWSX")));
    assert.ok(!hadesMemories.some(m => m.content.includes("QAZWSX")));

});

test("statusReport() reflects id, domain, agents, and status", () => {

    const manager = new DepartmentManager({
        id: "hades",
        name: "HADES",
        domain: "Finance Resources",
        status: "active",
        agents: [fakeAgent("PLUTUS")]
    });

    const report = manager.statusReport();

    assert.strictEqual(report.id, "hades");
    assert.strictEqual(report.domain, "Finance Resources");
    assert.deepStrictEqual(report.agents, ["PLUTUS"]);
    assert.strictEqual(report.status, "active");

});

test("loader wires all 9 registry departments to their matching agent", () => {

    const agents = loadAgents();
    const departments = loadDepartments(agents);

    assert.strictEqual(departments.length, 9);

    const athena = departments.find(d => d.id === "athena");
    assert.strictEqual(athena.agents.length, 1);
    assert.strictEqual(athena.agents[0].name, "METIS");

});
