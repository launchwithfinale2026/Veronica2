// Lazy-required inside each handler for the same reason as
// core/tools/handlers/executive.js: core/executive/index.js pulls in
// core/executive/decomposer.js, which closes a circular loop back through
// core/intelligence -> core/brain -> core/tools. See docs/Architecture.md
// "Goal Decomposition Engine" for the full trace.

module.exports = {

    "company.create": (input = {}) => {

        if(!input.name){
            throw new Error("A company name is required");
        }

        return require("../../executive").createCompany(input);

    },

    "company.list": () => require("../../executive").listCompanies(),

    "company.get": ({ companyId } = {}) => {

        if(!companyId){
            throw new Error("A companyId is required");
        }

        return require("../../executive").getCompany(companyId);

    },

    "company.addEmployee": ({ companyId, employee } = {}) => {

        if(!companyId || !employee){
            throw new Error("A companyId and employee are required");
        }

        return require("../../executive").addEmployee(companyId, employee);

    },

    "company.addDocument": ({ companyId, document } = {}) => {

        if(!companyId || !document){
            throw new Error("A companyId and document are required");
        }

        return require("../../executive").addDocument(companyId, document);

    },

    "company.recordFinance": ({ companyId, label, amount, type } = {}) => {

        if(!companyId){
            throw new Error("A companyId is required");
        }

        return require("../../executive").recordFinance(companyId, { label, amount, type });

    },

    "company.addRelationship": ({ companyId, to, type } = {}) => {

        if(!companyId){
            throw new Error("A companyId is required");
        }

        return require("../../executive").addCompanyRelationship(companyId, { to, type });

    },

    "company.logCommunication": ({ companyId, summary, channel } = {}) => {

        if(!companyId){
            throw new Error("A companyId is required");
        }

        return require("../../executive").logCommunication(companyId, { summary, channel });

    }

};
