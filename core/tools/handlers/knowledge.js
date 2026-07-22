const knowledge = require("../../knowledge");

module.exports = {

    "knowledge.query": ({ name } = {}) => {

        if(!name){
            throw new Error("A name to query is required");
        }

        return knowledge.retrieve(name);

    }

};
