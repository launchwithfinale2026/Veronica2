const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "core", "automation", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-automation-state-backup-${process.pid}.json`);

const EXEC_LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const EXEC_LOG_EXISTED_BEFORE = fs.existsSync(EXEC_LOG_PATH);
const EXEC_LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-automation-${process.pid}.log`);

test.before(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_PATH, EXEC_LOG_BACKUP);
    }
});

test.after(() => {
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }

    if(EXEC_LOG_EXISTED_BEFORE){
        fs.copyFileSync(EXEC_LOG_BACKUP, EXEC_LOG_PATH);
        fs.unlinkSync(EXEC_LOG_BACKUP);
    } else if(fs.existsSync(EXEC_LOG_PATH)){
        fs.unlinkSync(EXEC_LOG_PATH);
    }
});

const AutomationEngine = require("../core/automation/engine");

// Each test gets a fresh engine instance but they all share the same
// on-disk state.json (the module hardcodes its path, like
// core/memory/store.js does) -- tests use unique job-name markers to
// avoid cross-test interference, matching the convention used throughout
// this milestone's other real-state test files.

test("enqueue() + tick() runs a registered job and marks it completed", async () => {

    const engine = new AutomationEngine();

    let ran = false;
    engine.registerJob("job-xqzauto1", async () => { ran = true; });

    const entry = engine.enqueue("job-xqzauto1");
    assert.strictEqual(entry.status, "pending");

    await engine.tick();

    assert.ok(ran);

    const history = engine.history();
    const completed = history.find(e => e.id === entry.id);
    assert.strictEqual(completed.status, "completed");

});

test("a failing job retries with backoff, then fails permanently after maxAttempts", async () => {

    const engine = new AutomationEngine();

    let calls = 0;
    engine.registerJob("job-xqzauto2", async () => {
        calls++;
        throw new Error("boom xqzauto2");
    });

    const entry = engine.enqueue("job-xqzauto2", { maxAttempts: 2 });

    await engine.tick();

    const afterFirst = engine.state.queue.find(e => e.id === entry.id);
    assert.strictEqual(afterFirst.status, "pending");
    assert.strictEqual(afterFirst.attempts, 1);
    assert.ok(new Date(afterFirst.scheduledFor).getTime() > Date.now());

    // Force the retry to be due now instead of waiting for the real backoff.
    afterFirst.scheduledFor = new Date().toISOString();

    await engine.tick();

    const afterSecond = engine.state.queue.find(e => e.id === entry.id);
    assert.strictEqual(afterSecond.status, "failed");
    assert.strictEqual(afterSecond.attempts, 2);
    assert.strictEqual(calls, 2);

});

test("enqueueing an unregistered job name fails immediately, not silently", async () => {

    const engine = new AutomationEngine();

    const entry = engine.enqueue("no-such-job-xqzauto3");

    await engine.tick();

    const after = engine.state.queue.find(e => e.id === entry.id);
    assert.strictEqual(after.status, "failed");
    assert.ok(after.lastError.includes("No handler registered"));

});

test("schedule() enqueues a job once its nextRunAt has passed, then advances it", async () => {

    const engine = new AutomationEngine();

    let runs = 0;
    engine.registerJob("job-xqzauto4", async () => { runs++; });

    const scheduleEntry = engine.schedule("job-xqzauto4", 60 * 60 * 1000);

    // Force it due now rather than waiting an hour.
    scheduleEntry.nextRunAt = new Date(Date.now() - 1000).toISOString();

    await engine.tick();

    assert.strictEqual(runs, 1);

    const updatedSchedule = engine.state.schedules.find(s => s.jobName === "job-xqzauto4");
    assert.ok(new Date(updatedSchedule.nextRunAt).getTime() > Date.now());

});

test("re-scheduling the same jobName updates the interval without resetting nextRunAt", () => {

    const engine = new AutomationEngine();

    const first = engine.schedule("job-xqzauto5", 1000);
    const originalNextRunAt = first.nextRunAt;

    const second = engine.schedule("job-xqzauto5", 5000);

    assert.strictEqual(second.nextRunAt, originalNextRunAt);
    assert.strictEqual(second.intervalMs, 5000);

    const all = engine.state.schedules.filter(s => s.jobName === "job-xqzauto5");
    assert.strictEqual(all.length, 1);

});

test("runNow() runs a job immediately, bypassing the queue, and returns its result", async () => {

    const engine = new AutomationEngine();

    engine.registerJob("job-xqzauto6", async () => "direct result");

    const result = await engine.runNow("job-xqzauto6");

    assert.strictEqual(result, "direct result");
    assert.ok(!engine.state.queue.some(e => e.jobName === "job-xqzauto6"));

});

test("runNow() throws (not swallows) when the job fails, and for an unregistered job", async () => {

    const engine = new AutomationEngine();

    engine.registerJob("job-xqzauto7", async () => { throw new Error("direct failure xqzauto7"); });

    await assert.rejects(() => engine.runNow("job-xqzauto7"), /direct failure xqzauto7/);
    await assert.rejects(() => engine.runNow("no-such-job-xqzauto7"), /No handler registered/);

});

test("loading state with a leftover 'running' entry recovers it to 'pending'", async () => {

    const engine1 = new AutomationEngine();

    const entry = engine1.enqueue("job-xqzauto8");
    entry.status = "running";
    fs.writeFileSync(STATE_PATH, JSON.stringify(engine1.state, null, 2));

    // A fresh engine loading the same on-disk state simulates the process
    // restarting after a crash mid-job.
    const engine2 = new AutomationEngine();

    const recovered = engine2.state.queue.find(e => e.id === entry.id);
    assert.strictEqual(recovered.status, "pending");

    // Drain it so this recovered entry doesn't sit in the shared
    // on-disk state as "pending" for later tests in this file to trip
    // over (a subsequent engine's tick() would otherwise pick it up
    // with no handler registered for it and mark it failed as a side
    // effect of an unrelated test).
    engine2.registerJob("job-xqzauto8", async () => {});
    await engine2.tick();

});

test("start()/stop() are idempotent and stop() actually clears the timer", () => {

    const engine = new AutomationEngine();

    engine.start(1000 * 60 * 60);
    const timerAfterFirstStart = engine.timer;

    engine.start(1000 * 60 * 60);
    assert.strictEqual(engine.timer, timerAfterFirstStart);

    engine.stop();
    assert.strictEqual(engine.timer, null);

    engine.stop();
    assert.strictEqual(engine.timer, null);

});

test("history() returns completed/failed entries, most recent first", async () => {

    const engine = new AutomationEngine();

    engine.registerJob("job-xqzauto9", async () => {});

    const first = engine.enqueue("job-xqzauto9");
    await engine.tick();

    // history() orders by updatedAt, which has millisecond resolution --
    // without this gap, two ticks under fast/loaded test execution can
    // land in the same millisecond and tie, making the ordering assertion
    // below flaky.
    await new Promise(resolve => setTimeout(resolve, 5));

    const second = engine.enqueue("job-xqzauto9");
    await engine.tick();

    const history = engine.history();
    const firstIndex = history.findIndex(e => e.id === first.id);
    const secondIndex = history.findIndex(e => e.id === second.id);

    assert.ok(secondIndex < firstIndex);

});

test("requiring the real core/automation facade registers all six built-in jobs (including self-monitor, and the Phase 11/14 daily briefing/weekly report/daily review) without a circular-require crash", () => {

    // Regression test for the exact risk documented in
    // core/executive/selfMonitor.js's constructor comment and
    // core/automation/jobs.js: registerBuiltInJobs(engine) constructs a
    // SelfMonitor with the live engine instance passed directly, instead
    // of self-monitor requiring("../automation") itself (which would
    // re-enter this very module mid-load). If that wiring were ever
    // reverted to use require("../automation") internally, this either
    // throws or `automation.status()` reflects a broken/incomplete
    // engine -- this test exists so that regression fails loudly here
    // instead of surfacing as a mysterious runtime crash later.
    delete require.cache[require.resolve("../core/automation")];

    const automation = require("../core/automation");

    const status = automation.status();

    // Not a strict-equal check on the whole list -- this test file's
    // earlier tests share the same on-disk state.json (by design, same
    // as every other file exercising this instrumentation) and may have
    // left their own schedule entries there too; this only needs to
    // confirm the three real built-in jobs are present and correctly
    // wired, not that nothing else exists in shared state.
    const jobNames = status.schedules.map(s => s.jobName);

    assert.ok(["consolidate", "learning-recommend", "self-monitor", "daily-briefing", "weekly-report", "daily-review"].every(name => jobNames.includes(name)));

});


test("automation.registerExecutionJob() wires the autonomous task-execution job to real departments, opt-in only", () => {

    delete require.cache[require.resolve("../core/automation")];
    const automation = require("../core/automation");

    // Not called for us -- confirms the three always-on jobs from the
    // test above don't include this one until a host explicitly wires
    // its own departments in (see core/automation/jobs.js for why).
    assert.ok(!automation.engine.handlers.has("execute-tasks"));

    const fakeDepartments = [{ id: "themis" }, { id: "orion" }];

    const orchestrator = automation.registerExecutionJob(fakeDepartments);

    assert.ok(automation.engine.handlers.has("execute-tasks"));

    const schedule = automation.status().schedules.find(s => s.jobName === "execute-tasks");
    assert.ok(schedule);
    assert.ok(Number.isFinite(schedule.intervalMs));

    // Returns the live ExecutiveOrchestrator so a host can also call
    // pursue()/report() directly without constructing a second one wired
    // to the same departments.
    assert.deepStrictEqual(orchestrator.departments, fakeDepartments);

});
