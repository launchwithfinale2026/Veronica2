const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Touches real, shared state (core/memory/database.json and
// core/knowledge/graph.json) -- same backup/restore pattern as
// tests/departments.test.js -- so this relies on --test-concurrency=1
// (see package.json) to avoid racing tests/memory-store.test.js and
// tests/knowledge.test.js, which back up/restore the same files.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-exec-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-exec-${process.pid}.json`);

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

const ExecutivePlanner = require("../core/executive/planner");
const knowledge = require("../core/knowledge");

test("plan() assigns a department by keyword match against domain", () => {

    const planner = new ExecutivePlanner();

    const project = planner.plan({
        title: "Improve finance and resources planning XQZ1",
        description: "Rebuild the budgeting and forecasting model"
    });

    assert.strictEqual(project.department, "hades"); // Finance Resources

});

test("plan() honors an explicit department override", () => {

    const planner = new ExecutivePlanner();

    const project = planner.plan({
        title: "Some ambiguous goal XQZ2",
        department: "artemis"
    });

    assert.strictEqual(project.department, "artemis");

});

test("plan() rejects an unknown explicit department", () => {

    const planner = new ExecutivePlanner();

    assert.throws(() => planner.plan({ title: "Bad dept goal XQZ3", department: "not-a-real-dept" }));

});

test("plan() falls back to ares when no department keyword matches", () => {

    const planner = new ExecutivePlanner();

    const project = planner.plan({ title: "Xyzzy plugh qux XQZ4" });

    assert.strictEqual(project.department, "ares");

});

test("estimateEffort() honors an explicit estimatedHours and derives a size", () => {

    const planner = new ExecutivePlanner();

    const small = planner.estimateEffort({ title: "t", estimatedHours: 4 });
    const large = planner.estimateEffort({ title: "t", estimatedHours: 80 });

    assert.strictEqual(small.size, "small");
    assert.strictEqual(large.size, "large");

});

test("computePriority() ranks an overdue high-importance goal above a distant low-importance one", () => {

    const planner = new ExecutivePlanner();

    const overdue = planner.computePriority({
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const distant = planner.computePriority({
        priority: 1,
        deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

    assert.ok(overdue > distant);

});

test("evaluateDeadline() classifies overdue / due_soon / on_track / no_deadline", () => {

    const planner = new ExecutivePlanner();

    assert.strictEqual(
        planner.evaluateDeadline({ deadline: new Date(Date.now() - 1000).toISOString() }),
        "overdue"
    );

    assert.strictEqual(
        planner.evaluateDeadline({ deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
        "due_soon"
    );

    assert.strictEqual(
        planner.evaluateDeadline({ deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() }),
        "on_track"
    );

    assert.strictEqual(planner.evaluateDeadline({}), "no_deadline");

});

test("plan() validates dependencies against the existing roadmap", () => {

    const planner = new ExecutivePlanner();

    assert.throws(() => planner.plan({ title: "Bad dep goal XQZ5", dependencies: ["not-a-real-id"] }));

    const base = planner.plan({ title: "Base project XQZ6" });

    const dependent = planner.plan({
        title: "Dependent project XQZ7",
        dependencies: [base.id]
    });

    assert.deepStrictEqual(dependent.dependencies, [base.id]);

});

test("plan() links project/department/dependency entities in the knowledge graph", () => {

    const planner = new ExecutivePlanner();

    const project = planner.plan({
        title: "Knowledge-linked project XQZ8",
        department: "themis"
    });

    const connections = knowledge.connections("Knowledge-linked project XQZ8");

    assert.ok(connections.some(rel => rel.type === "assignedTo" && rel.to === "themis"));

});

test("roadmap() returns planned projects sorted by priority, most urgent first", () => {

    const planner = new ExecutivePlanner();

    planner.plan({ title: "Low priority roadmap goal XQZ9", priority: 1 });
    planner.plan({ title: "High priority roadmap goal XQZ10", priority: 5 });

    const roadmap = planner.roadmap();

    const low = roadmap.find(p => p.title === "Low priority roadmap goal XQZ9");
    const high = roadmap.find(p => p.title === "High priority roadmap goal XQZ10");

    assert.ok(high.priority > low.priority);
    assert.ok(roadmap.indexOf(high) < roadmap.indexOf(low));

});

test("evaluateDeadlines() groups the roadmap by deadline risk", () => {

    const planner = new ExecutivePlanner();

    planner.plan({
        title: "Overdue grouping goal XQZ11",
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const grouped = planner.evaluateDeadlines();

    assert.ok(grouped.overdue.some(p => p.title === "Overdue grouping goal XQZ11"));
    assert.ok(Array.isArray(grouped.due_soon));
    assert.ok(Array.isArray(grouped.on_track));
    assert.ok(Array.isArray(grouped.no_deadline));

});

test("plan() rejects a goal without a title", () => {

    const planner = new ExecutivePlanner();

    assert.throws(() => planner.plan({}));
    assert.throws(() => planner.plan(null));

});
