const fs = require("fs");
const path = require("path");

const Agent = require("./base");
const log = require("../logging");

// Phase 25 (Dynamic Capability Activation): describes what an active,
// installed capability package provides -- see that file's header
// comment. Zero active packages (the case for every existing test and
// every clean install) means packageAgentConfigs() returns [], so this
// require is a pure addition, no behavior change unless a package is
// actually installed and active.
const activation = require("../capabilities/activation");


function loadAgents(){

const registry =
require("../../registry/agents.json");


const baseAgents = registry.agents.map(config=>{


let promptPath =
path.join(
__dirname,
"prompts",
config.name.toLowerCase()+".js"
);


let intelligence={};


if(fs.existsSync(promptPath)){

intelligence =
require(promptPath);

}


return new Agent({
    ...config,
    intelligence
});

});


// Phase 33 ("improve recovery after failures" / "unify loader
// behavior"): a package's own prompt file could become broken AFTER
// installation (edited, corrupted) even though installer.js's health
// check verified it loaded fine at install time -- a broken package
// agent is logged and skipped, same resilience pattern
// core/automation/jobs.js's registerPackageJobs() already established
// in Phase 25, rather than crashing agent loading (and therefore
// department/dashboard/terminal boot) entirely over one package's file.
const packageAgents = activation.packageAgentConfigs().flatMap(({ agentConfig, promptPath, packageName }) => {

    let intelligence = {};

    try {
        if(fs.existsSync(promptPath)){
            intelligence = require(promptPath);
        }
    } catch(error){
        log.error("capabilities", `Package "${packageName}" agent "${agentConfig.name}" failed to load: ${error.message} -- skipped`);
        return [];
    }

    return [new Agent({ ...agentConfig, intelligence, packageSource: packageName })];

});


return [...baseAgents, ...packageAgents];


}


module.exports = loadAgents;
