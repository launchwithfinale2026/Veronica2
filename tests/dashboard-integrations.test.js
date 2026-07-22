const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// GET /api/integrations/google/callback exercises the real
// oauth.exchangeCode(), which persists to tokens.json -- gitignored
// per-machine data, same backup/restore discipline as
// tests/integrations-google.test.js.
const TOKEN_PATH = path.join(__dirname, "..", "core", "integrations", "google", "tokens.json");
const TOKEN_EXISTED_BEFORE = fs.existsSync(TOKEN_PATH);
const TOKEN_BACKUP = path.join(os.tmpdir(), `veronica-google-tokens-backup-dashboard-${process.pid}.json`);

// Requiring dashboard/backend/server.js pulls in core/automation, whose
// module load writes real state to core/automation/state.json (see
// tests/dashboard.test.js's own comment on this exact behavior).
const AUTOMATION_STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const AUTOMATION_STATE_EXISTED_BEFORE = fs.existsSync(AUTOMATION_STATE_PATH);
const AUTOMATION_STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-dashint-${process.pid}.json`);

if(AUTOMATION_STATE_EXISTED_BEFORE){
    fs.copyFileSync(AUTOMATION_STATE_PATH, AUTOMATION_STATE_BACKUP);
}

test.before(() => {
    if(TOKEN_EXISTED_BEFORE){
        fs.copyFileSync(TOKEN_PATH, TOKEN_BACKUP);
    }
});

test.afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    if(fs.existsSync(TOKEN_PATH)){
        fs.unlinkSync(TOKEN_PATH);
    }
});

test.after(() => {

    if(TOKEN_EXISTED_BEFORE){
        fs.copyFileSync(TOKEN_BACKUP, TOKEN_PATH);
        fs.unlinkSync(TOKEN_BACKUP);
    } else if(fs.existsSync(TOKEN_PATH)){
        fs.unlinkSync(TOKEN_PATH);
    }

    if(AUTOMATION_STATE_EXISTED_BEFORE){
        fs.copyFileSync(AUTOMATION_STATE_BACKUP, AUTOMATION_STATE_PATH);
        fs.unlinkSync(AUTOMATION_STATE_BACKUP);
    } else if(fs.existsSync(AUTOMATION_STATE_PATH)){
        fs.unlinkSync(AUTOMATION_STATE_PATH);
    }

});

const httpConnector = require("../core/integrations/http");
const { createServer } = require("../dashboard/backend/server");

let server;
let baseUrl;

test.before(async () => {

    server = createServer();

    await new Promise(resolve => {
        server.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

});

test.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});


test("GET /api/integrations includes discordBot and google alongside every other connector", async () => {

    const res = await fetch(`${baseUrl}/api/integrations`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);

    const ids = body.integrations.map(i => i.id).sort();
    assert.ok(ids.includes("discordBot"));
    assert.ok(ids.includes("google"));

});


test("GET /api/integrations/discord-bot/status reports real, unconfigured-by-default status", async () => {

    const res = await fetch(`${baseUrl}/api/integrations/discord-bot/status`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.id, "discordBot");
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.connected, false);

});


test("GET /api/integrations/google/auth-url fails closed (500) without Google configured", async () => {

    const res = await fetch(`${baseUrl}/api/integrations/google/auth-url`);
    const body = await res.json();

    assert.strictEqual(res.status, 500);
    assert.match(body.error, /not configured/);

});


test("GET /api/integrations/google/auth-url returns a real Google consent URL once configured", async () => {

    process.env.GOOGLE_CLIENT_ID = "fake-client-xqzdash1";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret-xqzdash1";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/callback";

    const res = await fetch(`${baseUrl}/api/integrations/google/auth-url`);
    const body = await res.json();

    assert.strictEqual(res.status, 200);
    assert.match(body.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    assert.match(body.url, /client_id=fake-client-xqzdash1/);

});


test("GET /api/integrations/google/callback requires a code, and completes the real exchange once given one", async () => {

    process.env.GOOGLE_CLIENT_ID = "fake-client-xqzdash2";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret-xqzdash2";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/callback";

    const missing = await fetch(`${baseUrl}/api/integrations/google/callback`);
    assert.strictEqual(missing.status, 400);

    const originalRequest = httpConnector.request;

    httpConnector.request = async () => ({
        status: 200,
        headers: {},
        body: JSON.stringify({ access_token: "a-xqzdash2", refresh_token: "b-xqzdash2", expires_in: 3600 })
    });

    try {

        const res = await fetch(`${baseUrl}/api/integrations/google/callback?code=fake-code-xqzdash2`);
        const body = await res.json();

        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.authorized, true);
        assert.ok(body.obtainedAt);

    } finally {
        httpConnector.request = originalRequest;
    }

});
