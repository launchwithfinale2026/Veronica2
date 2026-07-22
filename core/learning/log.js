// ==================================
// VERONICA LEARNING — EXECUTION LOG
// ==================================
//
// A flat JSON-lines append log of execution outcomes (department runs,
// tool calls) -- the raw material core/learning/engine.js aggregates into
// performance stats and recommendations. Deliberately a separate file,
// not memory entries: this is high-frequency operational telemetry (one
// entry per tool call / department run), not curated content an agent
// should be reasoning over or that memory.search() should surface --
// mixing the two would pollute context retrieval with noise. Same shape
// of decision as departments/<id>/logs/activity.log already being a
// separate file rather than memory entries (see docs/Architecture.md
// "Learning Engine").

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOG_FILE = path.join(__dirname, "executions.log");


// event: { kind: "department_run"|"tool_call", outcome: "success"|"failure",
// durationMs, ...subject fields (department/agent/tool), error? }
function record(event){

    const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...event
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");

    return entry;

}


function readAll(){

    if(!fs.existsSync(LOG_FILE)){
        return [];
    }

    return fs.readFileSync(LOG_FILE, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(line => JSON.parse(line));

}


module.exports = { record, readAll, LOG_FILE };
