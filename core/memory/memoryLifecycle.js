// ==================================
// VERONICA MEMORY LIFECYCLE
// ==================================
//
// Phase 12 (Memory Evolution). Every memory now moves through
// temporary -> active -> persistent (-> archived), tracked in
// `metadata.lifecycle`. Promotion is automatic and periodic (run()
// below is called once per daily cycle -- see
// core/executive/dailyBriefing.js -- not on every read/write), rather
// than recomputed on every remember()/update() call: re-scoring is
// cheap per entry but scanning every entry's connections/repetition on
// every single memory write would make ordinary operations
// (ProjectManager.updateStatus(), etc.) pay a cost that has nothing to
// do with what they're doing.
//
// Requires ./store directly (not core/memory/index.js) -- this file
// lives inside core/memory itself, and index.js will construct/use this
// class, so requiring it back here would be circular. Same pattern
// core/memory/classification.js already established.

const store = require("./store");
const bus = require("../bus");
const knowledgeModule = require("../knowledge");
const MemoryClassifier = require("./memoryClassifier");
const MemoryImportanceEngine = require("./memoryImportanceEngine");

const STAGES = ["temporary", "active", "persistent", "archived"];

const ACTIVE_THRESHOLD = 35;
const PERSISTENT_THRESHOLD = 70;
const ARCHIVE_SCORE_CEILING = 20;
const ARCHIVE_STALE_DAYS = 60;


function daysSince(timestamp){
    return (Date.now() - new Date(timestamp).getTime()) / (24 * 60 * 60 * 1000);
}


class MemoryLifecycle {

    static STAGES = STAGES;

    constructor({ classifier, importanceEngine, knowledge } = {}){

        this.classifier = classifier || new MemoryClassifier();
        this.importanceEngine = importanceEngine || new MemoryImportanceEngine({ knowledge });
        this.knowledge = knowledge || knowledgeModule;

    }


    // The stage this entry should be in given its current score/age, or
    // null if it should stay where it is. Never demotes except the
    // explicit staleness-based archive rule -- an entry that already
    // earned "persistent" isn't knocked back to "active" just because
    // its score dipped slightly on a later sweep.
    nextStage(entry, score){

        const currentStage = entry.metadata.lifecycle || "temporary";
        const idleDays = daysSince(entry.updated);

        if(currentStage !== "archived" && score <= ARCHIVE_SCORE_CEILING && idleDays >= ARCHIVE_STALE_DAYS){
            return {
                stage: "archived",
                reason: `Low value (score ${score} <= ${ARCHIVE_SCORE_CEILING}) and untouched for ${Math.round(idleDays)} days`
            };
        }

        if(score >= PERSISTENT_THRESHOLD && !["persistent", "archived"].includes(currentStage)){
            return { stage: "persistent", reason: `Score ${score} >= ${PERSISTENT_THRESHOLD}` };
        }

        if(score >= ACTIVE_THRESHOLD && currentStage === "temporary"){
            return { stage: "active", reason: `Score ${score} >= ${ACTIVE_THRESHOLD}` };
        }

        return null;

    }


    // Newly-persistent memories become discoverable in the knowledge
    // graph -- connecting memory evolution to the graph, per this
    // phase's own framing. Entities are deduped by name (see
    // core/knowledge/index.js's addEntity()), so re-promoting or
    // re-running this is idempotent.
    linkToKnowledgeGraph(entry, memoryClass){

        this.knowledge.addEntity({ name: entry.content, type: "persistent-memory" });
        this.knowledge.addRelationship({ from: entry.content, to: memoryClass, type: "classifiedAs" });

    }


    // Re-classifies and re-scores every entry, applies any due stage
    // transition, and persists both the fresh score/class and the new
    // stage in one write per entry. Returns only the entries that
    // actually transitioned, with their reasons -- the "what changed
    // today" list the daily briefing surfaces.
    run(){

        const allEntries = store.recall();
        const transitions = [];

        for(const entry of allEntries){

            const { memoryClass, reason: classReason } = this.classifier.classify(entry);
            const { score, breakdown } = this.importanceEngine.score(entry, allEntries);

            const currentStage = entry.metadata.lifecycle || "temporary";
            const transition = this.nextStage(entry, score);
            const newStage = transition ? transition.stage : currentStage;

            const updated = store.update(entry.id, {
                metadata: {
                    memoryClass,
                    classificationReason: classReason,
                    importanceScore: score,
                    importanceBreakdown: breakdown,
                    lifecycle: newStage
                }
            });

            bus.publish("memory.updated", { action: "updated", entry: updated });

            if(transition){

                if(transition.stage === "persistent"){
                    this.linkToKnowledgeGraph(updated, memoryClass);
                }

                transitions.push({
                    id: entry.id,
                    content: entry.content,
                    from: currentStage,
                    to: transition.stage,
                    reason: transition.reason,
                    score
                });

            }

        }

        return transitions;

    }


    // Counts by lifecycle stage -- the same "aggregate reporting" shape
    // core/memory/classification.js's overview() already established
    // for memory classes.
    overview(){

        const counts = { temporary: 0, active: 0, persistent: 0, archived: 0 };

        for(const entry of store.recall()){
            const stage = entry.metadata.lifecycle || "temporary";
            counts[stage] = (counts[stage] || 0) + 1;
        }

        return { total: store.recall().length, byStage: counts };

    }

}


module.exports = MemoryLifecycle;
