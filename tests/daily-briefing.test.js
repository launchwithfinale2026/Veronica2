const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-briefing-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-briefing-${process.pid}.json`);

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

const ExecutivePlanner = require("../core/executive/planner");
const ProjectManager = require("../core/executive/projectManager");
const PriorityRanking = require("../core/executive/priorityRanking");
const GoalMonitor = require("../core/executive/goalMonitor");
const BlockerDetector = require("../core/executive/blockerDetection");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");
const DailyBriefingEngine = require("../core/executive/dailyBriefing");
const eventIngestion = require("../core/integrations/eventIngestion");

function scopedPlanner(realPlanner, allowedIds){
    return {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        urgencyScore: (deadline) => realPlanner.urgencyScore(deadline),
        roadmap: (opts) => realPlanner.roadmap(opts).filter(p => allowedIds.includes(p.id)),
        evaluateDeadlines(){
            const grouped = { overdue: [], due_soon: [], on_track: [], no_deadline: [] };
            for(const project of realPlanner.roadmap().filter(p => allowedIds.includes(p.id))){
                grouped[project.deadlineStatus].push(project);
            }
            return grouped;
        }
    };
}

function makeBriefingEngine(scoped){
    const projectManager = new ProjectManager({ planner: scoped });
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const goalMonitor = new GoalMonitor({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector });
    return new DailyBriefingEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine });
}


test("generate() assembles a roadmap summary, top priorities, goal issues, blockers, and recommendations", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Briefing project XQZBRIEF1", department: "ares", priority: 5 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    const result = briefing.generate();

    assert.ok(result.date);
    assert.strictEqual(result.roadmap.totalProjects, 1);
    assert.ok(result.topPriorities.some(entry => entry.project === project.id));
    assert.ok(Array.isArray(result.goalIssues.stalledProjects));
    assert.ok(Array.isArray(result.blockers.deadlockedProjects));
    assert.ok(Array.isArray(result.recommendations));

});


test("generate() surfaces recent external connector events (Phase 19 executive awareness)", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Briefing external-events project XQZBRIEF5", department: "ares", priority: 3 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    eventIngestion.ingest({
        source: "github",
        kind: "pull_request",
        summary: "New PR XQZBRIEF5: fix flaky test"
    });

    const result = briefing.generate();

    const match = result.externalEvents.find(e => e.summary.includes("XQZBRIEF5"));
    assert.ok(match);
    assert.strictEqual(match.source, "github");
    assert.strictEqual(match.kind, "pull_request");

});


test("generate() surfaces pending approvals, company health, mission status, package updates, and learning summary (Phase 37 Executive Assistant)", async () => {

    // Unscoped (real, unfiltered) planner deliberately -- MissionEngine's
    // defineMission() creates a NEW project with an id no allow-list
    // fixed ahead of time could include (see mission-engine.test.js's own
    // comment on this exact issue), so this test doesn't scope the
    // planner the way the others in this file do. The whole file's own
    // database.json/graph.json backup/restore already isolates the real
    // project this creates from any other test run.
    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    // A real pending proposal via the SAME actionProposalEngine instance
    // the briefing itself uses.
    const proposal = briefing.actionProposalEngine.proposeExternalAction({
        action: "post_discord_message",
        reason: "Briefing test proposal XQZBRIEF6",
        payload: { content: "test" }
    });

    // A real company via the SAME companyManager instance.
    briefing.companyManager.createCompany({ name: "Briefing Test Co XQZBRIEF6" });

    // A real mission via the SAME missionEngine instance (real
    // decomposition needs a real/mocked brain -- mock it the same way
    // mission-engine.test.js does).
    briefing.missionEngine.decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify({ milestones: [] }), provider: "claude", toolCalls: [] }) }
    };
    briefing.missionEngine.decomposer.intelligence.brain.provider.active = "claude";
    const mission = await briefing.missionEngine.defineMission("Briefing mission XQZBRIEF6", { department: "ares" });

    const result = briefing.generate();

    assert.ok(result.pendingApprovals.some(p => p.id === proposal.id));
    assert.ok(result.companyHealth.some(c => c.name === "Briefing Test Co XQZBRIEF6"));
    assert.ok(result.missionStatus.some(m => m.id === mission.id));
    assert.ok(Array.isArray(result.packageUpdates));
    assert.strictEqual(typeof result.learningSummary.total, "number");

});


test("generate() surfaces real Department Health and Campaign Health (Phase 41 Executive Daily Operations)", () => {

    const CompanyManager = require("../core/executive/companyManager");
    const campaigns = require("../core/marketing/campaigns");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    // Department Health: reuses OrganizationOverview.departmentHealth()
    // wholesale -- this machine has real, active package departments
    // (Phase 35/41), so this must include at least the built-in roster,
    // each with a real agentCount.
    const result = briefing.generate();

    assert.ok(result.departmentHealth.length >= 9);
    assert.ok(result.departmentHealth.every(dept => typeof dept.agentCount === "number"));
    const marketingDept = result.departmentHealth.find(dept => dept.id === "marketing-dept");
    assert.ok(marketingDept);
    assert.strictEqual(marketingDept.agentCount, 6);

    // Campaign Health: a real company with zero campaigns must NOT
    // appear (keeps the briefing focused); one with a real campaign
    // nearing its timeline deadline, still unpublished, must show up
    // with the real, computed rollup.
    const quietCompany = briefing.companyManager.createCompany({ name: "Briefing Quiet Co XQZBRIEF7" });
    const activeCompany = briefing.companyManager.createCompany({ name: "Briefing Active Co XQZBRIEF7" });

    const campaign = campaigns.createCampaign({
        companyId: activeCompany.id,
        objective: "Briefing campaign health XQZBRIEF7",
        timeline: { end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }
    });
    campaigns.setApprovalStatus(campaign.id, "approved");

    const withCampaigns = briefing.generate();

    assert.ok(!withCampaigns.campaignHealth.some(entry => entry.companyId === quietCompany.id));

    const activeHealth = withCampaigns.campaignHealth.find(entry => entry.companyId === activeCompany.id);
    assert.ok(activeHealth);
    assert.strictEqual(activeHealth.totalCampaigns, 1);
    assert.strictEqual(activeHealth.pendingApproval, 0);
    assert.strictEqual(activeHealth.approvedNotPublished, 1);
    assert.strictEqual(activeHealth.nearingDeadline, 1);

});


test("generate() surfaces real Sales Health (Phase 42 Executive Daily Operations)", () => {

    const opportunities = require("../core/sales/opportunities");
    const leads = require("../core/sales/leads");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    const quietCompany = briefing.companyManager.createCompany({ name: "Sales Briefing Quiet Co XQZBRIEF8" });
    const activeCompany = briefing.companyManager.createCompany({ name: "Sales Briefing Active Co XQZBRIEF8" });

    leads.createLead({ companyId: activeCompany.id, name: "Briefing Lead XQZBRIEF8" });

    const opp = opportunities.createOpportunity({ companyId: activeCompany.id, name: "Briefing Deal XQZBRIEF8", value: 4000 });
    opportunities.setStage(opp.id, "qualified");
    opportunities.scheduleFollowUp(opp.id, { date: "2020-01-01T00:00:00.000Z", note: "Overdue follow-up XQZBRIEF8" });

    const result = briefing.generate();

    // A company with zero leads and zero opportunities must not appear.
    assert.ok(!result.salesHealth.some(entry => entry.companyId === quietCompany.id));

    const activeHealth = result.salesHealth.find(entry => entry.companyId === activeCompany.id);
    assert.ok(activeHealth);
    assert.strictEqual(activeHealth.openLeads, 1);
    assert.strictEqual(activeHealth.openOpportunities, 1);
    assert.strictEqual(activeHealth.weightedForecast, 1000);
    assert.strictEqual(activeHealth.overdueFollowUps, 1);

});


test("generate() surfaces real Finance Health (Phase 43 Executive Daily Operations)", () => {

    const invoices = require("../core/finance/invoices");
    const budgets = require("../core/finance/budgets");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    const quietCompany = briefing.companyManager.createCompany({ name: "Finance Briefing Quiet Co XQZBRIEF9" });
    const activeCompany = briefing.companyManager.createCompany({ name: "Finance Briefing Active Co XQZBRIEF9" });

    briefing.companyManager.recordFinance(activeCompany.id, { label: "Revenue XQZBRIEF9", amount: 1000, type: "revenue" });

    const overdueInvoice = invoices.createInvoice({ companyId: activeCompany.id, clientName: "Overdue Client XQZBRIEF9", amount: 500, dueDate: "2020-01-01" });
    invoices.setInvoiceStatus(overdueInvoice.id, "sent");

    const result = briefing.generate();

    // A company with zero finance activity must not appear.
    assert.ok(!result.financeHealth.some(entry => entry.companyId === quietCompany.id));

    const activeHealth = result.financeHealth.find(entry => entry.companyId === activeCompany.id);
    assert.ok(activeHealth);
    assert.strictEqual(activeHealth.cashOnHand, 1000);
    assert.strictEqual(activeHealth.runwayStatus, "profitable");
    assert.strictEqual(activeHealth.overdueInvoiceCount, 1);
    assert.strictEqual(activeHealth.overBudgetCount, 0);

});


test("generate() surfaces real, system-wide Research Status (Phase 44 Executive Daily Operations)", async () => {

    const http = require("../core/integrations/http");
    const ResearchEngine = require("../core/research/engine");
    const researchMissions = require("../core/research/missions");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    const before = briefing.generate().researchStatus;

    const mission = researchMissions.createMission({ objective: "Briefing research status XQZBRIEF10" });

    const extractionEngine = new ResearchEngine();
    extractionEngine.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify({ summary: "Finding XQZBRIEF10", keyFacts: [], confidence: 0.7 }), provider: "claude", toolCalls: [] }) }
    };
    extractionEngine.intelligence.brain.provider.active = "claude";

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: "<title>T</title><p>XQZBRIEF10</p>" });

    try {
        await researchMissions.addCitation(mission.id, { topic: "Topic XQZBRIEF10", url: "https://example.test/xqzbrief10" }, { researchEngine: extractionEngine });
    } finally {
        http.request = originalRequest;
    }

    const after = briefing.generate().researchStatus;

    // Deltas, not absolute values -- researchStatus() is a real,
    // system-wide rollup (missions aren't company-scoped), so this
    // asserts only what THIS test's own activity actually changed,
    // regardless of whatever else might already be in the store.
    assert.strictEqual(after.totalMissions, before.totalMissions + 1);
    assert.strictEqual(after.inProgress, before.inProgress + 1);
    assert.strictEqual(after.completed, before.completed);
    assert.ok(typeof after.avgSourceConfidence === "number" && after.avgSourceConfidence > 0);

});


test("generate() surfaces real, system-wide Trading Status (Phase 45 Executive Daily Operations)", () => {

    const tradingPortfolio = require("../core/trading/portfolio");
    const paperTrading = require("../core/trading/paperTrading");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    const before = briefing.generate().tradingStatus;

    const portfolio = tradingPortfolio.createPortfolio({ name: "Briefing Trading Portfolio XQZBRIEF11", startingCash: 10000 });
    paperTrading.executePaperTrade({ portfolioId: portfolio.id, symbol: "ACME", side: "buy", quantity: 10, price: 100 });
    paperTrading.executePaperTrade({ portfolioId: portfolio.id, symbol: "ACME", side: "sell", quantity: 5, price: 120 });

    const after = briefing.generate().tradingStatus;

    // Deltas, not absolute values -- same reasoning as researchStatus()
    // above (tradingStatus() is system-wide, not per-company).
    assert.strictEqual(after.totalPortfolios, before.totalPortfolios + 1);
    // Sold 5 of 10 shares bought at 100, for 120 -- realized P&L = 100.
    assert.strictEqual(after.totalRealizedPnl, before.totalRealizedPnl + 100);
    assert.strictEqual(after.openPositions, before.openPositions + 1);

});


test("generate() surfaces real, system-wide Operations Status (Phase 46 Executive Daily Operations)", () => {

    const sops = require("../core/operations/sops");
    const kpis = require("../core/operations/kpis");
    const meetings = require("../core/operations/meetings");

    const realPlanner = new ExecutivePlanner();
    const briefing = makeBriefingEngine(realPlanner);

    const before = briefing.generate().operationsStatus;

    sops.createSOP({ name: "Briefing Ops SOP XQZBRIEF12", steps: ["Step 1"] });

    const kpi = kpis.createKPI({ name: "Briefing Ops KPI XQZBRIEF12", target: 100 });
    kpis.recordActual(kpi.id, 50); // below target -- off track

    meetings.createMeeting({
        title: "Briefing Ops Meeting XQZBRIEF12",
        actionItems: [{ text: "Open item XQZBRIEF12" }]
    });

    const after = briefing.generate().operationsStatus;

    assert.strictEqual(after.totalSOPs, before.totalSOPs + 1);
    assert.strictEqual(after.totalKPIs, before.totalKPIs + 1);
    assert.strictEqual(after.offTrackKPIs, before.offTrackKPIs + 1);
    assert.strictEqual(after.openActionItems, before.openActionItems + 1);

});


test("generate() and run()'s recommendations are computed identically", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({
        title: "Briefing recommendation consistency project XQZBRIEF2",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    const generated = briefing.generate();
    const record = briefing.run();

    const generatedForThisProject = generated.recommendations.filter(r => r.subject === project.id);
    const persistedForThisProject = record.recommendations.filter(r => r.subject === project.id);

    assert.deepStrictEqual(persistedForThisProject, generatedForThisProject);
    assert.ok(generatedForThisProject.length > 0);

});


test("run() persists a briefing record, also persists a matching recommendation run, and history() returns both", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Persisted briefing project XQZBRIEF3", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const goalMonitor = new GoalMonitor({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector });
    const briefing = new DailyBriefingEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine });

    const record = briefing.run();

    assert.ok(record.id);
    assert.strictEqual(record.roadmap.totalProjects, 1);

    const briefingHistory = briefing.history(50);
    assert.ok(briefingHistory.some(r => r.id === record.id));

    const recommendationHistory = recommendationEngine.history(50);
    assert.ok(recommendationHistory.length >= 1);

});


test("run() also runs the Phase 12 memory lifecycle sweep and records its transitions on the briefing", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Briefing memory evolution project XQZBRIEF4", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    const record = briefing.run();

    assert.ok(Array.isArray(record.memoryEvolution));

});
