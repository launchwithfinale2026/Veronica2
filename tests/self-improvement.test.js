const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-selfimprove-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-selfimprove-${process.pid}.log`);

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-selfimprove-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
});

test.afterEach(() => {
    delete process.env.API_TOKEN;
    delete process.env.SERVICE_ALLOWLIST;
});

const learningLog = require("../core/learning/log");
const registry = require("../core/capabilities/registry");
const SelfImprovementEngine = require("../core/system/selfImprovement");


test("securityReport() reflects real, live env state, not a fabricated finding", () => {

    delete process.env.API_TOKEN;
    delete process.env.SERVICE_ALLOWLIST;

    const engine = new SelfImprovementEngine();
    const before = engine.securityReport();

    assert.strictEqual(before.apiTokenConfigured, false);
    assert.strictEqual(before.serviceAllowlistConfigured, false);
    assert.ok(before.unconfiguredConnectors.includes("github"));

    process.env.API_TOKEN = "x";
    process.env.SERVICE_ALLOWLIST = "example.com";

    const after = engine.securityReport();
    assert.strictEqual(after.apiTokenConfigured, true);
    assert.strictEqual(after.serviceAllowlistConfigured, true);
    assert.deepStrictEqual(after.allowlistedHosts, ["example.com"]);

});


test("duplicatedCapabilities() finds a real tool id declared by two installed packages", () => {

    const engine = new SelfImprovementEngine();

    const manifestA = { name: "dup-pkg-a-xqzsi1", version: "1.0.0", description: "test", tools: [{ id: "shared.tool.xqzsi1" }] };
    const manifestB = { name: "dup-pkg-b-xqzsi1", version: "1.0.0", description: "test", tools: [{ id: "shared.tool.xqzsi1" }] };

    registry.register({ ...manifestA, status: "installed", source: "/tmp/a", manifest: manifestA });
    registry.setStatus("dup-pkg-a-xqzsi1", "active");
    registry.register({ ...manifestB, status: "installed", source: "/tmp/b", manifest: manifestB });
    registry.setStatus("dup-pkg-b-xqzsi1", "active");

    const duplicated = engine.duplicatedCapabilities();
    const found = duplicated.find(d => d.toolId === "shared.tool.xqzsi1");

    assert.ok(found);
    assert.deepStrictEqual(found.declaredBy.sort(), ["dup-pkg-a-xqzsi1", "dup-pkg-b-xqzsi1"]);

    registry.remove("dup-pkg-a-xqzsi1");
    registry.remove("dup-pkg-b-xqzsi1");

});


test("poorPerformers() flags a real department with enough volume and a high failure rate, ignoring low-volume noise", () => {

    const engine = new SelfImprovementEngine();

    for(let i = 0; i < 4; i++){
        learningLog.record({ kind: "department_run", department: "xqzsi2-dept", outcome: "failure", durationMs: 10 });
    }
    learningLog.record({ kind: "department_run", department: "xqzsi2-dept", outcome: "success", durationMs: 10 });

    // Only 2 executions -- below MIN_EXECUTIONS_FOR_SIGNAL, should NOT
    // be flagged even at 100% failure.
    learningLog.record({ kind: "department_run", department: "xqzsi2-lowvolume", outcome: "failure", durationMs: 10 });
    learningLog.record({ kind: "department_run", department: "xqzsi2-lowvolume", outcome: "failure", durationMs: 10 });

    const result = engine.poorPerformers();

    assert.ok(result.departments.some(d => d.department === "xqzsi2-dept"));
    assert.ok(!result.departments.some(d => d.department === "xqzsi2-lowvolume"));

});


test("generate() assembles a complete report with real optimization/refactor/recommendation queues, and run()/history() persist it", () => {

    const engine = new SelfImprovementEngine();

    const report = engine.generate();

    assert.ok(report.generatedAt);
    assert.ok(Array.isArray(report.optimizationQueue));
    assert.ok(Array.isArray(report.refactorQueue));
    assert.ok(Array.isArray(report.improvementRecommendations));
    assert.ok(report.architectureDebt.length > 0);
    assert.ok(report.performanceReport.overview);
    assert.ok(report.securityReport);

    // Every architecture debt item surfaces as a recommendation too --
    // "no autonomous execution, only proposals" per this phase's ask.
    assert.ok(report.improvementRecommendations.some(r => r.kind === "architecture_debt"));

    const persisted = engine.run();
    assert.strictEqual(persisted.optimizationQueue.length, report.optimizationQueue.length);

    const history = engine.history(1);
    assert.strictEqual(history[0].id, persisted.id);

});
