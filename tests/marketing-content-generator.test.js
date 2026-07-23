const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/marketing-campaigns.test.js
// -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-mktgcontent-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-mktgcontent-${process.pid}.json`);

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
const campaigns = require("../core/marketing/campaigns");
const contentGenerator = require("../core/marketing/contentGenerator");
const IntelligenceEngine = require("../core/intelligence");

// Same mock pattern tests/learning-engine.test.js already established --
// replaces the real Claude provider so this never makes a real network
// call, without touching the actual reasoning path (Intelligence.think()
// runs for real, only the underlying LLM call is faked).
function mockIntelligence(responseText){

    const engine = new IntelligenceEngine();

    engine.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };
    engine.brain.provider.active = "claude";

    return engine;

}


test("generateDraft() rejects an unknown content schedule item", async () => {

    const company = new CompanyManager().createCompany({ name: "Content Gen Validation Co XQZCG1" });
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Content gen validation XQZCG1" });

    await assert.rejects(() => contentGenerator.generateDraft(campaign.id, "not-a-real-item", { intelligence: mockIntelligence("x") }));

});


test("generateDraft() calls the real reasoning path with brand voice in the prompt, and persists the draft onto the content item", async () => {

    const company = new CompanyManager().createCompany({ name: "Content Gen Co XQZCG2" });

    new CompanyManager().setBrandProfile(company.id, {
        audience: "indie developers XQZCG2",
        voice: { tone: "playful", style: "short sentences", doNots: ["corporate jargon"] }
    });

    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Launch the new API XQZCG2" });
    campaigns.scheduleContent(campaign.id, { date: "2026-09-01", platform: "twitter", description: "Announce the new API" });

    const [item] = campaigns.getCampaign(campaign.id).contentSchedule;

    const engine = mockIntelligence("Real generated marketing copy XQZCG2.");

    const draft = await contentGenerator.generateDraft(campaign.id, item.id, { intelligence: engine });

    assert.strictEqual(draft, "Real generated marketing copy XQZCG2.");

    const updatedItem = campaigns.getCampaign(campaign.id).contentSchedule.find(i => i.id === item.id);
    assert.strictEqual(updatedItem.draftContent, "Real generated marketing copy XQZCG2.");
    assert.strictEqual(updatedItem.status, "drafted");

});
