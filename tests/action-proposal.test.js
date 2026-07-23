const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-proposal-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-proposal-${process.pid}.json`);

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

const ExecutivePlanner = require("../core/executive/planner");
const GoalDecomposer = require("../core/executive/decomposer");
const ProjectManager = require("../core/executive/projectManager");
const PriorityRanking = require("../core/executive/priorityRanking");
const BlockerDetector = require("../core/executive/blockerDetection");
const ExecutiveRecommendationEngine = require("../core/executive/executiveRecommendations");
const ActionProposalEngine = require("../core/executive/actionProposal");

function scopedPlanner(realPlanner, allowedIds){
    return {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        urgencyScore: (deadline) => realPlanner.urgencyScore(deadline),
        roadmap: (opts) => realPlanner.roadmap(opts).filter(p => allowedIds.includes(p.id)),
        evaluateDeadlines(){
            const grouped = { overdue: [], due_soon: [], on_track: [], no_deadline: [] };
            for(const project of realPlanner.roadmap().filter(p => allowedIds.includes(p.id))){
                grouped[project.deadlineStatus].push(project);
            }
            return grouped;
        }
    };
}

function mockDecomposerBrain(decomposer, responseObj){
    decomposer.intelligence.brain.provider.providers = {
        claude: { generate: async () => ({ response: JSON.stringify(responseObj), provider: "claude", toolCalls: [] }) }
    };
    decomposer.intelligence.brain.provider.active = "claude";
}

function makeEngine(scoped, projectManager){
    const priorityRanking = new PriorityRanking({ planner: scoped, projectManager });
    const blockerDetector = new BlockerDetector({ planner: scoped, projectManager });
    const recommendationEngine = new ExecutiveRecommendationEngine({ planner: scoped, projectManager, priorityRanking, blockerDetector });
    return new ActionProposalEngine({ planner: scoped, projectManager, recommendationEngine, blockerDetector });
}


test("generateProposals() converts a deadlock recommendation into a pending, approval-required, medium-risk proposal", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Proposal deadlock project XQZPROP1", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZPROP1", tasks: [{ title: "Task XQZPROP1", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Execution failed: simulated XQZPROP1");

    const engine = makeEngine(scoped, projectManager);
    const proposals = engine.generateProposals();

    const deadlockProposal = proposals.find(p => p.action === "resolve_deadlock" && p.subject === project.id);

    assert.ok(deadlockProposal);
    assert.strictEqual(deadlockProposal.status, "pending");
    assert.strictEqual(deadlockProposal.risk, "medium");
    assert.strictEqual(deadlockProposal.approvalRequired, true);
    assert.strictEqual(deadlockProposal.department, "ares");
    assert.match(deadlockProposal.reason, /simulated XQZPROP1/);

});


test("high_urgency proposals are low risk and do not require approval", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Proposal urgency project XQZPROP2",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = makeEngine(scoped, new ProjectManager({ planner: scoped }));

    const proposals = engine.generateProposals();
    const urgencyProposal = proposals.find(p => p.action === "high_urgency" && p.subject === project.id);

    assert.ok(urgencyProposal);
    assert.strictEqual(urgencyProposal.risk, "low");
    assert.strictEqual(urgencyProposal.approvalRequired, false);

});


test("fromRecommendation() creates a real notification only for approval-required proposals, not high_urgency ones (Project C/A)", async () => {

    const notifications = require("../core/device/notifications");

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Proposal notification project XQZPROP7", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZPROP7", tasks: [{ title: "Task XQZPROP7", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Execution failed: simulated XQZPROP7");

    const engine = makeEngine(scoped, projectManager);
    engine.generateProposals();

    const pending = notifications.pending();
    assert.ok(pending.some(n => n.title.includes("simulated XQZPROP7")), "expected a real notification for the approval-required deadlock proposal");
    assert.ok(!pending.some(n => n.severity === "critical" && n.title.includes("simulated XQZPROP7")), "medium risk should be \"warning\", not \"critical\"");

});


test("proposeExternalAction() creates a real notification for a real external approval-required proposal (Project C/A)", () => {

    const notifications = require("../core/device/notifications");

    const realPlanner = new ExecutivePlanner();
    const engine = makeEngine(realPlanner, new ProjectManager({ planner: realPlanner }));

    engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "notification test XQZPROP8",
        payload: { content: "test" }
    });

    const pending = notifications.pending();
    assert.ok(pending.some(n => n.title.includes("notification test XQZPROP8")));

});


test("execute() refuses to run a proposal that hasn't been approved", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Proposal unapproved project XQZPROP3",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = makeEngine(scoped, new ProjectManager({ planner: scoped }));

    const [proposal] = engine.generateProposals();

    assert.throws(() => engine.execute(proposal.id), /must be "approved"/);

});


test("reject() moves a proposal to rejected, and execute() still refuses it", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Proposal rejected project XQZPROP4",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = makeEngine(scoped, new ProjectManager({ planner: scoped }));

    const [proposal] = engine.generateProposals();

    const rejected = engine.reject(proposal.id, "not a priority right now");

    assert.strictEqual(rejected.status, "rejected");
    assert.strictEqual(rejected.reviewNote, "not a priority right now");

    assert.throws(() => engine.execute(proposal.id), /must be "approved"/);

    // A decided proposal can't be re-approved or re-rejected either --
    // approve()/reject() both require "pending".
    assert.throws(() => engine.approve(proposal.id), /is "rejected", not "pending"/);

});


test("approve() then execute() unblocks a task via the real projectManager, end to end", async () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Proposal execute unblock project XQZPROP5", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const decomposer = new GoalDecomposer({ planner: scoped });
    mockDecomposerBrain(decomposer, {
        milestones: [{ title: "Milestone XQZPROP5", tasks: [{ title: "Task XQZPROP5", subtasks: [], deliverables: [] }] }]
    });

    const projectManager = new ProjectManager({ planner: scoped });
    await decomposer.decompose(project.id);

    const [task] = projectManager.tasksForProject(project.id);
    projectManager.updateStatus(task.id, "blocked", "Execution failed: simulated XQZPROP5");

    const engine = makeEngine(scoped, projectManager);
    const proposals = engine.generateProposals();
    const deadlockProposal = proposals.find(p => p.action === "resolve_deadlock" && p.subject === project.id);

    const approved = engine.approve(deadlockProposal.id);
    assert.strictEqual(approved.status, "approved");

    const executed = engine.execute(deadlockProposal.id);

    assert.strictEqual(executed.status, "executed");
    assert.match(executed.executionOutcome, /Reset 1 blocked task/);
    assert.ok(executed.executedAt);

    const unblockedTask = projectManager.requireEntry(task.id);
    assert.strictEqual(unblockedTask.metadata.status, "planned");

});


test("list() filters by status", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({
        title: "Proposal list project XQZPROP6",
        department: "ares",
        priority: 5,
        deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = makeEngine(scoped, new ProjectManager({ planner: scoped }));

    const [proposal] = engine.generateProposals();

    const pendingList = engine.list("pending");
    assert.ok(pendingList.some(p => p.id === proposal.id));

    engine.approve(proposal.id);

    const approvedList = engine.list("approved");
    assert.ok(approvedList.some(p => p.id === proposal.id));

    const stillPending = engine.list("pending");
    assert.ok(!stillPending.some(p => p.id === proposal.id));

});
