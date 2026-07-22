// Lazy-required inside each handler for the same reason as
// core/tools/handlers/executive.js: core/learning/index.js pulls in
// core/learning/engine.js, which requires core/intelligence -> core/brain
// -> core/tools, closing a circular loop back to this exact file. See
// docs/Architecture.md "Goal Decomposition Engine" for the full trace.
// (core/learning/log.js, which core/tools/base.js itself calls into on
// every tool execution, has no such dependency and doesn't need this.)

module.exports = {

    "learning.overview": () => require("../../learning").overview(),

    "learning.departmentPerformance": () => require("../../learning").departmentPerformance(),

    "learning.agentPerformance": () => require("../../learning").agentPerformance(),

    "learning.toolPerformance": () => require("../../learning").toolPerformance(),

    "learning.recommend": () => require("../../learning").recommend(),

    "learning.recommendations": ({ limit } = {}) => require("../../learning").recommendationHistory(limit)

};
