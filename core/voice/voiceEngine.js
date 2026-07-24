// ==================================
// VERONICA VOICE ENGINE
// ==================================
//
// Orchestrates the requested voice flow:
//   Wake word detected -> Speech To Text -> Router -> Existing
//   Agents/Claude Provider -> Text Response -> Text To Speech
//
// Deliberately does NOT construct its own Router/agents/departments --
// accepts an already-constructed core/router Router instance (the exact
// same class core/interface/terminal.js's "ask" command already uses),
// so voice reuses the one real router/agent/Claude pipeline instead of
// standing up a second one. Never modifies core/router, core/agents, or
// core/memory.
//
// speechToText/textToSpeech are injectable (default to the real
// modules) purely for testability -- the same constructor-override
// pattern already used throughout this codebase (e.g.
// core/executive/actionProposal.js's `departments` override,
// core/system/healthScore.js's override params).
//
// Every stage publishes a real bus event (voice.transcribed,
// voice.routed, voice.spoken) so the rest of the system -- dashboard,
// logging, future automation -- can observe voice activity the same
// way it observes everything else, without this module knowing or
// caring who's listening.

const bus = require("../bus");
const log = require("../logging");

const defaultSpeechToText = require("./speechToText");
const defaultTextToSpeech = require("./textToSpeech");


class VoiceEngine {

    constructor({ router, speechToText = defaultSpeechToText, textToSpeech = defaultTextToSpeech } = {}){

        if(!router){
            throw new Error("VoiceEngine requires a real core/router Router instance -- see core/voice/index.js's start() for how one is constructed.");
        }

        this.router = router;
        this.speechToText = speechToText;
        this.textToSpeech = textToSpeech;

        this._onWake = data => this.handleWake(data).catch(
            error => log.error("voice-engine", `Failed to handle wake event: ${error.message}`)
        );

    }


    // Wires this engine to the real wake-word detector's bus event --
    // kept separate from the constructor so a caller (or a test) can
    // drive handleWake()/handleUtterance() directly without ever
    // starting the wake-word child process.
    listen(){
        bus.on("voice.wakeWordDetected", this._onWake);
        return { listening: true };
    }


    stopListening(){
        bus.off("voice.wakeWordDetected", this._onWake);
        return { listening: false };
    }


    async handleWake({ audioPath }){

        if(!audioPath){
            log.warn("voice-engine", "Wake word detected with no recorded audio path -- nothing to transcribe.");
            return null;
        }

        const text = await this.speechToText.transcribe(audioPath);

        bus.publish("voice.transcribed", { text, audioPath });

        return this.handleUtterance(text);

    }


    // The real, testable core of the flow: real text in, real router
    // dispatch, real response out, real speech attempted -- exercised
    // directly by tests without needing a real wake-word/whisper
    // process. This is "the router receiving voice input."
    async handleUtterance(text){

        const routed = await this.router.route(text);

        // Matches core/interface/terminal.js's own extraction of the
        // real response text (result.result.cognition.response.response)
        // -- see core/intelligence/index.js's think() and
        // core/brain/providers/claude.js's generate() for the shape.
        const responseText = routed?.result?.cognition?.response?.response ?? null;

        bus.publish("voice.routed", { text, agent: routed.agent, responseText });

        if(!responseText){
            log.warn("voice-engine", `Router returned no response text for: "${text}"`);
            return { routed, spoken: null };
        }

        const spoken = await this.textToSpeech.speak(responseText);

        bus.publish("voice.spoken", { responseText, ...spoken });

        return { routed, spoken };

    }

}


module.exports = VoiceEngine;
