const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-report-${process.pid}.json`);

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

test.afterEach(() => {
    delete process.env.GITHUB_TOKEN;
});

const registry = require("../core/capabilities/registry");
const report = require("../core/system/report");


test("generate() reports real built-in capabilities under whatExists", () => {

    const result = report.generate();

    assert.ok(result.generatedAt);
    assert.ok(result.whatExists.capabilities.some(c => c.name === "memory" && c.core === true));
    assert.ok(Array.isArray(result.whatExists.integrations.integrations));
    assert.strictEqual(typeof result.whatExists.integrations.total, "number");

});


test("whatIsMissing() reflects real credential state -- GitHub appears unconfigured, then disappears once set", () => {

    delete process.env.GITHUB_TOKEN;
    const before = report.whatIsMissing();
    assert.ok(before.some(c => c.id === "github"));

    process.env.GITHUB_TOKEN = "fake-token-xqzsysrep1";
    const after = report.whatIsMissing();
    assert.ok(!after.some(c => c.id === "github"));

});


test("whatNeedsImprovement() reports capabilities in error/disabled status, real transitions only", () => {

    registry.register({ name: "test-cap-xqzsysrep2", version: "0.1.0", description: "test" });
    registry.setStatus("test-cap-xqzsysrep2", "error", "simulated failure");

    const result = report.whatNeedsImprovement();

    assert.ok(result.capabilitiesInError.some(c => c.name === "test-cap-xqzsysrep2"));
    assert.deepStrictEqual(result.capabilitiesDisabled.filter(c => c.name === "test-cap-xqzsysrep2"), []);

    registry.remove("test-cap-xqzsysrep2");

});
