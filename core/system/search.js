// ==================================
// VERONICA UNIVERSAL SEARCH
// ==================================
//
// Phase 34 (Production Dashboard). One search entry point across the
// three already-existing, separately-searchable systems (memory,
// knowledge graph, capabilities) -- not a new search index or a fourth
// place data lives. Each section below is a direct passthrough to that
// system's own existing search function.

const memory = require("../memory");
const knowledge = require("../knowledge");
const capabilitiesMarketplace = require("../capabilities/marketplace");


function search(query){

    if(!query){
        throw new Error("A search query is required");
    }

    return {

        query,

        // Phase 3's keyword search over memory content.
        memories: memory.retrieve(query),

        // Phase 4's entity name search over the knowledge graph.
        entities: knowledge.find(query),

        // Phase 26's capability marketplace search (installed +
        // available packages).
        capabilities: capabilitiesMarketplace.search(query)

    };

}


module.exports = { search };
