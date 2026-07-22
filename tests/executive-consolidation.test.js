const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as the other executive test
// files -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-consol-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-consol-${process.pid}.json`);

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
const GoalDecomposer = require("../core/executive/decomposer");
const ProjectManager = require("../core/executive/projectManager");
const MemoryConsolidation = require("../core/executive/consolidation");
const memory = require("../core/memory");

function mockBrain(consolidation, responseText){

    consolidation.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    consolidation.intelligence.brain.provider.active = "claude";

}

function makeStack(){

    const planner = new ExecutivePlanner();
    const decomposer = new GoalDecomposer({ planner });
    const projectManager = new ProjectManager({ planner });
    const consolidation = new MemoryConsolidation();

    return { planner, decomposer, projectManager, consolidation };

}

test("run() skips the brain call and reports no activity when nothing changed", async () => {

    const { consolidation } = makeStack();

    // The shared test database accumulates fixture data from every other
    // test file in this run, so "nothing happened recently" can't be
    // assumed from a fresh DB -- force the window forward instead of
    // relying on DEFAULT_WINDOW_DAYS to happen to be empty. This
    // guarantees zero matches regardless of what other test files did,
    // and proves the brain is never touched (not mocked here -- a real
    // call would throw/hang without credentials wired for it).
    consolidation.windowStart = () => new Date(Date.now() + 60 * 60 * 1000);

    const result = await consolidation.run();

    assert.strictEqual(result.summary, "No new activity since the last consolidation.");
    assert.deepStrictEqual(result.patterns, []);

});

test("run() gathers completed tasks, important memories, decisions, and project lessons, then synthesizes them", async () => {

    const { planner, decomposer, projectManager, consolidation } = makeStack();

    const project = planner.plan({ title: "Consolidation target project XQZCONSOL1" });

    mockBrain(decomposer, JSON.stringify({
        milestones: [{ title: "Milestone XQZCONSOL1", tasks: [{ title: "Task XQZCONSOL1", subtasks: [], deliverables: [] }] }]
    }));

    const decomposed = await decomposer.decompose(project.id);
    const taskId = decomposed.milestones[0].tasks[0].id;

    projectManager.updateStatus(taskId, "completed", "Shipped it XQZCONSOL1");
    projectManager.updateStatus(project.id, "completed", "Wrapped up early XQZCONSOL1");

    memory.remember({ content: "Important finding XQZCONSOL1", type: "technical knowledge", importance: 5 });
    memory.remember({ content: "Chose approach A over B XQZCONSOL1", type: "decisions", importance: 4 });

    mockBrain(consolidation, JSON.stringify({
        summary: "Shipped the XQZCONSOL1 project.",
        patterns: ["Fast turnaround"],
        recommendations: ["Keep doing that"],
        insights: ["Small scoped projects finish faster"]
    }));

    const result = await consolidation.run();

    assert.strictEqual(result.summary, "Shipped the XQZCONSOL1 project.");
    assert.deepStrictEqual(result.patterns, ["Fast turnaround"]);
    assert.strictEqual(result.counts.completedTasks, 1);
    assert.strictEqual(result.counts.importantMemories, 1);
    assert.strictEqual(result.counts.decisionHistory, 1);
    assert.strictEqual(result.counts.projectLessons, 2);

});

test("history() returns past runs, most recent gettable via lastRun()", async () => {

    const { consolidation } = makeStack();

    const first = await consolidation.run();

    const runs = consolidation.history();

    assert.ok(runs.some(r => r.id === first.id));

    const last = consolidation.lastRun();
    assert.strictEqual(last.id, first.id);

});

test("windowStart() uses the last run's timestamp once one exists", async () => {

    const { consolidation } = makeStack();

    const first = await consolidation.run();

    const window = consolidation.windowStart();

    assert.strictEqual(window.toISOString(), new Date(first.created).toISOString());

});

test("synthesize() throws a clear error when the model response isn't valid JSON", async () => {

    const { planner, consolidation } = makeStack();

    planner.plan({ title: "Bad response trigger project XQZCONSOL2" });
    memory.remember({ content: "trigger activity XQZCONSOL2", type: "decisions", importance: 5 });

    mockBrain(consolidation, "not json at all");

    await assert.rejects(
        () => consolidation.run(),
        /not valid JSON/
    );

});
