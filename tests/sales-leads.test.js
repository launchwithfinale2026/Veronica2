const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-salesleads-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-salesleads-${process.pid}.json`);

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
const leads = require("../core/sales/leads");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createLead() requires a companyId and name, and rejects an unknown company", () => {

    assert.throws(() => leads.createLead({ name: "X" }));
    assert.throws(() => leads.createLead({ companyId: "not-a-real-id", name: "X" }));

    const company = makeCompany("Lead Validation Co XQZL1");
    assert.throws(() => leads.createLead({ companyId: company.id }));

});


test("createLead() persists the real field shape, defaulting to \"new\" status", () => {

    const company = makeCompany("Lead Shape Co XQZL2");

    const lead = leads.createLead({
        companyId: company.id,
        name: "Jane Prospect XQZL2",
        organization: "Acme Corp XQZL2",
        email: "jane@acme-xqzl2.com",
        phone: "555-0100",
        source: "inbound"
    });

    assert.strictEqual(lead.name, "Jane Prospect XQZL2");
    assert.strictEqual(lead.organization, "Acme Corp XQZL2");
    assert.strictEqual(lead.status, "new");
    assert.deepStrictEqual(lead.interactions, []);
    assert.strictEqual(lead.score, null);
    assert.deepStrictEqual(lead.signals, { budget: false, authority: false, need: false, timeline: false });

});


test("listLeads() scopes to only the given company", () => {

    const companyA = makeCompany("Lead List Co A XQZL3");
    const companyB = makeCompany("Lead List Co B XQZL3");

    leads.createLead({ companyId: companyA.id, name: "A Lead XQZL3" });
    leads.createLead({ companyId: companyB.id, name: "B Lead XQZL3" });

    assert.strictEqual(leads.listLeads(companyA.id).length, 1);

});


test("setStatus() validates against the real enum", () => {

    const company = makeCompany("Lead Status Co XQZL4");
    const lead = leads.createLead({ companyId: company.id, name: "Status Lead XQZL4" });

    assert.strictEqual(leads.setStatus(lead.id, "qualified"), "qualified");
    assert.throws(() => leads.setStatus(lead.id, "not-a-real-status"));

});


test("logInteraction() appends a real, timestamped interaction", () => {

    const company = makeCompany("Lead Interaction Co XQZL5");
    const lead = leads.createLead({ companyId: company.id, name: "Interaction Lead XQZL5" });

    leads.logInteraction(lead.id, { type: "call", summary: "Intro call XQZL5" });
    const interactions = leads.getLead(lead.id).interactions;

    assert.strictEqual(interactions.length, 1);
    assert.strictEqual(interactions[0].type, "call");
    assert.ok(interactions[0].timestamp);

    assert.throws(() => leads.logInteraction(lead.id, { type: "call" }));

});


test("setSignals() merges BANT signals rather than replacing them", () => {

    const company = makeCompany("Lead Signals Co XQZL6");
    const lead = leads.createLead({ companyId: company.id, name: "Signals Lead XQZL6" });

    leads.setSignals(lead.id, { budget: true });
    const signals = leads.setSignals(lead.id, { need: true });

    assert.deepStrictEqual(signals, { budget: true, authority: false, need: true, timeline: false });

});


test("scoreLead() is deterministic and explainable -- every point traces to a real, visible reason", () => {

    const company = makeCompany("Lead Score Co XQZL7");
    const lead = leads.createLead({
        companyId: company.id,
        name: "Score Lead XQZL7",
        organization: "Acme XQZL7",
        email: "score@acme-xqzl7.com"
    });

    leads.logInteraction(lead.id, { type: "email", summary: "Sent intro deck XQZL7" });
    leads.setSignals(lead.id, { budget: true, authority: true });

    const result = leads.scoreLead(lead.id);

    // +10 email +10 organization +5 (1 interaction) +15 (recent) +10 budget +10 authority = 60
    assert.strictEqual(result.score, 60);
    assert.strictEqual(result.reasons.length, 6);
    assert.ok(result.reasons.every(reason => typeof reason === "string" && reason.startsWith("+")));

    // Persisted, not just returned.
    assert.strictEqual(leads.getLead(lead.id).score, 60);

});


test("scoreLead() clamps at 100 even with every possible signal", () => {

    const company = makeCompany("Lead Score Max Co XQZL8");
    const lead = leads.createLead({
        companyId: company.id,
        name: "Max Score Lead XQZL8",
        organization: "Acme XQZL8",
        email: "max@acme-xqzl8.com",
        phone: "555-0101"
    });

    for(let i = 0; i < 6; i++){
        leads.logInteraction(lead.id, { type: "call", summary: `Call ${i} XQZL8` });
    }

    leads.setSignals(lead.id, { budget: true, authority: true, need: true, timeline: true });

    const result = leads.scoreLead(lead.id);

    assert.ok(result.score <= 100);

});
