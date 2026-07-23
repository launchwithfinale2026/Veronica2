// Facade over the learning subsystem -- same flat-object pattern as
// core/executive/index.js.

const LearningEngine = require("./engine");
const adaptiveInsights = require("./adaptiveInsights");

const engine = new LearningEngine();

module.exports = {

    overview: () => engine.overview(),

    departmentPerformance: () => engine.departmentPerformance(),

    agentPerformance: () => engine.agentPerformance(),

    toolPerformance: () => engine.toolPerformance(),

    recommend: () => engine.recommend(),

    recommendationHistory: (limit) => engine.recommendationHistory(limit),

    // Phase 38 -- adaptive insights: accepted/rejected recommendations,
    // repeated behaviors, automation success, package tool usage. See
    // core/learning/adaptiveInsights.js.
    adaptiveInsights: () => adaptiveInsights.generate()

};
