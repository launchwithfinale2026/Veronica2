// ==================================
// VERONICA SYSTEM LIFECYCLE -- STATE MACHINE
// ==================================
//
// Phase 46. The real, single source of truth for VERONICA's own
// overall lifecycle -- OFFLINE/STARTING/CONFIGURING/LOADING/
// RECOVERING/VERIFYING/READY/DEGRADED/FAILED/SHUTTING_DOWN. Same proven
// pattern core/voice/conversationState.js already established: a pure,
// guarded state machine (an invalid transition throws rather than
// silently corrupting the tracked lifecycle), publishing its own real
// bus event on every transition.
//
// Deliberately separate from core/system/bootSequence.js (a one-time,
// forward-only record of which of THIS PROCESS's real boot stages have
// completed -- see that file's own header) and
// core/system/runtimeState.js (per-COMPONENT online/offline/error
// tracking). This is the one, coarser, SYSTEM-wide lifecycle those two
// finer-grained trackers feed into -- core/system/bootManager.js is
// what actually drives transitions here, consuming bootSequence/
// runtimeState/healthManager signals to decide when to move from one
// state to the next.

const bus = require("../bus");
const events = require("./systemEvents");

const STATES = [
    "OFFLINE", "STARTING", "CONFIGURING", "LOADING", "RECOVERING",
    "VERIFYING", "READY", "DEGRADED", "FAILED", "SHUTTING_DOWN"
];

// SHUTTING_DOWN is reachable from every real state except OFFLINE
// (already off) and itself -- a real SIGINT/SIGTERM can arrive at any
// point during boot (before READY/DEGRADED/FAILED is ever reached), and
// a graceful shutdown must still be possible then, not just once boot
// has settled. Built by starting from the routine forward-progress
// graph and adding the one real interrupt transition every non-OFFLINE
// state needs.
const VALID_TRANSITIONS = {
    OFFLINE: ["STARTING"],
    STARTING: ["CONFIGURING", "FAILED"],
    CONFIGURING: ["LOADING", "FAILED"],
    LOADING: ["RECOVERING", "VERIFYING", "FAILED"],
    RECOVERING: ["VERIFYING", "FAILED"],
    VERIFYING: ["READY", "DEGRADED", "FAILED"],
    READY: ["DEGRADED", "SHUTTING_DOWN"],
    DEGRADED: ["READY", "SHUTTING_DOWN", "FAILED"],
    FAILED: ["SHUTTING_DOWN", "STARTING"],
    SHUTTING_DOWN: ["OFFLINE"]
};

for(const state of STATES){
    if(state !== "OFFLINE" && state !== "SHUTTING_DOWN"){
        if(!VALID_TRANSITIONS[state].includes("SHUTTING_DOWN")){
            VALID_TRANSITIONS[state].push("SHUTTING_DOWN");
        }
    }
}

// Which specific event (beyond the generic STATE_CHANGED, always
// published) a given target state maps to -- one real, unambiguous
// event per real meaning, not five different ways to notice the same
// thing.
const EVENT_BY_TARGET_STATE = {
    READY: events.READY,
    DEGRADED: events.DEGRADED,
    FAILED: events.FAILURE,
    SHUTTING_DOWN: events.SHUTDOWN_STARTED,
    OFFLINE: events.OFFLINE
};


class SystemState {

    constructor(){
        this.reset();
    }


    reset(){
        this.state = "OFFLINE";
        this.history = [];
        this.lastReason = null;
        this.updatedAt = new Date().toISOString();
    }


    isReady(){
        return this.state === "READY";
    }


    isOperational(){
        return this.state === "READY" || this.state === "DEGRADED";
    }


    // `reason` is optional for a routine transition but is exactly what
    // makes a FAILED/DEGRADED/SHUTTING_DOWN transition explainable
    // rather than a bare state flip -- same discipline
    // core/system/runtimeState.js's setState() already established.
    transition(next, reason = null){

        if(!STATES.includes(next)){
            throw new Error(`Unknown system state: "${next}"`);
        }

        const allowed = VALID_TRANSITIONS[this.state] || [];

        if(!allowed.includes(next)){
            throw new Error(`Invalid system state transition: "${this.state}" -> "${next}"`);
        }

        const previous = this.state;
        const timestamp = new Date().toISOString();

        this.state = next;
        this.lastReason = reason;
        this.updatedAt = timestamp;

        this.history.push({ from: previous, to: next, reason, at: timestamp });
        this.history = this.history.slice(-50);

        bus.publish(events.STATE_CHANGED, { previous, current: next, timestamp, reason });

        const specificEvent = EVENT_BY_TARGET_STATE[next];
        if(specificEvent){
            bus.publish(specificEvent, { previous, current: next, timestamp, reason });
        }

        return this.snapshot();

    }


    snapshot(){
        return {
            state: this.state,
            lastReason: this.lastReason,
            updatedAt: this.updatedAt,
            isOperational: this.isOperational()
        };
    }

}


module.exports = SystemState;
module.exports.STATES = STATES;
