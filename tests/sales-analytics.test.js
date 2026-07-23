const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-salesanalytics-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-salesanalytics-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-salesanalytics-${process.pid}.log`);

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

const CompanyManager = require("../core/executive/companyManager");
const opportunities = require("../core/sales/opportunities");
const leads = require("../core/sales/leads");
const analytics = require("../core/sales/analytics");
const log = require("../core/learning/log");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("winLossAnalytics() computes a real win rate, average won value, and a genuine loss-reason breakdown", () => {

    const company = makeCompany("WinLoss Co XQZSA1");

    const won1 = opportunities.createOpportunity({ companyId: company.id, name: "Won 1 XQZSA1", value: 10000 });
    opportunities.setStage(won1.id, "closed_won", { reason: "Great fit XQZSA1" });

    const won2 = opportunities.createOpportunity({ companyId: company.id, name: "Won 2 XQZSA1", value: 20000 });
    opportunities.setStage(won2.id, "closed_won", { reason: "Great fit XQZSA1" });

    const lost1 = opportunities.createOpportunity({ companyId: company.id, name: "Lost 1 XQZSA1", value: 5000 });
    opportunities.setStage(lost1.id, "closed_lost", { reason: "Too expensive XQZSA1" });

    const open = opportunities.createOpportunity({ companyId: company.id, name: "Open XQZSA1", value: 1000 });

    const result = analytics.winLossAnalytics(company.id);

    assert.strictEqual(result.totalClosed, 3);
    assert.strictEqual(result.won, 2);
    assert.strictEqual(result.lost, 1);
    assert.strictEqual(result.winRate, 2 / 3);
    assert.strictEqual(result.avgWonValue, 15000);
    assert.deepStrictEqual(result.lossReasons, { "Too expensive XQZSA1": 1 });

});


test("winLossAnalytics() reports null winRate when nothing has closed yet, not a fabricated number", () => {

    const company = makeCompany("No Closed Co XQZSA2");
    opportunities.createOpportunity({ companyId: company.id, name: "Still Open XQZSA2", value: 1000 });

    const result = analytics.winLossAnalytics(company.id);

    assert.strictEqual(result.totalClosed, 0);
    assert.strictEqual(result.winRate, null);
    assert.strictEqual(result.avgWonValue, 0);

});


test("executionHealth() reads sales-dept's real execution telemetry from core/learning, generically", () => {

    log.record({ kind: "department_run", department: "sales-dept", agent: "SalesAgent", outcome: "success", durationMs: 90 });
    log.record({ kind: "department_run", department: "sales-dept", agent: "SalesAgent", outcome: "success", durationMs: 60 });

    const health = analytics.executionHealth();

    assert.ok(health);
    assert.strictEqual(health.department, "sales-dept");
    assert.ok(health.total >= 2);

});


test("salesOverview() combines win/loss, pipeline forecast, lead count, and execution health in one call", () => {

    const company = makeCompany("Overview Co XQZSA3");

    leads.createLead({ companyId: company.id, name: "Overview Lead XQZSA3" });

    const opp = opportunities.createOpportunity({ companyId: company.id, name: "Overview Deal XQZSA3", value: 8000 });
    opportunities.setStage(opp.id, "qualified");

    const overview = analytics.salesOverview(company.id);

    assert.strictEqual(overview.leadCount, 1);
    assert.strictEqual(overview.pipeline.byStage.qualified.count, 1);
    assert.strictEqual(overview.winLoss.totalClosed, 0);
    assert.ok("executionHealth" in overview);

});
