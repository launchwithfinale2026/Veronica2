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
        "constitution.add",
        "constitution.set",
        "constitution.summary",
        "brain.status",
        "brain.routingPreferences",
        "brain.setRoutingPreference",
        "brain.clearRoutingPreference",
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

test("marketing.campaign.plan tool runs end to end through the real Tool Registry and creates a real campaign (Phase 41 -- no longer a skeleton)", async () => {

    const CompanyManager = require("../core/executive/companyManager");
    const campaigns = require("../core/marketing/campaigns");

    const company = new CompanyManager().createCompany({ name: "Tool Test Marketing Co XQZTOOL1" });

    const campaign = await tools.run(
        "marketing.campaign.plan",
        { companyId: company.id, objective: "Tool-driven campaign XQZTOOL1", platforms: ["discord"] },
        { role: "agent" }
    );

    assert.strictEqual(campaign.objective, "Tool-driven campaign XQZTOOL1");
    assert.strictEqual(campaign.companyId, company.id);

    const persisted = campaigns.getCampaign(campaign.id);
    assert.strictEqual(persisted.objective, "Tool-driven campaign XQZTOOL1");

});

test("sales.pipeline.review tool runs end to end through the real Tool Registry (Phase 42 -- no longer a skeleton, and no longer a circular-require landmine)", async () => {

    // This is also the regression test for a real circular-require bug
    // found live: core/tools/index.js's loadTools() call is what first
    // pulls this tool handler in, and this tool handler's dependency
    // chain (core/sales/analytics.js -> core/learning -> ... ->
    // core/brain/providers/claude.js) used to require core/tools/index.js
    // right back, at module load time, landing on an incompletely
    // initialized module. Going through the REAL registry (`tools`,
    // not requiring core/sales/analytics.js directly) is what actually
    // exercises that path -- see core/sales/analytics.js's own comment.
    const CompanyManager = require("../core/executive/companyManager");

    const company = new CompanyManager().createCompany({ name: "Tool Test Sales Co XQZTOOL2" });

    const review = await tools.run(
        "sales.pipeline.review",
        { companyId: company.id },
        { role: "agent" }
    );

    assert.strictEqual(review.leadCount, 0);
    assert.strictEqual(review.winLoss.totalClosed, 0);
    assert.ok(review.pipeline);
    assert.ok("executionHealth" in review);

});

test("finance.report.generate tool runs end to end through the real Tool Registry (Phase 43 -- no longer a skeleton)", async () => {

    const CompanyManager = require("../core/executive/companyManager");

    const company = new CompanyManager().createCompany({ name: "Tool Test Finance Co XQZTOOL3" });

    const report = await tools.run(
        "finance.report.generate",
        { companyId: company.id },
        { role: "agent" }
    );

    assert.ok(report.kpis);
    assert.strictEqual(report.kpis.financialSummary.revenue, 0);
    assert.deepStrictEqual(report.cashFlow, []);
    assert.ok(report.forecast);
    assert.deepStrictEqual(report.budgets, []);

});

test("research.dept.synthesize tool is registered and wired correctly through the real Tool Registry -- no longer corrupted by the circular-require it used to hit (Phase 44)", async () => {

    // This tool's real implementation always makes a genuine LLM call
    // (generateExecutiveSummary() has no injection point reachable from
    // outside tools.run()), so this doesn't assert on real model output
    // -- it instead proves the module chain resolved correctly: an
    // unknown missionId surfaces the real, expected error from
    // core/research/missions.js (requireEntry()), not a "does not
    // export"/"is not a function" error, which is exactly what the
    // circular-require bug (core/research/missions.js and
    // core/research/engine.js both top-level-requiring
    // core/intelligence) produced before it was fixed.
    await assert.rejects(
        () => tools.run("research.dept.synthesize", { missionId: "not-a-real-id" }, { role: "agent" }),
        /Unknown research mission/
    );

});

test("trading.portfolio.review tool runs end to end through the real Tool Registry (Phase 45 -- no longer a skeleton)", async () => {

    const portfolio = require("../core/trading/portfolio");

    const p = portfolio.createPortfolio({ name: "Tool Test Trading Portfolio XQZTOOL4", startingCash: 10000 });
    portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 });

    const review = await tools.run(
        "trading.portfolio.review",
        { portfolioId: p.id, currentPrices: { ACME: 120 } },
        { role: "agent" }
    );

    assert.strictEqual(review.value.positions[0].unrealizedPnl, 200);
    assert.strictEqual(review.performance.closedTrades, 0);
    assert.ok("executionHealth" in review);

});

test("bizops.workflow.review tool runs end to end through the real Tool Registry (Phase 46 -- no longer a skeleton, the sixth and final Phase 35 package)", async () => {

    const sops = require("../core/operations/sops");

    const sop = sops.createSOP({ name: "Tool Test SOP XQZTOOL5", department: "bizops", steps: ["Step 1"] });

    const review = await tools.run(
        "bizops.workflow.review",
        { sopId: sop.id },
        { role: "agent" }
    );

    assert.strictEqual(review.sop.id, sop.id);
    assert.strictEqual(review.executionHealth, null);
    assert.deepStrictEqual(review.relatedKPIs, []);

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
