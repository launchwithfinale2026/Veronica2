// ==================================
// VERONICA SYSTEM LIFECYCLE -- RECOVERY MANAGER
// ==================================
//
// Phase 46. Real crash/state recovery -- distinct from
// core/system/startupManager.js's own real crash recovery (which
// restarts the dashboard CHILD PROCESS after a crash, bounded with
// backoff) and from core/automation/engine.js's own real recovery
// (a "running" job found at load time is reset to "pending" so it
// re-runs -- reused here, not duplicated, via automation.status()).
// Those answer "how do we get the process running again." This answers
// "what was VERONICA doing when she went down, and what do we tell the
// operator about it" -- persisting a real, periodic snapshot of
// lifecycle state to runtime/state/, and a real record of the last
// shutdown's reason to runtime/recovery/, so the NEXT boot can report
// real, evidence-based recovery info instead of starting blind.
//
// Every field in every report here is real: read from an actual file,
// an actual device registry, an actual error log, an actual job queue
// -- never a fabricated "active session" or invented "unfinished task."

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const log = require("../logging");

const RUNTIME_DIR = path.join(__dirname, "..", "..", "runtime");
const STATE_FILE = path.join(RUNTIME_DIR, "state", "current.json");
const SHUTDOWN_FILE = path.join(RUNTIME_DIR, "recovery", "last-shutdown.json");
const SNAPSHOTS_DIR = path.join(RUNTIME_DIR, "snapshots");

const MAX_SNAPSHOTS = 20;


function ensureDir(directory){
    if(!fs.existsSync(directory)){
        fs.mkdirSync(directory, { recursive: true });
    }
}


function readJSON(filePath){

    if(!fs.existsSync(filePath)){
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch(error){
        log.warn("recovery-manager", `Failed to parse ${filePath}: ${error.message} -- treating as missing.`);
        return null;
    }

}


function writeJSON(filePath, data){
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}


// Called periodically (and on graceful shutdown) with the real current
// lifecycle snapshot -- also writes a timestamped copy into
// runtime/snapshots/, pruned to the most recent MAX_SNAPSHOTS, so a
// real point-in-time history exists beyond just "the last one."
function saveSnapshot(stateSnapshot, extra = {}){

    const record = {
        ...stateSnapshot,
        savedAt: new Date().toISOString(),
        ...extra
    };

    writeJSON(STATE_FILE, record);

    ensureDir(SNAPSHOTS_DIR);
    // A random suffix (not just the millisecond timestamp) guards
    // against a real filename collision -- two saves can genuinely land
    // in the same millisecond in a tight, synchronous save loop, which
    // would otherwise silently overwrite one snapshot with another.
    const snapshotName = `snapshot-${record.savedAt.replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}.json`;
    writeJSON(path.join(SNAPSHOTS_DIR, snapshotName), record);
    pruneSnapshots();

    return record;

}


function pruneSnapshots(){

    ensureDir(SNAPSHOTS_DIR);

    const files = fs.readdirSync(SNAPSHOTS_DIR)
        .filter(name => name.startsWith("snapshot-") && name.endsWith(".json"))
        .sort();

    const excess = files.length - MAX_SNAPSHOTS;

    for(let i = 0; i < excess; i++){
        fs.unlinkSync(path.join(SNAPSHOTS_DIR, files[i]));
    }

}


// Called by shutdownManager.js at the start of a real graceful
// shutdown -- a record of THIS being a clean, intentional shutdown
// (versus recoverOnBoot() finding no such record, meaning the previous
// run ended in a crash).
function recordShutdown({ reason, activeTasks = [], failures = [] } = {}){

    const record = {
        reason: reason || "unknown",
        timestamp: new Date().toISOString(),
        activeTasks,
        failures
    };

    writeJSON(SHUTDOWN_FILE, record);

    return record;

}


function listSnapshots(){

    ensureDir(SNAPSHOTS_DIR);

    return fs.readdirSync(SNAPSHOTS_DIR)
        .filter(name => name.startsWith("snapshot-") && name.endsWith(".json"))
        .sort();

}


// The real recovery report a fresh boot reads. Every field traces to a
// real read:
//   previousState        -- runtime/state/current.json, if present
//   lastShutdown          -- runtime/recovery/last-shutdown.json, if present
//   wasCleanShutdown       -- true only when a real shutdown record exists
//                             and is at least as recent as the last saved
//                             state (a crash leaves a stale/missing
//                             shutdown record behind a newer state save)
//   unfinishedTasks        -- real automation queue entries still marked
//                             "running" (automation.engine.js's own load-
//                             time logic already resets these to
//                             "pending" so they re-run -- this just
//                             surfaces that real recovery action, not a
//                             second one)
//   recentErrors            -- the real tail of core/logging/errors.log
//   activeDevices            -- real, currently-online devices
//                             (core/device/deviceManager.js's real
//                             heartbeat-derived live status)
function recoverOnBoot({ automation, deviceManager, errorLimit = 10 } = {}){

    const previousState = readJSON(STATE_FILE);
    const lastShutdown = readJSON(SHUTDOWN_FILE);

    let wasCleanShutdown = false;

    if(lastShutdown && previousState){
        wasCleanShutdown = new Date(lastShutdown.timestamp).getTime() >= new Date(previousState.savedAt).getTime();
    } else if(lastShutdown && !previousState){
        wasCleanShutdown = true;
    }

    let unfinishedTasks = [];

    if(automation){
        try {
            unfinishedTasks = automation.status().queue.filter(entry => entry.status === "running");
        } catch(error){
            log.warn("recovery-manager", `Could not read automation queue during recovery: ${error.message}`);
        }
    }

    let activeDevices = [];

    if(deviceManager){
        try {
            activeDevices = deviceManager.networkStatus().filter(d => d.status === "online");
        } catch(error){
            log.warn("recovery-manager", `Could not read device network during recovery: ${error.message}`);
        }
    }

    const recentErrors = log.readErrors(errorLimit);

    return {
        recovered: Boolean(previousState),
        previousState,
        lastShutdown,
        wasCleanShutdown,
        unfinishedTasks,
        recentErrors,
        activeDevices,
        recoveredAt: new Date().toISOString()
    };

}


// Test-only: removes every real file this module manages, so a test
// doesn't inherit state from a previous run or a real machine's actual
// history.
function _resetForTests(){

    for(const filePath of [STATE_FILE, SHUTDOWN_FILE]){
        if(fs.existsSync(filePath)){
            fs.unlinkSync(filePath);
        }
    }

    if(fs.existsSync(SNAPSHOTS_DIR)){
        for(const name of listSnapshots()){
            fs.unlinkSync(path.join(SNAPSHOTS_DIR, name));
        }
    }

}


module.exports = {
    STATE_FILE,
    SHUTDOWN_FILE,
    SNAPSHOTS_DIR,
    saveSnapshot,
    recordShutdown,
    recoverOnBoot,
    listSnapshots,
    _resetForTests
};
