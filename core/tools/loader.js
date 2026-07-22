const fs = require("fs");
const path = require("path");

const Tool = require("./base");

const HANDLER_MODULES = [
    require("./handlers/memory"),
    require("./handlers/knowledge"),
    require("./handlers/filesystem"),
    require("./handlers/executive"),
    require("./handlers/company"),
    require("./handlers/learning"),
    require("./handlers/automation"),
    require("./handlers/integrations"),
    require("./handlers/vision")
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

    return registry.tools.map(config => {

        const handler = handlers[config.id];

        if(!handler){
            throw new Error(
                `No handler implementation registered for tool "${config.id}"`
            );
        }

        return new Tool({ ...config, handler });

    });

}


module.exports = loadTools;
