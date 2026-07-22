const test = require("node:test");
const assert = require("node:assert");

const planner = require("../core/capabilities/planner");


test("analyzeRequest() reports a real dependency graph matching each capability's dependsOn", () => {

    const result = planner.analyzeRequest("build a trading division");

    assert.deepStrictEqual(result.dependencyGraph.nodes, [
        "market intelligence", "strategy analysis", "risk management", "portfolio tracking", "reporting"
    ]);

    assert.ok(result.dependencyGraph.edges.some(e => e.from === "strategy analysis" && e.to === "market intelligence"));
    assert.ok(result.dependencyGraph.edges.some(e => e.from === "reporting" && e.to === "portfolio tracking"));

});


test("analyzeRequest() reports domain-wide permissions and required agents/APIs for missing capabilities", () => {

    const result = planner.analyzeRequest("build a trading division");

    assert.deepStrictEqual(result.permissions, ["external_api", "financial_execution"]);
    assert.ok(result.requiredAgents.includes("Risk Analyst"));
    assert.ok(result.requiredAPIs.includes("market data API"));
    assert.ok(result.requiredAPIs.includes("broker API"));

});


test("analyzeRequest() computes a real risk assessment and a summed build-time estimate", () => {

    const result = planner.analyzeRequest("build a trading division");

    assert.strictEqual(result.riskAssessment.overall, "high"); // risk management is "high"
    assert.strictEqual(result.riskAssessment.byCapability["risk management"], "high");
    assert.strictEqual(result.riskAssessment.byCapability["market intelligence"], "low");

    const expectedDays = 3 + 5 + 4 + 3 + 2; // sum of every trading capability's estimatedDays (all missing in a clean env)
    assert.strictEqual(result.estimatedBuildDays, expectedDays);

});


test("analyzeRequest() with no domain match still returns every Phase 28 field, empty but present", () => {

    const result = planner.analyzeRequest("reorganize my sock drawer");

    assert.deepStrictEqual(result.permissions, []);
    assert.deepStrictEqual(result.requiredAgents, []);
    assert.deepStrictEqual(result.requiredAPIs, []);
    assert.deepStrictEqual(result.dependencyGraph, { nodes: [], edges: [] });
    assert.deepStrictEqual(result.riskAssessment, { overall: null, byCapability: {} });
    assert.strictEqual(result.estimatedBuildDays, 0);

});
