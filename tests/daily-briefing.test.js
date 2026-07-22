const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-briefing-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-briefing-${process.pid}.json`);

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
const GoalMonitor = require("../core/executive/goalMonitor");
const BlockerDetector = require("../core/executive/blockerDetection");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");
const DailyBriefingEngine = require("../core/executive/dailyBriefing");

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

function makeBriefingEngine(scoped){
    const projectManager = new ProjectManager({ planner: scoped });
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const goalMonitor = new GoalMonitor({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector });
    return new DailyBriefingEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine });
}


test("generate() assembles a roadmap summary, top priorities, goal issues, blockers, and recommendations", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Briefing project XQZBRIEF1", department: "ares", priority: 5 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    const result = briefing.generate();

    assert.ok(result.date);
    assert.strictEqual(result.roadmap.totalProjects, 1);
    assert.ok(result.topPriorities.some(entry => entry.project === project.id));
    assert.ok(Array.isArray(result.goalIssues.stalledProjects));
    assert.ok(Array.isArray(result.blockers.deadlockedProjects));
    assert.ok(Array.isArray(result.recommendations));

});


test("generate() and run()'s recommendations are computed identically", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({
        title: "Briefing recommendation consistency project XQZBRIEF2",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const briefing = makeBriefingEngine(scoped);

    const generated = briefing.generate();
    const record = briefing.run();

    const generatedForThisProject = generated.recommendations.filter(r => r.subject === project.id);
    const persistedForThisProject = record.recommendations.filter(r => r.subject === project.id);

    assert.deepStrictEqual(persistedForThisProject, generatedForThisProject);
    assert.ok(generatedForThisProject.length > 0);

});


test("run() persists a briefing record, also persists a matching recommendation run, and history() returns both", () => {

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Persisted briefing project XQZBRIEF3", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const goalMonitor = new GoalMonitor({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector });
    const briefing = new DailyBriefingEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine });

    const record = briefing.run();

    assert.ok(record.id);
    assert.strictEqual(record.roadmap.totalProjects, 1);

    const briefingHistory = briefing.history(50);
    assert.ok(briefingHistory.some(r => r.id === record.id));

    const recommendationHistory = recommendationEngine.history(50);
    assert.ok(recommendationHistory.length >= 1);

});
