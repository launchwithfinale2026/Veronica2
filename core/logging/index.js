// ==================================
// VERONICA STRUCTURED LOGGING
// ==================================
//
// A minimal leveled logger, not a replacement for the existing
// console.log("[MODULE] ...") calls scattered through the rest of the
// codebase -- rewriting every one of those to route through here would be
// a large, high-risk, low-value change to working, tested code (see
// docs/Architecture.md "Production Hardening" for why this stays scoped).
// What this adds that plain console.log doesn't: warn/error levels
// persist to a JSON-lines file (core/logging/errors.log, gitignored like
// core/learning/executions.log), so a crash or repeated failure leaves a
// durable trace to inspect after the fact, not just scrollback that's
// gone once the terminal closes.

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "errors.log");

const LEVELS = ["debug", "info", "warn", "error"];


function persist(level, module_, message, meta){

    const entry = {
        level,
        module: module_,
        message,
        meta: meta || undefined,
        timestamp: new Date().toISOString()
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");

    return entry;

}


function log(level, module_, message, meta){

    const line = `[${level.toUpperCase()}] [${module_}] ${message}`;

    if(level === "error"){
        console.error(line, meta || "");
    } else if(level === "warn"){
        console.warn(line, meta || "");
    } else {
        console.log(line, meta || "");
    }

    // Only warn/error persist to disk -- debug/info are exactly what
    // console already shows, and persisting every info line would make
    // errors.log noise instead of a signal worth reading after a crash.
    if(level === "warn" || level === "error"){
        return persist(level, module_, message, meta);
    }

    return null;

}


function readErrors(limit = 50){

    if(!fs.existsSync(LOG_FILE)){
        return [];
    }

    const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);

    return lines.slice(-limit).reverse().map(line => JSON.parse(line));

}


module.exports = {

    debug: (module_, message, meta) => log("debug", module_, message, meta),
    info: (module_, message, meta) => log("info", module_, message, meta),
    warn: (module_, message, meta) => log("warn", module_, message, meta),
    error: (module_, message, meta) => log("error", module_, message, meta),

    readErrors,

    LEVELS,
    LOG_FILE

};
