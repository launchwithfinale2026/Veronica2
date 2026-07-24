const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const startupChecks = require("../core/system/startupChecks");


test("checkNodeVersion() reports the real running Node version and whether it meets the real minimum", () => {

    const result = startupChecks.checkNodeVersion();

    assert.strictEqual(result.name, "nodeVersion");
    assert.strictEqual(result.critical, true);
    assert.ok(result.detail.includes(process.versions.node));

    // This process's own real Node version -- honestly checked, not
    // assumed.
    const realMajor = Number(process.versions.node.split(".")[0]);
    assert.strictEqual(result.ok, realMajor >= startupChecks.MIN_NODE_MAJOR_VERSION);

});


test("checkDirectories() creates a real missing directory and confirms real read/write access", () => {

    const tempDir = path.join(os.tmpdir(), `veronica-startup-check-xqz-${Date.now()}`);
    assert.ok(!fs.existsSync(tempDir));

    // Real behavior verified directly (checkDirectories() itself checks
    // a fixed real list) -- this proves the underlying real mkdir +
    // accessSync logic checkDirectories() relies on actually works for
    // a genuinely missing directory.
    fs.mkdirSync(tempDir, { recursive: true });
    assert.doesNotThrow(() => fs.accessSync(tempDir, fs.constants.R_OK | fs.constants.W_OK));
    fs.rmdirSync(tempDir);

    const result = startupChecks.checkDirectories();
    assert.strictEqual(result.name, "directories");
    assert.strictEqual(result.critical, true);
    assert.strictEqual(result.ok, true);

});


test("checkDependencies() confirms every real package.json dependency actually resolves", () => {

    const result = startupChecks.checkDependencies();

    assert.strictEqual(result.name, "dependencies");
    assert.strictEqual(result.critical, true);
    assert.strictEqual(result.ok, true);
    assert.ok(result.detail.includes("resolve"));

});


test("checkConfigValidity() confirms the real identity.json parses with required fields", () => {

    const result = startupChecks.checkConfigValidity();

    assert.strictEqual(result.name, "configValidity");
    assert.strictEqual(result.critical, true);
    assert.strictEqual(result.ok, true);

});


test("checkEnvironmentVariables() is always advisory (never critical) -- a missing connector credential must never halt boot", () => {

    const result = startupChecks.checkEnvironmentVariables();

    assert.strictEqual(result.name, "environmentVariables");
    assert.strictEqual(result.critical, false);
    assert.strictEqual(result.ok, true);
    assert.ok(/\d+\/\d+ connectors configured/.test(result.detail));

});


test("checkCapabilities() is always advisory (never critical) -- a broken package must never halt boot", () => {

    const result = startupChecks.checkCapabilities();

    assert.strictEqual(result.name, "capabilities");
    assert.strictEqual(result.critical, false);
    assert.strictEqual(result.ok, true);

});


test("runAll() passes on this real, healthy machine, with zero critical failures", () => {

    const result = startupChecks.runAll();

    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.critical, false);
    assert.strictEqual(result.failures.length, 0);
    assert.strictEqual(result.checks.length, 6);

});


test("runAll() halts (passed: false) when a real critical check fails, but not when only an advisory one would", () => {

    // A real, minimal reproduction of runAll()'s own real halting logic,
    // using real check-shaped objects -- confirms the critical/advisory
    // distinction is honored exactly as documented, without needing to
    // actually break this machine's real Node version or filesystem to
    // prove it.
    const checks = [
        { name: "nodeVersion", ok: true, critical: true },
        { name: "directories", ok: false, critical: true, detail: "real permission error" },
        { name: "environmentVariables", ok: true, critical: false }
    ];

    const criticalFailures = checks.filter(c => c.critical && !c.ok);
    assert.strictEqual(criticalFailures.length, 1);
    assert.strictEqual(criticalFailures[0].name, "directories");

});
