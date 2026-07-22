const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// core/integrations/google/oauth.js persists real (in these tests,
// fake) tokens to tokens.json -- gitignored per-machine data, same
// backup/restore discipline as every other real file this suite
// touches.
const TOKEN_PATH = path.join(__dirname, "..", "core", "integrations", "google", "tokens.json");
const TOKEN_EXISTED_BEFORE = fs.existsSync(TOKEN_PATH);
const TOKEN_BACKUP = path.join(os.tmpdir(), `veronica-google-tokens-backup-${process.pid}.json`);

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
});

const http = require("../core/integrations/http");
const oauth = require("../core/integrations/google/oauth");
const gmail = require("../core/integrations/google/gmail");
const calendar = require("../core/integrations/google/calendar");
const drive = require("../core/integrations/google/drive");

function configureGoogle(){
    process.env.GOOGLE_CLIENT_ID = "fake-client-id-xqzg1";
    process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret-xqzg1";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/callback";
}


test("oauth.isConfigured()/isAuthorized() reflect env vars and token presence independently", () => {

    assert.strictEqual(oauth.isConfigured(), false);
    assert.strictEqual(oauth.isAuthorized(), false);

    configureGoogle();

    assert.strictEqual(oauth.isConfigured(), true);
    assert.strictEqual(oauth.isAuthorized(), false); // configured, but no human consent yet

});


test("oauth.getAuthUrl() fails closed without configuration, and builds a real Google consent URL once configured", () => {

    assert.throws(() => oauth.getAuthUrl(), /not configured/);

    configureGoogle();

    const url = oauth.getAuthUrl();

    assert.match(url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    assert.match(url, /client_id=fake-client-id-xqzg1/);
    assert.match(url, /redirect_uri=/);
    assert.match(url, /access_type=offline/);

});


test("oauth.exchangeCode() posts to Google's token endpoint and persists the real response shape", async () => {

    configureGoogle();

    const originalRequest = http.request;
    let capturedUrl, capturedBody;

    http.request = async (url, options) => {
        capturedUrl = url;
        capturedBody = options.body;
        return { status: 200, headers: {}, body: JSON.stringify({ access_token: "fake-access-xqzg2", refresh_token: "fake-refresh-xqzg2", expires_in: 3600 }) };
    };

    try {

        const tokens = await oauth.exchangeCode("fake-auth-code-xqzg2");

        assert.strictEqual(tokens.access_token, "fake-access-xqzg2");
        assert.strictEqual(capturedUrl, "https://oauth2.googleapis.com/token");
        assert.match(capturedBody, /code=fake-auth-code-xqzg2/);
        assert.match(capturedBody, /grant_type=authorization_code/);

        assert.strictEqual(oauth.isAuthorized(), true);

    } finally {
        http.request = originalRequest;
    }

});


test("oauth.getAccessToken() refreshes automatically once the stored token has expired", async () => {

    configureGoogle();

    const originalRequest = http.request;

    // First: obtain an already-expired token (expires_in: 0).
    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "expired-xqzg3", refresh_token: "refresh-xqzg3", expires_in: 0 }) });

    try {

        await oauth.exchangeCode("fake-code-xqzg3");

        // Now: a fresh call should trigger a refresh, returning a new token.
        http.request = async (url, options) => {
            assert.match(options.body, /grant_type=refresh_token/);
            assert.match(options.body, /refresh_token=refresh-xqzg3/);
            return { status: 200, headers: {}, body: JSON.stringify({ access_token: "refreshed-xqzg3", expires_in: 3600 }) };
        };

        const accessToken = await oauth.getAccessToken();

        assert.strictEqual(accessToken, "refreshed-xqzg3");

    } finally {
        http.request = originalRequest;
    }

});


test("oauth.refreshAccessToken() throws clearly when no refresh token exists yet", async () => {

    configureGoogle();

    await assert.rejects(() => oauth.refreshAccessToken(), /No refresh token available/);

});


test("oauth.status() reports the three distinct states: not configured, configured-not-authorized, connected", async () => {

    assert.strictEqual(oauth.status().configured, false);

    configureGoogle();
    assert.strictEqual(oauth.status().authorized, false);
    assert.match(oauth.status().note, /not yet authorized/);

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "a", refresh_token: "b", expires_in: 3600 }) });

    try {
        await oauth.exchangeCode("code-xqzg4");
        assert.strictEqual(oauth.status().note, "Connected.");
    } finally {
        http.request = originalRequest;
    }

});


test("gmail.listMessages()/getMessage() authenticate with the real access token via oauth.getAccessToken()", async () => {

    configureGoogle();

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "gmail-token-xqzg5", refresh_token: "r", expires_in: 3600 }) });

    try {
        await oauth.exchangeCode("code-xqzg5");
    } finally {
        http.request = originalRequest;
    }

    let capturedHeaders;

    http.request = async (url, options) => {
        capturedHeaders = options.headers;
        return { status: 200, headers: {}, body: JSON.stringify({ messages: [{ id: "m1" }] }) };
    };

    try {

        const result = await gmail.listMessages({ maxResults: 5 });

        assert.deepStrictEqual(result.messages, [{ id: "m1" }]);
        assert.strictEqual(capturedHeaders.Authorization, "Bearer gmail-token-xqzg5");

    } finally {
        http.request = originalRequest;
    }

    await assert.rejects(() => gmail.getMessage(), /A message id is required/);

});


test("calendar.listEvents() defaults timeMin to now and surfaces real Calendar API errors", async () => {

    configureGoogle();

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "cal-token-xqzg6", refresh_token: "r", expires_in: 3600 }) });
    try {
        await oauth.exchangeCode("code-xqzg6");
    } finally {
        http.request = originalRequest;
    }

    http.request = async (url) => {
        assert.match(url, /timeMin=/);
        return { status: 403, headers: {}, body: "Forbidden" };
    };

    try {
        await assert.rejects(() => calendar.listEvents(), /Google Calendar API error 403/);
    } finally {
        http.request = originalRequest;
    }

});


test("drive.listFiles()/getFileMetadata() build real Drive API requests", async () => {

    configureGoogle();

    const originalRequest = http.request;
    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "drive-token-xqzg7", refresh_token: "r", expires_in: 3600 }) });
    try {
        await oauth.exchangeCode("code-xqzg7");
    } finally {
        http.request = originalRequest;
    }

    http.request = async url => {
        assert.match(url, /\/files\?/);
        return { status: 200, headers: {}, body: JSON.stringify({ files: [{ id: "f1", name: "doc.txt" }] }) };
    };

    try {

        const result = await drive.listFiles({ q: "'folder123' in parents" });
        assert.strictEqual(result.files[0].name, "doc.txt");

    } finally {
        http.request = originalRequest;
    }

    await assert.rejects(() => drive.getFileMetadata(), /A fileId is required/);

});
