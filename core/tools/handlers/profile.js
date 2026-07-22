// Required lazily inside each handler, not at module load time --
// core/profile/personalContextEngine.js depends on
// core/executive/priorityRanking.js -> projectManager.js -> decomposer.js
// -> core/intelligence -> core/brain -> ClaudeProvider -> core/tools, so
// a top-level require here would close that exact circular loop while
// core/tools is still mid-load. Same pattern as core/tools/handlers/
// executive.js -- see docs/Architecture.md "Goal Decomposition Engine".

let personalContext = null;

function getPersonalContext(){

    if(!personalContext){
        const PersonalContextEngine = require("../../profile/personalContextEngine");
        personalContext = new PersonalContextEngine();
    }

    return personalContext;

}

module.exports = {

    "profile.summary": () => getPersonalContext().summary(),

    "profile.set": ({ path, value } = {}) => {

        if(!path){
            throw new Error("A path is required");
        }

        return getPersonalContext().set(path, value);

    },

    "profile.add": ({ field, value } = {}) => {

        if(!field){
            throw new Error("A field is required");
        }

        return getPersonalContext().add(field, value);

    }

};
