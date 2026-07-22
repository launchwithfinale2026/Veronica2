// Facade over the automation subsystem -- same flat-object pattern as
// core/executive/index.js and core/learning/index.js. Registers the
// built-in jobs (consolidate, learning-recommend) once, at module load --
// registration and scheduling are idempotent/cheap, but start() (the
// actual recurring timer) is NOT called here. A long-running host process
// (dashboard/backend/server.js's real boot path) opts in explicitly, so
// requiring this module from a test or a one-off script never starts a
// background timer nobody asked for.

const AutomationEngine = require("./engine");
const { registerBuiltInJobs } = require("./jobs");

const engine = new AutomationEngine();

registerBuiltInJobs(engine);

module.exports = {

    engine,

    enqueue: (jobName, options) => engine.enqueue(jobName, options),

    runNow: (jobName) => engine.runNow(jobName),

    schedule: (jobName, intervalMs) => engine.schedule(jobName, intervalMs),

    start: (tickMs) => engine.start(tickMs),

    stop: () => engine.stop(),

    status: () => engine.status(),

    history: (limit) => engine.history(limit)

};
