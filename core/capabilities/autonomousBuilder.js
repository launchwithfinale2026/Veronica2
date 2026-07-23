// ==================================
// VERONICA AUTONOMOUS CAPABILITY BUILDER
// ==================================
//
// Phase 39. Completes the capability lifecycle end to end: given a
// plain objective ("Build a recruiting department"), analyze it (Phase
// 28's planner.js), plan it (the same call -- capability gaps,
// required agents/permissions), generate a real package (Phase 27's
// builder.js -- manifest, agent/tool SKELETONS, tests, documentation,
// self-validation), and request approval to install it (Phase 20's
// installer.js). This file is pure composition -- every step already
// existed as a real, independently-tested capability; the only thing
// that didn't exist was ONE function chaining analyze -> plan ->
// generate -> validate -> request approval together.
//
// "No execution without approval," structurally, not by convention:
// every package this module generates has approvalRequired FORCED to
// true, regardless of what a caller passes -- an autonomously-derived
// package (agents/tools VERONICA itself decided to create, not a human
// reviewing a manifest before it's written) always stops at a pending
// proposal. Installer.js's own install()/completeInstall() do the
// actual activation, unconditionally gated on a real human approval, as
// already established in Phase 19/20 -- this file never bypasses that.

const planner = require("./planner");
const builder = require("./builder");
const installer = require("./installer");

// Generic fallback agent/tool used only when the objective matches no
// known CAPABILITY_CATALOG domain -- still a REAL, buildable package
// (not a failure), just without the richer per-domain role/API detail a
// catalog match provides. Extending CAPABILITY_CATALOG with more
// domains (core/capabilities/planner.js) is how this gets richer over
// time, not a special case in this file.
const GENERIC_AGENT_ROLE = "General Agent";


function slugify(text){

    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "capability";

}


function pascalCase(text){

    return text
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join("") || "GeneralAgent";

}


function titleCase(slug){
    return slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}


// Turns a capability-gap analysis (Phase 28's planner.js output) into a
// real buildPackage() spec -- one agent per required role (a catalog
// match) or one generic agent (no match), one skeleton review tool for
// the domain, a real package-owned department.
function derivePackageSpec(objective, analysis){

    const name = slugify(objective);
    const domainLabel = analysis.domain || name;
    const departmentId = `${name}-dept`;

    const roles = analysis.requiredAgents.length ? analysis.requiredAgents : [GENERIC_AGENT_ROLE];

    const agents = roles.map(role => ({
        name: pascalCase(role),
        department: departmentId,
        role,
        capabilities: []
    }));

    const tools = [{
        id: `${name}.review`,
        description: `Review work for "${objective}" (skeleton -- not yet implemented).`,
        permission: "read"
    }];

    return {

        name,

        description: analysis.domain
            ? `Auto-generated capability package for objective "${objective}" (matched capability catalog domain "${analysis.domain}").`
            : `Auto-generated capability package for objective "${objective}" (no known capability catalog domain matched -- generic skeleton; extend core/capabilities/planner.js's CAPABILITY_CATALOG for a richer package next time).`,

        department: { id: departmentId, name: titleCase(name), domain: titleCase(domainLabel) },

        agents,
        tools,

        dependencies: [],

        permissions: analysis.permissions.length ? analysis.permissions : ["read"],

        // Structural guarantee, not a default a caller could override --
        // see this file's own header comment.
        approvalRequired: true

    };

}


// The full pipeline: analyze -> plan -> generate package/agents/tools/
// tests/documentation -> validate (buildPackage() does this internally,
// throwing if the generated package is somehow invalid) -> request
// approval. Never installs/activates anything itself.
function buildCapability(objective){

    if(!objective){
        throw new Error("An objective is required");
    }

    const analysis = planner.analyzeRequest(objective);
    const spec = derivePackageSpec(objective, analysis);
    const generated = builder.buildPackage(spec);
    const install = installer.install(generated.packageDir);

    return {

        objective,
        analysis,
        generated,
        install,

        report: install.pending
            ? `Analyzed "${objective}"${analysis.domain ? ` (matched domain "${analysis.domain}")` : " (no catalog domain matched)"}. Generated package "${generated.name}" with ${generated.filesCreated.length} file(s). Created pending approval proposal ${install.proposal.id} -- awaiting human review before installation/activation.`
            : `Analyzed "${objective}". Generated and installed package "${generated.name}" (${install.capability.status}).`

    };

}


module.exports = { buildCapability, derivePackageSpec, slugify, pascalCase };
