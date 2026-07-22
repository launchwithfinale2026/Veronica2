const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-lifecycle-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-lifecycle-${process.pid}.json`);

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

const store = require("../core/memory/store");
const knowledge = require("../core/knowledge");
const MemoryLifecycle = require("../core/memory/memoryLifecycle");
const memory = require("../core/memory");

function backdate(id, daysAgo){

    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    const entry = data.memories.find(m => m.id === id);
    entry.updated = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

}


test("nextStage() promotes temporary -> active once score crosses the active threshold", () => {

    const lifecycle = new MemoryLifecycle();

    const entry = { metadata: { lifecycle: "temporary" }, updated: new Date().toISOString() };

    assert.strictEqual(lifecycle.nextStage(entry, 34), null);

    const transition = lifecycle.nextStage(entry, 35);
    assert.strictEqual(transition.stage, "active");
    assert.match(transition.reason, /35/);

});


test("nextStage() promotes straight to persistent from any non-terminal stage once score crosses the persistent threshold", () => {

    const lifecycle = new MemoryLifecycle();

    const active = { metadata: { lifecycle: "active" }, updated: new Date().toISOString() };
    const transition = lifecycle.nextStage(active, 70);

    assert.strictEqual(transition.stage, "persistent");

});


test("nextStage() never demotes an already-persistent entry just because its score later dips", () => {

    const lifecycle = new MemoryLifecycle();

    const persistent = { metadata: { lifecycle: "persistent" }, updated: new Date().toISOString() };

    assert.strictEqual(lifecycle.nextStage(persistent, 5), null);

});


test("nextStage() archives a low-value, long-stale entry regardless of its current stage", () => {

    const lifecycle = new MemoryLifecycle();

    const stale = {
        metadata: { lifecycle: "active" },
        updated: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000).toISOString()
    };

    const transition = lifecycle.nextStage(stale, 10);

    assert.strictEqual(transition.stage, "archived");
    assert.match(transition.reason, /61 days|60 days/);

});


test("nextStage() does not archive a low-value entry that's still recent", () => {

    const lifecycle = new MemoryLifecycle();

    const recentLowValue = { metadata: { lifecycle: "temporary" }, updated: new Date().toISOString() };

    assert.strictEqual(lifecycle.nextStage(recentLowValue, 5), null);

});


test("run() reclassifies, rescores, and promotes eligible entries in one sweep", () => {

    const entry = store.remember({
        content: "Lifecycle sweep entry XQZLIFE1",
        type: "decisions",
        importance: 5,
        tags: ["company:acme-xqzlife1"]
    });

    const lifecycle = new MemoryLifecycle();
    const transitions = lifecycle.run();

    const thisTransition = transitions.find(t => t.id === entry.id);
    assert.ok(thisTransition);
    assert.ok(["active", "persistent"].includes(thisTransition.to));

    const updated = store.recall().find(m => m.id === entry.id);
    assert.strictEqual(updated.metadata.memoryClass, "organizational");
    assert.ok(Number.isFinite(updated.metadata.importanceScore));
    assert.strictEqual(updated.metadata.lifecycle, thisTransition.to);

});


test("run() links a newly-persistent entry into the knowledge graph", () => {

    const entry = store.remember({
        content: "Persistent-worthy entry XQZLIFE2",
        type: "workflow",
        importance: 5,
        tags: ["company:acme-xqzlife2", "workflow", "recurring", "important"]
    });

    // Force real connections too, since connectedKnowledgeScore() counts
    // graph RELATIONSHIPS against the entry's own content as an entity
    // name -- pushing this entry (importance 30 + business 15 +
    // reusable-type/tag retrieval value 10 + connections 8 + recency 10
    // = 73) past the persistent threshold. Deliberately NOT pre-creating
    // an entity for the entry's own content: addRelationship() doesn't
    // require one to exist, and addEntity() dedupes by name (returning
    // the existing entity unchanged) -- pre-creating one here would mean
    // linkToKnowledgeGraph()'s own addEntity() call below can't be
    // observed creating it fresh with type "persistent-memory".
    knowledge.addEntity({ name: "Some Related Thing XQZLIFE2", type: "concept" });
    knowledge.addEntity({ name: "Another Related Thing XQZLIFE2", type: "concept" });
    knowledge.addRelationship({ from: "Persistent-worthy entry XQZLIFE2", to: "Some Related Thing XQZLIFE2", type: "relatesTo" });
    knowledge.addRelationship({ from: "Persistent-worthy entry XQZLIFE2", to: "Another Related Thing XQZLIFE2", type: "relatesTo" });

    const lifecycle = new MemoryLifecycle();
    const transitions = lifecycle.run();

    const thisTransition = transitions.find(t => t.id === entry.id);
    assert.ok(thisTransition);
    assert.strictEqual(thisTransition.to, "persistent");

    const linked = knowledge.read().entities.find(e => e.name === "Persistent-worthy entry XQZLIFE2" && e.type === "persistent-memory");
    assert.ok(linked);

    const classified = knowledge.connections("Persistent-worthy entry XQZLIFE2").find(rel => rel.type === "classifiedAs");
    assert.ok(classified);

});


test("run() archives an old, low-value entry", () => {

    const entry = store.remember({
        content: "Old low value entry XQZLIFE3",
        type: "general",
        importance: 1
    });

    backdate(entry.id, 61);

    const lifecycle = new MemoryLifecycle();
    const transitions = lifecycle.run();

    const thisTransition = transitions.find(t => t.id === entry.id);
    assert.ok(thisTransition);
    assert.strictEqual(thisTransition.to, "archived");

});


test("overview() counts entries by lifecycle stage", () => {

    const entry = store.remember({ content: "Overview stage entry XQZLIFE4", type: "general" });

    const lifecycle = new MemoryLifecycle();
    const before = lifecycle.overview();

    assert.ok(before.byStage.temporary >= 1);
    assert.strictEqual(before.total, store.recall().length);

    const found = store.recall().find(m => m.id === entry.id);
    assert.strictEqual(found.metadata.lifecycle, undefined);

});


test("memory.remember() (the facade) auto-classifies, auto-scores, and starts every new entry at \"temporary\"", () => {

    const entry = memory.remember({
        content: "Facade auto-evolution entry XQZLIFE5",
        type: "workflow",
        tags: ["workflow"]
    });

    assert.strictEqual(entry.metadata.memoryClass, "procedural");
    assert.ok(typeof entry.metadata.classificationReason === "string");
    assert.ok(Number.isFinite(entry.metadata.importanceScore));
    assert.ok(entry.metadata.importanceBreakdown);
    assert.strictEqual(entry.metadata.lifecycle, "temporary");

});


test("memory.runLifecyclePromotion()/lifecycleOverview() are wired through the facade", () => {

    memory.remember({ content: "Facade sweep entry XQZLIFE6", type: "general" });

    const transitions = memory.runLifecyclePromotion();
    assert.ok(Array.isArray(transitions));

    const overview = memory.lifecycleOverview();
    assert.ok(Number.isFinite(overview.total));
    assert.ok(overview.byStage);

});
