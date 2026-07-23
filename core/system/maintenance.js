// ==================================
// VERONICA AUTONOMOUS MAINTENANCE
// ==================================
//
// Project G. "Run only approval-free maintenance" -- the one real,
// safe, reversible action here is log ARCHIVAL (rename, never delete):
// core/learning/executions.log and core/logging/errors.log are the two
// real files this codebase appends to forever with no existing
// rotation, and this machine's real errors.log is already several
// hundred KB. Archiving moves the file aside once it crosses a real
// size threshold; nothing is ever destroyed, and the next write simply
// starts a fresh file at the same path.
//
// Anything riskier than that -- deduplication, "repair references,"
// removing data -- is deliberately a REPORT here, not an automatic
// action, reusing core/system/selfImprovement.js's existing real checks
// (duplicated capability tools, broken capabilities) rather than
// inventing new destructive ones. "Never remove human oversight" means
// VERONICA surfaces what MIGHT need cleanup; she doesn't decide to
// clean it up herself.

const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB


// Real, reversible archival: renames (not deletes) a log file once it
// crosses `maxBytes`, into a timestamped path under an "archive/"
// subdirectory next to it. A no-op (not an error) for a log file that
// doesn't exist yet, or one still under threshold.
function archiveLogIfLarge(logPath, { maxBytes = DEFAULT_MAX_LOG_BYTES } = {}){

    if(!fs.existsSync(logPath)){
        return { archived: false, reason: "log file does not exist yet" };
    }

    const stats = fs.statSync(logPath);

    if(stats.size <= maxBytes){
        return { archived: false, reason: `under threshold (${stats.size}/${maxBytes} bytes)`, sizeBytes: stats.size };
    }

    const dir = path.dirname(logPath);
    const base = path.basename(logPath);
    const archiveDir = path.join(dir, "archive");

    fs.mkdirSync(archiveDir, { recursive: true });

    const archivePath = path.join(archiveDir, `${base}.${new Date().toISOString().replace(/[:.]/g, "-")}`);

    fs.renameSync(logPath, archivePath);

    return { archived: true, archivePath, sizeBytes: stats.size };

}


// The real, bounded, automation-job-callable maintenance action --
// covers the two real, ever-growing logs this codebase actually writes
// to. Lazily required (matches this codebase's standing circular-
// require avoidance convention for anything intelligence/tool-adjacent,
// applied here defensively even though neither module has that chain
// today).
function runLogArchival({ maxBytes } = {}){

    const learningLog = require("../learning/log");
    const log = require("../logging");

    return {
        executionsLog: archiveLogIfLarge(learningLog.LOG_FILE, { maxBytes }),
        errorsLog: archiveLogIfLarge(log.LOG_FILE, { maxBytes })
    };

}


// Report-only. Reuses core/system/selfImprovement.js's existing REAL
// checks -- not a second detection mechanism -- for the riskier
// categories of "maintenance" this phase named (duplicates, broken
// references) that must never be auto-fixed without a human looking.
function consistencyReport(){

    const SelfImprovementEngine = require("./selfImprovement");
    const marketplace = require("../capabilities/marketplace");

    const selfImprovement = new SelfImprovementEngine();

    return {
        generatedAt: new Date().toISOString(),
        duplicatedCapabilityTools: selfImprovement.duplicatedCapabilities(),
        brokenCapabilities: marketplace.categorize().broken.map(c => c.name)
    };

}


module.exports = { archiveLogIfLarge, runLogArchival, consistencyReport, DEFAULT_MAX_LOG_BYTES };
