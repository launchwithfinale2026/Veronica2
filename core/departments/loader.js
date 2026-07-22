const fs = require("fs");
const path = require("path");

// Phase 25: see core/agents/loader.js's own comment on this same require.
// Most packages won't declare a department (packages/example/ doesn't) --
// packageDepartmentConfigs() returns [] unless one explicitly does.
const activation = require("../capabilities/activation");


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

    const baseDepartments = registry.departments.map(dept => {

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

    // A package-declared department follows the EXACT same
    // manager.js factory convention as the built-in departments above --
    // just loaded from the package's own directory instead of
    // departments/<id>/.
    const packageDepartments = activation.packageDepartmentConfigs().map(({ departmentConfig, managerPath }) => {

        const createManager = require(managerPath);

        const deptAgents = agents.filter(
            agent => agent.department === departmentConfig.id
        );

        return createManager({
            ...departmentConfig,
            agents: deptAgents
        });

    });

    return [...baseDepartments, ...packageDepartments];

}


module.exports = loadDepartments;
