const fs = require("fs");
const path = require("path");

const Agent = require("./base");


function loadAgents(){

const registry =
require("../../registry/agents.json");


return registry.agents.map(config=>{


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

prompt:intelligence

});


});


}


module.exports = loadAgents;
