const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Uses a throwaway temp root (passed explicitly to every function under
// test, not the real default data/workspace/) -- indexing/searching
// against the real workspace would pollute the live memory/knowledge
// store with test fixtures, same reasoning as every other integration
// test file in this project.

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-files-"));

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-files-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-files-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

const fileIntelligence = require("../core/integrations/fileIntelligence");
const knowledge = require("../core/knowledge");
const memory = require("../core/memory");

test("listFiles() finds indexable files and ignores node_modules/.git/backups and non-indexable extensions", () => {

    fs.mkdirSync(path.join(TEMP_ROOT, "src"), { recursive: true });
    fs.writeFileSync(path.join(TEMP_ROOT, "src", "notes.md"), "# XQZFILE1 notes");
    fs.writeFileSync(path.join(TEMP_ROOT, "image.png"), "not indexable");

    fs.mkdirSync(path.join(TEMP_ROOT, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(TEMP_ROOT, "node_modules", "pkg", "index.js"), "should be ignored");

    const files = fileIntelligence.listFiles(TEMP_ROOT);

    assert.ok(files.includes(path.join("src", "notes.md")));
    assert.ok(!files.some(f => f.includes("node_modules")));
    assert.ok(!files.includes("image.png"));

});

test("readFile() reads content and rejects a path escaping the root", () => {

    const content = fileIntelligence.readFile(path.join("src", "notes.md"), TEMP_ROOT);
    assert.ok(content.includes("XQZFILE1"));

    assert.throws(() => fileIntelligence.readFile("../../etc/passwd", TEMP_ROOT), /escapes the sandboxed root/);

});

test("indexDirectory() creates file entities and memory summaries, skipping oversized files", () => {

    fs.writeFileSync(path.join(TEMP_ROOT, "huge.txt"), "x".repeat(250 * 1024));

    const result = fileIntelligence.indexDirectory(TEMP_ROOT);

    assert.ok(result.filesFound >= 2); // at least src/notes.md and huge.txt
    assert.strictEqual(result.skippedTooLarge, 1);
    assert.ok(result.memoriesCreated >= 1);

    const entity = knowledge.find(path.join("src", "notes.md"));
    assert.strictEqual(entity.length, 1);
    assert.strictEqual(entity[0].type, "file");

    const memories = memory.filter({ tag: "file-intelligence" });
    assert.ok(memories.some(m => m.content.includes("XQZFILE1")));

});

test("searchFiles() finds files by content, case-insensitively, and returns matching line numbers", () => {

    fs.writeFileSync(path.join(TEMP_ROOT, "search-target.txt"), "line one\nXQZSEARCH marker here\nline three");

    const results = fileIntelligence.searchFiles("xqzsearch", TEMP_ROOT);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].path, "search-target.txt");
    assert.strictEqual(results[0].matchingLines[0].number, 2);
    assert.ok(results[0].matchingLines[0].line.includes("XQZSEARCH"));

    assert.deepStrictEqual(fileIntelligence.searchFiles("no-such-content-anywhere-xqz", TEMP_ROOT), []);

});

test("searchFiles() requires a query, listFiles() requires the root to exist", () => {

    assert.throws(() => fileIntelligence.searchFiles("", TEMP_ROOT));
    assert.throws(() => fileIntelligence.listFiles(path.join(TEMP_ROOT, "does-not-exist")));

});


test("isConfigured()/status() report the real sandboxed root's actual presence, not a hardcoded default (Connector Hardening)", () => {

    assert.strictEqual(fileIntelligence.isConfigured(TEMP_ROOT), true);

    const status = fileIntelligence.status(TEMP_ROOT);
    assert.strictEqual(status.id, "fileIntelligence");
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.root, TEMP_ROOT);

    const missingRoot = path.join(TEMP_ROOT, "does-not-exist-xqzfile-status");
    assert.strictEqual(fileIntelligence.isConfigured(missingRoot), false);
    assert.match(fileIntelligence.status(missingRoot).note, /No directory at/);

});
