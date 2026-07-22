const memory = require("../../memory");

module.exports = {

    "memory.remember": (input) => memory.remember(input),

    "memory.recall": ({ query } = {}) => memory.search(query),

    "memory.semanticSearch": ({ query } = {}) => {

        if(!query){
            throw new Error("A query is required");
        }

        return memory.semanticSearch(query);

    },

    "memory.reindexEmbeddings": () => memory.reindexEmbeddings(),

    "memory.overview": () => memory.overview()

};
