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

test("findByType() returns exact (case-insensitive) type matches, not name substring matches (Project H)", () => {

    knowledge.addEntity({ name: "XQZKG-TYPE Person One", type: "person" });
    knowledge.addEntity({ name: "XQZKG-TYPE Person Two", type: "person" });
    knowledge.addEntity({ name: "XQZKG-TYPE Concept One", type: "concept" });

    const people = knowledge.findByType("person").filter(e => e.name.startsWith("XQZKG-TYPE"));

    assert.strictEqual(people.length, 2);
    assert.ok(people.every(e => e.type === "person"));

    const upperCase = knowledge.findByType("PERSON").filter(e => e.name.startsWith("XQZKG-TYPE"));
    assert.strictEqual(upperCase.length, 2);

});


test("expand() generalizes connections() to N hops, never revisiting an entity reached at a closer distance (Project H)", () => {

    knowledge.addEntity({ name: "XQZKG-EXPAND A", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-EXPAND B", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-EXPAND C", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-EXPAND D", type: "concept" });

    knowledge.addRelationship({ from: "XQZKG-EXPAND A", to: "XQZKG-EXPAND B", type: "linksTo" });
    knowledge.addRelationship({ from: "XQZKG-EXPAND B", to: "XQZKG-EXPAND C", type: "linksTo" });
    knowledge.addRelationship({ from: "XQZKG-EXPAND C", to: "XQZKG-EXPAND D", type: "linksTo" });

    const oneHop = knowledge.expand("XQZKG-EXPAND A", 1);
    assert.ok(oneHop.entities.some(e => e.name === "XQZKG-EXPAND B"));
    assert.ok(!oneHop.entities.some(e => e.name === "XQZKG-EXPAND C"));

    const twoHops = knowledge.expand("XQZKG-EXPAND A", 2);
    assert.ok(twoHops.entities.some(e => e.name === "XQZKG-EXPAND C"));
    assert.ok(!twoHops.entities.some(e => e.name === "XQZKG-EXPAND D"));

    const threeHops = knowledge.expand("XQZKG-EXPAND A", 3);
    assert.ok(threeHops.entities.some(e => e.name === "XQZKG-EXPAND D"));
    assert.strictEqual(threeHops.relationships.length, 3);

});


test("findPath() finds a real shortest path across multiple hops, and honestly reports no path within maxDepth (Project H)", () => {

    knowledge.addEntity({ name: "XQZKG-PATH Start", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-PATH Middle", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-PATH End", type: "concept" });
    knowledge.addEntity({ name: "XQZKG-PATH Unreachable", type: "concept" });

    knowledge.addRelationship({ from: "XQZKG-PATH Start", to: "XQZKG-PATH Middle", type: "linksTo" });
    knowledge.addRelationship({ from: "XQZKG-PATH Middle", to: "XQZKG-PATH End", type: "linksTo" });

    const result = knowledge.findPath("XQZKG-PATH Start", "XQZKG-PATH End");

    assert.strictEqual(result.found, true);
    assert.deepStrictEqual(result.path, ["XQZKG-PATH Start", "XQZKG-PATH Middle", "XQZKG-PATH End"]);
    assert.strictEqual(result.relationships.length, 2);

    const noPath = knowledge.findPath("XQZKG-PATH Start", "XQZKG-PATH Unreachable");
    assert.strictEqual(noPath.found, false);
    assert.deepStrictEqual(noPath.path, []);

    // Direction-agnostic: the relationship runs Start -> Middle, but a
    // real path from Middle back to Start must still be found (you can
    // "reach" either side of a real relationship from the other).
    const reverse = knowledge.findPath("XQZKG-PATH Middle", "XQZKG-PATH Start");
    assert.strictEqual(reverse.found, true);

    const samePath = knowledge.findPath("XQZKG-PATH Start", "XQZKG-PATH Start");
    assert.deepStrictEqual(samePath, { found: true, path: ["XQZKG-PATH Start"], relationships: [] });

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
