// ==================================
// VERONICA SYSTEM REPORT
// ==================================
//
// Phase 24 (VERONICA Self-Management). Answers the three questions this
// phase's own ask poses -- "what exists," "what is missing," "what needs
// improvement" -- by reading the real state of three already-existing
// systems (Phase 20's capability registry, Phase 19's integration
// registry/credential manager, Phase 11's self-monitoring), not by
// building a fourth parallel tracking system or fabricating a static
// list that would drift out of sync with reality.

const capabilitiesRegistry = require("../capabilities/registry");
const integrationRegistry = require("../integrations/registry");
const credentialManager = require("../integrations/credentialManager");


function whatExists(){

    return {
        capabilities: capabilitiesRegistry.list().map(c => ({
            name: c.name, version: c.version, status: c.status, core: c.core
        })),
        integrations: integrationRegistry.overview()
    };

}


// Every connector whose required credentials aren't set -- the real,
// live answer (not a stale doc), same data
// credentialManager.validateStartup() logs at boot, but queryable
// anytime.
function whatIsMissing(){

    return credentialManager.overview().filter(entry => !entry.configured);

}


// Any installed capability that isn't healthy right now -- "disabled"
// (an operator's own choice) is reported separately from "error" (a
// real failure) since they call for different action.
function whatNeedsImprovement(){

    const capabilities = capabilitiesRegistry.list();

    return {
        capabilitiesInError: capabilities.filter(c => c.status === "error").map(c => ({ name: c.name, version: c.version })),
        capabilitiesDisabled: capabilities.filter(c => c.status === "disabled").map(c => ({ name: c.name, version: c.version }))
    };

}


function generate(){

    return {
        generatedAt: new Date().toISOString(),
        whatExists: whatExists(),
        whatIsMissing: whatIsMissing(),
        whatNeedsImprovement: whatNeedsImprovement()
    };

}


module.exports = { generate, whatExists, whatIsMissing, whatNeedsImprovement };
