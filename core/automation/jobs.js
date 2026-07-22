// ==================================
// VERONICA AUTOMATION — BUILT-IN JOBS
// ==================================
//
// Registers the jobs earlier phases explicitly deferred scheduling for
// ("Not scheduled -- trigger manually... until Phase 8 adds real
// scheduling"). This is the one file in core/automation that's allowed to
// depend on core/executive/core/learning -- the engine itself
// (core/automation/engine.js) stays generic on purpose (see its header
// comment), so this wiring lives separately.

const SelfMonitor = require("../executive/selfMonitor");

const CONSOLIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly, per the milestone's own framing
const RECOMMEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SELF_MONITOR_INTERVAL_MS = 60 * 60 * 1000; // hourly -- cheap to run (skips the real API call entirely when nothing's wrong)


function registerBuiltInJobs(engine){

    // Required here, not at module top level -- core/executive depends on
    // core/intelligence -> core/brain -> core/tools, and if this module
    // were ever required from a tool handler (it isn't today, but
    // core/automation/index.js is a plain facade that could be), a
    // top-level require would risk the same circular-load class of bug
    // documented in "Goal Decomposition Engine." Cheap insurance for a
    // function that only runs once at boot anyway.
    const executive = require("../executive");
    const learning = require("../learning");

    engine.registerJob("consolidate", () => executive.consolidate());
    engine.registerJob("learning-recommend", () => learning.recommend());

    // `engine` here is the live AutomationEngine instance this very
    // function was called with -- passed directly to SelfMonitor rather
    // than letting it require("../automation") itself, which would
    // re-enter core/automation/index.js while it's still mid-load (this
    // function runs from inside that module's own top-level execution).
    // See core/executive/selfMonitor.js's constructor comment.
    const selfMonitor = new SelfMonitor({ executive, learning, automationEngine: engine });

    engine.registerJob("self-monitor", () => selfMonitor.runSelfCheck());

    engine.schedule("consolidate", CONSOLIDATE_INTERVAL_MS);
    engine.schedule("learning-recommend", RECOMMEND_INTERVAL_MS);
    engine.schedule("self-monitor", SELF_MONITOR_INTERVAL_MS);

}


module.exports = { registerBuiltInJobs };
