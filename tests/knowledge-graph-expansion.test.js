const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-kgexpansion-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-kgexpansion-${process.pid}.json`);

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

const knowledge = require("../core/knowledge");
const CompanyManager = require("../core/executive/companyManager");
const leads = require("../core/sales/leads");
const opportunities = require("../core/sales/opportunities");
const campaigns = require("../core/marketing/campaigns");
const invoices = require("../core/finance/invoices");
const subscriptions = require("../core/finance/subscriptions");
const portfolio = require("../core/trading/portfolio");
const missions = require("../core/research/missions");
const sops = require("../core/operations/sops");
const kpis = require("../core/operations/kpis");
const meetings = require("../core/operations/meetings");


function relationshipExists(from, to, type){
    return knowledge.connections(from).some(
        rel => rel.from.toLowerCase() === from.toLowerCase() &&
            rel.to.toLowerCase() === to.toLowerCase() &&
            rel.type === type
    );
}


test("createLead() connects the lead to its real company in the knowledge graph (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Lead Co XQZKG1" });

    const lead = leads.createLead({ companyId: company.id, name: "KG Lead XQZKG1" });

    assert.ok(relationshipExists(lead.name, company.name, "belongsTo"));

});


test("createOpportunity() connects the opportunity to its real company in the knowledge graph (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Opportunity Co XQZKG2" });

    const opportunity = opportunities.createOpportunity({ companyId: company.id, name: "KG Opportunity XQZKG2", value: 1000 });

    assert.ok(relationshipExists(opportunity.name, company.name, "belongsTo"));

});


test("createCampaign() connects the campaign to its real company in the knowledge graph (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Campaign Co XQZKG3" });

    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "KG Campaign XQZKG3" });

    assert.ok(relationshipExists(campaign.name, company.name, "belongsTo"));

});


test("createInvoice()/createSubscription() connect the real client (not the record itself) to the company (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Finance Co XQZKG4" });

    invoices.createInvoice({ companyId: company.id, clientName: "KG Client XQZKG4", amount: 500 });
    subscriptions.createSubscription({ companyId: company.id, clientName: "KG Client XQZKG4", amount: 50, interval: "monthly" });

    const clientEntity = knowledge.find("KG Client XQZKG4");
    assert.strictEqual(clientEntity.length, 1);
    assert.strictEqual(clientEntity[0].type, "client");

    assert.ok(relationshipExists("KG Client XQZKG4", company.name, "billedBy"));

});


test("createPortfolio() connects to its real company only when company-scoped (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Portfolio Co XQZKG5" });

    const scoped = portfolio.createPortfolio({ name: "KG Scoped Portfolio XQZKG5", companyId: company.id });
    assert.ok(relationshipExists(scoped.name, company.name, "belongsTo"));

    const unscoped = portfolio.createPortfolio({ name: "KG Unscoped Portfolio XQZKG5" });
    assert.strictEqual(knowledge.connections(unscoped.name).length, 0);

});


test("createMission() connects to its real company only when company-scoped (Phase 49)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Mission Co XQZKG6" });

    const scoped = missions.createMission({ objective: "KG Scoped Mission XQZKG6", companyId: company.id });
    assert.ok(relationshipExists(scoped.objective, company.name, "belongsTo"));

    const unscoped = missions.createMission({ objective: "KG Unscoped Mission XQZKG6" });
    assert.strictEqual(knowledge.connections(unscoped.objective).length, 0);

});


test("createSOP()/createKPI() connect to the real department entity when a department is given (Phase 49)", () => {

    const sop = sops.createSOP({ name: "KG SOP XQZKG7", department: "kg-dept-xqzkg7", steps: ["Step 1"] });
    assert.ok(relationshipExists(sop.name, "kg-dept-xqzkg7", "belongsTo"));

    const kpi = kpis.createKPI({ name: "KG KPI XQZKG7", target: 10, department: "kg-dept-xqzkg7" });
    assert.ok(relationshipExists(kpi.name, "kg-dept-xqzkg7", "belongsTo"));

});


test("createMeeting() connects to each real attendee (Phase 49)", () => {

    const meeting = meetings.createMeeting({
        title: "KG Meeting XQZKG8",
        attendees: ["KG Attendee One XQZKG8", "KG Attendee Two XQZKG8"]
    });

    assert.ok(relationshipExists("KG Attendee One XQZKG8", meeting.title, "attended"));
    assert.ok(relationshipExists("KG Attendee Two XQZKG8", meeting.title, "attended"));

});


test("GET-equivalent knowledge.retrieve() finds a real entity plus its real relationships (Phase 49 querying)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "KG Query Co XQZKG9" });

    const lead = leads.createLead({ companyId: company.id, name: "KG Query Lead XQZKG9" });

    const result = knowledge.retrieve("KG Query Lead XQZKG9");

    assert.ok(result.entities.some(e => e.name === lead.name));
    assert.ok(result.relationships.some(rel => rel.from === lead.name && rel.to === company.name));

});
