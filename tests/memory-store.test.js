const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// store.js hardcodes its data file path relative to __dirname, so we
// point HOME... no -- instead we load a fresh copy of the module against
// a temp file by monkeypatching require's resolution isn't available
// here. Simplest safe approach: operate on a throwaway copy of the real
// module's file, save/restore it, and undo any writes afterward.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const TMP_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, TMP_BACKUP);
});

test.after(() => {
    fs.copyFileSync(TMP_BACKUP, DB_PATH);
    fs.unlinkSync(TMP_BACKUP);
});

// Fresh require after backup so we operate on the real (already-migrated)
// data file without re-triggering migration side effects mid-test.
const store = require("../core/memory/store");

test("remember() produces a fully-structured memory object", () => {

    const entry = store.remember({
        content: "Test memory entry for the Phase 3 test suite",
        type: "technical knowledge",
        importance: 5,
        tags: ["test", "phase3"],
        source: "test-suite"
    });

    assert.ok(entry.id);
    assert.strictEqual(entry.type, "technical knowledge");
    assert.strictEqual(entry.importance, 5);
    assert.deepStrictEqual(entry.tags, ["test", "phase3"]);
    assert.strictEqual(entry.source, "test-suite");
    assert.ok(entry.created);
    assert.ok(entry.updated);
});

test("remember() accepts a plain string (legacy shorthand)", () => {

    const entry = store.remember("bare string memory");

    assert.strictEqual(entry.content, "bare string memory");
    assert.strictEqual(entry.type, "general");
    assert.strictEqual(entry.importance, 3);
});

test("search() ranks by importance then recency", () => {

    store.remember({ content: "low priority marker ZQX", importance: 1 });
    store.remember({ content: "high priority marker ZQX", importance: 5 });

    const results = store.search("ZQX");

    assert.ok(results.length >= 2);
    assert.strictEqual(results[0].content, "high priority marker ZQX");
});

test("search() matches on tags as well as content", () => {

    store.remember({ content: "unrelated wording", tags: ["uniquetagXYZ"] });

    const results = store.search("uniquetagXYZ");

    assert.ok(results.some(r => r.content === "unrelated wording"));
});

test("filter() narrows by type and minimum importance", () => {

    store.remember({ content: "a goal entry", type: "goals", importance: 4 });
    store.remember({ content: "a low goal entry", type: "goals", importance: 1 });

    const results = store.filter({ type: "goals", minImportance: 3 });

    assert.ok(results.every(r => r.type === "goals" && r.importance >= 3));
    assert.ok(results.some(r => r.content === "a goal entry"));
    assert.ok(!results.some(r => r.content === "a low goal entry"));
});

test("recall() bootstraps an empty database.json when the file doesn't exist (Phase 10 audit: no longer tracked in git)", () => {

    fs.unlinkSync(DB_PATH);
    assert.ok(!fs.existsSync(DB_PATH));

    const result = store.recall();

    assert.deepStrictEqual(result, []);
    assert.ok(fs.existsSync(DB_PATH));

    const onDisk = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    assert.deepStrictEqual(onDisk, { memories: [] });

});
