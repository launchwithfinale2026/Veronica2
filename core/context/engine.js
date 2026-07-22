const memory = require("../memory");
const knowledge = require("../knowledge");


class ContextEngine {


    retrieve(query){

        const memories = memory.retrieve(query);

        const knowledgeResult = query
            ? knowledge.retrieve(query)
            : { entities: [], relationships: [] };


        return {

            query,

            memories,

            knowledge: knowledgeResult,

            state: {}

        };

    }


}


module.exports = ContextEngine;
