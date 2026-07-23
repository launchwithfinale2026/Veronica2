const test = require("node:test");
const assert = require("node:assert");

const classification = require("../core/memory/classification");

test("classify() maps every real memory type to one of the four memory classes", () => {

    assert.strictEqual(classification.classify("personal"), "episodic");
    assert.strictEqual(classification.classify("general"), "episodic");
    assert.strictEqual(classification.classify("technical knowledge"), "semantic");
    assert.strictEqual(classification.classify("preferences"), "semantic");
    assert.strictEqual(classification.classify("decisions"), "semantic");
    assert.strictEqual(classification.classify("workflow"), "procedural");
    assert.strictEqual(classification.classify("goals"), "organizational");
    assert.strictEqual(classification.classify("projects"), "organizational");
    assert.strictEqual(classification.classify("businesses"), "organizational");

});


test("classify() falls back to episodic for an unrecognized type", () => {

    assert.strictEqual(classification.classify("not-a-real-type"), "episodic");
    assert.strictEqual(classification.classify(undefined), "episodic");

});


test("overview() counts entries by class and totals correctly", () => {

    const entries = [
        { type: "personal" },
        { type: "general" },
        { type: "technical knowledge" },
        { type: "workflow" },
        { type: "goals" },
        { type: "businesses" }
    ];

    const result = classification.overview(entries);

    assert.strictEqual(result.total, 6);
    assert.strictEqual(result.byClass.episodic, 2);
    assert.strictEqual(result.byClass.semantic, 1);
    assert.strictEqual(result.byClass.procedural, 1);
    assert.strictEqual(result.byClass.organizational, 2);

});


test("overview() counts entries by real source, falling back to \"unknown\" for an entry with none (Project E)", () => {

    const entries = [
        { type: "personal", source: "sales-opportunities" },
        { type: "general", source: "sales-opportunities" },
        { type: "workflow", source: "knowledge-acquisition" },
        { type: "goals" }
    ];

    const result = classification.overview(entries);

    assert.strictEqual(result.bySource["sales-opportunities"], 2);
    assert.strictEqual(result.bySource["knowledge-acquisition"], 1);
    assert.strictEqual(result.bySource.unknown, 1);

});


test("overview() returns zeroed counts for an empty entry list", () => {

    const result = classification.overview([]);

    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.byClass, {
        episodic: 0, semantic: 0, procedural: 0, organizational: 0
    });
    assert.deepStrictEqual(result.bySource, {});

});
