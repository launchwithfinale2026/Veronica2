const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as the other executive test
// files -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-selfmon-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const SelfMonitor = require("../core/executive/selfMonitor");

function fakeExecutive(overdueProjects = []){
    return {
        evaluateDeadlines: () => ({ overdue: overdueProjects, due_soon: [], on_track: [], no_deadline: [] })
    };
}

function fakeLearning(overview, recommendResult){
    return {
        overview: () => overview,
        recommend: async () => recommendResult || { id: "fake-rec-id", summary: "fake", recommendations: [] }
    };
}

function fakeAutomationEngine(historyEntries = []){
    return {
        history: () => historyEntries
    };
}

test("checkDeadlines() flags overdue projects, empty when none", () => {

    const clean = new SelfMonitor({ executive: fakeExecutive([]), learning: fakeLearning({ total: 0, successes: 0, failures: 0 }) });
    assert.deepStrictEqual(clean.checkDeadlines(), []);

    const dirty = new SelfMonitor({
        executive: fakeExecutive([{ id: "p1", title: "Overdue project XQZMON1", department: "hades" }]),
        learning: fakeLearning({ total: 0, successes: 0, failures: 0 })
    });

    const issues = dirty.checkDeadlines();
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].kind, "overdue_projects");
    assert.strictEqual(issues[0].projects[0].title, "Overdue project XQZMON1");

});

test("checkPerformance() only flags a high failure rate above the sample-size floor", () => {

    const tooFewExecutions = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: fakeLearning({ total: 3, successes: 0, failures: 3 }) // 100% failure but tiny sample
    });
    assert.deepStrictEqual(tooFewExecutions.checkPerformance(), []);

    const healthyRate = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: fakeLearning({ total: 20, successes: 18, failures: 2 }) // 10% failure
    });
    assert.deepStrictEqual(healthyRate.checkPerformance(), []);

    const unhealthyRate = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: fakeLearning({ total: 20, successes: 10, failures: 10 }) // 50% failure
    });

    const issues = unhealthyRate.checkPerformance();
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].kind, "high_failure_rate");

});

test("checkAutomation() flags repeated permanent job failures, and no-ops without an attached engine", () => {

    const noEngine = new SelfMonitor({ executive: fakeExecutive([]), learning: fakeLearning({ total: 0, successes: 0, failures: 0 }) });
    assert.deepStrictEqual(noEngine.checkAutomation(), []);

    const fewFailures = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: fakeLearning({ total: 0, successes: 0, failures: 0 }),
        automationEngine: fakeAutomationEngine([{ status: "failed", jobName: "consolidate" }, { status: "completed", jobName: "consolidate" }])
    });
    assert.deepStrictEqual(fewFailures.checkAutomation(), []);

    const manyFailures = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: fakeLearning({ total: 0, successes: 0, failures: 0 }),
        automationEngine: fakeAutomationEngine([
            { status: "failed", jobName: "consolidate" },
            { status: "failed", jobName: "consolidate" },
            { status: "failed", jobName: "learning-recommend" }
        ])
    });

    const issues = manyFailures.checkAutomation();
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].kind, "repeated_job_failures");
    assert.deepStrictEqual(issues[0].jobs.sort(), ["consolidate", "learning-recommend"]);

});

test("runSelfCheck() skips learning.recommend() entirely and records nothing when there are no issues", async () => {

    let recommendCalled = false;

    const monitor = new SelfMonitor({
        executive: fakeExecutive([]),
        learning: { overview: () => ({ total: 0, successes: 0, failures: 0 }), recommend: async () => { recommendCalled = true; } }
    });

    const result = await monitor.runSelfCheck();

    assert.strictEqual(result.issuesFound, 0);
    assert.strictEqual(recommendCalled, false);

});

test("runSelfCheck() calls learning.recommend() and persists a memory entry when issues are found", async () => {

    const monitor = new SelfMonitor({
        executive: fakeExecutive([{ id: "p1", title: "Overdue project XQZMON2", department: "hades" }]),
        learning: fakeLearning({ total: 0, successes: 0, failures: 0 }, { id: "rec-xqzmon2", summary: "fix it", recommendations: ["do X"] })
    });

    const result = await monitor.runSelfCheck();

    assert.strictEqual(result.issuesFound, 1);
    assert.strictEqual(result.recommendations.id, "rec-xqzmon2");
    assert.ok(result.memoryEntryId);

    const history = monitor.history();
    assert.ok(history.some(h => h.id === result.memoryEntryId));

});
