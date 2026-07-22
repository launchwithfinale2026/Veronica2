const fs = require("fs");
const path = require("path");

function loadJSON(file) {
    const data = fs.readFileSync(
        path.join(__dirname, "../../", file),
        "utf8"
    );

    return JSON.parse(data);
}


console.log(`
================================
 VERONICA EXECUTIVE CORE
 BOOTING SYSTEM
================================
`);


console.log("Loading identity...");

const identity = loadJSON(
    "core/veronica/identity.json"
);


console.log("Loading departments...");

const departments = loadJSON(
    "registry/departments.json"
);


console.log("Loading agents...");

const agents = loadJSON(
    "registry/agents.json"
);



console.log(`
--------------------------------
SYSTEM STATUS
--------------------------------
Identity: ONLINE
Departments: ${departments.departments.length}
Agents: ${agents.agents.length}
Executive Core: ONLINE
Message Bus: STANDBY
Memory System: STANDBY
`);



console.log(`
--------------------------------
REGISTERED AGENTS
--------------------------------
`);


agents.agents.forEach(agent => {

    console.log(
        `${agent.name} | ${agent.role} | ${agent.status}`
    );

});


console.log(`
================================

VERONICA awaiting command...

================================
`);
