const memory = require("../memory");
const fs = require("fs");
const path = require("path");

const bus = require("../bus");
const loadAgents = require("../agents/loader");
const router = require("../router");


// ===============================
// JSON LOADER
// ===============================

function loadJSON(file){

    return JSON.parse(
        fs.readFileSync(
            path.join(__dirname,"../../",file),
            "utf8"
        )
    );

}


// ===============================
// BOOT
// ===============================

console.log(`
================================
 VERONICA EXECUTIVE CORE
 BOOTING SYSTEM
================================
`);


// ===============================
// LOAD SYSTEM FILES
// ===============================

console.log("Loading identity...");

const identity = loadJSON(
    "core/veronica/identity.json"
);


console.log("Loading departments...");

const departments = loadJSON(
    "registry/departments.json"
);


console.log("Loading agents...");

const registry = loadJSON(
    "registry/agents.json"
);


// ===============================
// LOAD AGENTS
// ===============================

const agents = loadAgents(
    registry.agents
);


// ===============================
// STATUS
// ===============================

console.log(`

--------------------------------
SYSTEM STATUS
--------------------------------

Identity: ONLINE
Departments: ${departments.departments.length}
Agents: ${agents.length}

Executive Core: ONLINE
Message Bus: INITIALIZING
Memory System: STANDBY

`);


// ===============================
// AGENT DISPLAY
// ===============================

console.log(`
--------------------------------
REGISTERED AGENTS
--------------------------------
`);


agents.forEach(agent=>{

console.log(`

${agent.name}

 Role: ${agent.role}
 Department: ${agent.department}
 Status: ${agent.status}

`);

});


// ===============================
// EVENTS
// ===============================


bus.subscribe(
"system.ready",
(data)=>{

console.log(
`
VERONICA EVENT RECEIVED:
`,
data
);

});


bus.subscribe(
"agent.response",
(data)=>{

console.log(
`
[VERONICA RESPONSE]

`,
data
);

});


// ===============================
// SYSTEM ONLINE
// ===============================


bus.publish(
"system.ready",
{
system:"VERONICA",
status:"online",
version:"0.4.0",
timestamp:new Date().toISOString()
}
);


// ===============================
// START COMMAND INTERFACE
// ===============================

require("../interface/terminal");


// ===============================
// END BOOT
// ===============================


console.log(`

-------------------------------- 

MESSAGE BUS: ONLINE
AGENT SYSTEM: ONLINE
DEPARTMENT NETWORK: ONLINE
ROUTER: ONLINE

--------------------------------

`);


// START INTERNAL VERONICA TERMINAL

require("../interface/terminal");
