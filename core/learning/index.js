// Facade over the learning subsystem -- same flat-object pattern as
// core/executive/index.js.

const LearningEngine = require("./engine");

const engine = new LearningEngine();

module.exports = {

    overview: () => engine.overview(),

    departmentPerformance: () => engine.departmentPerformance(),

    agentPerformance: () => engine.agentPerformance(),

    toolPerformance: () => engine.toolPerformance(),

    recommend: () => engine.recommend(),

    recommendationHistory: (limit) => engine.recommendationHistory(limit)

};
