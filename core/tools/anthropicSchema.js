// ==================================
// VERONICA TOOLS — ANTHROPIC SCHEMA ADAPTER
// ==================================
//
// Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$ (no dots), but
// our tool ids use dots ("memory.remember"). Rather than convert with a
// blind string replace (fragile if an id ever contains an underscore),
// this builds an explicit bidirectional map from the live tool registry
// each time it's called, so it can never drift from what's registered.

const tools = require("./index");


function toAnthropicName(toolId){

    return toolId.replace(/\./g, "_");

}


function buildToolDefinitions(){

    const nameToId = new Map();

    const definitions = tools.list().map(tool => {

        const name = toAnthropicName(tool.id);

        nameToId.set(name, tool.id);

        return {
            name,
            description: tool.description,
            input_schema: tool.inputSchema
        };

    });

    return { definitions, nameToId };

}


module.exports = { buildToolDefinitions };
