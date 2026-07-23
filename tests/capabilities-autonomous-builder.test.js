const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-autobuild-${process.pid}.json`);

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-autobuild-${process.pid}.json`);

test.before(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const autonomousBuilder = require("../core/capabilities/autonomousBuilder");


test("slugify()/pascalCase() derive sane, real identifiers from a free-text objective", () => {

    assert.strictEqual(autonomousBuilder.slugify("Build a Recruiting Department!"), "build-a-recruiting-department");
    assert.strictEqual(autonomousBuilder.pascalCase("Sourcing Specialist"), "SourcingSpecialist");

});


test("derivePackageSpec() uses the real capability catalog's required agent roles when the objective matches a known domain", () => {

    const analysis = require("../core/capabilities/planner").analyzeRequest("Build a recruiting department");
    const spec = autonomousBuilder.derivePackageSpec("Build a recruiting department", analysis);

    assert.strictEqual(spec.name, "build-a-recruiting-department");
    assert.strictEqual(spec.approvalRequired, true);
    assert.ok(spec.agents.some(a => a.role === "Sourcing Specialist"));
    assert.ok(spec.agents.some(a => a.role === "Recruiting Screener"));
    assert.strictEqual(spec.department.id, "build-a-recruiting-department-dept");

});


test("derivePackageSpec() falls back to a real, generic agent when no catalog domain matches", () => {

    const analysis = require("../core/capabilities/planner").analyzeRequest("do something nobody has a catalog entry for xqzautobuild1");
    const spec = autonomousBuilder.derivePackageSpec("do something nobody has a catalog entry for xqzautobuild1", analysis);

    assert.strictEqual(spec.agents.length, 1);
    assert.strictEqual(spec.agents[0].role, "General Agent");
    assert.strictEqual(spec.approvalRequired, true);

});


test("derivePackageSpec() declares its default review tool with a real, recognized shape and a valid permission (Phase 59)", () => {

    const analysis = require("../core/capabilities/planner").analyzeRequest("Build a recruiting department");
    const spec = autonomousBuilder.derivePackageSpec("Build a recruiting department", analysis);

    assert.strictEqual(spec.tools[0].shape, "department_health_review");
    // "read" was a real, previously-invalid permission string (fixed
    // this phase) -- identity/roles.json only defines "read_memory".
    assert.strictEqual(spec.tools[0].permission, "read_memory");

});


test("buildCapability() requires a real objective", () => {
    assert.throws(() => autonomousBuilder.buildCapability(), /objective is required/);
});


test("buildCapability() runs the real, full pipeline end to end: analyze -> generate -> validate -> pending approval, never installing/activating on its own", () => {

    const registry = require("../core/capabilities/registry");
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-autobuild-root-"));

    // buildCapability() itself always writes to the real packages/
    // directory via builder.buildPackage()'s default outputRoot -- this
    // test instead calls the same pieces buildCapability() composes,
    // pointed at a temp root, to verify the pipeline's real behavior
    // without touching the real packages/ directory. (A second test
    // below exercises the real default path exactly once, cleaned up
    // immediately after.)
    const builder = require("../core/capabilities/builder");
    const installer = require("../core/capabilities/installer");
    const planner = require("../core/capabilities/planner");

    const objective = "Build a recruiting department XQZAUTOBUILD2";
    const analysis = planner.analyzeRequest(objective);
    const spec = autonomousBuilder.derivePackageSpec(objective, analysis);
    spec.outputRoot = outputRoot;

    const generated = builder.buildPackage(spec);
    assert.ok(fs.existsSync(path.join(generated.packageDir, "manifest.json")));
    assert.ok(fs.existsSync(path.join(generated.packageDir, "department", "manager.js")));

    const install = installer.install(generated.packageDir);

    assert.strictEqual(install.pending, true, "an autonomously-built package must never self-install");
    assert.strictEqual(install.proposal.status, "pending");
    assert.strictEqual(registry.isInstalled(spec.name), false);

});


test("buildCapability() end to end against the real packages/ directory, cleaned up immediately after", () => {

    const registry = require("../core/capabilities/registry");
    const objective = "Handle xqzautobuild3 outreach tasks";

    const result = autonomousBuilder.buildCapability(objective);

    try {

        assert.strictEqual(result.objective, objective);
        assert.ok(result.generated.filesCreated.length > 0);
        assert.strictEqual(result.install.pending, true);
        assert.match(result.report, /pending approval proposal/);
        assert.strictEqual(registry.isInstalled(result.generated.name), false);

    } finally {
        fs.rmSync(result.generated.packageDir, { recursive: true, force: true });
    }

});


test("buildCapability()'s generated review tool is genuinely callable end to end, not a throwing skeleton (Phase 59)", () => {

    const objective = "Handle xqzautobuild4 outreach tasks";

    const result = autonomousBuilder.buildCapability(objective);

    try {

        const toolId = `${result.generated.name}.review`;
        const toolPath = path.join(result.generated.packageDir, "tools", `${toolId}.js`);
        const toolModule = require(toolPath);

        const output = toolModule[toolId]();

        assert.ok(output.department === `${result.generated.name}-dept` || output.message);

    } finally {
        fs.rmSync(result.generated.packageDir, { recursive: true, force: true });
    }

});
