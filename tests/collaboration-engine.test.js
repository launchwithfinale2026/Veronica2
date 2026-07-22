const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/departments.test.js --
// relies on --test-concurrency=1 (see package.json). Uses hades/
// hephaestus/apollo as its real departments (not athena, to avoid
// colliding with tests/departments.test.js's own fixture data on the
// same activity.log files -- though --test-concurrency=1 already
// serializes files, distinct departments keep this file self-contained).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-collab-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-collab-${process.pid}.json`);

const DEPARTMENT_IDS = ["hades", "hephaestus", "apollo"];

const LOG_PATHS = DEPARTMENT_IDS.map(id => ({
    id,
    path: path.join(__dirname, "..", "departments", id, "logs", "activity.log")
}));

const LOG_STATE = LOG_PATHS.map(({ id, path: logPath }) => ({
    id,
    path: logPath,
    existedBefore: fs.existsSync(logPath),
    backup: path.join(os.tmpdir(), `veronica-${id}-log-backup-collab-${process.pid}.log`)
}));

// delegate()/consensus() call the real DepartmentManager.run(), which
// (Phase 7) records to core/learning/log.js's executions.log -- same
// backup/restore every other file exercising that instrumentation needs
// (see docs/Architecture.md "Learning Engine" for the first time this
// exact class of bug was caught, and "Production Hardening" for where it
// resurfaced in this file, missed the first time around).
const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-collab-${process.pid}.log`);

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
const CollaborationEngine = require("../core/collaboration/engine");
const knowledge = require("../core/knowledge");

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

function mockBrain(department, responseText){

    department.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    department.intelligence.brain.provider.active = "claude";

}

function makeEngine(){

    const hades = makeDepartment("hades", "PLUTUS");
    const hephaestus = makeDepartment("hephaestus", "DAEDALUS");
    const apollo = makeDepartment("apollo", "HELIOS");

    const engine = new CollaborationEngine([hades, hephaestus, apollo]);

    return { engine, hades, hephaestus, apollo };

}

test("sendMessage() logs a message and links a messaged relationship, without calling the brain", () => {

    const { engine } = makeEngine();

    const result = engine.sendMessage("hades", "hephaestus", "budget update XQZCOLLAB1");

    assert.strictEqual(result.from, "hades");
    assert.strictEqual(result.to, "hephaestus");
    assert.strictEqual(result.message, "budget update XQZCOLLAB1");

    const connections = knowledge.connections("PLUTUS");
    assert.ok(connections.some(rel => rel.type === "messaged" && rel.to === "DAEDALUS"));

});

test("sendMessage() rejects an unknown department or a missing message", () => {

    const { engine } = makeEngine();

    assert.throws(() => engine.sendMessage("not-a-real-dept", "hades", "hi"));
    assert.throws(() => engine.sendMessage("hades", "hephaestus", ""));

});

test("delegate() runs the task on the target department via real Intelligence and attributes the result", async () => {

    const { engine, hephaestus } = makeEngine();

    mockBrain(hephaestus, "DAEDALUS handled: build the widget XQZCOLLAB2");

    const result = await engine.delegate("hades", "hephaestus", "build the widget XQZCOLLAB2");

    assert.strictEqual(result.from, "hades");
    assert.strictEqual(result.to, "hephaestus");
    assert.strictEqual(result.agent, "DAEDALUS");
    assert.ok(result.response.includes("build the widget XQZCOLLAB2"));

    const connections = knowledge.connections("PLUTUS");
    assert.ok(connections.some(rel => rel.type === "delegatesTo" && rel.to === "DAEDALUS"));

});

test("review() parses a structured verdict/feedback and rejects invalid JSON", async () => {

    const { engine, hades } = makeEngine();

    mockBrain(hades, JSON.stringify({ verdict: "revise", feedback: ["tighten the scope", "add tests"] }));

    const result = await engine.review("hades", "some draft content XQZCOLLAB3");

    assert.strictEqual(result.reviewer, "hades");
    assert.strictEqual(result.verdict, "revise");
    assert.deepStrictEqual(result.feedback, ["tighten the scope", "add tests"]);

    mockBrain(hades, "not json");
    await assert.rejects(() => engine.review("hades", "more content"), /not valid JSON/);

    mockBrain(hades, JSON.stringify({ verdict: "not-a-real-verdict" }));
    await assert.rejects(() => engine.review("hades", "more content"), /verdict/);

});

test("consensus() polls every department in parallel and tallies a majority decision", async () => {

    const { engine, hades, hephaestus, apollo } = makeEngine();

    mockBrain(hades, JSON.stringify({ vote: "yes", reasoning: "sounds good" }));
    mockBrain(hephaestus, JSON.stringify({ vote: "yes", reasoning: "agreed" }));
    mockBrain(apollo, JSON.stringify({ vote: "no", reasoning: "too risky" }));

    const result = await engine.consensus(["hades", "hephaestus", "apollo"], "Ship the new feature XQZCOLLAB4");

    assert.strictEqual(result.votes.length, 3);
    assert.strictEqual(result.tally.yes, 2);
    assert.strictEqual(result.tally.no, 1);
    assert.strictEqual(result.decision, "approved");

});

test("consensus() requires at least 2 departments and a proposal", async () => {

    const { engine } = makeEngine();

    await assert.rejects(() => engine.consensus(["hades"], "x"));
    await assert.rejects(() => engine.consensus(["hades", "hephaestus"], ""));

});

test("history() returns past collaboration records across message/delegate/review/consensus", async () => {

    const { engine, hades, hephaestus } = makeEngine();

    const message = engine.sendMessage("hades", "hephaestus", "history check XQZCOLLAB5");

    mockBrain(hephaestus, "ok");
    const delegation = await engine.delegate("hades", "hephaestus", "history check task XQZCOLLAB5");

    const history = engine.history();

    assert.ok(history.some(h => h.id === message.id && h.kind === "message"));
    assert.ok(history.some(h => h.id === delegation.id && h.kind === "delegation"));

});
