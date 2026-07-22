const test = require("node:test");
const assert = require("node:assert");

const MemoryClassifier = require("../core/memory/memoryClassifier");

const classifier = new MemoryClassifier();


test("classify() derives the class from type when no special tags are present", () => {

    const result = classifier.classify({ type: "technical knowledge", tags: [] });

    assert.strictEqual(result.memoryClass, "semantic");
    assert.match(result.reason, /Derived from memory type "technical knowledge"/);

});


test("classify() overrides to organizational for any company:<id> tag, regardless of type", () => {

    const result = classifier.classify({ type: "general", tags: ["company:acme-1"] });

    assert.strictEqual(result.memoryClass, "organizational");
    assert.match(result.reason, /company:acme-1/);

});


test("classify() overrides to procedural for a workflow/process tag, regardless of type", () => {

    const result = classifier.classify({ type: "personal", tags: ["workflow"] });

    assert.strictEqual(result.memoryClass, "procedural");
    assert.match(result.reason, /"workflow"/);

});


test("classify() prefers the organizational override over the procedural one when both tags are present", () => {

    const result = classifier.classify({ type: "general", tags: ["company:acme-1", "workflow"] });

    assert.strictEqual(result.memoryClass, "organizational");

});


test("classify() falls back cleanly for an entry with no tags at all", () => {

    const result = classifier.classify({ type: "personal", tags: [] });

    assert.strictEqual(result.memoryClass, "episodic");

});
