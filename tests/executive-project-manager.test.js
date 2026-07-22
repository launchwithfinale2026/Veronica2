const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as the other executive test
// files -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-pm-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-pm-${process.pid}.json`);

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

function mockBrain(decomposer, responseText){

    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    decomposer.intelligence.brain.provider.active = "claude";

}

function makeStack(){

    const planner = new ExecutivePlanner();
    const decomposer = new GoalDecomposer({ planner });
    const projectManager = new ProjectManager({ planner });

    return { planner, decomposer, projectManager };

}

test("plan() resolves default owners from the assigned department's roster", () => {

    const { planner } = makeStack();

    const project = planner.plan({ title: "Owner default project XQZP1", department: "hephaestus" });

    assert.deepStrictEqual(project.owners, ["DAEDALUS"]);

});

test("plan() honors an explicit owners override", () => {

    const { planner } = makeStack();

    const project = planner.plan({ title: "Owner override project XQZP2", owners: ["Jacob"] });

    assert.deepStrictEqual(project.owners, ["Jacob"]);

});

test("updateStatus() records a history entry and rejects an unknown status", () => {

    const { planner, projectManager } = makeStack();

    const project = planner.plan({ title: "Status project XQZP3" });

    const result = projectManager.updateStatus(project.id, "in_progress", "kicked off");

    assert.strictEqual(result.status, "in_progress");
    assert.strictEqual(result.history.length, 1);
    assert.strictEqual(result.history[0].from, "planned");
    assert.strictEqual(result.history[0].to, "in_progress");
    assert.strictEqual(result.history[0].note, "kicked off");

    assert.throws(() => projectManager.updateStatus(project.id, "not-a-status"));

});

test("updateStatus() refuses to transition out of completed", () => {

    const { planner, projectManager } = makeStack();

    const project = planner.plan({ title: "Terminal status project XQZP4" });

    projectManager.updateStatus(project.id, "completed");

    assert.throws(() => projectManager.updateStatus(project.id, "in_progress"));

});

test("updateStatus() works on a milestone/task id, not just a project id", async () => {

    const { planner, decomposer, projectManager } = makeStack();

    const project = planner.plan({ title: "Decomposed status project XQZP5" });

    mockBrain(decomposer, JSON.stringify({
        milestones: [{ title: "Milestone XQZP5", tasks: [{ title: "Task XQZP5", subtasks: [], deliverables: [] }] }]
    }));

    const result = await decomposer.decompose(project.id);
    const taskId = result.milestones[0].tasks[0].id;

    const updated = projectManager.updateStatus(taskId, "completed");

    assert.strictEqual(updated.status, "completed");

});

test("addArtifact() appends to the project and links it into the knowledge graph", () => {

    const { planner, projectManager } = makeStack();
    const knowledge = require("../core/knowledge");

    const project = planner.plan({ title: "Artifact project XQZP6" });

    const artifacts = projectManager.addArtifact(project.id, "https://example.com/design-doc-xqzp6");

    assert.deepStrictEqual(artifacts, ["https://example.com/design-doc-xqzp6"]);

    const connections = knowledge.connections("Artifact project XQZP6");
    assert.ok(connections.some(rel => rel.type === "produces" && rel.to === "https://example.com/design-doc-xqzp6"));

});

test("progress() falls back to a coarse status-based estimate before decomposition", () => {

    const { planner, projectManager } = makeStack();

    const planned = planner.plan({ title: "Progress planned project XQZP7" });
    assert.strictEqual(projectManager.progress(planned.id), 0);

    const inProgress = planner.plan({ title: "Progress in-progress project XQZP8" });
    projectManager.updateStatus(inProgress.id, "in_progress");
    assert.strictEqual(projectManager.progress(inProgress.id), 50);

});

test("progress() reflects completed vs. total tasks once decomposed", async () => {

    const { planner, decomposer, projectManager } = makeStack();

    const project = planner.plan({ title: "Progress decomposed project XQZP9" });

    mockBrain(decomposer, JSON.stringify({
        milestones: [{
            title: "Milestone XQZP9",
            tasks: [
                { title: "Task A XQZP9", subtasks: [], deliverables: [] },
                { title: "Task B XQZP9", subtasks: [], deliverables: [] }
            ]
        }]
    }));

    const result = await decomposer.decompose(project.id);

    assert.strictEqual(projectManager.progress(project.id), 0);

    projectManager.updateStatus(result.milestones[0].tasks[0].id, "completed");

    assert.strictEqual(projectManager.progress(project.id), 50);

});

test("getProject() returns progress, timeline/history, artifacts, milestones, and knowledge", async () => {

    const { planner, decomposer, projectManager } = makeStack();

    const project = planner.plan({ title: "Full detail project XQZP10", department: "athena" });

    mockBrain(decomposer, JSON.stringify({
        milestones: [{ title: "Milestone XQZP10", tasks: [] }]
    }));

    await decomposer.decompose(project.id);

    projectManager.updateStatus(project.id, "in_progress", "underway");
    projectManager.addArtifact(project.id, "artifact-xqzp10");

    const detail = projectManager.getProject(project.id);

    assert.strictEqual(detail.status, "in_progress");
    assert.strictEqual(detail.progress, 50);
    assert.deepStrictEqual(detail.artifacts, ["artifact-xqzp10"]);
    assert.strictEqual(detail.timeline.history.length, 1);
    assert.strictEqual(detail.milestones.length, 1);
    assert.strictEqual(detail.milestones[0].title, "Milestone XQZP10");
    assert.ok(detail.knowledge.entities.some(e => e.name === "Full detail project XQZP10"));

});

test("getProject()/updateStatus()/addArtifact() reject an unknown id", () => {

    const { projectManager } = makeStack();

    assert.throws(() => projectManager.getProject("not-a-real-id"));
    assert.throws(() => projectManager.updateStatus("not-a-real-id", "in_progress"));
    assert.throws(() => projectManager.addArtifact("not-a-real-id", "x"));

});
