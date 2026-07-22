const fs = require("fs");
const path = require("path");


// Loads registry/departments.json, requires each department's own
// manager.js factory, and hands it the subset of `agents` that belong to
// it (matched on Agent.department, e.g. "athena").
function loadDepartments(agents){

    const registry = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "../../registry/departments.json"),
            "utf8"
        )
    );

    return registry.departments.map(dept => {

        const managerPath = path.join(
            __dirname, "../../departments", dept.id, "manager.js"
        );

        const createManager = require(managerPath);

        const deptAgents = agents.filter(
            agent => agent.department === dept.id
        );

        return createManager({
            ...dept,
            agents: deptAgents
        });

    });

}


module.exports = loadDepartments;
