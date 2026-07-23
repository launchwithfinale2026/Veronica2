// ==================================
// VERONICA SOP / WORKFLOW DOCUMENTATION LIBRARY
// ==================================
//
// Phase 46 (Business Operations Division production-readiness). An SOP
// (Standard Operating Procedure) IS a documented workflow -- ordered
// real steps for a repeatable process -- so "SOP library" and "Workflow
// documentation" are the same real entity, not two separate stores.
// Ordinary memory entries, same pattern as every other division.
// updateSteps() mutates the SOP in place with a real version counter
// (the document itself evolves; earlier phases' entities that instead
// accumulate a history array -- like a lead's interactions -- represent
// a growing log, not a single evolving document, which is why this one
// mutates rather than appends).

const memory = require("../memory");
const knowledge = require("../knowledge");

const SOP_TAG = "operations-sop";


function toSOP(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        name: entry.content,
        department: meta.department || null,
        steps: meta.steps || [],
        version: typeof meta.version === "number" ? meta.version : 1,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(SOP_TAG));

    if(!entry){
        throw new Error(`Unknown SOP: "${id}"`);
    }

    return entry;

}


// input: { name, department?, steps: [string] }
function createSOP(input = {}){

    if(!input.name){
        throw new Error("An SOP name is required");
    }

    if(!Array.isArray(input.steps) || !input.steps.length){
        throw new Error("At least one real step is required");
    }

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 3,
        tags: [SOP_TAG],
        source: "operations-sops",
        metadata: {
            department: input.department || null,
            steps: input.steps,
            version: 1
        }
    });

    // Phase 49 (Organizational Knowledge Graph): connects to the real
    // department entity core/knowledge/seed.js already creates for every
    // agent's department -- only when a department is actually given
    // (SOPs are optionally department-scoped).
    knowledge.addEntity({ name: entry.content, type: "sop" });

    if(input.department){
        knowledge.addRelationship({ from: entry.content, to: input.department, type: "belongsTo" });
    }

    return toSOP(entry);

}


function listSOPs(department){

    return memory.filter({ tag: SOP_TAG })
        .filter(entry => !department || entry.metadata.department === department)
        .map(toSOP);

}


function getSOP(sopId){
    return toSOP(requireEntry(sopId));
}


// A real revision -- the document's own steps change, and its version
// counter increments so a real reader can tell it's been updated since
// they last saw it.
function updateSteps(sopId, steps){

    if(!Array.isArray(steps) || !steps.length){
        throw new Error("At least one real step is required");
    }

    const entry = requireEntry(sopId);
    const version = (entry.metadata.version || 1) + 1;

    const updated = memory.update(sopId, { metadata: { steps, version } });

    return toSOP(updated);

}


module.exports = { SOP_TAG, createSOP, listSOPs, getSOP, updateSteps };
