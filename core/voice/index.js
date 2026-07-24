// ==================================
// VERONICA VOICE LAYER
// ==================================
//
// Public entry point for the local-first voice interface:
//   Microphone -> Wake Word Detection -> Speech To Text -> Router ->
//   Existing Agents/Claude Provider -> Text Response -> Text To Speech
//
// OFF by default (VOICE_ENABLED must be "1"/"true" -- see
// core/voice/config.js) since it spawns real child processes and
// expects real microphone/audio hardware, neither of which any other
// part of this codebase touches. Never wired into
// dashboard/backend/server.js's boot sequence or
// core/interface/terminal.js automatically -- an operator opts in by
// calling start() themselves, same "never do something requiring
// hardware by default" discipline as the LaunchAgent scripts. Voice is
// an optional capability: nothing else in this codebase depends on it,
// and it adds no dashboard controls, no personality/avatar/emotion
// layer, and no cloud API.
//
// Does not modify core/memory, core/router, or core/agents -- start()
// constructs the SAME Router class core/interface/terminal.js's "ask"
// command already uses, reusing loadAgents()/ContextEngine exactly the
// same way, rather than inventing a second dispatch path.

const Router = require("../router");
const loadAgents = require("../agents/loader");
const ContextEngine = require("../context/engine");
const log = require("../logging");

const config = require("./config");
const Microphone = require("./microphone");
const WakeWordDetector = require("./wakeWord");
const speechToText = require("./speechToText");
const textToSpeech = require("./textToSpeech");
const VoiceEngine = require("./voiceEngine");

const microphone = new Microphone();
const wakeWord = new WakeWordDetector();

let engine = null;


// Startup validation (real, non-throwing, log-only -- same discipline
// as core/integrations/credentialManager.js's validateStartup()):
// checks all four real dependencies -- microphone, whisper.cpp, Piper,
// wake-word model -- and logs a clear diagnostic for each one that's
// missing. Never crashes core startup, and safe to call whether or not
// voice is enabled (callers, e.g. an operator wiring this into their own
// boot script, decide what to do with the result).
function validateStartup(){

    const configStatus = config.status();
    const micAvailable = microphone.isAvailable();

    const checks = [
        { label: "Microphone", ok: micAvailable },
        { label: configStatus.wakeWord.label, ok: configStatus.wakeWord.configured },
        { label: configStatus.speechToText.label, ok: configStatus.speechToText.configured },
        { label: configStatus.textToSpeech.label, ok: configStatus.textToSpeech.configured }
    ];

    for(const check of checks){

        if(check.ok){
            log.info("voice", `${check.label}: available`);
        } else {
            log.warn("voice", `${check.label}: not available -- voice functionality depending on it will fail closed, honestly, when actually invoked. VERONICA continues operating normally otherwise.`);
        }

    }

    return { microphone: micAvailable, ...configStatus };

}


// Real, honest status -- never a mystery "is voice on" flag. Combines
// config.status() (what's configured on this machine), whether the
// engine/detector/microphone are actually running right now in this
// process, and Task 7's exact `voiceStatus` dashboard shape (sourced
// from the real, running engine when there is one; a real, honest
// "not running" default otherwise -- never fabricated).
function status(){

    const voiceStatus = engine
        ? engine.status().voiceStatus
        : { enabled: config.isEnabled(), state: "IDLE", lastInteraction: null, modelLoaded: wakeWord.status().running };

    return {
        ...config.status(),
        microphoneAvailable: microphone.isAvailable(),
        microphoneRunning: microphone.status().running,
        wakeWordRunning: wakeWord.status().running,
        engineState: voiceStatus.state,
        voiceStatus
    };

}


function start({ router } = {}){

    if(!config.isEnabled()){
        throw new Error("Voice layer is disabled -- set VOICE_ENABLED=1 to enable (see core/voice/config.js).");
    }

    if(engine){
        return { started: false, reason: "already running" };
    }

    validateStartup();

    const realRouter = router || new Router(loadAgents(), new ContextEngine());

    const newEngine = new VoiceEngine({ router: realRouter, microphone, wakeWord });
    const result = newEngine.start();

    if(!result.started){
        return result;
    }

    engine = newEngine;

    return { started: true };

}


function stop(){

    if(engine){
        engine.stop();
        engine = null;
    }

    return { stopped: true };

}


module.exports = {
    config,
    microphone,
    wakeWord,
    speechToText,
    textToSpeech,
    VoiceEngine,
    validateStartup,
    start,
    stop,
    status
};
