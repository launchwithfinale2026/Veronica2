const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-execrec-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-execrec-${process.pid}.json`);

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
const PriorityRanking = require("../core/executive/priorityRanking");
const GoalMonitor = require("../core/executive/goalMonitor");
const BlockerDetector = require("../core/executive/blockerDetection");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");

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

function makeEngines(scoped){
    const projectManager = new ProjectManager({ planner: scoped });
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const goalMonitor = new GoalMonitor({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const engine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, goalMonitor, blockerDetector });
    return { projectManager, priorityRanking, goalMonitor, blockerDetector, engine };
}


test("generate() recommends resolving a deadlocked project, citing the specific holdup", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Deadlock recommendation project XQZREC1", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZREC1", tasks: [{ title: "Task XQZREC1", subtasks: [], deliverables: [] }] }]
    });

    const { projectManager, engine } = makeEngines(scoped);
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Execution failed: simulated XQZREC1");

    const recommendations = engine.generate();

    const deadlockRec = recommendations.find(r => r.kind === "resolve_deadlock" && r.subject === project.id);
    assert.ok(deadlockRec);
    assert.match(deadlockRec.reason, /simulated XQZREC1/);

});


test("generate() recommends revisiting a stalled goal, citing days of inactivity", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Stalled recommendation project XQZREC2", department: "ares" });

    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    const entry = data.memories.find(m => m.id === project.id);
    entry.updated = new Date(Date.now() - (GoalMonitor.STALE_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine } = makeEngines(scoped);

    const recommendations = engine.generate();

    const stalledRec = recommendations.find(r => r.kind === "revisit_stalled_goal" && r.subject === project.id);
    assert.ok(stalledRec);
    assert.match(stalledRec.reason, /No activity/);

});


test("generate() recommends prioritizing a high-urgency project", () => {

    const realPlanner = new ExecutivePlanner();

    // Max importance + overdue deadline -> priority 10, well above the
    // high-urgency threshold.
    const project = realPlanner.plan({
        title: "High urgency recommendation project XQZREC3",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine } = makeEngines(scoped);

    const recommendations = engine.generate();

    const urgencyRec = recommendations.find(r => r.kind === "high_urgency" && r.subject === project.id);
    assert.ok(urgencyRec);

});


test("generate() returns no recommendations for a healthy, low-priority, active project", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Healthy project XQZREC4", department: "ares", priority: 1 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine } = makeEngines(scoped);

    const recommendations = engine.generate();

    assert.ok(!recommendations.some(r => r.subject === project.id));

});


test("run() persists a recommendation record and history() returns it", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Persisted recommendation project XQZREC5", department: "ares", priority: 1 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine } = makeEngines(scoped);

    const record = engine.run();

    assert.ok(record.id);
    assert.ok(Array.isArray(record.recommendations));

    const history = engine.history(50);
    assert.ok(history.some(r => r.id === record.id));

});


test("generate() annotates a fresh recommendation with a null acceptanceRate and zero timesRecommendedBefore before any real history exists (Phase 47 Organizational Learning)", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Adaptive fresh recommendation project XQZREC6",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine } = makeEngines(scoped);

    const rec = engine.generate().find(r => r.subject === project.id);

    assert.ok(rec);
    assert.strictEqual(rec.acceptanceRate, null);
    assert.strictEqual(rec.timesRecommendedBefore, 0);

});


test("generate() reports a real acceptanceRate derived from an actual approved proposal's status (Phase 47 Organizational Learning)", () => {

    const ActionProposalEngine = require("../core/executive/actionProposal");

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Adaptive acceptance recommendation project XQZREC7",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const { engine, projectManager } = makeEngines(scoped);

    const rec = engine.generate().find(r => r.subject === project.id);
    assert.ok(rec);

    // A real proposal, from the real recommendation, genuinely approved
    // -- core/learning/adaptiveInsights.js's recommendationAcceptance()
    // reads exactly this kind of real, persisted status transition.
    const proposalEngine = new ActionProposalEngine({ planner: scoped, projectManager });
    const proposal = proposalEngine.fromRecommendation(rec);
    proposalEngine.approve(proposal.id, "Approved for test XQZREC7");

    const annotated = engine.generate().find(r => r.subject === project.id);

    assert.strictEqual(annotated.acceptanceRate, 100);

});


test("generate() resurfaces a genuinely recurring recommendation more prominently, with a real recurrence count (Phase 47 Organizational Learning)", () => {

    const realPlanner = new ExecutivePlanner();
    const recurringProject = realPlanner.plan({
        title: "Adaptive recurring recommendation project XQZREC8",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const oneTimeProject = realPlanner.plan({
        title: "Adaptive one-time recommendation project XQZREC8",
        department: "ares",
        priority: 4,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [recurringProject.id, oneTimeProject.id]);
    const { engine } = makeEngines(scoped);

    // Persist three real recommendation runs -- the recurring project's
    // condition never changes, so it's genuinely re-flagged every time,
    // building a real repetition count core/learning/adaptiveInsights.js's
    // repeatedRecommendations() actually reads.
    engine.run();
    engine.run();
    engine.run();

    const recommendations = engine.generate();

    const recurring = recommendations.find(r => r.subject === recurringProject.id);
    const oneTime = recommendations.find(r => r.subject === oneTimeProject.id);

    assert.ok(recurring);
    assert.ok(oneTime);
    assert.strictEqual(recurring.timesRecommendedBefore, 3);

    // Resurfaced more prominently -- sorted ahead of a less-recurring one.
    assert.ok(recommendations.indexOf(recurring) < recommendations.indexOf(oneTime));

});
