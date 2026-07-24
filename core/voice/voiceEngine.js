// ==================================
// VERONICA VOICE ENGINE
// ==================================
//
// Orchestrates the full requested flow:
//   Microphone -> openWakeWord -> Wake detected -> Record command ->
//   whisper.cpp -> VOICE_INPUT -> Existing Router -> Existing Agent
//   System -> Response -> textToSpeech.js -> Audio output
//
// Deliberately does NOT construct its own Router/agents/departments --
// accepts an already-constructed core/router Router instance (the exact
// same class core/interface/terminal.js's "ask" command already uses),
// so voice reuses the one real router/agent/Claude pipeline instead of
// standing up a second one. Never modifies core/router, core/agents, or
// core/memory.
//
// microphone/wakeWord/speechToText/textToSpeech are all injectable
// (default to the real modules) purely for testability -- the same
// constructor-override pattern already used throughout this codebase
// (e.g. core/executive/actionProposal.js's `departments` override,
// core/system/healthScore.js's override params).
//
// A small real state machine (idle -> waiting -> listening ->
// processing -> waiting) governs the flow so speech is never processed
// before a real wake-word detection: while "waiting", real microphone
// chunks are fed only to wake-word inference; once woken, chunks are
// buffered for transcription instead (and NOT fed back into wake-word
// inference, so the engine can't re-trigger on the tail of its own
// listening window). Every stage publishes a real bus event (see
// core/voice/events.js) so the rest of the system -- dashboard,
// logging, future automation -- can observe voice activity the same
// way it observes everything else.
//
// Failures anywhere in the mic-driven loop (a bad recording, a whisper
// crash, a router error) are caught here, logged, and published as a
// real voice.error event -- they never escape as an unhandled
// rejection/exception, so a voice failure can never affect the
// terminal/dashboard or any other subsystem.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const bus = require("../bus");
const log = require("../logging");
const events = require("./events");
const wav = require("./wav");
const config = require("./config");

const Microphone = require("./microphone");
const WakeWordDetector = require("./wakeWord");
const defaultSpeechToText = require("./speechToText");
const defaultTextToSpeech = require("./textToSpeech");


class VoiceEngine {

    constructor({
        router,
        microphone = new Microphone(),
        wakeWord = new WakeWordDetector(),
        speechToText = defaultSpeechToText,
        textToSpeech = defaultTextToSpeech,
        listenSeconds = Number(process.env.VOICE_LISTEN_SECONDS) || 4
    } = {}){

        if(!router){
            throw new Error("VoiceEngine requires a real core/router Router instance -- see core/voice/index.js's start() for how one is constructed.");
        }

        this.router = router;
        this.microphone = microphone;
        this.wakeWord = wakeWord;
        this.speechToText = speechToText;
        this.textToSpeech = textToSpeech;
        this.listenSeconds = listenSeconds;

        this.state = "idle";
        this.listenBuffer = [];
        this.listenTimer = null;

        this._onMicData = chunk => this.handleMicChunk(chunk);
        this._onMicError = error => this.handleError(error);
        this._onWakeDetected = () => this.beginListening();

    }


    status(){
        return { state: this.state };
    }


    // Real, non-throwing startup checks -- same discipline as
    // core/integrations/credentialManager.js's validateStartup(): log a
    // clear diagnostic per missing piece, never crash. Returns false
    // (without starting anything) if the two pieces the wake pipeline
    // truly cannot function without -- a real microphone and a
    // configured wake-word detector -- aren't available; text-to-speech
    // being unconfigured doesn't block starting (see handleUtterance()'s
    // own graceful "no speech, still routed" path).
    validate(){

        const micAvailable = this.microphone.isAvailable();
        const wakeWordConfigured = this.wakeWord.isConfigured();

        if(!micAvailable){
            log.warn("voice-engine", "Microphone is not available -- voice cannot listen. VERONICA continues operating normally otherwise.");
        }

        if(!wakeWordConfigured){
            log.warn("voice-engine", "Wake word detection is not configured -- voice cannot listen. VERONICA continues operating normally otherwise.");
        }

        return micAvailable && wakeWordConfigured;

    }


    start(){

        if(this.state !== "idle"){
            return { started: false, reason: "already running" };
        }

        if(!this.validate()){
            const error = new Error("Voice engine cannot start -- microphone or wake word detection unavailable (see logged diagnostics).");
            bus.publish(events.ERROR, { message: error.message });
            return { started: false, reason: error.message };
        }

        this.microphone.on("data", this._onMicData);
        this.microphone.on("error", this._onMicError);
        bus.on(events.WAKE_DETECTED, this._onWakeDetected);

        this.microphone.start();
        this.wakeWord.start();

        this.state = "waiting";

        return { started: true };

    }


    stop(){

        if(this.listenTimer){
            clearTimeout(this.listenTimer);
            this.listenTimer = null;
        }

        this.microphone.off("data", this._onMicData);
        this.microphone.off("error", this._onMicError);
        bus.off(events.WAKE_DETECTED, this._onWakeDetected);

        this.microphone.stop();
        this.wakeWord.stop();

        this.state = "idle";
        this.listenBuffer = [];

        return { stopped: true };

    }


    // Routes each real microphone chunk depending on the real current
    // state -- "do not process speech before activation" is enforced
    // structurally here: wake-word inference only ever sees chunks
    // while "waiting," and the post-wake recording buffer only ever
    // collects chunks while "listening."
    handleMicChunk(chunk){

        if(this.state === "waiting"){
            this.wakeWord.feed(chunk);
        } else if(this.state === "listening"){
            this.listenBuffer.push(chunk);
        }

    }


    handleError(error){
        log.error("voice-engine", `Microphone error: ${error.message}`);
        bus.publish(events.ERROR, { message: error.message });
    }


    beginListening(){

        if(this.state !== "waiting"){
            return; // ignore a spurious/duplicate wake while already busy
        }

        this.state = "listening";
        this.listenBuffer = [];

        bus.publish(events.LISTENING, { startedAt: new Date().toISOString() });

        this.listenTimer = setTimeout(
            () => this.finishListening().catch(error => this.handleError(error)),
            this.listenSeconds * 1000
        );
        this.listenTimer.unref?.();

    }


    // "Record command" -> whisper.cpp -> VOICE_INPUT -> Router -> Agent
    // System -> Response -> TTS. Any failure along this real chain is
    // caught, logged, and published as voice.error -- the engine always
    // returns to "waiting" afterward rather than getting stuck.
    async finishListening(){

        // clearTimeout() (not just discarding the reference) matters
        // when this is called directly -- e.g. a test bypassing the
        // real wait, or a real interruption -- rather than by its own
        // scheduled setTimeout firing naturally: without it, the
        // original timer stays live in the event loop for the full
        // listenSeconds duration, leaking a handle that keeps the
        // process alive.
        clearTimeout(this.listenTimer);
        this.listenTimer = null;
        this.state = "processing";

        bus.publish(events.PROCESSING, { startedAt: new Date().toISOString() });

        const pcm = Buffer.concat(this.listenBuffer);
        this.listenBuffer = [];

        if(pcm.length === 0){
            log.warn("voice-engine", "No audio was recorded after the wake word -- nothing to transcribe.");
            this.state = "waiting";
            return null;
        }

        try {

            const { sampleRate, channels, bitDepth } = config.microphone();
            const wavBuffer = wav.encode(pcm, { sampleRate, channels, bitDepth });
            const audioPath = path.join(os.tmpdir(), `veronica-voice-${crypto.randomUUID()}.wav`);
            fs.writeFileSync(audioPath, wavBuffer);

            const text = await this.speechToText.transcribe(audioPath);

            if(!text || !text.trim()){
                log.warn("voice-engine", "Speech-to-text returned no transcript.");
                this.state = "waiting";
                return null;
            }

            // VOICE_INPUT: the transcript is now real voice input to the
            // existing Router, same shape as any other request it
            // handles.
            bus.publish(events.TRANSCRIBED, { text, audioPath });

            const result = await this.handleUtterance(text);

            this.state = "waiting";

            return result;

        } catch(error){
            log.error("voice-engine", `Failed to process recorded command: ${error.message}`);
            bus.publish(events.ERROR, { message: error.message });
            this.state = "waiting";
            return null;
        }

    }


    // The real, testable core of the flow: real text in, real router
    // dispatch, real response out, real speech attempted -- exercised
    // directly by tests without needing a real microphone/wake-word/
    // whisper process. This is "the router receiving voice input."
    async handleUtterance(text){

        const routed = await this.router.route(text);

        // Matches core/interface/terminal.js's own extraction of the
        // real response text (result.result.cognition.response.response)
        // -- see core/intelligence/index.js's think() and
        // core/brain/providers/claude.js's generate() for the shape.
        const responseText = routed?.result?.cognition?.response?.response ?? null;

        bus.publish(events.ROUTED, { text, agent: routed.agent, responseText });

        if(!responseText){
            log.warn("voice-engine", `Router returned no response text for: "${text}"`);
            return { routed, spoken: null };
        }

        const spoken = await this.textToSpeech.speak(responseText);

        bus.publish(events.SPOKEN, { responseText, ...spoken });

        return { routed, spoken };

    }

}


module.exports = VoiceEngine;
