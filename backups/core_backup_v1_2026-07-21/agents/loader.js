const Agent = require("./base");
const registry = require("../../registry/agents.json");


function loadAgents(){

    return registry.agents.map(config=>{

        return new Agent(config);

    });

}


module.exports = loadAgents;
