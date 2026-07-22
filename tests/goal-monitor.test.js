const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-goalmon-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-goalmon-${process.pid}.json`);

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
const GoalMonitor = require("../core/executive/goalMonitor");

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

// memory.update() always stamps `updated` to now, so simulating a stale
// entry means editing the underlying file directly -- same technique
// tests/priority-ranking.test.js uses for a stale stored priority.
function backdate(id, daysAgo){

    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    const entry = data.memories.find(m => m.id === id);
    entry.updated = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

}


test("checkStalledProjects() flags an active project with no recent activity, regardless of deadline", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Stalled project XQZGOAL1", department: "ares" });

    backdate(project.id, GoalMonitor.STALE_DAYS + 1);

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const monitor = new GoalMonitor({ planner: scoped, projectManager });

    const { stalledProjects } = monitor.check();

    assert.strictEqual(stalledProjects.length, 1);
    assert.strictEqual(stalledProjects[0].project.id, project.id);
    assert.match(stalledProjects[0].reason, /No activity/);
    assert.ok(stalledProjects[0].idleDays >= GoalMonitor.STALE_DAYS);

});


test("checkStalledProjects() does not flag a recently active project", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Fresh project XQZGOAL2", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const monitor = new GoalMonitor({ planner: scoped, projectManager });

    const { stalledProjects } = monitor.check();

    assert.strictEqual(stalledProjects.length, 0);

});


test("lastActivity() reflects the most recent task update even when the project entry itself is stale", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Stale project, active task XQZGOAL3", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZGOAL3", tasks: [{ title: "Task XQZGOAL3", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    // Backdate the PROJECT entry only -- its task/milestone were just
    // created and are fresh.
    backdate(project.id, GoalMonitor.STALE_DAYS + 1);

    const monitor = new GoalMonitor({ planner: scoped, projectManager });

    const { stalledProjects } = monitor.check();

    assert.strictEqual(stalledProjects.length, 0);

});


test("checkStalledMilestones() flags an incomplete milestone with no recent task activity", async () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Stalled milestone project XQZGOAL4", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Stalled milestone XQZGOAL4", tasks: [{ title: "Task XQZGOAL4", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    const decomposition = await decomposer.decompose(project.id);

    const milestoneId = decomposition.milestones[0].id;
    backdate(milestoneId, GoalMonitor.STALE_DAYS + 1);

    const monitor = new GoalMonitor({ planner: scoped, projectManager });

    const { stalledMilestones } = monitor.check();

    assert.strictEqual(stalledMilestones.length, 1);
    assert.strictEqual(stalledMilestones[0].milestone.id, milestoneId);
    assert.match(stalledMilestones[0].reason, /no update/);

});
