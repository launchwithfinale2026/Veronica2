const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-acquisition-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-acquisition-${process.pid}.json`);

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
const KnowledgeAcquisitionEngine = require("../core/knowledge/acquisition");
const fileIntelligence = require("../core/integrations/fileIntelligence");
const obsidian = require("../core/integrations/obsidian");

function mockBrain(engine, responseObj){
    engine.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    engine.intelligence.brain.provider.active = "claude";
}


test("extract() requires real content and returns the real structured extraction", async () => {

    const engine = new KnowledgeAcquisitionEngine();

    await assert.rejects(() => engine.extract("source-xqzka1", ""), /content is required/);

    mockBrain(engine, {
        concepts: ["distributed consensus XQZKA1"],
        entities: [{ name: "Raft XQZKA1", type: "concept" }],
        relationships: [],
        tasks: ["Implement leader election XQZKA1"],
        decisions: [],
        questions: ["How does this handle network partitions? XQZKA1"],
        unknowns: [],
        summary: "A document about consensus algorithms XQZKA1"
    });

    const extracted = await engine.extract("source-xqzka1", "real document text about Raft consensus");

    assert.deepStrictEqual(extracted.concepts, ["distributed consensus XQZKA1"]);
    assert.strictEqual(extracted.tasks[0], "Implement leader election XQZKA1");

});


test("acquire() connects real extracted entities/relationships into the knowledge graph and persists a real, queryable memory entry", async () => {

    const engine = new KnowledgeAcquisitionEngine();

    mockBrain(engine, {
        concepts: ["real concept XQZKA2"],
        entities: [{ name: "XQZKA2 Entity One", type: "concept" }, { name: "XQZKA2 Entity Two", type: "person" }],
        relationships: [{ from: "XQZKA2 Entity One", to: "XQZKA2 Entity Two", type: "relatesTo" }],
        tasks: ["Real task XQZKA2"],
        decisions: ["Real decision XQZKA2"],
        questions: ["Real question XQZKA2"],
        unknowns: ["Real unknown XQZKA2"],
        summary: "Real summary XQZKA2"
    });

    const result = await engine.acquire("source-xqzka2", "real content mentioning XQZKA2 Entity One and Entity Two");

    assert.ok(result.id);
    assert.deepStrictEqual(result.tasks, ["Real task XQZKA2"]);

    const entityOne = knowledge.find("XQZKA2 Entity One");
    assert.strictEqual(entityOne.length, 1);
    assert.strictEqual(entityOne[0].type, "concept");

    const entityTwo = knowledge.find("XQZKA2 Entity Two");
    assert.strictEqual(entityTwo[0].type, "person");

    const connections = knowledge.connections("XQZKA2 Entity One");
    assert.ok(connections.some(rel => rel.to === "XQZKA2 Entity Two" && rel.type === "relatesTo"));

    const history = engine.history(20);
    const persisted = history.find(entry => entry.id === result.id);
    assert.strictEqual(persisted.metadata.decisions[0], "Real decision XQZKA2");
    assert.strictEqual(persisted.metadata.unknowns[0], "Real unknown XQZKA2");

});


test("acquire() never fabricates an entry for a genuinely empty extraction category", async () => {

    const engine = new KnowledgeAcquisitionEngine();

    mockBrain(engine, {
        concepts: [],
        entities: [],
        relationships: [],
        tasks: [],
        decisions: [],
        questions: [],
        unknowns: [],
        summary: "Nothing notable XQZKA3"
    });

    const result = await engine.acquire("source-xqzka3", "plain content with nothing structured in it");

    assert.deepStrictEqual(result.concepts, []);
    assert.deepStrictEqual(result.tasks, []);
    assert.deepStrictEqual(result.entities, []);

});


test("fileIntelligence.acquireFromFile() reads a real indexed file and runs real acquisition on its real content", async () => {

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-file-acquire-xqzka4-"));

    try {

        fs.writeFileSync(path.join(tmpRoot, "note.txt"), "Real file content about Project XQZKA4 and a decision to ship it.");

        // acquireFromFile() constructs its own KnowledgeAcquisitionEngine
        // internally -- mock the brain via a real engine instance passed
        // in isn't possible through this function signature (matches
        // core/research/missions.js's own generateExecutiveSummary()
        // convention: intelligence is injectable at the ENGINE
        // constructor level, not exposed as a parameter here), so this
        // test mocks core/intelligence's IntelligenceEngine.prototype.think
        // directly, restoring it in `finally`.
        const IntelligenceEngine = require("../core/intelligence");
        const originalThink = IntelligenceEngine.prototype.think;

        IntelligenceEngine.prototype.think = async function(agent, mission){
            return {
                cognition: {
                    response: {
                        response: JSON.stringify({
                            concepts: ["Project XQZKA4"],
                            entities: [],
                            relationships: [],
                            tasks: [],
                            decisions: ["ship it XQZKA4"],
                            questions: [],
                            unknowns: [],
                            summary: "Real file acquisition test XQZKA4"
                        })
                    }
                }
            };
        };

        try {

            const result = await fileIntelligence.acquireFromFile("note.txt", tmpRoot);

            assert.strictEqual(result.sourceLabel, "note.txt");
            assert.deepStrictEqual(result.concepts, ["Project XQZKA4"]);
            assert.deepStrictEqual(result.decisions, ["ship it XQZKA4"]);

        } finally {
            IntelligenceEngine.prototype.think = originalThink;
        }

    } finally {

        fs.rmSync(tmpRoot, { recursive: true, force: true });

    }

});


test("obsidian.acquireFromNote() reads a real vault note and runs real acquisition on its real content", async () => {

    const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-obsidian-acquire-xqzka5-"));

    try {

        fs.mkdirSync(path.join(tmpVault, ".obsidian"));
        fs.writeFileSync(path.join(tmpVault, "Note XQZKA5.md"), "A real note mentioning [[Linked Concept XQZKA5]].");

        const originalEnv = process.env.OBSIDIAN_VAULT_PATH;
        process.env.OBSIDIAN_VAULT_PATH = tmpVault;

        const IntelligenceEngine = require("../core/intelligence");
        const originalThink = IntelligenceEngine.prototype.think;

        IntelligenceEngine.prototype.think = async function(){
            return {
                cognition: {
                    response: {
                        response: JSON.stringify({
                            concepts: ["Linked Concept XQZKA5"],
                            entities: [],
                            relationships: [],
                            tasks: [],
                            decisions: [],
                            questions: ["real question XQZKA5"],
                            unknowns: [],
                            summary: "Real note acquisition test XQZKA5"
                        })
                    }
                }
            };
        };

        try {

            const result = await obsidian.acquireFromNote("Note XQZKA5.md");

            assert.strictEqual(result.sourceLabel, "Note XQZKA5.md");
            assert.deepStrictEqual(result.questions, ["real question XQZKA5"]);

        } finally {
            IntelligenceEngine.prototype.think = originalThink;
            if(originalEnv === undefined){
                delete process.env.OBSIDIAN_VAULT_PATH;
            } else {
                process.env.OBSIDIAN_VAULT_PATH = originalEnv;
            }
        }

    } finally {

        fs.rmSync(tmpVault, { recursive: true, force: true });

    }

});
