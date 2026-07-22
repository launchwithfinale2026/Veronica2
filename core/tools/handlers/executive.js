// Required lazily inside each handler, not at module load time -- core/
// executive/decomposer.js requires core/intelligence -> core/brain ->
// ClaudeProvider -> core/tools, so a top-level require here would close a
// circular loop back to this exact file while core/tools is still mid-
// load. By the time any tool is actually invoked, module loading has long
// finished and require() just returns the normal cached singleton -- see
// docs/Architecture.md "Goal Decomposition Engine" for the full trace.

module.exports = {

    "executive.plan": (goal = {}) => {

        if(!goal.title){
            throw new Error("A goal title is required");
        }

        return require("../../executive").plan(goal);

    },

    "executive.roadmap": () => require("../../executive").roadmap(),

    "executive.deadlines": () => require("../../executive").evaluateDeadlines(),

    "executive.decompose": ({ projectId } = {}) => {

        if(!projectId){
            throw new Error("A projectId is required");
        }

        return require("../../executive").decompose(projectId);

    },

    "executive.project": ({ projectId } = {}) => {

        if(!projectId){
            throw new Error("A projectId is required");
        }

        return require("../../executive").getProject(projectId);

    },

    "executive.updateStatus": ({ id, status, note } = {}) => {

        if(!id || !status){
            throw new Error("An id and status are required");
        }

        return require("../../executive").updateStatus(id, status, note);

    },

    "executive.addArtifact": ({ projectId, artifact } = {}) => {

        if(!projectId || !artifact){
            throw new Error("A projectId and artifact are required");
        }

        return require("../../executive").addArtifact(projectId, artifact);

    },

    "executive.consolidate": () => require("../../executive").consolidate(),

    "executive.consolidationHistory": ({ limit } = {}) => require("../../executive").consolidationHistory(limit)

};
