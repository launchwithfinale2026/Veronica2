const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/collaboration-engine.test.js
// -- relies on --test-concurrency=1 (see package.json). Uses themis/orion as
// its real departments (not athena/hades/hephaestus/apollo, which other test
// files already use for their own activity.log fixtures).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-orch-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-orch-${process.pid}.json`);

const DEPARTMENT_IDS = ["themis", "orion"];

const LOG_STATE = DEPARTMENT_IDS.map(id => {
    const logPath = path.join(__dirname, "..", "departments", id, "logs", "activity.log");
    return {
        id,
        path: logPath,
        existedBefore: fs.existsSync(logPath),
        backup: path.join(os.tmpdir(), `veronica-${id}-log-backup-orch-${process.pid}.log`)
    };
});

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-orch-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    for(const state of LOG_STATE){
        if(state.existedBefore){
            fs.copyFileSync(state.path, state.backup);
        }
    }
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    for(const state of LOG_STATE){
        if(state.existedBefore){
            fs.copyFileSync(state.backup, state.path);
            fs.unlinkSync(state.backup);
        } else if(fs.existsSync(state.path)){
            fs.unlinkSync(state.path);
        }
    }
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
});

const DepartmentManager = require("../core/departments/base");
const ExecutivePlanner = require("../core/executive/planner");
const GoalDecomposer = require("../core/executive/decomposer");
const ProjectManager = require("../core/executive/projectManager");
const ExecutiveOrchestrator = require("../core/executive/orchestrator");

function fakeAgent(name){
    return { name, role: "Test Role", capabilities: ["testing"] };
}

function makeDepartment(id, agentName){

    return new DepartmentManager({
        id,
        name: id.toUpperCase(),
        domain: "Test Domain",
        agents: [fakeAgent(agentName)]
    });

}

// Same pattern as tests/collaboration-engine.test.js / tests/departments.test.js
// -- swaps in a fake "claude" provider so department.run() never makes a
// real, paid API call.
function mockDepartmentBrain(department, responseText){

    department.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    department.intelligence.brain.provider.active = "claude";

}

function mockDepartmentFailure(department, errorMessage){

    department.intelligence.brain.provider.providers = {
        claude: { generate: async () => { throw new Error(errorMessage); } }
    };

    department.intelligence.brain.provider.active = "claude";

}

// Same pattern as tests/executive-decomposer.test.js -- mocks the LLM call
// GoalDecomposer.decompose() makes to turn a project into milestones/tasks.
function mockDecomposerBrain(decomposer, responseText){

    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    decomposer.intelligence.brain.provider.active = "claude";

}

// A thin planner double that delegates everything to the real
// ExecutivePlanner (so plan()/decompose() persist real memory entries and
// department assignment/priority scoring works exactly like production)
// except roadmap()/evaluateDeadlines(), which are scoped to just this
// test's own project ids. Without this, nextReadyTask()/report() -- which
// deliberately scan the WHOLE live roadmap, by design -- could pick up
// real pre-existing projects/tasks from actual VERONICA usage and make
// test outcomes depend on data outside this test's control.
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

// Explicit actor for every executeTask()/runNextReadyTask() call below
// that isn't specifically testing authorization -- deliberately not
// relying on resolveActor()'s default (which falls back to this
// machine's real, ambient device.local.json role), so these tests stay
// deterministic regardless of what device role happens to be configured
// wherever they run.
const TEST_ACTOR = { role: "executive", deviceRole: "laptop" };

function makeHarness(){

    const themis = makeDepartment("themis", "DIKE");
    const orion = makeDepartment("orion", "ASTRAEUS");

    const realPlanner = new ExecutivePlanner();

    return { themis, orion, realPlanner };

}

async function planAndDecompose(realPlanner, decomposerBrainResponse, goalOverrides = {}){

    const project = realPlanner.plan({
        title: "Orchestrator target project XQZORCH1",
        department: "themis",
        priority: 5,
        ...goalOverrides
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);

    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, JSON.stringify(decomposerBrainResponse));

    const projectManager = new ProjectManager({ planner: scoped });

    const decomposition = await decomposer.decompose(project.id);

    return { project, decomposition, scoped, decomposer, projectManager };

}


test("ExecutiveOrchestrator requires real departments", () => {

    assert.throws(() => new ExecutiveOrchestrator({}), /requires real departments/);
    assert.throws(() => new ExecutiveOrchestrator({ departments: [] }), /requires real departments/);

});


test("pursue() plans and decomposes a goal in one call", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    // pursue() constructs its own internal planner/decomposer/projectManager
    // by default -- exercised here against the real, live roadmap, scoped
    // down afterward by only inspecting this test's own project by id.
    const orchestrator = new ExecutiveOrchestrator({ departments: [themis, orion], planner: realPlanner });

    mockDecomposerBrain(orchestrator.decomposer, JSON.stringify({
        milestones: [
            {
                title: "Milestone XQZORCH2",
                tasks: [
                    { title: "Task XQZORCH2", subtasks: [], deliverables: [] }
                ]
            }
        ]
    }));

    const { project, decomposition } = await orchestrator.pursue({
        title: "Pursued objective XQZORCH2",
        department: "orion",
        priority: 4
    });

    assert.strictEqual(project.title, "Pursued objective XQZORCH2");
    assert.strictEqual(project.department, "orion");
    assert.strictEqual(decomposition.milestones.length, 1);
    assert.strictEqual(decomposition.milestones[0].tasks.length, 1);

});


test("executeTask() dispatches to the assigned department, completes the task, and cascades milestone/project completion", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    const { project, decomposition, scoped, projectManager } = await planAndDecompose(realPlanner, {
        milestones: [
            {
                title: "Milestone XQZORCH3",
                tasks: [
                    { title: "Task XQZORCH3", subtasks: [], deliverables: [] }
                ]
            }
        ]
    });

    const orchestrator = new ExecutiveOrchestrator({
        departments: [themis, orion],
        planner: scoped,
        projectManager
    });

    mockDepartmentBrain(themis, "Task XQZORCH3 completed by DIKE");

    const [task] = projectManager.tasksForProject(project.id);
    assert.strictEqual(task.metadata.status, "planned");

    const outcome = await orchestrator.executeTask(task, TEST_ACTOR);

    assert.strictEqual(outcome.outcome, "success");
    assert.strictEqual(outcome.department, "themis");
    assert.strictEqual(outcome.agent, "DIKE");
    assert.strictEqual(outcome.response, "Task XQZORCH3 completed by DIKE");

    const updatedTask = projectManager.requireEntry(task.id);
    assert.strictEqual(updatedTask.metadata.status, "completed");
    assert.ok(updatedTask.metadata.artifacts.includes("Task XQZORCH3 completed by DIKE"));

    // This task was its milestone's only task, and its milestone was the
    // project's only milestone -- both should have cascaded to completed.
    const milestone = decomposition.milestones[0];
    const updatedMilestone = projectManager.requireEntry(milestone.id);
    assert.strictEqual(updatedMilestone.metadata.status, "completed");

    const updatedProject = projectManager.getProject(project.id);
    assert.strictEqual(updatedProject.status, "completed");
    assert.strictEqual(updatedProject.progress, 100);

});


// Phase 10 security audit: a company-scoped task must carry the company
// tag/metadata all the way down to milestone/task (see decomposer.js),
// and executeTask() must forward it to department.run() as
// { companyId } so the reasoning context is actually scoped (see
// core/context/engine.js's searchMemories()). Without this wiring, the
// enforced isolation core/executive/companyContext.js provides for
// direct reads/writes wouldn't extend to what an agent's context
// injection can see mid-task.
test("executeTask() propagates a company-scoped task's company id to department.run()", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    const CompanyManager = require("../core/executive/companyManager");
    const companyManager = new CompanyManager({ planner: realPlanner });
    const company = companyManager.createCompany({ name: "Audit Co XQZORCH7" });

    const { project, projectManager } = await planAndDecompose(realPlanner, {
        milestones: [
            {
                title: "Milestone XQZORCH7",
                tasks: [
                    { title: "Task XQZORCH7", subtasks: [], deliverables: [] }
                ]
            }
        ]
    }, { company: company.id });

    const [task] = projectManager.tasksForProject(project.id);

    assert.ok(task.tags.includes(`company:${company.id}`));
    assert.strictEqual(task.metadata.company, company.id);

    // executeTask() only touches departments/projectManager/companyManager,
    // not planner -- omitted here (the constructor doesn't require it
    // for this call).
    const orchestrator = new ExecutiveOrchestrator({ departments: [themis, orion], projectManager, companyManager });

    mockDepartmentBrain(themis, "Task XQZORCH7 completed by DIKE");

    let capturedOptions;
    const originalRun = themis.run.bind(themis);
    themis.run = async (taskText, context, options) => {
        capturedOptions = options;
        return originalRun(taskText, context, options);
    };

    await orchestrator.executeTask(task, { role: "executive", deviceRole: "laptop" });

    assert.deepStrictEqual(capturedOptions, { companyId: company.id });

});


test("executeTask() marks the task blocked and returns a failure outcome when the department throws", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    const { project, decomposition, scoped, projectManager } = await planAndDecompose(realPlanner, {
        milestones: [
            {
                title: "Milestone XQZORCH4",
                tasks: [
                    { title: "Task XQZORCH4", subtasks: [], deliverables: [] }
                ]
            }
        ]
    });

    const orchestrator = new ExecutiveOrchestrator({
        departments: [themis, orion],
        planner: scoped,
        projectManager
    });

    mockDepartmentFailure(themis, "simulated department failure XQZORCH4");

    const [task] = projectManager.tasksForProject(project.id);

    const outcome = await orchestrator.executeTask(task, TEST_ACTOR);

    assert.strictEqual(outcome.outcome, "failure");
    assert.match(outcome.error, /simulated department failure XQZORCH4/);

    const updatedTask = projectManager.requireEntry(task.id);
    assert.strictEqual(updatedTask.metadata.status, "blocked");

    // Failure must not cascade -- the milestone stays exactly as
    // decomposition left it.
    const milestone = decomposition.milestones[0];
    const updatedMilestone = projectManager.requireEntry(milestone.id);
    assert.strictEqual(updatedMilestone.metadata.status, "planned");

});


test("isReady() gates a task on its unresolved dependencies", () => {

    const { themis, orion } = makeHarness();
    const orchestrator = new ExecutiveOrchestrator({ departments: [themis, orion] });

    const done = { id: "dep-1", metadata: { status: "completed" } };
    const pending = { id: "dep-2", metadata: { status: "planned" } };

    const byId = new Map([[done.id, done], [pending.id, pending]]);

    const readyTask = { metadata: { status: "planned" }, relationships: [done.id] };
    assert.strictEqual(orchestrator.isReady(readyTask, byId), true);

    const blockedTask = { metadata: { status: "planned" }, relationships: [pending.id] };
    assert.strictEqual(orchestrator.isReady(blockedTask, byId), false);

    // A dependency id that isn't in this project's own task graph (e.g. a
    // cross-project reference) is treated as already satisfied.
    const externalDepTask = { metadata: { status: "planned" }, relationships: ["not-in-this-project"] };
    assert.strictEqual(orchestrator.isReady(externalDepTask, byId), true);

    const alreadyStartedTask = { metadata: { status: "in_progress" }, relationships: [] };
    assert.strictEqual(orchestrator.isReady(alreadyStartedTask, byId), false);

});


test("nextReadyTask()/runNextReadyTask() respect dependency order and execute exactly one task per call", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    const { project, scoped, projectManager } = await planAndDecompose(realPlanner, {
        milestones: [
            {
                title: "Milestone XQZORCH5",
                tasks: [
                    { title: "Task A XQZORCH5", subtasks: [], deliverables: [] },
                    { title: "Task B XQZORCH5", dependsOnTitles: ["Task A XQZORCH5"], subtasks: [], deliverables: [] }
                ]
            }
        ]
    });

    const orchestrator = new ExecutiveOrchestrator({
        departments: [themis, orion],
        planner: scoped,
        projectManager
    });

    mockDepartmentBrain(themis, "done XQZORCH5");

    // Task B depends on Task A -- only Task A should be ready first.
    const first = orchestrator.nextReadyTask();
    assert.ok(first);
    assert.strictEqual(first.task.content, "Task A XQZORCH5");
    assert.strictEqual(first.project.id, project.id);

    const firstRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(firstRun.ranTask, true);
    assert.strictEqual(firstRun.outcome, "success");

    const second = orchestrator.nextReadyTask();
    assert.ok(second);
    assert.strictEqual(second.task.content, "Task B XQZORCH5");

    const secondRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(secondRun.ranTask, true);

    // Both tasks (this project's only milestone/tasks) are now completed,
    // so nothing is left ready within this test's scoped roadmap.
    const thirdRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(thirdRun.ranTask, false);

});


test("report() returns a consistent aggregate shape", async () => {

    const { themis, orion, realPlanner } = makeHarness();

    const { scoped } = await planAndDecompose(realPlanner, {
        milestones: [
            { title: "Milestone XQZORCH6", tasks: [{ title: "Task XQZORCH6", subtasks: [], deliverables: [] }] }
        ]
    });

    const orchestrator = new ExecutiveOrchestrator({ departments: [themis, orion], planner: scoped });

    const report = orchestrator.report();

    assert.strictEqual(report.totalProjects, 1);

    const statusSum = Object.values(report.byStatus).reduce((sum, n) => sum + n, 0);
    assert.strictEqual(statusSum, report.totalProjects);

    assert.ok(report.averageProgress >= 0 && report.averageProgress <= 100);

    assert.deepStrictEqual(
        Object.keys(report.deadlines).sort(),
        ["due_soon", "no_deadline", "on_track", "overdue"]
    );

});
