const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Env-var-driven, no real state file -- save/restore every var this
// file touches so it can't leak into other test files (even though
// node --test runs each file in its own process, per package.json's
// test script, this is cheap insurance and matches this suite's own
// discipline elsewhere).
const TOUCHED_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN", "DISCORD_BOT_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
const ORIGINAL_VALUES = {};

// validateStartup() logs a real warn entry (persisted to
// core/logging/errors.log) per unconfigured connector -- same
// backup/restore discipline every other test touching this shared file
// already uses.
const ERROR_LOG_PATH = path.join(__dirname, "..", "core", "logging", "errors.log");
const ERROR_LOG_EXISTED_BEFORE = fs.existsSync(ERROR_LOG_PATH);
const ERROR_LOG_BACKUP = path.join(os.tmpdir(), `veronica-errors-log-backup-cred-${process.pid}.log`);

test.before(() => {
    for(const key of TOUCHED_VARS){
        ORIGINAL_VALUES[key] = process.env[key];
    }
    if(ERROR_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ERROR_LOG_PATH, ERROR_LOG_BACKUP);
    }
});

test.after(() => {
    for(const key of TOUCHED_VARS){
        if(ORIGINAL_VALUES[key] === undefined){
            delete process.env[key];
        } else {
            process.env[key] = ORIGINAL_VALUES[key];
        }
    }
    if(ERROR_LOG_EXISTED_BEFORE){
        fs.copyFileSync(ERROR_LOG_BACKUP, ERROR_LOG_PATH);
        fs.unlinkSync(ERROR_LOG_BACKUP);
    } else if(fs.existsSync(ERROR_LOG_PATH)){
        fs.unlinkSync(ERROR_LOG_PATH);
    }
});

const credentialManager = require("../core/integrations/credentialManager");


test("statusFor() reports a single missing variable by name, never a value", () => {

    delete process.env.GITHUB_TOKEN;

    const status = credentialManager.statusFor("github");

    assert.strictEqual(status.configured, false);
    assert.deepStrictEqual(status.missing, ["GITHUB_TOKEN"]);
    assert.ok(!("value" in status));
    assert.ok(JSON.stringify(status).indexOf("ghp_") === -1); // sanity: no token-shaped value ever appears

});


test("statusFor() reports configured: true once all required variables are set", () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzcred1";

    const status = credentialManager.statusFor("github");

    assert.strictEqual(status.configured, true);
    assert.deepStrictEqual(status.missing, []);

});


test("statusFor() reports EVERY missing variable for a multi-variable connector", () => {

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/callback";

    const status = credentialManager.statusFor("google");

    assert.strictEqual(status.configured, false);
    assert.deepStrictEqual(status.missing.sort(), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);

});


test("statusFor() throws for an unknown connector", () => {

    assert.throws(() => credentialManager.statusFor("not-a-real-connector"), /Unknown connector/);

});


test("isConfigured() matches statusFor().configured", () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzcred2";

    assert.strictEqual(credentialManager.isConfigured("discord"), true);

    delete process.env.DISCORD_BOT_TOKEN;

    assert.strictEqual(credentialManager.isConfigured("discord"), false);

});


test("overview() returns every known connector", () => {

    const overview = credentialManager.overview();

    const ids = overview.map(c => c.id).sort();

    assert.deepStrictEqual(ids, ["calendar", "claude", "cloudStorage", "discord", "discordWebhook", "email", "github", "google", "openai"]);

});


test("validateStartup() never throws regardless of how many credentials are missing, and returns the same shape as overview()", () => {

    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;

    let results;
    assert.doesNotThrow(() => { results = credentialManager.validateStartup(); });

    assert.strictEqual(results.length, 9);
    assert.ok(results.every(r => r.configured === false));

});
