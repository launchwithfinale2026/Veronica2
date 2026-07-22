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
    "general"
];


function load(){

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

        source: "legacy"

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

        source: input.source || "unknown"

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

    merge,

    TYPES

};
