const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ==================================
// VERONICA — END-TO-END OPERATOR WORKFLOWS (Phase 10)
// ==================================
//
// Operational validation, not new features: each test below simulates a
// realistic session an actual operator would run, exercising real
// classes wired together the same way dashboard/backend/server.js and
// core/interface/terminal.js do -- not orchestrator internals in
// isolation (see tests/executive-orchestrator.test.js for that level).
// Only the LLM call itself is mocked (same convention as every other
// test file touching DepartmentManager.run()); everything else --
// memory, knowledge, the company layer, collaboration, automation's
// queue/logging -- is the real thing.
//
// Uses hermes/ares as its real departments (not athena/hades/
// hephaestus/apollo/themis/orion, already used by other test files'
// activity.log fixtures).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-e2e-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-e2e-${process.pid}.json`);

const DEPARTMENT_IDS = ["hermes", "ares"];

const LOG_STATE = DEPARTMENT_IDS.map(id => {
    const logPath = path.join(__dirname, "..", "departments", id, "logs", "activity.log");
    return {
        id,
        path: logPath,
        existedBefore: fs.existsSync(logPath),
        backup: path.join(os.tmpdir(), `veronica-${id}-log-backup-e2e-${process.pid}.log`)
    };
});

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-e2e-${process.pid}.log`);

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
const CompanyManager = require("../core/executive/companyManager");
const ExecutiveOrchestrator = require("../core/executive/orchestrator");
const CollaborationEngine = require("../core/collaboration/engine");
const AutomationEngine = require("../core/automation/engine");
const ContextEngine = require("../core/context/engine");
const memory = require("../core/memory");
const knowledge = require("../core/knowledge");
const learning = require("../core/learning");


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

function mockDepartmentBrain(department, responseText){
    department.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };
    department.intelligence.brain.provider.active = "claude";
}

function mockDecomposerBrain(decomposer, responseObj){
    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    decomposer.intelligence.brain.provider.active = "claude";
}

// Explicit actor for every runNextReadyTask() call below -- deliberately
// not relying on resolveActor()'s default (this machine's real, ambient
// device.local.json role), so these workflows stay deterministic
// regardless of what device role happens to be configured wherever they
// run.
const TEST_ACTOR = { role: "executive", deviceRole: "laptop" };

// Same test-isolation technique as tests/executive-orchestrator.test.js:
// a thin planner double scoping roadmap()/evaluateDeadlines() to just
// this scenario's own project ids, so nextReadyTask()/report() (which
// deliberately scan the WHOLE live roadmap, by design) can't be affected
// by real pre-existing VERONICA usage data outside this test's control.
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


// ==================================
// Workflow 1: Personal Goal Pipeline
// goal -> planning -> department -> execution -> memory
// ==================================

test("Workflow 1: an operator's goal moves from planning through decomposed, dependent execution to a completed, memory-backed project", async () => {

    const hermes = makeDepartment("hermes", "IRIS");

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({
        title: "Operator goal: launch the Q3 newsletter XQZE2E1",
        description: "A real multi-step goal an operator would actually plan",
        department: "hermes",
        priority: 5,
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    });

    assert.strictEqual(project.department, "hermes");
    assert.strictEqual(project.deadlineStatus, "due_soon");

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    const projectManager = new ProjectManager({ planner: scoped });

    mockDecomposerBrain(decomposer, {
        milestones: [{
            title: "Draft and ship the newsletter XQZE2E1",
            tasks: [
                { title: "Draft newsletter copy XQZE2E1", subtasks: [], deliverables: ["draft.md"] },
                { title: "Send newsletter XQZE2E1", dependsOnTitles: ["Draft newsletter copy XQZE2E1"], subtasks: [], deliverables: [] }
            ]
        }]
    });

    const decomposition = await decomposer.decompose(project.id);
    assert.strictEqual(decomposition.milestones[0].tasks.length, 2);

    const orchestrator = new ExecutiveOrchestrator({ departments: [hermes], planner: scoped, projectManager });

    mockDepartmentBrain(hermes, "Draft complete: newsletter copy attached XQZE2E1");

    // Only the first task should be ready -- the second depends on it.
    const beforeAnySend = orchestrator.nextReadyTask();
    assert.strictEqual(beforeAnySend.task.content, "Draft newsletter copy XQZE2E1");

    const firstRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(firstRun.outcome, "success");

    // Second task is now unblocked -- re-mock the brain for its own response.
    mockDepartmentBrain(hermes, "Newsletter sent to the full list XQZE2E1");
    const secondRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(secondRun.outcome, "success");

    // Pipeline's end state: nothing left ready, project cascaded to
    // completed, 100% progress, both responses persisted as artifacts,
    // both real memory entries updated to "completed".
    const thirdRun = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(thirdRun.ranTask, false);

    const finalProject = projectManager.getProject(project.id);
    assert.strictEqual(finalProject.status, "completed");
    assert.strictEqual(finalProject.progress, 100);

    const tasks = projectManager.tasksForProject(project.id);
    assert.ok(tasks.every(t => t.metadata.status === "completed"));
    assert.ok(tasks.some(t => t.metadata.artifacts.includes("Draft complete: newsletter copy attached XQZE2E1")));
    assert.ok(tasks.some(t => t.metadata.artifacts.includes("Newsletter sent to the full list XQZE2E1")));

    // The report() an operator would check reflects this project as done.
    const report = orchestrator.report();
    assert.strictEqual(report.byStatus.completed >= 1, true);

    // Both department runs were logged for learning/performance tracking.
    const hermesPerformance = learning.departmentPerformance().find(d => d.department === "hermes");
    assert.ok(hermesPerformance);
    assert.ok(hermesPerformance.total >= 2);

});


// ==================================
// Workflow 2: Sandbox Company Simulation
// ==================================

test("Workflow 2: a full company lifecycle -- staffed, projected, executed, and financially tracked end to end", async () => {

    const hermes = makeDepartment("hermes", "IRIS");

    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner: realPlanner });

    const company = companyManager.createCompany({
        name: "Sandbox Ventures XQZE2E2",
        industry: "consulting",
        departments: ["hermes"]
    });

    companyManager.addEmployee(company.id, { name: "Operator Employee XQZE2E2", role: "Founder" });
    companyManager.addDocument(company.id, "https://example.test/xqze2e2-charter.pdf");
    companyManager.addRelationship(company.id, { to: "Acme Client XQZE2E2", type: "clientOf" });
    companyManager.logCommunication(company.id, { summary: "Kickoff call with Acme XQZE2E2", channel: "call" });
    companyManager.recordFinance(company.id, { label: "Initial invoice XQZE2E2", amount: 5000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Tooling XQZE2E2", amount: 200, type: "expense" });

    const project = realPlanner.plan({
        title: "Sandbox Ventures onboarding project XQZE2E2",
        department: "hermes",
        company: company.id,
        priority: 4
    });

    assert.strictEqual(project.company, company.id);

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    const projectManager = new ProjectManager({ planner: scoped });

    mockDecomposerBrain(decomposer, {
        milestones: [{
            title: "Onboard Acme XQZE2E2",
            tasks: [{ title: "Set up Acme workspace XQZE2E2", subtasks: [], deliverables: [] }]
        }]
    });

    await decomposer.decompose(project.id);

    // The milestone/task created for a company-scoped project must
    // themselves carry the company tag/metadata (Phase 10 security audit
    // fix) -- otherwise they'd be invisible to the company's own
    // CompanyContext.
    const [task] = projectManager.tasksForProject(project.id);
    assert.strictEqual(task.metadata.company, company.id);

    const orchestrator = new ExecutiveOrchestrator({ departments: [hermes], planner: scoped, projectManager });

    mockDepartmentBrain(hermes, "Acme workspace provisioned XQZE2E2");
    const run = await orchestrator.runNextReadyTask(TEST_ACTOR);
    assert.strictEqual(run.outcome, "success");

    // The operator's real company-detail view -- what GET /api/companies/:id
    // actually returns -- aggregates all of the above correctly.
    const detail = companyManager.getCompany(company.id);

    assert.strictEqual(detail.employees.length, 1);
    assert.strictEqual(detail.documents.length, 1);
    assert.strictEqual(detail.communications.length, 1);
    assert.strictEqual(detail.financialSummary.revenue, 5000);
    assert.strictEqual(detail.financialSummary.expense, 200);
    assert.strictEqual(detail.financialSummary.net, 4800);
    assert.ok(detail.projects.some(p => p.id === project.id));
    assert.ok(detail.knowledge.entities.some(e => e.name === "Sandbox Ventures XQZE2E2"));

    // Isolation check: a second, unrelated company with overlapping
    // content never sees this one's data through its own CompanyContext
    // (core/executive/companyContext.js), and vice versa.
    const otherCompany = companyManager.createCompany({ name: "Rival Co XQZE2E2B" });
    companyManager.context(otherCompany.id).remember({ content: "Rival internal note XQZE2E2B" });

    const sandboxContext = companyManager.context(company.id);
    const sandboxSearch = sandboxContext.search("XQZE2E2");

    assert.ok(sandboxSearch.some(e => e.content.includes("Kickoff call")));
    assert.ok(!sandboxSearch.some(e => e.content.includes("Rival internal note")));

    // And the reasoning-context leak fix (previous commit) holds up
    // against this scenario's real data, not just synthetic test tags:
    // an agent working a task for the sandbox company shouldn't see the
    // rival's notes in its injected context either.
    const contextEngine = new ContextEngine();
    const scopedMemories = await contextEngine.searchMemories("XQZE2E2", company.id);
    assert.ok(!scopedMemories.some(m => m.content.includes("Rival internal note")));

});


// ==================================
// Workflow 3: Multi-Department Collaboration
// ==================================

test("Workflow 3: one department delegates work to another and the exchange is discoverable via history and the knowledge graph", async () => {

    const hermes = makeDepartment("hermes", "IRIS");
    const ares = makeDepartment("ares", "NIKE");

    const collaboration = new CollaborationEngine([hermes, ares]);

    mockDepartmentBrain(ares, "Execution plan drafted XQZE2E3");

    const delegation = await collaboration.delegate("hermes", "ares", "Draft an execution plan XQZE2E3");

    assert.strictEqual(delegation.from, "hermes");
    assert.strictEqual(delegation.to, "ares");
    assert.strictEqual(delegation.response, "Execution plan drafted XQZE2E3");

    const history = collaboration.history();
    assert.ok(history.some(entry => entry.content.includes("XQZE2E3")));

    const connections = knowledge.connections("IRIS");
    assert.ok(connections.some(rel => rel.type === "delegatesTo" && rel.to === "NIKE"));

});


// ==================================
// Workflow 4: Autonomous Execution via the Automation Engine
// ==================================

test("Workflow 4: the real automation engine drives task execution through registerJob()/runNow(), one bounded task at a time", async () => {

    const hermes = makeDepartment("hermes", "IRIS");

    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({
        title: "Autonomous loop target XQZE2E4",
        department: "hermes",
        priority: 5
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    const projectManager = new ProjectManager({ planner: scoped });

    mockDecomposerBrain(decomposer, {
        milestones: [{
            title: "Autonomous milestone XQZE2E4",
            tasks: [{ title: "Autonomous task XQZE2E4", subtasks: [], deliverables: [] }]
        }]
    });

    await decomposer.decompose(project.id);

    const orchestrator = new ExecutiveOrchestrator({ departments: [hermes], planner: scoped, projectManager });

    mockDepartmentBrain(hermes, "Autonomous execution result XQZE2E4");

    // Same AutomationEngine class the real system uses (not a mock),
    // wired to THIS scenario's scoped orchestrator instead of the
    // process-wide one, so this stays deterministic regardless of any
    // real pending work in the live system.
    const engine = new AutomationEngine();
    engine.registerJob("execute-tasks", () => orchestrator.runNextReadyTask(TEST_ACTOR));

    const firstTick = await engine.runNow("execute-tasks");
    assert.strictEqual(firstTick.ranTask, true);
    assert.strictEqual(firstTick.outcome, "success");

    const secondTick = await engine.runNow("execute-tasks");
    assert.strictEqual(secondTick.ranTask, false);

    const finalProject = projectManager.getProject(project.id);
    assert.strictEqual(finalProject.status, "completed");

});
