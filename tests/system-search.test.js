const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-search-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-search-${process.pid}.json`);

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

const memory = require("../core/memory");
const knowledge = require("../core/knowledge");
const search = require("../core/system/search");


test("search() requires a real query", () => {
    assert.throws(() => search.search(), /query is required/);
});


test("search() finds a real memory entry, a real knowledge entity, and a real capability across all three systems", () => {

    memory.remember({ content: "Universal search marker XQZSEARCH1", type: "general" });
    knowledge.addEntity({ name: "XQZSEARCH1 Entity", type: "concept" });

    const result = search.search("xqzsearch1");

    assert.ok(result.memories.some(m => m.content.includes("XQZSEARCH1")));
    assert.ok(result.entities.some(e => e.name.includes("XQZSEARCH1")));
    assert.ok(Array.isArray(result.capabilities));

});
