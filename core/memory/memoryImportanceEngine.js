// ==================================
// VERONICA MEMORY IMPORTANCE ENGINE
// ==================================
//
// Phase 12 (Memory Evolution). Distinct from the existing 1-5
// `importance` field on every memory entry (core/memory/store.js),
// which is a single explicit signal set once by whoever created the
// entry. This is a broader, 0-100, multi-factor score recomputed over
// time (see core/memory/memoryLifecycle.js's daily sweep) -- the
// explicit field becomes just one input among six, not replaced.
//
// Rule-based and explainable throughout, same reasoning as
// core/executive/priorityRanking.js: every factor is independently
// legible and the full breakdown is always returned alongside the
// total, never just a bare number.

const knowledgeModule = require("../knowledge");

const MAX = {
    explicitImportance: 30,
    repetition: 15,
    businessImpact: 15,
    connectedKnowledge: 20,
    futureRetrievalValue: 10,
    recency: 10
};

const RECENCY_WINDOW_DAYS = 30;
const HIGH_IMPACT_TYPES = ["businesses", "decisions", "goals"];
const REUSABLE_TYPES = ["technical knowledge", "workflow", "preferences"];


function daysSince(timestamp){
    return (Date.now() - new Date(timestamp).getTime()) / (24 * 60 * 60 * 1000);
}


class MemoryImportanceEngine {

    constructor({ knowledge } = {}){

        this.knowledge = knowledge || knowledgeModule;

    }


    // The entry's own explicit 1-5 rating, scaled to this factor's share
    // of the total.
    explicitImportanceScore(entry){

        return (entry.importance / 5) * MAX.explicitImportance;

    }


    // How many OTHER entries share at least one tag -- a proxy for "this
    // keeps coming up," not a semantic duplicate check.
    repetitionScore(entry, allEntries){

        if(!(entry.tags || []).length){
            return 0;
        }

        const related = allEntries.filter(other =>
            other.id !== entry.id && (other.tags || []).some(tag => entry.tags.includes(tag))
        );

        return Math.min(MAX.repetition, related.length * 3);

    }


    // Company-tagged entries (real business stakes) score highest;
    // businesses/decisions/goals-typed entries without a company tag
    // still score above zero.
    businessImpactScore(entry){

        const isCompanyTagged = (entry.tags || []).some(tag => tag.startsWith("company:"));

        if(isCompanyTagged){
            return MAX.businessImpact;
        }

        if(HIGH_IMPACT_TYPES.includes(entry.type)){
            return Math.round(MAX.businessImpact * (2 / 3));
        }

        return 0;

    }


    // Degree in the knowledge graph -- entries whose content IS a graph
    // entity name (projects/companies/milestones/tasks all remember()
    // with content === the entity name they also add) pick up real
    // connections here; a one-off personal note correctly scores 0, it
    // was never added as an entity.
    connectedKnowledgeScore(entry){

        const connections = this.knowledge.connections(entry.content);

        return Math.min(MAX.connectedKnowledge, connections.length * 4);

    }


    // Proxy for "will this be worth finding again": inherently reusable
    // types (how-to knowledge, workflows, standing preferences) score a
    // base amount; more tags means more ways to surface it later.
    futureRetrievalValueScore(entry){

        let score = REUSABLE_TYPES.includes(entry.type) ? 6 : 0;

        score += Math.min(4, (entry.tags || []).length);

        return Math.min(MAX.futureRetrievalValue, score);

    }


    // Full points within a day of its last update, decaying linearly to
    // zero by RECENCY_WINDOW_DAYS -- an old but recently-touched entry
    // (e.g. a status change) counts as recent again.
    recencyScore(entry){

        const days = daysSince(entry.updated);

        return Math.max(0, Math.round(MAX.recency * (1 - days / RECENCY_WINDOW_DAYS)));

    }


    // allEntries: the full current memory set, needed for repetitionScore()'s
    // cross-entry comparison. Returns the total (capped at 100, though
    // the six maxima already sum to exactly 100) plus the full breakdown
    // -- "explainable" means the breakdown is never optional.
    score(entry, allEntries){

        const breakdown = {
            explicitImportance: Math.round(this.explicitImportanceScore(entry)),
            repetition: Math.round(this.repetitionScore(entry, allEntries)),
            businessImpact: Math.round(this.businessImpactScore(entry)),
            connectedKnowledge: Math.round(this.connectedKnowledgeScore(entry)),
            futureRetrievalValue: Math.round(this.futureRetrievalValueScore(entry)),
            recency: Math.round(this.recencyScore(entry))
        };

        const total = Math.min(100, Object.values(breakdown).reduce((sum, n) => sum + n, 0));

        return { score: total, breakdown };

    }

}


module.exports = MemoryImportanceEngine;
