// ==================================
// VERONICA VOICE -- VOICE IDENTITY
// ==================================
//
// Task 1 (Phase 44). Defines VERONICA's vocal characteristics -- the
// HOW of speaking, never the WHAT: no canned phrases, no greetings, no
// personality responses live here or anywhere in this file. That stays
// entirely with the real agents/Router (core/voice/voiceEngine.js only
// ever speaks whatever real text the Router actually returned). This is
// a pure configuration provider core/voice/textToSpeech.js reads from --
// it has no business logic of its own and makes no decisions about
// content.
//
// Sourced from core/voice/config.js's existing textToSpeech() (so
// PIPER_MODEL/PIPER_PATH stay the one real source of truth for which
// voice model file is on disk) plus a few voice-identity-specific env
// vars for the vocal characteristics themselves.
//
// Honesty about what's real: Piper's actual CLI genuinely supports
// `--length_scale` (speech speed -- higher is slower), which
// `speakingRate` maps to in core/voice/textToSpeech.js. `pitch` and
// `style` are included because Phase 44 asked for them in this exact
// shape, but Piper (as of this writing) has no direct pitch-shift CLI
// flag, and "style" in Piper terms means a different model file
// entirely, not a runtime switch -- both fields are carried through
// faithfully but currently have no effect on Piper's actual output.
// Nothing here fabricates support Piper doesn't have; see
// docs/VOICE_SETUP.md for the honest mapping.

const config = require("./config");

const NAME = "VERONICA";

function get(){

    const tts = config.textToSpeech();

    return {

        name: NAME,

        voiceModel: tts.modelPath || "",

        // Piper's real --length_scale flag: "1.0" is Piper's own
        // default (normal speed); higher values speak slower, lower
        // values faster.
        speakingRate: process.env.VOICE_SPEAKING_RATE || "1.0",

        // No real effect on Piper today (see header comment) -- carried
        // through honestly rather than omitted, since a future TTS
        // provider (or a future Piper version) may support it.
        pitch: process.env.VOICE_PITCH || "default",

        // Informational only today (see header comment) -- not a Piper
        // CLI flag. Useful as a label for which model/voice this
        // deployment considers "VERONICA's voice" once multiple voice
        // models are in play.
        style: process.env.VOICE_STYLE || "calm-professional"

    };

}

module.exports = { get };
