// ==================================
// VERONICA MEMORY CLASSIFIER
// ==================================
//
// Phase 12 (Memory Evolution). core/memory/classification.js already
// maps a memory's `type` to one of the four classes (episodic/semantic/
// procedural/organizational) as a reporting layer -- this is that same
// table used AUTOMATICALLY at write time (core/memory/index.js's
// remember() calls classify() on every new entry, see its own header
// comment) plus a couple of tag-based overrides classification.js can't
// see (it only ever looks at `type`).
//
// Rule-based and explainable, same as everything else this phase adds:
// classify() always returns the specific reason a class was chosen, not
// just the class itself.

const classification = require("./classification");

const ORGANIZATIONAL_TAG_PREFIX = "company:";
const PROCEDURAL_TAG_HINTS = ["workflow", "process", "howto", "procedure"];


class MemoryClassifier {

    // entry: a normalized memory object ({ type, tags, ... }, see
    // core/memory/store.js's normalize()).
    classify(entry){

        const tags = (entry.tags || []).map(t => t.toLowerCase());

        const companyTag = tags.find(t => t.startsWith(ORGANIZATIONAL_TAG_PREFIX));

        if(companyTag){
            return {
                memoryClass: "organizational",
                reason: `Tagged to a company ("${companyTag}") regardless of its "${entry.type}" type`
            };
        }

        const proceduralTag = tags.find(t => PROCEDURAL_TAG_HINTS.includes(t));

        if(proceduralTag){
            return {
                memoryClass: "procedural",
                reason: `Tagged "${proceduralTag}", a repeatable-process signal, regardless of its "${entry.type}" type`
            };
        }

        return {
            memoryClass: classification.classify(entry.type),
            reason: `Derived from memory type "${entry.type}"`
        };

    }

}


module.exports = MemoryClassifier;
