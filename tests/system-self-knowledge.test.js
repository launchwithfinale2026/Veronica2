const test = require("node:test");
const assert = require("node:assert");

// Phase 40 (Personal Operating System). Deliberately requires
// core/tools (not core/system/selfKnowledge.js directly) as the FIRST
// require in this file -- this is the exact real regression this test
// guards against: core/tools/handlers/system.js requires
// core/system/selfKnowledge.js, which requires
// core/executive/organizationOverview.js, which pulls in
// MissionEngine -> GoalDecomposer -> core/intelligence -> core/brain ->
// core/tools, closing a circular loop back to the exact file this test
// starts by requiring. If that lazy-require discipline (see
// core/tools/handlers/system.js's own comment) is ever accidentally
// undone, requiring core/tools here would throw or hang instead of
// quietly loading -- this test would be the first thing to catch it.
const tools = require("../core/tools");
const selfKnowledge = require("../core/system/selfKnowledge");


test("core/tools loads without a circular-require failure, and registers the real system.understand tool", () => {

    const toolIds = tools.list().map(t => t.id);
    assert.ok(toolIds.includes("system.understand"));

});


test("system.understand tool executes for real and returns every section OrganizationOverview.generate() produces", async () => {

    const result = await tools.run("system.understand", {}, { role: "executive" });

    for(const key of [
        "generatedAt", "organizationTree", "departmentHealth", "executiveKPIs",
        "crossDepartmentDependencies", "resourceAllocation", "capabilityMap",
        "missionStatus", "knowledgeGrowth", "memoriesOverview", "connectors",
        "executiveRecommendations", "automationStatus", "deviceNetwork",
        "approvalQueue", "liveSystemHealth"
    ]){
        assert.ok(key in result, `expected "${key}" in system.understand's real output`);
    }

    assert.ok(result.organizationTree.departments.length > 0);

});


test("selfKnowledge.understand() builds its own fresh, real departments/agents rather than requiring a host to inject them", () => {

    const result = selfKnowledge.understand();

    // 9 built-in + 6 from the real, active production capability
    // packages (Phase 35/41).
    assert.strictEqual(result.organizationTree.departments.length, 15);
    assert.ok(result.memoriesOverview.total >= 0);

});
