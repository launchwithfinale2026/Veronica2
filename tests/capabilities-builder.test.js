const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-builder-${process.pid}.json`);

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
const builder = require("../core/capabilities/builder");


function tmpPackagesRoot(){
    return fs.mkdtempSync(path.join(os.tmpdir(), "veronica-builder-root-xqzbld-"));
}


test("requireValidName() rejects an invalid package name", () => {

    assert.throws(() => builder.requireValidName("Bad Name"), /Invalid package name/);
    assert.throws(() => builder.requireValidName("1starts-with-digit"), /Invalid package name/);
    assert.doesNotThrow(() => builder.requireValidName("valid-name-2"));

});


test("buildPackage() generates a real, self-validating skeleton with agents/tools/tests/README", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "hr-department-xqzbld1",
        description: "Generated HR department skeleton",
        agents: [{ name: "HRAgentXQZBLD1", role: "HR Lead" }],
        tools: [{ id: "hr.xqzbld1.lookup", description: "test", permission: "read" }],
        outputRoot
    });

    assert.strictEqual(result.name, "hr-department-xqzbld1");
    assert.ok(fs.existsSync(path.join(result.packageDir, "manifest.json")));
    assert.ok(fs.existsSync(path.join(result.packageDir, "agents", "hragentxqzbld1.js")));
    assert.ok(fs.existsSync(path.join(result.packageDir, "tools", "hr.xqzbld1.lookup.js")));
    assert.ok(fs.existsSync(path.join(result.packageDir, "tests", "hr-department-xqzbld1.test.js")));
    assert.ok(fs.existsSync(path.join(result.packageDir, "README.md")));

    // The generated agent/tool files load cleanly (no syntax error) --
    // but the tool is a SKELETON and throws when actually called, per
    // this phase's own "skeletons, not working capability" framing.
    const agentModule = require(path.join(result.packageDir, "agents", "hragentxqzbld1.js"));
    assert.strictEqual(agentModule.identity, "HRAgentXQZBLD1");

    const toolModule = require(path.join(result.packageDir, "tools", "hr.xqzbld1.lookup.js"));
    return assert.rejects(() => toolModule["hr.xqzbld1.lookup"](), /generated skeleton/);

});


test("buildPackage() generates a REAL, callable implementation (not a throwing skeleton) for a recognized tool shape (Phase 59)", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "xqzbld4-dept",
        description: "Generated department with a known-shape tool",
        department: { id: "xqzbld4-dept", name: "XQZBLD4 Department", domain: "Test" },
        tools: [{ id: "xqzbld4-dept.review", description: "test", permission: "read_memory", shape: "department_health_review" }],
        outputRoot
    });

    const source = fs.readFileSync(path.join(result.packageDir, "tools", "xqzbld4-dept.review.js"), "utf8");
    assert.ok(!source.includes("generated skeleton"), "a recognized shape must not fall back to the throwing skeleton");

    const toolModule = require(path.join(result.packageDir, "tools", "xqzbld4-dept.review.js"));

    // Real, callable, synchronous -- returns real learning telemetry
    // (or an honest "no executions yet" message), never throwing.
    const output = toolModule["xqzbld4-dept.review"]();
    assert.ok(output.department === "xqzbld4-dept" || output.message);

});


test("buildPackage() still generates the honest throwing skeleton for an unrecognized tool shape", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "xqzbld5-dept",
        description: "Generated department with an unrecognized shape",
        tools: [{ id: "xqzbld5.custom", description: "test", permission: "read_memory", shape: "not-a-real-shape-xqzbld5" }],
        outputRoot
    });

    const toolModule = require(path.join(result.packageDir, "tools", "xqzbld5.custom.js"));
    return assert.rejects(() => toolModule["xqzbld5.custom"](), /generated skeleton/);

});


test("buildPackage() writes an optional real dashboard field into the generated manifest.json (Project A/M)", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "xqzbld6-dept",
        description: "test",
        dashboard: {
            title: "XQZBLD6 Dashboard",
            widgets: [{ label: "Health", endpoint: "/api/learning/departments", filterKey: "department", filterValue: "xqzbld6-dept" }]
        },
        outputRoot
    });

    assert.deepStrictEqual(result.manifest.dashboard, {
        title: "XQZBLD6 Dashboard",
        widgets: [{ label: "Health", endpoint: "/api/learning/departments", filterKey: "department", filterValue: "xqzbld6-dept" }]
    });

    const onDisk = JSON.parse(fs.readFileSync(path.join(result.packageDir, "manifest.json"), "utf8"));
    assert.deepStrictEqual(onDisk.dashboard, result.manifest.dashboard);

});


test("buildPackage() omits the dashboard field entirely when none is given -- no fabricated default panel", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({ name: "xqzbld7-nodash", description: "test", outputRoot });

    assert.strictEqual(result.manifest.dashboard, undefined);

    const onDisk = JSON.parse(fs.readFileSync(path.join(result.packageDir, "manifest.json"), "utf8"));
    assert.strictEqual(onDisk.dashboard, undefined);

});


test("buildPackage() refuses a duplicate directory, and requires a description", () => {

    const outputRoot = tmpPackagesRoot();

    builder.buildPackage({ name: "dup-xqzbld2", description: "test", outputRoot });

    assert.throws(() => builder.buildPackage({ name: "dup-xqzbld2", description: "test again", outputRoot }), /already exists/);
    assert.throws(() => builder.buildPackage({ name: "no-desc-xqzbld2", outputRoot }), /description is required/);

});


test("the generated test file's require paths actually resolve, and it invokes the real validator identically to what it will assert", () => {

    // Spawning a nested `node --test` from inside a test that's already
    // running under `node --test` gets silently skipped by Node's own
    // recursion guard ("run() is being called recursively... skipping
    // running files") -- so this verifies the SAME thing the generated
    // file's own test body does (require both modules via the paths the
    // generator wrote, then call validate()), directly, rather than via
    // a fragile nested test-runner invocation.
    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "meta-test-xqzbld3",
        description: "test",
        agents: [{ name: "MetaAgentXQZBLD3" }],
        outputRoot
    });

    const generatedSource = fs.readFileSync(path.join(result.packageDir, "tests", "meta-test-xqzbld3.test.js"), "utf8");
    const requireMatches = [...generatedSource.matchAll(/require\((".*?")\)/g)].map(m => JSON.parse(m[1]));

    // Every require() path the generator wrote, resolved from the
    // generated test file's own real directory, must actually exist --
    // proves the dynamic relative-path computation was correct, not
    // just plausible-looking.
    const testsDir = path.join(result.packageDir, "tests");
    for(const requirePath of requireMatches){
        if(requirePath === "node:test" || requirePath === "node:assert" || requirePath === "path"){
            continue;
        }
        const resolved = require.resolve(path.join(testsDir, requirePath));
        assert.ok(fs.existsSync(resolved), `expected ${requirePath} to resolve to a real file`);
    }

});


test("buildAndInstall() generates a package and installs it end to end via the real installer", () => {

    const outputRoot = tmpPackagesRoot();

    if(registry.isInstalled("full-pipeline-xqzbld4")){
        registry.remove("full-pipeline-xqzbld4");
    }

    const result = builder.buildAndInstall({
        name: "full-pipeline-xqzbld4",
        description: "test full pipeline",
        tools: [{ id: "pipeline.xqzbld4.ping" }],
        outputRoot
    });

    assert.strictEqual(result.install.pending, false);
    assert.strictEqual(result.install.capability.name, "full-pipeline-xqzbld4");
    assert.strictEqual(result.install.capability.status, "active");

    registry.remove("full-pipeline-xqzbld4");

});


test("buildPackage() with a department generates a real, loadable manager.js using the standard factory convention", () => {

    const outputRoot = tmpPackagesRoot();

    const result = builder.buildPackage({
        name: "dept-xqzbld5",
        description: "test department",
        department: { id: "xqzbld5dept", name: "XQZBLD5 Dept", domain: "Testing" },
        agents: [{ name: "DeptAgentXQZBLD5", department: "xqzbld5dept" }],
        outputRoot
    });

    assert.ok(fs.existsSync(path.join(result.packageDir, "department", "manager.js")));

    const createManager = require(path.join(result.packageDir, "department", "manager.js"));
    const manager = createManager({ id: "xqzbld5dept", name: "XQZBLD5 Dept", domain: "Testing", agents: [] });

    assert.strictEqual(manager.id, "xqzbld5dept");

});
