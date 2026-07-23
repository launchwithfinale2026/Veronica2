// ==================================
// VERONICA RUNTIME STATE REGISTRY
// ==================================
//
// Project 4 (Runtime Reliability). A real, generic registry any
// runtime component can report its own real state into --
// online/offline/starting/stopping/error/restarting -- rather than
// each subsystem inventing its own ad hoc status shape. "Self-monitored,
// failures logged, recovery attempted where safe, explain every
// recovery action": this module doesn't attempt recovery itself (that
// stays each real component's own job -- e.g.
// core/system/startupManager.js's already-real backoff-restart logic),
// it's the one place every component's real state and the real reason
// behind a transition gets recorded, so nothing has to re-implement its
// own state-tracking to be observable here.
//
// In-memory only, per-process -- this describes what's ALIVE RIGHT NOW
// in this process, not persisted history across restarts (that's what
// core/learning/log.js's execution telemetry and this file's own
// bounded `history` array are each already for, at different
// granularities).

const bus = require("../bus");

const STATES = ["online", "offline", "starting", "stopping", "error", "restarting"];

const MAX_HISTORY_PER_COMPONENT = 20;

const components = new Map();


function register(name, initialState = "starting"){
    return setState(name, initialState);
}


// `reason` is optional for a routine transition (e.g. "starting" ->
// "online") but is exactly what makes an "error"/"restarting"
// transition explainable rather than a bare status flip.
function setState(name, state, reason = null){

    if(!STATES.includes(state)){
        throw new Error(`Invalid runtime state: "${state}" (must be one of ${STATES.join(", ")})`);
    }

    const existing = components.get(name);
    const previousState = existing ? existing.state : null;

    const historyEntry = { from: previousState, to: state, reason, at: new Date().toISOString() };

    const entry = {
        name,
        state,
        reason,
        updatedAt: historyEntry.at,
        history: [...(existing ? existing.history : []), historyEntry].slice(-MAX_HISTORY_PER_COMPONENT)
    };

    components.set(name, entry);

    bus.publish("runtime.stateChanged", { name, state, reason, previousState });

    return toRecord(entry);

}


function toRecord(entry){
    return { name: entry.name, state: entry.state, reason: entry.reason, updatedAt: entry.updatedAt };
}


function getState(name){

    const entry = components.get(name);

    if(!entry){
        throw new Error(`Unknown runtime component: "${name}"`);
    }

    return toRecord(entry);

}


function all(){
    return [...components.values()].map(toRecord);
}


function history(name){

    const entry = components.get(name);

    if(!entry){
        throw new Error(`Unknown runtime component: "${name}"`);
    }

    return entry.history;

}


// Test-only: clears every registered component. Never called from real
// runtime code -- components naturally persist for the life of the
// process.
function _resetForTests(){
    components.clear();
}


module.exports = { STATES, register, setState, getState, all, history, _resetForTests };
