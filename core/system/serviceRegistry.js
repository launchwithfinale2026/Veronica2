// ==================================
// VERONICA SYSTEM LIFECYCLE -- SERVICE REGISTRY
// ==================================
//
// Phase 46. A real registry of which subsystems exist, their real
// declared dependencies, and their current real status -- distinct from
// core/system/runtimeState.js (which tracks ongoing online/offline/
// error/restarting transitions with history) the same way a
// package.json's dependency list is distinct from a process manager's
// "is it running right now": this answers "what services does VERONICA
// know about, and what does each one need," runtimeState answers "is a
// given component alive right now." core/system/bootManager.js
// registers each real subsystem here as it comes up; nothing here is
// fabricated -- a service only appears once something real actually
// calls register() for it.

const bus = require("../bus");
const events = require("./systemEvents");


class ServiceRegistry {

    constructor(){
        this.services = new Map();
    }


    register({ name, version = "1.0", status = "STARTING", dependencies = [] } = {}){

        if(!name){
            throw new Error("Service registration requires a real name.");
        }

        if(this.services.has(name)){
            throw new Error(`Service "${name}" is already registered -- use updateStatus() to report a real status change, not a second register() call.`);
        }

        const timestamp = new Date().toISOString();

        const entry = {
            name,
            version,
            status,
            dependencies,
            startupTime: timestamp,
            updatedAt: timestamp
        };

        this.services.set(name, entry);

        bus.publish(events.SERVICE_REGISTERED, { ...entry });

        return { ...entry };

    }


    unregister(name){

        if(!this.services.has(name)){
            return { unregistered: false, reason: "not registered" };
        }

        this.services.delete(name);

        return { unregistered: true };

    }


    // How a service reports a real, ongoing status change after
    // registration (e.g. STARTING -> READY once its own real startup
    // finishes, or -> FAILED on a real error) -- register() is a
    // one-time announcement, this is the real, repeatable update path.
    updateStatus(name, status, detail = null){

        const entry = this.services.get(name);

        if(!entry){
            throw new Error(`Unknown service: "${name}" -- register() it first.`);
        }

        const previous = entry.status;

        entry.status = status;
        entry.detail = detail;
        entry.updatedAt = new Date().toISOString();

        bus.publish(events.SERVICE_STATUS_CHANGED, { name, previous, status, detail, updatedAt: entry.updatedAt });

        return { ...entry };

    }


    getStatus(name){

        const entry = this.services.get(name);

        if(!entry){
            throw new Error(`Unknown service: "${name}"`);
        }

        return { ...entry };

    }


    getAllServices(){
        return [...this.services.values()].map(entry => ({ ...entry }));
    }


    // Real dependency check: every real, declared dependency of `name`
    // must itself be registered and not FAILED. Returns the specific
    // real problems found, never just a bare boolean, so a caller can
    // report exactly what's missing.
    checkDependencies(name){

        const entry = this.services.get(name);

        if(!entry){
            throw new Error(`Unknown service: "${name}"`);
        }

        const missing = [];
        const failed = [];

        for(const dependency of entry.dependencies){

            const depEntry = this.services.get(dependency);

            if(!depEntry){
                missing.push(dependency);
            } else if(depEntry.status === "FAILED"){
                failed.push(dependency);
            }

        }

        return { satisfied: missing.length === 0 && failed.length === 0, missing, failed };

    }


    // True only when at least one real service is registered and none
    // of them are FAILED -- an empty registry is honestly NOT
    // operational (nothing has actually started yet), never a default
    // "true."
    isOperational(){

        if(this.services.size === 0){
            return false;
        }

        return [...this.services.values()].every(entry => entry.status !== "FAILED");

    }


    // Test-only: clears every registered service. Never called from
    // real boot code -- services naturally persist for the life of the
    // process, same convention as core/system/runtimeState.js's own
    // _resetForTests().
    _resetForTests(){
        this.services.clear();
    }

}


module.exports = ServiceRegistry;
