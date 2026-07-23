const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-collabrules-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-collabrules-${process.pid}.json`);

// executeExternal()'s "request_department_collaboration" case runs a
// real department (DepartmentManager.run()), which (Phase 7) records to
// core/learning/log.js's executions.log -- same backup/restore every
// other file exercising that instrumentation needs.
const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-collabrules-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
});

test.after(() => {
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
});

const CompanyManager = require("../core/executive/companyManager");
const opportunities = require("../core/sales/opportunities");
const campaigns = require("../core/marketing/campaigns");
const operationsKpis = require("../core/operations/kpis");
const ActionProposalEngine = require("../core/executive/actionProposal");
const collaborationRules = require("../core/collaboration/collaborationRules");
const loadAgents = require("../core/agents/loader");
const loadDepartments = require("../core/departments/loader");


test("sales_requests_marketing fires on real open pipeline with no published campaign", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Collab Rules Co XQZCR1" });

    opportunities.createOpportunity({ companyId: company.id, name: "Collab Deal XQZCR1", value: 5000 });

    const found = collaborationRules.detectCollaborationOpportunities(company.id)
        .find(o => o.ruleId === "sales_requests_marketing");

    assert.ok(found);
    assert.strictEqual(found.from, "sales-dept");
    assert.strictEqual(found.to, "marketing-dept");
    assert.match(found.task, /5000/);

});


test("sales_requests_marketing does not fire once a campaign is published", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Collab Rules Co XQZCR2" });

    opportunities.createOpportunity({ companyId: company.id, name: "Collab Deal XQZCR2", value: 5000 });

    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Collab Campaign XQZCR2" });
    campaigns.setPublishingStatus(campaign.id, "published");

    const found = collaborationRules.detectCollaborationOpportunities(company.id)
        .find(o => o.ruleId === "sales_requests_marketing");

    assert.strictEqual(found, undefined);

});


test("marketing_requests_research fires on a real campaign with an audience and zero research missions", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Collab Rules Co XQZCR3" });

    campaigns.createCampaign({ companyId: company.id, objective: "Collab Campaign XQZCR3", audience: "Small business owners XQZCR3" });

    const found = collaborationRules.detectCollaborationOpportunities(company.id)
        .find(o => o.ruleId === "marketing_requests_research");

    assert.ok(found);
    assert.strictEqual(found.from, "marketing-dept");
    assert.strictEqual(found.to, "research-dept");
    assert.match(found.task, /Small business owners XQZCR3/);

});


test("operations_requests_department fires on a real off-track KPI owned by a non-bizops department", () => {

    const kpi = operationsKpis.createKPI({ name: "Collab KPI XQZCR4", target: 100, department: "sales-dept" });
    operationsKpis.recordActual(kpi.id, 10);

    const found = collaborationRules.detectCollaborationOpportunities(null)
        .find(o => o.ruleId === "operations_requests_department" && o.task.includes("Collab KPI XQZCR4"));

    assert.ok(found);
    assert.strictEqual(found.from, "bizops");
    assert.strictEqual(found.to, "sales-dept");

});


test("generateCollaborationProposals() creates real, pending ActionProposalEngine proposals with the right payload", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Collab Rules Co XQZCR5" });

    opportunities.createOpportunity({ companyId: company.id, name: "Collab Deal XQZCR5", value: 7000 });

    const proposals = collaborationRules.generateCollaborationProposals(company.id);

    const proposal = proposals.find(p => p.reason.includes("sales_requests_marketing"));

    assert.ok(proposal);
    assert.strictEqual(proposal.status, "pending");
    assert.strictEqual(proposal.action, "request_department_collaboration");
    assert.strictEqual(proposal.risk, "medium");

});


test("approving and executing a request_department_collaboration proposal actually delegates via the real CollaborationEngine (Phase 50)", async () => {

    const agents = loadAgents();
    const departments = loadDepartments(agents);
    const marketingDept = departments.find(dept => dept.id === "marketing-dept");

    assert.ok(marketingDept, "expected the real marketing-dept package department to be loaded");

    marketingDept.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: "Campaign drafted XQZCR6", provider: "claude", toolCalls: [] }) }
    };
    marketingDept.intelligence.brain.provider.active = "claude";

    const engine = new ActionProposalEngine({ departments });

    const proposal = engine.proposeExternalAction({
        action: "request_department_collaboration",
        reason: "test delegation XQZCR6",
        payload: { fromDepartmentId: "sales-dept", toDepartmentId: "marketing-dept", task: "draft a campaign XQZCR6" }
    });

    engine.approve(proposal.id);

    const executed = await engine.executeExternal(proposal.id);

    assert.strictEqual(executed.status, "executed");
    assert.match(executed.executionOutcome, /Campaign drafted XQZCR6/);

});
