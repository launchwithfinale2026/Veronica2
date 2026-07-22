// Facade over the automation subsystem -- same flat-object pattern as
// core/executive/index.js and core/learning/index.js. Registers the
// built-in jobs (consolidate, learning-recommend) once, at module load --
// registration and scheduling are idempotent/cheap, but start() (the
// actual recurring timer) is NOT called here. A long-running host process
// (dashboard/backend/server.js's real boot path) opts in explicitly, so
// requiring this module from a test or a one-off script never starts a
// background timer nobody asked for.

const AutomationEngine = require("./engine");
const { registerBuiltInJobs, registerExecutionJob } = require("./jobs");

const engine = new AutomationEngine();

registerBuiltInJobs(engine);

module.exports = {

    engine,

    // Opt-in: wires the autonomous task-execution job to a host's real,
    // already-loaded departments. See core/automation/jobs.js for why
    // this isn't part of registerBuiltInJobs() above. Returns the
    // ExecutiveOrchestrator instance so the host can also use it
    // directly (pursue()/report()/runNextReadyTask()) without building a
    // second one.
    registerExecutionJob: (departments) => registerExecutionJob(engine, departments),

    enqueue: (jobName, options) => engine.enqueue(jobName, options),

    runNow: (jobName) => engine.runNow(jobName),

    schedule: (jobName, intervalMs) => engine.schedule(jobName, intervalMs),

    start: (tickMs) => engine.start(tickMs),

    stop: () => engine.stop(),

    status: () => engine.status(),

    history: (limit) => engine.history(limit)

};
