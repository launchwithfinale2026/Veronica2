const loadTools = require("./loader");
const ToolRegistry = require("./registry");

const registry = new ToolRegistry();

loadTools().forEach(tool => registry.register(tool));

module.exports = registry;
