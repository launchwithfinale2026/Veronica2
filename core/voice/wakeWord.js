// ==================================
// VERONICA VOICE -- WAKE WORD DETECTION
// ==================================
//
// Wraps an EXTERNAL wake-word inference process (see
// core/voice/config.js's wakeWord() for the exact command/args/model
// contract, and core/voice/external/wake_word_listener.py for a real
// openWakeWord reference implementation) -- this file owns no audio
// capture itself. core/voice/microphone.js owns the real microphone;
// this module only ever receives already-captured raw PCM chunks via
// feed() and pipes them into the inference process's stdin. That's
// deliberate: a wake-word model is a real Python/ONNX dependency this
// codebase has no way to bundle or verify, so spawning a configured
// external process (the same pattern core/system/startupManager.js
// already uses for its own child process) keeps this file's own code
// testable without either one installed -- tests inject a fake
// spawnFn, same convention as tests/system-startup-manager.test.js's
// FakeChild.
//
// This module NEVER transcribes or otherwise processes speech itself --
// it only ever decides wake / no-wake. On each real detection the
// external process prints one bare line to stdout: `WAKE`, which this
// module parses and republishes as a real bus event -- it never
// fabricates a detection, and any other stdout line is ignored.

const { spawn } = require("child_process");

const bus = require("../bus");
const log = require("../logging");
const config = require("./config");
const events = require("./events");


class WakeWordDetector {

    constructor({ spawnFn = spawn } = {}){

        this.spawnFn = spawnFn;
        this.child = null;
        this.buffer = "";

    }


    isConfigured(){
        return config.status().wakeWord.configured;
    }


    start(){

        if(this.child){
            return { started: false, reason: "already running" };
        }

        const { command, args, modelPath } = config.wakeWord();

        if(!command){
            throw new Error("Wake word detection is not configured -- set VOICE_WAKE_WORD_COMMAND (see core/voice/config.js).");
        }

        const fullArgs = modelPath ? [...args, "--model", modelPath] : args;

        log.info("voice-wake-word", `Starting: ${command} ${fullArgs.join(" ")}`);

        this.buffer = "";
        this.child = this.spawnFn(command, fullArgs);

        this.child.stdout.on("data", chunk => this.handleChunk(chunk.toString()));

        this.child.on("exit", (code, signal) => {
            log.warn("voice-wake-word", `Wake word process exited (code ${code}, signal ${signal})`);
            this.child = null;
        });

        return { started: true };

    }


    // Called with each real microphone chunk (see
    // core/voice/voiceEngine.js's wiring) -- piped straight into the
    // external inference process's stdin. No speech is processed or
    // transcribed here; this only ever feeds the wake/no-wake decision.
    // A silent no-op when not running, so a caller doesn't need to
    // track detector lifecycle state itself.
    feed(chunk){

        if(this.child && this.child.stdin.writable){
            this.child.stdin.write(chunk);
        }

    }


    // Buffers partial lines across chunk boundaries -- a real child
    // process's stdout has no guarantee of arriving one full line per
    // "data" event.
    handleChunk(chunk){

        this.buffer += chunk;

        const lines = this.buffer.split("\n");
        this.buffer = lines.pop();

        for(const line of lines){
            this.handleLine(line);
        }

    }


    handleLine(line){

        if(line.trim() !== "WAKE"){
            return;
        }

        bus.publish(events.WAKE_DETECTED, {
            detectedAt: new Date().toISOString()
        });

    }


    stop(){

        if(!this.child){
            return { stopped: false, reason: "not running" };
        }

        this.child.kill();
        this.child = null;

        return { stopped: true };

    }


    status(){
        return { running: Boolean(this.child), configured: this.isConfigured() };
    }

}


module.exports = WakeWordDetector;
