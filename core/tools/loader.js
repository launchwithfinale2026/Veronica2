const fs = require("fs");
const path = require("path");

const Tool = require("./base");

// Phase 25: see core/agents/loader.js's own comment on this same require --
// zero active packages means packageToolConfigs() returns [], a pure
// addition otherwise.
const activation = require("../capabilities/activation");

const HANDLER_MODULES = [
    require("./handlers/memory"),
    require("./handlers/knowledge"),
    require("./handlers/filesystem"),
    require("./handlers/executive"),
    require("./handlers/company"),
    require("./handlers/learning"),
    require("./handlers/automation"),
    require("./handlers/integrations"),
    require("./handlers/vision"),
    require("./handlers/profile")
];


// Mirrors core/agents/loader.js's pattern: registry/tools.json declares
// each tool's identity (id/description/permission), the handler modules
// under handlers/ supply the actual behavior, joined by id.
function loadTools(){

    const registry = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "../../registry/tools.json"),
            "utf8"
        )
    );

    const handlers = Object.assign({}, ...HANDLER_MODULES);

    const baseTools = registry.tools.map(config => {

        const handler = handlers[config.id];

        if(!handler){
            throw new Error(
                `No handler implementation registered for tool "${config.id}"`
            );
        }

        return new Tool({ ...config, handler });

    });

    const packageTools = activation.packageToolConfigs().map(({ toolConfig, handlerPath, packageName }) => {

        const handlerModule = require(handlerPath);
        const handler = handlerModule[toolConfig.id];

        if(!handler){
            throw new Error(
                `Package "${packageName}" declares tool "${toolConfig.id}" but ${handlerPath} does not export it`
            );
        }

        return new Tool({ ...toolConfig, handler });

    });

    return [...baseTools, ...packageTools];

}


module.exports = loadTools;
