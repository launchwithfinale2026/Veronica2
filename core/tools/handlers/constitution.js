// Phase 51 (Executive Constitution). core/executive/constitution.js has
// no risky require chain (fs/path only), so unlike profile.js's own
// lazy-load comment, a top-level require here is safe.
const ExecutiveConstitution = require("../../executive/constitution");

const constitution = new ExecutiveConstitution();

const LIST_FIELDS = ["values", "operatingPrinciples", "decisionHierarchy", "escalationRules", "autonomyRules", "executivePriorities"];

module.exports = {

    "constitution.summary": () => constitution.load(),

    "constitution.set": ({ path, value } = {}) => {

        if(!path){
            throw new Error("A path is required");
        }

        return constitution.set(path, value);

    },

    "constitution.add": ({ field, value } = {}) => {

        if(!field){
            throw new Error("A field is required");
        }

        if(!LIST_FIELDS.includes(field)){
            throw new Error(`"${field}" is not a list field on the constitution (must be one of ${LIST_FIELDS.join(", ")})`);
        }

        return constitution.add(field, value);

    }

};
