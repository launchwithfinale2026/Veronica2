const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-review-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-review-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-review-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
});

const learningLog = require("../core/learning/log");
const ExecutivePlanner = require("../core/executive/planner");
const GoalDecomposer = require("../core/executive/decomposer");
const ProjectManager = require("../core/executive/projectManager");
const PriorityRanking = require("../core/executive/priorityRanking");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");
const DailyReviewEngine = require("../core/executive/dailyReview");
const DailyCycleEngine = require("../core/executive/dailyCycle");

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


test("completedToday() finds a project completed today (scoped, exact)", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Review completed today project XQZREV1", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });

    projectManager.updateStatus(project.id, "completed", "done XQZREV1");

    const review = new DailyReviewEngine({ planner: scoped, projectManager });
    const completed = review.completedToday();

    assert.ok(completed.some(c => c.id === project.id));

});


test("failedToday() reflects a real execution failure logged today (presence, since learning log is global)", () => {

    learningLog.record({ kind: "tool_call", tool: "test.tool.xqzrev2", outcome: "failure", durationMs: 5, error: "simulated XQZREV2" });

    const review = new DailyReviewEngine({ planner: new ExecutivePlanner() });
    const failed = review.failedToday();

    assert.ok(failed.some(f => f.subject === "test.tool.xqzrev2" && f.error === "simulated XQZREV2"));

});


test("learnedToday() surfaces today's recommendation details", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Review learned project XQZREV3",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const priorityRanking = new PriorityRanking({ planner: scoped });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, priorityRanking });

    recommendationEngine.run();

    const review = new DailyReviewEngine({ planner: scoped, priorityRanking, recommendationEngine });
    const learned = review.learnedToday();

    assert.ok(learned.some(text => text.includes("Review learned project XQZREV3")));

});


test("newMemoriesToday() counts at least the entries created in this test run (delta, since memory is global)", () => {

    const store = require("../core/memory/store");

    const review = new DailyReviewEngine({ planner: new ExecutivePlanner() });
    const before = review.newMemoriesToday();

    store.remember({ content: "New memory today marker XQZREV4" });

    const after = review.newMemoriesToday();

    assert.strictEqual(after, before + 1);

});


test("tomorrowPriorities() reuses the live priority ranking", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Review tomorrow priority project XQZREV5", department: "ares", priority: 5 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const priorityRanking = new PriorityRanking({ planner: scoped });

    const review = new DailyReviewEngine({ planner: scoped, priorityRanking });
    const priorities = review.tomorrowPriorities();

    assert.ok(priorities.some(p => p.project === project.id));

});


test("run() persists a review tagged daily-review and organizational, and history() returns it", () => {

    const review = new DailyReviewEngine({ planner: new ExecutivePlanner() });
    const record = review.run();

    assert.ok(record.id);
    assert.ok(Array.isArray(record.completed));
    assert.ok(Array.isArray(record.failed));
    assert.ok(Array.isArray(record.learned));
    assert.ok(Number.isFinite(record.newMemoriesCount));
    assert.ok(Array.isArray(record.tomorrowPriorities));

    const history = review.history(50);
    assert.ok(history.some(r => r.id === record.id));

    const memory = require("../core/memory");
    const stored = memory.view().find(e => e.id === record.id);
    assert.ok(stored.tags.includes("daily-review"));
    assert.ok(stored.tags.includes("organizational"));
    assert.strictEqual(stored.type, "personal");

});


test("DailyCycleEngine.runMorning()/runEvening() delegate to the briefing/review engines", async () => {

    const DailyBriefingEngine = require("../core/executive/dailyBriefing");

    const briefingEngine = new DailyBriefingEngine({ planner: new ExecutivePlanner() });
    const reviewEngine = new DailyReviewEngine({ planner: new ExecutivePlanner() });

    const cycle = new DailyCycleEngine({ briefingEngine, reviewEngine });

    const morning = await cycle.runMorning();
    const evening = cycle.runEvening();

    assert.ok(morning.id);
    assert.ok(evening.id);

    assert.ok(cycle.morningHistory(50).some(r => r.id === morning.id));
    assert.ok(cycle.eveningHistory(50).some(r => r.id === evening.id));

});
