const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/executive.test.js --
// relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-priorank-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-priorank-${process.pid}.json`);

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
const ProjectManager = require("../core/executive/projectManager");
const PriorityRanking = require("../core/executive/priorityRanking");

// Same test-isolation technique as tests/executive-orchestrator.test.js:
// scopes roadmap() to just this test's own project ids, so rank() --
// which deliberately scans the WHOLE active roadmap, by design -- can't
// be affected by real pre-existing VERONICA usage data.
function scopedPlanner(realPlanner, allowedIds){
    return {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        urgencyScore: (deadline) => realPlanner.urgencyScore(deadline),
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

function setStoredPriority(projectId, value){

    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    const entry = data.memories.find(m => m.id === projectId);
    entry.metadata.priority = value;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

}


test("score() explains the base score as importance x2 plus current deadline urgency", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({
        title: "Priority base score project XQZPRI1",
        priority: 5, // importance
        department: "ares"
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const ranking = new PriorityRanking({ planner: scoped, projectManager });

    const { score, reasons } = ranking.score(project, [project]);

    // No deadline -> urgency 0 -> score = 5*2 + 0 = 10
    assert.strictEqual(score, 10);
    assert.ok(reasons[0].includes("importance 5/5"));
    assert.ok(reasons[0].includes("urgency 0/4"));

});


test("score() adds a blocked bonus and explains it", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Priority blocked project XQZPRI2", priority: 3, department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const ranking = new PriorityRanking({ planner: scoped, projectManager });

    projectManager.updateStatus(project.id, "blocked", "test setup");

    const blockedProject = { ...project, status: "blocked" };
    const { score, reasons } = ranking.score(blockedProject, [blockedProject]);

    // importance 3 x2 = 6, no deadline = 0, +3 blocked = 9
    assert.strictEqual(score, 9);
    assert.ok(reasons.some(r => r.includes("blocked")));

});


test("score() adds a per-dependent bonus and explains how many projects it blocks", () => {

    const realPlanner = new ExecutivePlanner();

    const upstream = realPlanner.plan({ title: "Upstream project XQZPRI3", priority: 3, department: "ares" });
    const downstream1 = realPlanner.plan({ title: "Downstream project A XQZPRI3", priority: 3, department: "ares", dependencies: [upstream.id] });
    const downstream2 = realPlanner.plan({ title: "Downstream project B XQZPRI3", priority: 3, department: "ares", dependencies: [upstream.id] });

    const scoped = scopedPlanner(realPlanner, [upstream.id, downstream1.id, downstream2.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const ranking = new PriorityRanking({ planner: scoped, projectManager });

    const roadmap = scoped.roadmap();
    const { score, reasons } = ranking.score(upstream, roadmap);

    // importance 3 x2 = 6, no deadline = 0, +2 dependents x 2 = 4 -> 10
    assert.strictEqual(score, 10);
    assert.ok(reasons.some(r => r.includes("blocks 2 other active project(s)")));

});


test("score() explains when live-recomputed urgency has drifted from the stored priority", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Priority drift project XQZPRI4", priority: 3, department: "ares" });

    // Simulate staleness: the priority stored at plan() time no longer
    // matches what a fresh recomputation against today would produce --
    // memory.update() always stamps `updated` to now, so this directly
    // edits the underlying file the same way tests/automation-engine.test.js
    // directly mutates in-memory state to simulate a due schedule.
    setStoredPriority(project.id, 1);

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const ranking = new PriorityRanking({ planner: scoped, projectManager });

    const staleProject = { ...project, priority: 1 };
    const { reasons } = ranking.score(staleProject, [staleProject]);

    assert.ok(reasons.some(r => r.includes("risen") && r.includes("stored priority was 1/10")));

});


test("rank() excludes completed projects and sorts by score, most urgent first", () => {

    const realPlanner = new ExecutivePlanner();

    const low = realPlanner.plan({ title: "Rank low project XQZPRI5", priority: 1, department: "ares" });
    const high = realPlanner.plan({ title: "Rank high project XQZPRI5", priority: 5, department: "ares" });
    const done = realPlanner.plan({ title: "Rank completed project XQZPRI5", priority: 5, department: "ares" });

    const scoped = scopedPlanner(realPlanner, [low.id, high.id, done.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const ranking = new PriorityRanking({ planner: scoped, projectManager });

    projectManager.updateStatus(done.id, "completed", "test setup");

    const ranked = ranking.rank();

    assert.strictEqual(ranked.length, 2);
    assert.ok(!ranked.some(entry => entry.project.id === done.id));

    const highIndex = ranked.findIndex(entry => entry.project.id === high.id);
    const lowIndex = ranked.findIndex(entry => entry.project.id === low.id);

    assert.ok(highIndex < lowIndex);

});
