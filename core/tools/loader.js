const fs = require("fs");
const path = require("path");

const Tool = require("./base");
const log = require("../logging");

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

    // Phase 33: same resilience pattern as core/agents/loader.js's
    // package-agent loop above -- a package's tool handler file could
    // become broken after installation despite passing installer.js's
    // health check at install time; logged and skipped rather than
    // crashing tool loading (and therefore boot) entirely.
    const packageTools = activation.packageToolConfigs().flatMap(({ toolConfig, handlerPath, packageName }) => {

        let handlerModule;

        try {
            handlerModule = require(handlerPath);
        } catch(error){
            log.error("capabilities", `Package "${packageName}" tool "${toolConfig.id}" failed to load: ${error.message} -- skipped`);
            return [];
        }

        const handler = handlerModule[toolConfig.id];

        if(!handler){
            log.error("capabilities", `Package "${packageName}" declares tool "${toolConfig.id}" but ${handlerPath} does not export it -- skipped`);
            return [];
        }

        return [new Tool({ ...toolConfig, handler })];

    });

    return [...baseTools, ...packageTools];

}


module.exports = loadTools;
