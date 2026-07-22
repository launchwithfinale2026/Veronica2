const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-mission-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-mission-${process.pid}.json`);

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
const GoalDecomposer = require("../core/executive/decomposer");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");
const MissionEngine = require("../core/executive/missionEngine");

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

function mockDecomposerBrain(decomposer, responseObj){
    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    decomposer.intelligence.brain.provider.active = "claude";
}

// scopedPlanner's roadmap()/evaluateDeadlines() only ever include
// explicitly allow-listed project ids -- since defineMission() creates
// its OWN project internally (its id isn't known ahead of time), tests
// use a "scope everything" planner instead: a thin pass-through with no
// filtering, exercising the exact same real ExecutivePlanner underneath.
function makeMissionEngine(realPlanner, mockDecomposition){

    const projectManager = new ProjectManager({ planner: realPlanner });
    const decomposer = new GoalDecomposer({ planner: realPlanner });

    mockDecomposerBrain(decomposer, mockDecomposition);

    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: realPlanner, projectManager });

    return new MissionEngine({ planner: realPlanner, projectManager, decomposer, recommendationEngine });

}


test("defineMission() creates a real project, decomposes it, runs a real capability analysis, and estimates a timeline", async () => {

    const realPlanner = new ExecutivePlanner();

    const engine = makeMissionEngine(realPlanner, {
        milestones: [{
            title: "Milestone XQZMIS1",
            tasks: [
                { title: "Task A XQZMIS1", estimatedHours: 8, subtasks: [], deliverables: [] },
                { title: "Task B XQZMIS1", estimatedHours: 16, subtasks: [], deliverables: [] }
            ]
        }]
    });

    const mission = await engine.defineMission("Build a trading division XQZMIS1", { department: "ares", priority: 5 });

    assert.strictEqual(mission.objective, "Build a trading division XQZMIS1");
    assert.ok(mission.projectId);
    assert.strictEqual(mission.capabilityAnalysis.domain, "trading");
    assert.ok(mission.capabilityAnalysis.missingCapabilities.length > 0);

    // 8 + 16 = 24 hours -> ceil(24/8) = 3 task-days, plus the capability
    // analysis's own estimatedBuildDays.
    assert.strictEqual(mission.timeline.taskDays, 3);
    assert.strictEqual(mission.timeline.capabilityBuildDays, mission.capabilityAnalysis.estimatedBuildDays);
    assert.strictEqual(mission.timeline.totalEstimatedDays, 3 + mission.capabilityAnalysis.estimatedBuildDays);

    const project = realPlanner.roadmap().find(p => p.id === mission.projectId);
    assert.strictEqual(project.title, "Build a trading division XQZMIS1");

});


test("defineMission() requires a real objective", async () => {

    const realPlanner = new ExecutivePlanner();
    const engine = makeMissionEngine(realPlanner, { milestones: [] });

    await assert.rejects(() => engine.defineMission(), /objective is required/);

});


test("status() tracks real progress via the existing ProjectManager, and recommendNextActions() scopes to this mission's own project", async () => {

    const realPlanner = new ExecutivePlanner();

    const engine = makeMissionEngine(realPlanner, {
        milestones: [{
            title: "Milestone XQZMIS2",
            tasks: [{ title: "Task XQZMIS2", subtasks: [], deliverables: [] }]
        }]
    });

    const mission = await engine.defineMission("Mission status project XQZMIS2", { department: "ares" });

    const status = engine.status(mission.id);
    assert.strictEqual(status.project.id, mission.projectId);
    assert.strictEqual(typeof status.project.progress, "number");
    assert.ok(Array.isArray(status.project.milestones));
    assert.strictEqual(status.project.milestones[0].title, "Milestone XQZMIS2");

    // Reuses the EXISTING recommendation engine -- filtered to this
    // mission's own project id, not a separate mission-recommendation
    // system.
    const recommendations = engine.recommendNextActions(mission.id);
    assert.ok(recommendations.every(rec => rec.subject === mission.projectId));

    assert.throws(() => engine.requireMission("not-a-real-mission-id"), /Unknown mission/);

});


test("history() lists persisted missions, most-recent-first behavior delegated to the existing memory.filter()", async () => {

    const realPlanner = new ExecutivePlanner();
    const engine = makeMissionEngine(realPlanner, { milestones: [] });

    const mission = await engine.defineMission("History test mission XQZMIS3", { department: "ares" });

    const history = engine.history(50);
    assert.ok(history.some(m => m.id === mission.id));

});
