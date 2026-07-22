// ==================================
// VERONICA PERSISTENT CONTEXT ENGINE
// ==================================
//
// Gathers everything a reasoning call should see before it happens:
// recent/related memory, knowledge graph neighborhood, the active
// roadmap, recent project activity, department roster, an optional
// company scope, and this device's identity -- then caps every list
// ("compress into executive context," per the milestone spec) so the
// result stays prompt-sized regardless of how much the memory/knowledge/
// roadmap stores have grown. core/intelligence/index.js calls this
// automatically on every think() (see docs/Architecture.md "Persistent
// Context Engine") -- callers don't have to remember to build context
// themselves, which is the actual point of this being "automatic."

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");
const device = require("../device");

const DEPARTMENTS_REGISTRY = path.join(__dirname, "../../registry/departments.json");

const LIST_LIMIT = 5;


function loadDepartments(){

    return JSON.parse(fs.readFileSync(DEPARTMENTS_REGISTRY, "utf8"))
        .departments
        .map(dept => ({ id: dept.id, name: dept.name, domain: dept.domain, status: dept.status }));

}


class ContextEngine {

    // options.companyId scopes in a company summary -- optional, since
    // most reasoning calls (an agent answering a free-text task) have no
    // company in scope yet. Nothing wires this in automatically today;
    // it's a hook for a future company-scoped caller (see
    // docs/Architecture.md).
    //
    // async as of Phase 14 (Advanced Memory) -- semantic search is a real
    // network call, so retrieve() now always returns a Promise (even
    // when it falls back to the synchronous keyword path) rather than
    // sometimes being sync and sometimes async depending on whether
    // OPENAI_API_KEY happens to be configured. The only caller,
    // core/intelligence/index.js's think(), was already async, so this
    // is a contained change -- see docs/Architecture.md "Advanced Memory".
    async retrieve(query, options = {}){

        const memories = query ? await this.searchMemories(query) : [];

        const knowledgeResult = query
            ? knowledge.retrieve(query)
            : { entities: [], relationships: [] };

        // Required lazily, not at module load time: core/executive
        // depends on core/intelligence (via decomposer.js), and
        // core/intelligence now depends on this module -- a top-level
        // require here would close that loop the same way it did for
        // core/tools/handlers/executive.js (see docs/Architecture.md
        // "Goal Decomposition Engine"). By the time retrieve() is ever
        // actually called, module loading has long finished.
        const executive = require("../executive");

        const roadmap = executive.roadmap();

        const activeGoals = roadmap.slice(0, LIST_LIMIT);

        const recentProjectActivity = [...roadmap]
            .sort((a, b) => new Date(b.updated) - new Date(a.updated))
            .slice(0, 3);

        const company = options.companyId ? summarizeCompany(executive.getCompany(options.companyId)) : null;

        return {

            query,

            memories,

            knowledge: {
                entities: knowledgeResult.entities.slice(0, LIST_LIMIT),
                relationships: knowledgeResult.relationships.slice(0, LIST_LIMIT)
            },

            activeGoals,

            recentProjectActivity,

            departments: loadDepartments(),

            company,

            device: device.currentIdentity(),

            state: {}

        };

    }


    // Semantic search when configured (real embedding-based similarity,
    // not keyword overlap), falling back to the existing keyword search
    // on ANY failure -- a transient OpenAI API error shouldn't break
    // every reasoning call in the system just because a "nicer to have"
    // retrieval mode hiccuped. Also falls back for any query that hasn't
    // been reindexed yet (semanticSearch() can only rank entries with a
    // stored embedding -- see core/memory/embeddings.js), rather than
    // returning a confidently-empty result.
    async searchMemories(query){

        if(!memory.semanticSearchAvailable()){
            return memory.search(query, { limit: LIST_LIMIT });
        }

        try {

            const results = await memory.semanticSearch(query, { limit: LIST_LIMIT });

            return results.length ? results : memory.search(query, { limit: LIST_LIMIT });

        } catch(error){

            return memory.search(query, { limit: LIST_LIMIT });

        }

    }


}


// A trimmed view -- getCompany()'s full detail (finances, communications,
// full knowledge neighborhood) would blow past what a prompt needs just
// to know "which company is this for."
function summarizeCompany(company){

    return {
        id: company.id,
        name: company.name,
        industry: company.industry,
        status: company.status,
        departments: company.departments
    };

}


module.exports = ContextEngine;
