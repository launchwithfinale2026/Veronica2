// ==================================
// VERONICA KNOWLEDGE ACQUISITION ENGINE
// ==================================
//
// Phase 57. Audit first: core/integrations/fileIntelligence.js and
// core/integrations/obsidian.js already index real files/notes into
// memory (a 280-char summary each) and the knowledge graph (one entity
// per file/note, plus real wikilink relationships for notes). What
// neither does is STRUCTURED UNDERSTANDING of the content -- concepts,
// entities, relationships, tasks, decisions, questions, unknowns. That
// requires real text comprehension, which is inherently an LLM-shaped
// step (same reasoning as core/research/engine.js's extractKnowledge(),
// Phase 29) -- not a new mechanism, the SAME "structured JSON via
// parseJsonResponse()" pattern that module already established, applied
// here to already-indexed local content instead of fetched web
// documentation.
//
// Every array in the extraction schema may come back empty -- the
// instruction to the model is explicit that an empty array for "nothing
// of that kind genuinely appears" is correct, never something to fill
// with a fabricated entry just to have content.
//
// `../intelligence` is required LAZILY, inside the constructor -- same
// convention core/research/engine.js's own header comment establishes,
// for the same reason: this module is reachable from a real tool
// handler (core/tools/handlers/integrations.js's new files.acquire/
// obsidian.acquire), and core/intelligence's own chain eventually
// reaches core/brain/providers/claude.js, which requires
// core/tools/index.js at ITS top level.

const memory = require("../memory");
const knowledge = require("./index");
const { parseJsonResponse } = require("../brain/parseJsonResponse");

const ACQUISITION_TAG = "knowledge-acquisition";

const MAX_CONTENT_CHARS = 8000;

const ACQUISITION_AGENT = {
    name: "KNOWLEDGE-ACQUISITION",
    role: "Knowledge Extraction",
    capabilities: ["concept extraction", "entity extraction", "task/decision/question identification"]
};


class KnowledgeAcquisitionEngine {

    static TAG = ACQUISITION_TAG;

    constructor({ intelligence } = {}){
        const IntelligenceEngine = require("../intelligence");
        this.intelligence = intelligence || new IntelligenceEngine();
    }


    // The one genuinely LLM-shaped step -- returns structured JSON, not
    // prose, same parseJsonResponse() primitive every other structured
    // LLM call site in this codebase already uses.
    async extract(sourceLabel, content){

        if(!content){
            throw new Error("Real content is required");
        }

        const mission = {

            task: `Extract structured knowledge from this real content, sourced from "${sourceLabel}".`,

            content: content.slice(0, MAX_CONTENT_CHARS),

            responseFormat: {
                instructions: "Return ONLY valid JSON (no prose, no markdown fences) matching this exact shape. Every array may be genuinely empty if nothing of that kind appears in the content -- never fabricate an entry just to fill it.",
                shape: {
                    concepts: ["string"],
                    entities: [{ name: "string", type: "string" }],
                    relationships: [{ from: "string", to: "string", type: "string" }],
                    tasks: ["string"],
                    decisions: ["string"],
                    questions: ["string"],
                    unknowns: ["string"],
                    summary: "string"
                }
            }

        };

        const thought = await this.intelligence.think(ACQUISITION_AGENT, mission, { useTools: false });

        return parseJsonResponse(thought.cognition.response.response, "Knowledge acquisition response");

    }


    // Persists the extraction AND connects it into the real knowledge
    // graph -- entities/relationships the model found become real
    // idempotent addEntity()/addRelationship() calls, the exact same
    // primitives every other real connection in this codebase already
    // uses (Phase 49). Tasks/decisions/questions/unknowns/concepts
    // become fields on one real, queryable memory entry -- not a
    // fabricated new store shape per category.
    async acquire(sourceLabel, content){

        const extracted = await this.extract(sourceLabel, content);

        for(const entity of (extracted.entities || [])){
            if(entity && entity.name){
                knowledge.addEntity({ name: entity.name, type: entity.type || "concept" });
            }
        }

        for(const relationship of (extracted.relationships || [])){
            if(relationship && relationship.from && relationship.to && relationship.type){
                knowledge.addRelationship(relationship);
            }
        }

        const entry = memory.remember({
            content: `Knowledge acquired from "${sourceLabel}": ${extracted.summary || ""}`.trim(),
            type: "technical knowledge",
            importance: 3,
            tags: [ACQUISITION_TAG],
            source: "knowledge-acquisition",
            metadata: {
                sourceLabel,
                concepts: extracted.concepts || [],
                entities: extracted.entities || [],
                relationships: extracted.relationships || [],
                tasks: extracted.tasks || [],
                decisions: extracted.decisions || [],
                questions: extracted.questions || [],
                unknowns: extracted.unknowns || [],
                summary: extracted.summary || null
            }
        });

        return {
            id: entry.id,
            sourceLabel,
            concepts: extracted.concepts || [],
            entities: extracted.entities || [],
            relationships: extracted.relationships || [],
            tasks: extracted.tasks || [],
            decisions: extracted.decisions || [],
            questions: extracted.questions || [],
            unknowns: extracted.unknowns || [],
            summary: extracted.summary || null
        };

    }


    history(limit = 20){
        return memory.filter({ tag: ACQUISITION_TAG }, { limit });
    }

}


module.exports = KnowledgeAcquisitionEngine;
