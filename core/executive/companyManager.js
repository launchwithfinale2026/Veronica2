// ==================================
// VERONICA COMPANY MANAGER
// ==================================
//
// Companies are the top-level container the milestone spec asks for:
// projects, employees, departments, documents, finances, relationships,
// knowledge, communications. Modeled the same way projects are (see
// ExecutivePlanner) -- an ordinary memory entry (type: "businesses",
// which already existed as a memory category and dashboard widget before
// this phase, just unused for anything structured), not a new registry
// file or a second store.
//
// "Isolated memory while still contributing to executive intelligence"
// (the milestone's own framing) is exactly what tag-based scoping already
// gives departments (see docs/Architecture.md "Departments") -- a
// company's projects/communications are tagged `company:<id>` and
// filterable to just that company, while still living in the one shared
// memory store the rest of the system searches/reasons over. No separate
// per-company database.

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");
const identity = require("../identity");
const ExecutivePlanner = require("./planner");
const CompanyContext = require("./companyContext");

const DEPARTMENTS_REGISTRY = path.join(__dirname, "../../registry/departments.json");

const COMPANY_TAG = "executive-company";

// Phase 41 (Marketing Division / Company Brain). Every field the "Company
// Brain" spec asks for that ISN'T already covered by an existing concept
// (departments/employees/finances/projects/communications/relationships
// all already existed -- see this file's header comment) -- stored as one
// object on metadata.brandProfile, same shallow-merge-on-update pattern
// every other metadata field here already uses. Defaults keep every
// consumer able to assume the full shape exists, same reasoning as
// core/capabilities/manifest.js's normalize().
const EMPTY_BRAND_PROFILE = {
    mission: null,
    vision: null,
    values: [],
    brand: null,
    products: [],
    services: [],
    goals: [],
    audience: null,
    competitors: [],
    assets: [],
    operatingRules: [],
    voice: { tone: null, style: null, doNots: [] }
};


class CompanyManager {

    // Exposed so other modules can find company-tagged entries without
    // duplicating the string -- same pattern as GoalDecomposer.TAG.
    static TAG = COMPANY_TAG;

    constructor({ planner } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.departments = JSON.parse(fs.readFileSync(DEPARTMENTS_REGISTRY, "utf8")).departments;

    }


    requireEntry(id){

        const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(COMPANY_TAG));

        if(!entry){
            throw new Error(`Unknown company: "${id}"`);
        }

        return entry;

    }


    toCompany(entry){

        const meta = entry.metadata || {};

        return {
            id: entry.id,
            name: entry.content,
            industry: meta.industry || null,
            status: meta.status || "active",
            departments: meta.departments || [],
            employees: meta.employees || [],
            documents: meta.documents || [],
            finances: meta.finances || [],
            // Empty allowedRoles means unrestricted -- any role that
            // already holds read_memory/write_memory can access this
            // company's data through its CompanyContext (see
            // core/executive/companyContext.js). A non-empty list
            // restricts it to just those roles.
            permissions: meta.permissions || { allowedRoles: [] },
            brandProfile: { ...EMPTY_BRAND_PROFILE, ...(meta.brandProfile || {}) },
            history: meta.history || [],
            created: entry.created,
            updated: entry.updated
        };

    }


    // input: { name, industry?, departments? } -- departments (registry
    // ids, e.g. "hephaestus") are validated against registry/departments.json
    // the same way ExecutivePlanner.assignDepartment() validates an
    // explicit department override, since both are checking the same
    // registry for the same reason.
    createCompany(input = {}){

        if(!input.name){
            throw new Error("A company name is required");
        }

        const departments = input.departments || [];

        for(const deptId of departments){

            if(!this.departments.some(dept => dept.id === deptId)){
                throw new Error(`Unknown department: "${deptId}"`);
            }

        }

        const allowedRoles = input.allowedRoles || [];

        for(const roleId of allowedRoles){

            if(!identity.permissionsForRole(roleId).length){
                throw new Error(`Unknown role: "${roleId}"`);
            }

        }

        const entry = memory.remember({
            content: input.name,
            type: "businesses",
            importance: 3,
            tags: [COMPANY_TAG],
            source: "company-manager",
            metadata: {
                industry: input.industry || null,
                status: "active",
                departments,
                employees: [],
                documents: [],
                finances: [],
                permissions: { allowedRoles },
                brandProfile: { ...EMPTY_BRAND_PROFILE },
                history: []
            }
        });

        knowledge.addEntity({ name: input.name, type: "company" });

        for(const deptId of departments){
            knowledge.addRelationship({ from: input.name, to: deptId, type: "staffedBy" });
        }

        return this.toCompany(entry);

    }


    listCompanies(){

        return memory.filter({ tag: COMPANY_TAG }).map(entry => this.toCompany(entry));

    }


    // employee: a plain name string, or { name, role }.
    addEmployee(companyId, employee){

        const record = typeof employee === "string" ? { name: employee, role: null } : (employee || {});

        if(!record.name){
            throw new Error("An employee name is required");
        }

        const entry = this.requireEntry(companyId);

        const employees = [...(entry.metadata.employees || []), record];

        const updated = memory.update(companyId, { metadata: { employees } });

        knowledge.addEntity({ name: record.name, type: "person" });
        knowledge.addRelationship({ from: record.name, to: entry.content, type: "employedBy" });

        return updated.metadata.employees;

    }


    // document: a URL, file path, or free-text reference -- same
    // treatment as ProjectManager.addArtifact(), one level up.
    addDocument(companyId, document){

        if(!document){
            throw new Error("A document is required");
        }

        const entry = this.requireEntry(companyId);

        const documents = [...(entry.metadata.documents || []), document];

        const updated = memory.update(companyId, { metadata: { documents } });

        knowledge.addEntity({ name: String(document), type: "document" });
        knowledge.addRelationship({ from: entry.content, to: String(document), type: "produces" });

        return updated.metadata.documents;

    }


    // A minimal ledger, not an accounting system -- label/amount/type
    // entries with a derived revenue/expense/net summary. No concrete need
    // yet for currencies, categories, or reconciliation; add them if a
    // real need for those appears.
    recordFinance(companyId, entryInput = {}){

        const { label, amount, type, category } = entryInput;

        if(!label || !Number.isFinite(amount) || !["revenue", "expense"].includes(type)){
            throw new Error("A finance entry needs a label, a numeric amount, and type \"revenue\" or \"expense\"");
        }

        const entry = this.requireEntry(companyId);

        const finances = [
            ...(entry.metadata.finances || []),
            // `category` is optional (defaults to null, matching every
            // other optional field on this entity) -- added for Phase 42
            // (Finance Division)'s budget tracking
            // (core/finance/budgets.js compares actual spend per category
            // against a budget's limit) without changing this method's
            // existing behavior for any caller that doesn't pass one.
            { label, amount, type, category: category || null, timestamp: new Date().toISOString() }
        ];

        const updated = memory.update(companyId, { metadata: { finances } });

        return this.financialSummary(updated.metadata.finances);

    }


    financialSummary(finances = []){

        const revenue = finances.filter(f => f.type === "revenue").reduce((sum, f) => sum + f.amount, 0);
        const expense = finances.filter(f => f.type === "expense").reduce((sum, f) => sum + f.amount, 0);

        return { revenue, expense, net: revenue - expense, entries: finances.length };

    }


    // Business relationships (clients, partners, vendors) go straight
    // into the knowledge graph rather than a second parallel list on the
    // company entry -- a relationship IS a graph edge, and this makes it
    // discoverable through knowledge.retrieve() like everything else here.
    addRelationship(companyId, { to, type } = {}){

        if(!to || !type){
            throw new Error("A relationship needs \"to\" and \"type\"");
        }

        const entry = this.requireEntry(companyId);

        knowledge.addEntity({ name: to, type: "contact" });

        return knowledge.addRelationship({ from: entry.content, to, type });

    }


    // Every business relationship (client/partner/vendor -- whatever
    // addRelationship() above was called with) this company has, as
    // {to, type}. Every OTHER edge touching a company entity comes from a
    // different, already-modeled concept (staffedBy = departments,
    // employedBy = employees/team, produces = documents) -- excluding
    // those three leaves exactly the free-form business relationships
    // addRelationship() creates, without needing a second parallel list.
    clientRelationships(companyId){

        const entry = this.requireEntry(companyId);
        const MODELED_ELSEWHERE = new Set(["staffedBy", "employedBy", "produces"]);

        return knowledge.connections(entry.content)
            .filter(rel => !MODELED_ELSEWHERE.has(rel.type))
            .map(rel => ({
                to: rel.from.toLowerCase() === entry.content.toLowerCase() ? rel.to : rel.from,
                type: rel.type
            }));

    }


    // Communications are a stream, not a small bounded list like
    // employees/documents -- stored as their own searchable memory
    // entries (type "businesses", tagged to this company + "communication")
    // rather than appended to the company entry's metadata.
    logCommunication(companyId, { summary, channel } = {}){

        if(!summary){
            throw new Error("A communication summary is required");
        }

        const entry = this.requireEntry(companyId);

        return memory.remember({
            content: summary,
            type: "businesses",
            tags: [`company:${companyId}`, "communication", channel || "unspecified"],
            source: "company-manager",
            metadata: { company: companyId, channel: channel || null }
        });

    }


    communications(companyId){

        this.requireEntry(companyId);

        return memory.filter({ tag: `company:${companyId}` })
            .filter(entry => entry.tags.includes("communication"))
            .map(entry => ({
                id: entry.id,
                summary: entry.content,
                channel: entry.metadata.channel || null,
                timestamp: entry.created
            }));

    }


    // Every roadmap project tagged to this company -- see
    // ExecutivePlanner.plan()'s optional goal.company field.
    projects(companyId){

        this.requireEntry(companyId);

        return this.planner.roadmap({ company: companyId });

    }


    // Partial update -- merges into the existing brandProfile rather than
    // replacing it, so "set the mission" and "set the audience" can be two
    // separate calls without clobbering each other. `voice` merges one
    // level deeper for the same reason (tone/style/doNots are usually set
    // independently too).
    setBrandProfile(companyId, patch = {}){

        const entry = this.requireEntry(companyId);
        const current = { ...EMPTY_BRAND_PROFILE, ...(entry.metadata.brandProfile || {}) };

        const brandProfile = {
            ...current,
            ...patch,
            voice: { ...current.voice, ...(patch.voice || {}) }
        };

        const updated = memory.update(companyId, { metadata: { brandProfile } });

        return updated.metadata.brandProfile;

    }


    getBrandProfile(companyId){

        const entry = this.requireEntry(companyId);

        return { ...EMPTY_BRAND_PROFILE, ...(entry.metadata.brandProfile || {}) };

    }


    // Historical decisions -- metadata.history existed as a field since
    // this file's very first version but nothing ever appended to it
    // (found true during the Phase 41 Company Brain audit). This is what
    // makes it a real, live decision log rather than always-empty dead
    // state.
    recordDecision(companyId, { decision, reason } = {}){

        if(!decision){
            throw new Error("A decision summary is required");
        }

        const entry = this.requireEntry(companyId);

        const history = [
            ...(entry.metadata.history || []),
            { decision, reason: reason || null, timestamp: new Date().toISOString() }
        ];

        const updated = memory.update(companyId, { metadata: { history } });

        return updated.metadata.history;

    }


    // The "Company Brain" -- every field the spec asks for, in one place.
    // Reuses every existing concept rather than duplicating it:
    // departments/employees(team)/finances already lived on the entry,
    // projects(goals-in-execution)/communications were already derived
    // views, relationships already lived in the knowledge graph. Campaigns
    // is the one genuinely new addition (core/marketing/campaigns.js,
    // lazy-required here to avoid a circular require -- campaigns.js has
    // no reason to require this file back, but keeping the require local
    // to this one method matches this codebase's standing convention for
    // any cross-module pull that isn't needed at load time).
    companyBrain(companyId){

        const company = this.getCompany(companyId);
        const campaigns = require("../marketing/campaigns");

        return {

            id: company.id,
            name: company.name,
            industry: company.industry,
            status: company.status,

            mission: company.brandProfile.mission,
            vision: company.brandProfile.vision,
            values: company.brandProfile.values,
            brand: company.brandProfile.brand,
            voice: company.brandProfile.voice,
            products: company.brandProfile.products,
            services: company.brandProfile.services,
            goals: company.brandProfile.goals,
            audience: company.brandProfile.audience,
            competitors: company.brandProfile.competitors,
            assets: company.brandProfile.assets,
            operatingRules: company.brandProfile.operatingRules,

            departments: company.departments,
            projects: company.projects,
            campaigns: campaigns.listCampaigns(companyId),
            clients: this.clientRelationships(companyId),
            team: company.employees,
            historicalDecisions: company.history,

            financialSummary: company.financialSummary

        };

    }


    // The enforced logical-isolation boundary (see
    // core/executive/companyContext.js and docs/Architecture.md
    // "v1 release audit" / company isolation follow-up): every read/write
    // made through the returned context is scoped to just this company,
    // and (if the company was created with allowedRoles) gated by role.
    context(companyId){

        this.requireEntry(companyId);

        return new CompanyContext(companyId, this);

    }


    getCompany(companyId){

        const entry = this.requireEntry(companyId);
        const company = this.toCompany(entry);

        return {

            ...company,

            financialSummary: this.financialSummary(company.finances),

            projects: this.projects(companyId),

            communications: this.communications(companyId),

            knowledge: knowledge.retrieve(company.name)

        };

    }

}


module.exports = CompanyManager;
