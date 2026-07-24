// ==================================
// VERONICA VOICE -- TEXT TO SPEECH
// ==================================
//
// Wraps Piper (see core/voice/config.js's textToSpeech() for the
// configured binary/model paths, and core/voice/voiceIdentity.js for
// VERONICA's own vocal characteristics -- this file never decides those
// itself). speak() pipes real text into Piper's stdin (its real,
// documented CLI usage -- `... | piper --model M --length_scale R
// --output_file out.wav`), writes the resulting WAV to a real temp
// file, then plays it with the configured playback command (`afplay`
// by default, built into macOS). Never fabricates audio playback when
// unconfigured -- it rejects with a clear error, same discipline as
// speechToText.js.
//
// Accepts either a bare string (the original, still-supported shape) or
// Task 2's `{ text, context }` shape -- `context` (e.g.
// `{ agent: "system" }`) is accepted and threaded through to the
// resolved result for traceability, but deliberately does not change
// HOW anything is spoken today: no per-agent voice switching is built
// here, since that wasn't asked for and would risk exactly the kind of
// hardcoded-personality behavior Phase 44 explicitly ruled out. It's a
// real, intentional extension seam for later, not a silent no-op.
//
// Task 5 (Voice Interruption): stopPlayback()/isSpeaking() expose the
// one real hook core/voice/voiceEngine.js needs to cut off audio
// output specifically (never agent execution, which has already
// finished by the time anything is playing) when a new wake word
// arrives mid-response.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const config = require("./config");
const voiceIdentity = require("./voiceIdentity");


function isConfigured(){
    return config.status().textToSpeech.configured;
}


function normalizeInput(input){

    if(typeof input === "string"){
        return { text: input, context: {} };
    }

    return { text: input?.text, context: input?.context || {} };

}


let currentPlaybackChild = null;
let interruptRequested = false;


function isSpeaking(){
    return Boolean(currentPlaybackChild);
}


// Kills the real, currently-playing audio process, if any -- the only
// thing this ever touches is playback; a real Router/agent call already
// completed long before there's anything to speak, so there is nothing
// here that could ever "interrupt agent execution."
function stopPlayback(){

    if(!currentPlaybackChild){
        return { stopped: false, reason: "not playing" };
    }

    interruptRequested = true;
    currentPlaybackChild.kill();

    return { stopped: true };

}


function speak(input, { spawnFn = spawn, play = true } = {}){

    const { text, context } = normalizeInput(input);

    return new Promise((resolve, reject) => {

        if(!isConfigured()){
            return reject(new Error("Text-to-speech is not configured -- set PIPER_PATH and PIPER_MODEL (see core/voice/config.js)."));
        }

        if(!text || !text.trim()){
            return reject(new Error("No text given to speak()."));
        }

        const { binaryPath, playbackCommand } = config.textToSpeech();
        const identity = voiceIdentity.get();

        const outputPath = path.join(os.tmpdir(), `veronica-voice-${crypto.randomUUID()}.wav`);

        const child = spawnFn(binaryPath, [
            "--model", identity.voiceModel,
            "--length_scale", String(identity.speakingRate),
            "--output_file", outputPath
        ]);

        let stderr = "";

        child.stdin.write(text);
        child.stdin.end();

        child.stderr.on("data", chunk => { stderr += chunk.toString(); });

        child.on("error", reject);

        child.on("exit", code => {

            if(code !== 0){
                return reject(new Error(`Piper exited with code ${code}: ${stderr.trim()}`));
            }

            if(!play){
                return resolve({ outputPath, played: false, interrupted: false, context });
            }

            currentPlaybackChild = spawnFn(playbackCommand, [outputPath]);

            currentPlaybackChild.on("error", reject);

            currentPlaybackChild.on("exit", playerCode => {

                const interrupted = interruptRequested;

                currentPlaybackChild = null;
                interruptRequested = false;

                resolve({ outputPath, played: playerCode === 0 && !interrupted, interrupted, context });

            });

        });

    });

}


module.exports = { isConfigured, speak, isSpeaking, stopPlayback };
