const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-mktganalytics-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-mktganalytics-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-mktganalytics-${process.pid}.log`);

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
const campaigns = require("../core/marketing/campaigns");
const analytics = require("../core/marketing/analytics");
const log = require("../core/learning/log");


test("campaignPerformance() sums real, tolerant-of-different-metric-names totals across every campaign for a company", () => {

    const company = new CompanyManager().createCompany({ name: "Analytics Co XQZA1" });

    const campaignA = campaigns.createCampaign({ companyId: company.id, objective: "Analytics campaign A XQZA1" });
    const campaignB = campaigns.createCampaign({ companyId: company.id, objective: "Analytics campaign B XQZA1" });

    campaigns.recordMetrics(campaignA.id, { impressions: 1000, clicks: 50 });
    campaigns.recordMetrics(campaignB.id, { impressions: 500, conversions: 10 });

    const performance = analytics.campaignPerformance(company.id);

    assert.strictEqual(performance.campaigns.length, 2);
    assert.deepStrictEqual(performance.totals, { impressions: 1500, clicks: 50, conversions: 10 });

});


test("campaignPerformance() scopes to only the given company", () => {

    const companyA = new CompanyManager().createCompany({ name: "Analytics Scope Co A XQZA2" });
    const companyB = new CompanyManager().createCompany({ name: "Analytics Scope Co B XQZA2" });

    campaigns.createCampaign({ companyId: companyA.id, objective: "A campaign XQZA2" });
    campaigns.createCampaign({ companyId: companyB.id, objective: "B campaign XQZA2" });

    const performance = analytics.campaignPerformance(companyA.id);

    assert.strictEqual(performance.campaigns.length, 1);

});


test("executionHealth() reads the marketing department's real execution telemetry from core/learning, generically -- no marketing-specific tracking needed", () => {

    log.record({ kind: "department_run", department: "marketing-dept", agent: "CampaignManager", outcome: "success", durationMs: 120 });
    log.record({ kind: "department_run", department: "marketing-dept", agent: "CampaignManager", outcome: "success", durationMs: 80 });

    const health = analytics.executionHealth();

    assert.ok(health);
    assert.strictEqual(health.department, "marketing-dept");
    assert.ok(health.total >= 2);
    assert.ok(health.successes >= 2);

});


test("campaignPerformance() includes executionHealth alongside per-company campaign metrics", () => {

    const company = new CompanyManager().createCompany({ name: "Analytics Health Co XQZA3" });
    campaigns.createCampaign({ companyId: company.id, objective: "Analytics health campaign XQZA3" });

    log.record({ kind: "department_run", department: "marketing-dept", agent: "CampaignManager", outcome: "success", durationMs: 100 });

    const performance = analytics.campaignPerformance(company.id);

    assert.ok(performance.executionHealth);
    assert.strictEqual(performance.executionHealth.department, "marketing-dept");

});
