const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-observation-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-observation-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const bus = require("../core/bus");
const ExecutivePlanner = require("../core/executive/planner");
const ProjectManager = require("../core/executive/projectManager");
const GoalDecomposer = require("../core/executive/decomposer");
const ActionProposalEngine = require("../core/executive/actionProposal");
const CompanyManager = require("../core/executive/companyManager");
const campaigns = require("../core/marketing/campaigns");
const missions = require("../core/research/missions");
const gitObserver = require("../core/system/gitObserver");
const connectorHealth = require("../core/system/connectorHealth");


// Real, one-shot subscription -- collects every event published for a
// given name during the callback, then unsubscribes. Avoids leaking
// listeners across tests on this shared, real bus singleton.
async function captureEvents(eventName, fn){

    const captured = [];
    const listener = data => captured.push(data);

    bus.on(eventName, listener);

    try {
        await fn();
    } finally {
        bus.off(eventName, listener);
    }

    return captured;

}


test("ProjectManager.updateStatus() publishes goal.statusChanged, and goal.completed only on completion", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Observation project XQZOBS1", department: "ares" });
    const projectManager = new ProjectManager({ planner: realPlanner });

    const statusChanges = await captureEvents("goal.statusChanged", async () => {
        projectManager.updateStatus(project.id, "in_progress", "starting XQZOBS1");
    });

    assert.strictEqual(statusChanges.length, 1);
    assert.strictEqual(statusChanges[0].id, project.id);
    assert.strictEqual(statusChanges[0].to, "in_progress");

    const completions = await captureEvents("goal.completed", async () => {
        projectManager.updateStatus(project.id, "completed", "done XQZOBS1");
    });

    assert.strictEqual(completions.length, 1);
    assert.strictEqual(completions[0].id, project.id);

});


test("ActionProposalEngine.approve()/reject() publish real approval.granted/approval.rejected events", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Observation approval project XQZOBS2", department: "ares" });

    const engine = new ActionProposalEngine({ planner: realPlanner });

    const proposalA = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "approval event test XQZOBS2a",
        payload: { content: "test" }
    });

    const granted = await captureEvents("approval.granted", async () => {
        engine.approve(proposalA.id);
    });

    assert.strictEqual(granted.length, 1);
    assert.strictEqual(granted[0].id, proposalA.id);

    const proposalB = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "approval event test XQZOBS2b",
        payload: { content: "test" }
    });

    const rejected = await captureEvents("approval.rejected", async () => {
        engine.reject(proposalB.id);
    });

    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(rejected[0].id, proposalB.id);

});


test("campaigns.setPublishingStatus() publishes campaign.published only when actually published", async () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Observation Campaign Co XQZOBS3" });
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Observation campaign XQZOBS3" });

    const noEvent = await captureEvents("campaign.published", async () => {
        campaigns.setPublishingStatus(campaign.id, "scheduled");
    });

    assert.strictEqual(noEvent.length, 0);

    const published = await captureEvents("campaign.published", async () => {
        campaigns.setPublishingStatus(campaign.id, "published");
    });

    assert.strictEqual(published.length, 1);
    assert.strictEqual(published[0].id, campaign.id);

});


test("missions.completeMission() publishes a real research.finished event", async () => {

    const mission = missions.createMission({ objective: "Observation mission XQZOBS4" });

    const finished = await captureEvents("research.finished", async () => {
        missions.completeMission(mission.id);
    });

    assert.strictEqual(finished.length, 1);
    assert.strictEqual(finished[0].id, mission.id);

});


test("gitObserver.checkForNewCommits() baselines on first check and reports real new commits since, against a disposable temp repo", async () => {

    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-git-observer-xqzobs5-"));
    const stateFile = path.join(os.tmpdir(), `veronica-git-observer-state-xqzobs5-${process.pid}.json`);

    try {

        execFileSync("git", ["init"], { cwd: tmpRepo });
        execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpRepo });
        execFileSync("git", ["config", "user.name", "Test XQZOBS5"], { cwd: tmpRepo });

        fs.writeFileSync(path.join(tmpRepo, "file.txt"), "first XQZOBS5\n");
        execFileSync("git", ["add", "."], { cwd: tmpRepo });
        execFileSync("git", ["commit", "-m", "First commit XQZOBS5"], { cwd: tmpRepo });

        const baseline = gitObserver.checkForNewCommits({ cwd: tmpRepo, stateFile });
        assert.strictEqual(baseline.baseline, true);
        assert.strictEqual(baseline.newCommits.length, 0);

        const noNewCommits = gitObserver.checkForNewCommits({ cwd: tmpRepo, stateFile });
        assert.strictEqual(noNewCommits.newCommits.length, 0);

        fs.writeFileSync(path.join(tmpRepo, "file.txt"), "second XQZOBS5\n");
        execFileSync("git", ["add", "."], { cwd: tmpRepo });
        execFileSync("git", ["commit", "-m", "Second commit XQZOBS5"], { cwd: tmpRepo });

        const commitEvents = await captureEvents("git.commit", async () => {
            const result = gitObserver.checkForNewCommits({ cwd: tmpRepo, stateFile });
            assert.strictEqual(result.newCommits.length, 1);
            assert.strictEqual(result.newCommits[0].subject, "Second commit XQZOBS5");
        });

        assert.strictEqual(commitEvents.length, 1);
        assert.strictEqual(commitEvents[0].subject, "Second commit XQZOBS5");

    } finally {

        fs.rmSync(tmpRepo, { recursive: true, force: true });

        if(fs.existsSync(stateFile)){
            fs.unlinkSync(stateFile);
        }

    }

});


test("gitObserver.checkForNewCommits() fails closed (does not throw) when cwd is not a git repository", () => {

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-not-a-repo-xqzobs6-"));
    const stateFile = path.join(os.tmpdir(), `veronica-git-observer-state-xqzobs6-${process.pid}.json`);

    try {

        const result = gitObserver.checkForNewCommits({ cwd: tmpDir, stateFile });

        assert.strictEqual(result.checked, false);
        assert.match(result.reason, /not a git repository/);

    } finally {

        fs.rmSync(tmpDir, { recursive: true, force: true });

        if(fs.existsSync(stateFile)){
            fs.unlinkSync(stateFile);
        }

    }

});


test("connectorHealth.checkConnectorHealth() baselines on first check, then reports a real transition against a seeded previous status", async () => {

    const stateFile = path.join(os.tmpdir(), `veronica-connector-health-state-xqzobs7-${process.pid}.json`);

    try {

        if(fs.existsSync(stateFile)){
            fs.unlinkSync(stateFile);
        }

        const integrationRegistry = require("../core/integrations/registry");
        const realConnectors = integrationRegistry.list();
        const [firstConnector] = realConnectors;

        // Baseline check: nothing to compare against yet, so no
        // transitions -- but the real current status is recorded.
        const baseline = connectorHealth.checkConnectorHealth({ stateFile });
        assert.strictEqual(baseline.transitions.length, 0);

        // Seed a "previous" status that's the OPPOSITE of this
        // connector's real current status, so the next check must
        // detect a real transition back to its actual value.
        fs.writeFileSync(stateFile, JSON.stringify({
            statuses: { [firstConnector.id]: !firstConnector.configured }
        }));

        const eventName = firstConnector.configured ? "connector.online" : "connector.offline";

        const events = await captureEvents(eventName, async () => {
            const result = connectorHealth.checkConnectorHealth({ stateFile });
            assert.ok(result.transitions.some(t => t.id === firstConnector.id));
        });

        assert.ok(events.some(e => e.id === firstConnector.id));

    } finally {

        if(fs.existsSync(stateFile)){
            fs.unlinkSync(stateFile);
        }

    }

});
