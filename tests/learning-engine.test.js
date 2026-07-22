const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-learn-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-learn-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-learn-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
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
});

const LearningEngine = require("../core/learning/engine");
const log = require("../core/learning/log");

function mockBrain(engine, responseText){

    engine.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: responseText, provider: "claude", toolCalls: [] }) }
    };

    engine.intelligence.brain.provider.active = "claude";

}

test("overview()/departmentPerformance()/agentPerformance()/toolPerformance() aggregate logged events", () => {

    const engine = new LearningEngine();

    const marker = "XQZLEARN1";

    log.record({ kind: "department_run", department: `hades-${marker}`, agent: `PLUTUS-${marker}`, outcome: "success", durationMs: 100 });
    log.record({ kind: "department_run", department: `hades-${marker}`, agent: `PLUTUS-${marker}`, outcome: "failure", durationMs: 50, error: "boom" });
    log.record({ kind: "tool_call", tool: `memory.remember-${marker}`, outcome: "success", durationMs: 10 });
    log.record({ kind: "tool_call", tool: `memory.remember-${marker}`, outcome: "success", durationMs: 30 });

    const overview = engine.overview();
    assert.ok(overview.total >= 4);
    assert.ok(overview.successes >= 3);
    assert.ok(overview.failures >= 1);

    const departments = engine.departmentPerformance();
    const hades = departments.find(d => d.department === `hades-${marker}`);
    assert.strictEqual(hades.total, 2);
    assert.strictEqual(hades.successes, 1);
    assert.strictEqual(hades.failures, 1);
    assert.strictEqual(hades.successRate, 50);
    assert.strictEqual(hades.avgDurationMs, 75);

    const agents = engine.agentPerformance();
    const plutus = agents.find(a => a.agent === `PLUTUS-${marker}`);
    assert.strictEqual(plutus.total, 2);

    const toolStats = engine.toolPerformance();
    const rememberStats = toolStats.find(t => t.tool === `memory.remember-${marker}`);
    assert.strictEqual(rememberStats.total, 2);
    assert.strictEqual(rememberStats.successRate, 100);
    assert.strictEqual(rememberStats.avgDurationMs, 20);

});

test("recommend() skips the brain call and reports no data when the log is empty", async () => {

    if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }

    const engine = new LearningEngine();

    const result = await engine.recommend();

    assert.strictEqual(result.summary, "No execution data logged yet.");
    assert.deepStrictEqual(result.recommendations, []);

});

test("recommend() synthesizes recommendations from aggregated stats when logs exist", async () => {

    log.record({ kind: "tool_call", tool: "filesystem.readFile", outcome: "failure", durationMs: 500, error: "slow and broken" });

    const engine = new LearningEngine();

    mockBrain(engine, JSON.stringify({
        summary: "One tool is slow and failing often.",
        recommendations: ["Investigate filesystem.readFile latency and failures"]
    }));

    const result = await engine.recommend();

    assert.strictEqual(result.summary, "One tool is slow and failing often.");
    assert.deepStrictEqual(result.recommendations, ["Investigate filesystem.readFile latency and failures"]);
    assert.ok(result.stats.overview.total >= 1);

});

test("recommend() throws a clear error when the model response isn't valid JSON", async () => {

    log.record({ kind: "tool_call", tool: "test.trigger", outcome: "success", durationMs: 1 });

    const engine = new LearningEngine();

    mockBrain(engine, "not json");

    await assert.rejects(
        () => engine.recommend(),
        /not valid JSON/
    );

});

test("recommendationHistory() returns past runs", async () => {

    log.record({ kind: "tool_call", tool: "test.trigger2", outcome: "success", durationMs: 1 });

    const engine = new LearningEngine();

    mockBrain(engine, JSON.stringify({ summary: "history check", recommendations: ["do X"] }));

    const run = await engine.recommend();

    const history = engine.recommendationHistory();
    assert.ok(history.some(r => r.id === run.id));

});
