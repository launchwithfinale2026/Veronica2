// Phase 55 (Multi-Model Intelligence). core/brain/routing.js has no
// risky require chain (fs/path only) -- safe at top level. Brain itself
// IS required lazily, and cached, so this only ever constructs the one
// administrative instance this file needs for status reporting (same
// reasoning as core/tools/handlers/profile.js's getPersonalContext()
// cache) rather than a fresh one per call.
const routing = require("../../brain/routing");

let brain = null;

function getBrain(){

    if(!brain){
        const Brain = require("../../brain");
        brain = new Brain();
    }

    return brain;

}

module.exports = {

    "brain.status": () => getBrain().provider.status(),

    "brain.routingPreferences": () => routing.getPreferences(),

    "brain.setRoutingPreference": ({ taskType, provider } = {}) => {

        if(!taskType){
            throw new Error("A taskType is required");
        }

        if(!provider){
            throw new Error("A provider is required");
        }

        return routing.setPreference(taskType, provider);

    },

    "brain.clearRoutingPreference": ({ taskType } = {}) => {

        if(!taskType){
            throw new Error("A taskType is required");
        }

        return routing.clearPreference(taskType);

    }

};
