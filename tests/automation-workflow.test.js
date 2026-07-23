const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-workflow-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-workflow-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-workflow-${process.pid}.log`);

const STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-workflow-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
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
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
});

const bus = require("../core/bus");
const AutomationEngine = require("../core/automation/engine");
const workflow = require("../core/automation/workflow");


test("defineWorkflow() rejects a workflow with no steps, duplicate step ids, or a step missing run()", () => {

    assert.throws(() => workflow.defineWorkflow("bad-xqzwf1", []));
    assert.throws(() => workflow.defineWorkflow("bad-xqzwf2", [{ id: "a" }]));
    assert.throws(() => workflow.defineWorkflow("bad-xqzwf3", [
        { id: "a", run: async () => {} },
        { id: "a", run: async () => {} }
    ]));

});


test("runWorkflow() runs a real linear sequence of steps in order and persists a REPORT", async () => {

    const order = [];

    workflow.defineWorkflow("linear-xqzwf4", [
        { id: "step1", run: async () => { order.push("step1"); return "one"; }, onSuccess: "step2" },
        { id: "step2", run: async () => { order.push("step2"); return "two"; } }
    ]);

    const result = await workflow.runWorkflow("linear-xqzwf4", {});

    assert.deepStrictEqual(order, ["step1", "step2"]);
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps.length, 2);
    assert.strictEqual(result.steps[0].output, "one");

    const history = workflow.workflowHistory("linear-xqzwf4");
    assert.strictEqual(history[0].id, result.id);
    assert.strictEqual(history[0].status, "completed");

});


test("runWorkflow() follows a real branching edge based on a step's own outcome (onFailure), not linear fallthrough", async () => {

    const visited = [];

    workflow.defineWorkflow("branch-xqzwf5", [
        {
            id: "risky",
            run: async () => { throw new Error("simulated failure XQZWF5"); },
            onFailure: "recovery"
        },
        { id: "recovery", run: async () => { visited.push("recovery"); return "recovered"; } },
        { id: "unreachable", run: async () => { visited.push("unreachable"); } }
    ]);

    const result = await workflow.runWorkflow("branch-xqzwf5", {});

    assert.deepStrictEqual(visited, ["recovery"]);
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps[0].status, "failed");
    assert.strictEqual(result.steps[1].status, "success");

});


test("runWorkflow() skips a step whose real condition() returns false, without failing the run", async () => {

    const visited = [];

    workflow.defineWorkflow("condition-xqzwf6", [
        {
            id: "gate",
            condition: async () => false,
            run: async () => { visited.push("gate"); },
            onSuccess: "after"
        },
        { id: "after", run: async () => { visited.push("after"); return "ran"; } }
    ]);

    const result = await workflow.runWorkflow("condition-xqzwf6", {});

    assert.deepStrictEqual(visited, ["after"]);
    assert.strictEqual(result.steps[0].status, "skipped");
    assert.strictEqual(result.steps[1].status, "success");

});


test("runWorkflow() rolls back every completed step, most-recent-first, when a later step fails with no onFailure edge", async () => {

    const rolledBack = [];

    workflow.defineWorkflow("rollback-xqzwf7", [
        {
            id: "first",
            run: async () => "first-done",
            rollback: async () => { rolledBack.push("first"); },
            onSuccess: "second"
        },
        {
            id: "second",
            run: async () => "second-done",
            rollback: async () => { rolledBack.push("second"); },
            onSuccess: "third"
        },
        {
            id: "third",
            run: async () => { throw new Error("simulated failure XQZWF7"); }
        }
    ]);

    const result = await workflow.runWorkflow("rollback-xqzwf7", {});

    assert.strictEqual(result.status, "failed");
    // Most-recently-completed first -- "second" rolled back before "first".
    assert.deepStrictEqual(rolledBack, ["second", "first"]);
    assert.ok(result.steps.some(s => s.id === "second" && s.status === "rolled_back"));
    assert.ok(result.steps.some(s => s.id === "first" && s.status === "rolled_back"));

});


test("runWorkflow() retries a real failing step up to maxAttempts before giving up", async () => {

    let attempts = 0;

    workflow.defineWorkflow("retry-xqzwf8", [
        {
            id: "flaky",
            maxAttempts: 3,
            run: async () => {
                attempts += 1;
                if(attempts < 3){
                    throw new Error(`simulated transient failure XQZWF8 attempt ${attempts}`);
                }
                return "succeeded on third try";
            }
        }
    ]);

    const result = await workflow.runWorkflow("retry-xqzwf8", {});

    assert.strictEqual(attempts, 3);
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.steps[0].output, "succeeded on third try");

});


test("runWorkflow() publishes a real workflow.completed bus event", async () => {

    workflow.defineWorkflow("event-xqzwf9", [
        { id: "only", run: async () => "done" }
    ]);

    const captured = [];
    const listener = data => captured.push(data);

    bus.on("workflow.completed", listener);

    try {
        await workflow.runWorkflow("event-xqzwf9", {});
    } finally {
        bus.off("workflow.completed", listener);
    }

    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].workflow, "event-xqzwf9");
    assert.strictEqual(captured[0].status, "completed");

});


test("scheduleWorkflow() registers and schedules a real job on the caller's AutomationEngine, reusing it rather than a second scheduler", () => {

    const engine = new AutomationEngine();

    workflow.defineWorkflow("scheduled-xqzwf10", [
        { id: "only", run: async () => "done" }
    ]);

    const jobName = workflow.scheduleWorkflow(engine, "scheduled-xqzwf10", 60 * 60 * 1000, {});

    assert.strictEqual(jobName, "workflow:scheduled-xqzwf10");

    const status = engine.status();
    assert.ok(status.schedules.some(s => s.jobName === jobName));

});
