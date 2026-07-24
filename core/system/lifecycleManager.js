// ==================================
// VERONICA SYSTEM LIFECYCLE -- LIFECYCLE MANAGER
// ==================================
//
// Phase 46. The single real entry point for VERONICA's own lifecycle --
// owns one real SystemState and one real ServiceRegistry, and composes
// core/system/bootManager.js / shutdownManager.js / healthManager.js /
// recoveryManager.js into boot()/shutdown()/getStatus()/diagnose().
// This is what a real process entry point (dashboard/backend/server.js),
// the CLI (scripts/veronica-cli.js), and tests all construct and call
// into -- none of them re-implement boot/shutdown/health/recovery logic
// of their own.

const SystemState = require("./systemState");
const ServiceRegistry = require("./serviceRegistry");
const bootManager = require("./bootManager");
const shutdownManager = require("./shutdownManager");
const healthManager = require("./healthManager");
const recoveryManager = require("./recoveryManager");


class LifecycleManager {

    constructor({
        systemState = new SystemState(),
        serviceRegistry = new ServiceRegistry()
    } = {}){

        this.systemState = systemState;
        this.serviceRegistry = serviceRegistry;
        this.lastBootResult = null;

    }


    async boot(options = {}){

        this.lastBootResult = await bootManager.boot({
            systemState: this.systemState,
            serviceRegistry: this.serviceRegistry,
            ...options
        });

        return this.lastBootResult;

    }


    async shutdown(options = {}){

        return shutdownManager.gracefulShutdown({
            systemState: this.systemState,
            ...options
        });

    }


    async runHealthChecks(options = {}){
        return healthManager.runAll(options);
    }


    // The real, evidence-based combined status a dashboard panel or the
    // `veronica status` CLI command reads -- never a mystery "online"
    // string.
    getStatus(){

        return {
            lifecycle: this.systemState.snapshot(),
            services: this.serviceRegistry.getAllServices(),
            isOperational: this.systemState.isOperational() && this.serviceRegistry.isOperational()
        };

    }


    // A richer, one-shot report combining lifecycle + services + a
    // fresh real health run + the real recovery record from the last
    // boot -- what `veronica diagnose` prints.
    async diagnose(){

        const health = await this.runHealthChecks();

        return {
            lifecycle: this.systemState.snapshot(),
            services: this.serviceRegistry.getAllServices(),
            health,
            lastBoot: this.lastBootResult ? {
                booted: this.lastBootResult.booted,
                state: this.lastBootResult.state,
                checks: this.lastBootResult.checks,
                recovery: this.lastBootResult.recovery
            } : null,
            timestamp: new Date().toISOString()
        };

    }

}


module.exports = LifecycleManager;
