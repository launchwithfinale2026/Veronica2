const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-weeklyrep-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-weeklyrep-${process.pid}.json`);

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
const WeeklyOperatingReport = require("../core/executive/weeklyReport");

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


test("windowStart() is approximately 7 days before now", () => {

    const report = new WeeklyOperatingReport({ planner: new ExecutivePlanner() });

    const start = report.windowStart();
    const daysAgo = (Date.now() - start.getTime()) / (24 * 60 * 60 * 1000);

    assert.ok(Math.abs(daysAgo - 7) < 0.01);

});


test("newProjectsThisWindow() reflects only projects created within the window (scoped, exact)", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "New this week project XQZWEEK1", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const report = new WeeklyOperatingReport({ planner: scoped });

    const since = report.windowStart().getTime();
    const newProjects = report.newProjectsThisWindow(since);

    assert.strictEqual(newProjects.length, 1);
    assert.strictEqual(newProjects[0].id, project.id);

});


test("completedThisWindow() reports this test's own completed project and reflects at least its own completed task", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Completed this week project XQZWEEK2", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZWEEK2", tasks: [{ title: "Task XQZWEEK2", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);

    const report = new WeeklyOperatingReport({ planner: scoped });
    const since = report.windowStart().getTime();

    // taskCount scans the WHOLE store by design (a weekly report is a
    // system-wide rollup, not scoped to one project) -- delta, not
    // absolute value, is the safe assertion here.
    const before = report.completedThisWindow(since).taskCount;

    projectManager.updateStatus(task.id, "completed", "done XQZWEEK2");
    projectManager.updateStatus(project.id, "completed", "done XQZWEEK2");

    const after = report.completedThisWindow(since);

    assert.strictEqual(after.taskCount, before + 1);
    assert.ok(after.projects.some(p => p.id === project.id));

});


test("blockersEncounteredThisWindow() counts a new blocked-status transition within the window", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Blocker window project XQZWEEK3", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZWEEK3", tasks: [{ title: "Task XQZWEEK3", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);

    const report = new WeeklyOperatingReport({ planner: scoped });
    const since = report.windowStart().getTime();

    const before = report.blockersEncounteredThisWindow(since);

    projectManager.updateStatus(task.id, "blocked", "simulated XQZWEEK3");

    const after = report.blockersEncounteredThisWindow(since);

    assert.strictEqual(after, before + 1);

});


test("generate() returns a complete report shape with both scoped and system-wide fields", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Report shape project XQZWEEK4", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const report = new WeeklyOperatingReport({ planner: scoped });

    const result = report.generate();

    assert.ok(result.weekStart);
    assert.ok(result.weekEnd);
    assert.ok(Array.isArray(result.completed.projects));
    assert.ok(Number.isFinite(result.completed.taskCount));
    assert.ok(result.newProjects.some(p => p.id === project.id));
    assert.ok(Number.isFinite(result.blockersEncountered));
    assert.ok(Number.isFinite(result.briefingsGenerated));
    assert.ok(Number.isFinite(result.recommendationRunsGenerated));
    assert.ok(Number.isFinite(result.totalRecommendationsIssued));
    assert.ok(Number.isFinite(result.consolidationRuns));
    assert.ok(Number.isFinite(result.selfMonitorIssueRuns));
    assert.strictEqual(result.currentRoadmap.totalProjects, 1);
    assert.ok(result.learningOverview);

});


test("run() persists a weekly report record and history() returns it", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Persisted weekly report project XQZWEEK5", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const report = new WeeklyOperatingReport({ planner: scoped });

    const record = report.run();

    assert.ok(record.id);
    assert.strictEqual(record.currentRoadmap.totalProjects, 1);

    const history = report.history(50);
    assert.ok(history.some(r => r.id === record.id));

});
