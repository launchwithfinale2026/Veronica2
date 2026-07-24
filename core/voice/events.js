// ==================================
// VERONICA VOICE -- EVENT NAMES
// ==================================
//
// One place naming every real bus event this layer publishes. The
// actual event strings stay in this codebase's established, already-
// tested dotted-lowercase bus convention (see core/bus/index.js and
// e.g. "boot.stageCompleted", "runtime.stateChanged", "memory.updated")
// rather than introducing a second, inconsistent naming style --
// these symbolic constants are what callers import instead of a string
// literal, satisfying the VOICE_WAKE_DETECTED / VOICE_LISTENING /
// VOICE_PROCESSING / VOICE_ERROR names Phase 43 asked for without
// breaking the existing "voice.wakeWordDetected" event it shipped and
// tested. Phase 44 (Voice Identity) adds SPEAKING_STARTED/
// SPEAKING_FINISHED/INTERRUPTED/READY/OFFLINE/STATUS_CHANGED --
// SPEAKING_STARTED/SPEAKING_FINISHED/INTERRUPTED are published by
// core/voice/conversationState.js's own transition() (the same
// established pattern core/system/bootSequence.js/runtimeState.js use:
// the state-tracking module publishes its own transition event);
// READY/OFFLINE/STATUS_CHANGED are published by voiceEngine.js itself,
// since they describe the engine's own lifecycle/status, not a
// conversation-state transition.

module.exports = {

    WAKE_DETECTED: "voice.wakeWordDetected",
    LISTENING: "voice.listening",
    TRANSCRIBED: "voice.transcribed",
    PROCESSING: "voice.processing",
    ROUTED: "voice.routed",
    SPOKEN: "voice.spoken",
    ERROR: "voice.error",

    SPEAKING_STARTED: "voice.speakingStarted",
    SPEAKING_FINISHED: "voice.speakingFinished",
    INTERRUPTED: "voice.interrupted",
    READY: "voice.ready",
    OFFLINE: "voice.offline",
    STATUS_CHANGED: "voice.statusChanged"

};
