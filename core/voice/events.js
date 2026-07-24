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
// VOICE_PROCESSING / VOICE_ERROR names this phase asked for without
// breaking the existing "voice.wakeWordDetected" event Phase 42 already
// shipped and tested.

module.exports = {

    WAKE_DETECTED: "voice.wakeWordDetected",
    LISTENING: "voice.listening",
    TRANSCRIBED: "voice.transcribed",
    PROCESSING: "voice.processing",
    ROUTED: "voice.routed",
    SPOKEN: "voice.spoken",
    ERROR: "voice.error"

};
