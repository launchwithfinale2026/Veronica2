const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-blockdet-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-blockdet-${process.pid}.json`);

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
const BlockerDetector = require("../core/executive/blockerDetection");

function scopedPlanner(realPlanner, allowedIds){
    return {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        roadmap: (opts) => realPlanner.roadmap(opts).filter(p => allowedIds.includes(p.id)),
        evaluateDeadlines(){
            const grouped = { overdue: [], due_soon: [], on_track: [], no_deadline: [] };
            for(const project of realPlanner.roadmap().filter(p => allowedIds.includes(p.id))){
                grouped[project.deadlineStatus].push(project);
            }
            return grouped;
        }
    };
}

function mockDecomposerBrain(decomposer, responseObj){
    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    decomposer.intelligence.brain.provider.active = "claude";
}


test("findBlockedTasks() reports a blocked task with how it got there", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Blocked task project XQZBLK1", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZBLK1", tasks: [{ title: "Task XQZBLK1", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Execution failed: simulated XQZBLK1");

    const detector = new BlockerDetector({ planner: scoped, projectManager });
    const { blockedTasks } = detector.detect();

    // findBlockedTasks() deliberately scans the WHOLE memory store (any
    // blocked task anywhere is worth surfacing, not just this project's)
    // -- so this asserts THIS task is present and correctly explained,
    // not that it's the only one, which would be a false assumption in
    // a shared memory store other tests/real usage also write to.
    const found = blockedTasks.find(entry => entry.id === task.id);
    assert.ok(found);
    assert.match(found.reason, /simulated XQZBLK1/);
    assert.ok(Number.isFinite(found.blockedDays));

});


test("findDeadlockedProjects() detects a project where the only remaining task is blocked", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Deadlocked project XQZBLK2", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZBLK2", tasks: [{ title: "Task XQZBLK2", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Access denied: simulated XQZBLK2");

    const detector = new BlockerDetector({ planner: scoped, projectManager });
    const { deadlockedProjects } = detector.detect();

    assert.strictEqual(deadlockedProjects.length, 1);
    assert.strictEqual(deadlockedProjects[0].project.id, project.id);
    assert.strictEqual(deadlockedProjects[0].holdups[0].holdup, "blocked");
    assert.match(deadlockedProjects[0].reason, /simulated XQZBLK2/);
    // Phase 48 (Executive Intelligence): `company` is additive on the
    // real roadmap project -- null here since this project was never
    // scoped to a company.
    assert.strictEqual(deadlockedProjects[0].project.company, null);

});


test("findDeadlockedProjects() reports the real company a deadlocked project is scoped to (Phase 48 Executive Intelligence)", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Company-scoped deadlock project XQZBLK5", department: "ares", company: "test-company-xqzblk5" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZBLK5", tasks: [{ title: "Task XQZBLK5", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Access denied: simulated XQZBLK5");

    const detector = new BlockerDetector({ planner: scoped, projectManager });
    const { deadlockedProjects } = detector.detect();

    assert.strictEqual(deadlockedProjects[0].project.company, "test-company-xqzblk5");

});


test("findDeadlockedProjects() detects a project stuck on an unresolved dependency", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Dependency deadlock project XQZBLK3", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{
            title: "Milestone XQZBLK3",
            tasks: [
                { title: "Task A XQZBLK3", subtasks: [], deliverables: [] },
                { title: "Task B XQZBLK3", dependsOnTitles: ["Task A XQZBLK3"], subtasks: [], deliverables: [] }
            ]
        }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const tasks = projectManager.tasksForProject(project.id);
    const taskA = tasks.find(t => t.content === "Task A XQZBLK3");

    // Task A is blocked (not completed), so Task B can never become ready.
    projectManager.updateStatus(taskA.id, "blocked", "Execution failed: simulated XQZBLK3");

    const detector = new BlockerDetector({ planner: scoped, projectManager });
    const { deadlockedProjects } = detector.detect();

    assert.strictEqual(deadlockedProjects.length, 1);

    const taskBHoldup = deadlockedProjects[0].holdups.find(h => h.title === "Task B XQZBLK3");
    assert.strictEqual(taskBHoldup.holdup, "waiting_on_dependency");
    assert.match(taskBHoldup.detail, /Task A XQZBLK3/);

});


test("findDeadlockedProjects() does not flag a project with at least one ready task", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Not deadlocked project XQZBLK4", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZBLK4", tasks: [{ title: "Task XQZBLK4", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const detector = new BlockerDetector({ planner: scoped, projectManager });
    const { deadlockedProjects, blockedTasks } = detector.detect();

    // deadlockedProjects IS scoped (via this.planner.roadmap()), so an
    // exact-length assertion is safe here.
    assert.strictEqual(deadlockedProjects.length, 0);

    // blockedTasks is global by design (see the test above) -- assert
    // this test's own task specifically isn't in it, not that the whole
    // list is empty.
    const [task] = projectManager.tasksForProject(project.id);
    assert.ok(!blockedTasks.some(entry => entry.id === task.id));

});
