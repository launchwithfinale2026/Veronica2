const test = require("node:test");
const assert = require("node:assert");

// These connectors read env vars fresh on every call (isConfigured()/the
// gate inside each real method), same convention as
// core/integrations/http.js's SERVICE_ALLOWLIST -- so tests can set/clear
// them per test without needing a backup/restore of any on-disk state.
// Node's test runner runs each *.test.js file in its own process (see
// package.json's test script), so these env var mutations can't leak
// into other test files either way.

test.afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.SERVICE_ALLOWLIST;
});

const http = require("../core/integrations/http");
const github = require("../core/integrations/github");
const discord = require("../core/integrations/discord");
const calendar = require("../core/integrations/calendar");
const email = require("../core/integrations/email");
const cloudStorage = require("../core/integrations/cloudStorage");
const registry = require("../core/integrations/registry");


test("github connector fails closed without GITHUB_TOKEN", async () => {

    assert.strictEqual(github.isConfigured(), false);

    await assert.rejects(() => github.getRepo("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.listIssues("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.createIssue("octocat", "hello-world", { title: "x" }), /not configured/);

});


test("github connector calls the real request() with a bearer token once configured, and parses a successful response", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzgh1";

    assert.strictEqual(github.isConfigured(), true);

    const originalRequest = http.request;
    let capturedUrl, capturedOptions;

    http.request = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return { status: 200, headers: {}, body: JSON.stringify({ full_name: "octocat/hello-world" }) };
    };

    try {

        const repo = await github.getRepo("octocat", "hello-world");

        assert.strictEqual(repo.full_name, "octocat/hello-world");
        assert.strictEqual(capturedUrl, "https://api.github.com/repos/octocat/hello-world");
        assert.strictEqual(capturedOptions.headers.Authorization, "Bearer fake-token-xqzgh1");

    } finally {
        http.request = originalRequest;
    }

});


test("github connector surfaces a 4xx/5xx response as a rejected error", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzgh2";

    const originalRequest = http.request;

    http.request = async () => ({ status: 404, headers: {}, body: "Not Found" });

    try {

        await assert.rejects(
            () => github.getRepo("nobody", "nothing"),
            /GitHub API error 404/
        );

    } finally {
        http.request = originalRequest;
    }

});


test("discord connector fails closed without DISCORD_WEBHOOK_URL, and sends via the real request() once configured", async () => {

    assert.strictEqual(discord.isConfigured(), false);
    await assert.rejects(() => discord.sendMessage("hi"), /not configured/);

    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/fake/xqzdc1";

    assert.strictEqual(discord.isConfigured(), true);

    const originalRequest = http.request;
    let capturedUrl, capturedOptions;

    http.request = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return { status: 204, headers: {}, body: "" };
    };

    try {

        const result = await discord.sendMessage("hello from VERONICA XQZDC1");

        assert.strictEqual(result.sent, true);
        assert.strictEqual(capturedUrl, "https://discord.com/api/webhooks/fake/xqzdc1");
        assert.strictEqual(capturedOptions.body.content, "hello from VERONICA XQZDC1");

    } finally {
        http.request = originalRequest;
    }

});


for(const [name, connector, requiredEnv] of [
    ["calendar", calendar, ["CALENDAR_PROVIDER", "CALENDAR_ACCESS_TOKEN"]],
    ["email", email, ["EMAIL_PROVIDER", "EMAIL_API_KEY"]],
    ["cloudStorage", cloudStorage, ["CLOUD_STORAGE_PROVIDER", "CLOUD_STORAGE_ACCESS_TOKEN"]]
]){

    test(`${name} connector is an unconfigured, unimplemented placeholder with a stable interface`, () => {

        assert.strictEqual(connector.isConfigured(), false);

        const status = connector.status();
        assert.strictEqual(status.implemented, false);
        assert.strictEqual(status.configured, false);
        assert.deepStrictEqual(status.requiredEnv, requiredEnv);

        for(const methodName of Object.keys(connector)){

            if(methodName === "isConfigured" || methodName === "status"){
                continue;
            }

            assert.throws(() => connector[methodName](), /not implemented yet/);

        }

    });

}


test("registry.overview() reports every connector and matches each one's own status", () => {

    const overview = registry.overview();

    assert.strictEqual(overview.total, 10);
    assert.strictEqual(overview.integrations.length, overview.total);

    const ids = overview.integrations.map(i => i.id).sort();
    assert.deepStrictEqual(ids, [
        "calendar", "cloudStorage", "discord", "discordBot", "email",
        "fileIntelligence", "github", "google", "http", "obsidian"
    ]);

    // obsidian/fileIntelligence need no credentials -- always configured.
    assert.strictEqual(overview.integrations.find(i => i.id === "obsidian").configured, true);
    assert.strictEqual(overview.integrations.find(i => i.id === "fileIntelligence").configured, true);

    // github/discord/discordBot/google/calendar/email/cloudStorage are
    // unconfigured by default in this test's clean env.
    for(const id of ["github", "discord", "discordBot", "google", "calendar", "email", "cloudStorage"]){
        assert.strictEqual(overview.integrations.find(i => i.id === id).configured, false);
    }

    assert.strictEqual(overview.configured, overview.integrations.filter(i => i.configured).length);
    assert.strictEqual(overview.implemented, overview.integrations.filter(i => i.implemented).length);

});


test("registry reflects SERVICE_ALLOWLIST for the http connector", () => {

    delete process.env.SERVICE_ALLOWLIST;
    assert.strictEqual(registry.overview().integrations.find(i => i.id === "http").configured, false);

    process.env.SERVICE_ALLOWLIST = "example.com";
    assert.strictEqual(registry.overview().integrations.find(i => i.id === "http").configured, true);

});
