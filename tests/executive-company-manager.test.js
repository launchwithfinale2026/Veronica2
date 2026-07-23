const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as the other executive test
// files -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-cm-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-cm-${process.pid}.json`);

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
const CompanyManager = require("../core/executive/companyManager");
const knowledge = require("../core/knowledge");

function makeStack(){

    const planner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner });

    return { planner, companyManager };

}

test("createCompany() persists the company and links a knowledge entity + staffedBy relationships", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({
        name: "Acme Rockets XQZC1",
        industry: "aerospace",
        departments: ["hephaestus", "hades"]
    });

    assert.ok(company.id);
    assert.strictEqual(company.name, "Acme Rockets XQZC1");
    assert.strictEqual(company.status, "active");
    assert.deepStrictEqual(company.departments, ["hephaestus", "hades"]);

    const connections = knowledge.connections("Acme Rockets XQZC1");
    assert.ok(connections.some(rel => rel.type === "staffedBy" && rel.to === "hephaestus"));
    assert.ok(connections.some(rel => rel.type === "staffedBy" && rel.to === "hades"));

});

test("createCompany() rejects an unknown department and requires a name", () => {

    const { companyManager } = makeStack();

    assert.throws(() => companyManager.createCompany({ name: "Bad dept co XQZC2", departments: ["not-a-real-dept"] }));
    assert.throws(() => companyManager.createCompany({}));

});

test("listCompanies() returns every created company", () => {

    const { companyManager } = makeStack();

    companyManager.createCompany({ name: "List Co A XQZC3" });
    companyManager.createCompany({ name: "List Co B XQZC3" });

    const companies = companyManager.listCompanies();

    assert.ok(companies.some(c => c.name === "List Co A XQZC3"));
    assert.ok(companies.some(c => c.name === "List Co B XQZC3"));

});

test("addEmployee() accepts a string or object and links a person entity", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Employer Co XQZC4" });

    companyManager.addEmployee(company.id, "Jane XQZC4");
    const employees = companyManager.addEmployee(company.id, { name: "Bob XQZC4", role: "Engineer" });

    assert.deepStrictEqual(employees, [
        { name: "Jane XQZC4", role: null },
        { name: "Bob XQZC4", role: "Engineer" }
    ]);

    const connections = knowledge.connections("Bob XQZC4");
    assert.ok(connections.some(rel => rel.type === "employedBy" && rel.to === "Employer Co XQZC4"));

});

test("addDocument() appends and links a document entity", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Docs Co XQZC5" });

    const documents = companyManager.addDocument(company.id, "https://example.com/doc-xqzc5");

    assert.deepStrictEqual(documents, ["https://example.com/doc-xqzc5"]);

    const connections = knowledge.connections("Docs Co XQZC5");
    assert.ok(connections.some(rel => rel.type === "produces" && rel.to === "https://example.com/doc-xqzc5"));

});

test("recordFinance() validates input and returns a running revenue/expense/net summary", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Finance Co XQZC6" });

    assert.throws(() => companyManager.recordFinance(company.id, { label: "bad", amount: 10, type: "not-a-type" }));

    companyManager.recordFinance(company.id, { label: "Client invoice", amount: 1000, type: "revenue" });
    const summary = companyManager.recordFinance(company.id, { label: "Hosting", amount: 100, type: "expense" });

    assert.strictEqual(summary.revenue, 1000);
    assert.strictEqual(summary.expense, 100);
    assert.strictEqual(summary.net, 900);
    assert.strictEqual(summary.entries, 2);

});

test("addRelationship() creates a knowledge graph edge from the company to a contact", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Relationship Co XQZC7" });

    companyManager.addRelationship(company.id, { to: "Big Client XQZC7", type: "client" });

    const connections = knowledge.connections("Relationship Co XQZC7");
    assert.ok(connections.some(rel => rel.type === "client" && rel.to === "Big Client XQZC7"));

});

test("logCommunication()/communications() round-trip company-scoped communication entries", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Comms Co XQZC8" });

    companyManager.logCommunication(company.id, { summary: "Kickoff call XQZC8", channel: "call" });

    const comms = companyManager.communications(company.id);

    assert.strictEqual(comms.length, 1);
    assert.strictEqual(comms[0].summary, "Kickoff call XQZC8");
    assert.strictEqual(comms[0].channel, "call");

});

test("projects() scopes the roadmap to only this company's projects", () => {

    const { planner, companyManager } = makeStack();

    const companyA = companyManager.createCompany({ name: "Scoped Co A XQZC9" });
    const companyB = companyManager.createCompany({ name: "Scoped Co B XQZC9" });

    planner.plan({ title: "Company A project XQZC9", company: companyA.id });
    planner.plan({ title: "Company B project XQZC9", company: companyB.id });
    planner.plan({ title: "Unscoped project XQZC9" });

    const projectsA = companyManager.projects(companyA.id);

    assert.strictEqual(projectsA.length, 1);
    assert.strictEqual(projectsA[0].title, "Company A project XQZC9");

});

test("getCompany() returns financialSummary, projects, communications, and knowledge", () => {

    const { planner, companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Full Detail Co XQZC10" });

    planner.plan({ title: "Detail co project XQZC10", company: company.id });
    companyManager.recordFinance(company.id, { label: "Seed funding", amount: 5000, type: "revenue" });
    companyManager.logCommunication(company.id, { summary: "Investor update XQZC10" });

    const detail = companyManager.getCompany(company.id);

    assert.strictEqual(detail.financialSummary.revenue, 5000);
    assert.strictEqual(detail.projects.length, 1);
    assert.strictEqual(detail.communications.length, 1);
    assert.ok(detail.knowledge.entities.some(e => e.name === "Full Detail Co XQZC10"));

});

test("company operations reject an unknown company id", () => {

    const { companyManager } = makeStack();

    assert.throws(() => companyManager.getCompany("not-a-real-id"));
    assert.throws(() => companyManager.addEmployee("not-a-real-id", "X"));
    assert.throws(() => companyManager.addDocument("not-a-real-id", "X"));
    assert.throws(() => companyManager.recordFinance("not-a-real-id", { label: "x", amount: 1, type: "revenue" }));
    assert.throws(() => companyManager.addRelationship("not-a-real-id", { to: "X", type: "client" }));
    assert.throws(() => companyManager.logCommunication("not-a-real-id", { summary: "X" }));
    assert.throws(() => companyManager.projects("not-a-real-id"));
});


test("a new company's brandProfile starts as the real empty default shape", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Brand Default Co XQZC11" });

    assert.strictEqual(company.brandProfile.mission, null);
    assert.deepStrictEqual(company.brandProfile.values, []);
    assert.deepStrictEqual(company.brandProfile.voice, { tone: null, style: null, doNots: [] });
    assert.deepStrictEqual(company.history, []);

});


test("setBrandProfile() merges into the existing profile rather than replacing it (Phase 41 Company Brain)", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Brand Merge Co XQZC12" });

    companyManager.setBrandProfile(company.id, { mission: "Ship real software XQZC12", values: ["honesty"] });
    companyManager.setBrandProfile(company.id, { audience: "developers XQZC12", voice: { tone: "direct" } });

    const profile = companyManager.getBrandProfile(company.id);

    // Both calls' fields survive -- the second call didn't clobber the
    // first's mission/values.
    assert.strictEqual(profile.mission, "Ship real software XQZC12");
    assert.deepStrictEqual(profile.values, ["honesty"]);
    assert.strictEqual(profile.audience, "developers XQZC12");
    // voice merges one level deeper too -- setting tone doesn't wipe
    // style/doNots.
    assert.strictEqual(profile.voice.tone, "direct");
    assert.deepStrictEqual(profile.voice.doNots, []);

});


test("recordDecision() appends a real, live decision log entry (metadata.history was previously dead state)", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Decision Log Co XQZC13" });

    companyManager.recordDecision(company.id, { decision: "Adopt Claude as primary LLM XQZC13", reason: "Already integrated" });
    companyManager.recordDecision(company.id, { decision: "Defer paid ads XQZC13" });

    const history = companyManager.getCompany(company.id).history;

    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].decision, "Adopt Claude as primary LLM XQZC13");
    assert.strictEqual(history[0].reason, "Already integrated");
    assert.strictEqual(history[1].reason, null);
    assert.ok(history[0].timestamp);

});


test("recordDecision() requires a decision summary", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Decision Required Co XQZC14" });

    assert.throws(() => companyManager.recordDecision(company.id, {}));

});


test("clientRelationships() reports business relationships without the departments/employees/documents edges already modeled elsewhere", () => {

    const { companyManager } = makeStack();

    const company = companyManager.createCompany({ name: "Client Relationships Co XQZC15", departments: ["hades"] });

    companyManager.addEmployee(company.id, "Test Employee XQZC15");
    companyManager.addDocument(company.id, "spec.md XQZC15");
    companyManager.addRelationship(company.id, { to: "Acme Corp XQZC15", type: "client" });
    companyManager.addRelationship(company.id, { to: "Vendor Co XQZC15", type: "vendor" });

    const clients = companyManager.clientRelationships(company.id);

    assert.strictEqual(clients.length, 2);
    assert.ok(clients.some(c => c.to === "Acme Corp XQZC15" && c.type === "client"));
    assert.ok(clients.some(c => c.to === "Vendor Co XQZC15" && c.type === "vendor"));
    // The department (staffedBy) and employee (employedBy) edges must NOT
    // leak into this view -- they're already modeled as `departments`/
    // `employees` fields.
    assert.ok(!clients.some(c => c.type === "staffedBy" || c.type === "employedBy" || c.type === "produces"));

});


test("companyBrain() aggregates every Company Brain field, including real campaigns, in one call (Phase 41)", () => {

    const { companyManager } = makeStack();
    const campaigns = require("../core/marketing/campaigns");

    const company = companyManager.createCompany({ name: "Company Brain Co XQZC16" });

    companyManager.setBrandProfile(company.id, { mission: "Test the brain XQZC16", products: ["Widget"] });
    companyManager.recordDecision(company.id, { decision: "Launch Q3 XQZC16" });
    companyManager.addEmployee(company.id, "Brain Employee XQZC16");
    companyManager.addRelationship(company.id, { to: "Brain Client XQZC16", type: "client" });

    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Brain campaign XQZC16" });

    const brain = companyManager.companyBrain(company.id);

    assert.strictEqual(brain.name, "Company Brain Co XQZC16");
    assert.strictEqual(brain.mission, "Test the brain XQZC16");
    assert.deepStrictEqual(brain.products, ["Widget"]);
    assert.strictEqual(brain.historicalDecisions.length, 1);
    assert.strictEqual(brain.team.length, 1);
    assert.ok(brain.clients.some(c => c.to === "Brain Client XQZC16"));
    assert.strictEqual(brain.campaigns.length, 1);
    assert.strictEqual(brain.campaigns[0].id, campaign.id);
    assert.ok(brain.financialSummary);
    assert.deepStrictEqual(brain.departments, []);
    assert.deepStrictEqual(brain.projects, []);

});
