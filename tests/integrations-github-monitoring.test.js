const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// pollRepository() ingests real memory entries via
// core/integrations/eventIngestion.js -> core/memory's remember(), same
// backup/restore discipline as every other test touching this shared
// file.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-ghmon-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

test.afterEach(() => {
    delete process.env.GITHUB_TOKEN;
});

const http = require("../core/integrations/http");
const github = require("../core/integrations/github");
const eventIngestion = require("../core/integrations/eventIngestion");


test("listBranches()/listCommits()/listPullRequests() fail closed without GITHUB_TOKEN", async () => {

    await assert.rejects(() => github.listBranches("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.listCommits("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.listPullRequests("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.repositoryHealthSummary("octocat", "hello-world"), /not configured/);
    await assert.rejects(() => github.pollRepository("octocat", "hello-world"), /not configured/);

});


test("listCommits() builds the real commits URL, optionally scoped to a sha", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzghm1";

    const originalRequest = http.request;
    let capturedUrl;

    http.request = async (url) => {
        capturedUrl = url;
        return { status: 200, headers: {}, body: "[]" };
    };

    try {

        await github.listCommits("octocat", "hello-world", { sha: "main" });
        assert.match(capturedUrl, /\/repos\/octocat\/hello-world\/commits\?/);
        assert.match(capturedUrl, /sha=main/);

    } finally {
        http.request = originalRequest;
    }

});


test("repositoryHealthSummary() combines repo/issues/pulls into one real summary, excluding PRs from the issue count", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzghm2";

    const originalRequest = http.request;

    http.request = async (url) => {

        if(url.includes("/pulls")){
            return { status: 200, headers: {}, body: JSON.stringify([{ number: 1 }]) };
        }

        if(url.includes("/issues")){
            return {
                status: 200, headers: {}, body: JSON.stringify([
                    { number: 2, pull_request: {} }, // GitHub's issues endpoint also returns PRs
                    { number: 3 }
                ])
            };
        }

        return {
            status: 200, headers: {}, body: JSON.stringify({
                full_name: "octocat/hello-world",
                description: "test repo XQZGHM2",
                default_branch: "main",
                pushed_at: new Date().toISOString(),
                html_url: "https://github.com/octocat/hello-world",
                archived: false
            })
        };

    };

    try {

        const summary = await github.repositoryHealthSummary("octocat", "hello-world");

        assert.strictEqual(summary.fullName, "octocat/hello-world");
        assert.strictEqual(summary.openIssueCount, 1); // #2 excluded (it's a PR)
        assert.strictEqual(summary.openPullRequestCount, 1);
        assert.strictEqual(summary.archived, false);
        assert.strictEqual(summary.stale, false);

    } finally {
        http.request = originalRequest;
    }

});


test("pollRepository() ingests new open PRs/issues as external events, and skips ones already ingested", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzghm3";

    const originalRequest = http.request;

    http.request = async (url) => {

        if(url.includes("/pulls")){
            return { status: 200, headers: {}, body: JSON.stringify([{ number: 101, title: "PR XQZGHM3", created_at: "2026-01-01T00:00:00.000Z", html_url: "https://github.com/x/y/pull/101" }]) };
        }

        return { status: 200, headers: {}, body: JSON.stringify([{ number: 202, title: "Issue XQZGHM3", created_at: "2026-01-01T00:00:00.000Z", html_url: "https://github.com/x/y/issues/202" }]) };

    };

    try {

        const first = await github.pollRepository("xqzghm3owner", "xqzghm3repo");
        assert.strictEqual(first.length, 2);

        const second = await github.pollRepository("xqzghm3owner", "xqzghm3repo");
        assert.strictEqual(second.length, 0); // already ingested -- deduped

        const events = eventIngestion.recentEvents({ source: "github" }).filter(e => e.content.includes("XQZGHM3"));
        assert.strictEqual(events.length, 2);

    } finally {
        http.request = originalRequest;
    }

});
