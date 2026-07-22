const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// proposeExternalAction()/executeExternal() persist proposal records via
// memory.remember()/update(), same shared-state discipline as
// action-proposal.test.js.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-proposal-ext-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

test.afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.DISCORD_WEBHOOK_URL;
});

const http = require("../core/integrations/http");
const ActionProposalEngine = require("../core/executive/actionProposal");


test("proposeExternalAction() rejects an unknown action and a missing reason", () => {

    const engine = new ActionProposalEngine();

    assert.throws(() => engine.proposeExternalAction({ action: "merge_pr", reason: "test" }), /Unknown external action/);
    assert.throws(() => engine.proposeExternalAction({ action: "create_github_issue" }), /reason is required/);

});


test("proposeExternalAction() creates a pending proposal requiring approval, distinct from recommendation-derived ones", () => {

    const engine = new ActionProposalEngine();

    const proposal = engine.proposeExternalAction({
        action: "create_github_issue",
        reason: "Automation job XQZEXT1 detected a recurring failure",
        payload: { owner: "octocat", repo: "hello-world", title: "Recurring failure XQZEXT1" }
    });

    assert.strictEqual(proposal.status, "pending");
    assert.strictEqual(proposal.action, "create_github_issue");
    assert.strictEqual(proposal.risk, "medium");
    assert.strictEqual(proposal.approvalRequired, true);
    assert.strictEqual(proposal.subject, null);
    assert.deepStrictEqual(proposal.payload, { owner: "octocat", repo: "hello-world", title: "Recurring failure XQZEXT1" });

    assert.ok(engine.list("pending").some(p => p.id === proposal.id));

});


test("executeExternal() refuses to run a proposal that hasn't been approved", async () => {

    const engine = new ActionProposalEngine();

    const proposal = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "XQZEXT2 test",
        payload: { content: "hi" }
    });

    await assert.rejects(() => engine.executeExternal(proposal.id), /must be "approved"/);

});


test("approve() then executeExternal() creates a real GitHub issue via the real connector, end to end", async () => {

    process.env.GITHUB_TOKEN = "fake-token-xqzext3";

    const engine = new ActionProposalEngine();

    const proposal = engine.proposeExternalAction({
        action: "create_github_issue",
        reason: "XQZEXT3 test",
        payload: { owner: "octocat", repo: "hello-world", title: "Issue XQZEXT3", body: "body xqzext3" }
    });

    engine.approve(proposal.id, "looks good");

    const originalRequest = http.request;
    let capturedUrl, capturedOptions;

    http.request = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return { status: 201, headers: {}, body: JSON.stringify({ number: 42, html_url: "https://github.com/octocat/hello-world/issues/42" }) };
    };

    try {

        const executed = await engine.executeExternal(proposal.id);

        assert.strictEqual(executed.status, "executed");
        assert.match(executed.executionOutcome, /Created GitHub issue #42/);
        assert.strictEqual(capturedUrl, "https://api.github.com/repos/octocat/hello-world/issues");
        assert.strictEqual(capturedOptions.body.title, "Issue XQZEXT3");

    } finally {
        http.request = originalRequest;
    }

});


test("approve() then executeExternal() posts a real Discord message via the real connector, end to end", async () => {

    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/fake/xqzext4";

    const engine = new ActionProposalEngine();

    const proposal = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "XQZEXT4 test",
        payload: { content: "hello from VERONICA XQZEXT4" }
    });

    engine.approve(proposal.id);

    const originalRequest = http.request;
    let capturedBody;

    http.request = async (url, options) => {
        capturedBody = options.body;
        return { status: 204, headers: {}, body: "" };
    };

    try {

        const executed = await engine.executeExternal(proposal.id);

        assert.strictEqual(executed.status, "executed");
        assert.match(executed.executionOutcome, /Posted Discord message/);
        assert.strictEqual(capturedBody.content, "hello from VERONICA XQZEXT4");

    } finally {
        http.request = originalRequest;
    }

});


test("executeExternal() surfaces a real connector failure (e.g. missing credentials) as a rejection, leaving the proposal approved", async () => {

    const engine = new ActionProposalEngine();

    const proposal = engine.proposeExternalAction({
        action: "create_github_issue",
        reason: "XQZEXT5 test",
        payload: { owner: "octocat", repo: "hello-world", title: "Issue XQZEXT5" }
    });

    engine.approve(proposal.id);

    // GITHUB_TOKEN deliberately left unset -- the real connector should
    // fail closed, and that failure should surface as a rejection, not a
    // false "executed" status.
    await assert.rejects(() => engine.executeExternal(proposal.id), /not configured/);

    assert.strictEqual(engine.list().find(p => p.id === proposal.id).status, "approved");

});
