// ==================================
// VERONICA VOICE -- CONVERSATION STATE
// ==================================
//
// Task 4 (Phase 44). One real, observable state machine for the voice
// layer's own conversational lifecycle: is it currently speaking or
// listening, what was the last real command/response, and whether the
// current turn was interrupted. Deliberately separate from
// core/router's/core/agents' own state -- those track WHAT VERONICA is
// doing (executing a task, which department); this tracks HOW the
// voice INTERFACE is behaving right now, a distinct, much simpler
// concern core/voice/voiceEngine.js delegates to instead of tracking
// with ad hoc strings of its own.
//
// "LISTENING" is intentionally coarse: it covers both "waiting for the
// wake word" and "actively recording a command after one was detected"
// -- from an outside observer, VERONICA is listening either way.
// voiceEngine.js tracks the finer-grained distinction (which of those
// two it's doing right now, for real audio-routing purposes) privately;
// this module only exposes the vocabulary Task 4 asked for.
//
// Publishes its own real bus event on every transition -- the same
// established pattern core/system/bootSequence.js's markStage() and
// core/system/runtimeState.js's setState() already use: the
// state-tracking module publishes its own event, so nothing has to
// reimplement "did this actually change" logic to be observable.

const bus = require("../bus");
const events = require("./events");

const STATES = ["IDLE", "LISTENING", "PROCESSING", "SPEAKING", "INTERRUPTED"];

// What each state is allowed to transition to -- real guardrails, not
// just documentation: an invalid transition throws rather than silently
// corrupting the tracked conversation.
const VALID_TRANSITIONS = {
    IDLE: ["LISTENING"],
    LISTENING: ["PROCESSING", "IDLE"],
    PROCESSING: ["SPEAKING", "LISTENING", "IDLE"],
    SPEAKING: ["LISTENING", "INTERRUPTED", "IDLE"],
    INTERRUPTED: ["LISTENING", "IDLE"]
};


class ConversationState {

    constructor(){
        this.reset();
    }


    reset(){
        this.state = "IDLE";
        this.lastCommand = null;
        this.lastResponse = null;
        this.interrupted = false;
        this.updatedAt = new Date().toISOString();
    }


    isSpeaking(){
        return this.state === "SPEAKING";
    }


    isListening(){
        return this.state === "LISTENING";
    }


    // `meta.command`/`meta.response` update the real last-command/
    // last-response fields when provided -- optional, since not every
    // transition carries new content (e.g. LISTENING -> PROCESSING
    // doesn't have a response yet).
    transition(next, meta = {}){

        if(!STATES.includes(next)){
            throw new Error(`Unknown conversation state: "${next}"`);
        }

        const allowed = VALID_TRANSITIONS[this.state] || [];

        if(!allowed.includes(next)){
            throw new Error(`Invalid conversation state transition: "${this.state}" -> "${next}"`);
        }

        const previous = this.state;

        this.state = next;
        this.updatedAt = new Date().toISOString();

        if(meta.command !== undefined){
            this.lastCommand = meta.command;
        }

        if(meta.response !== undefined){
            this.lastResponse = meta.response;
        }

        if(next === "INTERRUPTED"){
            this.interrupted = true;
        } else if(next === "LISTENING"){
            this.interrupted = false;
        }

        // Only the specific, semantically-named events (Task 6) are
        // published here -- STATUS_CHANGED is reserved exclusively for
        // core/voice/voiceEngine.js's own Task 7 dashboard-status shape
        // (`{ voiceStatus: {...} }`), published via its publishStatus(),
        // so the same event name never carries two different payload
        // shapes depending on which code path fired it.
        this.publishTransitionEvent(previous, next);

        return this.snapshot();

    }


    // Determines which specific, semantically-named event (Task 6:
    // VOICE_SPEAKING_STARTED / VOICE_SPEAKING_FINISHED /
    // VOICE_INTERRUPTED) this real transition represents, purely from
    // the (previous, next) pair -- no ambiguity, since only one real
    // transition shape matches each case.
    publishTransitionEvent(previous, next){

        if(next === "SPEAKING"){
            bus.publish(events.SPEAKING_STARTED, this.snapshot());
            return;
        }

        if(previous === "SPEAKING" && next === "LISTENING"){
            bus.publish(events.SPEAKING_FINISHED, this.snapshot());
            return;
        }

        if(next === "INTERRUPTED"){
            bus.publish(events.INTERRUPTED, this.snapshot());
            return;
        }

    }


    snapshot(){
        return {
            state: this.state,
            lastCommand: this.lastCommand,
            lastResponse: this.lastResponse,
            interrupted: this.interrupted,
            updatedAt: this.updatedAt
        };
    }

}


module.exports = ConversationState;
module.exports.STATES = STATES;
