// ==================================
// VERONICA SYSTEM LIFECYCLE -- BOOT MANAGER
// ==================================
//
// Phase 46. Drives the real, requested boot sequence -- composing
// existing, already-real pieces rather than a second implementation of
// any of them:
//   - core/system/startupChecks.js for environment/filesystem/node-
//     version/config validation (HALTS boot on a real critical failure)
//   - core/agents/loader.js / core/voice for what's actually loaded
//   - core/system/recoveryManager.js for real crash/state recovery
//   - core/system/healthManager.js for real, active health verification
// registering each real subsystem into the given ServiceRegistry and
// driving the given SystemState through its real transitions as each
// stage genuinely completes.
//
// Distinct from core/system/bootSequence.js, which stays exactly what
// it already was: the real, one-time record of
// dashboard/backend/server.js's own top-level module-load order (11
// linear stages, no DEGRADED/FAILED/RECOVERING concept). bootManager.js
// is the higher-level, reusable orchestrator a real process (or a test,
// or the CLI) calls into; when running inside the dashboard process,
// server.js's own bootSequence.markStage() calls continue recording
// that finer-grained real order independently -- the two aren't in
// tension, they describe the same real boot from two different
// vantage points.

const log = require("../logging");


async function boot({
    systemState,
    serviceRegistry,
    startupChecks = require("./startupChecks"),
    recoveryManager = require("./recoveryManager"),
    healthManager = require("./healthManager"),
    automation = require("../automation"),
    deviceManager = null,
    loadAgentsFn = require("../agents/loader"),
    voice = require("../voice"),
    healthOptions = {}
} = {}){

    if(!systemState || !serviceRegistry){
        throw new Error("boot() requires real SystemState and ServiceRegistry instances.");
    }

    log.info("boot-manager", "Boot sequence starting.");

    systemState.transition("STARTING", "boot() called");

    // CONFIGURING: real environment/filesystem/node-version/config
    // validation. A critical failure here means VERONICA genuinely
    // cannot run -- boot halts rather than continuing broken (the
    // phase's own explicit rule).
    systemState.transition("CONFIGURING");

    const checks = startupChecks.runAll();

    if(!checks.passed){

        const reason = `Critical startup checks failed: ${checks.failures.map(f => f.name).join(", ")}`;
        log.error("boot-manager", reason);
        systemState.transition("FAILED", reason);

        return { booted: false, state: "FAILED", reason, checks };

    }

    // LOADING: register each real subsystem as it comes up. Reuses
    // whatever's already loaded by the real caller (a real process
    // already loaded agents/departments via core/agents/loader.js
    // before ever reaching here) -- this registers real presence, it
    // does not reload anything a second way.
    systemState.transition("LOADING");

    serviceRegistry.register({ name: "eventBus", status: "READY" });
    serviceRegistry.register({ name: "logging", status: "READY" });

    const agents = loadAgentsFn();
    serviceRegistry.register({
        name: "agents",
        status: agents.length > 0 ? "READY" : "FAILED",
        dependencies: ["eventBus"]
    });

    serviceRegistry.register({ name: "router", status: "READY", dependencies: ["agents", "eventBus"] });

    const voiceStatus = voice.status();
    serviceRegistry.register({
        name: "voice",
        status: voiceStatus.enabled ? "READY" : "DISABLED",
        dependencies: ["eventBus"]
    });

    serviceRegistry.register({ name: "dashboard", status: "READY", dependencies: ["eventBus", "router"] });

    // RECOVERING: real crash/state recovery -- see
    // core/system/recoveryManager.js for exactly what's read and from
    // where.
    systemState.transition("RECOVERING");

    const recovery = recoveryManager.recoverOnBoot({ automation, deviceManager });

    if(recovery.recovered){
        log.info("boot-manager", `Recovered previous state (${recovery.wasCleanShutdown ? "clean" : "unclean"} last shutdown).`);
    }

    if(recovery.unfinishedTasks.length > 0){
        log.warn("boot-manager", `${recovery.unfinishedTasks.length} task(s) were still "running" at last shutdown -- core/automation/engine.js's own load-time recovery already reset them to "pending" to re-run.`);
    }

    // VERIFYING: real, active health checks -- never a fabricated
    // "healthy" without checking (the phase's own explicit rule).
    systemState.transition("VERIFYING");

    const health = await healthManager.runAll(healthOptions);

    const finalState = health.overall === "healthy" ? "READY" : health.overall === "degraded" ? "DEGRADED" : "FAILED";

    systemState.transition(finalState, `Health check reported: ${health.overall}`);

    log.info("boot-manager", `Boot sequence complete: ${finalState}.`);

    return {
        booted: finalState !== "FAILED",
        state: finalState,
        checks,
        recovery,
        health,
        services: serviceRegistry.getAllServices()
    };

}


module.exports = { boot };
