// ==================================
// VERONICA VOICE -- SPEECH TO TEXT
// ==================================
//
// Wraps whisper.cpp (see core/voice/config.js's speechToText() for the
// configured binary/model paths) as a one-shot child process per
// utterance -- no persistent process to manage, unlike wakeWord.js's
// always-listening detector. transcribe() spawns the real binary
// against a real audio file with `--no-timestamps` (the same flag
// wrapper libraries like nodejs-whisper use to get a clean transcript on
// stdout) and resolves with that real output -- it never fabricates a
// transcript when unconfigured, missing the file, or the binary fails;
// it rejects instead.

const fs = require("fs");
const { spawn } = require("child_process");

const config = require("./config");


function isConfigured(){
    return config.status().speechToText.configured;
}


function transcribe(audioPath, { spawnFn = spawn } = {}){

    return new Promise((resolve, reject) => {

        if(!isConfigured()){
            return reject(new Error("Speech-to-text is not configured -- set VOICE_WHISPER_BINARY_PATH and VOICE_WHISPER_MODEL_PATH (see core/voice/config.js)."));
        }

        if(!audioPath || !fs.existsSync(audioPath)){
            return reject(new Error(`Audio file not found: "${audioPath}"`));
        }

        const { binaryPath, modelPath } = config.speechToText();

        const child = spawnFn(binaryPath, [
            "-m", modelPath,
            "-f", audioPath,
            "--no-timestamps"
        ]);

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", chunk => { stdout += chunk.toString(); });
        child.stderr.on("data", chunk => { stderr += chunk.toString(); });

        child.on("error", reject);

        child.on("exit", code => {

            if(code !== 0){
                return reject(new Error(`whisper.cpp exited with code ${code}: ${stderr.trim()}`));
            }

            resolve(stdout.trim());

        });

    });

}


module.exports = { isConfigured, transcribe };
