// ==================================
// VERONICA VOICE LAYER
// ==================================
//
// Public entry point for the local-first voice interface:
//   Microphone -> Wake Word Detection -> Speech To Text -> Router ->
//   Existing Agents/Claude Provider -> Text Response -> Text To Speech
//
// OFF by default (VOICE_ENABLED must be "1" -- see core/voice/config.js)
// since it spawns real child processes and expects real microphone/
// audio hardware, neither of which any other part of this codebase
// touches. Never wired into dashboard/backend/server.js's boot sequence
// or core/interface/terminal.js automatically -- an operator opts in by
// calling start() themselves, same "never do something requiring
// hardware by default" discipline as the LaunchAgent scripts.
//
// Does not modify core/memory, core/router, or core/agents -- start()
// constructs the SAME Router class core/interface/terminal.js's "ask"
// command already uses, reusing loadAgents()/ContextEngine exactly the
// same way, rather than inventing a second dispatch path.

const Router = require("../router");
const loadAgents = require("../agents/loader");
const ContextEngine = require("../context/engine");

const config = require("./config");
const WakeWordDetector = require("./wakeWord");
const speechToText = require("./speechToText");
const textToSpeech = require("./textToSpeech");
const VoiceEngine = require("./voiceEngine");

const wakeWord = new WakeWordDetector();

let engine = null;


// Real, honest status -- never a mystery "is voice on" flag. Combines
// config.status() (what's configured on this machine) with whether the
// engine/detector are actually running right now, in this process.
function status(){

    return {
        ...config.status(),
        engineRunning: Boolean(engine),
        wakeWordRunning: wakeWord.status().running
    };

}


function start({ router } = {}){

    if(!config.isEnabled()){
        throw new Error("Voice layer is disabled -- set VOICE_ENABLED=1 to enable (see core/voice/config.js).");
    }

    if(engine){
        return { started: false, reason: "already running" };
    }

    const realRouter = router || new Router(loadAgents(), new ContextEngine());

    engine = new VoiceEngine({ router: realRouter });
    engine.listen();

    wakeWord.start();

    return { started: true };

}


function stop(){

    wakeWord.stop();

    if(engine){
        engine.stopListening();
        engine = null;
    }

    return { stopped: true };

}


module.exports = {
    config,
    wakeWord,
    speechToText,
    textToSpeech,
    VoiceEngine,
    start,
    stop,
    status
};
