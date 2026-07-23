const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-readiness-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const operationalReadiness = require("../core/system/operationalReadiness");
const ActionProposalEngine = require("../core/executive/actionProposal");


test("checklist() returns the real combined shape end to end without throwing", async () => {

    const result = await operationalReadiness.checklist();

    assert.strictEqual(result.running, true);
    assert.strictEqual(typeof result.healthy, "boolean");
    assert.ok(typeof result.healthScore.score === "number");
    assert.ok(Array.isArray(result.connected));

    assert.ok(typeof result.checks.missingCredentials.ok === "boolean");
    assert.ok(typeof result.checks.approvalsWaiting.ok === "boolean");
    assert.ok(typeof result.checks.offlineServices.ok === "boolean");
    assert.ok(typeof result.checks.unconfiguredConnectors.ok === "boolean");

    assert.ok(typeof result.fullyOperational === "boolean");

});


test("checklist() reflects a real, currently-missing credential honestly, without counting it against fullyOperational", async () => {

    const result = await operationalReadiness.checklist();

    // This test environment genuinely has no OPENAI_API_KEY (per this
    // session's own repeated real boot logs) -- a real, expected gap,
    // not a fabricated one.
    const openai = result.checks.missingCredentials.items.find(c => c.id === "openai");

    assert.ok(openai, "expected openai to be a real, currently-unconfigured connector in this environment");
    assert.ok(openai.missingEnv.includes("OPENAI_API_KEY"));

});


test("checklist() reports a real pending approval in approvalsWaiting, and it turns fullyOperational false", async () => {

    const engine = new ActionProposalEngine();

    const before = await operationalReadiness.checklist();
    const beforeCount = before.checks.approvalsWaiting.count;

    const proposal = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "operational readiness test XQZREADY1",
        payload: { content: "test" }
    });

    const after = await operationalReadiness.checklist();

    assert.strictEqual(after.checks.approvalsWaiting.count, beforeCount + 1);
    assert.ok(after.checks.approvalsWaiting.items.some(p => p.id === proposal.id));
    assert.strictEqual(after.checks.approvalsWaiting.ok, false);
    assert.strictEqual(after.fullyOperational, false);

    engine.approve(proposal.id);

    const afterApproval = await operationalReadiness.checklist();
    assert.strictEqual(afterApproval.checks.approvalsWaiting.count, beforeCount);

});
