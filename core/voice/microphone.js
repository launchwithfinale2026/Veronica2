// ==================================
// VERONICA VOICE -- MICROPHONE INPUT
// ==================================
//
// Captures real microphone audio via a locally-installed recording tool
// (SoX by default -- free, local-first, no cloud audio service, no
// native Node addon to compile or verify). Emits raw PCM chunks as they
// arrive on the real "data" event; consumers (core/voice/voiceEngine.js,
// which feeds them to wakeWord.js for continuous wake-word inference and
// buffers them into a WAV for whisper.cpp once woken) never touch the
// underlying process directly -- the actual capture command is entirely
// swappable (a different tool, a different platform's audio API)
// through core/voice/config.js without touching either caller.
//
// Fails safely: if the configured command isn't installed, start()
// never throws -- it logs a clear diagnostic, emits a real "error"
// event, and returns { started: false }, so a missing microphone/tool
// never crashes VERONICA's boot or any other subsystem.

const { spawn, spawnSync } = require("child_process");
const { EventEmitter } = require("events");

const log = require("../logging");
const config = require("./config");


class Microphone extends EventEmitter {

    constructor({ spawnFn = spawn, spawnSyncFn = spawnSync } = {}){

        super();

        this.spawnFn = spawnFn;
        this.spawnSyncFn = spawnSyncFn;
        this.child = null;

    }


    // Real, synchronous check: actually attempts to invoke the
    // configured command with a harmless flag and inspects the result --
    // never assumes availability just because an env var is set.
    isAvailable(){

        const { command, checkArgs } = config.microphone();

        if(!command){
            return false;
        }

        try {

            const result = this.spawnSyncFn(command, checkArgs);
            return !result.error;

        } catch(error){
            return false;
        }

    }


    start(){

        if(this.child){
            return { started: false, reason: "already running" };
        }

        const { command, args } = config.microphone();

        if(!command){
            const message = "Microphone is not configured -- set VOICE_MIC_COMMAND (see core/voice/config.js).";
            log.warn("voice-microphone", message);
            this.emit("error", new Error(message));
            return { started: false, reason: message };
        }

        try {

            this.child = this.spawnFn(command, args);

            this.child.stdout.on("data", chunk => this.emit("data", chunk));

            // SoX/ffmpeg print real-time progress to stderr, not errors --
            // not surfaced as a Node-level "error", same as any other
            // long-running child process's routine stderr chatter.
            this.child.stderr.on("data", () => {});

            this.child.on("error", error => {
                log.error("voice-microphone", `Microphone process error: ${error.message}`);
                this.child = null;
                this.emit("error", error);
            });

            this.child.on("exit", (code, signal) => {
                if(this.child){
                    log.warn("voice-microphone", `Microphone process exited unexpectedly (code ${code}, signal ${signal})`);
                }
                this.child = null;
                this.emit("stopped", { code, signal });
            });

            log.info("voice-microphone", `Started: ${command} ${args.join(" ")}`);

            return { started: true };

        } catch(error){
            log.error("voice-microphone", `Failed to start microphone: ${error.message}`);
            this.emit("error", error);
            return { started: false, reason: error.message };
        }

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
        return { running: Boolean(this.child), available: this.isAvailable() };
    }

}


module.exports = Microphone;
