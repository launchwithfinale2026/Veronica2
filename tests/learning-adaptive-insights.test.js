const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-adaptive-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-adaptive-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-adaptive-${process.pid}.log`);

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-adaptive-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
});

const ExecutivePlanner = require("../core/executive/planner");
const ProjectManager = require("../core/executive/projectManager");
const ActionProposalEngine = require("../core/executive/actionProposal");
const registry = require("../core/capabilities/registry");
const learningLog = require("../core/learning/log");
const adaptiveInsights = require("../core/learning/adaptiveInsights");


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


test("recommendationAcceptance() computes a real acceptance rate from real proposal status transitions", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Adaptive insights project XQZADAPT1", department: "ares" });
    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });
    const engine = new ActionProposalEngine({ planner: scoped, projectManager });

    const approved = engine.proposeExternalAction({ action: "post_discord_message", reason: "test xqzadapt1a", payload: {} });
    engine.approve(approved.id);

    const rejected = engine.proposeExternalAction({ action: "post_discord_message", reason: "test xqzadapt1b", payload: {} });
    engine.reject(rejected.id);

    const result = adaptiveInsights.recommendationAcceptance();
    const discordStats = result.find(r => r.action === "post_discord_message");

    assert.ok(discordStats.total >= 2);
    assert.ok(discordStats.approved >= 1);
    assert.ok(discordStats.rejected >= 1);
    assert.strictEqual(typeof discordStats.acceptanceRate, "number");

});


test("repeatedRecommendations() flags a real (kind, subject) pair recommended more than once", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Adaptive insights repeat project XQZADAPT2", department: "ares" });
    const scoped = scopedPlanner(realPlanner, [project.id]);
    const projectManager = new ProjectManager({ planner: scoped });

    const memory = require("../core/memory");
    const RECOMMENDATION_TAG = "executive-recommendation";

    for(let i = 0; i < 3; i++){
        memory.remember({
            content: "test recommendation run",
            type: "decisions",
            tags: [RECOMMENDATION_TAG],
            source: "executive-recommendations",
            metadata: { recommendations: [{ kind: "resolve_deadlock", subject: project.id, detail: "XQZADAPT2 repeated", reason: "test" }] }
        });
    }

    const result = adaptiveInsights.repeatedRecommendations();
    const match = result.find(r => r.kind === "resolve_deadlock" && r.subject === project.id);

    assert.ok(match);
    assert.strictEqual(match.count, 3);

});


test("automationSuccess() groups real job history by name with a real success rate", () => {

    // Reads the real, shared automation state -- just verifies the
    // shape/math is correct against whatever real history exists,
    // rather than asserting specific counts (which would be flaky
    // against genuinely shared, real state).
    const result = adaptiveInsights.automationSuccess();

    for(const job of result){
        assert.strictEqual(job.total, job.succeeded + job.failed);
        assert.strictEqual(job.successRate, Math.round((job.succeeded / job.total) * 100));
    }

});


test("packageToolUsage() reports real tool-call telemetry scoped to installed package tools only", () => {

    registry.register({
        name: "test-cap-adaptive1",
        version: "1.0.0",
        description: "test",
        manifest: { tools: [{ id: "test.adaptive1.tool" }] }
    });
    registry.setStatus("test-cap-adaptive1", "active");

    learningLog.record({ kind: "tool_call", tool: "test.adaptive1.tool", outcome: "success", durationMs: 5 });
    learningLog.record({ kind: "tool_call", tool: "test.adaptive1.tool", outcome: "failure", durationMs: 5 });
    // A non-package (built-in) tool call should NOT appear in this report.
    learningLog.record({ kind: "tool_call", tool: "memory.remember", outcome: "success", durationMs: 5 });

    const result = adaptiveInsights.packageToolUsage();
    const match = result.find(r => r.tool === "test.adaptive1.tool");

    assert.ok(match);
    assert.strictEqual(match.total, 2);
    assert.strictEqual(match.successes, 1);
    assert.strictEqual(match.failures, 1);
    assert.ok(!result.some(r => r.tool === "memory.remember"));

    registry.remove("test-cap-adaptive1");

});


test("generate() assembles all four sections without throwing", () => {

    const result = adaptiveInsights.generate();

    assert.ok(result.generatedAt);
    assert.ok(Array.isArray(result.recommendationAcceptance));
    assert.ok(Array.isArray(result.repeatedRecommendations));
    assert.ok(Array.isArray(result.automationSuccess));
    assert.ok(Array.isArray(result.packageToolUsage));

});
