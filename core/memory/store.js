const fs = require("fs");
const path = require("path");
const crypto = require("crypto");


const FILE = path.join(
    __dirname,
    "database.json"
);


// Phase 3 — Memory Engine V2 categories. "general" is the default for
// callers (like the terminal's bare `remember <text>`) that don't specify
// one.
const TYPES = [
    "personal",
    "projects",
    "businesses",
    "technical knowledge",
    "preferences",
    "decisions",
    "goals",
    "workflow",
    "general"
];


// Bootstraps an empty store on first run (or after database.json is
// removed from git tracking -- see the Phase 10 security audit: this
// file holds real, potentially sensitive memory content, so it's no
// longer committed as source, which means a fresh clone now needs this
// fallback the same way core/knowledge/index.js's initialize() already
// creates a default graph.json when none exists).
function ensureFile(){

    if(!fs.existsSync(FILE)){
        fs.writeFileSync(FILE, JSON.stringify({ memories: [] }, null, 4));
    }

}


function load(){

    ensureFile();

    const data = JSON.parse(
        fs.readFileSync(FILE, "utf8")
    );

    let migrated = false;

    data.memories = data.memories.map(entry => {

        if(entry.id){
            return entry;
        }

        migrated = true;

        return migrateLegacyEntry(entry);

    });

    if(migrated){
        save(data);
    }

    return data;

}



function save(data){

    fs.writeFileSync(
        FILE,
        JSON.stringify(
            data,
            null,
            4
        )
    );

}


// Upgrades a pre-Phase-3 {content, timestamp} entry to the structured
// memory object shape, preserving its original content and timestamp.
function migrateLegacyEntry(entry){

    const created = entry.timestamp || new Date().toISOString();

    return {

        id: crypto.randomUUID(),

        type: "general",

        content: entry.content,

        importance: 3,

        created,

        updated: created,

        relationships: [],

        tags: [],

        source: "legacy",

        metadata: {}

    };

}


function clampImportance(value){

    const n = Number.isFinite(value) ? value : 3;

    return Math.min(5, Math.max(1, n));

}


// Accepts either a plain string (shorthand for {content}) or a structured
// input object. Unspecified fields get sensible defaults.
function normalize(input){

    if(typeof input === "string"){
        input = { content: input };
    }

    const now = new Date().toISOString();

    return {

        id: crypto.randomUUID(),

        type: TYPES.includes(input.type) ? input.type : "general",

        content: input.content,

        importance: clampImportance(input.importance),

        created: now,

        updated: now,

        relationships: input.relationships || [],

        tags: input.tags || [],

        source: input.source || "unknown",

        // Free-form structured data a caller needs preserved alongside the
        // entry (e.g. core/executive's deadline/effort/priority fields) --
        // optional and untouched by any existing reader, so this is a pure
        // additive extension of the Phase 3 schema, not a breaking change.
        metadata: (input.metadata && typeof input.metadata === "object") ? input.metadata : {}

    };

}



function remember(input){

    const data = load();

    const entry = normalize(input);

    data.memories.push(entry);

    save(data);

    return entry;

}



function recall(){

    return load().memories;

}


// Ranks memories by importance first, then recency. `limit` truncates the
// result; omit it to get every match.
function rank(memories, { limit } = {}){

    const sorted = [...memories].sort((a, b) => {

        if(b.importance !== a.importance){
            return b.importance - a.importance;
        }

        return new Date(b.updated) - new Date(a.updated);

    });

    return limit ? sorted.slice(0, limit) : sorted;

}


// Keyword search over content + tags, ranked by importance/recency.
function search(query, options = {}){

    const memories = recall();

    if(!query){
        return rank(memories, options);
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    const matches = memories.filter(entry => {

        const content = entry.content.toLowerCase();

        const tags = (entry.tags || []).map(t => t.toLowerCase());

        return words.some(word =>
            content.includes(word) ||
            tags.some(tag => tag.includes(word))
        );

    });

    return rank(matches, options);

}


// Structured filtering by category / tag / minimum importance.
function filter(criteria = {}, options = {}){

    const memories = recall();

    const matches = memories.filter(entry => {

        if(criteria.type && entry.type !== criteria.type){
            return false;
        }

        if(criteria.tag && !(entry.tags || []).includes(criteria.tag)){
            return false;
        }

        if(criteria.minImportance && entry.importance < criteria.minImportance){
            return false;
        }

        return true;

    });

    return rank(matches, options);

}



// Mutates an existing entry in place by id -- top-level fields in
// `changes` overwrite (except `id`/`created`, which never change), and
// `changes.metadata` is shallow-merged onto the existing metadata object
// rather than replacing it wholesale, so a caller updating just `status`
// doesn't have to first re-read and re-send every other metadata field.
// `updated` is always bumped to now. Used by core/executive/projectManager.js
// for status/history/artifact changes -- remember()/merge() intentionally
// don't cover this (append-only vs. sync-upsert are different concerns).
function update(id, changes = {}){

    const data = load();

    const index = data.memories.findIndex(entry => entry.id === id);

    if(index === -1){
        throw new Error(`Unknown memory entry: "${id}"`);
    }

    const entry = data.memories[index];

    const updatedEntry = {

        ...entry,

        ...changes,

        id: entry.id,

        created: entry.created,

        metadata: { ...(entry.metadata || {}), ...(changes.metadata || {}) },

        updated: new Date().toISOString()

    };

    data.memories[index] = updatedEntry;

    save(data);

    return updatedEntry;

}



// Merges memory entries from another device's export (see core/device/
// sync.js). Existing ids are kept unless the incoming entry is strictly
// newer (last-write-wins on `updated`); unknown ids are inserted as-is.
function merge(remoteEntries){

    const data = load();

    let added = 0;
    let updated = 0;

    for(const remote of remoteEntries){

        const index = data.memories.findIndex(entry => entry.id === remote.id);

        if(index === -1){
            data.memories.push(remote);
            added++;
            continue;
        }

        const local = data.memories[index];

        if(new Date(remote.updated) > new Date(local.updated)){
            data.memories[index] = remote;
            updated++;
        }

    }

    save(data);

    return { added, updated, total: data.memories.length };

}



module.exports = {

    remember,

    recall,

    search,

    filter,

    update,

    merge,

    TYPES

};
