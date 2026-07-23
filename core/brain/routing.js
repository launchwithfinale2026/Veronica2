// ==================================
// VERONICA MULTI-MODEL ROUTING PREFERENCES
// ==================================
//
// Phase 55 (Multi-Model Intelligence). core/brain/provider.js's
// BrainProvider already IS multi-model infrastructure (Phase 36):
// Claude/OpenAI/local, a real fallback order, `use()` to switch the
// active one, `status()` to report what's configured. What was
// missing was routing BY TASK TYPE rather than one global "active"
// setting for every call.
//
// Deliberately NOT a fabricated heuristic ("OpenAI is better at code,
// Claude is better at prose") -- this codebase has no real, evidenced
// basis for a claim like that today (see core/departments/base.js's
// new `provider` field on every `department_run` learning-log entry,
// added this same phase, which is what WOULD eventually make such a
// claim honest). Until real evidence exists, routing preferences are
// entirely operator-set: a real, persisted, per-task-type "try this
// provider first" mapping that starts EMPTY (BrainProvider's existing
// fallback order governs every task type until the operator configures
// one), the same "honest unset default, no invented opinion" principle
// core/executive/constitution.js's own operator-authored fields already
// follow.

const fs = require("fs");
const path = require("path");

const PREFERENCES_FILE = path.join(__dirname, "routingPreferences.json");


function loadPreferences(){

    if(!fs.existsSync(PREFERENCES_FILE)){
        return {};
    }

    return JSON.parse(fs.readFileSync(PREFERENCES_FILE, "utf8"));

}


function savePreferences(preferences){
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2) + "\n");
}


function getPreferences(){
    return loadPreferences();
}


// Which provider to try FIRST for a given real task type (e.g.
// "extraction", "synthesis", "decomposition") -- an operator decision,
// not a guess this code makes for them.
function setPreference(taskType, providerName){

    if(!taskType){
        throw new Error("A task type is required");
    }

    if(!providerName){
        throw new Error("A provider name is required");
    }

    const preferences = loadPreferences();
    preferences[taskType] = providerName;
    savePreferences(preferences);

    return preferences;

}


function clearPreference(taskType){

    const preferences = loadPreferences();
    delete preferences[taskType];
    savePreferences(preferences);

    return preferences;

}


module.exports = { getPreferences, setPreference, clearPreference, PREFERENCES_FILE };
