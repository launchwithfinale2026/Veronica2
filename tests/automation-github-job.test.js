const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// pollWatchedGithubRepos() -> github.pollRepository() -> eventIngestion
// -> memory.remember(), same backup/restore discipline as every other
// test touching this shared file.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-ghjob-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

test.afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_WATCHED_REPOS;
});

const http = require("../core/integrations/http");
const { pollWatchedGithubRepos } = require("../core/automation/jobs");


test("pollWatchedGithubRepos() no-ops cleanly when GitHub isn't configured", async () => {

    const result = await pollWatchedGithubRepos();

    assert.deepStrictEqual(result.polled, []);
    assert.match(result.reason, /not configured/);

});


test("pollWatchedGithubRepos() no-ops cleanly when configured but no repos are set", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzghjob1";

    const result = await pollWatchedGithubRepos();

    assert.deepStrictEqual(result.polled, []);
    assert.match(result.reason, /GITHUB_WATCHED_REPOS/);

});


test("pollWatchedGithubRepos() polls every configured repo and reports ingested counts", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzghjob2";
    process.env.GITHUB_WATCHED_REPOS = "xqzghjob-owner/repo-a, xqzghjob-owner/repo-b";

    const originalRequest = http.request;

    http.request = async (url) => {

        if(url.includes("/pulls")){
            return { status: 200, headers: {}, body: JSON.stringify([{ number: 1, title: "PR XQZGHJOB2", created_at: new Date().toISOString(), html_url: "https://github.com/x/y/pull/1" }]) };
        }

        return { status: 200, headers: {}, body: "[]" };

    };

    try {

        const result = await pollWatchedGithubRepos();

        assert.strictEqual(result.polled.length, 2);
        assert.strictEqual(result.polled[0].repo, "xqzghjob-owner/repo-a");
        assert.strictEqual(result.polled[0].ingestedCount, 1);
        assert.strictEqual(result.polled[1].repo, "xqzghjob-owner/repo-b");
        // Second repo's PR #1 has already been ingested under a different
        // owner/repo, so its externalId differs and it's ingested too.
        assert.strictEqual(result.polled[1].ingestedCount, 1);

    } finally {
        http.request = originalRequest;
    }

});
