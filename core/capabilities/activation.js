// ==================================
// VERONICA CAPABILITY ACTIVATION
// ==================================
//
// Phase 25 (Dynamic Capability Activation). Phase 20's installer.js
// could validate/register/health-check/activate a package for real, but
// core/agents/loader.js, core/tools/loader.js, and core/departments/loader.js
// still only read the static registry/*.json files -- an installed
// package's agents/tools never became live Agent/Tool instances. This
// module is the single source of truth those three loaders (and
// core/automation/jobs.js, for package-declared automations) now pull
// from, so the "what does an active package provide" logic lives in one
// place rather than being re-implemented three times.
//
// Deliberately read-only and side-effect-free: this only describes what
// SHOULD be loaded (configs + file paths), the actual require()-ing and
// object construction stays in each loader, matching how those loaders
// already build Agent/Tool instances from registry/agents.json/tools.json
// today. Zero active (non-core) packages means every function here
// returns an empty array -- identical behavior to before this phase.

const path = require("path");

const registry = require("./registry");


function activePackages(){

    return registry.list().filter(entry => !entry.core && entry.status === "active" && entry.manifest);

}


function packageAgentConfigs(){

    return activePackages().flatMap(pkg =>
        (pkg.manifest.agents || []).map(agentConfig => ({
            agentConfig,
            packageName: pkg.name,
            promptPath: path.join(pkg.source, "agents", `${agentConfig.name.toLowerCase()}.js`)
        }))
    );

}


function packageToolConfigs(){

    return activePackages().flatMap(pkg =>
        (pkg.manifest.tools || []).map(toolConfig => ({
            toolConfig,
            packageName: pkg.name,
            handlerPath: path.join(pkg.source, "tools", `${toolConfig.id}.js`)
        }))
    );

}


// Optional: a package's manifest may declare a `department` object
// ({id, name, domain}) alongside a department/manager.js file in its own
// directory, following the EXACT same factory convention
// core/departments/loader.js already uses for departments/<id>/manager.js
// -- a package is not required to declare one (most won't; packages/example/
// doesn't).
function packageDepartmentConfigs(){

    return activePackages()
        .filter(pkg => pkg.manifest.department)
        .map(pkg => ({
            departmentConfig: pkg.manifest.department,
            packageName: pkg.name,
            managerPath: path.join(pkg.source, "department", "manager.js"),
            // Phase 33: DepartmentManager's activity log defaults to
            // departments/<id>/logs/ (relative to core/departments/base.js),
            // which doesn't exist for a package -- passing the package's
            // own directory lets the base class log under
            // <packageDir>/logs/activity.log instead. See
            // core/departments/base.js's own comment.
            packageDir: pkg.source
        }));

}


// Optional: a package's manifest may declare `automations`
// ([{name, intervalMs}]), each with a handler file at
// <packageDir>/automations/<name>.js exporting a function keyed by that
// same name (matching core/tools handler modules' "export an object
// keyed by id" convention).
function packageAutomationConfigs(){

    return activePackages().flatMap(pkg =>
        (pkg.manifest.automations || []).map(automationConfig => ({
            automationConfig,
            packageName: pkg.name,
            handlerPath: path.join(pkg.source, "automations", `${automationConfig.name}.js`)
        }))
    );

}


// The memory-tagging convention a package's own tool/agent code should
// use when it calls memory.remember() -- not a new storage mechanism
// (memory stays one flat, tagged store, per Phase 12/19's own
// reasoning), just a predictable tag so a package's own memories are
// filterable (`memory.filter({ tag: namespaceTagFor("example") })`)
// without every package inventing its own ad hoc tag naming.
function namespaceTagFor(packageName){
    return `capability:${packageName}`;
}


module.exports = {
    activePackages,
    packageAgentConfigs,
    packageToolConfigs,
    packageDepartmentConfigs,
    packageAutomationConfigs,
    namespaceTagFor
};
