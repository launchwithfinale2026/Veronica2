const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-activation-${process.pid}.json`);

test.before(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
});

test.after(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
});

const registry = require("../core/capabilities/registry");
const activation = require("../core/capabilities/activation");
const loadAgents = require("../core/agents/loader");
const loadTools = require("../core/tools/loader");
const loadDepartments = require("../core/departments/loader");
const { registerBuiltInJobs } = require("../core/automation/jobs");


function makeTempPackage(){
    return fs.mkdtempSync(path.join(os.tmpdir(), "veronica-activation-pkg-xqzact-"));
}


test("with zero active packages, activation.* helpers return empty arrays (no behavior change)", () => {

    assert.deepStrictEqual(activation.packageAgentConfigs(), []);
    assert.deepStrictEqual(activation.packageToolConfigs(), []);
    assert.deepStrictEqual(activation.packageDepartmentConfigs(), []);
    assert.deepStrictEqual(activation.packageAutomationConfigs(), []);

});


test("loadAgents() includes a real, active package agent alongside the base roster", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "agents"));
    fs.writeFileSync(path.join(dir, "agents", "actagentxqzact1.js"), `module.exports = { identity: "ActAgentXQZACT1", mission: "test", system: "test" };`);

    const manifest = {
        name: "test-activation-agent-xqzact1",
        version: "1.0.0",
        description: "test",
        agents: [{ name: "ActAgentXQZACT1", department: null, role: "Tester", capabilities: [] }]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-activation-agent-xqzact1", "active");

    const agents = loadAgents();
    const found = agents.find(a => a.name === "ActAgentXQZACT1");

    assert.ok(found, "expected the package agent to be loaded");
    assert.strictEqual(found.packageSource, "test-activation-agent-xqzact1");
    assert.strictEqual(found.intelligence.identity, "ActAgentXQZACT1");

    registry.remove("test-activation-agent-xqzact1");

    assert.ok(!loadAgents().some(a => a.name === "ActAgentXQZACT1"), "removing/deactivating should stop it from loading");

});


test("loadAgents() ignores a package's agents once it's disabled, not just removed", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "agents"));
    fs.writeFileSync(path.join(dir, "agents", "actagentxqzact2.js"), `module.exports = { identity: "ActAgentXQZACT2", mission: "test", system: "test" };`);

    const manifest = {
        name: "test-activation-agent-xqzact2",
        version: "1.0.0",
        description: "test",
        agents: [{ name: "ActAgentXQZACT2" }]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-activation-agent-xqzact2", "active");

    assert.ok(loadAgents().some(a => a.name === "ActAgentXQZACT2"));

    registry.setStatus("test-activation-agent-xqzact2", "disabled");

    assert.ok(!loadAgents().some(a => a.name === "ActAgentXQZACT2"));

    registry.remove("test-activation-agent-xqzact2");

});


test("loadTools() includes a real, active package tool that actually executes", async () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(
        path.join(dir, "tools", "test.act.xqzact3.js"),
        `module.exports = { "test.act.xqzact3": async () => ({ ok: true }) };`
    );

    const manifest = {
        name: "test-activation-tool-xqzact3",
        version: "1.0.0",
        description: "test",
        tools: [{ id: "test.act.xqzact3", description: "test", permission: "read" }]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-activation-tool-xqzact3", "active");

    const tools = loadTools();
    const found = tools.find(t => t.id === "test.act.xqzact3");

    assert.ok(found, "expected the package tool to be loaded");

    const result = await found.execute({}, ["read"]);
    assert.deepStrictEqual(result, { ok: true });

    registry.remove("test-activation-tool-xqzact3");

});


test("loadTools() throws a clear error when a package's declared tool handler doesn't export the right id", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(path.join(dir, "tools", "test.act.xqzact4.js"), `module.exports = { "wrong.id": () => {} };`);

    const manifest = {
        name: "test-activation-tool-xqzact4",
        version: "1.0.0",
        description: "test",
        tools: [{ id: "test.act.xqzact4" }]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-activation-tool-xqzact4", "active");

    assert.throws(() => loadTools(), /does not export it/);

    registry.remove("test-activation-tool-xqzact4");

});


test("loadDepartments() includes a real, active package department using the standard manager.js factory convention", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "department"));
    fs.writeFileSync(
        path.join(dir, "department", "manager.js"),
        `const DepartmentManager = require(${JSON.stringify(path.join(__dirname, "..", "core", "departments", "base.js"))});
         module.exports = (config) => new DepartmentManager(config);`
    );

    const manifest = {
        name: "test-activation-dept-xqzact5",
        version: "1.0.0",
        description: "test",
        department: { id: "xqzact5dept", name: "XQZACT5 Department", domain: "Testing" },
        agents: [{ name: "DeptAgentXQZACT5", department: "xqzact5dept" }]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-activation-dept-xqzact5", "active");

    const agents = loadAgents();
    const departments = loadDepartments(agents);

    const found = departments.find(d => d.id === "xqzact5dept");
    assert.ok(found, "expected the package department to be loaded");

    // The real Phase 33 fix: a package department logs to
    // <packageDir>/logs/activity.log (created on construction), NOT the
    // nonexistent departments/xqzact5dept/logs/ -- this would throw
    // ENOENT without it.
    assert.strictEqual(found.logFile, path.join(dir, "logs", "activity.log"));
    assert.doesNotThrow(() => found.log({ test: "xqzact5" }));
    assert.ok(fs.readFileSync(found.logFile, "utf8").includes("xqzact5"));

    registry.remove("test-activation-dept-xqzact5");

});


test("registerBuiltInJobs() registers a real, active package automation job on the engine, and skips a broken one without crashing", () => {

    const goodDir = makeTempPackage();
    fs.mkdirSync(path.join(goodDir, "automations"));
    fs.writeFileSync(
        path.join(goodDir, "automations", "pingJobXqzact6.js"),
        `module.exports = { pingJobXqzact6: () => ({ ran: true }) };`
    );

    const goodManifest = {
        name: "test-activation-automation-xqzact6",
        version: "1.0.0",
        description: "test",
        automations: [{ name: "pingJobXqzact6", intervalMs: 3600000 }]
    };

    registry.register({ ...goodManifest, status: "installed", source: goodDir, manifest: goodManifest });
    registry.setStatus("test-activation-automation-xqzact6", "active");

    const brokenDir = makeTempPackage();
    const brokenManifest = {
        name: "test-activation-automation-xqzact7",
        version: "1.0.0",
        description: "test",
        automations: [{ name: "noSuchHandlerXqzact7" }]
    };

    registry.register({ ...brokenManifest, status: "installed", source: brokenDir, manifest: brokenManifest });
    registry.setStatus("test-activation-automation-xqzact7", "active");

    const registeredJobs = [];
    const scheduledJobs = [];

    const fakeEngine = {
        registerJob: (name, handler) => registeredJobs.push({ name, handler }),
        schedule: (name, intervalMs) => scheduledJobs.push({ name, intervalMs })
    };

    assert.doesNotThrow(() => registerBuiltInJobs(fakeEngine));

    const goodJob = registeredJobs.find(j => j.name === "pkg:test-activation-automation-xqzact6:pingJobXqzact6");
    assert.ok(goodJob, "expected the good package automation to be registered");
    assert.deepStrictEqual(goodJob.handler(), { ran: true });

    assert.ok(scheduledJobs.some(j => j.name === goodJob.name && j.intervalMs === 3600000));

    assert.ok(!registeredJobs.some(j => j.name.includes("xqzact7")), "the broken package automation should be skipped, not registered");

    registry.remove("test-activation-automation-xqzact6");
    registry.remove("test-activation-automation-xqzact7");

});
