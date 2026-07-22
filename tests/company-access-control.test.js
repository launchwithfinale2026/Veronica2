const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ==================================
// VERONICA — COMPANY ACCESS CONTROL (Phase 10 follow-up)
// ==================================
//
// Regression tests for the fix to docs/PRODUCTION_READINESS.md's
// documented gap: "CompanyContext's allowedRoles restriction is not
// enforced by the main executive pipeline." ExecutiveOrchestrator now
// authorizes every task execution against four things --
// companyId, identity (role + device), role permissions, and the
// requested action -- before it ever reaches department.run(). See
// core/executive/orchestrator.js's authorizeExecution().
//
// Uses "artemis" as its one real department (not athena/hades/
// hephaestus/apollo/themis/orion/hermes/ares, already used by other test
// files' activity.log fixtures).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-cac-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-cac-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "departments", "artemis", "logs", "activity.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-artemis-log-backup-cac-${process.pid}.log`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-cac-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
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
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
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
// Unit-level: authorizeExecution() itself
// ==================================

test("authorizeExecution() rejects an unrecognized action", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis] });

    assert.throws(
        () => orchestrator.authorizeExecution({ role: "executive", deviceRole: "laptop", action: "delete_everything" }),
        /Unknown action/
    );

});


test("authorizeExecution() rejects a role without execute_tools permission", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis] });

    // No real identity role is permission-less by design, so this
    // exercises the "unknown role" path -- identity.hasPermission()
    // returns false for a role that isn't in identity/roles.json at all,
    // exactly like a role that's real but lacks the permission would.
    assert.throws(
        () => orchestrator.authorizeExecution({ role: "not-a-real-role", deviceRole: "laptop", action: "execute_task" }),
        /Role "not-a-real-role" does not have "execute_tools" permission/
    );

});


test("authorizeExecution() rejects a device role without execute_tools permission", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis] });

    // "phone" is the one real device role without execute_tools (see
    // registry/devices.json) -- read-only by design.
    assert.throws(
        () => orchestrator.authorizeExecution({ role: "executive", deviceRole: "phone", action: "execute_task" }),
        /Device role "phone" does not have "execute_tools" permission/
    );

});


test("authorizeExecution() rejects an unknown companyId", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis] });

    assert.throws(
        () => orchestrator.authorizeExecution({
            companyId: "not-a-real-company",
            role: "executive",
            deviceRole: "laptop",
            action: "execute_task"
        }),
        /Unknown company/
    );

});


test("authorizeExecution() allows a task with no company scope at all, given valid role/device/action", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis] });

    assert.strictEqual(
        orchestrator.authorizeExecution({ role: "executive", deviceRole: "laptop", action: "execute_task" }),
        true
    );

});


test("authorizeExecution() enforces a restricted company's allowedRoles", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner: realPlanner });
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis], planner: realPlanner, companyManager });

    const company = companyManager.createCompany({
        name: "Access Control Co XQZCAC1",
        allowedRoles: ["executive"]
    });

    assert.strictEqual(
        orchestrator.authorizeExecution({ companyId: company.id, role: "executive", deviceRole: "laptop", action: "execute_task" }),
        true
    );

    assert.throws(
        () => orchestrator.authorizeExecution({ companyId: company.id, role: "agent", deviceRole: "laptop", action: "execute_task" }),
        /does not have access to company/
    );

});


test("authorizeExecution() allows any role for an unrestricted company (no allowedRoles set)", () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner: realPlanner });
    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis], planner: realPlanner, companyManager });

    const company = companyManager.createCompany({ name: "Unrestricted Access Co XQZCAC2" });

    assert.strictEqual(
        orchestrator.authorizeExecution({ companyId: company.id, role: "agent", deviceRole: "laptop", action: "execute_task" }),
        true
    );

});


// ==================================
// Integration-level: executeTask()/runNextReadyTask() denial
// ==================================

test("executeTask() denies a company-restricted task for a disallowed role WITHOUT ever calling department.run()", async () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner: realPlanner });

    const company = companyManager.createCompany({
        name: "Denial Co XQZCAC3",
        allowedRoles: ["executive"]
    });

    const project = realPlanner.plan({
        title: "Denial project XQZCAC3",
        department: "artemis",
        company: company.id
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Denial milestone XQZCAC3", tasks: [{ title: "Denial task XQZCAC3", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);

    const orchestrator = new ExecutiveOrchestrator({
        departments: [artemis],
        planner: scoped,
        projectManager,
        companyManager
    });

    mockDepartmentBrain(artemis, "should never be seen XQZCAC3");

    let departmentRunCalled = false;
    const originalRun = artemis.run.bind(artemis);
    artemis.run = async (...args) => {
        departmentRunCalled = true;
        return originalRun(...args);
    };

    const outcome = await orchestrator.executeTask(task, { role: "agent", deviceRole: "laptop" });

    assert.strictEqual(outcome.outcome, "denied");
    assert.match(outcome.error, /does not have access to company/);
    assert.strictEqual(departmentRunCalled, false);

    const updatedTask = projectManager.requireEntry(task.id);
    assert.strictEqual(updatedTask.metadata.status, "blocked");
    assert.match(updatedTask.metadata.history.at(-1).note, /Access denied/);

    // The same task, run again with a permitted role, succeeds -- a
    // denial isn't a permanent dead end, it just requires the right
    // actor.
    const retryOutcome = await orchestrator.executeTask(task, { role: "executive", deviceRole: "laptop" });
    assert.strictEqual(retryOutcome.outcome, "success");
    assert.strictEqual(departmentRunCalled, true);

});


test("executeTask() denies a task when the acting device role lacks execute_tools, without calling department.run()", async () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const realPlanner = new ExecutivePlanner();

    const project = realPlanner.plan({ title: "Device denial project XQZCAC4", department: "artemis" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Device denial milestone XQZCAC4", tasks: [{ title: "Device denial task XQZCAC4", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);

    const orchestrator = new ExecutiveOrchestrator({ departments: [artemis], planner: scoped, projectManager });

    mockDepartmentBrain(artemis, "should never be seen XQZCAC4");

    let departmentRunCalled = false;
    const originalRun = artemis.run.bind(artemis);
    artemis.run = async (...args) => {
        departmentRunCalled = true;
        return originalRun(...args);
    };

    // No company scope at all here -- this denial is purely about the
    // device identity/role check, independent of company isolation.
    const outcome = await orchestrator.executeTask(task, { role: "executive", deviceRole: "phone" });

    assert.strictEqual(outcome.outcome, "denied");
    assert.match(outcome.error, /Device role "phone"/);
    assert.strictEqual(departmentRunCalled, false);

});


test("runNextReadyTask() surfaces a denial as ranTask: true, outcome: \"denied\" rather than throwing", async () => {

    const artemis = makeDepartment("artemis", "SELENE");
    const realPlanner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner: realPlanner });

    const company = companyManager.createCompany({
        name: "RunNext Denial Co XQZCAC5",
        allowedRoles: ["executive"]
    });

    const project = realPlanner.plan({
        title: "RunNext denial project XQZCAC5",
        department: "artemis",
        company: company.id
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "RunNext denial milestone XQZCAC5", tasks: [{ title: "RunNext denial task XQZCAC5", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const orchestrator = new ExecutiveOrchestrator({
        departments: [artemis],
        planner: scoped,
        projectManager,
        companyManager
    });

    const result = await orchestrator.runNextReadyTask({ role: "agent", deviceRole: "laptop" });

    assert.strictEqual(result.ranTask, true);
    assert.strictEqual(result.outcome, "denied");

});
