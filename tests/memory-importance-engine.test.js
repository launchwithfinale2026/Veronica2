const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// connectedKnowledgeScore() reads the real knowledge graph -- same
// backup/restore pattern as every other test file touching it.
const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-impeng-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const MemoryImportanceEngine = require("../core/memory/memoryImportanceEngine");
const knowledge = require("../core/knowledge");

function baseEntry(overrides = {}){
    return {
        id: "entry-1",
        type: "general",
        content: "A base test entry XQZIMP",
        importance: 3,
        tags: [],
        updated: new Date().toISOString(),
        ...overrides
    };
}


test("explicitImportanceScore() scales the 1-5 field to its 30-point share", () => {

    const engine = new MemoryImportanceEngine();

    assert.strictEqual(engine.explicitImportanceScore(baseEntry({ importance: 5 })), 30);
    assert.strictEqual(engine.explicitImportanceScore(baseEntry({ importance: 1 })), 6);

});


test("repetitionScore() rewards entries that share tags with others, capped at 15", () => {

    const engine = new MemoryImportanceEngine();

    const entry = baseEntry({ id: "a", tags: ["shared-tag-xqzimp"] });
    const others = [
        entry,
        baseEntry({ id: "b", tags: ["shared-tag-xqzimp"] }),
        baseEntry({ id: "c", tags: ["shared-tag-xqzimp"] }),
        baseEntry({ id: "d", tags: ["unrelated"] })
    ];

    assert.strictEqual(engine.repetitionScore(entry, others), 6); // 2 related x 3

    const noTags = baseEntry({ id: "e", tags: [] });
    assert.strictEqual(engine.repetitionScore(noTags, others), 0);

});


test("businessImpactScore() scores company-tagged entries highest, then business-typed, then zero", () => {

    const engine = new MemoryImportanceEngine();

    assert.strictEqual(engine.businessImpactScore(baseEntry({ tags: ["company:acme-1"] })), 15);
    assert.strictEqual(engine.businessImpactScore(baseEntry({ type: "decisions" })), 10);
    assert.strictEqual(engine.businessImpactScore(baseEntry({ type: "personal" })), 0);

});


test("connectedKnowledgeScore() reflects real knowledge graph relationships for matching entity names", () => {

    const engine = new MemoryImportanceEngine({ knowledge });

    knowledge.addEntity({ name: "Connected Entry XQZIMP", type: "project" });
    knowledge.addEntity({ name: "Some Department XQZIMP", type: "department" });
    knowledge.addRelationship({ from: "Connected Entry XQZIMP", to: "Some Department XQZIMP", type: "assignedTo" });

    const connectedEntry = baseEntry({ content: "Connected Entry XQZIMP" });
    const unconnectedEntry = baseEntry({ content: "A note nobody linked to XQZIMP" });

    assert.strictEqual(engine.connectedKnowledgeScore(connectedEntry), 4);
    assert.strictEqual(engine.connectedKnowledgeScore(unconnectedEntry), 0);

});


test("futureRetrievalValueScore() favors reusable types and rewards tag diversity, capped at 10", () => {

    const engine = new MemoryImportanceEngine();

    const reusable = baseEntry({ type: "workflow", tags: ["a", "b", "c", "d", "e"] });
    const oneOff = baseEntry({ type: "personal", tags: [] });

    assert.strictEqual(engine.futureRetrievalValueScore(reusable), 10);
    assert.strictEqual(engine.futureRetrievalValueScore(oneOff), 0);

});


test("recencyScore() is full value for a just-updated entry and decays toward zero over the window", () => {

    const engine = new MemoryImportanceEngine();

    const fresh = baseEntry({ updated: new Date().toISOString() });
    const old = baseEntry({ updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() });

    assert.strictEqual(engine.recencyScore(fresh), 10);
    assert.strictEqual(engine.recencyScore(old), 0);

});


test("score() returns a total (capped at 100) with the full six-factor breakdown", () => {

    const engine = new MemoryImportanceEngine();

    const entry = baseEntry({ importance: 5, type: "decisions", tags: ["a", "b"] });
    const { score, breakdown } = engine.score(entry, [entry]);

    assert.ok(score >= 0 && score <= 100);
    assert.deepStrictEqual(Object.keys(breakdown).sort(), [
        "businessImpact", "connectedKnowledge", "explicitImportance",
        "futureRetrievalValue", "recency", "repetition"
    ]);

    const summed = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
    assert.strictEqual(score, Math.min(100, summed));

});
