// ==================================
// VERONICA SELF-KNOWLEDGE
// ==================================
//
// Phase 40 (Personal Operating System). "VERONICA should understand
// projects, missions, companies, departments, devices, knowledge,
// memories, capabilities, packages, automations, connectors, planning,
// executive recommendations" -- Phase 32's OrganizationOverview already
// answers exactly this, but only from a dashboard route, where a human
// (not VERONICA herself) reads it. This is that same aggregation,
// callable as a real tool during agent reasoning (see
// core/tools/handlers/system.js) -- closing the loop between "the
// dashboard shows this to a human" and "VERONICA can introspect her own
// state as part of answering a question."
//
// Constructs its own fresh departments/agents on each call (via the
// existing loaders) rather than requiring a host to inject already-
// running instances -- core/agents/loader.js/core/departments/loader.js
// are cheap, side-effect-light functions (no network calls, no
// automation scheduling), so this is safe to call from anywhere,
// including mid-reasoning inside a tool call.

const loadAgents = require("../agents/loader");
const loadDepartments = require("../departments/loader");
const OrganizationOverview = require("../executive/organizationOverview");


function understand(){

    const agents = loadAgents();
    const departments = loadDepartments(agents);

    const overview = new OrganizationOverview({ departments, agents });

    return overview.generate();

}


module.exports = { understand };
