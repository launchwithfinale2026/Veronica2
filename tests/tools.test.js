const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// memory.remember / knowledge.query touch the same shared, real data
// files as tests/memory-store.test.js and tests/knowledge.test.js, so
// this relies on the same --test-concurrency=1 serialization those rely
// on (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tools-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-tools-${process.pid}.json`);

const WORKSPACE = path.join(__dirname, "..", "data", "workspace");

// Tool.execute() now records every call to core/learning/log.js's
// executions.log -- same real-file backup/restore treatment, handling
// "didn't exist before this test run" the same way
// tests/departments.test.js does for activity.log.
const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-tools-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
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

    const testFile = path.join(WORKSPACE, "tools-test.txt");
    if(fs.existsSync(testFile)){
        fs.unlinkSync(testFile);
    }
});

const Tool = require("../core/tools/base");
const tools = require("../core/tools");
const identity = require("../core/identity");

test("Tool.execute() denies calls missing the required permission", async () => {

    const tool = new Tool({
        id: "test.locked",
        description: "test",
        permission: "write_memory",
        handler: async () => "should not run"
    });

    await assert.rejects(
        () => tool.execute({}, []),
        /Permission denied/
    );

});

test("Tool.execute() allows calls with the required permission", async () => {

    const tool = new Tool({
        id: "test.open",
        description: "test",
        permission: "write_memory",
        handler: async () => "ran"
    });

    const result = await tool.execute({}, ["write_memory"]);
    assert.strictEqual(result, "ran");

});

test("Tool.execute() wraps handler errors with the tool id", async () => {

    const tool = new Tool({
        id: "test.broken",
        description: "test",
        permission: null,
        handler: async () => { throw new Error("boom"); }
    });

    await assert.rejects(
        () => tool.execute({}, []),
        /Tool "test\.broken" failed: boom/
    );

});

test("identity.permissionsForRole() reflects identity/roles.json", () => {

    const agentPerms = identity.permissionsForRole("agent");
    assert.ok(agentPerms.includes("execute_tools"));
    assert.ok(agentPerms.includes("read_memory"));

    assert.strictEqual(identity.permissionsForRole("no_such_role").length, 0);

});

test("identity.hasPermission() matches permissionsForRole()", () => {

    assert.strictEqual(identity.hasPermission("agent", "execute_tools"), true);
    assert.strictEqual(identity.hasPermission("agent", "manage_agents"), false);

});

test("registry loads every built-in tool with a real handler", () => {

    // A subset check, not exact equality: this machine now has real,
    // installed capability packages (Phase 35/41) whose own tools load
    // dynamically alongside the built-in roster (Phase 25) -- the exact
    // total is legitimately no longer closed/fixed, since it depends on
    // what's installed. Every BUILT-IN id below must still be present;
    // extra package-provided ids beyond this list are expected, not a
    // regression.
    const list = tools.list();
    const ids = list.map(t => t.id).sort();

    const builtInIds = [
        "automation.history",
        "automation.run",
        "automation.runNow",
        "automation.status",
        "company.addDocument",
        "company.addEmployee",
        "company.addRelationship",
        "company.create",
        "company.get",
        "company.list",
        "company.logCommunication",
        "company.recordFinance",
        "executive.addArtifact",
        "executive.approveProposal",
        "executive.blockers",
        "executive.consolidate",
        "executive.consolidationHistory",
        "executive.dailyBriefing",
        "executive.dailyBriefingHistory",
        "executive.dailyReview",
        "executive.dailyReviewHistory",
        "executive.deadlines",
        "executive.decompose",
        "executive.executeProposal",
        "executive.generateProposals",
        "executive.goalIssues",
        "executive.listProposals",
        "executive.plan",
        "executive.priorityRank",
        "executive.project",
        "executive.reassignDepartment",
        "executive.recommendationHistory",
        "executive.recommendations",
        "executive.rejectProposal",
        "executive.roadmap",
        "executive.runEveningCycle",
        "executive.runMorningCycle",
        "executive.runSelfCheck",
        "executive.selfMonitorHistory",
        "executive.updateStatus",
        "executive.weeklyOperatingReport",
        "executive.weeklyOperatingReportHistory",
        "files.index",
        "files.list",
        "files.read",
        "files.search",
        "filesystem.readFile",
        "filesystem.writeFile",
        "integrations.status",
        "knowledge.query",
        "learning.agentPerformance",
        "learning.departmentPerformance",
        "learning.overview",
        "learning.recommend",
        "learning.recommendations",
        "learning.toolPerformance",
        "memory.lifecycleOverview",
        "memory.overview",
        "memory.recall",
        "memory.reindexEmbeddings",
        "memory.remember",
        "memory.runLifecyclePromotion",
        "memory.semanticSearch",
        "obsidian.index",
        "obsidian.list",
        "obsidian.read",
        "obsidian.write",
        "profile.add",
        "profile.set",
        "profile.summary",
        "system.understand",
        "vision.analyzeImage",
        "web.fetch"
    ];

    for(const id of builtInIds){
        assert.ok(ids.includes(id), `expected built-in tool "${id}" to still be registered`);
    }

    // Every id beyond the built-in roster must be a real, installed
    // capability package's own tool (Phase 25/41), not an unexplained
    // extra -- so this still catches a genuine regression (e.g. a
    // handler module accidentally registering something twice) while
    // tolerating real, intended package tools.
    const registry = require("../core/capabilities/registry");
    const packageToolIds = new Set(
        registry.list()
            .filter(entry => !entry.core && entry.manifest)
            .flatMap(entry => (entry.manifest.tools || []).map(tool => tool.id))
    );

    const unexplained = ids.filter(id => !builtInIds.includes(id) && !packageToolIds.has(id));
    assert.deepStrictEqual(unexplained, []);

});

test("tools.run() rejects an unknown tool id", async () => {

    await assert.rejects(
        () => tools.run("no.such.tool", {}, { role: "executive" }),
        /Unknown tool/
    );

});

test("filesystem tools round-trip through the sandbox", async () => {

    const written = await tools.run(
        "filesystem.writeFile",
        { path: "tools-test.txt", content: "sandboxed content" },
        { role: "executive" }
    );

    assert.strictEqual(written.status, "written");

    const content = await tools.run(
        "filesystem.readFile",
        { path: "tools-test.txt" },
        { role: "executive" }
    );

    assert.strictEqual(content, "sandboxed content");

});

test("filesystem tools reject paths that escape the sandbox", async () => {

    await assert.rejects(
        () => tools.run("filesystem.readFile", { path: "../../../../etc/passwd" }, { role: "executive" }),
        /escapes the sandboxed workspace/
    );

    await assert.rejects(
        () => tools.run("filesystem.readFile", { path: "/etc/passwd" }, { role: "executive" }),
        /escapes the sandboxed workspace/
    );

});

test("memory.remember tool persists via the real memory system", async () => {

    const stored = await tools.run(
        "memory.remember",
        { content: "tool system integration marker QWERTY", type: "technical knowledge" },
        { role: "agent" }
    );

    assert.strictEqual(stored.type, "technical knowledge");

    const found = await tools.run(
        "memory.recall",
        { query: "QWERTY" },
        { role: "agent" }
    );

    assert.ok(found.some(m => m.content.includes("QWERTY")));

});

test("memory.overview tool reports a real class breakdown that accounts for every entry", async () => {

    const overview = await tools.run("memory.overview", {}, { role: "agent" });

    const allEntries = await tools.run("memory.recall", {}, { role: "agent" });

    assert.strictEqual(overview.total, allEntries.length);

    const summed = Object.values(overview.byClass).reduce((sum, n) => sum + n, 0);
    assert.strictEqual(summed, overview.total);

});

test("knowledge.query tool reads via the real knowledge graph", async () => {

    const result = await tools.run(
        "knowledge.query",
        { name: "VERONICA" },
        { role: "agent" }
    );

    assert.ok(Array.isArray(result.entities));
    assert.ok(Array.isArray(result.relationships));

});

test("integrations.status tool reports every registered connector", async () => {

    const overview = await tools.run("integrations.status", {}, { role: "agent" });

    assert.ok(overview.total >= 8);
    assert.ok(overview.integrations.some(i => i.id === "github"));
    assert.ok(overview.integrations.some(i => i.id === "obsidian"));

});

test("DepartmentManager.useTool() runs tools with department_manager permissions", async () => {

    const DepartmentManager = require("../core/departments/base");

    const manager = new DepartmentManager({
        id: "athena",
        name: "ATHENA",
        domain: "Knowledge Intelligence",
        agents: []
    });

    const result = await manager.useTool("knowledge.query", { name: "VERONICA" });

    assert.ok(Array.isArray(result.entities));

    // department_manager has no "communicate" permission in
    // identity/roles.json — confirm that's actually enforced end to end
    // by pointing at a hypothetical tool requiring it.
    const Tool = require("../core/tools/base");
    const identity = require("../core/identity");

    const commsOnlyTool = new Tool({
        id: "test.commsOnly",
        description: "test",
        permission: "communicate",
        handler: async () => "should not run"
    });

    await assert.rejects(
        () => commsOnlyTool.execute({}, identity.permissionsForRole("department_manager"))
    );

});
