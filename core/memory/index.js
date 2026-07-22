const store = require("./store");
const bus = require("../bus");
const EmbeddingIndex = require("./embeddings");

const embeddingIndex = new EmbeddingIndex();

module.exports = {

    remember(memory){

        const entry = store.remember(memory);

        // Live dashboard updates (Phase 9) piggyback on this one
        // chokepoint -- nearly everything that creates a memory entry
        // (projects, companies, consolidation/recommendation results,
        // employees, documents...) already calls remember(), so this one
        // publish() covers all of them without instrumenting each caller.
        bus.publish("memory.updated", { action: "created", entry });

        return entry;

    },

    view(){
        return store.recall();
    },

    retrieve(query){
        return store.search(query);
    },

    search(query, options){
        return store.search(query, options);
    },

    filter(criteria, options){
        return store.filter(criteria, options);
    },

    update(id, changes){

        const entry = store.update(id, changes);

        // Covers status/progress changes (ProjectManager.updateStatus(),
        // addArtifact(), etc.), which go through update() rather than
        // remember() -- the "progress updates" capability specifically.
        bus.publish("memory.updated", { action: "updated", entry });

        return entry;

    },

    types: store.TYPES,

    // Semantic retrieval (Phase 14 of the Intelligence Layer milestone) --
    // additive to, not a replacement for, search()/filter() above. See
    // core/memory/embeddings.js for why this only activates with
    // OPENAI_API_KEY configured, and why indexing is a separate,
    // explicitly-triggered step rather than automatic on every remember().
    semanticSearchAvailable(){
        return embeddingIndex.isConfigured();
    },

    reindexEmbeddings(){
        return embeddingIndex.reindex(store.recall());
    },

    semanticSearch(query, options){
        return embeddingIndex.search(query, store.recall(), options);
    }

};
