const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-constitution-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-constitution-${process.pid}.json`);

// core/profile/constitution.json is real, gitignored, operator data --
// same real-file backup/restore discipline as
// tests/personal-context-engine.test.js's own veronica.profile.json
// handling, so a real constitution (if one exists on this machine) is
// never clobbered by running these tests.
const CONSTITUTION_PATH = path.join(__dirname, "..", "core", "profile", "constitution.json");
const CONSTITUTION_EXISTED_BEFORE = fs.existsSync(CONSTITUTION_PATH);
const CONSTITUTION_BACKUP = path.join(os.tmpdir(), `veronica-constitution-backup-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(CONSTITUTION_EXISTED_BEFORE){
        fs.copyFileSync(CONSTITUTION_PATH, CONSTITUTION_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(CONSTITUTION_EXISTED_BEFORE){
        fs.copyFileSync(CONSTITUTION_BACKUP, CONSTITUTION_PATH);
        fs.unlinkSync(CONSTITUTION_BACKUP);
    } else if(fs.existsSync(CONSTITUTION_PATH)){
        fs.unlinkSync(CONSTITUTION_PATH);
    }
});

const ExecutiveConstitution = require("../core/executive/constitution");
const ContextEngine = require("../core/context/engine");
const IntelligenceEngine = require("../core/intelligence");


test("load() bootstraps real, honest defaults -- unset personal fields, populated operating principles", () => {

    const constitution = new ExecutiveConstitution();
    const loaded = constitution.load();

    assert.strictEqual(loaded.identity.name, "VERONICA");
    assert.strictEqual(loaded.mission, null);
    assert.ok(loaded.values.length > 0);
    assert.ok(loaded.riskPhilosophy.length > 0);
    assert.ok(loaded.approvalPhilosophy.length > 0);
    assert.ok(Array.isArray(loaded.autonomyRules) && loaded.autonomyRules.length > 0);

});


test("set() writes a real dot-path field and add() appends to a real list field", () => {

    const constitution = new ExecutiveConstitution();

    const afterSet = constitution.set("mission", "Ship real, explainable automation XQZCONST1");
    assert.strictEqual(afterSet.mission, "Ship real, explainable automation XQZCONST1");

    const afterAdd = constitution.add("values", "Test value XQZCONST1");
    assert.ok(afterAdd.values.includes("Test value XQZCONST1"));

    assert.throws(() => constitution.add("mission", "not a list field"));

    const reloaded = constitution.load();
    assert.strictEqual(reloaded.mission, "Ship real, explainable automation XQZCONST1");

});


test("forContext() returns a condensed view -- identity, mission, values, principles, risk/approval/autonomy boundary", () => {

    const constitution = new ExecutiveConstitution();
    constitution.set("mission", "Condensed mission XQZCONST2");

    const context = constitution.forContext();

    assert.strictEqual(context.mission, "Condensed mission XQZCONST2");
    assert.ok(context.values);
    assert.ok(context.operatingPrinciples);
    assert.ok(context.riskPhilosophy);
    assert.ok(context.approvalPhilosophy);
    assert.ok(context.autonomyRules);
    // Fields NOT in the condensed view -- the full document has more
    // than what belongs in every single reasoning call's prompt.
    assert.strictEqual(context.decisionHierarchy, undefined);
    assert.strictEqual(context.escalationRules, undefined);

});


test("ContextEngine.retrieve() automatically includes the real constitution (Phase 51 -- every department references this)", async () => {

    const constitution = new ExecutiveConstitution();
    constitution.set("mission", "Retrieve-path mission XQZCONST3");

    const engine = new ContextEngine();
    const context = await engine.retrieve(null);

    assert.strictEqual(context.constitution.mission, "Retrieve-path mission XQZCONST3");
    assert.strictEqual(context.constitution.identity.name, "VERONICA");

});


test("Intelligence.think()'s actual constructed prompt contains the real constitution content, not just an unused context field", async () => {

    const constitution = new ExecutiveConstitution();
    constitution.set("mission", "Prompt-injection mission XQZCONST4");
    constitution.set("riskPhilosophy", "Real risk philosophy XQZCONST4");

    const engine = new IntelligenceEngine();

    engine.brain.provider.providers = {
        claude: { generate: async () => ({ response: "acknowledged", provider: "claude", toolCalls: [] }) }
    };
    engine.brain.provider.active = "claude";

    const thought = await engine.think(
        { name: "TESTAGENT", role: "Test Role", capabilities: ["testing"] },
        { task: "constitution prompt test XQZCONST4" },
        { useTools: false }
    );

    assert.match(thought.cognition.prompt, /Prompt-injection mission XQZCONST4/);
    assert.match(thought.cognition.prompt, /Real risk philosophy XQZCONST4/);

});
