const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-execintel-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-execintel-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const CompanyManager = require("../core/executive/companyManager");
const ExecutivePlanner = require("../core/executive/planner");
const GoalDecomposer = require("../core/executive/decomposer");
const ProjectManager = require("../core/executive/projectManager");
const opportunities = require("../core/sales/opportunities");
const campaigns = require("../core/marketing/campaigns");
const operationsKpis = require("../core/operations/kpis");
const IntelligenceEngine = require("../core/intelligence");
const executiveIntelligence = require("../core/executive/executiveIntelligence");


function mockDecomposerBrain(decomposer, responseObj){
    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    decomposer.intelligence.brain.provider.active = "claude";
}

function mockIntelligence(responseText){

    const engine = new IntelligenceEngine();

    engine.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };
    engine.brain.provider.active = "claude";

    return engine;

}


test("companyHealthScore() reports null for every category on a brand new company (no fabricated scores)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Health Score Co XQZEI1" });

    const health = executiveIntelligence.companyHealthScore(company.id);

    assert.strictEqual(health.overallScore, null);
    assert.strictEqual(health.categories.finance, null);
    assert.strictEqual(health.categories.sales, null);
    assert.strictEqual(health.categories.marketing, null);
    assert.deepStrictEqual(health.scoredCategories, []);
    assert.deepStrictEqual(health.unscoredCategories, ["finance", "sales", "marketing"]);

});


test("companyHealthScore() scores finance/sales/marketing from real data and averages only the scored categories", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Health Score Co XQZEI2" });

    // Finance: profitable (net revenue > expense) -- real ledger entries.
    companyManager.recordFinance(company.id, { label: "Invoice XQZEI2", amount: 10000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Rent XQZEI2", amount: 1000, type: "expense" });

    // Sales: one won deal out of one closed -- 100% win rate.
    const opportunity = opportunities.createOpportunity({ companyId: company.id, name: "Deal XQZEI2", value: 5000 });
    opportunities.setStage(opportunity.id, "closed_won", { reason: "Signed" });

    // Marketing: no campaigns at all -- stays unscored.
    const health = executiveIntelligence.companyHealthScore(company.id);

    assert.strictEqual(health.categories.finance.score, 100);
    assert.strictEqual(health.categories.sales.score, 100);
    assert.strictEqual(health.categories.marketing, null);
    assert.deepStrictEqual(health.scoredCategories.sort(), ["finance", "sales"]);
    assert.strictEqual(health.overallScore, 100);

});


test("riskForecast() reports a real low-runway risk from actual finance data", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Risk Co XQZEI3" });

    // Only one month of real ledger history exists, so cashFlow()'s
    // single bucket's net equals the all-time cash-on-hand -- a net
    // negative here means both are negative, giving a real "burning"
    // status with 0 months of runway (cashOnHand isn't positive).
    companyManager.recordFinance(company.id, { label: "Revenue XQZEI3", amount: 1000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Big expense XQZEI3", amount: 1200, type: "expense" });

    const risk = executiveIntelligence.riskForecast(company.id);

    const lowRunwayRisk = risk.risks.find(r => r.kind === "low_runway");
    assert.ok(lowRunwayRisk, "expected a low_runway risk to be reported");
    assert.strictEqual(lowRunwayRisk.severity, "high");

});


test("riskForecast() reports a real deadlocked-project risk scoped to the correct company only", async () => {

    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Deadlock Co XQZEI4" });

    const project = realPlanner.plan({ title: "Deadlocked project XQZEI4", department: "ares", company: company.id });

    const scoped = {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        roadmap: (opts) => realPlanner.roadmap(opts).filter(p => p.id === project.id)
    };

    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZEI4", tasks: [{ title: "Task XQZEI4", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Access denied: simulated XQZEI4");

    // BlockerDetector inside riskForecast() builds its own real planner/
    // projectManager (unscoped) -- deadlocked projects across the WHOLE
    // roadmap get filtered down to just this company inside riskForecast()
    // itself, so this is exercising the real, unscoped detection path.
    const risk = executiveIntelligence.riskForecast(company.id);

    const deadlockRisk = risk.risks.find(r => r.kind === "deadlocked_project" && r.detail.includes("XQZEI4"));
    assert.ok(deadlockRisk, "expected this company's deadlocked project to be reported");

    const otherCompany = companyManager.createCompany({ name: "Unrelated Co XQZEI4" });
    const otherCompanyRisk = executiveIntelligence.riskForecast(otherCompany.id);
    assert.ok(!otherCompanyRisk.risks.some(r => r.detail && r.detail.includes("XQZEI4")));

});


test("riskForecast() reports a real off-track KPI", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KPI Risk Co XQZEI5" });

    const kpi = operationsKpis.createKPI({ name: "Uptime XQZEI5", target: 99, direction: "higher_is_better" });
    operationsKpis.recordActual(kpi.id, 50);

    const risk = executiveIntelligence.riskForecast(company.id);

    const kpiRisk = risk.risks.find(r => r.kind === "kpi_off_track" && r.detail.includes("Uptime XQZEI5"));
    assert.ok(kpiRisk, "expected the off-track KPI to be reported");

});


test("crossDepartmentRecommendations() flags real open sales pipeline with no published marketing campaign", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Cross Dept Co XQZEI6" });

    opportunities.createOpportunity({ companyId: company.id, name: "Big Deal XQZEI6", value: 20000 });

    const result = executiveIntelligence.crossDepartmentRecommendations(company.id);

    assert.strictEqual(result.recommendations.length, 1);
    assert.strictEqual(result.recommendations[0].kind, "sales_pipeline_without_marketing_support");
    assert.deepStrictEqual(result.recommendations[0].departments, ["sales-dept", "marketing-dept"]);

});


test("crossDepartmentRecommendations() does not flag pipeline once a campaign is published", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Cross Dept Co XQZEI7" });

    opportunities.createOpportunity({ companyId: company.id, name: "Big Deal XQZEI7", value: 20000 });

    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Support the pipeline XQZEI7" });
    campaigns.setPublishingStatus(campaign.id, "published");

    const result = executiveIntelligence.crossDepartmentRecommendations(company.id);

    assert.strictEqual(result.recommendations.length, 0);

});


test("quarterlyPlan()/annualPlan() filter real roadmap projects and KPIs by real period", () => {

    const companyManager = new CompanyManager();
    const realPlanner = new ExecutivePlanner();
    const company = companyManager.createCompany({ name: "Planning Co XQZEI8" });

    const inQuarterProject = realPlanner.plan({
        title: "Q2 project XQZEI8",
        department: "ares",
        company: company.id,
        deadline: "2026-05-15"
    });

    realPlanner.plan({
        title: "Later project XQZEI8",
        department: "ares",
        company: company.id,
        deadline: "2026-11-01"
    });

    operationsKpis.createKPI({ name: "Q2 KPI XQZEI8", target: 10, period: "2026-05" });
    operationsKpis.createKPI({ name: "Q4 KPI XQZEI8", target: 10, period: "2026-11" });

    const quarter = executiveIntelligence.quarterlyPlan(company.id, { year: 2026, quarter: 2 });

    assert.ok(quarter.projects.some(p => p.id === inQuarterProject.id));
    assert.strictEqual(quarter.projects.some(p => p.title.includes("Later project XQZEI8")), false);
    assert.ok(quarter.kpis.some(k => k.name === "Q2 KPI XQZEI8"));
    assert.strictEqual(quarter.kpis.some(k => k.name === "Q4 KPI XQZEI8"), false);

    const year = executiveIntelligence.annualPlan(company.id, { year: 2026 });

    assert.ok(year.projects.some(p => p.title.includes("Q2 project XQZEI8")));
    assert.ok(year.projects.some(p => p.title.includes("Later project XQZEI8")));

});


test("generateExecutiveBrief() synthesizes real health/risk/cross-department data via the LLM and persists it to memory", async () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Brief Co XQZEI9" });

    companyManager.recordFinance(company.id, { label: "Revenue XQZEI9", amount: 5000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Expense XQZEI9", amount: 1000, type: "expense" });

    const intelligence = mockIntelligence("This company is profitable with a health score of 100.");

    const result = await executiveIntelligence.generateExecutiveBrief(company.id, { intelligence });

    assert.strictEqual(result.brief, "This company is profitable with a health score of 100.");
    assert.strictEqual(result.health.companyId, company.id);
    assert.ok(result.id);

    const history = executiveIntelligence.briefHistory(company.id);
    assert.strictEqual(history[0].id, result.id);
    assert.strictEqual(history[0].brief, result.brief);

});
