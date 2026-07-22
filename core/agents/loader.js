const fs = require("fs");
const path = require("path");

const Agent = require("./base");

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


const packageAgents = activation.packageAgentConfigs().map(({ agentConfig, promptPath, packageName }) => {

    let intelligence = {};

    if(fs.existsSync(promptPath)){
        intelligence = require(promptPath);
    }

    return new Agent({ ...agentConfig, intelligence, packageSource: packageName });

});


return [...baseAgents, ...packageAgents];


}


module.exports = loadAgents;
