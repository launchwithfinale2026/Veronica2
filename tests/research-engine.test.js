const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-research-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const http = require("../core/integrations/http");
const ResearchEngine = require("../core/research/engine");

function mockBrain(engine, responseObj){
    engine.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    engine.intelligence.brain.provider.active = "claude";
}


test("ResearchEngine.extractText()/extractTitle() parse real HTML into plain text without a DOM parser dependency", () => {

    const html = `<html><head><title>Widget API Docs</title><style>.x{color:red}</style></head>
<body><script>alert(1)</script><h1>Widget API</h1><p>Use the &amp; operator &nbsp; carefully.</p></body></html>`;

    assert.strictEqual(ResearchEngine.extractTitle(html), "Widget API Docs");

    const text = ResearchEngine.extractText(html);
    assert.ok(text.includes("Widget API"));
    assert.ok(text.includes("Use the & operator"));
    assert.ok(!text.includes("alert(1)"));
    assert.ok(!text.includes("color:red"));

});


test("fetchDocumentation() fetches through the real allowlisted http client and surfaces a 4xx/5xx as a real error", async () => {

    const engine = new ResearchEngine();
    const originalRequest = http.request;

    http.request = async () => ({ status: 200, headers: {}, body: "<title>T</title><p>Body XQZRES1</p>" });

    try {
        const doc = await engine.fetchDocumentation("https://example.test/docs");
        assert.strictEqual(doc.title, "T");
        assert.ok(doc.text.includes("Body XQZRES1"));
    } finally {
        http.request = originalRequest;
    }

    http.request = async () => ({ status: 404, headers: {}, body: "Not Found" });

    try {
        await assert.rejects(() => engine.fetchDocumentation("https://example.test/missing"), /Research fetch failed 404/);
    } finally {
        http.request = originalRequest;
    }

    await assert.rejects(() => engine.fetchDocumentation(), /url is required/);

});


test("research() requires a real url, never fabricating knowledge from a topic alone", async () => {

    const engine = new ResearchEngine();

    await assert.rejects(() => engine.research("some capability"), /url is required/);
    await assert.rejects(() => engine.research(), /topic is required/);

});


test("research() runs the real pipeline end to end: fetch -> extract (LLM) -> store, citing the real URL", async () => {

    const engine = new ResearchEngine();

    mockBrain(engine, {
        summary: "Summary XQZRES2",
        keyFacts: ["fact one XQZRES2", "fact two XQZRES2"],
        confidence: 0.8,
        implementationRecommendation: "Build a connector for XQZRES2"
    });

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: "<title>XQZRES2 Docs</title><p>real documentation body</p>" });

    let entry;

    try {
        entry = await engine.research("xqzres2-capability", { url: "https://example.test/xqzres2" });
    } finally {
        http.request = originalRequest;
    }

    assert.match(entry.content, /Summary XQZRES2/);
    assert.strictEqual(entry.metadata.citation, "https://example.test/xqzres2");
    assert.deepStrictEqual(entry.metadata.keyFacts, ["fact one XQZRES2", "fact two XQZRES2"]);
    assert.strictEqual(entry.metadata.confidence, 0.8);
    assert.strictEqual(entry.importance, 4); // round(0.8 * 5)
    assert.ok(entry.tags.includes("topic:xqzres2-capability"));

});


test("research() never overwrites -- researching the same topic twice creates two separate, both-retrievable entries", async () => {

    const engine = new ResearchEngine();
    const originalRequest = http.request;

    mockBrain(engine, { summary: "First pass XQZRES3", keyFacts: [], confidence: 0.5, implementationRecommendation: "x" });
    http.request = async () => ({ status: 200, headers: {}, body: "<p>v1</p>" });

    try {
        await engine.research("xqzres3-topic", { url: "https://example.test/xqzres3" });
    } finally {
        http.request = originalRequest;
    }

    mockBrain(engine, { summary: "Second pass XQZRES3", keyFacts: [], confidence: 0.9, implementationRecommendation: "y" });
    http.request = async () => ({ status: 200, headers: {}, body: "<p>v2</p>" });

    try {
        await engine.research("xqzres3-topic", { url: "https://example.test/xqzres3-v2" });
    } finally {
        http.request = originalRequest;
    }

    const history = engine.history("xqzres3-topic");
    assert.strictEqual(history.length, 2);
    assert.ok(history.some(e => e.content.includes("First pass XQZRES3")));
    assert.ok(history.some(e => e.content.includes("Second pass XQZRES3")));

});
