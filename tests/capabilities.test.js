const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-${process.pid}.json`);

// install_capability proposals/executions persist via memory.remember(),
// same backup/restore discipline as every other test touching this
// shared file.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-capabilities-${process.pid}.json`);

// The Phase 33 corruption-recovery test below triggers a real
// log.error() call, persisted to errors.log -- same backup/restore
// discipline as tests/credential-manager.test.js.
const ERROR_LOG_PATH = path.join(__dirname, "..", "core", "logging", "errors.log");
const ERROR_LOG_EXISTED_BEFORE = fs.existsSync(ERROR_LOG_PATH);
const ERROR_LOG_BACKUP = path.join(os.tmpdir(), `veronica-errors-log-backup-capabilities-${process.pid}.log`);

test.before(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    if(ERROR_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ERROR_LOG_PATH, ERROR_LOG_BACKUP);
    }
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
    if(ERROR_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ERROR_LOG_BACKUP, ERROR_LOG_PATH);
        fs.unlinkSync(ERROR_LOG_BACKUP);
    } else if(fs.existsSync(ERROR_LOG_PATH)){
        fs.unlinkSync(ERROR_LOG_PATH);
    }
});

const registry = require("../core/capabilities/registry");
const manifestModule = require("../core/capabilities/manifest");
const validator = require("../core/capabilities/validator");
const lifecycle = require("../core/capabilities/lifecycle");
const installer = require("../core/capabilities/installer");
const planner = require("../core/capabilities/planner");
const ActionProposalEngine = require("../core/executive/actionProposal");

const EXAMPLE_PACKAGE_DIR = path.join(__dirname, "..", "packages", "example");


test("registry recovers from a real corrupted state.json instead of crashing every loader (Phase 33)", () => {

    registry.register({ name: "test-cap-corrupt-xqzcorrupt1", version: "0.1.0", description: "test" });
    assert.ok(registry.isInstalled("test-cap-corrupt-xqzcorrupt1"));

    fs.writeFileSync(STATE_PATH, "{ this is not valid json {{{");

    let corruptBackupPath;

    try {

        // The corrupted install above is unrecoverable by design (that's
        // the whole point -- a corrupt file can't be trusted), but the
        // registry itself must come back up, seeded to defaults, not
        // throw and take every loader down with it.
        const capabilities = registry.list();

        assert.ok(capabilities.some(c => c.name === "memory" && c.core === true));
        assert.strictEqual(registry.isInstalled("test-cap-corrupt-xqzcorrupt1"), false);

        const dir = fs.readdirSync(path.dirname(STATE_PATH));
        const corruptBackupName = dir.find(name => name.startsWith("state.json.corrupt-"));
        assert.ok(corruptBackupName, "expected the corrupt file to be preserved for forensics");

        corruptBackupPath = path.join(path.dirname(STATE_PATH), corruptBackupName);
        assert.strictEqual(fs.readFileSync(corruptBackupPath, "utf8"), "{ this is not valid json {{{");

    } finally {
        if(corruptBackupPath && fs.existsSync(corruptBackupPath)){
            fs.unlinkSync(corruptBackupPath);
        }
    }

});


test("registry.list() is seeded with the real built-in capabilities, all core and active", () => {

    const capabilities = registry.list();
    const names = capabilities.map(c => c.name);

    for(const expected of ["memory", "knowledge", "agents", "executive", "automation", "dashboard", "github", "discord", "google"]){
        assert.ok(names.includes(expected), `expected built-in capability "${expected}"`);
    }

    for(const capability of capabilities){
        assert.strictEqual(capability.core, true);
        assert.strictEqual(capability.status, "active");
    }

});


test("registry.register() adds a new capability and rejects a duplicate name", () => {

    const entry = registry.register({ name: "test-cap-xqzcap1", version: "0.1.0", description: "test" });

    assert.strictEqual(entry.status, "installed");
    assert.strictEqual(entry.core, false);
    assert.ok(registry.isInstalled("test-cap-xqzcap1"));

    assert.throws(() => registry.register({ name: "test-cap-xqzcap1" }), /already registered/);

});


test("registry.setStatus() records history, and remove() refuses a core capability", () => {

    registry.register({ name: "test-cap-xqzcap2", version: "0.1.0", description: "test" });

    const updated = registry.setStatus("test-cap-xqzcap2", "active", "activated for test");
    assert.strictEqual(updated.status, "active");
    assert.strictEqual(updated.history[updated.history.length - 1].note, "activated for test");

    assert.throws(() => registry.remove("memory"), /built-in, not a package/);

    const removed = registry.remove("test-cap-xqzcap2");
    assert.strictEqual(removed.removed, "test-cap-xqzcap2");
    assert.strictEqual(registry.isInstalled("test-cap-xqzcap2"), false);

});


test("registry.snapshot()/restore() round-trips real state", () => {

    const before = registry.snapshot();

    registry.register({ name: "test-cap-xqzcap3", version: "0.1.0", description: "test" });
    assert.ok(registry.isInstalled("test-cap-xqzcap3"));

    registry.restore(before);
    assert.strictEqual(registry.isInstalled("test-cap-xqzcap3"), false);

});


test("manifest.loadManifest() reads the real example package manifest and normalizes defaults", () => {

    const manifest = manifestModule.loadManifest(EXAMPLE_PACKAGE_DIR);

    assert.strictEqual(manifest.name, "example");
    assert.strictEqual(manifest.agents.length, 1);
    assert.strictEqual(manifest.agents[0].name, "ExampleAgent");
    assert.strictEqual(manifest.tools[0].id, "example.ping");
    assert.strictEqual(manifest.approvalRequired, false);
    assert.deepStrictEqual(manifest.dependencies, []);

});


test("manifest.loadManifest() throws clearly for a missing manifest.json", () => {

    assert.throws(() => manifestModule.loadManifest(path.join(os.tmpdir(), "no-such-package-xqzcap4")), /No manifest\.json found/);

});


test("manifest.shapeErrors() reports every missing required field", () => {

    const errors = manifestModule.shapeErrors({});

    assert.ok(errors.some(e => e.includes("name")));
    assert.ok(errors.some(e => e.includes("version")));
    assert.ok(errors.some(e => e.includes("description")));

});


test("validator.validate() passes for the real example package", () => {

    const manifest = manifestModule.loadManifest(EXAMPLE_PACKAGE_DIR);
    const result = validator.validate(manifest, EXAMPLE_PACKAGE_DIR);

    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.valid, true);

});


test("validator.validate() catches a missing agent prompt file and a missing dependency", () => {

    const manifest = manifestModule.normalize({
        name: "test-cap-xqzcap5",
        version: "1.0.0",
        description: "test",
        agents: [{ name: "NoSuchAgentXQZCAP5" }],
        dependencies: ["not-a-real-dependency-xqzcap5"]
    });

    const result = validator.validate(manifest, EXAMPLE_PACKAGE_DIR);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("NoSuchAgentXQZCAP5")));
    assert.ok(result.errors.some(e => e.includes("not-a-real-dependency-xqzcap5")));

});


test("validator.validate() enforces a real dependency version floor (Phase 33), and still accepts a plain name-only dependency", () => {

    registry.register({ name: "test-cap-xqzver1", version: "1.0.0", description: "test" });

    const tooOld = manifestModule.normalize({
        name: "test-cap-xqzver2", version: "1.0.0", description: "test",
        dependencies: [{ name: "test-cap-xqzver1", minVersion: "2.0.0" }]
    });

    const tooOldResult = validator.validate(tooOld, EXAMPLE_PACKAGE_DIR);
    assert.strictEqual(tooOldResult.valid, false);
    assert.ok(tooOldResult.errors.some(e => e.includes("requires >= v2.0.0") && e.includes("v1.0.0 is installed")));

    const satisfied = manifestModule.normalize({
        name: "test-cap-xqzver3", version: "1.0.0", description: "test",
        dependencies: [{ name: "test-cap-xqzver1", minVersion: "1.0.0" }]
    });

    assert.strictEqual(validator.validate(satisfied, EXAMPLE_PACKAGE_DIR).valid, true);

    // A plain string dependency (no version constraint) still works
    // exactly as before this phase.
    const plainName = manifestModule.normalize({
        name: "test-cap-xqzver4", version: "1.0.0", description: "test",
        dependencies: ["test-cap-xqzver1"]
    });

    assert.strictEqual(validator.validate(plainName, EXAMPLE_PACKAGE_DIR).valid, true);

    // A core built-in ("version: core") never fails a version check --
    // there's no meaningful semver comparison against it.
    const dependsOnCore = manifestModule.normalize({
        name: "test-cap-xqzver5", version: "1.0.0", description: "test",
        dependencies: [{ name: "memory", minVersion: "99.0.0" }]
    });

    assert.strictEqual(validator.validate(dependsOnCore, EXAMPLE_PACKAGE_DIR).valid, true);

    registry.remove("test-cap-xqzver1");

});


test("lifecycle.transition() enforces legal state transitions only", () => {

    registry.register({ name: "test-cap-xqzcap6", version: "0.1.0", description: "test" });

    assert.throws(() => lifecycle.transition("test-cap-xqzcap6", "disabled"), /cannot go from "installed" to "disabled"/);

    lifecycle.activate("test-cap-xqzcap6");
    assert.strictEqual(registry.get("test-cap-xqzcap6").status, "active");

    lifecycle.disable("test-cap-xqzcap6");
    assert.strictEqual(registry.get("test-cap-xqzcap6").status, "disabled");

    lifecycle.activate("test-cap-xqzcap6"); // disabled -> active is legal
    assert.strictEqual(registry.get("test-cap-xqzcap6").status, "active");

    registry.remove("test-cap-xqzcap6");

});


test("installer.install() installs and activates the real example package end to end (no approval required)", () => {

    // Cleans up if a previous failed run left it registered.
    if(registry.isInstalled("example")){
        registry.remove("example");
    }

    const result = installer.install(EXAMPLE_PACKAGE_DIR);

    assert.strictEqual(result.pending, false);
    assert.strictEqual(result.capability.name, "example");
    assert.strictEqual(result.capability.status, "active");
    assert.strictEqual(result.capability.core, false);

    // The real tool handler actually works, proving this isn't a
    // fabricated registration -- require()d for real by healthCheck()
    // during install, and callable directly here.
    const handler = require(path.join(EXAMPLE_PACKAGE_DIR, "tools", "example.ping.js"));
    return handler["example.ping"]().then(pingResult => {
        assert.strictEqual(pingResult.pong, true);
    });

});


test("installer.install() refuses to install the same package twice, and refuses an invalid package", () => {

    assert.ok(registry.isInstalled("example")); // from the previous test

    assert.throws(() => installer.install(EXAMPLE_PACKAGE_DIR), /already installed/);

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-bad-package-xqzcap7-"));
    fs.writeFileSync(path.join(badDir, "manifest.json"), JSON.stringify({ name: "bad-xqzcap7" }));

    assert.throws(() => installer.install(badDir), /Cannot install "bad-xqzcap7"/);
    assert.strictEqual(registry.isInstalled("bad-xqzcap7"), false); // never registered

});


test("installer.upgrade() replaces an installed capability's version, rolling back on failure", () => {

    assert.ok(registry.isInstalled("example")); // from an earlier test in this file
    assert.strictEqual(registry.get("example").version, "1.0.0");

    const upgradeDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-example-upgrade-xqzcap10-"));
    fs.mkdirSync(path.join(upgradeDir, "agents"));
    fs.mkdirSync(path.join(upgradeDir, "tools"));
    fs.writeFileSync(path.join(upgradeDir, "manifest.json"), JSON.stringify({
        name: "example", version: "1.1.0", description: "upgraded test description"
    }));

    const upgraded = installer.upgrade("example", upgradeDir);

    assert.strictEqual(upgraded.version, "1.1.0");
    assert.strictEqual(upgraded.status, "active");

    // Wrong-name package refused outright, without touching the registry.
    const wrongNameDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-wrong-name-xqzcap10-"));
    fs.writeFileSync(path.join(wrongNameDir, "manifest.json"), JSON.stringify({
        name: "not-example-xqzcap10", version: "1.0.0", description: "test"
    }));
    assert.throws(() => installer.upgrade("example", wrongNameDir), /declares name "not-example-xqzcap10", not "example"/);
    assert.strictEqual(registry.get("example").version, "1.1.0"); // unchanged

    // A broken upgrade rolls back to the last-good version.
    const brokenUpgradeDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-example-broken-upgrade-xqzcap10-"));
    fs.mkdirSync(path.join(brokenUpgradeDir, "tools"));
    fs.writeFileSync(path.join(brokenUpgradeDir, "manifest.json"), JSON.stringify({
        name: "example", version: "2.0.0", description: "test", tools: [{ id: "broken.xqzcap10" }]
    }));
    fs.writeFileSync(path.join(brokenUpgradeDir, "tools", "broken.xqzcap10.js"), "not valid js {{{");

    assert.throws(() => installer.upgrade("example", brokenUpgradeDir), /Health check failed/);
    assert.strictEqual(registry.get("example").version, "1.1.0"); // rolled back, not lost

    assert.throws(() => installer.upgrade("memory", EXAMPLE_PACKAGE_DIR), /built-in, not a package/);

});


test("installer.install() creates a pending ActionProposal for an approvalRequired package, and only installs once approved", () => {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-approval-package-xqzcap8-"));
    fs.mkdirSync(path.join(dir, "agents"));
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
        name: "test-cap-xqzcap8",
        version: "1.0.0",
        description: "approval-gated test package",
        approvalRequired: true
    }));

    const result = installer.install(dir);

    assert.strictEqual(result.pending, true);
    assert.strictEqual(result.proposal.status, "pending");
    assert.strictEqual(result.proposal.action, "install_capability");
    assert.strictEqual(registry.isInstalled("test-cap-xqzcap8"), false);

    const engine = new ActionProposalEngine();
    engine.approve(result.proposal.id);

    return engine.executeExternal(result.proposal.id).then(executed => {
        assert.strictEqual(executed.status, "executed");
        assert.match(executed.executionOutcome, /Installed and activated capability "test-cap-xqzcap8"/);
        assert.strictEqual(registry.isInstalled("test-cap-xqzcap8"), true);
        assert.strictEqual(registry.get("test-cap-xqzcap8").status, "active");

        registry.remove("test-cap-xqzcap8");
    });

});


test("installer's health check catches a real syntax error in a package's own tool handler, and rolls back", () => {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-broken-package-xqzcap9-"));
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
        name: "test-cap-xqzcap9",
        version: "1.0.0",
        description: "broken test package",
        tools: [{ id: "broken.tool.xqzcap9" }]
    }));
    fs.writeFileSync(path.join(dir, "tools", "broken.tool.xqzcap9.js"), "this is not valid javascript {{{");

    assert.throws(() => installer.install(dir), /Health check failed/);
    assert.strictEqual(registry.isInstalled("test-cap-xqzcap9"), false); // rolled back

});


test("planner.analyzeRequest() detects a domain and reports missing capabilities", () => {

    const result = planner.analyzeRequest("VERONICA, create a trading division");

    assert.strictEqual(result.domain, "trading");
    assert.ok(result.requiredCapabilities.includes("risk management"));
    assert.ok(result.missingCapabilities.length > 0);
    assert.match(result.plan, /Missing capability detected/);

});


test("planner.analyzeRequest() reports no domain match for an unrelated objective, and requires an objective", () => {

    const result = planner.analyzeRequest("reorganize my sock drawer");

    assert.strictEqual(result.domain, null);
    assert.deepStrictEqual(result.missingCapabilities, []);

    assert.throws(() => planner.analyzeRequest(), /objective is required/);

});
