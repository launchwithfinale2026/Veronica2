// ==================================
// VERONICA VOICE -- TEXT TO SPEECH
// ==================================
//
// Wraps Piper (see core/voice/config.js's textToSpeech() for the
// configured binary/model paths). speak() pipes real text into Piper's
// stdin (its real, documented CLI usage -- `... | piper --model M
// --output_file out.wav`), writes the resulting WAV to a real temp
// file, then plays it with the configured playback command (`afplay`
// by default, built into macOS). Never fabricates audio playback when
// unconfigured -- it rejects with a clear error, same discipline as
// speechToText.js.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const config = require("./config");


function isConfigured(){
    return config.status().textToSpeech.configured;
}


function speak(text, { spawnFn = spawn, play = true } = {}){

    return new Promise((resolve, reject) => {

        if(!isConfigured()){
            return reject(new Error("Text-to-speech is not configured -- set VOICE_PIPER_BINARY_PATH and VOICE_PIPER_MODEL_PATH (see core/voice/config.js)."));
        }

        if(!text || !text.trim()){
            return reject(new Error("No text given to speak()."));
        }

        const { binaryPath, modelPath, playbackCommand } = config.textToSpeech();

        const outputPath = path.join(os.tmpdir(), `veronica-voice-${crypto.randomUUID()}.wav`);

        const child = spawnFn(binaryPath, ["--model", modelPath, "--output_file", outputPath]);

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
                return resolve({ outputPath, played: false });
            }

            const player = spawnFn(playbackCommand, [outputPath]);

            player.on("error", reject);

            player.on("exit", playerCode => {
                resolve({ outputPath, played: playerCode === 0 });
            });

        });

    });

}


module.exports = { isConfigured, speak };
