const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-researchmissions-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const http = require("../core/integrations/http");
const ResearchEngine = require("../core/research/engine");
const IntelligenceEngine = require("../core/intelligence");
const missions = require("../core/research/missions");


// Same mock pattern tests/research-engine.test.js/tests/marketing-content-generator.test.js
// already establish -- fakes only the underlying LLM call, the real
// research/reasoning path still runs.
function mockExtractionEngine(extractionResponse){

    const engine = new ResearchEngine();

    engine.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(extractionResponse), provider: "claude", toolCalls: [] }) }
    };
    engine.intelligence.brain.provider.active = "claude";

    return engine;

}


function mockSummaryIntelligence(responseText){

    const engine = new IntelligenceEngine();

    engine.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };
    engine.brain.provider.active = "claude";

    return engine;

}


function withMockedFetch(html, fn){

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: html });

    return fn().finally(() => { http.request = originalRequest; });

}


test("createMission() requires an objective and validates the real type enum", () => {

    assert.throws(() => missions.createMission({}));
    assert.throws(() => missions.createMission({ objective: "X", type: "not-a-real-type" }));

    const mission = missions.createMission({ objective: "Research competitor A XQZRM1" });

    assert.strictEqual(mission.type, "general");
    assert.strictEqual(mission.status, "in_progress");
    assert.deepStrictEqual(mission.citationIds, []);
    assert.strictEqual(mission.executiveSummary, null);

});


test("listMissions() optionally scopes to a companyId, and includes global (uncompanied) missions when no filter is given", () => {

    const CompanyManager = require("../core/executive/companyManager");
    const company = new CompanyManager().createCompany({ name: "Research Mission Co XQZRM2" });

    missions.createMission({ objective: "Company-scoped research XQZRM2", companyId: company.id });
    missions.createMission({ objective: "Global research XQZRM2" });

    const scoped = missions.listMissions(company.id);
    assert.strictEqual(scoped.length, 1);
    assert.strictEqual(scoped[0].companyId, company.id);

});


test("addCitation() reuses core/research/engine.js's real pipeline wholesale, not a duplicate implementation", async () => {

    const mission = missions.createMission({ objective: "Research widget API XQZRM3", type: "technology" });

    const engine = mockExtractionEngine({
        summary: "Widget API uses REST XQZRM3",
        keyFacts: ["Supports pagination XQZRM3"],
        confidence: 0.9,
        implementationRecommendation: "Use the /v2 endpoint XQZRM3"
    });

    await withMockedFetch("<title>Widget Docs</title><p>Widget API details XQZRM3</p>", () =>
        missions.addCitation(mission.id, { topic: "Widget API", url: "https://example.test/widget" }, { researchEngine: engine })
    );

    const updated = missions.getMission(mission.id);
    assert.strictEqual(updated.citationIds.length, 1);

    const citations = missions.missionCitations(mission.id);
    assert.strictEqual(citations.length, 1);
    assert.strictEqual(citations[0].topic, "Widget API");
    assert.strictEqual(citations[0].citation, "https://example.test/widget");
    assert.strictEqual(citations[0].confidence, 0.9);
    assert.deepStrictEqual(citations[0].keyFacts, ["Supports pagination XQZRM3"]);

});


test("rankSources() orders real citations by their real, already-computed confidence, highest first", async () => {

    const mission = missions.createMission({ objective: "Research ranking XQZRM4", type: "industry" });

    const lowConfidenceEngine = mockExtractionEngine({ summary: "Low confidence finding XQZRM4", keyFacts: [], confidence: 0.3 });
    const highConfidenceEngine = mockExtractionEngine({ summary: "High confidence finding XQZRM4", keyFacts: [], confidence: 0.95 });

    await withMockedFetch("<title>Low</title><p>Low XQZRM4</p>", () =>
        missions.addCitation(mission.id, { topic: "Low source XQZRM4", url: "https://example.test/low" }, { researchEngine: lowConfidenceEngine })
    );

    await withMockedFetch("<title>High</title><p>High XQZRM4</p>", () =>
        missions.addCitation(mission.id, { topic: "High source XQZRM4", url: "https://example.test/high" }, { researchEngine: highConfidenceEngine })
    );

    const ranked = missions.rankSources(mission.id);

    assert.strictEqual(ranked.length, 2);
    assert.strictEqual(ranked[0].confidence, 0.95);
    assert.strictEqual(ranked[1].confidence, 0.3);

});


test("generateExecutiveSummary() synthesizes across real collected citations and persists the result", async () => {

    const mission = missions.createMission({ objective: "Research market trend XQZRM5", type: "market_trend" });

    const extractionEngine = mockExtractionEngine({
        summary: "Market is growing XQZRM5",
        keyFacts: ["20% YoY growth XQZRM5"],
        confidence: 0.8
    });

    await withMockedFetch("<title>Trend</title><p>Trend data XQZRM5</p>", () =>
        missions.addCitation(mission.id, { topic: "Market trend", url: "https://example.test/trend" }, { researchEngine: extractionEngine })
    );

    const summaryEngine = mockSummaryIntelligence("Real synthesized executive summary XQZRM5.");

    const summary = await missions.generateExecutiveSummary(mission.id, { intelligence: summaryEngine });

    assert.strictEqual(summary, "Real synthesized executive summary XQZRM5.");
    assert.strictEqual(missions.getMission(mission.id).executiveSummary, "Real synthesized executive summary XQZRM5.");

});


test("completeMission() sets status to \"completed\"", () => {

    const mission = missions.createMission({ objective: "Research completion XQZRM6" });

    assert.strictEqual(missions.completeMission(mission.id), "completed");
    assert.strictEqual(missions.getMission(mission.id).status, "completed");

});


test("addCitation()/getMission()/completeMission() reject an unknown mission", async () => {

    await assert.rejects(() => missions.addCitation("not-a-real-id", { topic: "X", url: "https://example.test" }));
    assert.throws(() => missions.getMission("not-a-real-id"));
    assert.throws(() => missions.completeMission("not-a-real-id"));

});
