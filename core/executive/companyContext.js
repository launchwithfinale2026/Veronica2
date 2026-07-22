// ==================================
// VERONICA COMPANY CONTEXT
// ==================================
//
// The v1 release audit's answer to "each company must have separate
// memory, knowledge, and permissions" (see docs/Architecture.md): not
// physically separate stores (core/executive/companyManager.js already
// explains why -- it would fragment the one memory system the rest of
// VERONICA reasons over), but an ENFORCED logical boundary. Everything
// company-scoped already lived behind a `company:<id>` tag; what was
// missing was a single object that always applies that scope rather
// than trusting every caller to remember the tag by hand.
//
// remember()/search()/filter() here physically cannot read or write
// another company's entries -- there's no parameter that would let a
// caller override the scope. Reaching outside a company's data means
// going around this class entirely (calling core/memory directly),
// which is exactly the "cross-company access is explicit" property:
// nothing routes through here by accident.
//
// Role gating is optional per call, not mandatory: a company created
// without allowedRoles (the default) is unrestricted, matching this
// being a single-user personal system rather than a multi-tenant one
// with adversarial users -- the boundary this class enforces is
// organizational (don't let company A's data leak into company B's
// queries), not a security control against untrusted actors. A caller
// that does pass a role (e.g. a tool handler, which always has one from
// core/identity) gets that boundary enforced too, for companies that
// opted into it.

const memory = require("../memory");
const knowledge = require("../knowledge");


class CompanyContext {

    constructor(companyId, companyManager){

        this.companyId = companyId;
        this.companyManager = companyManager;
        this.tag = `company:${companyId}`;

    }


    // True when no allowedRoles were set (unrestricted) or `role` is one
    // of them. Called with no role, this only reports whether the
    // company is restricted at all.
    can(role){

        const { allowedRoles } = this.companyManager.getCompany(this.companyId).permissions;

        if(!allowedRoles.length){
            return true;
        }

        return Boolean(role) && allowedRoles.includes(role);

    }


    requirePermission(role){

        if(role && !this.can(role)){
            throw new Error(`Role "${role}" does not have access to company "${this.companyId}"`);
        }

    }


    // Every entry created through this method is tagged to this company
    // regardless of what `input.tags` contains -- the enforced half of
    // "separate memory": there is no way to call this and land an entry
    // outside this company's scope.
    remember(input = {}, { role } = {}){

        this.requirePermission(role);

        return memory.remember({
            ...input,
            tags: [...(input.tags || []), this.tag]
        });

    }


    // Scoped keyword search -- same substring-over-content matching
    // core/memory/store.js's own search() uses, applied only to this
    // company's entries, never the whole store.
    search(query, { role } = {}){

        this.requirePermission(role);

        const entries = memory.filter({ tag: this.tag });

        if(!query){
            return entries;
        }

        const words = query.toLowerCase().split(/\s+/).filter(Boolean);

        return entries.filter(entry => {
            const content = entry.content.toLowerCase();
            return words.some(word => content.includes(word));
        });

    }


    // criteria may include `type`/`minImportance` (see
    // core/memory/store.js's filter()) -- `tag` is always overridden to
    // this company's own, even if the caller passes one.
    filter(criteria = {}, { role } = {}){

        this.requirePermission(role);

        return memory.filter({ ...criteria, tag: this.tag });

    }


    // The company's own knowledge-graph neighborhood -- same lookup
    // CompanyManager.getCompany() already exposes, available directly
    // off the context too.
    knowledge(){

        const company = this.companyManager.getCompany(this.companyId);

        return knowledge.retrieve(company.name);

    }

}


module.exports = CompanyContext;
