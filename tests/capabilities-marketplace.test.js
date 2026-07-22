const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-marketplace-${process.pid}.json`);

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
const marketplace = require("../core/capabilities/marketplace");

const EXAMPLE_PACKAGE_DIR = path.join(__dirname, "..", "packages", "example");


test("compareVersions() orders numerically, not lexicographically", () => {

    assert.ok(marketplace.compareVersions("1.10.0", "1.9.0") > 0);
    assert.ok(marketplace.compareVersions("1.2.0", "1.10.0") < 0);
    assert.strictEqual(marketplace.compareVersions("2.0.0", "2.0.0"), 0);

});


test("directorySize() reports a real, positive byte count for a real directory", () => {

    const size = marketplace.directorySize(EXAMPLE_PACKAGE_DIR);
    assert.ok(size > 0);

});


test("listAvailable() finds the real example package before it's installed", () => {

    if(registry.isInstalled("example")){
        registry.remove("example");
    }

    const available = marketplace.listAvailable();
    const found = available.find(pkg => pkg.name === "example");

    assert.ok(found, "expected the real packages/example/ to be discoverable");
    assert.strictEqual(found.source, EXAMPLE_PACKAGE_DIR);

});


test("categorize() moves a package from available to installed once registered, and reports it broken once in error", () => {

    if(registry.isInstalled("example")){
        registry.remove("example");
    }

    const before = marketplace.categorize();
    assert.ok(before.available.some(pkg => pkg.name === "example"));
    assert.ok(!before.installed.some(pkg => pkg.name === "example"));

    const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLE_PACKAGE_DIR, "manifest.json"), "utf8"));
    registry.register({ name: "example", version: manifest.version, description: manifest.description, status: "installed", source: EXAMPLE_PACKAGE_DIR, manifest });
    registry.setStatus("example", "active");

    const after = marketplace.categorize();
    assert.ok(!after.available.some(pkg => pkg.name === "example"));

    const installedEntry = after.installed.find(pkg => pkg.name === "example");
    assert.ok(installedEntry);
    assert.strictEqual(installedEntry.version, "1.0.0");
    assert.ok(installedEntry.installSizeBytes > 0);
    assert.deepStrictEqual(installedEntry.dependencies, []);

    registry.setStatus("example", "error", "simulated failure");
    const errored = marketplace.categorize();
    assert.ok(errored.broken.some(pkg => pkg.name === "example"));
    assert.ok(!errored.installed.some(pkg => pkg.name === "example"));

    registry.remove("example");

});


test("categorize() reports experimental/deprecated flags and a real update-available detection", () => {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-marketplace-pkg-xqzmkt1-"));
    const manifest = { name: "test-marketplace-xqzmkt1", version: "1.0.0", description: "test", experimental: true };
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));

    registry.register({ name: manifest.name, version: manifest.version, description: manifest.description, status: "installed", source: dir, manifest });
    registry.setStatus(manifest.name, "active");

    let categorized = marketplace.categorize();
    assert.ok(categorized.experimental.some(pkg => pkg.name === manifest.name));
    assert.ok(!categorized.updatesAvailable.some(pkg => pkg.name === manifest.name));

    // Simulate a newer manifest dropped on disk without an upgrade yet --
    // updateAvailable/onDiskVersion always re-read the real file on disk,
    // but "deprecated"/"experimental"/etc. reflect what was actually
    // installed (entry.manifest, captured at register() time), not a
    // not-yet-upgraded on-disk file -- same reasoning credentialManager
    // never trusts stale cached values.
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, version: "1.1.0" }));

    categorized = marketplace.categorize();
    const updated = categorized.updatesAvailable.find(pkg => pkg.name === manifest.name);
    assert.ok(updated, "expected a real update-available detection");
    assert.strictEqual(updated.onDiskVersion, "1.1.0");

    registry.remove(manifest.name);

});


test("categorize() reports a deprecated package from its actually-installed manifest", () => {

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-marketplace-pkg-xqzmkt2-"));
    const manifest = { name: "test-marketplace-xqzmkt2", version: "1.0.0", description: "test", deprecated: true };
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));

    registry.register({ name: manifest.name, version: manifest.version, description: manifest.description, status: "installed", source: dir, manifest });
    registry.setStatus(manifest.name, "active");

    const categorized = marketplace.categorize();
    assert.ok(categorized.deprecated.some(pkg => pkg.name === manifest.name));

    registry.remove(manifest.name);

});


test("search() matches by name and description across installed and available packages", () => {

    if(registry.isInstalled("example")){
        registry.remove("example");
    }

    const results = marketplace.search("reference");
    assert.ok(results.some(pkg => pkg.name === "example"));

    assert.throws(() => marketplace.search(), /query is required/);

});
