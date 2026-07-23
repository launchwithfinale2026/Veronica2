const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-salesproposal-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-salesproposal-${process.pid}.json`);

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
const opportunities = require("../core/sales/opportunities");
const proposalGenerator = require("../core/sales/proposalGenerator");
const IntelligenceEngine = require("../core/intelligence");

// Same mock pattern tests/marketing-content-generator.test.js already
// established -- never makes a real network call, only fakes the
// underlying LLM response.
function mockIntelligence(responseText){

    const engine = new IntelligenceEngine();

    engine.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };
    engine.brain.provider.active = "claude";

    return engine;

}


test("generateProposal() calls the real reasoning path with opportunity/brand context, and persists the draft onto the opportunity", async () => {

    const company = new CompanyManager().createCompany({ name: "Proposal Gen Co XQZPG1" });

    new CompanyManager().setBrandProfile(company.id, {
        mission: "Ship real software XQZPG1",
        voice: { tone: "direct", doNots: ["corporate jargon"] }
    });

    const opportunity = opportunities.createOpportunity({ companyId: company.id, name: "Proposal Deal XQZPG1", value: 15000 });
    opportunities.addContact(opportunity.id, { name: "Jane XQZPG1", role: "Champion" });

    const engine = mockIntelligence("Real generated proposal text XQZPG1.");

    const draft = await proposalGenerator.generateProposal(opportunity.id, { intelligence: engine });

    assert.strictEqual(draft, "Real generated proposal text XQZPG1.");

    const updated = opportunities.getOpportunity(opportunity.id);
    assert.strictEqual(updated.proposalDraft, "Real generated proposal text XQZPG1.");

});


test("generateProposal() rejects an unknown opportunity", async () => {

    await assert.rejects(() => proposalGenerator.generateProposal("not-a-real-id", { intelligence: mockIntelligence("x") }));

});
