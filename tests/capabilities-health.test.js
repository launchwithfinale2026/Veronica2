const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-health-${process.pid}.json`);

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
const health = require("../core/capabilities/health");
const { SKELETON_MARKER } = require("../core/capabilities/builder");


function makeTempPackage(){
    return fs.mkdtempSync(path.join(os.tmpdir(), "veronica-health-pkg-xqzhlth-"));
}


test("healthFor() reports \"active\" for a package whose agents/tools all really loaded with no skeleton tools", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(
        path.join(dir, "tools", "test.xqzhlth1.js"),
        `module.exports = { "test.xqzhlth1": async () => ({ ok: true }) };`
    );

    const manifest = {
        name: "test-health-active-xqzhlth1",
        version: "1.0.0",
        description: "real, fully working test package",
        agents: [{ name: "TestHealthAgent", department: null, role: "Tester" }],
        tools: [{ id: "test.xqzhlth1" }],
        dependencies: []
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-health-active-xqzhlth1", "active");

    try {

        const report = health.report().find(r => r.name === "test-health-active-xqzhlth1");

        assert.strictEqual(report.operationalStatus, "active");
        assert.strictEqual(report.operationalStatusLabel, "Active");
        assert.strictEqual(report.agentsLoaded, 1);
        assert.strictEqual(report.toolsLoaded, 1);
        assert.deepStrictEqual(report.skeletonTools, []);
        assert.deepStrictEqual(report.missingAgents, []);
        assert.deepStrictEqual(report.missingTools, []);
        assert.deepStrictEqual(report.missingDependencies, []);

    } finally {
        registry.remove("test-health-active-xqzhlth1");
    }

});


test("healthFor() reports \"installed_awaiting_integration\" for a package with a real generated-skeleton tool (builder.js's SKELETON_MARKER)", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(
        path.join(dir, "tools", "test.xqzhlth2.js"),
        `module.exports = { "test.xqzhlth2": async () => { throw new Error(${JSON.stringify(`Tool "test.xqzhlth2" ${SKELETON_MARKER} in this file before use.`)}); } };`
    );

    const manifest = {
        name: "test-health-skeleton-xqzhlth2",
        version: "1.0.0",
        description: "package with one still-unimplemented skeleton tool",
        agents: [],
        tools: [{ id: "test.xqzhlth2" }],
        dependencies: []
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-health-skeleton-xqzhlth2", "active");

    try {

        const report = health.report().find(r => r.name === "test-health-skeleton-xqzhlth2");

        assert.strictEqual(report.operationalStatus, "installed_awaiting_integration");
        assert.strictEqual(report.operationalStatusLabel, "Installed – Awaiting Integration");
        assert.deepStrictEqual(report.skeletonTools, ["test.xqzhlth2"]);

    } finally {
        registry.remove("test-health-skeleton-xqzhlth2");
    }

});


test("healthFor() reports \"degraded\" when a declared agent's prompt file is broken and gets skipped by the Phase 33 resilience path", () => {

    const dir = makeTempPackage();
    fs.mkdirSync(path.join(dir, "agents"));
    fs.writeFileSync(path.join(dir, "agents", "brokenagent.js"), "this is not valid javascript {{{");

    const manifest = {
        name: "test-health-degraded-xqzhlth3",
        version: "1.0.0",
        description: "package with one agent whose prompt file fails to load",
        agents: [{ name: "BrokenAgent", department: null, role: "Tester" }],
        tools: [],
        dependencies: []
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-health-degraded-xqzhlth3", "active");

    try {

        const report = health.report().find(r => r.name === "test-health-degraded-xqzhlth3");

        assert.strictEqual(report.operationalStatus, "degraded");
        assert.deepStrictEqual(report.missingAgents, ["BrokenAgent"]);
        assert.strictEqual(report.agentsLoaded, 0);
        assert.strictEqual(report.agentsDeclared, 1);

    } finally {
        registry.remove("test-health-degraded-xqzhlth3");
    }

});


test("healthFor() reports \"degraded\" when a declared dependency isn't installed", () => {

    const dir = makeTempPackage();

    const manifest = {
        name: "test-health-missingdep-xqzhlth4",
        version: "1.0.0",
        description: "package declaring a dependency that doesn't exist",
        agents: [],
        tools: [],
        dependencies: ["some-capability-that-does-not-exist-xqzhlth4"]
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });
    registry.setStatus("test-health-missingdep-xqzhlth4", "active");

    try {

        const report = health.report().find(r => r.name === "test-health-missingdep-xqzhlth4");

        assert.strictEqual(report.operationalStatus, "degraded");
        assert.deepStrictEqual(report.missingDependencies, ["some-capability-that-does-not-exist-xqzhlth4"]);

    } finally {
        registry.remove("test-health-missingdep-xqzhlth4");
    }

});


test("healthFor() reflects registry.status directly (not \"active\"/\"degraded\") for a non-active package", () => {

    const dir = makeTempPackage();

    const manifest = {
        name: "test-health-inactive-xqzhlth5",
        version: "1.0.0",
        description: "package that was installed but never activated",
        agents: [],
        tools: [],
        dependencies: []
    };

    registry.register({ ...manifest, status: "installed", source: dir, manifest });

    try {

        const report = health.report().find(r => r.name === "test-health-inactive-xqzhlth5");

        assert.strictEqual(report.operationalStatus, "installed");
        assert.strictEqual(report.operationalStatusLabel, "Installed (Inactive)");

    } finally {
        registry.remove("test-health-inactive-xqzhlth5");
    }

});


test("the real \"marketing\" package genuinely reports \"active\", not \"Installed – Awaiting Integration\", now that its tool has a real implementation (Phase 41 Marketing Division)", () => {

    // All six real Phase 35 packages reported "installed_awaiting_integration"
    // when this module was first built (every tool was still a
    // core/capabilities/builder.js-generated skeleton). Marketing's
    // "marketing.campaign.plan" tool was given a real implementation
    // (packages/marketing/tools/marketing.campaign.plan.js -- calls
    // core/marketing/campaigns.js for real) as part of Marketing Division
    // production-readiness -- this is the concrete, honest signal that
    // actually changed.
    const report = health.report().find(r => r.name === "marketing");

    assert.ok(report);
    assert.strictEqual(report.operationalStatus, "active");
    assert.strictEqual(report.operationalStatusLabel, "Active");
    assert.deepStrictEqual(report.skeletonTools, []);
    assert.strictEqual(report.agentsLoaded, report.agentsDeclared);
    assert.strictEqual(report.toolsLoaded, report.toolsDeclared);

});


test("the real \"sales\" package genuinely reports \"active\", not \"Installed – Awaiting Integration\" (Phase 42 Sales Division)", () => {

    // Same signal as marketing above -- sales.pipeline.review was given
    // a real implementation (packages/sales/tools/sales.pipeline.review.js
    // -- calls core/sales/analytics.js for real) as part of Sales
    // Division production-readiness.
    const report = health.report().find(r => r.name === "sales");

    assert.ok(report);
    assert.strictEqual(report.operationalStatus, "active");
    assert.strictEqual(report.operationalStatusLabel, "Active");
    assert.deepStrictEqual(report.skeletonTools, []);
    assert.strictEqual(report.agentsLoaded, report.agentsDeclared);
    assert.strictEqual(report.toolsLoaded, report.toolsDeclared);

});


test("the real \"finance\" package genuinely reports \"active\", not \"Installed – Awaiting Integration\" (Phase 43 Finance Division)", () => {

    // Same signal as marketing/sales above -- finance.report.generate
    // was given a real implementation (packages/finance/tools/
    // finance.report.generate.js -- calls core/finance/reports.js and
    // core/finance/budgets.js for real) as part of Finance Division
    // production-readiness.
    const report = health.report().find(r => r.name === "finance");

    assert.ok(report);
    assert.strictEqual(report.operationalStatus, "active");
    assert.strictEqual(report.operationalStatusLabel, "Active");
    assert.deepStrictEqual(report.skeletonTools, []);
    assert.strictEqual(report.agentsLoaded, report.agentsDeclared);
    assert.strictEqual(report.toolsLoaded, report.toolsDeclared);

});


test("the real \"research-department\" package genuinely reports \"active\", not \"Installed – Awaiting Integration\" (Phase 44 Research Division)", () => {

    // Same signal as marketing/sales/finance above --
    // research.dept.synthesize was given a real implementation
    // (packages/research-department/tools/research.dept.synthesize.js --
    // calls core/research/missions.js for real) as part of Research
    // Division production-readiness. This package's fix also required
    // lazy-requiring core/intelligence in both core/research/missions.js
    // and core/research/engine.js -- the same circular-require class of
    // bug first found in Phase 42 (Sales).
    const report = health.report().find(r => r.name === "research-department");

    assert.ok(report);
    assert.strictEqual(report.operationalStatus, "active");
    assert.strictEqual(report.operationalStatusLabel, "Active");
    assert.deepStrictEqual(report.skeletonTools, []);
    assert.strictEqual(report.agentsLoaded, report.agentsDeclared);
    assert.strictEqual(report.toolsLoaded, report.toolsDeclared);

});


test("the real \"trading-research\" package genuinely reports \"active\", not \"Installed – Awaiting Integration\" (Phase 45 Trading Research Division)", () => {

    // Same signal as marketing/sales/finance/research above --
    // trading.portfolio.review was given a real implementation
    // (packages/trading-research/tools/trading.portfolio.review.js --
    // calls core/trading/analytics.js for real) as part of Trading
    // Research Division production-readiness. core/trading/analytics.js
    // was written with core/learning required lazily from the start,
    // having now seen the circular-require bug class three times
    // (Sales, Marketing, Research).
    const report = health.report().find(r => r.name === "trading-research");

    assert.ok(report);
    assert.strictEqual(report.operationalStatus, "active");
    assert.strictEqual(report.operationalStatusLabel, "Active");
    assert.deepStrictEqual(report.skeletonTools, []);
    assert.strictEqual(report.agentsLoaded, report.agentsDeclared);
    assert.strictEqual(report.toolsLoaded, report.toolsDeclared);

});


test("report() excludes core capabilities entirely", () => {

    const report = health.report();
    const coreNames = registry.list().filter(entry => entry.core).map(entry => entry.name);

    for(const name of coreNames){
        assert.ok(!report.some(r => r.name === name));
    }

});
