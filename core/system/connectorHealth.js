// ==================================
// VERONICA CONNECTOR HEALTH OBSERVER
// ==================================
//
// Phase 52 (Continuous Observation Engine). Not a new health-check
// mechanism -- core/integrations/registry.js's list() already computes
// each connector's real, current `configured` status on every call.
// This just notices when that real status FLIPS between two checks and
// publishes a real "connector.online"/"connector.offline" bus event for
// the transition, so a dashboard/briefing can react to a connector
// going away without polling the whole registry itself.
//
// Per-machine, real state -- gitignored, same treatment as
// core/system/gitObserverState.json.

const fs = require("fs");
const path = require("path");

const bus = require("../bus");
const integrationRegistry = require("../integrations/registry");

const STATE_FILE = path.join(__dirname, "connectorHealthState.json");


function loadState(stateFile){

    if(!fs.existsSync(stateFile)){
        return { statuses: {} };
    }

    return JSON.parse(fs.readFileSync(stateFile, "utf8"));

}


function saveState(stateFile, state){
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
}


// The first check for a given connector only establishes its baseline
// status (no transition to report yet) -- same "don't fabricate a past
// event" principle core/system/gitObserver.js's own header comment
// establishes.
//
// `stateFile` is an optional override (defaults to this machine's real
// state file) -- same DI convention core/system/gitObserver.js's own
// `checkForNewCommits()` just established, so a test can seed a real,
// disposable "previous status" without touching this machine's real
// connector-health history.
function checkConnectorHealth({ stateFile = STATE_FILE } = {}){

    const connectors = integrationRegistry.list();
    const state = loadState(stateFile);
    const previous = state.statuses || {};
    const current = {};
    const transitions = [];

    for(const connector of connectors){

        const configured = Boolean(connector.configured);
        current[connector.id] = configured;

        if(previous.hasOwnProperty(connector.id) && previous[connector.id] !== configured){

            const event = configured ? "connector.online" : "connector.offline";

            bus.publish(event, { id: connector.id });
            transitions.push({ id: connector.id, event });

        }

    }

    saveState(stateFile, { statuses: current });

    return { transitions };

}


module.exports = { checkConnectorHealth };
