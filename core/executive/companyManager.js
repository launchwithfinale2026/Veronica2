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
const ExecutivePlanner = require("./planner");

const DEPARTMENTS_REGISTRY = path.join(__dirname, "../../registry/departments.json");

const COMPANY_TAG = "executive-company";


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

        const { label, amount, type } = entryInput;

        if(!label || !Number.isFinite(amount) || !["revenue", "expense"].includes(type)){
            throw new Error("A finance entry needs a label, a numeric amount, and type \"revenue\" or \"expense\"");
        }

        const entry = this.requireEntry(companyId);

        const finances = [
            ...(entry.metadata.finances || []),
            { label, amount, type, timestamp: new Date().toISOString() }
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
