const store = require("./store");
const bus = require("../bus");
const EmbeddingIndex = require("./embeddings");
const classification = require("./classification");
const MemoryClassifier = require("./memoryClassifier");
const MemoryImportanceEngine = require("./memoryImportanceEngine");
const MemoryLifecycle = require("./memoryLifecycle");

const embeddingIndex = new EmbeddingIndex();
const classifier = new MemoryClassifier();
const importanceEngine = new MemoryImportanceEngine();
const lifecycle = new MemoryLifecycle({ classifier, importanceEngine });

module.exports = {

    // Phase 12 (Memory Evolution): every new entry is automatically
    // classified (episodic/semantic/procedural/organizational) and
    // scored (0-100, see memoryImportanceEngine.js) at write time, and
    // starts its life at the "temporary" lifecycle stage -- promotion
    // to active/persistent happens later, in bulk, via
    // runLifecyclePromotion() (called from the daily cycle), not here on
    // every write. Two disk writes per remember() (store.remember() then
    // store.update()) rather than one -- a minor, accepted cost for
    // needing the entry's real id before classification metadata can be
    // attached; every mutation in this system already rewrites the whole
    // file regardless, so this isn't a new class of inefficiency.
    remember(memoryInput){

        const created = store.remember(memoryInput);

        const { memoryClass, reason: classificationReason } = classifier.classify(created);
        const { score, breakdown } = importanceEngine.score(created, store.recall());

        const entry = store.update(created.id, {
            metadata: {
                memoryClass,
                classificationReason,
                importanceScore: score,
                importanceBreakdown: breakdown,
                lifecycle: "temporary"
            }
        });

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
    },

    // Memory evolution (episodic/semantic/procedural/organizational
    // classes -- see core/memory/classification.js): a reporting layer
    // over the same entries/types, not a second store.
    classify(type){
        return classification.classify(type);
    },

    overview(){
        return classification.overview(store.recall());
    },

    // Phase 12 (Memory Evolution) -- the daily-cycle sweep: re-classifies
    // and re-scores every entry and applies any due lifecycle transition
    // (temporary -> active -> persistent, or -> archived). Returns just
    // the entries that actually transitioned. See
    // core/executive/dailyBriefing.js, which calls this once per run.
    runLifecyclePromotion(){
        return lifecycle.run();
    },

    lifecycleOverview(){
        return lifecycle.overview();
    }

};
