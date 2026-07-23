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


// Deliberately its own lightweight {id, name, domain, status} summary,
// not core/departments/loader.js's full DepartmentManager instantiation
// (this engine only needs a roster for context, not live manager
// objects) -- but it must still include package-declared departments
// (Phase 25/41), not just the static built-in registry, or every
// reasoning call's context silently omits real divisions like
// trading-dept/marketing-dept/etc. Found live: this was reading ONLY
// registry/departments.json, so package departments never appeared in
// any think() call's context even after Phase 41 made them real.
function loadDepartments(){

    const activation = require("../capabilities/activation");

    const baseDepartments = JSON.parse(fs.readFileSync(DEPARTMENTS_REGISTRY, "utf8"))
        .departments
        .map(dept => ({ id: dept.id, name: dept.name, domain: dept.domain, status: dept.status }));

    const packageDepartments = activation.packageDepartmentConfigs()
        .map(({ departmentConfig }) => ({
            id: departmentConfig.id,
            name: departmentConfig.name,
            domain: departmentConfig.domain,
            status: "active"
        }));

    return [...baseDepartments, ...packageDepartments];

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

        const memories = query ? await this.searchMemories(query, options.companyId) : [];

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
    //
    // companyId (added during the Phase 10 security audit): before this,
    // a reasoning call scoped to one company (see
    // core/executive/orchestrator.js's executeTask(), which passes
    // companyId for company-tagged tasks) still searched the ENTIRE
    // shared memory store -- a task for Company A could surface Company
    // B's finances/communications/documents in its injected context, even
    // though core/executive/companyContext.js exists specifically to
    // prevent that for direct reads/writes. Filtering out entries tagged
    // to any OTHER company closes that gap without changing behavior for
    // the (much more common) no-company-scope case, and without touching
    // entries with no company tag at all -- general/personal memories
    // stay visible everywhere, exactly as before.
    async searchMemories(query, companyId){

        const results = await this.rawSearchMemories(query);

        if(!companyId){
            return results;
        }

        return results.filter(entry => this.visibleToCompany(entry, companyId));

    }


    async rawSearchMemories(query){

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


    // An entry is visible to `companyId` unless it's tagged to a
    // DIFFERENT company -- entries with no company tag at all (personal
    // notes, technical knowledge, non-company projects) are always
    // visible, matching the rest of this system's isolation model: only
    // OTHER companies' scoped data is excluded, not everything that
    // isn't explicitly this company's.
    visibleToCompany(entry, companyId){

        const otherCompanyTags = (entry.tags || [])
            .filter(tag => tag.startsWith("company:") && tag !== `company:${companyId}`);

        return otherCompanyTags.length === 0;

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
