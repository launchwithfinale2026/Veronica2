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


test("analyzeRequest() reports domain-wide permissions (always) and required agents/APIs scoped to what's genuinely still missing", () => {

    const result = planner.analyzeRequest("build a trading division");

    // Domain-wide permissions come from the catalog entry directly, not
    // from missingCapabilities -- always the same regardless of what's
    // installed.
    assert.deepStrictEqual(result.permissions, ["external_api", "financial_execution"]);

    // The real "trading-research" package (Phase 35/41) is now genuinely
    // installed, with a real description that happens to contain the
    // exact phrase "market intelligence" -- so isCapabilityPresent()
    // correctly excludes it from missingCapabilities now. "Risk Analyst"/
    // "broker API" are tied to capabilities ("risk management"/
    // "portfolio tracking") whose real installed description does NOT
    // contain those exact phrases, so they're still genuinely missing.
    assert.ok(result.requiredAgents.includes("Risk Analyst"));
    assert.ok(result.requiredAPIs.includes("broker API"));
    assert.ok(!result.missingCapabilities.includes("market intelligence"));

});


test("analyzeRequest() computes a real risk assessment and a summed build-time estimate over what's genuinely still missing", () => {

    const result = planner.analyzeRequest("build a trading division");

    assert.strictEqual(result.riskAssessment.overall, "high"); // risk management is "high"
    assert.strictEqual(result.riskAssessment.byCapability["risk management"], "high");
    // "market intelligence" no longer appears in byCapability at all --
    // it's not missing anymore (see the test above), so there's nothing
    // to assess a risk for.
    assert.strictEqual(result.riskAssessment.byCapability["market intelligence"], undefined);

    // Sum of only the capabilities genuinely still missing (strategy
    // analysis/risk management/portfolio tracking/reporting) -- "market
    // intelligence"'s 3 days are excluded now that a real package
    // covers it.
    const expectedDays = 5 + 4 + 3 + 2;
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
