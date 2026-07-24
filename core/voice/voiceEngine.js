// ==================================
// VERONICA VOICE ENGINE
// ==================================
//
// Orchestrates the full requested flow:
//   Microphone -> openWakeWord -> Wake detected -> Record command ->
//   whisper.cpp -> VOICE_INPUT -> Existing Router -> Existing Agent
//   System -> Response -> Voice Identity Layer -> Piper TTS -> Audio
//   output
//
// Deliberately does NOT construct its own Router/agents/departments --
// accepts an already-constructed core/router Router instance (the exact
// same class core/interface/terminal.js's "ask" command already uses),
// so voice reuses the one real router/agent/Claude pipeline instead of
// standing up a second one. Never modifies core/router, core/agents, or
// core/memory. Voice identity (core/voice/voiceIdentity.js) and speech
// formatting (core/voice/speechFormatter.js) only ever affect HOW a real
// response is spoken, never WHAT is said -- no personality responses
// are generated or hardcoded here.
//
// microphone/wakeWord/speechToText/textToSpeech are all injectable
// (default to the real modules) purely for testability -- the same
// constructor-override pattern already used throughout this codebase
// (e.g. core/executive/actionProposal.js's `departments` override,
// core/system/healthScore.js's override params).
//
// core/voice/conversationState.js is the single real source of truth
// for the engine's own IDLE/LISTENING/PROCESSING/SPEAKING/INTERRUPTED
// lifecycle (Task 4). "LISTENING" covers both "waiting for the wake
// word" and "actively recording a command" -- this.recordingCommand is
// a private, finer-grained flag distinguishing those two for real
// audio-chunk routing, since "do not process speech before activation"
// requires knowing exactly which one is happening: while NOT recording
// (waiting for the wake word, OR while SPEAKING -- see Task 5 below),
// real microphone chunks feed wake-word inference only; while
// recording, chunks are buffered for transcription instead and never
// fed back into wake-word inference, so the engine can't re-trigger on
// the tail of its own recording window. Chunks arriving during
// PROCESSING are dropped entirely -- wake-word inference intentionally
// never runs then, which is what makes it structurally impossible for
// voice to interrupt agent execution (there's nothing to interrupt with,
// since no new wake event can even be generated in that window).
//
// Task 5 (Voice Interruption): wake-word inference DOES keep running
// while SPEAKING (real audio is playing) specifically so a new
// "Veronica" can be detected -- when it is, textToSpeech.stopPlayback()
// cuts the real audio process (never the agent call, which already
// finished before anything started playing), and the engine goes
// straight back into recording a new command.
//
// Every stage publishes a real bus event (see core/voice/events.js) so
// the rest of the system -- dashboard, logging, future automation --
// can observe voice activity the same way it observes everything else.
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
const ConversationState = require("./conversationState");
const speechFormatter = require("./speechFormatter");
const defaultSpeechToText = require("./speechToText");
const defaultTextToSpeech = require("./textToSpeech");


class VoiceEngine {

    constructor({
        router,
        microphone = new Microphone(),
        wakeWord = new WakeWordDetector(),
        speechToText = defaultSpeechToText,
        textToSpeech = defaultTextToSpeech,
        conversationState = new ConversationState(),
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
        this.conversationState = conversationState;
        this.listenSeconds = listenSeconds;

        // Private, finer-grained than conversationState -- see header
        // comment. Only ever true during the real post-wake recording
        // window.
        this.recordingCommand = false;

        this.listenBuffer = [];
        this.listenTimer = null;

        this._onMicData = chunk => this.handleMicChunk(chunk);
        this._onMicError = error => this.handleError(error);
        this._onWakeDetected = () => this.handleWakeDetected();

    }


    // Task 7 (Dashboard Preparation Only): the exact real shape a future
    // dashboard panel will consume -- no UI built here, just the status
    // itself, evidence-based (never a mystery flag).
    status(){

        const snapshot = this.conversationState.snapshot();

        return {

            voiceStatus: {
                enabled: config.isEnabled(),
                state: snapshot.state,
                lastInteraction: snapshot.updatedAt,
                modelLoaded: this.wakeWord.status().running
            }

        };

    }


    publishStatus(){
        bus.publish(events.STATUS_CHANGED, this.status());
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

        if(this.conversationState.state !== "IDLE"){
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

        this.recordingCommand = false;
        this.conversationState.transition("LISTENING");

        bus.publish(events.READY, this.status().voiceStatus);
        this.publishStatus();

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

        this.recordingCommand = false;
        this.listenBuffer = [];

        if(this.conversationState.state !== "IDLE"){
            this.conversationState.transition("IDLE");
        }

        bus.publish(events.OFFLINE, this.status().voiceStatus);
        this.publishStatus();

        return { stopped: true };

    }


    // Whether real microphone chunks should currently be fed to
    // wake-word inference -- true while waiting for the wake word AND
    // while speaking (Task 5's interruption window), false while
    // actively recording a command, and false while processing (see
    // header comment on why that last one matters).
    acceptingWakeWord(){

        const state = this.conversationState.state;

        return (state === "LISTENING" && !this.recordingCommand) || state === "SPEAKING";

    }


    handleMicChunk(chunk){

        if(this.acceptingWakeWord()){
            this.wakeWord.feed(chunk);
        } else if(this.conversationState.state === "LISTENING" && this.recordingCommand){
            this.listenBuffer.push(chunk);
        }

    }


    handleError(error){
        log.error("voice-engine", `Microphone error: ${error.message}`);
        bus.publish(events.ERROR, { message: error.message });
    }


    handleWakeDetected(){

        if(this.conversationState.state === "SPEAKING"){
            this.interrupt();
            return;
        }

        if(this.conversationState.state === "LISTENING" && !this.recordingCommand){
            this.beginListening();
            return;
        }

        // PROCESSING (or an already-recording LISTENING) -- ignore a
        // spurious/duplicate wake. In practice this branch is only
        // reachable via a direct bus.publish() in a test, since real
        // audio never reaches wake-word inference during PROCESSING at
        // all (see acceptingWakeWord()).

    }


    // Task 5 (Voice Interruption): stops real audio playback only, then
    // begins recording a brand new command immediately -- exactly like
    // a fresh wake, just arriving via SPEAKING instead of LISTENING.
    interrupt(){

        this.textToSpeech.stopPlayback();

        this.conversationState.transition("INTERRUPTED");
        this.conversationState.transition("LISTENING");

        this.beginListening();

    }


    beginListening(){

        this.recordingCommand = true;
        this.listenBuffer = [];

        bus.publish(events.LISTENING, { startedAt: new Date().toISOString() });
        this.publishStatus();

        this.listenTimer = setTimeout(
            () => this.finishListening().catch(error => this.handleError(error)),
            this.listenSeconds * 1000
        );
        this.listenTimer.unref?.();

    }


    // "Record command" -> whisper.cpp -> VOICE_INPUT -> Router -> Agent
    // System -> Response -> TTS. Any failure along this real chain is
    // caught, logged, and published as voice.error -- the engine always
    // returns to LISTENING (waiting for the next wake word) afterward
    // rather than getting stuck.
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

        this.recordingCommand = false;

        this.conversationState.transition("PROCESSING");
        bus.publish(events.PROCESSING, { startedAt: new Date().toISOString() });
        this.publishStatus();

        const pcm = Buffer.concat(this.listenBuffer);
        this.listenBuffer = [];

        if(pcm.length === 0){
            log.warn("voice-engine", "No audio was recorded after the wake word -- nothing to transcribe.");
            this.conversationState.transition("LISTENING");
            this.publishStatus();
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
                this.conversationState.transition("LISTENING");
                this.publishStatus();
                return null;
            }

            // VOICE_INPUT: the transcript is now real voice input to the
            // existing Router, same shape as any other request it
            // handles. Already PROCESSING (transitioned above, before
            // transcription started) -- PROCESSING -> PROCESSING isn't a
            // valid transition, so the real command text is recorded
            // directly rather than through another transition() call.
            this.conversationState.lastCommand = text;
            bus.publish(events.TRANSCRIBED, { text, audioPath });

            const result = await this.handleUtterance(text);

            // handleUtterance() itself transitions to SPEAKING (if there
            // was something to say) and back to LISTENING when speech
            // finishes -- but if there was NO response text to speak,
            // it never leaves PROCESSING, so this is the one place that
            // needs to return to LISTENING for that specific case.
            if(this.conversationState.state === "PROCESSING"){
                this.conversationState.transition("LISTENING");
                this.publishStatus();
            }

            return result;

        } catch(error){
            log.error("voice-engine", `Failed to process recorded command: ${error.message}`);
            bus.publish(events.ERROR, { message: error.message });
            if(this.conversationState.state !== "IDLE"){
                this.conversationState.transition("LISTENING");
                this.publishStatus();
            }
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

        // Speech formatting (Task 3) only ever reshapes for clarity --
        // never alters the real response's meaning or invents content.
        const spokenText = speechFormatter.format(responseText);

        if(this.conversationState.state === "PROCESSING"){
            // transition() itself publishes the real SPEAKING_STARTED
            // event (Task 6); publishStatus() separately covers Task
            // 7's dashboard-status shape.
            this.conversationState.transition("SPEAKING", { response: responseText });
            this.publishStatus();
        }

        const spoken = await this.textToSpeech.speak({ text: spokenText, context: { agent: routed.agent } });

        bus.publish(events.SPOKEN, { responseText, spokenText, ...spoken });

        // Only transition back to LISTENING here if we're still
        // SPEAKING -- a real interruption (Task 5) may have already
        // moved conversationState to LISTENING (and begun recording a
        // brand new command) while textToSpeech.speak() was resolving
        // from being cut off early; re-transitioning here would both
        // throw (LISTENING isn't a valid SPEAKING target once already
        // left) and wrongly clobber that new in-progress recording.
        if(this.conversationState.state === "SPEAKING"){
            this.conversationState.transition("LISTENING");
            this.publishStatus();
        }

        return { routed, spoken };

    }

}


module.exports = VoiceEngine;
