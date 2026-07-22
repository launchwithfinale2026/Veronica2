// ==================================
// VERONICA MEMORY CLASSIFICATION
// ==================================
//
// Groups core/memory/store.js's existing TYPES into the four memory
// classes a real cognitive architecture distinguishes (episodic,
// semantic, procedural, organizational) -- read-only, derived-on-read
// reporting, exactly like ExecutivePlanner.evaluateDeadlines() groups
// projects by deadline risk. No new storage, no change to any existing
// entry's shape: every entry already has a `type`, this just answers
// "which of the four classes does that type represent."
//
// Deliberately a plain type -> class lookup table, not a per-entry
// heuristic over content/tags -- same reasoning as planner.js's
// sizeFromHours()/computePriority(): cheap, legible, deterministic.
// "workflow" (added to TYPES alongside this file) is the one genuinely
// new capability here -- previously nothing distinguished "a repeatable
// process" from a one-off remembered fact.

const CLASS_BY_TYPE = {

    // Specific things that happened -- a dated occurrence, a personal
    // note, a one-off remembered fact -- not a durable belief or a
    // reusable process.
    personal: "episodic",
    general: "episodic",

    // Durable facts/knowledge/concepts and the conclusions reached from
    // them.
    "technical knowledge": "semantic",
    preferences: "semantic",
    decisions: "semantic",

    // Repeatable processes -- "how to do X," not "X happened" or "X is
    // true."
    workflow: "procedural",

    // The organization's own structure and operating history: the
    // roadmap (goals/projects/milestones/tasks) and companies.
    goals: "organizational",
    projects: "organizational",
    businesses: "organizational"

};

const CLASSES = ["episodic", "semantic", "procedural", "organizational"];


// Falls back to "episodic" for any type not in the table above (there
// isn't one today -- every entry in core/memory/store.js's TYPES is
// listed -- but a class lookup should degrade to something rather than
// throw if TYPES ever grows without this table being updated alongside
// it).
function classify(type){

    return CLASS_BY_TYPE[type] || "episodic";

}


// Counts every entry by memory class -- the "organizational memory:
// company knowledge and operating history" reporting view this
// milestone asks for, without a second store: derived from the same
// entries core/memory/store.js already holds.
function overview(entries){

    const counts = { episodic: 0, semantic: 0, procedural: 0, organizational: 0 };

    for(const entry of entries){
        counts[classify(entry.type)] += 1;
    }

    return { total: entries.length, byClass: counts };

}


module.exports = { classify, overview, CLASSES };
