// Phase 56 (Personal Intelligence Engine). core/profile/personalIntelligence.js
// has no risky top-level require chain (memory/knowledge only,
// everything else lazy inside its own functions) -- safe here.
const personalIntelligence = require("../../profile/personalIntelligence");

module.exports = {

    "personalIntelligence.relationships": ({ limit } = {}) => personalIntelligence.inferImportantRelationships({ limit }),

    "personalIntelligence.decisionPatterns": () => personalIntelligence.inferDecisionPatterns(),

    "personalIntelligence.keyClients": ({ companyId } = {}) => {

        if(!companyId){
            throw new Error("A companyId is required");
        }

        return personalIntelligence.inferKeyClients(companyId);

    },

    "personalIntelligence.dismiss": ({ subject, reason } = {}) => {

        if(!subject){
            throw new Error("A subject is required");
        }

        return personalIntelligence.dismissInference(subject, reason);

    },

    "personalIntelligence.dismissed": () => personalIntelligence.listDismissed()

};
