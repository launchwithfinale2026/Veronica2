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
// OFF by default: VOICE_ENABLED must be explicitly "1". Every other
// piece of this codebase runs without any hardware or child process --
// voice is the first thing that genuinely needs a real microphone and
// real local binaries, so nothing here activates unless asked.

const fs = require("fs");

function isEnabled(){
    return process.env.VOICE_ENABLED === "1";
}

// openWakeWord itself is a Python library, not a standalone CLI tool.
// VOICE_WAKE_WORD_COMMAND is expected to point at a script (see
// core/voice/external/wake_word_listener.py for a real reference
// implementation) that owns the microphone, runs a wake-word model
// against it, and -- on each detection -- prints one line to stdout:
//   WAKE <absolute-path-to-a-recorded-utterance.wav>
// core/voice/wakeWord.js only depends on that contract, never on
// openWakeWord specifically -- any wake-word engine that honors it is a
// drop-in replacement.
function wakeWord(){

    return {
        command: process.env.VOICE_WAKE_WORD_COMMAND || null,
        args: (process.env.VOICE_WAKE_WORD_ARGS || "").split(" ").filter(Boolean),
        modelPath: process.env.VOICE_WAKE_WORD_MODEL_PATH || null
    };

}

// whisper.cpp's compiled binary (`main` / `whisper-cli`, depending on
// version) plus a ggml model file -- see core/voice/speechToText.js.
function speechToText(){

    return {
        binaryPath: process.env.VOICE_WHISPER_BINARY_PATH || null,
        modelPath: process.env.VOICE_WHISPER_MODEL_PATH || null
    };

}

// Piper's compiled binary plus a voice model -- see
// core/voice/textToSpeech.js. `playbackCommand` defaults to `afplay`
// (built into macOS, this project's real target platform); override for
// another OS.
function textToSpeech(){

    return {
        binaryPath: process.env.VOICE_PIPER_BINARY_PATH || null,
        modelPath: process.env.VOICE_PIPER_MODEL_PATH || null,
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

module.exports = { isEnabled, wakeWord, speechToText, textToSpeech, status };
