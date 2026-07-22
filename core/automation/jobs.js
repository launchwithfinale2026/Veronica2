// ==================================
// VERONICA AUTOMATION — BUILT-IN JOBS
// ==================================
//
// Registers the two jobs Phases 6 and 7 explicitly deferred scheduling
// for ("Not scheduled -- trigger manually... until Phase 8 adds real
// scheduling"). This is the one file in core/automation that's allowed to
// depend on core/executive/core/learning -- the engine itself
// (core/automation/engine.js) stays generic on purpose (see its header
// comment), so this wiring lives separately.

const CONSOLIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly, per the milestone's own framing
const RECOMMEND_INTERVAL_MS = 24 * 60 * 60 * 1000;


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

    engine.schedule("consolidate", CONSOLIDATE_INTERVAL_MS);
    engine.schedule("learning-recommend", RECOMMEND_INTERVAL_MS);

}


module.exports = { registerBuiltInJobs };
