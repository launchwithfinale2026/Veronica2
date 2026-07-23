// ==================================
// VERONICA BOOT SEQUENCE
// ==================================
//
// Project 1 (Complete Boot Process). A real, one-time record of when
// each real boot stage actually completed -- not a fabricated progress
// bar with invented delays between steps. `dashboard/backend/server.js`'s
// own top-level module code already loads memory/agents/departments/
// packages/automations in a real, meaningful order (Node's synchronous
// require() model means most of this genuinely completes within
// milliseconds of each other) -- this module just records that real
// order as it happens, so `GET /api/system/boot-status` (and the
// dashboard's boot progress display) reflects what ACTUALLY happened,
// not a simulation of a slower boot for cosmetic effect.
//
// markStage() is idempotent -- calling it again for an already-
// completed stage is a no-op, so requiring this module more than once
// (e.g. from a test) never double-records a stage.

const STAGES = [
    "initializing",
    "loading_configuration",
    "loading_memory",
    "loading_companies",
    "loading_departments",
    "loading_packages",
    "loading_connectors",
    "loading_automations",
    "loading_dashboard",
    "running_diagnostics",
    "online"
];

const startedAt = new Date().toISOString();
let completed = [];


function markStage(stage){

    if(!STAGES.includes(stage)){
        throw new Error(`Unknown boot stage: "${stage}" (must be one of ${STAGES.join(", ")})`);
    }

    if(completed.some(entry => entry.stage === stage)){
        return status();
    }

    completed.push({ stage, completedAt: new Date().toISOString() });

    const bus = require("../bus");
    bus.publish("boot.stageCompleted", { stage });

    return status();

}


function status(){

    const currentIndex = completed.length;
    const currentStage = STAGES[currentIndex] || null;

    return {
        startedAt,
        stages: STAGES,
        completed,
        currentStage,
        online: completed.some(entry => entry.stage === "online"),
        progressPercent: Math.round((completed.length / STAGES.length) * 100)
    };

}


// Test-only: resets the module's in-memory state so a test doesn't
// inherit stages this same process already marked complete earlier.
// Never called from real boot code.
function _resetForTests(){
    completed = [];
}


module.exports = { STAGES, markStage, status, _resetForTests };
