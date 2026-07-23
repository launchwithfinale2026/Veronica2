const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-routing-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-routing-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-routing-${process.pid}.log`);

const routing = require("../core/brain/routing");
const PREFERENCES_PATH = routing.PREFERENCES_FILE;
const PREFERENCES_EXISTED_BEFORE = fs.existsSync(PREFERENCES_PATH);
const PREFERENCES_BACKUP = path.join(os.tmpdir(), `veronica-routing-preferences-backup-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
    if(PREFERENCES_EXISTED_BEFORE){
        fs.copyFileSync(PREFERENCES_PATH, PREFERENCES_BACKUP);
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
    if(PREFERENCES_EXISTED_BEFORE){
        fs.copyFileSync(PREFERENCES_BACKUP, PREFERENCES_PATH);
        fs.unlinkSync(PREFERENCES_BACKUP);
    } else if(fs.existsSync(PREFERENCES_PATH)){
        fs.unlinkSync(PREFERENCES_PATH);
    }
});

const BrainProvider = require("../core/brain/provider");
const DepartmentManager = require("../core/departments/base");


test("routing.setPreference()/getPreferences()/clearPreference() persist real, honest (no fabricated default) preferences", () => {

    assert.deepStrictEqual(routing.getPreferences(), {});

    routing.setPreference("extraction-xqzroute1", "openai");
    assert.strictEqual(routing.getPreferences()["extraction-xqzroute1"], "openai");

    routing.clearPreference("extraction-xqzroute1");
    assert.strictEqual(routing.getPreferences()["extraction-xqzroute1"], undefined);

    assert.throws(() => routing.setPreference(null, "openai"));
    assert.throws(() => routing.setPreference("some-task", null));

});


test("BrainProvider.generate() routes to the real preferred provider first when one is configured and available for that taskType", async () => {

    const provider = new BrainProvider();

    provider.providers.claude = { generate: async () => ({ response: "from claude", provider: "claude", toolCalls: [] }) };
    provider.providers.openai = { generate: async () => ({ response: "from openai", provider: "openai", toolCalls: [] }) };
    provider.active = "claude";

    routing.setPreference("synthesis-xqzroute2", "openai");

    const routed = await provider.generate("test prompt", { taskType: "synthesis-xqzroute2" });
    assert.strictEqual(routed.response, "from openai");

    // No taskType, or a taskType with no configured preference, falls
    // back to the real, unchanged existing behavior -- `active` first.
    const unrouted = await provider.generate("test prompt", {});
    assert.strictEqual(unrouted.response, "from claude");

    const unknownTaskType = await provider.generate("test prompt", { taskType: "no-preference-set-xqzroute2" });
    assert.strictEqual(unknownTaskType.response, "from claude");

    routing.clearPreference("synthesis-xqzroute2");

});


test("BrainProvider.generate() ignores a routing preference for a provider that never actually initialized", async () => {

    const provider = new BrainProvider();

    provider.providers.claude = { generate: async () => ({ response: "from claude", provider: "claude", toolCalls: [] }) };
    delete provider.providers.openai; // simulates OPENAI_API_KEY genuinely missing
    provider.active = "claude";

    routing.setPreference("missing-provider-xqzroute3", "openai");

    const result = await provider.generate("test prompt", { taskType: "missing-provider-xqzroute3" });
    assert.strictEqual(result.response, "from claude");

    routing.clearPreference("missing-provider-xqzroute3");

});


test("DepartmentManager.run() records which real provider actually answered, in the learning log (Phase 55 evidence, not routing yet)", async () => {

    const department = new DepartmentManager({
        id: "routing-test-dept-xqzroute4",
        name: "Routing Test Department",
        domain: "Test",
        agents: [{ name: "ROUTINGAGENT", role: "Test Role", capabilities: ["testing"] }]
    });

    department.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: "acknowledged XQZROUTE4", provider: "claude", toolCalls: [] }) }
    };
    department.intelligence.brain.provider.active = "claude";

    await department.run("routing evidence test task XQZROUTE4");

    const learningLog = require("../core/learning/log");
    const entries = learningLog.readAll().filter(e => e.kind === "department_run" && e.department === "routing-test-dept-xqzroute4");

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].provider, "claude");

});
