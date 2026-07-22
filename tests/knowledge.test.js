const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const TMP_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(GRAPH_PATH, TMP_BACKUP);
});

test.after(() => {
    fs.copyFileSync(TMP_BACKUP, GRAPH_PATH);
    fs.unlinkSync(TMP_BACKUP);
});

const knowledge = require("../core/knowledge");
const { seedFromAgents } = require("../core/knowledge/seed");

test("addEntity is idempotent by name", () => {

    const first = knowledge.addEntity({ name: "TestEntityXYZ", type: "concept" });
    const second = knowledge.addEntity({ name: "testentityxyz", type: "concept" });

    assert.strictEqual(first.id, second.id);

    const matches = knowledge.find("TestEntityXYZ");
    assert.strictEqual(matches.length, 1);

});

test("addRelationship is idempotent by (from, type, to)", () => {

    knowledge.addEntity({ name: "A_XYZ", type: "concept" });
    knowledge.addEntity({ name: "B_XYZ", type: "concept" });

    const first = knowledge.addRelationship({ from: "A_XYZ", to: "B_XYZ", type: "relatesTo" });
    const second = knowledge.addRelationship({ from: "A_XYZ", to: "B_XYZ", type: "relatesTo" });

    assert.strictEqual(first.id, second.id);

    const conns = knowledge.connections("A_XYZ");
    assert.strictEqual(conns.filter(r => r.type === "relatesTo").length, 1);

});

test("connections() finds relationships in either direction", () => {

    knowledge.addEntity({ name: "Parent_XYZ", type: "concept" });
    knowledge.addEntity({ name: "Child_XYZ", type: "concept" });
    knowledge.addRelationship({ from: "Parent_XYZ", to: "Child_XYZ", type: "contains" });

    const fromParent = knowledge.connections("Parent_XYZ");
    const fromChild = knowledge.connections("Child_XYZ");

    assert.ok(fromParent.some(r => r.to === "Child_XYZ"));
    assert.ok(fromChild.some(r => r.from === "Parent_XYZ"));

});

test("retrieve() returns matching entities and their connected relationships", () => {

    knowledge.addEntity({ name: "Retrieve_XYZ", type: "concept" });
    knowledge.addEntity({ name: "Other_XYZ", type: "concept" });
    knowledge.addRelationship({ from: "Retrieve_XYZ", to: "Other_XYZ", type: "linkedTo" });

    const result = knowledge.retrieve("Retrieve_XYZ");

    assert.strictEqual(result.entities.length, 1);
    assert.ok(result.relationships.some(r => r.type === "linkedTo"));

});

test("seedFromAgents populates the protocol example graph and is idempotent", () => {

    const agents = [
        { name: "METIS", department: "athena", role: "Chief Knowledge Analyst" }
    ];

    seedFromAgents(agents);
    seedFromAgents(agents);

    const veronica = knowledge.find("VERONICA");
    assert.strictEqual(veronica.length, 1);

    const veronicaConnections = knowledge.connections("VERONICA");
    assert.strictEqual(
        veronicaConnections.filter(r => r.from === "Jacob" && r.type === "builds").length,
        1
    );
    assert.strictEqual(
        veronicaConnections.filter(r => r.to === "METIS" && r.type === "contains").length,
        1
    );

});
