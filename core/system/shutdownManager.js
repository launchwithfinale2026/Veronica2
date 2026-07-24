// ==================================
// VERONICA SYSTEM LIFECYCLE -- SHUTDOWN MANAGER
// ==================================
//
// Phase 46. A real, ordered graceful shutdown -- this genuinely did not
// exist before: core/logging/crashGuard.js handles an uncaught
// exception/rejection (log + exit), and core/system/startupManager.js's
// own SIGINT/SIGTERM handlers just kill the CHILD process abruptly
// (`this.child.kill()`, no in-process cleanup ceremony inside the
// child itself). Nothing previously ran an orderly "stop accepting
// work, save real state, stop voice, stop automation, close
// connections" sequence for the dashboard process itself.
//
// Every step here calls a real, already-existing stop/close method --
// this module doesn't reimplement how to stop voice or automation, it
// just calls them in the right order and records what happened.

const log = require("../logging");
const recoveryManager = require("./recoveryManager");

let acceptingCommands = true;


function isAcceptingCommands(){
    return acceptingCommands;
}


function stopAcceptingCommands(){
    acceptingCommands = false;
}


// Real no-op, documented rather than silently omitted: core/logging's
// log()/persist() write synchronously (fs.appendFileSync) -- there is
// no real in-memory buffer to flush. Kept as a real function (not
// skipped entirely) so the requested shutdown step exists as a real,
// callable, testable point -- honest about doing nothing rather than
// fabricating a flush that isn't needed.
function flushLogs(){
    return { flushed: true, note: "core/logging writes synchronously; nothing was buffered." };
}


// Real, ordered sequence: stop accepting commands -> save real state ->
// stop voice -> stop automation -> flush logs -> close connections ->
// OFFLINE. Every dependency is injected (matching this codebase's
// established DI-for-testability convention -- see
// core/executive/actionProposal.js's `departments` override,
// core/system/healthScore.js's override params) so this is fully
// testable without a real HTTP server or a real voice engine running.
async function gracefulShutdown({
    reason = "unspecified",
    systemState,
    voice = require("../voice"),
    automation = require("../automation"),
    httpServer = null,
    activeTasks = [],
    failures = []
} = {}){

    if(!systemState){
        throw new Error("gracefulShutdown() requires a real SystemState instance.");
    }

    log.info("shutdown-manager", `Graceful shutdown starting: ${reason}`);

    if(systemState.state !== "SHUTTING_DOWN"){
        systemState.transition("SHUTTING_DOWN", reason);
    }

    stopAcceptingCommands();

    const snapshot = recoveryManager.saveSnapshot(systemState.snapshot(), { reason, activeTasks, failures });

    let voiceStopped = false;
    try {
        if(voice && voice.status().engineState !== "IDLE"){
            voice.stop();
            voiceStopped = true;
        }
    } catch(error){
        log.warn("shutdown-manager", `Failed to stop voice cleanly: ${error.message}`);
    }

    let automationStopped = false;
    try {
        if(automation && automation.status().running){
            automation.stop();
            automationStopped = true;
        }
    } catch(error){
        log.warn("shutdown-manager", `Failed to stop automation cleanly: ${error.message}`);
    }

    const logResult = flushLogs();

    let connectionsClosed = false;
    if(httpServer){
        await new Promise(resolve => httpServer.close(() => { connectionsClosed = true; resolve(); }));
    }

    const shutdownRecord = recoveryManager.recordShutdown({ reason, activeTasks, failures });

    systemState.transition("OFFLINE", reason);

    log.info("shutdown-manager", `Graceful shutdown complete: ${reason}`);

    return {
        reason,
        snapshot,
        voiceStopped,
        automationStopped,
        logResult,
        connectionsClosed,
        shutdownRecord
    };

}


// Test-only: resets the module-level "accepting commands" flag.
function _resetForTests(){
    acceptingCommands = true;
}


module.exports = {
    isAcceptingCommands,
    stopAcceptingCommands,
    flushLogs,
    gracefulShutdown,
    _resetForTests
};
