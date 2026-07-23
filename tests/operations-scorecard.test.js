const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-opsscorecard-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-opsscorecard-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-opsscorecard-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);

    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }
});

const sops = require("../core/operations/sops");
const kpis = require("../core/operations/kpis");
const scorecard = require("../core/operations/scorecard");
const log = require("../core/learning/log");


test("departmentScorecard() reuses OrganizationOverview.departmentHealth() for real per-department health", () => {

    const result = scorecard.departmentScorecard("bizops");

    assert.ok(result.health);
    assert.strictEqual(result.health.id, "bizops");
    assert.strictEqual(result.health.name, "Business Operations");
    assert.ok(typeof result.health.agentCount === "number");

});


test("departmentScorecard() includes real, scoped KPIs and SOP count", () => {

    kpis.createKPI({ name: "Scorecard KPI XQZOS1", department: "bizops", target: 100 });
    sops.createSOP({ name: "Scorecard SOP XQZOS1", department: "bizops", steps: ["Step 1"] });

    const result = scorecard.departmentScorecard("bizops");

    assert.ok(result.kpis.some(kpi => kpi.name === "Scorecard KPI XQZOS1"));
    assert.ok(result.sopCount >= 1);

});


test("departmentScorecard() reuses BlockerDetector wholesale (not a reimplementation), filtering its real output to this department", () => {

    // A stub BlockerDetector, injected the same optional-dependency way
    // every other engine in this codebase supports -- proves
    // departmentScorecard() genuinely calls detect() and filters its
    // real deadlockedProjects by department, rather than computing
    // anything itself.
    const stubBlockerDetector = {
        detect: () => ({
            blockedTasks: [],
            deadlockedProjects: [
                { project: { id: "p1", title: "Bizops Deadlock XQZOS2", department: "bizops" }, remainingTaskCount: 1, holdups: [], reason: "test" },
                { project: { id: "p2", title: "Other Deadlock XQZOS2", department: "sales-dept" }, remainingTaskCount: 1, holdups: [], reason: "test" }
            ]
        })
    };

    const result = scorecard.departmentScorecard("bizops", { blockerDetector: stubBlockerDetector });

    assert.strictEqual(result.deadlockedProjects.length, 1);
    assert.strictEqual(result.deadlockedProjects[0].project.title, "Bizops Deadlock XQZOS2");

});


test("departmentScorecard() reports null health for a department with no real match", () => {

    const result = scorecard.departmentScorecard("not-a-real-department");

    assert.strictEqual(result.health, null);
    assert.deepStrictEqual(result.kpis, []);
    assert.strictEqual(result.sopCount, 0);

});


test("analyzeProcess() combines the real SOP, its department's real execution health, and related KPIs", () => {

    log.record({ kind: "department_run", department: "bizops", agent: "OperationsManager", outcome: "success", durationMs: 50 });

    const sop = sops.createSOP({ name: "Process Analysis SOP XQZOS3", department: "bizops", steps: ["Step 1"] });
    kpis.createKPI({ name: "Process Analysis KPI XQZOS3", department: "bizops", target: 100 });

    const result = scorecard.analyzeProcess(sop.id);

    assert.strictEqual(result.sop.id, sop.id);
    assert.ok(result.executionHealth);
    assert.strictEqual(result.executionHealth.department, "bizops");
    assert.ok(result.relatedKPIs.some(kpi => kpi.name === "Process Analysis KPI XQZOS3"));

});


test("analyzeProcess() reports null executionHealth and empty relatedKPIs for a department-less SOP", () => {

    const sop = sops.createSOP({ name: "No Department SOP XQZOS4", steps: ["Step 1"] });

    const result = scorecard.analyzeProcess(sop.id);

    assert.strictEqual(result.executionHealth, null);
    assert.deepStrictEqual(result.relatedKPIs, []);

});
