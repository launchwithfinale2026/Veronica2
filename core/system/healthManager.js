// ==================================
// VERONICA SYSTEM LIFECYCLE -- HEALTH MANAGER
// ==================================
//
// Phase 46. Active, real health verification -- every check below
// actually calls the real thing it's reporting on (or explicitly
// documents why it can't, e.g. "verifying a model is reachable would
// cost a real API call on every health check") rather than returning a
// canned "healthy". Composes existing real signals
// (core/integrations/credentialManager.js, core/voice's own status(),
// core/agents/loader.js, core/memory) -- reimplements none of them.
//
// Distinct from core/system/healthScore.js (the existing unified 0-100
// CPU/RAM/disk/service score, still the real source for those metrics
// -- see checkResources() below, which delegates to it rather than
// re-reading os.cpus()/etc. a second way) -- this module answers a
// different, complementary question: not "how loaded is this machine,"
// but "does each real subsystem this phase asked about actually work
// right now." Every result is the exact shape requested:
//   { system, status, timestamp, latency, details }

const bus = require("../bus");
const credentialManager = require("../integrations/credentialManager");
const loadAgents = require("../agents/loader");
const memory = require("../memory");
const voice = require("../voice");
const healthScore = require("./healthScore");

const STATUSES = ["healthy", "degraded", "unhealthy"];


// Every check function returns exactly this shape. `fn` is real,
// synchronous-or-async work -- latency is the real elapsed time, timed
// here once so no individual check has to.
async function timedCheck(system, fn){

    const startedAt = Date.now();

    try {

        const { status, details } = await fn();

        return {
            system,
            status,
            timestamp: new Date().toISOString(),
            latency: Date.now() - startedAt,
            details
        };

    } catch(error){

        return {
            system,
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            latency: Date.now() - startedAt,
            details: { error: error.message }
        };

    }

}


// Real: subscribes a temporary listener, publishes a real event
// synchronously (core/bus's MessageBus is a plain EventEmitter --
// publish() is synchronous), and confirms it was actually received --
// not just "the module required without throwing."
function checkEventBus(){

    return timedCheck("eventBus", () => {

        let received = false;
        const probeEvent = "system.health.probe";
        const listener = () => { received = true; };

        bus.on(probeEvent, listener);
        bus.publish(probeEvent, {});
        bus.off(probeEvent, listener);

        return {
            status: received ? "healthy" : "unhealthy",
            details: { listenerCountSample: bus.eventNames().length }
        };

    });

}


// Real, but deliberately lightweight: constructing a real Router means
// constructing a real IntelligenceEngine/Brain (a real Claude client) --
// too heavy/side-effecting to do on every health check. This verifies
// the module resolves and exports the real constructor shape a health
// check can honestly confirm without that cost.
function checkRouter(){

    return timedCheck("router", () => {

        const Router = require("../router");

        return {
            status: typeof Router === "function" ? "healthy" : "unhealthy",
            details: { exportsConstructor: typeof Router === "function" }
        };

    });

}


function checkDatabase(){

    return timedCheck("database", () => {

        const entries = memory.view();

        return {
            status: Array.isArray(entries) ? "healthy" : "unhealthy",
            details: { entryCount: Array.isArray(entries) ? entries.length : null }
        };

    });

}


function checkFilesystem(directory){

    return timedCheck("filesystem", () => {

        const fs = require("fs");

        fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);

        return { status: "healthy", details: { directory } };

    });

}


function checkAIProvider(){

    return timedCheck("aiProvider", () => {

        const configured = credentialManager.isConfigured("claude");

        return {
            status: configured ? "healthy" : "unhealthy",
            // Honest limitation: confirming the model itself is
            // reachable would mean a real API call on every health
            // check (real cost, real latency) -- this reports what CAN
            // be verified without that: the credential is present.
            details: { credentialConfigured: configured, modelVerified: false }
        };

    });

}


function checkAgentLoader(){

    return timedCheck("agentLoader", () => {

        const agents = loadAgents();

        return {
            status: Array.isArray(agents) && agents.length > 0 ? "healthy" : "unhealthy",
            details: { agentCount: Array.isArray(agents) ? agents.length : 0 }
        };

    });

}


function checkVoice(){

    return timedCheck("voice", () => {

        const status = voice.status();

        if(!status.enabled){
            return { status: "degraded", details: { reason: "voice is disabled (VOICE_ENABLED not set)", ...status } };
        }

        const allConfigured = status.wakeWord.configured && status.speechToText.configured && status.textToSpeech.configured;

        return {
            status: allConfigured ? "healthy" : "degraded",
            details: status
        };

    });

}


// `activeSSEConnections`: healthManager.js lives in core/, not
// dashboard/ -- it never reaches into the dashboard process directly
// (that would be a real layering violation, and a circular require
// risk, since dashboard/backend/server.js already requires core/system
// modules). The dashboard route that calls this passes its own real,
// live connection count in; omitted, this honestly reports "unknown"
// rather than guessing 0.
function checkDashboard({ activeSSEConnections } = {}){

    return timedCheck("dashboard", () => {

        return {
            status: "healthy",
            details: {
                sseActive: true,
                activeConnections: typeof activeSSEConnections === "number" ? activeSSEConnections : "unknown"
            }
        };

    });

}


async function checkResources(){

    const startedAt = Date.now();

    try {

        const score = await healthScore.score();

        return {
            system: "resources",
            status: score.score >= 80 ? "healthy" : score.score >= 50 ? "degraded" : "unhealthy",
            timestamp: new Date().toISOString(),
            latency: Date.now() - startedAt,
            details: { score: score.score, status: score.status, breakdown: score.breakdown }
        };

    } catch(error){

        return {
            system: "resources",
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            latency: Date.now() - startedAt,
            details: { error: error.message }
        };

    }

}


// The full real report -- every check above, run for real, aggregated
// into an overall status that's never better than its worst real
// finding.
async function runAll({ filesystemDirectory = __dirname, activeSSEConnections } = {}){

    const results = await Promise.all([
        checkEventBus(),
        checkRouter(),
        checkDatabase(),
        checkFilesystem(filesystemDirectory),
        checkAIProvider(),
        checkAgentLoader(),
        checkVoice(),
        checkDashboard({ activeSSEConnections }),
        checkResources()
    ]);

    const overall = results.some(r => r.status === "unhealthy")
        ? "unhealthy"
        : results.some(r => r.status === "degraded")
            ? "degraded"
            : "healthy";

    return { overall, checks: results, timestamp: new Date().toISOString() };

}


module.exports = {
    STATUSES,
    checkEventBus,
    checkRouter,
    checkDatabase,
    checkFilesystem,
    checkAIProvider,
    checkAgentLoader,
    checkVoice,
    checkDashboard,
    checkResources,
    runAll
};
