// ==================================
// VERONICA CAPABILITY VALIDATOR
// ==================================
//
// Phase 20. Checks a package's manifest against the actual package
// directory (do the referenced agent/tool files really exist) and the
// currently-installed capability registry (are its dependencies already
// satisfied) -- everything manifest.js's shapeErrors() can't know just
// from the JSON alone. installer.js refuses to register/activate any
// package that fails here, per this phase's "self-expansion safety"
// requirement ("validate dependencies... confirm health" before
// activation).

const fs = require("fs");
const path = require("path");

const manifestModule = require("./manifest");
const registry = require("./registry");


function agentPromptPath(packageDir, agentName){
    return path.join(packageDir, "agents", `${agentName.toLowerCase()}.js`);
}


function toolHandlerPath(packageDir, toolId){
    return path.join(packageDir, "tools", `${toolId}.js`);
}


// Runs every check and collects ALL errors (rather than throwing on the
// first one) -- a package author fixing issues one at a time from a
// single throw would need to re-run validate() after each fix; a full
// list is more useful.
function validate(manifest, packageDir){

    const errors = [...manifestModule.shapeErrors(manifest)];

    if(errors.length){
        // Shape errors mean the rest of the manifest can't be trusted
        // enough to check further (e.g. `agents` might not even be an
        // array) -- stop here rather than risk a confusing secondary
        // crash while iterating a malformed field.
        return { valid: false, errors };
    }

    if(registry.isInstalled(manifest.name)){
        errors.push(`Capability "${manifest.name}" is already installed`);
    }

    for(const agent of manifest.agents){

        if(!agent.name){
            errors.push("An agent entry is missing a \"name\"");
            continue;
        }

        const promptPath = agentPromptPath(packageDir, agent.name);

        if(!fs.existsSync(promptPath)){
            errors.push(`Agent "${agent.name}" has no prompt file at "${promptPath}"`);
        }

    }

    for(const tool of manifest.tools){

        if(!tool.id){
            errors.push("A tool entry is missing an \"id\"");
            continue;
        }

        const handlerPath = toolHandlerPath(packageDir, tool.id);

        if(!fs.existsSync(handlerPath)){
            errors.push(`Tool "${tool.id}" has no handler file at "${handlerPath}"`);
        }

    }

    for(const dependency of manifest.dependencies){

        if(!registry.isInstalled(dependency)){
            errors.push(`Dependency "${dependency}" is not installed`);
        }

    }

    return { valid: errors.length === 0, errors };

}


module.exports = { validate, agentPromptPath, toolHandlerPath };
