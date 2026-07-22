const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/executive.test.js --
// this file also writes to core/memory/database.json and
// core/knowledge/graph.json, so it relies on --test-concurrency=1 (see
// package.json) to avoid racing the other test files that do the same.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-decomp-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-decomp-${process.pid}.json`);

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
const knowledge = require("../core/knowledge");

// Matches tests/departments.test.js's pattern: swap in a fake "claude"
// provider so this never makes a real, paid API call.
function mockBrain(decomposer, responseText){

    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    decomposer.intelligence.brain.provider.active = "claude";

}

function makeDecomposer(){

    const planner = new ExecutivePlanner();
    const decomposer = new GoalDecomposer({ planner });

    return { planner, decomposer };

}

test("decompose() persists milestones/tasks, rolls up effort, and links the knowledge graph", async () => {

    const { planner, decomposer } = makeDecomposer();

    const project = planner.plan({ title: "Decompose target project XQZD1", department: "hephaestus" });

    mockBrain(decomposer, JSON.stringify({
        milestones: [
            {
                title: "Milestone One XQZD1",
                description: "First milestone",
                tasks: [
                    {
                        title: "Task One XQZD1",
                        estimatedHours: 5,
                        subtasks: ["Subtask A", "Subtask B"],
                        deliverables: ["Deliverable A"]
                    },
                    {
                        title: "Task Two XQZD1",
                        dependsOnTitles: ["Task One XQZD1"],
                        subtasks: [],
                        deliverables: []
                    }
                ]
            }
        ]
    }));

    const result = await decomposer.decompose(project.id);

    assert.strictEqual(result.project, project.id);
    assert.strictEqual(result.milestones.length, 1);

    const milestone = result.milestones[0];
    assert.strictEqual(milestone.department, "hephaestus");
    assert.strictEqual(milestone.tasks.length, 2);

    const [taskOne, taskTwo] = milestone.tasks;

    assert.strictEqual(taskOne.effort.hours, 5);
    assert.deepStrictEqual(taskOne.subtasks, [
        { title: "Subtask A", status: "planned" },
        { title: "Subtask B", status: "planned" }
    ]);
    assert.deepStrictEqual(taskOne.deliverables, ["Deliverable A"]);

    assert.ok(taskTwo.dependencies.includes(taskOne.id));

    assert.strictEqual(milestone.effort.hours, taskOne.effort.hours + taskTwo.effort.hours);

    const milestoneConnections = knowledge.connections("Milestone One XQZD1");
    assert.ok(milestoneConnections.some(rel => rel.type === "partOf" && rel.to === "Decompose target project XQZD1"));

    const taskConnections = knowledge.connections("Task One XQZD1");
    assert.ok(taskConnections.some(rel => rel.type === "partOf" && rel.to === "Milestone One XQZD1"));

});

test("decompose() strips a markdown code fence around the JSON response", async () => {

    const { planner, decomposer } = makeDecomposer();

    const project = planner.plan({ title: "Fenced response project XQZD2" });

    mockBrain(decomposer, "```json\n" + JSON.stringify({
        milestones: [{ title: "Fenced milestone XQZD2", tasks: [] }]
    }) + "\n```");

    const result = await decomposer.decompose(project.id);

    assert.strictEqual(result.milestones[0].title, "Fenced milestone XQZD2");

});

test("decompose() throws a clear error when the model response isn't valid JSON", async () => {

    const { planner, decomposer } = makeDecomposer();

    const project = planner.plan({ title: "Bad response project XQZD3" });

    mockBrain(decomposer, "sorry, here's some prose instead of JSON");

    await assert.rejects(
        () => decomposer.decompose(project.id),
        /not valid JSON/
    );

});

test("decompose() rejects an unknown project id", async () => {

    const { decomposer } = makeDecomposer();

    await assert.rejects(() => decomposer.decompose("not-a-real-project-id"));

});
