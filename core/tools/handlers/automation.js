// Lazy-required inside each handler for the same reason as
// core/tools/handlers/executive.js: core/automation/index.js pulls in
// core/automation/jobs.js, which requires core/executive and
// core/learning -- both of which chain into core/intelligence ->
// core/brain -> core/tools, closing a circular loop back to this exact
// file. See docs/Architecture.md "Goal Decomposition Engine" for the
// full trace.

module.exports = {

    "automation.status": () => require("../../automation").status(),

    "automation.history": ({ limit } = {}) => require("../../automation").history(limit),

    "automation.run": ({ jobName } = {}) => {

        if(!jobName){
            throw new Error("A jobName is required");
        }

        return require("../../automation").enqueue(jobName);

    },

    "automation.runNow": ({ jobName } = {}) => {

        if(!jobName){
            throw new Error("A jobName is required");
        }

        return require("../../automation").runNow(jobName);

    }

};
