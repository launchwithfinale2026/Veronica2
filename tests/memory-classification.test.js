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


test("timeline() orders real entries newest-first and includes each one's real class/source/preview (Project 3/E)", () => {

    const entries = [
        { id: "a", type: "personal", source: "manual", importance: 3, created: "2026-01-01T00:00:00.000Z", content: "oldest entry" },
        { id: "b", type: "goals", source: "roadmap", importance: 5, created: "2026-01-03T00:00:00.000Z", content: "newest entry" },
        { id: "c", type: "workflow", source: "automation", importance: 4, created: "2026-01-02T00:00:00.000Z", content: "middle entry" }
    ];

    const result = classification.timeline(entries);

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].id, "b");
    assert.strictEqual(result[0].class, "organizational");
    assert.strictEqual(result[1].id, "c");
    assert.strictEqual(result[2].id, "a");
    assert.strictEqual(result[2].preview, "oldest entry");

});


test("timeline() respects a real limit", () => {

    const entries = [
        { id: "a", type: "general", source: "x", created: "2026-01-01T00:00:00.000Z", content: "1" },
        { id: "b", type: "general", source: "x", created: "2026-01-02T00:00:00.000Z", content: "2" },
        { id: "c", type: "general", source: "x", created: "2026-01-03T00:00:00.000Z", content: "3" }
    ];

    const result = classification.timeline(entries, 2);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, "c");
    assert.strictEqual(result[1].id, "b");

});
