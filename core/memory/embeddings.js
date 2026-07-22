// ==================================
// VERONICA SEMANTIC MEMORY INDEX
// ==================================
//
// The concrete gap this milestone's earlier phases kept flagging as
// "not built" (see docs/Architecture.md "Persistent Context Engine"):
// memory.search() is pure keyword overlap, not semantic similarity. This
// adds real embedding-based retrieval using OpenAI's embeddings API --
// `openai` was already a listed dependency (core/brain/providers/
// openai.js), not a new one, and Anthropic doesn't offer a dedicated
// embeddings endpoint, so this is the one place in the whole project an
// OpenAI SDK call is load-bearing rather than an unused fallback provider.
//
// Deliberately additive, not a replacement for keyword search: this only
// activates when OPENAI_API_KEY is configured (checked fresh on every
// call, not cached at construction -- dotenv loads at various points
// across entry points, so caching "no key" at startup could wrongly
// stick even after one becomes available). Every entry point still works
// with zero configuration, exactly as before.
//
// Not wired into memory.remember() automatically -- embedding every
// memory on every write would mean a real, billed API call on the same
// hot path nearly every executive operation already goes through (see
// docs/Architecture.md "Learning Engine" for why hot paths get special
// caution). Indexing is a separate, explicitly-triggered batch operation
// (reindex()), the same "not automatic, triggered when needed" posture
// established for consolidation/learning recommendations.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EMBEDDINGS_FILE = path.join(__dirname, "embeddings.json");
const EMBEDDING_MODEL = "text-embedding-3-small";


function hashContent(content){
    return crypto.createHash("sha256").update(content).digest("hex");
}


function cosineSimilarity(a, b){

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for(let i = 0; i < a.length; i++){
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));

}


function load(){

    if(!fs.existsSync(EMBEDDINGS_FILE)){
        return {};
    }

    return JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, "utf8"));

}


function save(index){

    fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(index));

}


class EmbeddingIndex {

    // `client` is constructor-injectable (matching core/brain/providers/
    // claude.js's pattern) specifically so tests can script embedding
    // responses instead of making real, paid API calls.
    constructor(client){

        this.injectedClient = client || null;

    }


    getClient(){

        if(this.injectedClient){
            return this.injectedClient;
        }

        if(!process.env.OPENAI_API_KEY){
            return null;
        }

        const OpenAI = require("openai");

        return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    }


    isConfigured(){

        return Boolean(this.getClient());

    }


    requireClient(){

        const client = this.getClient();

        if(!client){
            throw new Error("Semantic search requires OPENAI_API_KEY to be configured");
        }

        return client;

    }


    async embed(text){

        const client = this.requireClient();

        const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text
        });

        return response.data[0].embedding;

    }


    // Embeds every entry that doesn't have a stored, up-to-date embedding
    // yet (tracked via a content hash, so an entry whose content changed
    // -- memory.update() -- gets re-embedded, and one that's unchanged
    // since the last reindex is skipped rather than re-billed).
    async reindex(entries){

        const index = load();

        let embedded = 0;

        for(const entry of entries){

            const hash = hashContent(entry.content);

            if(index[entry.id] && index[entry.id].hash === hash){
                continue;
            }

            const vector = await this.embed(entry.content);

            index[entry.id] = { hash, vector };
            embedded++;

        }

        save(index);

        return { totalEntries: entries.length, embedded, skipped: entries.length - embedded };

    }


    // Ranks `entries` (already-loaded memory entries) by cosine similarity
    // to the embedded query -- only entries with a stored embedding are
    // candidates, so an un-reindexed entry simply can't surface here yet.
    async search(query, entries, { limit = 5 } = {}){

        const index = load();
        const queryVector = await this.embed(query);

        return entries
            .filter(entry => index[entry.id])
            .map(entry => ({
                ...entry,
                similarityScore: cosineSimilarity(queryVector, index[entry.id].vector)
            }))
            .sort((a, b) => b.similarityScore - a.similarityScore)
            .slice(0, limit);

    }

}


module.exports = EmbeddingIndex;
