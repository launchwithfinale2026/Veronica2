// ==================================
// VERONICA VOICE CONFIGURATION
// ==================================
//
// Centralizes every path/command the voice layer depends on -- local
// binaries and model files, never API keys or cloud credentials. This
// layer is explicitly local-first (openWakeWord / whisper.cpp / Piper),
// so "configured" means "the file/command actually exists on this
// machine," checked for real with fs.existsSync -- same discipline as
// core/integrations/credentialManager.js's one-place-that-knows-what's-
// configured pattern, just for local executables/models instead of env-
// var credentials.
//
// OFF by default: VOICE_ENABLED must be explicitly "1" or "true".
// Every other piece of this codebase runs without any hardware or child
// process -- voice is the first thing that genuinely needs a real
// microphone and real local binaries, so nothing here activates unless
// asked.
//
// Env var names: WHISPER_PATH / PIPER_PATH / WAKEWORD_MODEL are the
// short, primary names (matching this phase's own example). The longer
// VOICE_WHISPER_BINARY_PATH / VOICE_PIPER_BINARY_PATH /
// VOICE_WAKE_WORD_MODEL_PATH names Phase 42 originally shipped still
// work as a fallback -- no breaking change for anything already set.

const fs = require("fs");

function isEnabled(){
    return process.env.VOICE_ENABLED === "1" || process.env.VOICE_ENABLED === "true";
}

// microphone.js spawns this to capture real audio -- SoX (`sox`, free,
// local, widely available via Homebrew/apt) reading the default input
// device and writing raw 16kHz mono 16-bit signed PCM to stdout, which
// is exactly what both openWakeWord and whisper.cpp expect. `checkArgs`
// is a harmless flag microphone.isAvailable() uses to verify the
// command actually runs on this machine without starting a real
// capture.
function microphone(){

    return {
        command: process.env.VOICE_MIC_COMMAND || "sox",
        args: (process.env.VOICE_MIC_ARGS || "-d -t raw -r 16000 -e signed -b 16 -c 1 -").split(" ").filter(Boolean),
        checkArgs: (process.env.VOICE_MIC_CHECK_ARGS || "--version").split(" ").filter(Boolean),
        sampleRate: Number(process.env.VOICE_MIC_SAMPLE_RATE) || 16000,
        channels: Number(process.env.VOICE_MIC_CHANNELS) || 1,
        bitDepth: Number(process.env.VOICE_MIC_BIT_DEPTH) || 16
    };

}

// openWakeWord itself is a Python library, not a standalone CLI tool.
// VOICE_WAKE_WORD_COMMAND is expected to point at a script (see
// core/voice/external/wake_word_listener.py for a real reference
// implementation) that reads raw PCM frames from STDIN (fed by
// microphone.js via core/voice/voiceEngine.js -- this file never opens
// the microphone itself), runs a wake-word model against them, and --
// on each real detection -- prints one bare line to stdout: `WAKE`.
// core/voice/wakeWord.js only depends on that contract, never on
// openWakeWord specifically -- any wake-word engine that honors it is a
// drop-in replacement. `modelPath` is required for the literal wake
// word "Veronica" -- openWakeWord's own pretrained models don't include
// it; see docs/VOICE_SETUP.md for training a custom one.
function wakeWord(){

    return {
        command: process.env.VOICE_WAKE_WORD_COMMAND || null,
        args: (process.env.VOICE_WAKE_WORD_ARGS || "").split(" ").filter(Boolean),
        modelPath: process.env.WAKEWORD_MODEL || process.env.VOICE_WAKE_WORD_MODEL_PATH || null
    };

}

// whisper.cpp's compiled binary (`main` / `whisper-cli`, depending on
// version) plus a ggml model file -- see core/voice/speechToText.js.
function speechToText(){

    return {
        binaryPath: process.env.WHISPER_PATH || process.env.VOICE_WHISPER_BINARY_PATH || null,
        modelPath: process.env.WHISPER_MODEL || process.env.VOICE_WHISPER_MODEL_PATH || null
    };

}

// Piper's compiled binary plus a voice model -- see
// core/voice/textToSpeech.js. `playbackCommand` defaults to `afplay`
// (built into macOS, this project's real target platform); override for
// another OS.
function textToSpeech(){

    return {
        binaryPath: process.env.PIPER_PATH || process.env.VOICE_PIPER_BINARY_PATH || null,
        modelPath: process.env.PIPER_MODEL || process.env.VOICE_PIPER_MODEL_PATH || null,
        playbackCommand: process.env.VOICE_PLAYBACK_COMMAND || "afplay"
    };

}

// `fields`: { key: { value, checkFile } }. `checkFile: true` verifies
// the value is a real, existing path on disk (fs.existsSync); `false`
// only checks presence (used for `command`, which may be a bare
// executable name resolved via PATH, not a literal path this process
// can stat).
function statusFor(label, fields){

    const missing = [];

    for(const [key, { value, checkFile }] of Object.entries(fields)){

        if(!value){
            missing.push(key);
            continue;
        }

        if(checkFile && !fs.existsSync(value)){
            missing.push(key);
        }

    }

    return { label, configured: missing.length === 0, missing };

}

function status(){

    const ww = wakeWord();
    const stt = speechToText();
    const tts = textToSpeech();

    return {

        enabled: isEnabled(),

        wakeWord: statusFor("Wake word detection", {
            command: { value: ww.command, checkFile: false },
            modelPath: { value: ww.modelPath, checkFile: true }
        }),

        speechToText: statusFor("Speech to text (whisper.cpp)", {
            binaryPath: { value: stt.binaryPath, checkFile: true },
            modelPath: { value: stt.modelPath, checkFile: true }
        }),

        textToSpeech: statusFor("Text to speech (Piper)", {
            binaryPath: { value: tts.binaryPath, checkFile: true },
            modelPath: { value: tts.modelPath, checkFile: true }
        })

    };

}

module.exports = { isEnabled, microphone, wakeWord, speechToText, textToSpeech, status };
