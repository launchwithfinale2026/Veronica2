// Lazy-required inside the handler for the same reason as
// core/tools/handlers/executive.js: core/vision/engine.js requires
// core/brain/providers/claude.js directly, which requires core/tools --
// a top-level require here would close a circular loop back to this
// exact file while core/tools is still mid-load. See
// docs/Architecture.md "Goal Decomposition Engine" for the full trace.

module.exports = {

    "vision.analyzeImage": ({ path, prompt } = {}) => {

        if(!path){
            throw new Error("A path is required");
        }

        return require("../../vision").analyzeImage(path, prompt);

    }

};
